#!/usr/bin/env node
/*
 * Regenerates the README screenshots in docs/media/ using headless Chrome.
 *   node tools/screenshots.js
 */
const path = require('path');
const { launch, sleep, fileUrl } = require('./cdp');
const OUT = path.join(__dirname, '..', 'docs', 'media');
const shot = (page, name) => page.screenshot(path.join(OUT, name + '.png')).then(() => console.log('  ' + name + '.png'));

const BOT = `(() => { const u = KURU_UI, g = u.game; if (!g || g.over || u.busy) return g && g.over;
  u.act(KURU.Bots.belief(g.state, window.__m = window.__m || {})); return false; })()`;
async function botTurns(page, n) { for (let i = 0; i < n; i++) { await page.eval(BOT); await sleep(700); } }

(async () => {
  const page = await launch({ width: 1600, height: 900 });
  if (!page) { console.log('No Chrome or Edge found.'); process.exit(1); }
  try {
    await page.goto(fileUrl('index.html'), 1500);
    await page.eval(`localStorage.clear(); localStorage.setItem('kurukshetra.introSeen','1'); 'ok'`);
    await page.goto(fileUrl('index.html'), 3500);
    await shot(page, 'menu');

    await page.eval(`document.getElementById('introBtn').click(); 'ok'`);
    await sleep(9500);
    await shot(page, 'intro');
    await page.eval(`document.getElementById('skipIntro').click(); 'ok'`);
    await sleep(800);

    // Learn to play: the level list, then level 2 (the walls turn) a few turns in.
    await page.eval(`localStorage.setItem('kurukshetra.levelsDone','2'); document.getElementById('tutorialBtn').click(); 'ok'`);
    await sleep(900);
    await shot(page, 'levels');
    await page.eval(`KURU_UI.showLevelCard(1); 'ok'`);
    await sleep(400);
    await page.eval(`window.__m = {}; document.getElementById('lcStart').click(); 'ok'`);
    await sleep(2000);
    await botTurns(page, 4);
    await sleep(1800);
    await shot(page, 'tutorial');

    // Free play on a fixed seed with medium information, so the fog of war and stale walls show.
    await page.eval(`window.confirm = () => true; document.getElementById('leaveBtn').click(); 'ok'`);
    await sleep(900);
    await page.eval(`document.getElementById('lrList').click(); document.getElementById('levelsBack').click(); 'ok'`);
    await sleep(800);
    await page.eval(`document.getElementById('seed').value = 42; document.getElementById('playBtn').click(); 'ok'`);
    await sleep(1200);
    await shot(page, 'briefing');
    await page.eval(`document.getElementById('bfBegin').click(); 'ok'`);
    await sleep(1500);
    await botTurns(page, 14);
    await sleep(1800);
    await shot(page, 'gameplay');
    await page.eval(`(() => { const st = KURU_UI.game.state, G = st.geom; KURU_UI.select({ type: 'cell', cell: G.cellId(Math.max(1, G.ringOf(st.player.cell) - 1), (G.segOf(st.player.cell) + 2) % G.S) }); return 1; })()`);
    await sleep(1200);
    await shot(page, 'inspector');
    await page.eval(`KURU_UI.select(null); document.getElementById('camBtn').click(); document.getElementById('camBtn').click(); 'ok'`);
    await sleep(3500);
    await shot(page, 'overview-fog');
    await page.eval(`document.getElementById('camBtn').click(); 'ok'`);
    for (let i = 0; i < 200; i++) { if (await page.eval(BOT)) break; await sleep(300); }
    await sleep(3500);
    await shot(page, 'debrief');
    await page.eval(`document.querySelector('#debrief .results-panel').scrollTop = 900; 'ok'`);
    await sleep(500);
    await shot(page, 'debrief-analysis');
    await page.eval(`document.querySelector('#debrief .results-panel').scrollTop = 0; document.getElementById('viewTruth').click(); 'ok'`);
    await sleep(3500);
    await shot(page, 'debrief-truth');

    // Krishna's counsel in free play (reliable messenger).
    await page.eval(`(() => { for (const k of ['understood','enoughInfo','alliesHelped','difficulty','enjoyed']) document.querySelector('input[name=fb_'+k+'][value="4"]').checked = true; document.getElementById('saveBtn').click(); return 1; })()`);
    await sleep(1200);
    await page.eval(`document.querySelector('input[name=advisor][value=reliable]').click(); document.getElementById('seed').value = 12; document.getElementById('playBtn').click(); document.getElementById('bfBegin').click(); 'ok'`);
    await sleep(1500);
    await botTurns(page, 3);
    await sleep(1800);
    await shot(page, 'counsel');

    await page.goto(fileUrl('analysis.html'), 1500);
    await page.eval(`document.getElementById('demoBtn').click(); 'ok'`);
    await page.waitFor(`document.getElementById('status').textContent.startsWith('Generated')`, 40000);
    await sleep(500);
    await shot(page, 'analysis');

    const id = await page.eval(`JSON.parse(localStorage.getItem('kurukshetra.sessions.v1')).find((s) => s.id === 'BOT-medium-11-3' || (s.mode === 'bot' && s.summary.result === 'escaped')).id`);
    await page.goto(fileUrl('index.html?replay=' + encodeURIComponent(id)), 3000);
    await page.eval(`KURU_UI.replaySeek(Math.floor(KURU_UI.replay.actions.length * 0.45)); 'ok'`);
    await sleep(2500);
    await shot(page, 'replay');
  } catch (e) {
    console.error('status:', await page.eval("(document.getElementById('status') || {}).textContent").catch(() => '?'));
    console.error('page errors:', page.errors.join('\n') || 'none');
    console.error('url:', await page.eval('location.href').catch(() => '?'), '| demo button:', await page.eval("!!document.getElementById('demoBtn')").catch(() => '?'));
    throw e;
  } finally {
    await page.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
