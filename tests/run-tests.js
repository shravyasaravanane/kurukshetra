#!/usr/bin/env node
// Engine tests. Run: node tests/run-tests.js
const assert = require('assert');
const K = require('../sim/load');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const fresh = (opts) => K.createGame(Object.assign({ seed: 7, infoLevel: 'medium', allyComms: true, enemyComms: true }, opts || {}));

// ---------- geometry ----------
test('every link is symmetric', () => {
  const G = K.makeGeometry(7, 12);
  for (let a = 0; a < G.N; a++) for (const l of G.links[a]) {
    assert.ok(G.links[l.to].some((b) => b.to === a && b.wall === l.wall && b.seg === l.seg), `link ${a}->${l.to}`);
  }
});

test('cell ids round-trip through ring and segment', () => {
  const G = K.makeGeometry(7, 12);
  for (let r = 1; r <= G.FIELD; r++) for (let s = 0; s < G.S; s++) {
    const id = G.cellId(r, s);
    assert.strictEqual(G.ringOf(id), r);
    assert.strictEqual(G.segOf(id), s);
  }
  assert.strictEqual(G.ringOf(0), 0);
});

// ---------- formation ----------
test('rotation preserves the number of gates', () => {
  const G = K.makeGeometry(7, 12);
  const f = K.generateFormation(G, K.makeRng(3), K.DEFAULT_CONFIG);
  const count = (k) => f.gates[k].reduce((a, b) => a + b, 0);
  const before = f.gates.map((_, k) => count(k));
  for (let k = 0; k < G.R; k++) K.rotateWall(f, k, 1);
  assert.deepStrictEqual(f.gates.map((_, k) => count(k)), before);
});

test('every generated formation has a route to the core', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const g = fresh({ seed });
    const st = g.state;
    const d = K.distanceField(st.geom, [0], K.trueCost(st.geom, st.formation, 'pandava'));
    assert.ok(d[st.player.cell] < Infinity, 'seed ' + seed);
  }
});

test('the same seed gives the same formation under every condition', () => {
  const a = fresh({ seed: 42, infoLevel: 'low', allyComms: false, enemyComms: false }).state.formation;
  const b = fresh({ seed: 42, infoLevel: 'high', allyComms: true, enemyComms: true }).state.formation;
  assert.deepStrictEqual(a.gates.map((g) => Array.from(g)), b.gates.map((g) => Array.from(g)));
});

// ---------- information ----------
test('high information means the belief always matches the truth', () => {
  const g = fresh({ infoLevel: 'high' });
  for (let i = 0; i < 25 && !g.over; i++) {
    g.step({ type: 'wait' });
    const q = K.beliefQuality(g.state.geom, g.state.player.belief, g.state.formation);
    assert.strictEqual(q.knownFrac, 1);
    assert.strictEqual(q.staleFrac, 0);
  }
});

test('medium information goes stale once the formation turns', () => {
  const g = fresh({ infoLevel: 'medium', allyComms: false });
  const q0 = K.beliefQuality(g.state.geom, g.state.player.belief, g.state.formation);
  assert.strictEqual(q0.knownFrac, 1);
  assert.strictEqual(q0.staleFrac, 0);
  for (let i = 0; i < g.state.cfg.rotationPeriod; i++) g.step({ type: 'wait' });
  const q1 = K.beliefQuality(g.state.geom, g.state.player.belief, g.state.formation);
  assert.ok(q1.staleFrac > 0, 'expected stale beliefs after a rotation');
});

test('low information starts with nothing known beyond sight', () => {
  const g = fresh({ infoLevel: 'low', allyComms: false });
  const q = K.beliefQuality(g.state.geom, g.state.player.belief, g.state.formation);
  assert.ok(q.knownFrac < 0.1, 'knownFrac ' + q.knownFrac);
});

test('scouting widens the view for one turn', () => {
  const g = fresh({ infoLevel: 'low', allyComms: false });
  g.step({ type: 'wait' });
  const normal = g.state.player.visible.size;
  g.step({ type: 'scout' });
  const scouted = g.state.player.visible.size;
  g.step({ type: 'wait' });
  assert.ok(scouted > normal);
  assert.strictEqual(g.state.player.visible.size, normal);
});

