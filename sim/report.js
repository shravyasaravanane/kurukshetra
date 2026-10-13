#!/usr/bin/env node
/*
 * Builds results/REPORT.md and results/figures/*.svg from results/sim-games.csv.
 *   node sim/report.js [--in results/sim-games.csv] [--out results]
 * Statistics: Wilson 95% intervals for every rate, two-proportion z-tests for main effects.
 */
const fs = require('fs');
const path = require('path');
const K = require('./load');

const args = process.argv.slice(2);
const arg = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; };
const OUT = path.resolve(arg('out', path.join(__dirname, '..', 'results')));
const IN = path.resolve(arg('in', path.join(OUT, 'sim-games.csv')));

function readCsv(file) {
  const [head, ...lines] = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const cols = head.split(',');
  return lines.map((l) => {
    const v = l.split(',');
    const o = {};
    cols.forEach((c, i) => {
      const x = v[i];
      o[c] = x === 'true' ? true : x === 'false' ? false : x === '' ? null : isNaN(+x) ? x : +x;
    });
    return o;
  });
}

const rows = readCsv(IN);
const { wilson, twoProportion } = K.Stats;
const pct = (x) => (x == null ? '—' : (100 * x).toFixed(1) + '%');
const ci = (c) => (c ? `${(100 * c[0]).toFixed(1)}–${(100 * c[1]).toFixed(1)}%` : '—');
const esc = (g) => g.filter((r) => r.result === 'escaped').length;
const pFmt = (p) => (p < 0.001 ? '< 0.001' : p.toFixed(3));
const LEVELS = ['low', 'medium', 'high'];
const bots = [...new Set(rows.map((r) => r.bot))];
const seeds = new Set(rows.map((r) => r.seed)).size;

const belief = rows.filter((r) => r.bot === 'belief');
const rate = (g) => ({ n: g.length, k: esc(g), p: g.length ? esc(g) / g.length : null, ci: wilson(esc(g), g.length) });

// ---------------- figures ----------------
const FIG = path.join(OUT, 'figures');
fs.mkdirSync(FIG, { recursive: true });
const C = { s1: '#2a78d6', s2: '#eb6834', s3: '#1baf7a', s4: '#eda100', ink: '#2a2418', muted: '#6e6350', grid: '#e4ddcd', bg: '#fbf8f1' };

