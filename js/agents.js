/*
 * KURUKSHETRA — agents.js
 * Autonomous decision-makers. Every agent decides from ITS OWN information:
 *   Pandava allies   – their own belief map (plus the shared map when coordination is on)
 *   Jayadratha       – knows the formation, sees Pandavas only nearby
 *   Sentinels        – know the formation, see the intruder only nearby (or via Drona's network)
 *   Drona            – turns the formation; adapts only when sightings reach him
 */
(function () {
  'use strict';
  const K = (globalThis.KURU = globalThis.KURU || {});

  // ---------------- shared helpers ----------------
  function occupant(state, cell) {
    const p = state.player;
    if (p.cell === cell) return p;
    for (const a of state.allies) if (a.cell === cell) return a;
    if (state.gatekeeper.cell === cell) return state.gatekeeper;
    for (const s of state.sentinels) if (s.cell === cell) return s;
    return null;
  }

  // Cells reachable from `cell` in one truly passable step.
  function openNeighbors(state, cell, side) {
    const out = [];
    for (const link of state.geom.links[cell]) if (K.linkOpen(state.geom, state.formation, link, side)) out.push(link.to);
    return out;
  }

  const adjacent = (state, a, b, side) => openNeighbors(state, a, side).includes(b);

  // Take one step that lowers the distance field. Stays put if nothing improves.
  function stepDown(state, agent, dist, side, allowed) {
    const here = dist[agent.cell];
    let best = here, choice = agent.cell;
    const options = state.rng.shuffle(openNeighbors(state, agent.cell, side));
    for (const v of options) {
      if (allowed && !allowed(v)) continue;
      if (occupant(state, v)) continue;
      if (dist[v] < best) { best = dist[v]; choice = v; }
    }
    return choice;
  }

  function moveAgent(state, agent, to) {
    if (to === agent.cell) return false;
    agent.cell = to;
    return true;
  }

  const inFormation = (geom) => (c) => { const r = geom.ringOf(c); return r >= 1 && r <= geom.R; };

  // ---------------- Pandava allies ----------------
  // Where does this ally believe the player is?
  function allyKnowsPlayer(state, ally) {
    if (state.cond.allyComms) return state.player.cell;
    const rec = ally.belief.agents.get('player');
    return rec ? rec.cell : null;
  }

  function chooseHoldSeg(state, ally) {
    const { geom } = state;
    const playerCell = allyKnowsPlayer(state, ally);
    const ref = playerCell != null && playerCell !== 0 ? geom.segOf(playerCell) : geom.segOf(ally.cell);
    const taken = new Set(state.allies.filter((a) => a !== ally && a.mode === 'hold').map((a) => a.holdSeg));
    let best = null, bestD = Infinity;
    for (const s of state.cfg.outerGates) {
      if (ally.belief.sealed[s] || taken.has(s)) continue;
      const d = geom.circDist(s, ref);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  function allyAct(state, ally) {
    const { geom } = state;
    const cost = K.beliefCost(geom, ally.belief, 2);
    let mode = ally.mode;

    if (mode === 'hold') {
      if (ally.holdSeg == null || ally.belief.sealed[ally.holdSeg]) ally.holdSeg = chooseHoldSeg(state, ally);
      if (ally.holdSeg == null) mode = 'follow';
      else {
        const post = geom.cellId(geom.FIELD, ally.holdSeg);
        if (ally.cell === post) return { action: 'hold', seg: ally.holdSeg };
        const dist = K.distanceField(geom, [post], cost);
        const to = stepDown(state, ally, dist, 'pandava');
        moveAgent(state, ally, to);
        return { action: 'move-to-hold', seg: ally.holdSeg };
      }
    }

    if (mode === 'scout') {
      const frontier = [];
      for (let r = 1; r <= geom.R; r++) {
        for (let s = 0; s < geom.S; s++) if (ally.belief.gate[r - 1][s] === -1) frontier.push(geom.cellId(r, s));
      }
      if (frontier.length) {
        const dist = K.distanceField(geom, frontier, cost);
        const to = stepDown(state, ally, dist, 'pandava');
        if (to !== ally.cell) { moveAgent(state, ally, to); return { action: 'scout' }; }
      }
      mode = 'follow';
    }

    // follow
    const target = allyKnowsPlayer(state, ally);
    if (target == null) return { action: 'idle' };
    const dist = K.distanceField(geom, [target], cost);
    if (dist[ally.cell] <= 1) return { action: 'cover' };
    const to = stepDown(state, ally, dist, 'pandava');
    moveAgent(state, ally, to);
    return { action: to === ally.cell ? 'blocked' : 'follow' };
  }

  // A sentinel next to any ally is pinned: it cannot move or press the player.
  function isPinned(state, sen) {
    return state.allies.some((a) => adjacent(state, sen.cell, a.cell, 'kaurava'));
  }

  // ---------------- Jayadratha, the gatekeeper ----------------
  function gateHeld(state, s) {
    const { geom } = state;
    const inner = geom.cellId(geom.R, s), outer = geom.cellId(geom.FIELD, s);
    return state.allies.some((a) => a.cell === inner || a.cell === outer);
  }

  function gatekeeperAct(state) {
    const gk = state.gatekeeper, { geom, formation } = state;
    if (gk.cell == null || !state.player.breached) return null;
    gk.active = true;
    const seg = geom.segOf(gk.cell);

    // Sealing takes a full turn standing on the gate, which leaves a window to respond.
    if (formation.gates[geom.R][seg] && !formation.sealed[seg]) {
      if (gateHeld(state, seg)) {
        gk.waiting = 0;
      } else if (gk.waiting >= 1) {
        formation.sealed[seg] = 1;
        gk.waiting = 0;
        return { event: 'sealed', seg };
      } else {
        gk.waiting = 1;
        return { event: 'sealing', seg };
      }
    }

    // Pick the nearest gate that is still open and, as far as he can tell, unheld.
    const seesHolder = (s) => {
      const holderCells = [geom.cellId(geom.R, s), geom.cellId(geom.FIELD, s)];
      const near = geom.cellsWithin(gk.cell, state.cfg.kauravaVision + 1);
      const reported = state.cond.enemyComms; // sentinels report holders to the network
      return state.allies.some((a) => holderCells.includes(a.cell) && (reported || near.includes(a.cell)));
    };
    let target = null, bestD = Infinity;
    for (const s of state.cfg.outerGates) {
      if (formation.sealed[s] || seesHolder(s)) continue;
      const d = geom.circDist(s, seg);
      if (d < bestD) { bestD = d; target = s; }
    }
    if (target == null) return null;
    const dist = K.distanceField(geom, [geom.cellId(geom.R, target)], K.trueCost(geom, formation, 'kaurava'), (c) => geom.ringOf(c) === geom.R);
    const to = stepDown(state, gk, dist, 'kaurava', (c) => geom.ringOf(c) === geom.R);
    gk.waiting = 0;
    moveAgent(state, gk, to);
    return null;
  }

  // ---------------- Sentinels ----------------
  function sentinelAct(state, sen) {
    const { geom, formation, cfg, turn } = state;
    if (isPinned(state, sen)) return { action: 'pinned' };
    const intel = state.cond.enemyComms ? state.kauravaIntel : sen.lastSeen;
    const allowed = inFormation(geom);
    if (intel && turn - intel.turn <= cfg.kauravaMemory) {
      const kcost = K.trueCost(geom, formation, 'kaurava');
      const fromMe = K.distanceField(geom, [sen.cell], kcost, allowed);
      if (fromMe[intel.cell] <= cfg.chaseRange) {
        const ring = openNeighbors(state, intel.cell, 'kaurava').filter(allowed);
        if (ring.length && !ring.includes(sen.cell)) {
          const dist = K.distanceField(geom, ring, kcost, allowed);
          const to = stepDown(state, sen, dist, 'kaurava', allowed);
          moveAgent(state, sen, to);
          return { action: 'chase' };
        }
        if (ring.includes(sen.cell)) return { action: 'press' };
      }
    }
    // Patrol along the ring; turn around when blocked.
    const r = geom.ringOf(sen.cell), s = geom.segOf(sen.cell);
    const next = geom.cellId(r, s + sen.dir);
    if (occupant(state, next)) { sen.dir = -sen.dir; return { action: 'turn' }; }
    moveAgent(state, sen, next);
    return { action: 'patrol' };
  }

  // ---------------- Drona, the commander ----------------
  function playerTargets(state) {
    return state.player.coreReached ? state.geom.fieldCells : [0];
  }

  function dronaRotate(state) {
    const { geom, formation, cond, cfg, turn } = state;
    const intel = state.kauravaIntel;
    let adaptedWall = -1, adaptedStep = 0;
    if (cond.enemyComms && intel && turn - intel.turn <= cfg.kauravaMemory) {
      const r = geom.ringOf(intel.cell);
      const wall = state.player.coreReached ? r : r - 1;
      if (wall >= 0 && wall < geom.R) {
        const targets = playerTargets(state);
        let best = -1;
        for (const step of [formation.dir[wall], 0, -formation.dir[wall]]) {
          const trial = K.cloneFormation(formation);
          K.rotateWall(trial, wall, step);
          const d = K.distanceField(geom, targets, K.trueCost(geom, trial, 'pandava'))[intel.cell];
          const score = d === Infinity ? 999 : d;
          if (score > best) { best = score; adaptedStep = step; }
        }
        adaptedWall = wall;
      }
    }
    for (let k = 0; k < geom.R; k++) {
      K.rotateWall(formation, k, k === adaptedWall ? adaptedStep : formation.dir[k]);
    }
    return { adaptive: adaptedWall !== -1, wall: adaptedWall, step: adaptedStep };
  }

  Object.assign(K, { occupant, openNeighbors, adjacent, allyAct, isPinned, gateHeld, gatekeeperAct, sentinelAct, dronaRotate, playerTargets, chooseHoldSeg });
})();
