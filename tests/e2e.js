#!/usr/bin/env node
/*
 * End-to-end browser tests: drive the real game in headless Chrome.
 *   node tests/e2e.js        (skips cleanly if no Chrome/Edge is installed; set CHROME_PATH to override)
 */
const assert = require('assert');
const { launch, sleep, fileUrl } = require('../tools/cdp');

const results = [];
async function step(name, fn) {
  try { await fn(); results.push([true, name]); console.log('  ok   ' + name); }
  catch (e) { results.push([false, name]); console.log('  FAIL ' + name + '\n       ' + e.message); }
}

// Plays one bot move through the real UI path (KURU_UI.act), so rendering, HUD and logging all run.
const BOT_MOVE = `(() => { const u = KURU_UI, g = u.game; if (!g || g.over) return 'over'; if (u.busy) return 'busy';
  u.act(KURU.Bots.belief(g.state, window.__mem = window.__mem || {})); return 'moved'; })()`;

// Plays a learn-to-play level from its intro card to its result card.
async function playLevel(page) {
  await page.waitFor(`!document.getElementById('levelCard').classList.contains('hidden')`, 10000);
  await page.eval(`window.__mem = {}; document.getElementById('lcStart').click(); 'ok'`);
  await sleep(500);
  await playToEnd(page);
  await page.waitFor(`!document.getElementById('levelResult').classList.contains('hidden')`, 20000);
  return page.eval(`document.getElementById('lrTitle').textContent`);
}

async function playToEnd(page, timeoutMs) {
  const end = Date.now() + (timeoutMs || 180000);
  while (Date.now() < end) {
    if ((await page.eval(BOT_MOVE)) === 'over') return;
    await sleep(100);
  }
  throw new Error('round did not finish in time');
}