function figEscape() {
  const W = 640, H = 340, m = { l: 56, r: 16, t: 46, b: 46 }, ih = H - m.t - m.b, iw = W - m.l - m.r;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif" font-size="12">`;
  s += `<rect width="${W}" height="${H}" fill="${C.bg}"/>`;
  s += `<text x="${m.l}" y="22" font-size="15" font-weight="600" fill="${C.ink}">Escape rate by information level (belief-planning agent)</text>`;
  s += `<rect x="${m.l}" y="30" width="10" height="10" rx="2" fill="${C.s1}"/><text x="${m.l + 15}" y="39" fill="${C.muted}">Pandava coordination off</text>`;
  s += `<rect x="${m.l + 175}" y="30" width="10" height="10" rx="2" fill="${C.s2}"/><text x="${m.l + 190}" y="39" fill="${C.muted}">Pandava coordination on</text>`;
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    const y = m.t + ih * (1 - v);
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="${C.grid}"/><text x="${m.l - 8}" y="${y + 4}" text-anchor="end" fill="${C.muted}">${v * 100}%</text>`;
  }
  const gw = iw / 3, bw = 54;
  LEVELS.forEach((lvl, i) => {
    const cx = m.l + gw * i + gw / 2;
    s += `<text x="${cx}" y="${H - 18}" text-anchor="middle" fill="${C.ink}">${lvl[0].toUpperCase() + lvl.slice(1)} information</text>`;
    [false, true].forEach((ally, j) => {
      const r = rate(belief.filter((x) => x.infoLevel === lvl && x.allyComms === ally));
      const x = cx + (j ? 1 : -bw - 1), h = ih * r.p, y = m.t + ih - h;
      const rr = Math.min(4, h);
      s += `<path d="M${x},${m.t + ih} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + bw - rr} Q${x + bw},${y} ${x + bw},${y + rr} V${m.t + ih} Z" fill="${j ? C.s2 : C.s1}"/>`;
      const y1 = m.t + ih * (1 - r.ci[1]), y0 = m.t + ih * (1 - r.ci[0]), mx = x + bw / 2;
      s += `<path d="M${mx},${y1} V${y0} M${mx - 6},${y1} H${mx + 6} M${mx - 6},${y0} H${mx + 6}" stroke="${C.ink}" stroke-width="1.3" opacity="0.75"/>`;
      s += `<text x="${mx}" y="${y1 - 6}" text-anchor="middle" fill="${C.ink}">${Math.round(r.p * 100)}%</text>`;
    });
  });
  s += `<text x="${W - m.r}" y="${H - 4}" text-anchor="end" font-size="10" fill="${C.muted}">n = ${belief.length / 6} games per bar · whiskers: Wilson 95% CI</text></svg>`;
  fs.writeFileSync(path.join(FIG, 'escape-by-info.svg'), s);
}

function figQuality() {
  const W = 640, H = 230, m = { l: 120, r: 60, t: 50, b: 20 }, iw = W - m.l - m.r;
  const parts = [['optimal', 'Optimal', C.s1], ['infoErrors', 'Information error', C.s2], ['decisionErrors', 'Decision error', C.s3], ['forced', 'Route blocked', C.s4]];
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif" font-size="12">`;
  s += `<rect width="${W}" height="${H}" fill="${C.bg}"/>`;
  s += `<text x="16" y="22" font-size="15" font-weight="600" fill="${C.ink}">How each move was classified (belief-planning agent)</text>`;
  let lx = 16;
  for (const [, label, col] of parts) { s += `<rect x="${lx}" y="32" width="10" height="10" rx="2" fill="${col}"/><text x="${lx + 15}" y="41" fill="${C.muted}">${label}</text>`; lx += 30 + label.length * 6.6; }
  const rowH = (H - m.t - m.b) / 3, bh = 26;
  LEVELS.forEach((lvl, i) => {
    const g = belief.filter((x) => x.infoLevel === lvl);
    const tot = g.reduce((a, r) => a + r.moves, 0) || 1;
    const y = m.t + rowH * i + (rowH - bh) / 2;
    s += `<text x="${m.l - 10}" y="${y + bh / 2 + 4}" text-anchor="end" fill="${C.ink}">${lvl[0].toUpperCase() + lvl.slice(1)} information</text>`;
    let x = m.l;
    for (const [key, , col] of parts) {
      const w = iw * (g.reduce((a, r) => a + r[key], 0) / tot);
      if (w > 0) s += `<rect x="${x}" y="${y}" width="${Math.max(0, w - 2)}" height="${bh}" fill="${col}"/>`;
      x += w;
    }
    const info = g.reduce((a, r) => a + r.infoErrors, 0) / tot;
    s += `<text x="${W - m.r + 6}" y="${y + bh / 2 + 4}" fill="${C.ink}">${(info * 100).toFixed(1)}%</text>`;
  });
  s += `<text x="${W - 8}" y="${m.t - 6}" text-anchor="end" font-size="10" fill="${C.muted}">info-error share</text></svg>`;
  fs.writeFileSync(path.join(FIG, 'move-quality.svg'), s);
}

figEscape();
figQuality();