test('shared map: with coordination the player learns what allies see', () => {
  const a = fresh({ seed: 9, infoLevel: 'low', allyComms: false });
  const b = fresh({ seed: 9, infoLevel: 'low', allyComms: true });
  for (let i = 0; i < 8; i++) { a.step({ type: 'wait' }); b.step({ type: 'wait' }); }
  const qa = K.beliefQuality(a.state.geom, a.state.player.belief, a.state.formation);
  const qb = K.beliefQuality(b.state.geom, b.state.player.belief, b.state.formation);
  assert.ok(qb.knownFrac > qa.knownFrac, `${qb.knownFrac} vs ${qa.knownFrac}`);
});

// ---------- rules ----------
test('the player cannot walk through a closed wall', () => {
  const g = fresh();
  const st = g.state, G = st.geom;
  const closed = st.cfg.outerGates.includes(0) ? null : G.cellId(G.R, 0); // field seg 0 has no gate
  assert.ok(closed !== null);
  assert.ok(!g.legalMoves().some((m) => m.to === closed));
  g.step({ type: 'move', to: closed });
  assert.strictEqual(st.player.cell, G.cellId(G.FIELD, 0));
  assert.strictEqual(st.log[0].moveClass, 'invalid');
});

test('breaching through an outer gate is detected', () => {
  const g = fresh();
  const G = g.state.geom;
  g.step({ type: 'move', to: G.cellId(G.FIELD, 1) }); // may swap with an ally
  g.step({ type: 'move', to: G.cellId(G.R, 1) });
  assert.ok(g.state.player.breached);
  assert.strictEqual(g.state.player.entrySeg, 1);
});

test('the gatekeeper seals an unheld gate after a full turn on it', () => {
  const g = fresh({ allyComms: false });
  const st = g.state, G = st.geom;
  st.player.breached = true;
  st.allies.forEach((a, i) => { a.cell = G.cellId(G.FIELD, 6 + i); a.mode = 'idle-test'; });
  st.gatekeeper.cell = G.cellId(G.R, 5);
  st.sentinels.forEach((s) => { s.cell = G.cellId(2, s.cell % 12); });
  K.gatekeeperAct(st);
  assert.strictEqual(st.formation.sealed[5], 0, 'not sealed on the first turn');
  K.gatekeeperAct(st);
  assert.strictEqual(st.formation.sealed[5], 1, 'sealed on the second turn');
});

test('an ally holding a gate prevents sealing', () => {
  const g = fresh({ allyComms: false });
  const st = g.state, G = st.geom;
  st.player.breached = true;
  st.allies[0].cell = G.cellId(G.FIELD, 5);
  st.gatekeeper.cell = G.cellId(G.R, 5);
  K.gatekeeperAct(st); K.gatekeeperAct(st); K.gatekeeperAct(st);
  assert.strictEqual(st.formation.sealed[5], 0);
});

test('pandavas cannot pass a sealed gate', () => {
  const g = fresh();
  const st = g.state, G = st.geom;
  st.formation.sealed[1] = 1;
  st.player.cell = G.cellId(G.FIELD, 1);
  st.allies.forEach((a, i) => { a.cell = G.cellId(G.FIELD, 6 + i); });
  assert.ok(!g.legalMoves().some((m) => m.to === G.cellId(G.R, 1)));
});

test('an adjacent ally cancels sentinel pressure', () => {
  const setup = (withCover) => {
    const g = fresh({ allyComms: true, enemyComms: false });
    const st = g.state, G = st.geom;
    st.player.cell = G.cellId(3, 4);
    st.sentinels.forEach((s, i) => { s.cell = G.cellId(1, 2 * i); });
    st.sentinels[0].cell = G.cellId(3, 5);
    st.sentinels[0].lastSeen = { cell: st.player.cell, turn: 0 }; // it has already spotted the player
    st.allies.forEach((a, i) => { a.cell = G.cellId(G.FIELD, 8 + i); a.mode = 'hold'; a.holdSeg = 9; });
    if (withCover) { st.allies[0].cell = G.cellId(3, 3); st.allies[0].mode = 'follow'; }
    g.state.kauravaIntel = null;
    g.step({ type: 'wait' });
    return st.log[0];
  };
  const bare = setup(false), covered = setup(true);
  assert.ok(bare.pressing >= 1 && bare.drain >= 1, 'expected pressure without cover');
  assert.ok(covered.cover >= 1, 'expected cover');
  assert.ok(covered.drain < bare.drain, `drain ${covered.drain} vs ${bare.drain}`);
});

