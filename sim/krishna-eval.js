#!/usr/bin/env node
/*
 * Evaluate Krishna, the LLM advisor agent, against the truth.
 *
 *   node sim/krishna-eval.js --mock                 # exercise the whole pipeline, no API calls
 *   node sim/krishna-eval.js --yes [--seeds 3] [--max-turns 30] [--model claude-opus-5-5] [--effort low] [--mode advise|drive]
 *
 * advise: a belief-planning bot plays; every turn Krishna is asked for counsel, which is scored
 *         (good / shortest-path / consistent with the player's knowledge) without being followed.
 * drive:  Krishna's counsel is always followed, so the LLM effectively plays the game.
 *
 * Credentials: the Anthropic SDK resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN or an
 * `ant auth login` profile. Live runs spend real money, so they need --yes.
 * Writes results/KRISHNA_EVAL.md and a JSON trace in results/krishna/.
 */
const fs = require('fs');
const path = require('path');
const K = require('./load');

const args = process.argv.slice(2);
const arg = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; };
const has = (name) => args.includes('--' + name);
const MOCK = has('mock');
const SEEDS = parseInt(arg('seeds', MOCK ? '2' : '3'), 10);
const MAX_TURNS = parseInt(arg('max-turns', '30'), 10);
const MODEL = arg('model', K.Krishna.DEFAULT_MODEL);
const EFFORT = arg('effort', 'low');
const MODE = arg('mode', 'advise');
const OUT = path.resolve(arg('out', path.join(__dirname, '..', 'results')));
// Prices per million tokens (input, output) from the Claude API price list, for the cost estimate.
const PRICES = { 'claude-opus-5-5': [4, 20], 'claude-sonnet-5-5': [2, 10], 'claude-haiku-4-5': [1, 5], 'claude-fable-5-1': [10, 50] };

// A stand-in client: looks at the legal moves, plans a route, and advises the route's first step.
function mockClient() {
  return {
    beta: {
      messages: {
        async create(p) {
          const last = p.messages[p.messages.length - 1];
          const asked = p.messages.filter((m) => m.role === 'assistant').length;
          if (asked === 0) {
            return { stop_reason: 'tool_use', usage: { input_tokens: 1800, output_tokens: 60 }, content: [
              { type: 'tool_use', id: 'm1', name: 'get_legal_moves', input: {} },
              { type: 'tool_use', id: 'm2', name: 'plan_route', input: { target: 'goal' } }] };
          }
          const route = JSON.parse(last.content.find((r) => r.tool_use_id === 'm2').content);
          const moves = JSON.parse(last.content.find((r) => r.tool_use_id === 'm1').content).moves;
          const to = route.firstStep != null ? route.firstStep : moves[0].cell;
          return { stop_reason: 'tool_use', usage: { input_tokens: 2600, output_tokens: 80 }, content: [
            { type: 'tool_use', id: 'm3', name: 'give_advice', input: { move_to: to, explanation: 'Follow the shortest route you know.', confidence: 'medium' } }] };
        },
      },
    },
  };
}

function realClient() {
  let mod;
  try { mod = require('@anthropic-ai/sdk'); } catch (e) {
    console.log('The Anthropic SDK is not installed. Run: npm install');
    process.exit(0);
  }
  const Anthropic = mod.default || mod.Anthropic;
  return { client: new Anthropic(), Anthropic };
}

