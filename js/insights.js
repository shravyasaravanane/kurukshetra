/*
 * KURUKSHETRA — insights.js
 * Pure derivations for the briefing and the results screen. Everything here is computed
 * from the real game state and its log; nothing is estimated or invented.
 */
(function () {
  'use strict';
  const K = (globalThis.KURU = globalThis.KURU || {});

  const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  function compassOfSeg(G, seg) {
    const a = ((-90 + seg * (360 / G.S)) % 360 + 360) % 360;
    return COMPASS[Math.round(a / 45) % 8];
  }

  const INTEL_TEXT = {
    low: ['Your sight reaches only the tiles beside you.', 'You were shown nothing of the formation in advance.'],
    medium: ['Your sight reaches two tiles in every direction.', 'You were shown the formation before it began to turn. That map goes stale as the walls rotate.'],
    high: ['Your sight reaches two tiles in every direction.', 'Arjuna\'s knowledge: you always know where every gate stands.'],
  };
  const COUNSEL_TEXT = {
    none: null,
    reliable: 'A reliable messenger will relay Krishna\'s counsel each turn. It is usually right.',
    unreliable: 'A careless messenger will relay counsel each turn. It sounds sure, but it is often wrong.',
    planner: 'Krishna\'s insight will advise you each turn. It knows only what you know.',
    llm: 'Krishna, an AI agent, will advise you each turn using only what you know.',
  };

  // What the player is told before a round: the mission, their intelligence, the forces.
  function briefing(cond, cfgOverrides) {
    const cfg = Object.assign({}, K.DEFAULT_CONFIG, cfgOverrides || {});
    const rings = cfg.rings;
    const allies = (cfg.allies ? K.ALLY_ROSTER.filter((a) => cfg.allies.includes(a.id)) : K.ALLY_ROSTER)
      .map((a) => ({ name: a.name, role: a.role, about: a.about }));
    const sentinels = cfg.sentinelRings ? cfg.sentinelRings.length : rings;
    const objectives = [
      { label: 'Break in', detail: 'Step through one of the torch-lit gates in the outer wall.' },
      { label: 'Reach the core', detail: `Cross ${rings} rings of walls to the golden lotus at the centre.` },
    ];
    if (cfg.goal !== 'core') objectives.push({ label: 'Escape', detail: 'Return to the open field through an outer gate that has not been sealed.' });
    const enemies = [];
    if (sentinels) enemies.push(`${sentinels} sentinel${sentinels === 1 ? '' : 's'} patrol the rings. Ending a turn beside one costs you resolve.`);
    if (cfg.gatekeeper) enemies.push('Jayadratha waits on the outer wall to seal the gates behind you.');
    if (cfg.rotationPeriod > 0) enemies.push(`Every ${cfg.rotationPeriod} turns Drona's drums sound and the walls turn. ${cond.enemyComms ? 'When his sentinels report your position, he turns them against you.' : 'He turns them on a fixed rhythm.'}`);
    return {
      title: 'The Chakravyuha',
      setting: 'The thirteenth day. Drona has drawn his army into a turning formation of walls and soldiers.',
      objectives,
      intel: INTEL_TEXT[cond.infoLevel] || [],
      allies,
      alliesLinked: !!cond.allyComms,
      enemies,
      counsel: COUNSEL_TEXT[cond.advisor || 'none'],
      limits: [`Resolve: ${cfg.resolve}.`, `The day ends after ${cfg.turnLimit} turns.`],
    };
  }

  // Objectives and when they were achieved, from the log.
  function objectives(state) {
    const log = state.log, firstT = (type) => (log.find((r) => r.events.includes(type)) || {}).t || null;
    const list = [
      { label: 'Break in', done: state.player.breached, turn: firstT('breach') },
      { label: 'Reach the core', done: state.player.coreReached, turn: state.player.coreTurn },
    ];
    if (state.cfg.goal !== 'core') list.push({ label: 'Escape', done: !!state.outcome && state.outcome.result === 'escaped', turn: state.outcome && state.outcome.result === 'escaped' ? state.outcome.turns : null });
    return list;
  }

  const ORDER_WORD = { follow: 'follow you', hold: 'hold a gate', scout: 'scout ahead' };
  const NAME = { bhima: 'Bhima', nakula: 'Nakula', satyaki: 'Satyaki' };

  // The turning points of the round, in order (capped, most important kept).
  function moments(state) {
    const G = state.geom, out = [];
    const seen = new Set();
    const once = (key) => { if (seen.has(key)) return false; seen.add(key); return true; };
    let rotations = 0, forced = null;
    for (const r of state.log) {
      const ev = r.events;
      if (ev.includes('breach')) out.push({ t: r.t, tone: 'gold', kind: 'objective', text: `Broke into the formation through the ${compassOfSeg(G, G.segOf(r.to))} gate.` });
      if (ev.includes('rotation')) {
        rotations++;
        if (rotations === 1 || (r.rotationAdaptive && once('adaptive'))) out.push({ t: r.t, tone: 'neutral', kind: 'world', text: r.rotationAdaptive ? 'Drona turned the walls against you, using his sentinels\' reports.' : 'Drona\'s drums sounded and the walls turned.' });
      }
      if (r.signal) out.push({ t: r.t, tone: 'ally', kind: 'decision', text: `You ordered ${NAME[r.signal.ally] || r.signal.ally} to ${ORDER_WORD[r.signal.order] || r.signal.order}.` });
      if (r.action === 'scout' && once('scout')) out.push({ t: r.t, tone: 'neutral', kind: 'decision', text: 'You stopped to scout, trading a turn for sight.' });
      if (r.moveClass === 'info-error' && once('infoerr')) out.push({ t: r.t, tone: 'warn', kind: 'decision', text: 'You moved by a map that was no longer true: the right move for what you knew, but not for what was there.' });
      if (ev.includes('pressed') && once('pressed')) out.push({ t: r.t, tone: 'crimson', kind: 'threat', text: `A sentinel caught you in the open. Resolve fell to ${r.resolve}.` });
      if (ev.includes('covered') && once('covered')) out.push({ t: r.t, tone: 'ally', kind: 'agents', text: 'An ally stood beside you and took the blow.' });
      if (ev.includes('breakthrough')) {
        if (!forced) { forced = { t: r.t, tone: 'crimson', kind: 'decision', text: 'You forced your way past a sentinel.', n: 1 }; out.push(forced); }
        else { forced.n++; forced.text = `You forced your way past sentinels ${forced.n} times, from turn ${forced.t} on.`; }
      }
      if (ev.includes('sealed')) out.push({ t: r.t, tone: 'crimson', kind: 'agents', text: 'Jayadratha sealed an outer gate.' });
      if (r.advice && r.followed && !r.advice.good && once('badadvice')) out.push({ t: r.t, tone: 'warn', kind: 'decision', text: 'You followed counsel that turned out to be wrong.' });
      if (r.advice && !r.followed && r.advice.good && r.moveClass !== 'optimal' && once('ignoredgood')) out.push({ t: r.t, tone: 'neutral', kind: 'decision', text: 'You set aside counsel that would have been right.' });
      if (ev.includes('core')) out.push({ t: r.t, tone: 'gold', kind: 'objective', text: 'Reached the heart of the formation.' });
      if (ev.includes('escaped') || ev.includes('completed')) out.push({ t: r.t, tone: 'gold', kind: 'objective', text: ev.includes('escaped') ? 'Returned to the open field. Escaped.' : 'Level complete.' });
    }
    if (state.outcome && !['escaped', 'completed'].includes(state.outcome.result)) {
      const why = { exhausted: 'Your resolve gave out.', encircled: 'Sentinels closed every way out.', 'sealed-in': 'Every outer gate was sealed behind you.', 'sealed-out': 'Every outer gate was sealed before you reached the core.', timeout: 'The sun set on the thirteenth day.', abandoned: 'You left the field.' };
      out.push({ t: state.outcome.turns, tone: 'crimson', kind: 'objective', text: why[state.outcome.result] || 'The round ended.' });
    }
    // keep objectives and the first of each kind; cap at 14 in time order
    if (out.length > 14) {
      const keep = out.filter((m) => m.kind === 'objective');
      for (const m of out) if (keep.length < 14 && !keep.includes(m)) keep.push(m);
      return keep.sort((a, b) => a.t - b.t).map(({ n, ...m }) => m);
    }
    return out.map(({ n, ...m }) => m);
  }

  // What each agent actually did over the round (from the log; post-game).
  function agents(state) {
    const lines = [];
    for (const a of state.allies) {
      const count = { cover: 0, hold: 0, 'move-to-hold': 0, scout: 0, follow: 0, blocked: 0 };
      for (const r of state.log) {
        const v = r.allies && r.allies[a.id];
        if (!v) continue;
        const act = v.split(':')[1];
        if (act in count) count[act]++;
      }
      const parts = [];
      if (count.cover) parts.push(`covered you on ${count.cover} turn${count.cover === 1 ? '' : 's'}`);
      if (count.hold) parts.push(`held a gate for ${count.hold} turn${count.hold === 1 ? '' : 's'}`);
      if (count.scout) parts.push(`scouted for ${count.scout} turn${count.scout === 1 ? '' : 's'}`);
      if (count.blocked) parts.push(`could not move on ${count.blocked} turn${count.blocked === 1 ? '' : 's'}`);
      lines.push({ who: a.name, side: 'pandava', role: a.role, text: parts.length ? parts.join(', ') + '.' : 'stayed out of the action.' });
    }
    if (state.cfg.gatekeeper) {
      const attempts = state.log.filter((r) => r.events.includes('sealing')).length;
      lines.push({ who: 'Jayadratha', side: 'kaurava', role: 'Gatekeeper', text: state.seals ? `sealed ${state.seals} outer gate${state.seals === 1 ? '' : 's'}${attempts > state.seals ? ` (${attempts - state.seals} attempt${attempts - state.seals === 1 ? '' : 's'} stopped by an ally holding the gate)` : ''}.` : attempts ? 'was held off: no gate was sealed.' : 'never reached a gate.' });
    }
    const drain = state.log.reduce((s, r) => s + r.drain, 0), pressTurns = state.log.filter((r) => r.pressing > 0).length;
    if (state.sentinels.length) lines.push({ who: 'Sentinels', side: 'kaurava', role: `${state.sentinels.length} on patrol`, text: pressTurns ? `pressed you on ${pressTurns} turn${pressTurns === 1 ? '' : 's'}, costing ${drain} resolve.` : 'never caught you in the open.' });
    if (state.cfg.rotationPeriod > 0) {
      const adaptive = state.log.filter((r) => r.rotationAdaptive).length;
      lines.push({ who: 'Drona', side: 'kaurava', role: 'Commander', text: `turned the walls ${state.rotations} time${state.rotations === 1 ? '' : 's'}${adaptive ? `, ${adaptive} of them aimed at you from his sentinels' reports` : ''}.` });
    }
    return lines;
  }

  // Map knowledge over the round: how much was known, and (post-game) how much of it was wrong.
  function infoSeries(state) {
    return state.log.map((r) => ({ t: r.t, known: r.knownFrac, wrong: r.staleFrac }));
  }

  // This round against the player's earlier rounds stored in this browser (no counsel only).
  function compare(sessions, current) {
    const pool = sessions.filter((s) => (s.mode === 'play' || s.mode === 'study') && (!s.condition.advisor || s.condition.advisor === 'none') && s.id !== current.id);
    const rows = ['low', 'medium', 'high'].map((lvl) => {
      const g = pool.filter((s) => s.condition.infoLevel === lvl);
      const moves = g.reduce((a, s) => a + (s.summary.moves || 0), 0);
      return {
        infoLevel: lvl, n: g.length,
        escapeRate: g.length ? g.filter((s) => s.summary.result === 'escaped').length / g.length : null,
        optimalRate: moves ? g.reduce((a, s) => a + (s.summary.optimal || 0), 0) / moves : null,
      };
    });
    return { rows, total: pool.length };
  }

  K.Insights = { briefing, objectives, moments, agents, infoSeries, compare, compassOfSeg };
})();