test('drain is never negative and resolve never rises', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const g = fresh({ seed });
    let last = g.state.player.resolve;
    K.playBot(g, 'random');
    for (const r of g.state.log) { assert.ok(r.drain >= 0); assert.ok(r.resolve <= last); last = r.resolve; }
  }
});

// ---------- determinism & logging ----------
test('a seed plus the same actions reproduces the game exactly', () => {
  const a = fresh({ seed: 11 }), b = fresh({ seed: 11 });
  K.playBot(a, 'belief');
  const actions = a.state.log.map((r) => (r.action === 'move' ? { type: 'move', to: r.to, signal: r.signal } : { type: r.action, signal: r.signal }));
  for (const act of actions) b.step(act);
  assert.deepStrictEqual(b.summary(), a.summary());
});

test('every game ends within the turn limit', () => {
  for (const bot of ['belief', 'oracle', 'random']) for (let seed = 1; seed <= 15; seed++) {
    const g = fresh({ seed });
    const s = K.playBot(g, bot);
    assert.ok(g.over);
    assert.ok(s.turns <= g.state.cfg.turnLimit);
  }
});

test('move classes add up to the number of moves', () => {
  const g = fresh({ seed: 5 });
  const s = K.playBot(g, 'belief');
  assert.strictEqual(s.optimal + s.infoErrors + s.decisionErrors + s.forced + g.state.log.filter((r) => r.moveClass === 'no-route').length, s.moves);
});

test('high information produces no information errors', () => {
  for (let seed = 1; seed <= 15; seed++) {
    const g = fresh({ seed, infoLevel: 'high' });
    assert.strictEqual(K.playBot(g, 'belief').infoErrors, 0);
  }
});

test('session records survive a JSON round trip and CSV export', () => {
  const g = fresh({ seed: 3 });
  K.playBot(g, 'belief');
  const s = K.Logger.buildSession(g, { mode: 'bot' });
  const back = K.Logger.parseImport(JSON.stringify([s]));
  assert.strictEqual(back.length, 1);
  assert.strictEqual(back[0].summary.score, s.summary.score);
  const csv = K.Logger.summaryCsv(back).split('\n');
  assert.strictEqual(csv.length, 2);
  const turns = K.Logger.turnsCsv(back).split('\n');
  assert.strictEqual(turns.length, 1 + s.turns.length);
});

test('stats aggregate by condition', () => {
  const sessions = [];
  for (const infoLevel of ['low', 'high']) for (let seed = 1; seed <= 4; seed++) {
    const g = fresh({ seed, infoLevel, allyComms: true, enemyComms: true });
    K.playBot(g, 'belief');
    sessions.push(K.Logger.buildSession(g, { mode: 'bot' }));
  }
  const rows = K.Stats.byCondition(sessions);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].n + rows[1].n, 8);
  const q = K.Stats.qualityByInfo(sessions).find((r) => r.infoLevel === 'high');
  assert.strictEqual(q.info, 0);
});

// ---------- tutorial levels ----------
test('every tutorial level can be won on its own seed', () => {
  for (const L of K.LEVELS) for (const bot of ['belief', 'oracle']) {
    const g = K.createGame(Object.assign({}, L.cond, { config: L.config }));
    const s = K.playBot(g, bot);
    assert.strictEqual(s.category, 'win', `level ${L.id} (${bot}): ${s.result}`);
  }
});

