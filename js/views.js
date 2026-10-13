/*
 * KURUKSHETRA — views.js
 * Derived, read-only knowledge views used by the interface. Each function states WHOSE
 * knowledge it uses, so the screen never shows the player something their character
 * could not know:
 *
 *   threatZones(state)   player's knowledge: where a remembered sentinel could be by now
 *   allyPlans(state)     reported by allies, so only when Pandava coordination is on
 *   sealing(state)       observed: only if the player sees Jayadratha, or allies report it
 *   cellReport(state,c)  player's knowledge about one tile (visibility, walls, route)
 *   kauravaView(state)   post-game only: what the Kaurava side knew
 *   alliesView(state)    post-game only: what the allies' own maps showed
 */
(function () {
  'use strict';
  const K = (globalThis.KURU = globalThis.KURU || {});

  const inFormation = (G, c) => { const r = G.ringOf(c); return r >= 1 && r <= G.R; };

  // Cells a sentinel last seen `age` turns ago could have reached since, moving one step a
  // turn through walls the PLAYER believes could be open (unknown walls count as possible).
  function threatZones(state) {
    const G = state.geom, b = state.player.belief, turn = state.turn;
    const cost = K.beliefCost(G, b, 1);
    const out = [];
    for (const [id, rec] of b.agents) {
      if (rec.kind !== 'sentinel') continue;
      const age = turn - rec.turn;
      if (age < 1 || age > 3) continue; // fresh: they are in sight; old: too uncertain to draw
      const reach = new Map([[rec.cell, 0]]);
      let frontier = [rec.cell];
      for (let d = 1; d <= age; d++) {
        const next = [];
        for (const c of frontier) for (const l of G.links[c]) {
          if (reach.has(l.to) || !inFormation(G, l.to) || cost(c, l) === Infinity) continue;
          reach.set(l.to, d);
          next.push(l.to);
        }
        frontier = next;
      }
      for (const c of [...reach.keys()]) if (state.player.visible.has(c)) reach.delete(c); // seen empty now
      out.push({ id, age, lastCell: rec.cell, cells: [...reach.keys()] });
    }
    return out;
  }

  // Where each ally is heading, as they would report over the shared channel.
  function allyPlans(state) {
    if (!state.cond.allyComms) return [];
    const G = state.geom;
    return state.allies.map((a) => {
      let target = null;
      if (a.mode === 'hold' && a.holdSeg != null) target = G.cellId(G.FIELD, a.holdSeg);
      else if (a.mode === 'follow') target = state.player.cell;
      else if (a.mode === 'scout') {
        const frontier = [];
        for (let r = 1; r <= G.R; r++) for (let s = 0; s < G.S; s++) if (a.belief.gate[r - 1][s] === -1) frontier.push(G.cellId(r, s));
        if (frontier.length) {
          // the unexplored wall nearest to the ally, by the ally's own map
          const fromAlly = K.distanceField(G, [a.cell], K.beliefCost(G, a.belief, 2));
          target = frontier.reduce((acc, c) => (acc === null || fromAlly[c] < fromAlly[acc] ? c : acc), null);
        }
      }
      let path = [];
      if (target != null && target !== a.cell) {
        const cost = K.beliefCost(G, a.belief, 2);
        const dist = K.distanceField(G, [target], cost);
        let here = a.cell;
        for (let i = 0; i < 14 && dist[here] > 0 && dist[here] < Infinity; i++) {
          let next = null;
          for (const l of G.links[here]) { const c = cost(here, l); if (c < Infinity && dist[l.to] < dist[here] && (next === null || dist[l.to] < dist[next])) next = l.to; }
          if (next === null) break;
          path.push(next);
          here = next;
        }
      }
      return { id: a.id, name: a.name, mode: a.mode, target, path };
    });
  }

  // A gate being sealed this turn, if the player can perceive it.
  function sealing(state) {
    const gk = state.gatekeeper;
    if (gk.cell == null || !gk.waiting) return null;
    const seen = state.player.visible.has(gk.cell) || state.cond.allyComms;
    if (!seen) return null;
    const seg = state.geom.segOf(gk.cell);
    return { seg, cell: gk.cell, reported: !state.player.visible.has(gk.cell) };
  }

  // Everything the player knows about one tile.
  function cellReport(state, cell) {
    const G = state.geom, b = state.player.belief, turn = state.turn, p = state.player;
    const r = cell === 0 ? 0 : G.ringOf(cell), s = cell === 0 ? null : G.segOf(cell);
    const vis = p.visible.has(cell);
    const seenTurn = b.cellSeen[cell];
    const visibility = vis ? 'visible' : seenTurn >= 0 ? 'remembered' : 'unseen';
    const wallInfo = (k) => {
      if (k < 0 || k > G.R || s == null) return null;
      const g = b.gate[k][s], seen = b.seen[k][s];
      const sealed = k === G.R && b.sealed[s];
      return {
        state: g === -1 ? 'unknown' : g === 0 ? 'wall' : sealed ? 'sealed' : 'gate',
        age: seen >= 0 ? turn - seen : null,
      };
    };
    const cost = K.beliefCost(G, b, state.cfg.unknownCost);
    const fromMe = K.distanceField(G, [p.cell], cost);
    const legal = K.engineLegal(state).find((m) => m.to === cell) || null;
    let whyNot = null;
    if (!legal && cell !== p.cell) {
      const link = G.links[p.cell].find((l) => l.to === cell);
      if (!link) whyNot = 'Not next to you.';
      else if (link.wall !== -1) {
        const g = b.gate[link.wall][link.seg];
        whyNot = g === 0 ? 'A wall stands in the way.' : (link.wall === G.R && b.sealed[link.seg]) ? 'That gate is sealed.' : 'Not passable from here.';
      } else whyNot = 'Someone is standing there.';
    }
    return {
      cell, ring: r, seg: s,
      label: cell === 0 ? 'The core' : r === G.FIELD ? `The field · segment ${s + 1}` : `Ring ${r} · segment ${s + 1}`,
      visibility, seenAgo: seenTurn >= 0 && !vis ? turn - seenTurn : null,
      inward: cell === 0 ? null : wallInfo(r - 1),
      outward: cell === 0 || r === G.FIELD ? null : wallInfo(r),
      steps: cell === p.cell ? 0 : fromMe[cell] === Infinity ? null : Math.round(fromMe[cell]),
      legal, whyNot,
    };
  }

  // Post-game: the Kaurava picture. They know the formation exactly and their own forces,
  // but the intruder only at the last sighting shared through Drona (or each sentinel's own).
  function kauravaView(state) {
    const G = state.geom;
    const b = K.makeBelief(G);
    K.syncAllGates(G, b, state.formation, state.turn);
    const known = new Map();
    for (const a of [state.gatekeeper, ...state.sentinels]) if (a.cell != null) known.set(a.id, { cell: a.cell, kind: a.kind, age: 0 });
    const intel = state.kauravaIntel;
    return {
      geom: G, turn: state.turn, belief: b, visible: null, truth: true, known,
      playerCell: intel ? intel.cell : state.player.cell, playerGhost: intel ? state.turn - intel.turn : null,
      legal: [], outerGates: state.cfg.outerGates, kaurava: true,
    };
  }

  // Post-game: the allies' own maps merged (what the Pandava side knew between them).
  function alliesView(state) {
    const G = state.geom;
    const b = K.makeBelief(G);
    for (const a of state.allies) K.mergeBelief(G, b, a.belief);
    const visible = new Set();
    for (const a of state.allies) for (const c of G.cellsWithin(a.cell, state.cfg.allyVision)) visible.add(c);
    const known = new Map();
    for (const a of state.allies) known.set(a.id, { cell: a.cell, kind: 'ally', age: 0 });
    for (const [id, rec] of b.agents) if (!known.has(id) && id !== 'player') known.set(id, Object.assign({ age: state.turn - rec.turn }, rec));
    return { geom: G, turn: state.turn, belief: b, visible, playerCell: state.player.cell, known, legal: [], outerGates: state.cfg.outerGates };
  }

  K.Views = { threatZones, allyPlans, sealing, cellReport, kauravaView, alliesView };
})();
