/*
 * KURUKSHETRA — logger.js
 * Session records: build, store locally, export as JSON / CSV.
 * Nothing is ever sent over the network.
 */
(function () {
  'use strict';
  const K = (globalThis.KURU = globalThis.KURU || {});
  const STORE_KEY = 'kurukshetra.sessions.v1';
  const SCHEMA = 'kurukshetra/session@1';

  function uid() {
    return 'S' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function buildSession(game, meta) {
    const st = game.state;
    meta = meta || {};
    return {
      schema: SCHEMA,
      id: meta.id || uid(),
      participantId: meta.participantId || null,
      mode: meta.mode || 'play', // play | study | bot
      round: meta.round || null,
      condition: Object.assign({}, st.cond),
      config: Object.assign({}, st.cfg),
      startedAt: new Date(st.startedAt).toISOString(),
      endedAt: new Date().toISOString(),
      summary: game.summary(),
      turns: st.log,
      feedback: meta.feedback || null,
    };
  }

  function loadAll() {
    try {
      const raw = globalThis.localStorage && globalThis.localStorage.getItem(STORE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function saveAll(list) {
    try { globalThis.localStorage.setItem(STORE_KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
  }

  function save(session) {
    const list = loadAll().filter((s) => s.id !== session.id);
    list.push(session);
    return saveAll(list);
  }

  function remove(id) { return saveAll(loadAll().filter((s) => s.id !== id)); }
  function clear() { return saveAll([]); }

  function isSession(x) { return x && x.schema === SCHEMA && x.summary && x.condition; }

  // Accepts a single session, an array, or { sessions: [...] }.
  function parseImport(text) {
    const data = JSON.parse(text);
    const arr = Array.isArray(data) ? data : data.sessions ? data.sessions : [data];
    return arr.filter(isSession);
  }

  const csvCell = (v) => {
    if (v == null) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const toCsv = (cols, rows) => [cols.join(',')].concat(rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))).join('\n');

  const SUMMARY_COLS = ['id', 'participantId', 'mode', 'round', 'infoLevel', 'allyComms', 'enemyComms', 'seed', 'startedAt',
    'result', 'category', 'turns', 'coreReached', 'coreTurn', 'resolve', 'score', 'moves', 'optimal', 'infoErrors', 'decisionErrors',
    'forced', 'waits', 'scouts', 'signals', 'optimalRate', 'meanDecisionMs', 'meanKnownFrac', 'meanStaleFrac', 'totalDrain',
    'coverEvents', 'gatesSealed', 'rotations', 'breachTurn',
    'advisor', 'explain', 'adviceGiven', 'adviceGood', 'adviceBad', 'followedGood', 'followedBad', 'ignoredGood', 'ignoredBad',
    'followRate', 'overReliance', 'underReliance', 'appropriateReliance',
    'fb_understood', 'fb_enoughInfo', 'fb_alliesHelped', 'fb_difficulty', 'fb_enjoyed', 'fb_comment'];

  function summaryRows(sessions) {
    return sessions.map((s) => {
      const fb = s.feedback || {};
      return Object.assign({ id: s.id, participantId: s.participantId, mode: s.mode, round: s.round, startedAt: s.startedAt },
        s.condition, s.summary,
        { fb_understood: fb.understood, fb_enoughInfo: fb.enoughInfo, fb_alliesHelped: fb.alliesHelped, fb_difficulty: fb.difficulty, fb_enjoyed: fb.enjoyed, fb_comment: fb.comment });
    });
  }

  const TURN_COLS = ['sessionId', 'participantId', 'mode', 'infoLevel', 'allyComms', 'enemyComms', 'seed', 't', 'phase', 'action', 'moveClass',
    'decisionMs', 'from', 'to', 'ring', 'trueDistBefore', 'trueDistAfter', 'beliefCostBefore', 'knownFrac', 'staleFrac',
    'resolve', 'pressing', 'cover', 'drain', 'visibleEnemies', 'signal', 'events',
    'advisor', 'explain', 'adviceTo', 'adviceSource', 'adviceGood', 'adviceOptimal', 'adviceBeliefOptimal', 'adviceLatencyMs', 'followed'];

  function turnRows(sessions) {
    const out = [];
    for (const s of sessions) {
      for (const t of s.turns) {
        out.push(Object.assign({ sessionId: s.id, participantId: s.participantId, mode: s.mode }, s.condition, t,
          { signal: t.signal ? t.signal.ally + ':' + t.signal.order : '', events: t.events.join('|') },
          t.advice ? { adviceTo: t.advice.to, adviceSource: t.advice.source, adviceGood: t.advice.good, adviceOptimal: t.advice.optimal, adviceBeliefOptimal: t.advice.beliefOptimal, adviceLatencyMs: t.advice.latencyMs } : {}));
      }
    }
    return out;
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  K.Logger = {
    SCHEMA, buildSession, loadAll, save, remove, clear, parseImport,
    summaryCsv: (sessions) => toCsv(SUMMARY_COLS, summaryRows(sessions)),
    turnsCsv: (sessions) => toCsv(TURN_COLS, turnRows(sessions)),
    download,
  };
})();