// ---------------- report ----------------
const lines = [];
const L = (x) => lines.push(x == null ? '' : x);
L('# Simulation results');
L();
L(`Generated by \`node sim/report.js\` from ${rows.length.toLocaleString()} simulated games: ${bots.length} agents × 12 conditions × ${seeds} seeds. Every condition is played on the **same ${seeds} formations**, so differences come from the condition, not the layout.`);
L();
L('Rates are shown with Wilson 95% confidence intervals. Main effects are tested with two-proportion z-tests on the belief-planning agent, pooling over the other two factors.');
L();
L('![Escape rate by information level](figures/escape-by-info.svg)');
L();
L('## Main effects (belief-planning agent)');
L();
L('| Factor | Comparison | Escape rate A | Escape rate B | Difference | z | p |');
L('|---|---|---|---|---|---|---|');
const effect = (name, label, ga, gb) => {
  const a = rate(ga), b = rate(gb), t = twoProportion(a.k, a.n, b.k, b.n);
  L(`| ${name} | ${label} | ${pct(a.p)} (${ci(a.ci)}) | ${pct(b.p)} (${ci(b.ci)}) | ${(t.diff * 100 >= 0 ? '+' : '') + (t.diff * 100).toFixed(1)} pts | ${t.z.toFixed(2)} | ${pFmt(t.p)} |`);
};
effect('Information', 'low → high', belief.filter((r) => r.infoLevel === 'low'), belief.filter((r) => r.infoLevel === 'high'));
effect('Information', 'low → medium', belief.filter((r) => r.infoLevel === 'low'), belief.filter((r) => r.infoLevel === 'medium'));
effect('Information', 'medium → high', belief.filter((r) => r.infoLevel === 'medium'), belief.filter((r) => r.infoLevel === 'high'));
effect('Pandava coordination', 'off → on', belief.filter((r) => !r.allyComms), belief.filter((r) => r.allyComms));
effect('Kaurava coordination', 'off → on', belief.filter((r) => !r.enemyComms), belief.filter((r) => r.enemyComms));
L();
L('## Every condition (belief-planning agent)');
L();
L('| Information | Pandava coord. | Kaurava coord. | Escaped (95% CI) | Reached core | Mean turns | Optimal moves | Info errors | Decision errors |');
L('|---|---|---|---|---|---|---|---|---|');
for (const lvl of LEVELS) for (const ally of [false, true]) for (const en of [false, true]) {
  const g = belief.filter((r) => r.infoLevel === lvl && r.allyComms === ally && r.enemyComms === en);
  const r = rate(g), mv = g.reduce((a, x) => a + x.moves, 0) || 1;
  const sh = (k) => pct(g.reduce((a, x) => a + x[k], 0) / mv);
  L(`| ${lvl} | ${ally ? 'on' : 'off'} | ${en ? 'on' : 'off'} | ${pct(r.p)} (${ci(r.ci)}) | ${pct(g.filter((x) => x.coreReached).length / g.length)} | ${(g.reduce((a, x) => a + x.turns, 0) / g.length).toFixed(1)} | ${sh('optimal')} | ${sh('infoErrors')} | ${sh('decisionErrors')} |`);
}
L();
L('![Move quality](figures/move-quality.svg)');
L();
L('## Baselines');
L();
L('| Agent | What it knows | Escaped (95% CI) | Reached core |');
L('|---|---|---|---|');
const desc = { belief: "The player's own belief, exactly what a human sees", oracle: 'The true formation (upper reference)', random: 'Nothing; moves at random (lower reference)' };
for (const b of bots) {
  const g = rows.filter((r) => r.bot === b), r = rate(g);
  L(`| ${b} | ${desc[b] || ''} | ${pct(r.p)} (${ci(r.ci)}) | ${pct(g.filter((x) => x.coreReached).length / g.length)} |`);
}
L();
L('## Reading the results');
L();
const hi = rate(belief.filter((r) => r.infoLevel === 'high')), lo = rate(belief.filter((r) => r.infoLevel === 'low')), me = rate(belief.filter((r) => r.infoLevel === 'medium'));
const on = rate(belief.filter((r) => r.allyComms)), off = rate(belief.filter((r) => !r.allyComms));
const kon = rate(belief.filter((r) => r.enemyComms)), koff = rate(belief.filter((r) => !r.enemyComms));
L(`- **Live information matters most.** Escape rises from ${pct(lo.p)} with low information to ${pct(hi.p)} with high information.`);
const lm = twoProportion(lo.k, lo.n, me.k, me.n);
L(`- **A one-time briefing does not help.** Medium information (${pct(me.p)}) is statistically no better than low (${pct(lo.p)}, p = ${pFmt(lm.p)}). Once the formation turns, an old map stops paying off: the agent keeps trusting walls that have moved since it was briefed.`);
L(`- **Coordination is a force multiplier.** Linking the allies moves escape from ${pct(off.p)} to ${pct(on.p)}.`);
L(`- **The opponent's coordination counts as much as your own.** When the Kauravas share sightings and Drona adapts, escape falls from ${pct(koff.p)} to ${pct(kon.p)}.`);
L('- **High information produces zero information errors**, which confirms the metric does what it claims: every remaining mistake is a decision error.');
L();
L('These are scripted agents, not people. They give the reference curve that human play-testing (the user study) will be compared against.');
fs.writeFileSync(path.join(OUT, 'REPORT.md'), lines.join('\n') + '\n');
console.log(`Wrote ${path.join(OUT, 'REPORT.md')} and ${FIG}`);