test('a core-goal level ends the moment the core is reached', () => {
  const L = K.LEVELS[0];
  const g = K.createGame(Object.assign({}, L.cond, { config: L.config }));
  const s = K.playBot(g, 'oracle');
  assert.strictEqual(s.result, 'completed');
  assert.strictEqual(g.state.player.cell, 0);
  assert.strictEqual(g.state.gatekeeper.cell, null);
  assert.strictEqual(g.state.allies.length, 0);
});

// ---------- Krishna's counsel ----------
test('scripted counsel is deterministic per seed and turn', () => {
  const a = fresh({ seed: 12, advisor: 'unreliable' }), b = fresh({ seed: 12, advisor: 'unreliable' });
  for (let i = 0; i < 10; i++) {
    const x = K.Advisor.scripted(a.state), y = K.Advisor.scripted(b.state);
    assert.deepStrictEqual(x, y);
    const m = K.Bots.belief(a.state, {});
    a.step(m, { advice: x }); b.step(m, { advice: y });
  }
});

test('counsel reliability matches its condition (about 90% vs 60% good)', () => {
  const rate = (advisor) => {
    let good = 0, n = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const s = K.playBot(fresh({ seed, advisor }), 'belief');
      good += s.adviceGood; n += s.adviceGiven;
    }
    return good / n;
  };
  const r = rate('reliable'), u = rate('unreliable');
  assert.ok(r > 0.82 && r < 0.97, 'reliable ' + r);
  assert.ok(u > 0.5 && u < 0.72, 'unreliable ' + u);
});

test('reliance metrics add up and a truster follows every piece of counsel', () => {
  const s = K.playBot(fresh({ seed: 4, advisor: 'unreliable' }), 'truster');
  assert.ok(s.adviceGiven > 0);
  assert.strictEqual(s.adviceGood + s.adviceBad, s.adviceGiven);
  assert.strictEqual(s.followedGood + s.ignoredGood, s.adviceGood);
  assert.strictEqual(s.followedBad + s.ignoredBad, s.adviceBad);
  assert.strictEqual(s.followRate, 1);
  const none = K.playBot(fresh({ seed: 4, advisor: 'none' }), 'truster');
  assert.strictEqual(none.adviceGiven, 0);
});

test('Krishna\'s tools only reveal what the player knows', () => {
  const g = fresh({ seed: 8, infoLevel: 'low', allyComms: false });
  const st = g.state, G = st.geom;
  const map = K.Krishna.runTool(st, 'get_known_map', {});
  for (let k = 0; k < G.R; k++) {
    const listed = map.walls[k].gatesBelievedOpen.map((x) => x.segment).sort();
    const believed = []; for (let s = 0; s < G.S; s++) if (st.player.belief.gate[k][s] === 1) believed.push(s);
    assert.deepStrictEqual(listed, believed.sort(), 'wall ' + k);
  }
  const sit = K.Krishna.runTool(st, 'get_situation', {});
  for (const a of sit.knownAgents) assert.ok(st.player.belief.agents.has(a.id) || a.seen === 'reported now', 'agent ' + a.id + ' is known to the player');
  const legal = K.Krishna.runTool(st, 'get_legal_moves', {}).moves.map((m) => m.cell).sort();
  assert.deepStrictEqual(legal, g.legalMoves().map((m) => m.to).sort());
});

test('Krishna\'s agent loop runs tools, rejects an illegal move and returns legal counsel (mock client)', async () => {
  const g = fresh({ seed: 3, advisor: 'llm' });
  const legal = g.legalMoves().map((m) => m.to);
  const calls = [];
  const scripted = [
    { stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 5 }, content: [
      { type: 'tool_use', id: 't1', name: 'get_situation', input: {} },
      { type: 'tool_use', id: 't2', name: 'get_legal_moves', input: {} }] },
    { stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 5 }, content: [
      { type: 'tool_use', id: 't3', name: 'give_advice', input: { move_to: 9999, explanation: 'x', confidence: 'low' } }] },
    { stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 5 }, content: [
      { type: 'tool_use', id: 't4', name: 'give_advice', input: { move_to: legal[0], explanation: 'Take the gate.', confidence: 'medium' } }] },
  ];
  const client = { beta: { messages: { create: async (p) => { calls.push(JSON.parse(JSON.stringify(p))); return scripted[calls.length - 1]; } } } };
  const res = await K.Krishna.advise(client, g.state, { model: 'claude-opus-5-5' });
  assert.strictEqual(res.to, legal[0]);
  assert.strictEqual(calls.length, 3);
  assert.strictEqual(calls[0].model, 'claude-opus-5-5');
  assert.deepStrictEqual(calls[0].betas, ['server-side-fallback-2026-07-01']);
  assert.strictEqual(calls[0].fallbacks, 'default');
  const second = calls[1].messages;
  const results = second[second.length - 1].content;
  assert.strictEqual(results.length, 2, 'both tool results returned in one user message');
  assert.ok(results.every((r) => r.type === 'tool_result'));
  const third = calls[2].messages;
  assert.strictEqual(third[third.length - 1].content[0].is_error, true, 'illegal move is reported back as an error');
  assert.strictEqual(res.usage.input_tokens, 30);
});