(async () => {
  if (!MOCK && !has('yes')) {
    const calls = SEEDS * MAX_TURNS;
    console.log(`This will ask ${MODEL} for counsel up to ${calls} times (${SEEDS} seeds x ${MAX_TURNS} turns, mode ${MODE}).`);
    console.log('Each counsel is one to a few API requests and costs real money. Re-run with --yes to proceed,');
    console.log('or with --mock to test the pipeline without the API.');
    process.exit(0);
  }
  let client, Anthropic = null;
  if (MOCK) client = mockClient(); else ({ client, Anthropic } = realClient());

  const t0 = Date.now();
  const traces = [];
  const tally = { asked: 0, answered: 0, errors: 0, good: 0, optimal: 0, consistent: 0, infoErr: 0, decisionErr: 0, latency: [], input: 0, output: 0, cacheRead: 0, steps: 0 };
  const games = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const game = K.createGame({ seed, infoLevel: 'medium', allyComms: true, enemyComms: true, advisor: 'llm', explain: true });
    const mem = {};
    for (let turn = 0; turn < MAX_TURNS && !game.over; turn++) {
      const st = game.state;
      tally.asked++;
      let res;
      try {
        res = await K.Krishna.advise(client, st, { model: MODEL, effort: EFFORT });
      } catch (e) {
        if (Anthropic && e instanceof Anthropic.AuthenticationError) {
          console.log('No valid credentials. Set ANTHROPIC_API_KEY (or run `ant auth login`) and try again.');
          process.exit(1);
        }
        if (Anthropic && e instanceof Anthropic.RateLimitError) { console.log('Rate limited; stopping early.'); break; }
        res = { error: e && e.message ? e.message : String(e) };
      }
      let advice = null, ev = null;
      if (res.error) tally.errors++;
      else {
        tally.answered++;
        ev = K.Advisor.evaluate(st, res.to);
        if (ev.good) tally.good++;
        if (ev.optimal) tally.optimal++;
        if (ev.beliefOptimal) tally.consistent++;
        if (!ev.good && ev.beliefOptimal) tally.infoErr++;      // right by the player's knowledge, wrong in truth
        if (!ev.good && !ev.beliefOptimal) tally.decisionErr++; // wrong even by the player's knowledge
        tally.latency.push(res.latencyMs);
        tally.steps += res.steps;
        advice = { to: res.to, source: 'llm', explained: true, text: res.text, latencyMs: res.latencyMs };
      }
      if (res.usage) { tally.input += res.usage.input_tokens || 0; tally.output += res.usage.output_tokens || 0; tally.cacheRead += res.usage.cache_read_input_tokens || 0; }
      traces.push({ seed, turn: st.turn, advice: res.error ? null : { to: res.to, text: res.text, confidence: res.confidence, steps: res.steps, latencyMs: res.latencyMs }, error: res.error || null, evaluation: ev, tools: res.trace });
      const action = MODE === 'drive' && advice ? { type: 'move', to: advice.to } : K.Bots.belief(st, mem);
      game.step(action, { advice });
    }
    const s = game.summary();
    games.push({ seed, result: s.result, turns: s.turns, followRate: s.followRate });
  }

  const pct = (k, n) => (n ? (100 * k / n).toFixed(1) + '%' : '—');
  const sorted = tally.latency.slice().sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  const price = PRICES[MODEL];
  const cost = price ? (tally.input * price[0] + tally.output * price[1]) / 1e6 : null;
  const L = [];
  L.push(`# Krishna (LLM advisor) evaluation${MOCK ? ' — MOCK RUN (no API calls)' : ''}`, '');
  L.push(`Model \`${MOCK ? 'mock' : MODEL}\`, effort \`${EFFORT}\`, mode \`${MODE}\`, ${SEEDS} seeds × up to ${MAX_TURNS} turns, medium information. Generated ${new Date().toISOString().slice(0, 10)}.`, '');
  L.push('| Metric | Value |', '|---|---|');
  L.push(`| Counsel requested / given | ${tally.asked} / ${tally.answered} (${tally.errors} errors) |`);
  L.push(`| Good counsel (expert-acceptable) | ${pct(tally.good, tally.answered)} |`);
  L.push(`| On a true shortest path | ${pct(tally.optimal, tally.answered)} |`);
  L.push(`| Consistent with the player's knowledge | ${pct(tally.consistent, tally.answered)} |`);
  L.push(`| Wrong because the player's information was wrong | ${pct(tally.infoErr, tally.answered)} |`);
  L.push(`| Wrong even by the player's information | ${pct(tally.decisionErr, tally.answered)} |`);
  L.push(`| Median latency per counsel | ${median == null ? '—' : (median / 1000).toFixed(1) + ' s'} |`);
  L.push(`| Average agent steps (API requests) per counsel | ${tally.answered ? (tally.steps / tally.answered).toFixed(1) : '—'} |`);
  L.push(`| Tokens in / out (cache reads) | ${tally.input} / ${tally.output} (${tally.cacheRead}) |`);
  L.push(`| Estimated cost | ${MOCK ? '$0 (mock)' : cost == null ? 'unknown for this model' : '$' + cost.toFixed(2)} |`);
  L.push('', 'Reference points on the same scale: the reliable messenger gives about 90% good counsel, the careless one about 62% (see COUNSEL.md).', '');
  L.push('| Seed | Result | Turns | Followed counsel |', '|---|---|---|---|');
  for (const g of games) L.push(`| ${g.seed} | ${g.result} | ${g.turns} | ${g.followRate == null ? '—' : Math.round(g.followRate * 100) + '%'} |`);
  fs.mkdirSync(path.join(OUT, 'krishna'), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(OUT, 'krishna', `trace-${MOCK ? 'mock-' : ''}${stamp}.json`), JSON.stringify({ model: MOCK ? 'mock' : MODEL, effort: EFFORT, mode: MODE, traces }, null, 1));
  fs.writeFileSync(path.join(OUT, MOCK ? 'KRISHNA_EVAL_MOCK.md' : 'KRISHNA_EVAL.md'), L.join('\n') + '\n');
  console.log(L.join('\n'));
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
})().catch((e) => { console.error(e); process.exit(1); });
