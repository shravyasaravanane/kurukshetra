/*
 * KURUKSHETRA — engine.js
 * The deterministic turn loop. The engine holds the TRUTH; every decision-maker
 * holds a BELIEF. Each turn is logged with both, so we can tell apart
 * "the information was wrong" from "the decision was wrong".
 */
(function () {
  'use strict';
  const K = (globalThis.KURU = globalThis.KURU || {});

  const DEFAULT_CONFIG = {
    rings: 5,
    segments: 12,
    gatesPerWall: 2,
    outerGates: [1, 5, 9],
    resolve: 15,
    turnLimit: 70,
    breakthroughCost: 2,
    rotationPeriod: 5,
    allyVision: 2,
    kauravaVision: 2,
    kauravaMemory: 3,
    chaseRange: 6,
    scoutBonus: 2,
    unknownCost: 2,
    sentinelRings: null, // null = one sentinel on every ring
    allies: null,        // null = the full roster, or a list of ids e.g. ['bhima']
    gatekeeper: true,    // false = no Jayadratha (used by the early tutorial levels)
    goal: 'escape',      // 'escape' = core then field; 'core' = reaching the core ends the round (tutorial levels)
  };

  // The information-level manipulation (independent variable 1).
  const INFO_LEVELS = {
    low: { vision: 1, gateKnowledge: 'none', label: 'Low — Abhimanyu', blurb: 'You see only the cells right next to you and know nothing of the formation in advance.' },
    medium: { vision: 2, gateKnowledge: 'initial', label: 'Medium — briefed', blurb: 'You were shown the formation before it began to turn. Your map goes stale as it rotates.' },
    high: { vision: 2, gateKnowledge: 'live', label: 'High — Arjuna', blurb: 'You know where every gate is at all times. You still cannot see the enemy beyond your sight.' },
  };

  const ALLY_ROSTER = [
    { id: 'bhima', name: 'Bhima', role: 'Follower', mode: 'follow', seg: 11, about: 'Stays close to you and presses back on sentinels near you.' },
    { id: 'nakula', name: 'Nakula', role: 'Scout', mode: 'scout', seg: 3, about: 'Explores the formation and maps the gates he finds.' },
    { id: 'satyaki', name: 'Satyaki', role: 'Guardian', mode: 'hold', seg: 2, about: 'Tries to keep an outer gate open behind you.' },
  ];

  const ORDERS = { follow: 'Follow me', hold: 'Hold the breach', scout: 'Scout ahead' };

  function createGame(options) {
    const opts = options || {};
    const cfg = Object.assign({}, DEFAULT_CONFIG, opts.config || {});
    const cond = {
      infoLevel: opts.infoLevel || 'medium',
      allyComms: !!opts.allyComms,
      enemyComms: opts.enemyComms !== undefined ? !!opts.enemyComms : true,
      seed: (opts.seed >>> 0) || 1,
      advisor: opts.advisor || 'none',   // none | reliable | unreliable | llm (see advisor.js)
      explain: opts.explain !== undefined ? !!opts.explain : true,
    };
    const info = INFO_LEVELS[cond.infoLevel];
    if (!info) throw new Error('Unknown info level: ' + cond.infoLevel);

    const geom = K.makeGeometry(cfg.rings, cfg.segments);
    // The layout and the agents' randomness use separate streams, so the same seed gives
    // the same formation under every condition.
    const layoutRng = K.makeRng(cond.seed);
    const rng = K.makeRng(cond.seed ^ 0x9e3779b9);
    const formation = K.generateFormation(geom, layoutRng, cfg);

    const newBelief = () => {
      const b = K.makeBelief(geom);
      // The outer gates are visible from the field: common knowledge for everyone.
      for (let s = 0; s < geom.S; s++) { b.gate[geom.R][s] = formation.gates[geom.R][s]; b.seen[geom.R][s] = 0; }
      return b;
    };

    const player = {
      id: 'player', kind: 'player', cell: geom.cellId(geom.FIELD, 0), resolve: cfg.resolve,
      belief: newBelief(), breached: false, entrySeg: null, coreReached: false, coreTurn: null,
      scouting: false, scoutCount: 0, signalCount: 0, visible: new Set(),
    };
    if (info.gateKnowledge !== 'none') K.syncAllGates(geom, player.belief, formation, 0);

    const roster = cfg.allies ? ALLY_ROSTER.filter((a) => cfg.allies.includes(a.id)) : ALLY_ROSTER;
    const allies = roster.map((a) => ({
      id: a.id, kind: 'ally', name: a.name, role: a.role, about: a.about, mode: a.mode, defaultMode: a.mode,
      holdSeg: null, cell: geom.cellId(geom.FIELD, a.seg), belief: newBelief(), lastAction: 'idle',
    }));

    const gatekeeper = { id: 'jayadratha', kind: 'gatekeeper', name: 'Jayadratha', cell: cfg.gatekeeper ? geom.cellId(geom.R, 7) : null, active: false, waiting: 0 };

    // One sentinel per ring, never starting right next to the entry point.
    const sentinels = [];
    const rings = cfg.sentinelRings || Array.from({ length: geom.R }, (_, i) => i + 1);
    for (const r of rings) {
      let s, guard = 0;
      do { s = layoutRng.int(geom.S); guard++; } while (guard < 50 && (
        (r === geom.R && (geom.circDist(s, 0) <= 2 || s === 7)) ||
        (r === geom.R - 1 && geom.circDist(s, 0) <= 1)));
      sentinels.push({ id: 'sentinel-' + r, kind: 'sentinel', cell: geom.cellId(r, s), dir: layoutRng() < 0.5 ? 1 : -1, lastSeen: null });
    }

    const state = {
      geom, cfg, cond, info, rng, formation, turn: 0,
      player, allies, gatekeeper, sentinels, kauravaIntel: null, intents: {},
      over: false, outcome: null, log: [], lastEvents: [], rotations: 0, seals: 0,
      startedAt: Date.now(),
    };
    updateObservations(state);
    return makeApi(state);
  }

  // ------------------------------------------------------------------
  // Observation: everyone looks around at the end of each turn.
  // ------------------------------------------------------------------
  function allAgents(state) {
    return [state.player, ...state.allies, state.gatekeeper, ...state.sentinels];
  }

  function seeAgents(state, belief, cells, selfId) {
    const set = new Set(cells);
    for (const a of allAgents(state)) {
      if (a.id === selfId || !set.has(a.cell)) continue;
      belief.agents.set(a.id, { cell: a.cell, turn: state.turn, kind: a.kind });
    }
  }

  function updateObservations(state) {
    const { geom, formation, player, cfg, info, turn } = state;
    const radius = info.vision + (player.scouting ? cfg.scoutBonus : 0);
    const visible = geom.cellsWithin(player.cell, radius);
    player.visible = new Set(visible);
    K.observeCells(geom, player.belief, formation, visible, turn);
    seeAgents(state, player.belief, visible, 'player');
    if (info.gateKnowledge === 'live') K.syncAllGates(geom, player.belief, formation, turn);

    for (const ally of state.allies) {
      const v = geom.cellsWithin(ally.cell, cfg.allyVision);
      K.observeCells(geom, ally.belief, formation, v, turn);
      seeAgents(state, ally.belief, v, ally.id);
    }
    if (state.cond.allyComms) {
      // Shared situational picture: everything any Pandava saw, everyone now knows.
      for (const ally of state.allies) K.mergeBelief(geom, player.belief, ally.belief);
      for (const ally of state.allies) K.mergeBelief(geom, ally.belief, player.belief);
    }

    // Kaurava sightings of the intruder.
    for (const k of [state.gatekeeper, ...state.sentinels]) {
      if (k.cell == null) continue;
      const near = geom.cellsWithin(k.cell, cfg.kauravaVision);
      if (near.includes(player.cell)) {
        k.lastSeen = { cell: player.cell, turn };
        if (!state.kauravaIntel || state.kauravaIntel.turn <= turn) state.kauravaIntel = { cell: player.cell, turn };
      }
    }
    player.scouting = false;
  }

  // ------------------------------------------------------------------
  // Player moves
  // ------------------------------------------------------------------
  function legalMoves(state) {
    const out = [];
    for (const link of state.geom.links[state.player.cell]) {
      if (!K.linkOpen(state.geom, state.formation, link, 'pandava')) continue;
      const occ = K.occupant(state, link.to);
      if (occ && occ.kind === 'gatekeeper') continue;
      const breakthrough = !!(occ && occ.kind === 'sentinel');
      out.push({ to: link.to, via: link.wall === -1 ? 'ring' : 'gate', wall: link.wall, seg: link.seg, breakthrough });
    }
    return out;
  }

  // Classify a move against the true map and against the player's belief.
  function classifyMove(state, from, to, trueDist, beliefDist) {
    const { geom, formation, player, cfg } = state;
    if (trueDist[from] === Infinity) return 'no-route';
    const optimalNext = [];
    for (const link of geom.links[from]) {
      if (K.linkOpen(geom, formation, link, 'pandava') && trueDist[link.to] === trueDist[from] - 1) optimalNext.push(link.to);
    }
    if (optimalNext.includes(to)) return 'optimal';
    const blocked = optimalNext.every((c) => { const o = K.occupant(state, c); return o && o.kind !== 'ally' && o.kind !== 'player'; });
    if (optimalNext.length && blocked) return 'forced';
    const link = geom.links[from].find((l) => l.to === to);
    const edge = link ? K.beliefCost(geom, player.belief, cfg.unknownCost)(from, link) : Infinity;
    if (beliefDist[from] !== Infinity && Math.abs(beliefDist[to] + edge - beliefDist[from]) < 1e-9) return 'info-error';
    return 'decision-error';
  }

  function step(state, action, meta) {
    if (state.over) return { events: [] };
    const { geom, formation, player, cfg, cond } = state;
    action = action || { type: 'wait' };
    meta = meta || {};
    state.turn += 1;
    const events = [];
    const ev = (type, data) => events.push(Object.assign({ type, turn: state.turn }, data || {}));

    // Pre-decision measurements.
    const targets = K.playerTargets(state);
    const trueDist = K.distanceField(geom, targets, K.trueCost(geom, formation, 'pandava'));
    const beliefDist = K.distanceField(geom, targets, K.beliefCost(geom, player.belief, cfg.unknownCost));
    const quality = K.beliefQuality(geom, player.belief, formation);
    const from = player.cell;
    const phaseBefore = player.coreReached ? 'exit' : 'core';
    // Advice shown this turn (scripted or LLM), scored against the truth before the move.
    let adviceRec = null;
    if (meta.advice && meta.advice.to != null && K.Advisor) {
      const ev = K.Advisor.evaluate(state, meta.advice.to);
      adviceRec = { to: meta.advice.to, source: meta.advice.source, explained: !!meta.advice.explained, good: ev.good, optimal: ev.optimal, beliefOptimal: ev.beliefOptimal, legal: ev.legal };
      if (meta.advice.latencyMs != null) adviceRec.latencyMs = Math.round(meta.advice.latencyMs);
    }

    // 1. Signal (free, Pandava coordination only).
    let signal = null;
    if (action.signal && cond.allyComms) {
      const ally = state.allies.find((a) => a.id === action.signal.ally);
      if (ally && ORDERS[action.signal.order]) {
        ally.mode = action.signal.order;
        if (ally.mode === 'hold') ally.holdSeg = K.chooseHoldSeg(state, ally);
        signal = { ally: ally.id, order: ally.mode };
        player.signalCount++;
        ev('signal', { ally: ally.name, order: ORDERS[ally.mode] });
      }
    }

    // 2. Player action.
    let type = action.type, moveClass = type;
    if (type === 'move') {
      const move = legalMoves(state).find((m) => m.to === action.to);
      if (!move) { type = 'wait'; moveClass = 'invalid'; ev('blocked'); }
      else {
        const other = K.occupant(state, move.to);
        if (other && other.kind === 'ally') { other.cell = from; ev('swap', { ally: other.name }); }
        if (other && other.kind === 'sentinel') {
          other.cell = from;
          player.resolve -= cfg.breakthroughCost;
          ev('breakthrough', { cost: cfg.breakthroughCost });
        }
        player.cell = move.to;
        moveClass = classifyMove(state, from, move.to, trueDist, beliefDist);
      }
    } else if (type === 'scout') {
      player.scouting = true;
      player.scoutCount++;
    } else {
      type = 'wait';
    }

    const ring = geom.ringOf(player.cell);
    if (!player.breached && ring === geom.R && geom.ringOf(from) === geom.FIELD) {
      player.breached = true;
      player.entrySeg = geom.segOf(player.cell);
      ev('breach', { seg: player.entrySeg });
    }
    if (!player.coreReached && player.cell === 0) {
      player.coreReached = true;
      player.coreTurn = state.turn;
      ev('core');
    }
    if (player.coreReached && cfg.goal === 'core' && !state.over) {
      finish(state, 'completed');
      ev('completed');
    }
    if (player.coreReached && ring === geom.FIELD && !state.over) {
      finish(state, 'escaped');
      ev('escaped');
    }

    // 3. Everyone else acts.
    const agentActions = {};
    if (!state.over) {
      for (const ally of state.allies) {
        const r = K.allyAct(state, ally);
        agentActions[ally.id] = r.action;
        ally.lastAction = r.action;
      }
      const g = K.gatekeeperAct(state);
      if (g && g.event === 'sealed') { state.seals++; ev('sealed', { seg: g.seg }); }
      if (g && g.event === 'sealing') ev('sealing', { seg: g.seg });
      for (const sen of state.sentinels) { agentActions[sen.id] = K.sentinelAct(state, sen).action; state.intents[sen.id] = agentActions[sen.id]; }

      if (cfg.rotationPeriod > 0 && state.turn % cfg.rotationPeriod === 0) {
        const rot = K.dronaRotate(state);
        state.rotations++;
        ev('rotation', rot);
      }
    }

    // 4. Pressure: un-pinned sentinels next to the player drain resolve; allies give cover.
    let pressing = 0, cover = 0, drain = 0;
    if (!state.over) {
      for (const sen of state.sentinels) if (K.adjacent(state, sen.cell, player.cell, 'kaurava') && !K.isPinned(state, sen)) pressing++;
      for (const ally of state.allies) if (K.adjacent(state, ally.cell, player.cell, 'pandava')) cover++;
      drain = Math.max(0, pressing - cover);
      if (drain) { player.resolve -= drain; ev('pressed', { drain, pressing, cover }); }
      if (pressing && cover && drain < pressing) ev('covered', { saved: pressing - drain });
    }

    // 5. End conditions.
    if (!state.over) {
      const free = legalMoves(state).filter((m) => !m.breakthrough).length;
      const adjacentEnemies = state.sentinels.filter((s) => K.adjacent(state, s.cell, player.cell, 'kaurava')).length;
      const allSealed = cfg.outerGates.every((s) => formation.sealed[s]);
      if (player.resolve <= 0) finish(state, 'exhausted');
      else if (free === 0 && adjacentEnemies >= 2 && player.resolve <= cfg.breakthroughCost) finish(state, 'encircled');
      else if (allSealed && geom.ringOf(player.cell) <= geom.R) finish(state, 'sealed-in');
      else if (allSealed && !player.coreReached) finish(state, 'sealed-out');
      else if (state.turn >= cfg.turnLimit) finish(state, 'timeout');
      if (state.over) ev('end', { result: state.outcome.result });
    }

    updateObservations(state);

    state.log.push({
      t: state.turn,
      action: type,
      from, to: player.cell,
      ring: geom.ringOf(player.cell),
      phase: phaseBefore,
      signal,
      decisionMs: meta.decisionMs != null ? Math.round(meta.decisionMs) : null,
      moveClass,
      trueDistBefore: finite(trueDist[from]),
      trueDistAfter: finite(trueDist[player.cell]),
      beliefCostBefore: finite(beliefDist[from]),
      knownFrac: round(quality.knownFrac),
      staleFrac: round(quality.staleFrac),
      resolve: player.resolve,
      pressing, cover, drain,
      visibleEnemies: [state.gatekeeper, ...state.sentinels].filter((k) => player.visible.has(k.cell)).length,
      allies: Object.fromEntries(state.allies.map((a) => [a.id, a.mode + ':' + (agentActions[a.id] || '-')])),
      events: events.map((e) => e.type),
      advice: adviceRec,
      followed: adviceRec ? (type === 'move' && player.cell === adviceRec.to) : null,
    });
    state.lastEvents = events;
    return { events };
  }


  const finite = (x) => (x === Infinity ? null : x);
  const round = (x) => Math.round(x * 1000) / 1000;

  // ------------------------------------------------------------------
  // Outcome and scoring
  // ------------------------------------------------------------------
  function finish(state, result) {
    state.over = true;
    const p = state.player, cfg = state.cfg;
    const escaped = result === 'escaped' || result === 'completed';
    const score = (p.coreReached ? 400 : 0) + (escaped ? 400 : 0) + Math.max(0, p.resolve) * 10 + (escaped ? Math.max(0, cfg.turnLimit - state.turn) * 5 : 0);
    state.outcome = {
      result,
      category: escaped ? 'win' : p.coreReached ? 'partial' : 'loss',
      turns: state.turn,
      coreReached: p.coreReached,
      coreTurn: p.coreTurn,
      resolve: Math.max(0, p.resolve),
      score,
    };
  }

  function summarize(state) {
    const moves = state.log.filter((r) => r.action === 'move');
    const count = (c) => moves.filter((m) => m.moveClass === c).length;
    const timed = state.log.filter((r) => r.decisionMs != null);
    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    const breachTurn = (state.log.find((r) => r.events.includes('breach')) || {}).t || null;
    const adv = state.log.filter((r) => r.advice);
    const good = adv.filter((r) => r.advice.good), bad = adv.filter((r) => !r.advice.good);
    const fg = good.filter((r) => r.followed).length, fb = bad.filter((r) => r.followed).length;
    const reliance = {
      adviceGiven: adv.length, adviceGood: good.length, adviceBad: bad.length,
      followedGood: fg, followedBad: fb, ignoredGood: good.length - fg, ignoredBad: bad.length - fb,
      followRate: adv.length ? round((fg + fb) / adv.length) : null,
      overReliance: bad.length ? round(fb / bad.length) : null,      // followed advice that was wrong
      underReliance: good.length ? round((good.length - fg) / good.length) : null, // ignored advice that was right
      appropriateReliance: adv.length ? round((fg + (bad.length - fb)) / adv.length) : null,
    };
    return Object.assign({}, state.outcome || { result: 'in-progress', category: 'none', turns: state.turn }, {
      moves: moves.length,
      optimal: count('optimal'),
      infoErrors: count('info-error'),
      decisionErrors: count('decision-error'),
      forced: count('forced'),
      waits: state.log.filter((r) => r.action === 'wait').length,
      scouts: state.player.scoutCount,
      signals: state.player.signalCount,
      optimalRate: moves.length ? round(count('optimal') / moves.length) : null,
      meanDecisionMs: timed.length ? Math.round(avg(timed.map((r) => r.decisionMs))) : null,
      meanKnownFrac: round(avg(state.log.map((r) => r.knownFrac)) || 0),
      meanStaleFrac: round(avg(state.log.map((r) => r.staleFrac)) || 0),
      totalDrain: state.log.reduce((a, r) => a + r.drain, 0),
      coverEvents: state.log.filter((r) => r.events.includes('covered')).length,
      gatesSealed: state.seals,
      rotations: state.rotations,
      breachTurn,
      advisor: state.cond.advisor, explain: state.cond.explain,
    }, reliance);
  }

  // ------------------------------------------------------------------
  // Views. The UI only ever receives the PLAYER'S view, except in the debrief.
  // ------------------------------------------------------------------
  function playerView(state) {
    const { player, geom, turn } = state;
    const known = new Map();
    for (const [id, rec] of player.belief.agents) known.set(id, Object.assign({ age: turn - rec.turn }, rec));
    if (state.cond.allyComms) for (const a of state.allies) known.set(a.id, { cell: a.cell, turn, kind: 'ally', age: 0 });
    return {
      geom, turn, belief: player.belief, visible: player.visible, playerCell: player.cell,
      known, legal: state.over ? [] : legalMoves(state),
      outerGates: state.cfg.outerGates,
      // What the player can read from sentinels in sight: alert ones are coming for you.
      intents: new Map(state.sentinels.filter((s) => player.visible.has(s.cell)).map((s) => [s.id, {
        alert: state.intents[s.id] === 'chase' || state.intents[s.id] === 'press', dir: s.dir,
      }])),
      rotationIn: state.cfg.rotationPeriod > 0 ? state.cfg.rotationPeriod - (turn % state.cfg.rotationPeriod) : null,
    };
  }

  function truthView(state) {
    const known = new Map();
    for (const a of [...state.allies, state.gatekeeper, ...state.sentinels]) if (a.cell != null) known.set(a.id, { cell: a.cell, kind: a.kind, age: 0 });
    const b = K.makeBelief(state.geom);
    K.syncAllGates(state.geom, b, state.formation, state.turn);
    return { geom: state.geom, turn: state.turn, belief: b, visible: null, playerCell: state.player.cell, known, legal: [], outerGates: state.cfg.outerGates, truth: true };
  }

  function makeApi(state) {
    return {
      state,
      step: (action, meta) => step(state, action, meta),
      legalMoves: () => legalMoves(state),
      playerView: () => playerView(state),
      truthView: () => truthView(state),
      summary: () => summarize(state),
      get over() { return state.over; },
      get outcome() { return state.outcome; },
    };
  }

  Object.assign(K, { DEFAULT_CONFIG, INFO_LEVELS, ALLY_ROSTER, ORDERS, createGame, engineLegal: legalMoves });
})();
