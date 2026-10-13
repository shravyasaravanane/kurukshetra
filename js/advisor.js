/*
 * KURUKSHETRA — advisor.js
 * "Krishna's counsel": move advice whose reliability is an experimental condition.
 *
 *   none        no advice
 *   reliable    a messenger relays Krishna's counsel; right 90% of the time
 *   unreliable  a careless messenger; right 60% of the time
 *   planner     "Krishna's insight": reasons ONLY from what the player knows and recommends
 *               the best route by that knowledge. Free, offline, deterministic.
 *   llm         an LLM agent (js/krishna.js) that also sees only what the player knows
 *
 * Scripted advice is deterministic per (seed, turn), so recorded rounds replay exactly.
 * Whatever its source, every piece of advice is scored against the TRUE formation, and
 * the player's response (followed / ignored) is logged, giving reliance metrics.
 */
(function () {
  'use strict';
  const K = (globalThis.KURU = globalThis.KURU || {});

  const ADVISORS = {
    none: { label: 'No counsel', reliability: null },
    reliable: { label: 'Reliable messenger (90%)', reliability: 0.9 },
    unreliable: { label: 'Careless messenger (60%)', reliability: 0.6 },
    planner: { label: "Krishna's insight (sees only what you know)", reliability: null },
    llm: { label: 'Krishna, an AI agent (Claude)', reliability: null },
  };

  function adviceRng(state) {
    const h = (Math.imul(state.cond.seed >>> 0, 2654435761) ^ Math.imul(state.turn + 1, 40503) ^ 0x6b72) >>> 0;
    return K.makeRng(h || 1);
  }

  function trueField(state) {
    return K.distanceField(state.geom, K.playerTargets(state), K.trueCost(state.geom, state.formation, 'pandava'));
  }

  // Which legal moves are on a true shortest path right now?
  function optimalMoves(state, dist) {
    const here = state.player.cell;
    return K.engineLegal(state).filter((m) => dist[here] !== Infinity && dist[m.to] === dist[here] - 1);
  }

  // The expert: what a commander with the TRUE map and sight of every sentinel would do
  // (the oracle policy: shortest true route, steering clear of sentinels).
  function expertMove(state) {
    if (!K.Bots || !K.Bots.oracle) return null;
    const a = K.Bots.oracle(state);
    return a && a.type === 'move' ? a.to : null;
  }
  const nearSentinel = (state, cell) => state.sentinels.some((x) => x.cell === cell || K.adjacent(state, x.cell, cell, 'kaurava'));
  // Good advice = the expert's move, or any true-shortest-path move that doesn't end next to a sentinel.
  function goodSet(state, dist) {
    const here = state.player.cell, expert = expertMove(state);
    return (to) => to === expert || (dist[here] !== Infinity && dist[to] === dist[here] - 1 && !nearSentinel(state, to));
  }

  function describeMove(state, m) {
    const G = state.geom;
    const goal = state.player.coreReached ? 'the field' : 'the core';
    if (m.breakthrough) return `Force your way past the sentinel. It is the shortest way to ${goal}.`;
    if (m.via === 'gate') {
      const inward = m.to === 0 || (state.player.cell !== 0 && G.ringOf(m.to) < G.ringOf(state.player.cell));
      return `Take this gate ${inward ? 'inward' : 'outward'}. It is the way toward ${goal}.`;
    }
    return `Walk around the ring this way. The next open gate toward ${goal} is nearer in this direction.`;
  }

  /**
   * Krishna's insight: the best move by the PLAYER'S OWN knowledge (their belief map and the
   * sentinels they have seen recently). It never looks at the truth, so when the player's
   * information is stale or missing, its counsel is wrong in exactly the same way, and it
   * says so: its explanation names the stale or unseen walls its route depends on.
   */
  function planner(state) {
    const G = state.geom, b = state.player.belief, here = state.player.cell;
    const legal = K.engineLegal(state);
    if (!legal.length) return null;
    const cost = K.beliefCost(G, b, state.cfg.unknownCost);
    const dist = K.distanceField(G, K.playerTargets(state), cost);
    if (dist[here] === Infinity) return null;
    // Danger only from sentinels the player has actually seen in the last turn.
    const danger = new Set();
    for (const [, rec] of b.agents) {
      if (rec.kind !== 'sentinel' || state.turn - rec.turn > 1) continue;
      danger.add(rec.cell);
      for (const l of G.links[rec.cell]) danger.add(l.to);
    }
    let best = null, bestVal = Infinity;
    for (const m of legal) {
      const link = G.links[here].find((l) => l.to === m.to);
      const val = cost(here, link) + dist[m.to] + (danger.has(m.to) ? 3 : 0) + (m.breakthrough ? 4 : 0);
      if (val < bestVal) { bestVal = val; best = m; }
    }
    if (!best || !(dist[best.to] < dist[here])) return null;
    // Walk the believed route to see what it rests on.
    let cell = best.to, stale = 0, unknown = 0, oldest = 0, steps = 1;
    const firstLink = G.links[here].find((l) => l.to === best.to);
    const note = (link) => {
      if (!link || link.wall === -1) return;
      const g = b.gate[link.wall][link.seg], seen = b.seen[link.wall][link.seg];
      if (g === -1) unknown++;
      else if (seen < state.turn && link.wall !== G.R && state.info.gateKnowledge !== 'live') { stale++; oldest = Math.max(oldest, state.turn - seen); }
    };
    note(firstLink);
    for (let i = 0; i < 40 && dist[cell] > 0; i++) {
      let next = null;
      for (const l of G.links[cell]) { const c = cost(cell, l); if (c < Infinity && dist[l.to] < dist[cell] && (next === null || dist[l.to] < dist[next.to])) next = l; }
      if (!next) break;
      note(next);
      cell = next.to;
      steps++;
    }
    const goal = state.player.coreReached ? 'the field' : 'the core';
    let text = `By what you know, this is the shortest way to ${goal}: about ${steps} steps.`;
    if (unknown && stale) text += ` It relies on ${unknown} wall${unknown === 1 ? '' : 's'} you have never seen and a gate last seen ${oldest} turns ago.`;
    else if (unknown) text += ` It relies on ${unknown} wall${unknown === 1 ? '' : 's'} you have never seen, so treat it as a guess.`;
    else if (stale) text += ` It relies on a gate last seen ${oldest} turn${oldest === 1 ? '' : 's'} ago, and the walls may have turned since.`;
    else text += ' Every gate on it was seen this turn.';
    return {
      to: best.to, source: 'planner', explained: !!state.cond.explain,
      text: state.cond.explain ? text : 'Step to the tile I have marked.',
      basis: { unknownWalls: unknown, staleGates: stale, oldestSighting: oldest },
    };
  }

  /**
   * Scripted counsel. The messenger knows the truth but garbles it with probability 1 - p.
   * The wording is identical for right and wrong advice, so the text itself carries no clue:
   * the player must judge it against what they can see.
   */
  function scripted(state) {
    if (state.cond.advisor === 'planner') return state.over ? null : planner(state);
    const spec = ADVISORS[state.cond.advisor];
    if (!spec || spec.reliability == null || state.over) return null;
    const legal = K.engineLegal(state);
    if (!legal.length) return null;
    const rng = adviceRng(state);
    const dist = trueField(state);
    const pickFrom = (arr) => arr[Math.floor(rng() * arr.length)];
    const isGood = goodSet(state, dist);
    const good = legal.filter((m) => isGood(m.to));
    const bad = legal.filter((m) => !isGood(m.to) && !m.breakthrough);
    const expert = expertMove(state);
    const garble = rng() >= spec.reliability;
    let move;
    if (garble && bad.length) move = pickFrom(bad);
    else if (expert != null) move = legal.find((m) => m.to === expert);
    else if (good.length) move = pickFrom(good);
    else return null; // no good move exists (blocked, or no route): no counsel this turn
    return {
      to: move.to,
      source: state.cond.advisor,
      explained: !!state.cond.explain,
      text: state.cond.explain ? describeMove(state, move) : 'Step to the tile I have marked.',
    };
  }

  // Score any advice (scripted or LLM) against the truth and against the player's belief.
  function evaluate(state, to) {
    const here = state.player.cell;
    const tDist = trueField(state);
    const bDist = K.distanceField(state.geom, K.playerTargets(state), K.beliefCost(state.geom, state.player.belief, state.cfg.unknownCost));
    const link = state.geom.links[here].find((l) => l.to === to);
    const legal = K.engineLegal(state).some((m) => m.to === to);
    const optimal = legal && tDist[here] !== Infinity && tDist[to] === tDist[here] - 1;
    const good = legal && goodSet(state, tDist)(to);
    const edge = link ? K.beliefCost(state.geom, state.player.belief, state.cfg.unknownCost)(here, link) : Infinity;
    const beliefOptimal = legal && bDist[here] !== Infinity && Math.abs(bDist[to] + edge - bDist[here]) < 1e-9;
    return { legal, optimal, beliefOptimal, good };
  }

  K.Advisor = { ADVISORS, scripted, planner, evaluate, describeMove, optimalMoves, expertMove };
})();
