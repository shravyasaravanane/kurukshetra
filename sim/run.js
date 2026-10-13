#!/usr/bin/env node
/*
 * Headless experiment runner.
 *   node sim/run.js [--seeds 200] [--bots belief,oracle,random] [--out results]
 * Plays every bot under every condition on the same seeds and writes
 * one row per game to <out>/sim-games.csv plus a summary table to stdout.
 */
const fs = require('fs');
const path = require('path');
const K = require('./load');

const args = process.argv.slice(2);
const arg = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; };
const SEEDS = parseInt(arg('seeds', '200'), 10);
const BOTS = arg('bots', 'belief,oracle,random').split(',');
const OUT = path.resolve(arg('out', path.join(__dirname, '..', 'results')));

const conditions = [];
for (const infoLevel of ['low', 'medium', 'high'])
  for (const allyComms of [false, true])
    for (const enemyComms of [false, true]) conditions.push({ infoLevel, allyComms, enemyComms });

const rows = [];
const t0 = Date.now();
for (const bot of BOTS) {
  for (const c of conditions) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const game = K.createGame(Object.assign({ seed }, c));
      const s = K.playBot(game, bot);
      rows.push(Object.assign({ bot, seed, infoLevel: c.infoLevel, allyComms: c.allyComms, enemyComms: c.enemyComms }, s));
    }
  }
}

fs.mkdirSync(OUT, { recursive: true });
const cols = ['bot', 'seed', 'infoLevel', 'allyComms', 'enemyComms', 'result', 'category', 'turns', 'coreReached', 'coreTurn', 'resolve', 'score',
  'moves', 'optimal', 'infoErrors', 'decisionErrors', 'forced', 'waits', 'scouts', 'signals', 'optimalRate', 'meanKnownFrac', 'meanStaleFrac',
  'totalDrain', 'coverEvents', 'gatesSealed', 'rotations', 'breachTurn'];
const csv = [cols.join(',')].concat(rows.map((r) => cols.map((c) => (r[c] == null ? '' : r[c])).join(','))).join('\n');
fs.writeFileSync(path.join(OUT, 'sim-games.csv'), csv);

// Summary
const pct = (x) => (100 * x).toFixed(0).padStart(3) + '%';
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
console.log(`\n${rows.length} games, ${SEEDS} seeds per cell, ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
console.log('bot     info    allies  kaurava |  win  core  exhst encir seal  tmout | score  turns optimal infoErr decErr');
for (const bot of BOTS) {
  for (const c of conditions) {
    const g = rows.filter((r) => r.bot === bot && r.infoLevel === c.infoLevel && r.allyComms === c.allyComms && r.enemyComms === c.enemyComms);
    const rate = (f) => pct(g.filter(f).length / g.length);
    const mv = g.reduce((a, r) => a + r.moves, 0) || 1;
    console.log(
      `${bot.padEnd(7)} ${c.infoLevel.padEnd(7)} ${(c.allyComms ? 'on' : 'off').padEnd(7)} ${(c.enemyComms ? 'on' : 'off').padEnd(7)} | ` +
      `${rate((r) => r.result === 'escaped')} ${rate((r) => r.coreReached)}  ${rate((r) => r.result === 'exhausted')}  ${rate((r) => r.result === 'encircled')} ${rate((r) => r.result === 'sealed-in' || r.result === 'sealed-out')}  ${rate((r) => r.result === 'timeout')} | ` +
      `${mean(g.map((r) => r.score)).toFixed(0).padStart(5)} ${mean(g.map((r) => r.turns)).toFixed(1).padStart(6)}  ` +
      `${pct(g.reduce((a, r) => a + r.optimal, 0) / mv)}    ${pct(g.reduce((a, r) => a + r.infoErrors, 0) / mv)}   ${pct(g.reduce((a, r) => a + r.decisionErrors, 0) / mv)}`);
  }
}
console.log(`\nWrote ${path.join(OUT, 'sim-games.csv')}`);
if (!args.includes('--no-report')) {
  require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'report.js'), '--out', OUT], { stdio: 'inherit' });
}
