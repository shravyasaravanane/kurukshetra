/*
 * KURUKSHETRA — bots.js
 * Scripted player policies used as baselines by the simulator (and as a
 * "watch the AI" demo in the UI). A bot only reads the player's own belief,
 * exactly like a human does — except the Oracle, which is given the truth.
 */
(function () {
  'use strict';
  const K = (globalThis.KURU = globalThis.KURU || {});

  function dangerCells(state, belief) {
    const danger = new Set();
    for (const [, rec] of belief.agents) {
      if (rec.kind !== 'sentinel' || state.turn - rec.turn > 1) continue;
      danger.add(rec.cell);
      for (const l of state.geom.links[rec.cell]) danger.add(l.to);
    }
    return danger;
  }

  function greedyMove(state, costFn, danger) {
    const targets = K.playerTargets(state);
    const withDanger = (u, link) => {
      const c = costFn(u, link);
      return c === Infinity ? c : c + (danger.has(link.to) ? 3 : 0);
    };
    const dist = K.distanceField(state.geom, targets, withDanger);
    const here = state.player.cell;
    let best = null;
    for (const m of K.engineLegal(state)) {
      const link = state.geom.links[here].find((l) => l.to === m.to);
      const val = withDanger(here, link) + dist[m.to] + (m.breakthrough ? 4 : 0);
      if (m.breakthrough && state.player.resolve <= state.cfg.breakthroughCost + 2) continue;
      if (dist[m.to] < dist[here]) {
        if (best === null || val < best.val) best = { to: m.to, val, link };
      }
    }
    return { best, dist };
  }

  function signalPolicy(state) {
    if (!state.cond.allyComms || !state.player.breached) return null;
    if (state.allies.some((a) => a.mode === 'hold')) return null;
    const { geom } = state;
    let pick = null, bestR = -1;
    for (const a of state.allies) { const r = geom.ringOf(a.cell); if (r > bestR) { bestR = r; pick = a; } }
    return pick ? { ally: pick.id, order: 'hold' } : null;
  }

  const Bots = {
    // Plans on its own (possibly stale) belief; scouts when stuck.
    belief(state, mem) {
      const cost = K.beliefCost(state.geom, state.player.belief, state.cfg.unknownCost);
      const { best } = greedyMove(state, cost, dangerCells(state, state.player.belief));
      const signal = signalPolicy(state);
      mem.lastScout = mem.lastScout == null ? -99 : mem.lastScout;
      const crossingUnknown = best && best.link.wall !== -1 && state.player.belief.gate[best.link.wall][best.link.seg] === -1;
      if ((!best || crossingUnknown) && state.turn - mem.lastScout >= 6) { mem.lastScout = state.turn; return { type: 'scout', signal }; }
      if (!best) return { type: 'wait', signal };
      return { type: 'move', to: best.to, signal };
    },
    // Upper bound: plans on the true formation.
    oracle(state) {
      const cost = K.trueCost(state.geom, state.formation, 'pandava');
      const danger = new Set();
      for (const s of state.sentinels) { danger.add(s.cell); for (const l of state.geom.links[s.cell]) danger.add(l.to); }
      const { best } = greedyMove(state, cost, danger);
      return best ? { type: 'move', to: best.to, signal: signalPolicy(state) } : { type: 'wait', signal: signalPolicy(state) };
    },
    // Always does what the advisor says (when there is advice); otherwise plans on its belief.
    truster(state, mem, advice) {
      if (advice && K.engineLegal(state).some((m) => m.to === advice.to)) return { type: 'move', to: advice.to, signal: signalPolicy(state) };
      return Bots.belief(state, mem);
    },
    // Follows advice unless it clearly contradicts its own map (calibrated trust).
    calibrated(state, mem, advice) {
      const own = Bots.belief(state, mem);
      if (!advice) return own;
      const cost = K.beliefCost(state.geom, state.player.belief, state.cfg.unknownCost);
      const dist = K.distanceField(state.geom, K.playerTargets(state), cost);
      const here = state.player.cell;
      const via = (to) => { const l = state.geom.links[here].find((x) => x.to === to); return l ? cost(here, l) + dist[to] : Infinity; };
      const ownVal = own.type === 'move' ? via(own.to) : dist[here];
      // Contradiction: by its own map the advised step is clearly worse than its own plan.
      if (via(advice.to) > ownVal + 1.5) return own;
      return { type: 'move', to: advice.to, signal: own.signal };
    },
    // Lower bound.
    random(state) {
      const moves = K.engineLegal(state);
      if (!moves.length || state.rng() < 0.1) return { type: 'wait' };
      return { type: 'move', to: moves[Math.floor(state.rng() * moves.length)].to };
    },
  };

  // Plays a whole round. Scripted counsel (if the condition has it) is generated each turn,
  // offered to the bot, and logged with the step exactly as in the browser.
  function playBot(game, botName) {
    const bot = Bots[botName];
    const mem = {};
    let guard = 0;
    while (!game.over && guard++ < 1000) {
      const advice = K.Advisor ? K.Advisor.scripted(game.state) : null;
      game.step(bot(game.state, mem, advice), { advice });
    }
    return game.summary();
  }

  Object.assign(K, { Bots, playBot });
})();