(async () => {
  const page = await launch();
  if (!page) { console.log('e2e: no Chrome or Edge found, skipping (set CHROME_PATH to run).'); process.exit(0); }
  try {
    await page.goto(fileUrl('index.html'), 2000);
    await page.eval(`localStorage.clear(); 'ok'`);
    await page.goto(fileUrl('index.html'), 2000);

    await step('menu renders with the 3D world', async () => {
      assert.ok(await page.eval(`!document.getElementById('menu').classList.contains('hidden')`));
      assert.ok(await page.eval(`!!document.getElementById('world').getContext && !!KURU_UI.world`));
    });

    await step('learn to play: levels unlock in order and teach with coach tips', async () => {
      await page.eval(`document.getElementById('tutorialBtn').click(); 'ok'`);
      await sleep(400);
      assert.strictEqual(await page.eval(`document.querySelectorAll('#levelGrid button:not([disabled])').length`), 1, 'only level 1 unlocked');
      await page.eval(`document.querySelector('#levelGrid button[data-level="0"]').click(); 'ok'`);
      await page.waitFor(`!document.getElementById('levelCard').classList.contains('hidden')`);
      await page.eval(`document.getElementById('lcStart').click(); 'ok'`);
      await sleep(600);
      assert.ok(await page.eval(`!document.getElementById('coach').classList.contains('hidden')`), 'coach tip visible');
      assert.ok(await page.eval(`document.querySelector('.hud-right').classList.contains('hidden')`), 'allies panel hidden in level 1');
      assert.ok(/Outside/.test(await page.eval(`document.getElementById('whereLabel').textContent`)), 'ring indicator');
      await playToEnd(page);
      await page.waitFor(`!document.getElementById('levelResult').classList.contains('hidden')`, 20000);
      assert.strictEqual(await page.eval(`document.getElementById('lrTitle').textContent`), 'Level complete');
      assert.strictEqual(await page.eval(`localStorage.getItem('kurukshetra.levelsDone')`), '1');
      await page.eval(`document.getElementById('lrNext').click(); 'ok'`);
      assert.strictEqual(await playLevel(page), 'Level complete', 'level 2');
      await page.eval(`document.getElementById('lrTruth').click(); document.getElementById('lrList').click(); 'ok'`);
      await sleep(300);
      assert.strictEqual(await page.eval(`document.querySelectorAll('#levelGrid button:not([disabled])').length`), 3, 'levels 1-3 unlocked');
      await page.eval(`document.getElementById('levelsBack').click(); 'ok'`);
      await sleep(600);
    });

    await step('free play: keyboard moves advance turns and the pause menu stops input', async () => {
      await page.eval(`localStorage.setItem('kurukshetra.introSeen','1'); document.getElementById('playBtn').click(); document.getElementById('bfBegin').click(); 'ok'`);
      await sleep(900);
      const t0 = await page.eval('KURU_UI.game.state.turn');
      await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })); 'ok'`);
      await sleep(800);
      await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); 'ok'`);
      await sleep(800);
      const t1 = await page.eval('KURU_UI.game.state.turn');
      assert.ok(t1 > t0, `turn advanced (${t0} -> ${t1})`);
      await page.eval(`KURU_UI.setPaused(true); 'ok'`);
      await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); 'ok'`);
      await sleep(700);
      assert.strictEqual(await page.eval('KURU_UI.game.state.turn'), t1, 'no turn while paused');
      await page.eval(`KURU_UI.setPaused(false); window.confirm = () => true; document.getElementById('leaveBtn').click(); 'ok'`);
      await sleep(600);
      await page.eval(`(() => { for (const k of ['understood','enoughInfo','alliesHelped','difficulty','enjoyed']) document.querySelector('input[name=fb_'+k+'][value="4"]').checked = true; document.getElementById('saveBtn').click(); return 1; })()`);
      await sleep(600);
    });

    await step('briefing, inspector and the after-action report', async () => {
      await page.eval(`document.getElementById('seed').value = 42; document.getElementById('playBtn').click(); 'ok'`);
      await sleep(400);
      assert.ok(await page.eval(`!document.getElementById('briefing').classList.contains('hidden')`), 'briefing shown before play');
      assert.ok(await page.eval(`document.querySelectorAll('#bfObjectives li').length === 3 && document.querySelectorAll('#bfAllies li').length === 3`), 'objectives and allies listed');
      await page.eval(`document.getElementById('bfBegin').click(); 'ok'`);
      await sleep(900);
      // inspect a tile that is not next to the player: it reports what is known and why it cannot be entered
      const far = await page.eval(`(() => { const st = KURU_UI.game.state, G = st.geom; return G.cellId(1, (G.segOf(st.player.cell) + 6) % G.S); })()`);
      await page.eval(`KURU_UI.select({ type: 'cell', cell: ${far} }); 'ok'`);
      assert.ok(await page.eval(`!document.getElementById('inspector').classList.contains('hidden') && /Ring 1/.test(document.getElementById('inspTitle').textContent)`), 'tile inspector');
      assert.ok(await page.eval(`/Never seen|Remembered/.test(document.getElementById('inspBody').textContent)`), 'visibility state from the player belief');
      await page.eval(`KURU_UI.select({ type: 'unit', id: 'player' }); 'ok'`);
      assert.ok(await page.eval(`/Abhimanyu/.test(document.getElementById('inspTitle').textContent)`), 'unit inspector');
      await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 'ok'`);
      assert.ok(await page.eval(`document.getElementById('inspector').classList.contains('hidden') && document.getElementById('pause').classList.contains('hidden')`), 'Esc closes the inspector first');
      assert.ok(await page.eval(`document.querySelectorAll('#intelBars .ibar').length === 3`), 'intelligence panel');
      await page.eval(`document.getElementById('camBtn').click(); 'ok'`);
      assert.strictEqual(await page.eval(`document.getElementById('camLabel').textContent`), 'Close-up');
      for (let i = 0; i < 4; i++) { await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); 'ok'`); await sleep(750); }
      await page.eval(`window.confirm = () => true; document.getElementById('leaveBtn').click(); 'ok'`);
      await sleep(700);
      assert.ok(await page.eval(`document.querySelectorAll('#rsObjectives li').length === 3`), 'objectives in the report');
      assert.ok(await page.eval(`document.querySelectorAll('#rsTimeline rect').length >= 4`), 'turn-by-turn strip');
      assert.ok(await page.eval(`document.querySelectorAll('#rsAgents li').length >= 4`), 'agents summary');
      for (const v of ['viewTruth', 'viewAllies', 'viewKaurava', 'viewBelief']) await page.eval(`document.getElementById('${v}').click(); 'ok'`);
      assert.ok(await page.eval(`document.getElementById('viewBelief').classList.contains('active')`));
      await page.eval(`document.getElementById('rsReplay').click(); 'ok'`);
      await sleep(500);
      assert.ok(await page.eval(`KURU_UI.replay && /Verified/.test(document.getElementById('rpVerify').textContent)`), 'replay from the report');
      await page.eval(`document.getElementById('leaveBtn').click(); 'ok'`);
      await sleep(500);
      assert.ok(await page.eval(`!document.getElementById('debrief').classList.contains('hidden') && KURU_UI.game.over`), 'back to the report');
      await page.eval(`(() => { for (const k of ['understood','enoughInfo','alliesHelped','difficulty','enjoyed']) document.querySelector('input[name=fb_'+k+'][value="4"]').checked = true; document.getElementById('saveBtn').click(); return 1; })()`);
      await sleep(600);
    });

    await step('study mode: four practice levels, then three counterbalanced rounds', async () => {
      await page.eval(`document.getElementById('studyBtn').click(); document.getElementById('participantId').value = 'E2E'; document.getElementById('studyStart').click(); 'ok'`);
      for (let i = 0; i < 4; i++) {
        assert.strictEqual(await playLevel(page), 'Level complete', 'practice level ' + (i + 1));
        await page.eval(`document.getElementById('lrNext').click(); 'ok'`);
      }
      const levels = [];
      for (let r = 1; r < 4; r++) {
        await sleep(700);
        await page.eval(`document.getElementById('bfBegin').click(); 'ok'`);
        await sleep(500);
        levels.push(await page.eval(`KURU_UI.game.state.cond.infoLevel`));
        await page.eval(`window.confirm = () => true; window.alert = () => {}; document.getElementById('leaveBtn').click(); 'ok'`);
        await sleep(500);
        await page.eval(`(() => { for (const k of ['understood','enoughInfo','alliesHelped','difficulty','enjoyed']) { const el = document.querySelector('input[name=fb_'+k+'][value="3"]'); if (el) el.checked = true; } document.getElementById('saveBtn').click(); return 1; })()`);
      }
      await sleep(700);
      assert.deepStrictEqual([...levels].sort(), ['high', 'low', 'medium'], 'each info level exactly once');
      const saved = await page.eval(`JSON.parse(localStorage.getItem('kurukshetra.sessions.v1')).filter((s) => s.participantId === 'E2E').map((s) => s.mode)`);
      assert.strictEqual(saved.filter((m) => m === 'study').length, 3, 'three study rounds');
      assert.strictEqual(saved.filter((m) => m === 'tutorial').length, 4, 'four practice levels');
    });

    await step("Krishna's counsel: marked tile, F follows it, and following is logged", async () => {
      await page.eval(`document.querySelector('input[name=advisor][value=reliable]').click(); document.getElementById('seed').value = 12; document.getElementById('playBtn').click(); document.getElementById('bfBegin').click(); 'ok'`);
      await sleep(900);
      assert.ok(await page.eval(`!document.getElementById('counsel').classList.contains('hidden')`), 'counsel panel visible');
      const advised = await page.eval(`KURU_UI.game && document.getElementById('counselText').textContent.length > 0`);
      assert.ok(advised, 'counsel text shown');
      await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true })); 'ok'`);
      await sleep(900);
      const rec = await page.eval(`JSON.stringify(KURU_UI.game.state.log[0])`);
      const r = JSON.parse(rec);
      assert.ok(r.advice && r.advice.source === 'reliable', 'advice logged');
      assert.strictEqual(r.followed, true, 'followed flag');
      await page.eval(`window.confirm = () => true; document.getElementById('leaveBtn').click(); 'ok'`);
      await sleep(600);
      await page.eval(`(() => { for (const k of ['understood','enoughInfo','alliesHelped','difficulty','enjoyed']) document.querySelector('input[name=fb_'+k+'][value="3"]').checked = true; document.getElementById('saveBtn').click(); return 1; })()`);
      await sleep(600);
      // AI Krishna without a key explains what is needed instead of failing silently
      await page.eval(`document.querySelector('input[name=advisor][value=llm]').click(); document.getElementById('apiKey').value = ''; document.getElementById('playBtn').click(); document.getElementById('bfBegin').click(); 'ok'`);
      await sleep(900);
      assert.ok(/API key/.test(await page.eval(`document.getElementById('counselText').textContent`)), 'no-key message');
      await page.eval(`window.confirm = () => true; document.getElementById('leaveBtn').click(); 'ok'`);
      await sleep(600);
      await page.eval(`(() => { for (const k of ['understood','enoughInfo','alliesHelped','difficulty','enjoyed']) document.querySelector('input[name=fb_'+k+'][value="3"]').checked = true; document.getElementById('saveBtn').click(); return 1; })()`);
      await page.eval(`document.querySelector('input[name=advisor][value=none]').click(); 'ok'`);
      await sleep(600);
    });

    let replayId = null;
    await step('analysis dashboard aggregates sessions and generates a bot baseline', async () => {
      await page.goto(fileUrl('analysis.html'), 1500);
      await page.eval(`document.getElementById('demoBtn').click(); 'ok'`);
      await page.waitFor(`document.getElementById('status').textContent.startsWith('Generated')`, 60000);
      const rows = await page.eval(`document.querySelectorAll('#condTable tbody tr').length`);
      assert.strictEqual(rows, 12);
      assert.ok(await page.eval(`document.querySelectorAll('#chartWin svg path').length >= 6`), 'chart bars');
      replayId = await page.eval(`JSON.parse(localStorage.getItem('kurukshetra.sessions.v1')).find((s) => s.mode === 'bot' && s.summary.result === 'escaped').id`);
      assert.ok(replayId);
    });

    await step('replay re-simulates a recorded round exactly', async () => {
      await page.goto(fileUrl('index.html?replay=' + encodeURIComponent(replayId)), 2500);
      const badge = await page.eval(`document.getElementById('rpVerify').textContent`);
      assert.ok(/Verified/.test(badge), badge);
      await page.eval(`document.getElementById('rpEnd').click(); 'ok'`);
      await sleep(400);
      assert.ok(await page.eval(`KURU_UI.replay.t === KURU_UI.replay.actions.length && KURU_UI.game.over`));
      await page.eval(`document.getElementById('rpStart').click(); document.getElementById('rpFwd').click(); 'ok'`);
      await sleep(400);
      assert.strictEqual(await page.eval('KURU_UI.replay.t'), 1);
    });

    await step('no uncaught JavaScript errors', async () => {
      assert.deepStrictEqual(page.errors, []);
    });
  } finally {
    await page.close();
  }
  const failed = results.filter((r) => !r[0]).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
