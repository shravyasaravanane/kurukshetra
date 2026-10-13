/*
 * KURUKSHETRA — ui.js
 * Menu, intro cinematic, learn-to-play levels, HUD, input, debrief, study mode and replay.
 * The 3D world only ever receives the player's view during play.
 */
(function () {
  'use strict';
  const K = globalThis.KURU;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  if (!globalThis.THREE) {
    document.body.innerHTML = '<p style="color:#fff;padding:40px;font:16px system-ui">The 3D engine (vendor/three.min.js) failed to load. Keep the project folder together and open index.html again.</p>';
    return;
  }

  const world = K.World.create($('world'));
  setTimeout(() => $('loading').classList.add('done'), 450);
  const passive = () => !!ui.meta && (ui.meta.mode === 'bot' || ui.meta.mode === 'replay');
  const ui = {
    game: null, meta: null, study: null, pendingSignal: null, busy: false,
    turnStart: 0, hiddenSince: null, hiddenTotal: 0, botTimer: null, session: null,
    level: null, tipsShown: new Set(), introTimer: null, hover: null, hoverCell: null,
  };

  // ---------------- menu background ----------------
  function showMenuWorld() {
    const demo = K.createGame({ seed: 3, infoLevel: 'high', allyComms: true });
    world.load(demo);
    world.sync(demo.truthView(), {});
    world.setLegal([]);
    world.showPath(null);
    world.setCameraMode('menu');
  }
  showMenuWorld();

  function show(screen) {
    $('menu').classList.toggle('hidden', screen !== 'menu');
    $('intro').classList.toggle('hidden', screen !== 'intro');
    $('hud').classList.toggle('hidden', screen !== 'game');
    $('debrief').classList.toggle('hidden', screen !== 'debrief');
    for (const id of ['levels', 'levelCard', 'levelResult']) $(id).classList.toggle('hidden', screen !== id);
    hideTooltip();
  }

  // ---------------- settings ----------------
  const seedInput = $('seed');
  seedInput.value = 1 + Math.floor(Math.random() * 9999);
  const infoHelp = () => { $('infoHelp').textContent = K.INFO_LEVELS[document.querySelector('input[name=info]:checked').value].blurb; };
  document.querySelectorAll('input[name=info]').forEach((r) => r.addEventListener('change', infoHelp));
  infoHelp();
  $('settingsToggle').addEventListener('click', () => { $('settings').classList.toggle('hidden'); $('studyForm').classList.add('hidden'); });
  $('studyBtn').addEventListener('click', () => { $('studyForm').classList.toggle('hidden'); $('settings').classList.add('hidden'); $('participantId').focus(); });
  const readCondition = () => ({
    infoLevel: document.querySelector('input[name=info]:checked').value,
    allyComms: $('allyComms').checked,
    enemyComms: $('enemyComms').checked,
    seed: Math.max(1, parseInt(seedInput.value, 10) || 1),
    advisor: document.querySelector('input[name=advisor]:checked').value,
    explain: $('explainAdvice').checked,
  });

  const flag = (k, v) => { try { if (v === undefined) return localStorage.getItem(k) === '1'; localStorage.setItem(k, v ? '1' : '0'); } catch (e) { return false; } return v; };

  $('playBtn').addEventListener('click', () => {
    K.Audio.unlock();
    ui.study = null;
    const go = () => startRound(readCondition(), { mode: 'play' });
    if (!flag('kurukshetra.introSeen')) playIntro(go); else go();
  });
  $('tutorialBtn').addEventListener('click', () => { K.Audio.unlock(); ui.study = null; openLevels(); });
  $('introBtn').addEventListener('click', () => { K.Audio.unlock(); playIntro(() => { show('menu'); showMenuWorld(); }); });
  $('botBtn').addEventListener('click', () => { K.Audio.unlock(); ui.study = null; startRound(readCondition(), { mode: 'bot' }); });
  $('aboutBtn').addEventListener('click', () => $('about').classList.remove('hidden'));
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('.modal').classList.add('hidden')));
  document.querySelectorAll('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); }));

  // Counterbalanced study plan (order of info levels and the ally-coordination condition from the participant ID).
  const PERMS = [['low', 'medium', 'high'], ['low', 'high', 'medium'], ['medium', 'low', 'high'], ['medium', 'high', 'low'], ['high', 'low', 'medium'], ['high', 'medium', 'low']];
  function hash(str) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function studyPlan(pid) {
    const h = hash(pid.trim().toUpperCase());
    return PERMS[h % 6].map((infoLevel, i) => ({ infoLevel, allyComms: Math.floor(h / 6) % 2 === 0, enemyComms: true, seed: 101 + i }));
  }
  $('studyStart').addEventListener('click', () => {
    const pid = $('participantId').value.trim();
    if (!pid) { $('participantId').focus(); $('participantId').placeholder = 'Enter a participant ID first'; return; }
    K.Audio.unlock();
    const protocol = document.querySelector('input[name=protocol]:checked').value;
    ui.study = { pid, protocol, plan: protocol === 'counsel' ? counselPlan(pid) : studyPlan(pid), round: -1, practice: protocol === 'counsel' ? [0, 1, 2, 3, 5] : [0, 1, 2, 3] };
    showLevelCard(0, { participantId: pid });
  });

  // ---------------- intro cinematic ----------------
  const CAPTIONS = [
    'Kurukshetra. The thirteenth day of the great war.',
    'Drona arranges his army into the <b>Chakravyuha</b>: rings of soldiers that keep turning.',
    'Only Arjuna knows how to break it, and Arjuna has been drawn away.',
    'Young Abhimanyu knows how to break <i>in</i>. He was never taught how to get <i>out</i>.',
    'His allies are meant to follow him through the breach. Jayadratha stands ready to seal it.',
    'You are Abhimanyu. You will see only what is near you.<br>Reach the heart of the formation, then find your way out.',
  ];
  function playIntro(done) {
    show('intro');
    showMenuWorld();
    world.setCameraMode('cinematic');
    let i = 0;
    const cap = $('caption');
    const next = () => {
      if (i >= CAPTIONS.length) { finish(); return; }
      cap.classList.remove('show');
      setTimeout(() => { cap.innerHTML = CAPTIONS[i++]; cap.classList.add('show'); if (i === 2) K.Audio.play('drum'); if (i === 4) K.Audio.play('conch'); }, 500);
      ui.introTimer = setTimeout(next, 4200);
    };
    const finish = () => { clearTimeout(ui.introTimer); cap.classList.remove('show'); flag('kurukshetra.introSeen', true); $('skipIntro').onclick = null; done(); };
    $('skipIntro').onclick = finish;
    next();
  }

  // ---------------- learn to play: five levels ----------------
  const LEVELS = K.LEVELS;
  const levelsDone = () => { try { return +localStorage.getItem('kurukshetra.levelsDone') || 0; } catch (e) { return 0; } };
  const markLevelDone = (n) => { try { if (n > levelsDone()) localStorage.setItem('kurukshetra.levelsDone', String(n)); } catch (e) { /* ignore */ } };
  const FAIL_TIPS = {
    exhausted: 'The sentinels wore down your resolve. <b>Tip:</b> don\'t end a turn next to a sentinel, and stay beside an ally.',
    encircled: 'Sentinels surrounded you. <b>Tip:</b> keep moving and stay near an ally.',
    'sealed-in': 'Every outer gate was sealed while you were inside. <b>Tip:</b> as soon as you break in, order <b>Satyaki</b> to <b>Hold gate</b>.',
    'sealed-out': 'Every outer gate was sealed. <b>Tip:</b> order an ally to <b>Hold gate</b> early.',
    timeout: 'You ran out of turns. <b>Tip:</b> follow the blue dots, and <b>Scout</b> when you are unsure where the gate went.',
    abandoned: 'You left the level.',
  };

  function openLevels() {
    const done = levelsDone();
    $('levelGrid').innerHTML = LEVELS.map((L, i) => {
      const unlocked = L.id <= done + 1;
      const state = L.id <= done ? '<span class="state">✓ Completed</span>' : unlocked ? '<span class="state next">▶ Play next</span>' : '<span class="state locked">Locked</span>';
      return `<button class="level" data-level="${i}" ${unlocked ? '' : 'disabled'}><span class="num">Level ${L.id}</span><b>${esc(L.title)}</b><span class="l">${esc(L.lesson)}</span>${state}</button>`;
    }).join('');
    $('levelGrid').querySelectorAll('button[data-level]').forEach((b) => b.addEventListener('click', () => showLevelCard(+b.dataset.level)));
    show('levels');
  }
  $('levelsBack').addEventListener('click', () => toMenu());

  function showLevelCard(i, extra) {
    const L = LEVELS[i];
    $('lcKicker').textContent = `Level ${L.id} of ${LEVELS.length}${extra && extra.participantId ? ' · practice' : ''}`;
    $('lcTitle').textContent = L.title;
    $('lcLesson').textContent = L.lesson;
    $('lcGoal').textContent = L.goalText;
    $('lcStart').onclick = () => beginLevel(i, extra);
    show('levelCard');
  }

  function beginLevel(i, extra) {
    const def = LEVELS[i];
    ui.level = { i, def, tipsShown: new Set(), moves: 0, rotationTurn: null, scouted: false, extra: extra || null };
    startRound(Object.assign({}, def.cond, { config: def.config }), Object.assign({ mode: 'tutorial', level: def.id }, extra || {}));
  }

  function coachTip(key) {
    const L = ui.level;
    if (!L || L.tipsShown.has(key) || !L.def.tips[key]) return;
    L.tipsShown.add(key);
    $('coachStep').textContent = `Level ${L.def.id} · ${L.def.title}`;
    $('coachText').innerHTML = L.def.tips[key];
    $('coach').classList.remove('hidden');
    $('coach').style.animation = 'none'; void $('coach').offsetWidth; $('coach').style.animation = '';
  }

  function levelTick(events, action) {
    const L = ui.level;
    if (!L) return;
    const st = ui.game.state;
    if (action.type === 'move') { L.moves++; if (L.moves === 1) coachTip('move'); }
    if (action.type === 'scout') L.scouted = true;
    for (const e of events) {
      if (e.type === 'rotation') { L.rotationTurn = st.turn; coachTip('rotation'); }
      if (['breach', 'pressed', 'covered', 'sealing', 'core'].includes(e.type)) coachTip(e.type);
    }
    if (L.rotationTurn != null && !L.scouted && st.turn - L.rotationTurn >= 2) coachTip('scoutHint');
    if (st.sentinels.some((x) => st.player.visible.has(x.cell))) coachTip('sentinelSeen');
  }

  function showLevelResult() {
    const g = ui.game, s = g.summary(), L = ui.level, def = L.def;
    const won = s.category === 'win';
    K.Logger.save(K.Logger.buildSession(g, ui.meta));
    if (won) markLevelDone(def.id);
    K.Audio.play(won ? 'win' : 'lose');
    const stars = won ? 1 + (s.resolve >= g.state.cfg.resolve / 2 ? 1 : 0) + (s.optimalRate != null && s.optimalRate >= 0.75 ? 1 : 0) : 0;
    $('lrKicker').textContent = `Level ${def.id} of ${LEVELS.length}`;
    $('lrTitle').textContent = won ? 'Level complete' : 'Not quite';
    $('lrText').innerHTML = won
      ? `<b>Lesson:</b> ${esc(def.lesson)}<br><span class="muted small">Stars: finishing, keeping half your resolve, and making at least 75% best-possible moves.</span>`
      : (FAIL_TIPS[s.result] || 'Try again.');
    $('lrStars').textContent = won ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '';
    const last = L.i === LEVELS.length - 1;
    const study = ui.study && L.extra && L.extra.participantId;
    const practiceList = study ? ui.study.practice : null;
    const practiceDone = study && L.i === practiceList[practiceList.length - 1];
    $('lrNext').textContent = !won ? 'Try again' : practiceDone ? 'Begin the study rounds ▶' : last ? 'Play the full game ▶' : 'Next level ▶';
    $('lrNext').onclick = () => {
      if (!won) { showLevelCard(L.i, L.extra); return; }
      if (practiceDone) { ui.level = null; ui.study.round = 0; startRound(ui.study.plan[0], { mode: 'study', participantId: ui.study.pid, round: 1 }); return; }
      if (last) { ui.level = null; startRound(readCondition(), { mode: 'play' }); return; }
      showLevelCard(study ? practiceList[practiceList.indexOf(L.i) + 1] : L.i + 1, L.extra);
    };
    let truth = false;
    $('lrTruth').textContent = 'See the real formation';
    $('lrTruth').onclick = () => {
      truth = !truth;
      $('lrTruth').textContent = truth ? 'See what you knew' : 'See the real formation';
      world.sync(truth ? g.truthView() : g.playerView(), { animate: true, coreReached: g.state.player.coreReached });
    };
    $('lrList').classList.toggle('hidden', !!study);
    $('lrList').onclick = openLevels;
    world.setLegal([]);
    world.showPath(null);
    show('levelResult');
  }

  // Shortest route by the player's OWN belief: never reveals more than they know.
  function beliefPathTo(targets) {
    const st = ui.game.state, G = st.geom;
    const cost = K.beliefCost(G, st.player.belief, st.cfg.unknownCost);
    const dist = K.distanceField(G, targets, cost);
    const out = [];
    let here = st.player.cell;
    if (dist[here] === Infinity) return null;
    for (let i = 0; i < 40 && dist[here] > 0; i++) {
      let best = null;
      for (const l of G.links[here]) { const c = cost(here, l); if (c < Infinity && dist[l.to] < dist[here] && (best === null || dist[l.to] < dist[best])) best = l.to; }
      if (best === null) break;
      out.push(best);
      here = best;
    }
    return out;
  }
  const levelRoute = () => (ui.level && ui.level.def.route && ui.game && !ui.game.over ? beliefPathTo(K.playerTargets(ui.game.state)) : null);

  function applyHud(h) {
    h = h || { allies: true, minimap: true, scout: true, legend: true, orders: true };
    document.querySelector('.hud-right').classList.toggle('hidden', !h.allies);
    document.querySelector('.hud-bl').classList.toggle('hidden', !h.minimap);
    $('legend').classList.toggle('hidden', !h.legend);
    $('scoutBtn').classList.toggle('hidden', !h.scout);
    if (h.counsel === false) $('counsel').classList.add('hidden');
  }

  const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  function compass(seg) {
    const S = ui.game.state.geom.S;
    const a = ((-90 + seg * (360 / S)) % 360 + 360) % 360;
    return COMPASS[Math.round(a / 45) % 8];
  }

  // ---------------- Krishna's counsel ----------------
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.132.1/+esm';
  const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } return v; };
  let claude = { key: null, promise: null };
  function getClaude() {
    const key = ($('apiKey').value || '').trim();
    if (!key) return Promise.reject(new Error('Add your Anthropic API key under Experiment settings to use the AI Krishna.'));
    if (claude.key !== key || !claude.promise) {
      claude.key = key;
      // The SDK is loaded from the CDN only when the AI advisor is used; the rest of the game stays offline.
      claude.promise = import(SDK_URL).then((m) => {
        const Anthropic = m.default || m.Anthropic;
        return new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
      });
    }
    return claude.promise;
  }
  const SOURCE_LABEL = { reliable: 'via a reliable messenger', unreliable: 'via a careless messenger', planner: 'Krishna\'s insight · reasons only from what you know', llm: 'Claude · sees only what you know' };

  function requestAdvice() {
    const st = ui.game.state, kind = st.cond.advisor;
    ui.advice = null; ui.adviceError = null; ui.adviceLoading = false;
    world.setAdvice(null);
    if (!kind || kind === 'none' || st.over) { renderCounsel(); return; }
    if (kind !== 'llm') {
      ui.advice = K.Advisor.scripted(st);
      world.setAdvice(ui.advice && !passive() ? ui.advice.to : null);
      renderCounsel();
      return;
    }
    const game = ui.game, turn = st.turn;
    ui.adviceLoading = true;
    renderCounsel();
    getClaude()
      .then((client) => K.Krishna.advise(client, st, { model: ($('llmModel').value || K.Krishna.DEFAULT_MODEL).trim(), effort: $('llmEffort').value }))
      .then((res) => {
        if (ui.game !== game || st.turn !== turn || st.over) return; // the player already moved on
        ui.adviceLoading = false;
        if (res.error) { ui.adviceError = res.error; renderCounsel(); return; }
        ui.advice = { to: res.to, source: 'llm', explained: st.cond.explain, text: st.cond.explain ? res.text : 'Step to the tile I have marked.', latencyMs: res.latencyMs, confidence: res.confidence };
        world.setAdvice(res.to);
        // Thinking time is measured from when the counsel arrives, not while waiting for it.
        ui.turnStart = performance.now(); ui.hiddenTotal = 0;
        renderCounsel();
      })
      .catch((e) => {
        if (ui.game !== game || st.turn !== turn) return;
        ui.adviceLoading = false;
        ui.adviceError = e && e.status === 401 ? 'The API key was rejected.' : (e && e.message) || String(e);
        renderCounsel();
      });
  }

  function renderCounsel() {
    const st = ui.game && ui.game.state;
    const show = !!st && st.cond.advisor && st.cond.advisor !== 'none';
    $('counsel').classList.toggle('hidden', !show);
    if (!show) return;
    $('counselSource').textContent = SOURCE_LABEL[st.cond.advisor] || '';
    const t = $('counselText');
    t.classList.toggle('thinking', !!ui.adviceLoading);
    t.textContent = ui.adviceLoading ? 'Krishna is considering your situation…' : ui.adviceError ? ui.adviceError : ui.advice ? ui.advice.text : (st.over ? '' : 'No counsel this turn.');
    $('followAdvice').disabled = !ui.advice || passive() || st.over;
    $('counselNote').textContent = ui.advice && ui.advice.confidence ? `confidence: ${ui.advice.confidence}` : ui.advice ? 'teal K marks the tile' : '';
  }
  function followAdvice() {
    if (ui.advice && !passive()) act({ type: 'move', to: ui.advice.to });
  }
  $('followAdvice').addEventListener('click', followAdvice);

  // Settings: advisor choice, explanations, API key / model (kept in this browser only).
  const ADVISOR_HELP = {
    none: 'No one advises you.',
    reliable: 'A messenger relays Krishna\'s counsel each turn. It is right about 9 times in 10.',
    unreliable: 'A careless messenger relays the counsel. It is right only about 6 times in 10, and sounds just as sure.',
    planner: 'Krishna\'s insight reasons only from what you know and suggests the best route by it, saying when that rests on old or missing information. Free and offline.',
    llm: 'Krishna is an AI agent (Claude). Each turn it looks only at what you know, using tools, then advises.',
  };
  const advisorChoice = () => document.querySelector('input[name=advisor]:checked').value;
  const syncAdvisorUi = () => { $('advisorHelp').textContent = ADVISOR_HELP[advisorChoice()]; $('llmFields').classList.toggle('hidden', advisorChoice() !== 'llm'); };
  document.querySelectorAll('input[name=advisor]').forEach((r) => r.addEventListener('change', syncAdvisorUi));
  $('apiKey').value = pref('kurukshetra.apiKey') || '';
  $('llmModel').value = pref('kurukshetra.llmModel') || K.Krishna.DEFAULT_MODEL;
  $('llmEffort').value = pref('kurukshetra.llmEffort') || 'low';
  $('apiKey').addEventListener('change', () => pref('kurukshetra.apiKey', $('apiKey').value.trim()));
  $('llmModel').addEventListener('change', () => pref('kurukshetra.llmModel', $('llmModel').value.trim()));
  $('llmEffort').addEventListener('change', () => pref('kurukshetra.llmEffort', $('llmEffort').value));
  syncAdvisorUi();

  // Counsel study: the advisor's reliability is counterbalanced within participants;
  // whether advice comes with reasons is assigned between participants.
  const ADV_PERMS = [['reliable', 'unreliable', 'none', 'planner'], ['unreliable', 'planner', 'reliable', 'none'], ['planner', 'none', 'unreliable', 'reliable'], ['none', 'reliable', 'planner', 'unreliable']];
  function counselPlan(pid) {
    const h = hash(pid.trim().toUpperCase());
    const explain = Math.floor(h / 4) % 2 === 0;
    return ADV_PERMS[h % 4].map((advisor, i) => ({ infoLevel: 'medium', allyComms: true, enemyComms: true, advisor, explain, seed: 201 + i }));
  }
  document.querySelectorAll('input[name=protocol]').forEach((r) => r.addEventListener('change', () => {
    const counsel = document.querySelector('input[name=protocol]:checked').value === 'counsel';
    $('protocolHelp').textContent = counsel
      ? 'Five short practice levels (1 to 4, then Krishna\'s counsel), then four rounds: a reliable messenger, a careless one, Krishna\'s insight and no counsel, in a counterbalanced order. The practice levels are not analysed.'
      : 'Four short practice levels come first, then three rounds. The conditions are assigned and counterbalanced from the ID. The practice levels are not analysed.';
  }));

  // ---------------- a round ----------------
  function startRound(condition, meta) {
    stopBot();
    if (meta.mode !== 'tutorial') ui.level = null;
    ui.game = K.createGame(condition);
    ui.meta = meta;
    ui.pendingSignal = null;
    ui.session = null;
    ui.busy = false;
    $('feed').innerHTML = '';
    world.load(ui.game);
    world.resetCamera();
    world.setCameraMode('tactical');
    world.sync(ui.game.playerView(), { animate: false });
    const c = ui.game.state.cond;
    $('roundLabel').textContent = meta.mode === 'study' ? `Study round ${meta.round} of ${ui.study ? ui.study.plan.length : 3}` : meta.mode === 'bot' ? 'Bot demonstration' : meta.mode === 'tutorial' ? `Level ${meta.level} of ${LEVELS.length}` : 'Free play';
    $('chips').innerHTML = [
      `<span class="chip on" title="${esc(K.INFO_LEVELS[c.infoLevel].blurb)}">Info: ${c.infoLevel}</span>`,
      `<span class="chip ${c.allyComms ? 'on' : ''}">Allies ${c.allyComms ? 'linked' : 'silent'}</span>`,
      `<span class="chip ${c.enemyComms ? 'on' : ''}">Kauravas ${c.enemyComms ? 'linked' : 'independent'}</span>`,
    ].join('');
    $('noComms').classList.toggle('hidden', c.allyComms);
    const bot = meta.mode === 'bot';
    $('waitBtn').disabled = bot; $('scoutBtn').disabled = bot;
    $('leaveBtn').textContent = bot ? 'Stop' : 'Leave';
    $('camBtn').textContent = 'Close-up';
    applyHud(ui.level ? ui.level.def.hud : null);
    $('coach').classList.add('hidden');
    document.querySelector('#stepper li[data-step="2"]').classList.toggle('hidden', ui.game.state.cfg.goal === 'core');
    show('game');
    feed('info', K.INFO_LEVELS[c.infoLevel].blurb);
    toast(ui.level ? ui.level.def.title : 'Break into the formation', ui.level ? ui.level.def.goalText : 'Find a torch-lit gate in the outer wall');
    K.Audio.play('conch');
    coachTip('start');
    beginTurn();
    if (bot) runBot();
  }

  function beginTurn() {
    ui.turnStart = performance.now();
    ui.hiddenTotal = 0;
    const view = ui.game.playerView();
    world.setLegal(passive() ? [] : view.legal);
    world.showPath(levelRoute());
    ui.hoverCell = null;
    renderHud();
    requestAdvice();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ui.hiddenSince = performance.now();
    else if (ui.hiddenSince != null) { ui.hiddenTotal += performance.now() - ui.hiddenSince; ui.hiddenSince = null; }
  });

  function act(action) {
    const g = ui.game;
    if (!g || g.over || ui.busy || ui.paused || ui.meta.mode === 'replay') return;
    if (ui.pendingSignal) action.signal = ui.pendingSignal;
    const decisionMs = ui.meta.mode === 'bot' ? null : performance.now() - ui.turnStart - ui.hiddenTotal;
    const st = g.state;
    const resolveBefore = st.player.resolve;
    const { events } = g.step(action, { decisionMs, advice: ui.advice });
    ui.advice = null; ui.adviceLoading = false; world.setAdvice(null); renderCounsel();
    ui.pendingSignal = null;
    ui.busy = true;

    world.setLegal([]);
    world.showPath(null);
    world.sync(g.playerView(), { animate: true, coreReached: st.player.coreReached });
    if (action.type === 'move') world.stepSound();
    if (action.type === 'scout') world.scoutPulse(st.info.vision + st.cfg.scoutBonus);
    const seesGk = st.player.visible.has(st.gatekeeper.cell);
    const ctx = {
      gatekeeperSeen: seesGk,
      sealPerceived: seesGk || st.cond.allyComms,
      adjacentSentinels: st.sentinels.filter((s) => K.adjacent(st, s.cell, st.player.cell, 'kaurava')).map((s) => s.id),
      pressingSentinels: st.sentinels.filter((s) => K.adjacent(st, s.cell, st.player.cell, 'kaurava') && !K.isPinned(st, s)).map((s) => s.id),
      coverAllies: st.allies.filter((a) => K.adjacent(st, a.cell, st.player.cell, 'pandava')).map((a) => a.id),
      compass,
    };
    for (const e of events) {
      if (e.type === 'signal' && action.signal) e.allyId = action.signal.ally;
      world.playEvent(e, ctx);
    }
    narrate(events, ctx);
    if (st.player.resolve < resolveBefore) { $('resolveBar').classList.remove('shake'); void $('resolveBar').offsetWidth; $('resolveBar').classList.add('shake'); }
    levelTick(events, action);
    renderHud();
    setTimeout(() => {
      ui.busy = false;
      if (g !== ui.game) return;
      if (g.over) setTimeout(endRound, 900);
      else beginTurn();
    }, 560);
  }

  // ---------------- input ----------------
  world.onClick((p) => {
    if (!ui.game || ui.game.over || passive() || ui.paused || $('hud').classList.contains('hidden')) return;
    if (p.cell == null) return;
    const m = ui.game.legalMoves().find((x) => x.to === p.cell);
    if (m) act({ type: 'move', to: p.cell });
    else if (p.cell !== ui.game.state.player.cell) flashHint('You can only step to a glowing tile.');
  });

  const DESCRIBE = {
    player: '<b>You, Abhimanyu.</b> Reach the core, then escape.',
    bhima: '<b>Bhima, follower.</b> Stays close and gives you cover.',
    nakula: '<b>Nakula, scout.</b> Explores and maps gates.',
    satyaki: '<b>Satyaki, guardian.</b> Holds an outer gate open.',
    jayadratha: '<b>Jayadratha, gatekeeper.</b> Seals outer gates once you are inside.',
  };
  world.onHover((p) => {
    if (!ui.game || $('hud').classList.contains('hidden')) { hideTooltip(); return; }
    let html = null;
    const st = ui.game.state;
    if (p.charId) {
      html = DESCRIBE[p.charId];
      if (!html) {
        const intent = ui.game.playerView().intents.get(p.charId);
        html = intent && intent.alert ? '<b>Sentinel, hunting you.</b> It has seen you and is closing in. Next to you at the end of a turn, it drains 1 resolve.'
          : '<b>Sentinel, on patrol.</b> It walks around its ring. Next to you at the end of a turn, it drains 1 resolve. An ally next to it pins it.';
      }
    } else if (p.cell != null && !passive() && !st.over) {
      const m = ui.game.legalMoves().find((x) => x.to === p.cell);
      const label = p.cell === 0 ? 'The core' : p.cell === st.player.cell ? 'You are here' : (st.geom.ringOf(p.cell) === st.geom.FIELD ? 'The field' : 'Ring ' + st.geom.ringOf(p.cell));
      let route = '';
      if (p.cell !== st.player.cell) {
        if (ui.hoverCell !== p.cell) { ui.hoverCell = p.cell; ui.hoverPath = beliefPathTo([p.cell]); world.showPath(ui.hoverPath || null, 0x9fe8ff); }
        route = ui.hoverPath ? `<br><span class="muted">${ui.hoverPath.length} step${ui.hoverPath.length === 1 ? '' : 's'} by what you know</span>` : '<br><span class="muted">No route you know of yet</span>';
      }
      html = (m ? (m.breakthrough ? '<b>Force past the sentinel.</b> Costs 2 resolve.' : m.via === 'gate' ? '<b>Go through the gate.</b>' : '<b>Move here.</b>') + '<br>' : '') + `<b>${label}</b>` + route;
    }
    if (p.cell == null && ui.hoverCell != null) { ui.hoverCell = null; world.showPath(levelRoute()); }
    if (html && ui.advice && p.cell === ui.advice.to && !p.charId) html = '<b style="color:#7fe9df">Krishna\'s counsel</b><br>' + html;
    if (html) showTooltip(html, p.x, p.y); else hideTooltip();
    document.body.style.cursor = html && !p.charId ? 'pointer' : '';
  });
  function showTooltip(html, x, y) {
    const t = $('tooltip');
    t.innerHTML = html;
    t.style.left = Math.min(x + 16, window.innerWidth - 270) + 'px';
    t.style.top = (y + 16) + 'px';
    t.classList.add('show');
  }
  function hideTooltip() { $('tooltip').classList.remove('show'); }

  // Keys map to SCREEN directions, so W is always "away from the camera".
  function keyMove(dir) {
    const g = ui.game;
    const moves = g.legalMoves().filter((m) => !m.breakthrough || dir);
    const here = world.project(g.state.player.cell);
    const want = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    let best = null, bestScore = 0.5;
    for (const m of moves) {
      const p = world.project(m.to);
      const dx = p.x - here.x, dy = p.y - here.y, len = Math.hypot(dx, dy) || 1;
      const score = (dx * want[0] + dy * want[1]) / len;
      if (score > bestScore) { bestScore = score; best = m; }
    }
    if (best) act({ type: 'move', to: best.to });
    else flashHint('No way through in that direction.');
  }
  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.matches && e.target.matches('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    if (!$('help').classList.contains('hidden') && (k === 'escape' || k === 'h')) { $('help').classList.add('hidden'); return; }
    if (!$('settingsModal').classList.contains('hidden') && k === 'escape') { $('settingsModal').classList.add('hidden'); return; }
    if (k === 'escape' && !$('hud').classList.contains('hidden') && ui.game && !ui.game.over && !passive()) { setPaused(!ui.paused); return; }
    if (ui.meta && ui.meta.mode === 'replay' && !$('hud').classList.contains('hidden')) {
      if (k === ' ') { e.preventDefault(); replayToggle(); } else if (k === 'arrowright') { replayPause(); replayStep(); } else if (k === 'arrowleft') { replayPause(); replaySeek(ui.replay.t - 1); }
      return;
    }
    if ($('hud').classList.contains('hidden') || !ui.game || ui.game.over || ui.paused) return;
    if (k === 'h') { $('help').classList.remove('hidden'); return; }
    if (k === 'c') { toggleCamera(); return; }
    if (passive()) return;
    const map = { w: 'up', arrowup: 'up', s: 'down', arrowdown: 'down', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right' };
    if (map[k]) { e.preventDefault(); keyMove(map[k]); }
    else if (k === ' ') { e.preventDefault(); act({ type: 'wait' }); }
    else if (k === 'e') { e.preventDefault(); act({ type: 'scout' }); }
    else if (k === 'f') { e.preventDefault(); followAdvice(); }
  });
  $('waitBtn').addEventListener('click', () => act({ type: 'wait' }));
  $('scoutBtn').addEventListener('click', () => act({ type: 'scout' }));
  $('helpBtn').addEventListener('click', () => $('help').classList.remove('hidden'));
  function toggleCamera() {
    const close = world.cameraMode !== 'follow';
    world.setCameraMode(close ? 'follow' : 'tactical');
    world.resetCamera();
    $('camBtn').textContent = close ? 'Tactical view' : 'Close-up';
  }
  $('camBtn').addEventListener('click', toggleCamera);
  const soundLabel = () => { $('soundBtn').textContent = K.Audio.muted ? 'Sound off' : 'Sound on'; };
  soundLabel();
  $('soundBtn').addEventListener('click', () => { K.Audio.toggle(); soundLabel(); });
  $('leaveBtn').addEventListener('click', () => {
    if (ui.meta.mode === 'bot') { stopBot(); toMenu(); return; }
    if (ui.meta.mode === 'replay') { replayStop(); location.href = 'analysis.html'; return; }
    if (!confirm('Leave this round? It will be recorded as abandoned.')) return;
    const st = ui.game.state;
    if (!st.over) { st.over = true; st.outcome = { result: 'abandoned', category: 'loss', turns: st.turn, coreReached: st.player.coreReached, coreTurn: st.player.coreTurn, resolve: Math.max(0, st.player.resolve), score: 0 }; }
    endRound();
  });

  // ---------------- bot demo ----------------
  function runBot() {
    const mem = {};
    ui.botTimer = setInterval(() => {
      if (!ui.game || ui.game.over) { stopBot(); return; }
      if (!ui.busy) act(K.Bots.belief(ui.game.state, mem));
    }, 650);
  }
  function stopBot() { if (ui.botTimer) clearInterval(ui.botTimer); ui.botTimer = null; }

  // ---------------- HUD ----------------
  const ACTION_TEXT = {
    cover: 'Beside you, giving cover', follow: 'Coming to you', hold: 'Holding an outer gate open', 'move-to-hold': 'Heading to hold a gate',
    scout: 'Scouting the formation', blocked: 'Way blocked', idle: 'Waiting for orders',
  };
  const ORDER_LABEL = { follow: 'Follow', hold: 'Hold gate', scout: 'Scout' };

  function renderHud() {
    const g = ui.game, st = g.state;
    const frac = Math.max(0, st.player.resolve) / st.cfg.resolve;
    $('resolveLabel').textContent = `${Math.max(0, st.player.resolve)} / ${st.cfg.resolve}`;
    $('resolveBar').firstElementChild.style.width = (frac * 100) + '%';
    $('resolveBar').classList.toggle('low', frac <= 0.34);
    $('turnLabel').textContent = `Turn ${st.turn} of ${st.cfg.turnLimit}`;
    $('dayBar').firstElementChild.style.width = (100 * (1 - st.turn / st.cfg.turnLimit)) + '%';
    const phase = st.player.coreReached ? 2 : st.player.breached ? 1 : 0;
    document.querySelectorAll('#stepper li').forEach((li) => {
      const i = +li.dataset.step;
      li.classList.toggle('done', i < phase || (i === 2 && !!st.outcome && st.outcome.result === 'escaped'));
      li.classList.toggle('now', i === phase && !(i < phase));
    });
    $('hint').innerHTML = hintText();
    const G = st.geom, pc = st.player.cell, r = pc === 0 ? 0 : G.ringOf(pc);
    $('whereLabel').innerHTML = pc === 0 ? 'At the <b>core</b>' + (st.cfg.goal === 'core' ? '' : ' · now get out')
      : r === G.FIELD ? (st.player.coreReached ? '<b>Outside</b>: you made it' : '<b>Outside</b> the formation · ' + G.R + ' rings to the core')
      : `Ring <b>${r}</b> of ${G.R} · ${st.player.coreReached ? (G.R - r + 1) + ' walls to the field' : r + ' wall' + (r === 1 ? '' : 's') + ' to the core'}`;
    const rotIn = st.cfg.rotationPeriod > 0 ? st.cfg.rotationPeriod - (st.turn % st.cfg.rotationPeriod) : null;
    $('drums').classList.toggle('hidden', rotIn == null || st.over);
    if (rotIn != null) { $('drums').textContent = rotIn === 1 ? 'Drums! The walls turn after this move' : `Drums: the walls turn in ${rotIn} turns`; $('drums').classList.toggle('soon', rotIn === 1); }
    renderAllies();
    const mini = $('minimap');
    K.Render.draw(mini, g.playerView(), {});
  }

  function hintText() {
    const st = ui.game.state;
    if (ui.meta.mode === 'replay') return `Watching a recorded round. Every move is re-simulated from the seed: <b>${ui.replay.t}</b> of ${ui.replay.actions.length} turns played.`;
    if (st.over) return 'The round is over.';
    const near = st.sentinels.some((s) => st.player.visible.has(s.cell) && K.adjacent(st, s.cell, st.player.cell, 'kaurava'));
    const warn = near ? '<span class="warn">A sentinel is next to you!</span> Move away or stand beside an ally. ' : '';
    const rot = '';
    if (ui.level) return warn + esc(ui.level.def.goalText);
    if (!st.player.breached) return warn + 'Step through a <b>torch-lit gate</b> in the outer wall.' + rot;
    if (!st.player.coreReached) return warn + 'Head inward to the <b>golden light</b>. Walls can only be crossed at gates.' + rot;
    return warn + 'Get back out through an outer gate that is still <b>open</b> (green beam).' + rot;
  }

  function renderAllies() {
    const st = ui.game.state, comms = st.cond.allyComms, bot = passive();
    $('allies').innerHTML = st.allies.map((a) => {
      let status;
      if (comms) status = ACTION_TEXT[a.lastAction] || a.lastAction;
      else {
        const rec = st.player.belief.agents.get(a.id);
        status = !rec ? 'Not seen since you parted' : rec.turn === st.turn ? 'In sight' : `Last seen ${st.turn - rec.turn} turn${st.turn - rec.turn === 1 ? '' : 's'} ago`;
      }
      const queued = ui.pendingSignal && ui.pendingSignal.ally === a.id ? ui.pendingSignal.order : null;
      const showOrders = comms && !(ui.level && ui.level.def.hud.orders === false);
      const orders = showOrders ? `<div class="orders">${Object.keys(ORDER_LABEL).map((o) =>
        `<button data-ally="${a.id}" data-order="${o}" class="${queued === o ? 'queued' : !queued && a.mode === o ? 'active' : ''}" ${bot || st.over ? 'disabled' : ''} title="${esc(K.ORDERS[o])}">${ORDER_LABEL[o]}</button>`).join('')}</div>` : '';
      return `<div class="ally"><span class="avatar blue">${a.name[0]}</span><div><div class="ally-name">${a.name}<span class="ally-role">${a.role}</span></div>
        <div class="ally-status">${esc(status)}${queued ? ' · <b style="color:var(--gold)">order sent with your next move</b>' : ''}</div></div>${orders}</div>`;
    }).join('');
    $('allies').querySelectorAll('button[data-ally]').forEach((b) => b.addEventListener('click', () => {
      ui.pendingSignal = { ally: b.dataset.ally, order: b.dataset.order };
      K.Audio.play('click');
      renderAllies();
    }));
  }

  function feed(cls, text) {
    const d = document.createElement('div');
    d.className = cls;
    d.innerHTML = `<span class="t">T${ui.game ? ui.game.state.turn : 0}</span>${esc(text)}`;
    const f = $('feed');
    f.appendChild(d);
    while (f.children.length > 5) f.removeChild(f.firstChild);
  }
  let toastTimer = null;
  function toast(text, sub) {
    const t = $('toast');
    t.innerHTML = esc(text) + (sub ? `<small>${esc(sub)}</small>` : '');
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }
  let hintTimer = null;
  function flashHint(text) {
    $('hint').innerHTML = `<span class="warn">${esc(text)}</span>`;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { if (ui.game) $('hint').innerHTML = hintText(); }, 1600);
  }
  function tipOnce(key, text) {
    if (ui.tipsShown.has(key) || ui.level) return;
    ui.tipsShown.add(key);
    feed('info', text);
  }

  function narrate(events, ctx) {
    const st = ui.game.state;
    const reported = st.cond.allyComms;
    for (const e of events) {
      switch (e.type) {
        case 'signal': feed('ally-msg', `You signal ${e.ally}: "${e.order}".`); break;
        case 'breach': feed('info', 'You break into the Chakravyuha.'); toast('You are inside the Chakravyuha', 'Jayadratha moves to seal the gates behind you'); break;
        case 'core': feed('good', 'You reach the heart of the formation.'); toast('The core!', 'Now find a way out'); break;
        case 'rotation': feed('info', 'Drums. The walls turn, and the gates move.'); toast('The formation turns'); tipOnce('rot', 'Tip: faded walls are ones you saw before the turn. They may be wrong now.'); break;
        case 'sealing': if (ctx.gatekeeperSeen || reported) { feed('bad', `${ctx.gatekeeperSeen ? 'You see' : 'Allies report'} Jayadratha preparing to seal the ${compass(e.seg)} gate.`); flashHint(`Jayadratha is about to seal the ${compass(e.seg)} gate!`); } break;
        case 'sealed': if (ctx.sealPerceived) { feed('bad', `${ctx.gatekeeperSeen ? 'You see' : 'Allies report'}: the ${compass(e.seg)} gate is sealed.`); toast(`The ${compass(e.seg)} gate is sealed`, 'Find another way out, or have an ally hold one'); } break;
        case 'pressed': feed('bad', `Sentinels press you. Resolve -${e.drain}.`); tipOnce('press', 'Tip: an ally beside you blocks sentinel pressure.'); break;
        case 'covered': feed('good', `Your allies' cover absorbs ${e.saved}.`); break;
        case 'breakthrough': feed('bad', `You force your way past a sentinel. Resolve -${e.cost}.`); break;
        case 'swap': feed('ally-msg', `You change places with ${e.ally}.`); break;
        case 'blocked': feed('bad', 'That way is closed.'); break;
        case 'escaped': feed('good', 'You are back in the open field!'); toast('You escaped the Chakravyuha!'); break;
        case 'completed': feed('good', 'You reached the core.'); toast('Level complete!'); break;
        default: break;
      }
    }
    if (!ui.tipsShown.has('sentinel') && st.sentinels.some((s) => st.player.visible.has(s.cell))) tipOnce('sentinel', 'Tip: red soldiers are sentinels. Don\'t end a turn next to one.');
  }

  // ---------------- debrief ----------------
  const RESULT_TEXT = {
    completed: ['Level complete', 'win', 'You reached the core.'],
    escaped: ['You came back out', 'win', 'You reached the core and returned to the field. Abhimanyu never managed that.'],
    exhausted: ['Overwhelmed', 'loss', 'The sentinels wore down your resolve.'],
    encircled: ['Encircled', 'loss', 'Sentinels closed every way out around you.'],
    'sealed-in': ['Sealed inside', 'loss', 'Jayadratha sealed every outer gate while you were still inside.'],
    'sealed-out': ['Held at the gate', 'loss', 'Every outer gate was sealed before you could reach the core.'],
    timeout: ['The day ended', 'loss', 'The sun set before you finished.'],
    abandoned: ['Round ended', 'loss', 'You left the round early.'],
  };
  const LIKERT = [
    ['understood', 'I understood what was happening around me.'],
    ['enoughInfo', 'I had enough information to make good decisions.'],
    ['alliesHelped', 'My allies helped me reach my goal.'],
    ['difficulty', 'The scenario was difficult.'],
    ['enjoyed', 'I enjoyed playing.'],
  ];

  function endRound() {
    stopBot();
    if (ui.level && ui.meta.mode === 'tutorial') { showLevelResult(); return; }
    const g = ui.game, s = g.summary();
    ui.session = K.Logger.buildSession(g, ui.meta);
    let [title, cls, text] = RESULT_TEXT[s.result] || ['Round over', 'loss', ''];
    if (s.result !== 'escaped' && s.coreReached) { cls = 'partial'; title = "Abhimanyu's fate"; text = 'You reached the core, but not the way back out. ' + text; }
    K.Audio.play(s.result === 'escaped' ? 'win' : 'lose');
    $('outcomeTitle').textContent = title;
    $('outcomeTitle').className = 'outcome-title ' + cls;
    $('outcomeText').textContent = text;
    const pct = (x) => (x == null ? '—' : Math.round(x * 100) + '%');
    const metrics = [
      ['Score', s.score], ['Turns', s.turns], ['Resolve left', s.resolve], ['Best moves', pct(s.optimalRate)],
      ['Scouts', s.scouts], ['Orders', s.signals], ['Map known', pct(s.meanKnownFrac)], ['Map wrong', pct(s.meanStaleFrac)],
      ['Avg. think time', s.meanDecisionMs == null ? '—' : (s.meanDecisionMs / 1000).toFixed(1) + 's'], ['Gates sealed', s.gatesSealed],
      ...(s.adviceGiven ? [['Followed good counsel', pct(s.adviceGood ? s.followedGood / s.adviceGood : null)], ['Followed bad counsel', pct(s.overReliance)]] : []),
    ];
    $('metrics').innerHTML = metrics.map(([k, v]) => `<div class="metric"><b>${v}</b><span>${k}</span></div>`).join('');
    const parts = [['q-optimal', s.optimal], ['q-info', s.infoErrors], ['q-decision', s.decisionErrors], ['q-forced', s.forced]];
    $('qbar').innerHTML = parts.filter(([, n]) => n > 0).map(([c, n]) => `<div class="${c}" style="flex:${n}" title="${n} moves"></div>`).join('') || '<div class="q-forced" style="flex:1"></div>';
    const lines = [`${s.optimal} of your ${s.moves} moves were the best possible move in the <em>true</em> formation.`];
    const pl = (n, one, many) => (n === 1 ? one : many);
    if (s.infoErrors) lines.push(`${s.infoErrors} ${pl(s.infoErrors, "move was", "moves were")} right for the formation <em>as you believed it was</em>, but it had turned or you could not see it. Your information let you down there, not your judgement.`);
    if (s.decisionErrors) lines.push(`${s.decisionErrors} ${pl(s.decisionErrors, "move", "moves")} went off course even by what you knew. Some may have been on purpose, such as avoiding sentinels.`);
    lines.push(g.state.cond.allyComms ? (s.signals ? `You gave ${s.signals} order${s.signals === 1 ? '' : 's'} to your allies.` : 'Your allies could take orders, but you gave none.') : 'Your allies had no way to hear you and acted on what they saw.');
    if (s.adviceGiven) {
      lines.push(`Krishna's counsel came ${s.adviceGiven} times: ${s.adviceGood} right and ${s.adviceBad} wrong. You followed ${s.followedGood} of the right ones and ${s.followedBad} of the wrong ones.`);
      if (s.adviceBad && s.overReliance >= 0.5) lines.push('You often followed counsel that was wrong. Check advice against what you can see before acting on it.');
      else if (s.adviceGood && s.underReliance >= 0.5) lines.push('You often ignored counsel that was right. Advice that agrees with your own map is worth taking.');
      else lines.push('Your trust in the counsel was well calibrated.');
    }
    lines.push('Switch to <b>The truth</b> (top left) to see the real formation and where every enemy really was.');
    $('lesson').innerHTML = lines.map((l) => `<p>${l}</p>`).join('');
    const noForm = ui.meta.mode === 'bot' || ui.meta.mode === 'tutorial';
    $('likert').innerHTML = noForm ? `<p class="muted small">${ui.meta.mode === 'bot' ? 'Bot run' : 'Tutorial'}: no questionnaire.</p>` : LIKERT.map(([key, q]) =>
      `<div class="likert"><span>${q}</span><span class="scale">${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="fb_${key}" value="${n}" required>${n}</label>`).join('')}</span></div>`).join('') +
      '<p class="muted small">1 = strongly disagree, 5 = strongly agree.</p>';
    $('commentWrap').classList.toggle('hidden', noForm);
    $('saveNote').textContent = '';
    $('saveBtn').textContent = ui.study ? (ui.study.round >= ui.study.plan.length - 1 ? 'Save and finish' : ui.study.round < 0 ? 'Start round 1' : 'Save and start the next round') : 'Save and return to menu';
    show('debrief');
    setView(false);
    world.setLegal([]);
    world.showPath(null);
    world.setCameraMode('debrief');
  }
  function setView(truth) {
    $('viewBelief').classList.toggle('active', !truth);
    $('viewTruth').classList.toggle('active', truth);
    world.sync(truth ? ui.game.truthView() : ui.game.playerView(), { animate: true, coreReached: ui.game.state.player.coreReached });
  }
  $('viewBelief').addEventListener('click', () => setView(false));
  $('viewTruth').addEventListener('click', () => setView(true));

  $('feedbackForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (ui.meta.mode !== 'bot' && ui.meta.mode !== 'tutorial') {
      const fb = {};
      for (const [key] of LIKERT) { const el = document.querySelector(`input[name=fb_${key}]:checked`); fb[key] = el ? +el.value : null; }
      fb.comment = $('fbComment').value.trim() || null;
      ui.session.feedback = fb;
    }
    if (ui.meta.mode !== 'bot') {
      const ok = K.Logger.save(ui.session);
      if (!ok) { $('saveNote').textContent = 'This browser blocked local storage. Use "Download this session" to keep the data.'; return; }
    }
    if (ui.meta.mode === 'tutorial') flag('kurukshetra.tutorialDone', true);
    $('fbComment').value = '';
    if (ui.study && ui.study.round < ui.study.plan.length - 1) {
      ui.study.round++;
      const r = ui.study.round;
      startRound(ui.study.plan[r], { mode: 'study', participantId: ui.study.pid, round: r + 1 });
    } else {
      if (ui.study) { alert('Thank you. All rounds are saved.'); ui.study = null; }
      toMenu();
    }
  });
  $('exportOneBtn').addEventListener('click', () => {
    if (ui.session) K.Logger.download(`kurukshetra-${ui.session.id}.json`, JSON.stringify(ui.session, null, 2), 'application/json');
  });

  function toMenu() {
    stopBot();
    ui.game = null;
    ui.level = null;
    seedInput.value = 1 + Math.floor(Math.random() * 9999);
    show('menu');
    showMenuWorld();
  }

  // ---------------- pause & settings ----------------
  function setPaused(on) {
    if (on === !!ui.paused) return;
    ui.paused = on;
    $('pause').classList.toggle('hidden', !on);
    if (on) ui.pausedAt = performance.now();
    else if (ui.pausedAt != null) { ui.hiddenTotal += performance.now() - ui.pausedAt; ui.pausedAt = null; }
  }
  $('resumeBtn').addEventListener('click', () => setPaused(false));
  $('pauseHelpBtn').addEventListener('click', () => $('help').classList.remove('hidden'));
  $('pauseSettingsBtn').addEventListener('click', openSettings);
  $('pauseLeaveBtn').addEventListener('click', () => { setPaused(false); $('leaveBtn').click(); });
  $('menuSettingsBtn').addEventListener('click', openSettings);
  function openSettings() {
    const p = world.prefs;
    document.querySelector(`input[name=quality][value=${p.quality}]`).checked = true;
    document.querySelector(`input[name=motion][value=${p.motion}]`).checked = true;
    $('settingsSound').textContent = K.Audio.muted ? 'Off: turn on' : 'On: turn off';
    $('fpsLabel').textContent = `Rendering at about ${Math.round(world.fps)} frames per second.`;
    $('settingsModal').classList.remove('hidden');
  }
  document.querySelectorAll('input[name=quality]').forEach((r) => r.addEventListener('change', () => world.setQuality(r.value)));
  document.querySelectorAll('input[name=motion]').forEach((r) => r.addEventListener('change', () => world.setMotion(r.value)));
  $('settingsSound').addEventListener('click', () => { K.Audio.toggle(); soundLabel(); $('settingsSound').textContent = K.Audio.muted ? 'Off: turn on' : 'On: turn off'; });

  // ---------------- replay ----------------
  // A recorded session is re-simulated from its seed, config and action list. The engine is
  // deterministic, so this reproduces the original round exactly, and the replay checks that it does.
  const CLASS_COLOR = { optimal: '#3fae6a', 'info-error': '#e0a020', 'decision-error': '#e0453a', forced: '#8a8580', wait: '#5d576a', scout: '#29c8ff', invalid: '#5d576a', 'no-route': '#8a8580' };
  const CLASS_TEXT = { optimal: 'Best possible move', 'info-error': 'Right for what they knew, wrong in reality', 'decision-error': 'Off course even by what they knew', forced: 'Best route was blocked', wait: 'Waited', scout: 'Scouted', invalid: 'Tried a closed way', 'no-route': 'No route existed' };
  const toAction = (r) => {
    const a = r.action === 'move' ? { type: 'move', to: r.to } : { type: r.action };
    if (r.signal) a.signal = { ally: r.signal.ally, order: r.signal.order };
    return a;
  };
  const replayGame = (s) => K.createGame(Object.assign({ config: s.config }, s.condition));
  const turnClass = (r) => (r.action === 'move' ? r.moveClass : r.moveClass === 'invalid' ? 'invalid' : r.action);

  function enterReplay(session) {
    ui.study = null; ui.level = null;
    ui.meta = { mode: 'replay' };
    ui.replay = { s: session, actions: session.turns.map(toAction), t: 0, playing: false, truth: false, timer: null };
    // Determinism check: the full re-simulation must match the recorded summary.
    const check = replayGame(session);
    ui.replay.actions.forEach((a, i) => check.step(a, { advice: session.turns[i].advice }));
    const got = check.summary(), want = session.summary;
    const same = want.result === 'abandoned'
      ? got.turns === want.turns
      : got.result === want.result && got.turns === want.turns && got.score === want.score;
    $('rpVerify').textContent = same ? '✓ Verified: identical re-simulation' : 'Mismatch with the recording';
    $('rpVerify').className = 'rp-verify ' + (same ? 'ok' : 'bad');
    const c = session.condition;
    $('rpInfo').textContent = `${session.participantId || session.mode}${session.round ? ' · round ' + session.round : ''} · info ${c.infoLevel} · allies ${c.allyComms ? 'linked' : 'silent'} · Kauravas ${c.enemyComms ? 'linked' : 'independent'} · seed ${c.seed} · ${want.result}`;
    $('roundLabel').textContent = 'Replay';
    $('chips').innerHTML = '';
    document.querySelector('.actionbar').classList.add('hidden');
    $('replaybar').classList.remove('hidden');
    $('coach').classList.add('hidden');
    $('leaveBtn').textContent = 'Exit replay';
    show('game');
    world.setCameraMode('follow');
    replaySeek(0);
  }
  function replayView() { return ui.replay.truth ? ui.game.truthView() : ui.game.playerView(); }
  function replaySeek(t) {
    const R = ui.replay;
    t = Math.max(0, Math.min(R.actions.length, t));
    const g = replayGame(R.s);
    for (let i = 0; i < t; i++) g.step(R.actions[i], { advice: R.s.turns[i].advice });
    ui.game = g;
    R.t = t;
    world.load(g);
    world.sync(replayView(), { animate: false, coreReached: g.state.player.coreReached });
    world.setLegal([]);
    $('feed').innerHTML = '';
    renderHud();
    renderReplay();
  }
  function replayStep() {
    const R = ui.replay;
    if (R.t >= R.actions.length) { replayPause(); return; }
    const g = ui.game, st = g.state;
    const act0 = R.actions[R.t];
    const { events } = g.step(act0, { advice: R.s.turns[R.t].advice });
    R.t++;
    world.sync(replayView(), { animate: true, coreReached: st.player.coreReached });
    if (act0.type === 'move') world.stepSound();
    if (act0.type === 'scout') world.scoutPulse(st.info.vision + st.cfg.scoutBonus);
    const seesGk = st.player.visible.has(st.gatekeeper.cell);
    const ctx = { gatekeeperSeen: seesGk || R.truth, sealPerceived: seesGk || st.cond.allyComms || R.truth, adjacentSentinels: st.sentinels.filter((x) => K.adjacent(st, x.cell, st.player.cell, 'kaurava')).map((x) => x.id) };
    for (const e of events) { if (e.type === 'signal' && act0.signal) e.allyId = act0.signal.ally; world.playEvent(e, ctx); }
    narrate(events, ctx);
    renderHud();
    renderReplay();
  }
  function replayPlay() {
    const R = ui.replay;
    if (R.t >= R.actions.length) replaySeek(0);
    R.playing = true;
    $('rpPlay').textContent = '❚❚ Pause';
    const tick = () => {
      if (!R.playing) return;
      replayStep();
      if (R.t >= R.actions.length) { replayPause(); return; }
      R.timer = setTimeout(tick, 900 / (+$('rpSpeed').value));
    };
    tick();
  }
  function replayPause() { const R = ui.replay; if (!R) return; R.playing = false; clearTimeout(R.timer); $('rpPlay').textContent = '▶ Play'; }
  function replayToggle() { if (ui.replay.playing) replayPause(); else replayPlay(); }
  function replayStop() { replayPause(); ui.replay = null; }
  function renderReplay() {
    const R = ui.replay, turns = R.s.turns, n = Math.max(1, turns.length);
    const cv = $('rpTimeline'), dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const bw = W / n;
    turns.forEach((r, i) => {
      g.globalAlpha = i < R.t ? 1 : 0.35;
      g.fillStyle = CLASS_COLOR[turnClass(r)] || '#5d576a';
      g.fillRect(i * bw + 0.5, 6, Math.max(1, bw - 1), H - 12);
      if (r.events.includes('rotation')) { g.fillStyle = '#e8c98f'; g.fillRect(i * bw, 0, Math.max(1, bw - 1), 3); }
      if (r.events.includes('core')) { g.fillStyle = '#ffd36a'; g.beginPath(); g.arc(i * bw + bw / 2, H - 3, 3, 0, Math.PI * 2); g.fill(); }
      if (r.drain > 0) { g.fillStyle = '#ff5a4d'; g.fillRect(i * bw, H - 3, Math.max(1, bw - 1), 3); }
    });
    g.globalAlpha = 1;
    g.fillStyle = '#fff';
    g.fillRect(Math.min(W - 2, R.t * bw - 1), 0, 2, H);
    $('rpTurn').textContent = `Turn ${R.t} / ${turns.length}`;
    const nextRec = turns[R.t];
    world.setAdvice(nextRec && nextRec.advice && !R.truth ? nextRec.advice.to : null);
    const r = turns[R.t - 1];
    if (!r) { $('rpDecision').innerHTML = '<span class="muted">Press Play, use the arrow keys, or click the timeline. Green bars are best moves, amber are information errors and red are decision errors. Gold ticks mark the formation turning.</span>'; return; }
    const cls = turnClass(r);
    const think = r.decisionMs != null ? ` · thought for ${(r.decisionMs / 1000).toFixed(1)}s` : '';
    const sig = (r.signal ? ` · ordered ${esc(r.signal.ally)} to ${esc(r.signal.order)}` : '') + (r.advice ? ` · counsel was ${r.advice.good ? 'right' : 'wrong'} and was ${r.followed ? 'followed' : 'ignored'}` : '');
    $('rpDecision').innerHTML = `Turn ${r.t}: <span class="cls" style="background:${CLASS_COLOR[cls] || '#888'}">${CLASS_TEXT[cls] || esc(cls)}</span>${think}${sig} · knew ${Math.round(r.knownFrac * 100)}% of the map, ${Math.round(r.staleFrac * 100)}% of that wrong · resolve ${r.resolve}`;
  }
  $('rpPlay').addEventListener('click', replayToggle);
  $('rpFwd').addEventListener('click', () => { replayPause(); replayStep(); });
  $('rpBack').addEventListener('click', () => { replayPause(); replaySeek(ui.replay.t - 1); });
  $('rpStart').addEventListener('click', () => { replayPause(); replaySeek(0); });
  $('rpEnd').addEventListener('click', () => { replayPause(); replaySeek(ui.replay.actions.length); });
  $('rpTruth').addEventListener('click', () => {
    const R = ui.replay;
    R.truth = !R.truth;
    $('rpTruth').classList.toggle('active', R.truth);
    $('rpTruth').textContent = R.truth ? 'Show what they knew' : 'Show the truth';
    world.sync(replayView(), { animate: true, coreReached: ui.game.state.player.coreReached });
  });
  $('rpTimeline').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    replayPause();
    replaySeek(Math.round(((e.clientX - r.left) / r.width) * ui.replay.actions.length));
  });
  window.addEventListener('resize', () => { if (ui.replay) renderReplay(); });

  const replayId = new URLSearchParams(location.search).get('replay');
  if (replayId) {
    const rec = K.Logger.loadAll().find((x) => x.id === replayId);
    if (rec && rec.turns && rec.turns.length) enterReplay(rec);
    else alert('That recorded session was not found in this browser.');
  }

  // Debug/test hook (used by automated browser checks).
  globalThis.KURU_UI = { world, get game() { return ui.game; }, get replay() { return ui.replay; }, replayStep, replaySeek, setPaused, act, get busy() { return ui.busy; }, get level() { return ui.level; }, openLevels, showLevelCard };
})();
