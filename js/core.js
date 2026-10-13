/*
 * KURUKSHETRA — core.js
 * Seeded randomness, formation geometry, gates, rotation, shortest paths,
 * vision and belief maps. Pure logic: no DOM. Runs in the browser and Node.
 */
(function () {
  'use strict';
  const K = (globalThis.KURU = globalThis.KURU || {});

  // ------------------------------------------------------------------
  // Seeded RNG (mulberry32). Deterministic: same seed, same game.
  // ------------------------------------------------------------------
  function makeRng(seed) {
    let a = (seed >>> 0) || 1;
    const rng = function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.int = (n) => Math.floor(rng() * n);
    rng.pick = (arr) => arr[rng.int(arr.length)];
    rng.shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };
    return rng;
  }

  const mod = (a, n) => ((a % n) + n) % n;

  // ------------------------------------------------------------------
  // Geometry
  //   ring 0           = core (a single cell, id 0)
  //   rings 1..R       = the formation, S segments each
  //   ring R+1         = the open field outside
  //   wall k (0..R)    = boundary between ring k and ring k+1
  //   a gate (k, s)    = an opening in wall k at segment s
  // ------------------------------------------------------------------
  function makeGeometry(rings, segments) {
    const R = rings, S = segments, FIELD = R + 1;
    const N = 1 + FIELD * S;
    const cellId = (r, s) => (r === 0 ? 0 : 1 + (r - 1) * S + mod(s, S));
    const ringOf = (id) => (id === 0 ? 0 : 1 + Math.floor((id - 1) / S));
    const segOf = (id) => (id === 0 ? -1 : (id - 1) % S);
    const circDist = (a, b) => { const d = Math.abs(a - b) % S; return Math.min(d, S - d); };

    // Every geometrically possible link. wall === -1 means "along the ring" (always open).
    const links = Array.from({ length: N }, () => []);
    const addLink = (a, b, wall, seg) => {
      links[a].push({ to: b, wall, seg });
      links[b].push({ to: a, wall, seg });
    };
    for (let r = 1; r <= FIELD; r++) {
      for (let s = 0; s < S; s++) addLink(cellId(r, s), cellId(r, s + 1), -1, -1);
    }
    for (let s = 0; s < S; s++) addLink(0, cellId(1, s), 0, s);
    for (let r = 1; r <= R; r++) {
      for (let s = 0; s < S; s++) addLink(cellId(r, s), cellId(r + 1, s), r, s);
    }

    const fieldCells = [];
    for (let s = 0; s < S; s++) fieldCells.push(cellId(FIELD, s));

    // Cells within Manhattan distance (rings + segments) of a cell. Vision ignores walls.
    function cellsWithin(id, radius) {
      const r0 = ringOf(id), s0 = segOf(id);
      const out = [];
      if (r0 <= radius) out.push(0);
      for (let r = 1; r <= FIELD; r++) {
        const dr = Math.abs(r - r0);
        if (dr > radius) continue;
        for (let s = 0; s < S; s++) {
          const ds = id === 0 ? 0 : circDist(s, s0);
          if (dr + ds <= radius) out.push(cellId(r, s));
        }
      }
      return out;
    }

    return { R, S, FIELD, N, cellId, ringOf, segOf, circDist, links, fieldCells, cellsWithin, OUTER: R };
  }

  // ------------------------------------------------------------------
  // Formation (the true state of the gates)
  // ------------------------------------------------------------------
  function generateFormation(geom, rng, cfg) {
    const { R, S } = geom;
    const gates = [];
    for (let k = 0; k <= R; k++) gates.push(new Uint8Array(S));
    // Core wall: a single way in.
    gates[0][rng.int(S)] = 1;
    // Inner walls: a few gates, kept apart so a wall is never trivially open.
    for (let k = 1; k < R; k++) {
      const count = cfg.gatesPerWall;
      let placed = 0, guard = 0;
      while (placed < count && guard++ < 200) {
        const s = rng.int(S);
        let ok = !gates[k][s];
        for (let d = 1; d <= 2 && ok; d++) if (gates[k][mod(s + d, S)] || gates[k][mod(s - d, S)]) ok = false;
        if (ok) { gates[k][s] = 1; placed++; }
      }
    }
    // Outer wall: fixed entry points, never rotate.
    for (const s of cfg.outerGates) gates[R][mod(s, S)] = 1;
    // Rotation direction per wall: alternate, like counter-turning rings.
    const dir = [];
    for (let k = 0; k <= R; k++) dir.push(k === R ? 0 : (k % 2 === 0 ? 1 : -1));
    return { gates, dir, sealed: new Uint8Array(S) };
  }

  function cloneFormation(f) {
    return { gates: f.gates.map((g) => Uint8Array.from(g)), dir: f.dir.slice(), sealed: Uint8Array.from(f.sealed) };
  }

  function rotateWall(f, k, step) {
    if (!step) return;
    const S = f.gates[k].length;
    const next = new Uint8Array(S);
    for (let s = 0; s < S; s++) if (f.gates[k][s]) next[mod(s + step, S)] = 1;
    f.gates[k] = next;
  }

  // Is a link truly passable? Pandavas cannot pass sealed outer gates.
  function linkOpen(geom, f, link, side) {
    if (link.wall === -1) return true;
    if (!f.gates[link.wall][link.seg]) return false;
    if (link.wall === geom.OUTER && side === 'pandava' && f.sealed[link.seg]) return false;
    return true;
  }

  // ------------------------------------------------------------------
  // Shortest paths
  // ------------------------------------------------------------------
  // Dijkstra from a set of target cells. edgeCost(fromCell, link) -> cost | Infinity.
  // The graph is undirected, so this is the cost-to-go to the nearest target.
  function distanceField(geom, targets, edgeCost, allowed) {
    const dist = new Float64Array(geom.N).fill(Infinity);
    const done = new Uint8Array(geom.N);
    for (const t of targets) dist[t] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < geom.N; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u === -1) break;
      done[u] = 1;
      for (const link of geom.links[u]) {
        const v = link.to;
        if (done[v] || (allowed && !allowed(v))) continue;
        const c = edgeCost(u, link);
        if (c === Infinity) continue;
        if (best + c < dist[v]) dist[v] = best + c;
      }
    }
    return dist;
  }

  const trueCost = (geom, f, side) => (u, link) => (linkOpen(geom, f, link, side) ? 1 : Infinity);

  // ------------------------------------------------------------------
  // Belief: what one decision-maker thinks the formation looks like.
  //   gate[k][s]   -1 unknown, 0 closed, 1 open
  //   seen[k][s]   turn when that gate was last observed (-1 never)
  // ------------------------------------------------------------------
  function makeBelief(geom) {
    const gate = [], seen = [];
    for (let k = 0; k <= geom.R; k++) {
      gate.push(new Int8Array(geom.S).fill(-1));
      seen.push(new Int16Array(geom.S).fill(-1));
    }
    return {
      gate, seen,
      sealed: new Uint8Array(geom.S),
      cellSeen: new Int16Array(geom.N).fill(-1),
      agents: new Map(), // agentId -> { cell, turn, kind }
    };
  }

  function observeGate(b, f, k, s, turn) {
    b.gate[k][s] = f.gates[k][s] ? 1 : 0;
    b.seen[k][s] = turn;
  }

  // Learn everything in the given visible cells.
  function observeCells(geom, b, f, cells, turn) {
    for (const c of cells) {
      b.cellSeen[c] = turn;
      if (c === 0) { for (let s = 0; s < geom.S; s++) observeGate(b, f, 0, s, turn); continue; }
      const r = geom.ringOf(c), s = geom.segOf(c);
      if (r - 1 >= 0) observeGate(b, f, r - 1, s, turn);
      if (r <= geom.R) observeGate(b, f, r, s, turn);
      if (r >= geom.R) b.sealed[s] = f.sealed[s];
    }
  }

  function syncAllGates(geom, b, f, turn) {
    for (let k = 0; k <= geom.R; k++) for (let s = 0; s < geom.S; s++) observeGate(b, f, k, s, turn);
    for (let s = 0; s < geom.S; s++) b.sealed[s] = f.sealed[s];
  }

  // Merge `src` into `dst`, keeping whichever observation is newer.
  function mergeBelief(geom, dst, src) {
    for (let k = 0; k <= geom.R; k++) {
      for (let s = 0; s < geom.S; s++) {
        if (src.seen[k][s] > dst.seen[k][s]) { dst.seen[k][s] = src.seen[k][s]; dst.gate[k][s] = src.gate[k][s]; }
      }
    }
    for (let s = 0; s < geom.S; s++) if (src.sealed[s]) dst.sealed[s] = 1;
    for (let i = 0; i < geom.N; i++) if (src.cellSeen[i] > dst.cellSeen[i]) dst.cellSeen[i] = src.cellSeen[i];
    for (const [id, rec] of src.agents) {
      const mine = dst.agents.get(id);
      if (!mine || rec.turn > mine.turn) dst.agents.set(id, { ...rec });
    }
  }

  // Edge cost under a belief. Unknown gates are treated optimistically but cost more.
  const beliefCost = (geom, b, unknownCost) => (u, link) => {
    if (link.wall === -1) return 1;
    if (link.wall === geom.OUTER && b.sealed[link.seg]) return Infinity;
    const g = b.gate[link.wall][link.seg];
    if (g === 1) return 1;
    if (g === 0) return Infinity;
    return unknownCost;
  };

  // How much of the formation the belief covers, and how much of it is wrong.
  function beliefQuality(geom, b, f) {
    let known = 0, wrong = 0, total = 0;
    for (let k = 0; k < geom.R; k++) { // the outer wall is common knowledge, so skip it
      for (let s = 0; s < geom.S; s++) {
        total++;
        if (b.gate[k][s] === -1) continue;
        known++;
        if (b.gate[k][s] !== f.gates[k][s]) wrong++;
      }
    }
    return { knownFrac: known / total, staleFrac: known ? wrong / known : 0 };
  }

  Object.assign(K, {
    makeRng, mod, makeGeometry, generateFormation, cloneFormation, rotateWall, linkOpen,
    distanceField, trueCost, makeBelief, observeCells, syncAllGates, mergeBelief, beliefCost, beliefQuality,
  });
})();
