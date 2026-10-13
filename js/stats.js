/*
 * KURUKSHETRA — stats.js
 * Pure aggregation over session records (used by the dashboard and the tests).
 */
(function () {
  'use strict';
  const K = (globalThis.KURU = globalThis.KURU || {});
  const LEVELS = ['low', 'medium', 'high'];
  const mean = (xs) => { const v = xs.filter((x) => x != null && !Number.isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

  // Wilson score interval for a proportion k/n (95% by default).
  function wilson(k, n, z) {
    if (!n) return null;
    z = z || 1.96;
    const p = k / n, d = 1 + (z * z) / n;
    const c = (p + (z * z) / (2 * n)) / d;
    const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
    return [Math.max(0, c - h), Math.min(1, c + h)];
  }

  // Two-proportion z-test: is k1/n1 different from k2/n2? Returns { diff, z, p }.
  function twoProportion(k1, n1, k2, n2) {
    if (!n1 || !n2) return null;
    const p1 = k1 / n1, p2 = k2 / n2, p = (k1 + k2) / (n1 + n2);
    const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
    const z = se ? (p2 - p1) / se : 0;
    return { diff: p2 - p1, z, p: 2 * (1 - normalCdf(Math.abs(z))) };
  }
  function normalCdf(x) { // Abramowitz-Stegun 7.1.26
    const t = 1 / (1 + 0.3275911 * x / Math.SQRT2);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
    return 0.5 * (1 + y);
  }

  function pooledQuality(sessions) {
    const t = { moves: 0, optimal: 0, infoErrors: 0, decisionErrors: 0, forced: 0 };
    for (const s of sessions) for (const k in t) t[k] += s.summary[k] || 0;
    const d = t.moves || 1;
    return { moves: t.moves, optimal: t.optimal / d, info: t.infoErrors / d, decision: t.decisionErrors / d, forced: t.forced / d };
  }

  function describe(group) {
    const S = group.map((s) => s.summary);
    const q = pooledQuality(group);
    const fb = (k) => mean(group.map((s) => (s.feedback ? s.feedback[k] : null)));
    const escaped = S.filter((x) => x.result === 'escaped').length;
    return {
      n: group.length,
      escapeCI: wilson(escaped, group.length),
      escapeRate: mean(S.map((x) => (x.result === 'escaped' ? 1 : 0))),
      coreRate: mean(S.map((x) => (x.coreReached ? 1 : 0))),
      meanScore: mean(S.map((x) => x.score)),
      meanTurns: mean(S.map((x) => x.turns)),
      optimalShare: q.optimal, infoShare: q.info, decisionShare: q.decision, forcedShare: q.forced, moves: q.moves,
      meanDecisionS: (() => { const m = mean(S.map((x) => x.meanDecisionMs)); return m == null ? null : m / 1000; })(),
      meanScouts: mean(S.map((x) => x.scouts)),
      meanSignals: mean(S.map((x) => x.signals)),
      meanStale: mean(S.map((x) => x.meanStaleFrac)),
      fbEnoughInfo: fb('enoughInfo'), fbAlliesHelped: fb('alliesHelped'), fbDifficulty: fb('difficulty'), fbEnjoyed: fb('enjoyed'),
    };
  }

  function byCondition(sessions) {
    const rows = [];
    for (const infoLevel of LEVELS) for (const allyComms of [false, true]) for (const enemyComms of [false, true]) {
      const g = sessions.filter((s) => s.condition.infoLevel === infoLevel && !!s.condition.allyComms === allyComms && !!s.condition.enemyComms === enemyComms);
      if (g.length) rows.push(Object.assign({ infoLevel, allyComms, enemyComms }, describe(g)));
    }
    return rows;
  }

  function byInfoAndAlly(sessions) {
    return LEVELS.map((infoLevel) => ({
      infoLevel,
      series: [false, true].map((allyComms) => {
        const g = sessions.filter((s) => s.condition.infoLevel === infoLevel && !!s.condition.allyComms === allyComms);
        const k = g.filter((s) => s.summary.result === 'escaped').length;
        return { allyComms, n: g.length, escapeRate: g.length ? k / g.length : null, ci: wilson(k, g.length) };
      }),
    }));
  }

  function qualityByInfo(sessions) {
    return LEVELS.map((infoLevel) => Object.assign({ infoLevel }, pooledQuality(sessions.filter((s) => s.condition.infoLevel === infoLevel))));
  }

  // Reliance on counsel, pooled over the sessions of each advisor condition.
  function byAdvisor(sessions) {
    const rows = [];
    for (const advisor of ['reliable', 'unreliable', 'planner', 'llm', 'none']) for (const explain of [true, false]) {
      const g = sessions.filter((s) => (s.condition.advisor || 'none') === advisor && (advisor === 'none' || !!s.condition.explain === explain));
      if (!g.length || (advisor === 'none' && !explain)) continue;
      const S = g.map((s) => s.summary);
      const sum = (k) => S.reduce((a, x) => a + (x[k] || 0), 0);
      const esc = S.filter((x) => x.result === 'escaped').length;
      const good = sum('adviceGood'), bad = sum('adviceBad'), all = sum('adviceGiven');
      rows.push({
        advisor, explain: advisor === 'none' ? null : explain, n: g.length,
        escapeRate: esc / g.length, escapeCI: wilson(esc, g.length),
        adviceGiven: all, adviceAccuracy: all ? good / all : null,
        followGood: good ? sum('followedGood') / good : null,
        followBad: bad ? sum('followedBad') / bad : null,
        appropriate: all ? (sum('followedGood') + sum('ignoredBad')) / all : null,
      });
    }
    return rows;
  }

  K.Stats = { LEVELS, mean, describe, byCondition, byInfoAndAlly, qualityByInfo, pooledQuality, wilson, twoProportion, normalCdf, byAdvisor };
})();
