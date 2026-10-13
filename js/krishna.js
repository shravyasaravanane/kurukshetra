/*
 * KURUKSHETRA — krishna.js
 * Krishna as an LLM agent (Claude, via the Anthropic SDK and a manual tool-use loop).
 *
 * The agent advises the player on their next move. Its tools read ONLY what the player
 * knows (their belief map, their sight, their legal moves): it is held to the same
 * incomplete information as the human, so its advice can be wrong for the same reasons.
 * The engine then scores the advice against the truth, exactly like scripted counsel.
 *
 * Host-agnostic: pass in a constructed Anthropic client (browser: js/ui.js loads the SDK
 * from the CDN; Node: sim/krishna-eval.js uses the npm package).
 */
(function () {
  'use strict';
  const K = (globalThis.KURU = globalThis.KURU || {});

  const DEFAULT_MODEL = 'claude-opus-5-5';
  // Models that accept the server-side refusal fallback (beta server-side-fallback-2026-07-01).
  const FALLBACK_MODELS = ['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5'];

  const SYSTEM = [
    'You are Krishna, counselling Abhimanyu inside the Chakravyuha in a turn-based strategy game.',
    'The formation is concentric rings (ring 1 is innermost) around a core, with an open field outside.',
    'Walls between rings can only be crossed at gates, and every few turns the inner walls rotate, so gates move:',
    'a gate the player saw earlier may no longer be there. Each map entry says how many turns ago it was seen.',
    'Sentinels drain the player\'s resolve if they end a turn next to them; an ally beside the player blocks one point of that.',
    'The goal is to reach the core, then get back out to the field through an outer gate that is not sealed.',
    '',
    'You see exactly what the player knows, nothing more. Use the tools to look at the situation, the known map and',
    'the legal moves, and plan_route to compare options. Then call give_advice exactly once with one legal move and a',
    'short explanation (one or two sentences, plain language, addressed to the player). Prefer routes through gates',
    'seen recently over old memories, avoid ending next to sentinels when there is a reasonable alternative, and',
    'say so when your advice rests on stale or missing information.',
  ].join('\n');

  const TOOLS = [
    {
      name: 'get_situation',
      description: 'The player\'s current situation: goal, position, resolve, turn, when the walls next turn, what is in sight (allies, sentinels, the gatekeeper) and enemies remembered from earlier.',
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'get_known_map',
      description: 'Everything the player knows about the walls, ring by ring: gates believed open (with how many turns ago each was seen), how many wall sections are known closed or never seen, and which outer gates are known to be sealed.',
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'get_legal_moves',
      description: 'The moves available this turn. Each has a cell id (use it in give_advice), where it leads and how.',
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'plan_route',
      description: 'Shortest route by the player\'s own knowledge (unknown walls are assumed passable but costed higher). target is "goal" or a cell id. Returns the route length and the first step.',
      input_schema: {
        type: 'object',
        properties: { target: { type: 'string', description: '"goal" or a cell id as a string, e.g. "37"' } },
        required: ['target'],
        additionalProperties: false,
      },
    },
    {
      name: 'give_advice',
      description: 'Give your final counsel: the cell id of one legal move, and a one or two sentence explanation for the player. Call this exactly once, last.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: {
          move_to: { type: 'integer', description: 'Cell id of a legal move from get_legal_moves.' },
          explanation: { type: 'string', description: 'One or two plain sentences addressed to the player.' },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'], description: 'How sure you are, given what the player knows.' },
        },
        required: ['move_to', 'explanation', 'confidence'],
        additionalProperties: false,
      },
    },
  ];

  // ---------------- tool implementations (player's knowledge only) ----------------
  function cellLabel(G, c) {
    if (c === 0) return 'the core';
    const r = G.ringOf(c), s = G.segOf(c);
    return r === G.FIELD ? `field, segment ${s}` : `ring ${r}, segment ${s}`;
  }

  function situation(state) {
    const G = state.geom, p = state.player, b = p.belief, turn = state.turn;
    const known = [];
    for (const [id, rec] of b.agents) {
      if (id === 'player') continue;
      known.push({ id, kind: rec.kind, where: cellLabel(G, rec.cell), cell: rec.cell, seen: rec.turn === turn ? 'in sight now' : `${turn - rec.turn} turns ago` });
    }
    if (state.cond.allyComms) for (const a of state.allies) if (!known.some((k) => k.id === a.id)) known.push({ id: a.id, kind: 'ally', where: cellLabel(G, a.cell), cell: a.cell, seen: 'reported now' });
    return {
      goal: p.coreReached ? 'Get back out to the field through an outer gate that is not sealed.' : 'Reach the core.',
      position: cellLabel(G, p.cell), cell: p.cell,
      rings: G.R, segmentsPerRing: G.S,
      resolve: `${p.resolve} of ${state.cfg.resolve}`,
      turn: `${turn} of ${state.cfg.turnLimit}`,
      wallsTurnIn: state.cfg.rotationPeriod > 0 ? `${state.cfg.rotationPeriod - (turn % state.cfg.rotationPeriod)} turns` : 'never',
      informationLevel: state.cond.infoLevel,
      knownAgents: known,
    };
  }

  function knownMap(state) {
    const G = state.geom, b = state.player.belief, turn = state.turn;
    const walls = [];
    for (let k = 0; k <= G.R; k++) {
      const open = [], closed = [], unknown = [];
      for (let s = 0; s < G.S; s++) {
        const g = b.gate[k][s];
        if (g === 1) open.push({ segment: s, seen: b.seen[k][s] === turn ? 'now' : `${turn - b.seen[k][s]} turns ago`, sealed: k === G.R ? !!b.sealed[s] : undefined });
        else if (g === 0) closed.push(s); else unknown.push(s);
      }
      walls.push({
        wall: k === 0 ? 'core wall (ring 1 to core)' : k === G.R ? 'outer wall (ring ' + G.R + ' to field)' : `between ring ${k} and ring ${k + 1}`,
        gatesBelievedOpen: open, knownClosedSegments: closed.length, neverSeenSegments: unknown.length,
      });
    }
    return { note: 'Inner walls rotate; old sightings may be wrong.', walls };
  }

  function legalMoves(state) {
    const G = state.geom, here = state.player.cell, r0 = here === 0 ? 0 : G.ringOf(here);
    return K.engineLegal(state).map((m) => {
      const r = m.to === 0 ? 0 : G.ringOf(m.to);
      const how = m.breakthrough ? 'force past a sentinel (costs 2 resolve)' : m.via === 'gate' ? (r < r0 || m.to === 0 ? 'through a gate, inward' : 'through a gate, outward') : 'along the ring';
      return { cell: m.to, to: cellLabel(G, m.to), how };
    });
  }

  function planRoute(state, target) {
    const G = state.geom, here = state.player.cell;
    const targets = target === 'goal' ? K.playerTargets(state) : [parseInt(target, 10)];
    if (targets.some((t) => !(t >= 0 && t < G.N))) return { error: 'Unknown target. Use "goal" or a cell id.' };
    const cost = K.beliefCost(G, state.player.belief, state.cfg.unknownCost);
    const dist = K.distanceField(G, targets, cost);
    if (dist[here] === Infinity) return { reachable: false, note: 'No route through gates the player knows of or has not ruled out.' };
    let next = null, best = Infinity;
    for (const m of K.engineLegal(state)) {
      const l = G.links[here].find((x) => x.to === m.to);
      const v = cost(here, l) + dist[m.to];
      if (v < best) { best = v; next = m.to; }
    }
    return { reachable: true, estimatedSteps: Math.round(dist[here]), firstStep: next, firstStepIs: next != null ? cellLabel(G, next) : null };
  }

  function runTool(state, name, input) {
    switch (name) {
      case 'get_situation': return situation(state);
      case 'get_known_map': return knownMap(state);
      case 'get_legal_moves': return { moves: legalMoves(state) };
      case 'plan_route': return planRoute(state, String((input && input.target) || 'goal'));
      default: return { error: 'Unknown tool ' + name };
    }
  }

  // ---------------- the agent loop ----------------
  /**
   * Ask Krishna for counsel on the current turn.
   * Returns { to, text, confidence, steps, latencyMs, usage } or { error }.
   * opts: { model, effort ('low'|'medium'|'high'), maxSteps }
   */
  async function advise(client, state, opts) {
    opts = opts || {};
    const model = opts.model || DEFAULT_MODEL;
    const t0 = Date.now();
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };
    const trace = [];
    const messages = [{ role: 'user', content: `Turn ${state.turn}. What should I do next? Look around first, then call give_advice.` }];
    const params = {
      model,
      max_tokens: 16000,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools: TOOLS,
      tool_choice: { type: 'auto' },
      output_config: { effort: opts.effort || 'low' },
    };
    if (FALLBACK_MODELS.includes(model)) { params.betas = ['server-side-fallback-2026-07-01']; params.fallbacks = 'default'; }
    const maxSteps = opts.maxSteps || 8;
    let nudged = false;
    for (let step = 0; step < maxSteps; step++) {
      const response = await client.beta.messages.create(Object.assign({}, params, { messages }));
      for (const k of Object.keys(usage)) usage[k] += (response.usage && response.usage[k]) || 0;
      if (response.stop_reason === 'refusal') return { error: 'Krishna declined to answer (refusal).', latencyMs: Date.now() - t0, usage, trace };
      if (response.stop_reason === 'max_tokens') return { error: 'Response was cut off (max_tokens).', latencyMs: Date.now() - t0, usage, trace };
      // Append the assistant turn unchanged (thinking blocks must be preserved).
      messages.push({ role: 'assistant', content: response.content });
      const uses = response.content.filter((b) => b.type === 'tool_use');
      if (!uses.length) {
        if (nudged) return { error: 'Krishna did not give advice.', latencyMs: Date.now() - t0, usage, trace };
        nudged = true;
        messages.push({ role: 'user', content: 'Please call give_advice now with one legal move.' });
        continue;
      }
      const results = [];
      for (const u of uses) {
        trace.push({ tool: u.name, input: u.input });
        if (u.name === 'give_advice') {
          const legal = K.engineLegal(state).some((m) => m.to === u.input.move_to);
          if (legal) {
            return {
              to: u.input.move_to, text: String(u.input.explanation || '').slice(0, 400), confidence: u.input.confidence,
              steps: step + 1, latencyMs: Date.now() - t0, usage, trace, model,
            };
          }
          results.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: `Cell ${u.input.move_to} is not a legal move. Legal cells: ${K.engineLegal(state).map((m) => m.to).join(', ')}.` });
        } else {
          let out;
          try { out = runTool(state, u.name, u.input); } catch (e) { out = { error: String(e && e.message || e) }; }
          results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out), is_error: !!out.error });
        }
      }
      // All results for this assistant turn go back in ONE user message.
      messages.push({ role: 'user', content: results });
    }
    return { error: 'Krishna took too many steps.', latencyMs: Date.now() - t0, usage, trace };
  }

  K.Krishna = { DEFAULT_MODEL, SYSTEM, TOOLS, runTool, advise, situation, knownMap, legalMoves, planRoute };
})();
