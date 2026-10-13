/*
 * KURUKSHETRA — render.js
 * Draws a view of the formation on a canvas. It is given either the player's
 * view (fog, beliefs, remembered sightings) or the truth view (debrief only).
 */
(function () {
  'use strict';
  const K = (globalThis.KURU = globalThis.KURU || {});
  const TAU = Math.PI * 2;

  function palette() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    return {
      fog: v('--map-fog'), seen: v('--map-seen'), lit: v('--map-lit'), field: v('--map-field'), fieldLit: v('--map-field-lit'),
      wall: v('--map-wall'), wallUnknown: v('--map-wall-unknown'), gate: v('--accent'), sealed: v('--danger'),
      core: v('--map-core'), player: v('--accent'), ally: v('--ally'), enemy: v('--danger'), gatekeeper: v('--gatekeeper'),
      legal: v('--accent'), text: v('--text'), muted: v('--muted'), bg: v('--surface'),
    };
  }

  function layout(canvas, geom) {
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const size = Math.min(W, H);
    const cx = W / 2, cy = H / 2;
    const outer = size / 2 - 6;
    const rc = outer * 0.085;
    const w = (outer - rc) / geom.FIELD;
    const segA = TAU / geom.S;
    const a0 = (s) => -Math.PI / 2 + s * segA - segA / 2;
    const rIn = (r) => (r === 0 ? 0 : rc + (r - 1) * w);
    const rOut = (r) => (r === 0 ? rc : rc + r * w);
    const center = (cell) => {
      if (cell === 0) return { x: cx, y: cy };
      const r = geom.ringOf(cell), s = geom.segOf(cell);
      const rad = (rIn(r) + rOut(r)) / 2, ang = a0(s) + segA / 2;
      return { x: cx + rad * Math.cos(ang), y: cy + rad * Math.sin(ang) };
    };
    const cellAt = (x, y) => {
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
      if (d <= rc) return 0;
      const r = Math.floor((d - rc) / w) + 1;
      if (r > geom.FIELD) return null;
      let ang = Math.atan2(dy, dx) + Math.PI / 2 + segA / 2;
      ang = ((ang % TAU) + TAU) % TAU;
      return geom.cellId(r, Math.floor(ang / segA));
    };
    return { W, H, cx, cy, rc, w, segA, a0, rIn, rOut, center, cellAt };
  }

  function fitCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function sector(ctx, L, r, s) {
    ctx.beginPath();
    ctx.arc(L.cx, L.cy, L.rOut(r), L.a0(s), L.a0(s) + L.segA);
    ctx.arc(L.cx, L.cy, L.rIn(r), L.a0(s) + L.segA, L.a0(s), true);
    ctx.closePath();
  }

  function draw(canvas, view, opts) {
    opts = opts || {};
    if (canvas.clientWidth < 40 || canvas.clientHeight < 40) return null; // hidden or collapsed
    const ctx = fitCanvas(canvas);
    const { geom, belief, visible, turn } = view;
    const P = palette();
    const L = layout(canvas, geom);
    ctx.clearRect(0, 0, L.W, L.H);

    const isVisible = (c) => view.truth || (visible && visible.has(c));
    const wasSeen = (c) => view.truth || belief.cellSeen[c] >= 0;

    // Cells
    for (let r = 1; r <= geom.FIELD; r++) {
      for (let s = 0; s < geom.S; s++) {
        const c = geom.cellId(r, s);
        const isField = r === geom.FIELD;
        sector(ctx, L, r, s);
        ctx.fillStyle = isVisible(c) ? (isField ? P.fieldLit : P.lit) : wasSeen(c) ? (isField ? P.field : P.seen) : P.fog;
        ctx.fill();
      }
    }
    // Core
    ctx.beginPath();
    ctx.arc(L.cx, L.cy, L.rc, 0, TAU);
    ctx.fillStyle = isVisible(0) ? P.core : wasSeen(0) ? P.seen : P.fog;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = P.core;
    ctx.stroke();

    // Hover / legal moves
    if (opts.legal) {
      for (const m of opts.legal) {
        const c = m.to;
        ctx.save();
        if (c === 0) { ctx.beginPath(); ctx.arc(L.cx, L.cy, L.rc - 2, 0, TAU); }
        else sector(ctx, L, geom.ringOf(c), geom.segOf(c));
        ctx.globalAlpha = c === opts.hover ? 0.45 : 0.16;
        ctx.fillStyle = m.breakthrough ? P.enemy : P.legal;
        ctx.fill();
        ctx.restore();
      }
    }

    // Walls and gates
    for (let k = 0; k <= geom.R; k++) {
      const rad = L.rOut(k);
      for (let s = 0; s < geom.S; s++) {
        const g = belief.gate[k][s];
        const start = L.a0(s), end = start + L.segA;
        const age = belief.seen[k][s] >= 0 ? turn - belief.seen[k][s] : null;
        ctx.save();
        ctx.beginPath();
        ctx.arc(L.cx, L.cy, rad, start + 0.004, end - 0.004);
        if (g === -1) {
          ctx.setLineDash([2, 5]);
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = P.wallUnknown;
          ctx.stroke();
        } else if (g === 0) {
          ctx.lineWidth = k === geom.R ? 5 : 4;
          ctx.strokeStyle = P.wall;
          ctx.globalAlpha = view.truth || age === 0 ? 1 : 0.55;
          ctx.stroke();
        } else {
          const sealed = k === geom.R && belief.sealed[s];
          ctx.lineWidth = 2;
          ctx.strokeStyle = sealed ? P.sealed : P.gate;
          ctx.setLineDash(sealed ? [] : [3, 4]);
          ctx.globalAlpha = view.truth || age === 0 ? 1 : 0.5;
          ctx.stroke();
          // Gate posts
          for (const a of [start + 0.03, end - 0.03]) {
            ctx.beginPath();
            ctx.arc(L.cx + rad * Math.cos(a), L.cy + rad * Math.sin(a), sealed ? 3.5 : 2.6, 0, TAU);
            ctx.fillStyle = sealed ? P.sealed : P.gate;
            ctx.fill();
          }
          if (sealed) {
            const mid = (start + end) / 2, x = L.cx + rad * Math.cos(mid), y = L.cy + rad * Math.sin(mid);
            ctx.lineWidth = 2.5;
            ctx.setLineDash([]);
            ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5); ctx.stroke();
          }
        }
        ctx.restore();
      }
    }

    // Agents (as known to the viewer)
    const tokenR = Math.min(L.w, L.rIn(2) * L.segA) * 0.3;
    for (const [id, rec] of view.known) {
      if (rec.cell == null || id === 'player') continue;
      const p = L.center(rec.cell);
      const fresh = rec.age === 0;
      ctx.save();
      ctx.globalAlpha = fresh ? 1 : Math.max(0.18, 0.55 - rec.age * 0.08);
      const color = rec.kind === 'ally' ? P.ally : rec.kind === 'gatekeeper' ? P.gatekeeper : P.enemy;
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      if (!fresh) ctx.setLineDash([2, 3]);
      ctx.beginPath();
      if (rec.kind === 'gatekeeper') {
        ctx.moveTo(p.x, p.y - tokenR * 1.2); ctx.lineTo(p.x + tokenR * 1.2, p.y); ctx.lineTo(p.x, p.y + tokenR * 1.2); ctx.lineTo(p.x - tokenR * 1.2, p.y); ctx.closePath();
      } else if (rec.kind === 'sentinel') {
        ctx.rect(p.x - tokenR * 0.85, p.y - tokenR * 0.85, tokenR * 1.7, tokenR * 1.7);
      } else {
        ctx.arc(p.x, p.y, tokenR, 0, TAU);
      }
      if (fresh) ctx.fill(); else ctx.stroke();
      if (rec.kind === 'ally' && fresh) {
        ctx.fillStyle = P.bg;
        ctx.font = `600 ${Math.round(tokenR * 1.1)}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(id[0].toUpperCase(), p.x, p.y + 0.5);
      }
      ctx.restore();
    }

    // Player
    const pp = L.center(view.playerCell);
    ctx.save();
    ctx.beginPath();
    ctx.arc(pp.x, pp.y, tokenR * 1.15, 0, TAU);
    ctx.fillStyle = P.player;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = P.text;
    ctx.stroke();
    ctx.restore();

    return L;
  }

  K.Render = { draw, layout };
})();