test('Krishna reports a refusal instead of advising', async () => {
  const g = fresh({ seed: 3 });
  const client = { beta: { messages: { create: async () => ({ stop_reason: 'refusal', usage: {}, content: [] }) } } };
  const res = await K.Krishna.advise(client, g.state, {});
  assert.ok(res.error && /refusal/.test(res.error));
});

test("Krishna's insight only uses the player's knowledge, explains its basis, and is deterministic", () => {
  for (const infoLevel of ['low', 'medium']) {
    const g = fresh({ seed: 6, infoLevel, advisor: 'planner' });
    for (let i = 0; i < 15 && !g.over; i++) {
      const adv = K.Advisor.scripted(g.state);
      if (adv) {
        const ev = K.Advisor.evaluate(g.state, adv.to);
        assert.ok(ev.legal && ev.beliefOptimal, "counsel follows the player's own map");
        assert.ok(/By what you know/.test(adv.text));
        assert.deepStrictEqual(K.Advisor.scripted(g.state), adv, 'same state, same counsel');
      }
      g.step(K.Bots.belief(g.state, {}), { advice: adv });
    }
  }
  // Same knowledge, different truth: insight must not change when only hidden gates differ.
  const g = fresh({ seed: 6, infoLevel: 'low', advisor: 'planner' });
  const before = K.Advisor.scripted(g.state);
  const hidden = [];
  for (let s = 0; s < g.state.geom.S; s++) if (g.state.player.belief.gate[1][s] === -1) hidden.push(s);
  K.rotateWall(g.state.formation, 1, 1); // change the truth on a wall the player has never seen
  const after = K.Advisor.scripted(g.state);
  if (hidden.length === g.state.geom.S) assert.deepStrictEqual(after, before);
});

// ---------- statistics ----------
test('Wilson interval matches a known value and stays inside [0, 1]', () => {
  const [lo, hi] = K.Stats.wilson(5, 10);
  assert.ok(Math.abs(lo - 0.2366) < 1e-3 && Math.abs(hi - 0.7634) < 1e-3, `${lo} ${hi}`);
  const [z0, z1] = K.Stats.wilson(0, 20);
  assert.strictEqual(z0, 0);
  assert.ok(z1 > 0 && z1 < 0.2);
  assert.strictEqual(K.Stats.wilson(0, 0), null);
});

test('normal CDF and two-proportion z-test behave sensibly', () => {
  assert.ok(Math.abs(K.Stats.normalCdf(1.96) - 0.975) < 1e-3);
  assert.ok(Math.abs(K.Stats.normalCdf(0) - 0.5) < 1e-6);
  const same = K.Stats.twoProportion(50, 100, 50, 100);
  assert.ok(Math.abs(same.z) < 1e-9 && same.p > 0.99);
  const diff = K.Stats.twoProportion(20, 100, 60, 100);
  assert.ok(diff.diff > 0.39 && diff.p < 0.001);
});

// ---------- run ----------
(async () => {
  let failed = 0;
  for (const t of tests) {
    try { await t.fn(); console.log('  ok   ' + t.name); }
    catch (e) { failed++; console.log('  FAIL ' + t.name + '\n       ' + (e && e.message)); }
  }
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
