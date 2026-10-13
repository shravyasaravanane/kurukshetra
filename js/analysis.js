/*
 * KURUKSHETRA — analysis.js
 * Dashboard: compares sessions across information and coordination conditions.
 */
(function () {
  'use strict';
  const K = globalThis.KURU;
  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const pct = (x) => (x == null ? '—' : Math.round(x * 100) + '%');
  const num = (x, d) => (x == null ? '—' : x.toFixed(d == null ? 1 : d));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // theme (shared with the game)
  try { const t = localStorage.getItem('kurukshetra.theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* ignore */ }
  $('themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('kurukshetra.theme', next); } catch (e) { /* ignore */ }
  });

  let all = K.Logger.loadAll();
  const filtered = () => {
    const m = $('filterMode').value;
    return all.filter((s) => (m === 'all' ? true : m === 'bot' ? s.mode === 'bot' : m === 'tutorial' ? s.mode === 'tutorial' : s.mode === 'play' || s.mode === 'study'));
  };

  // ---------------- tooltip ----------------
  const tip = $('tip');
  function showTip(e, html) { tip.innerHTML = html; tip.classList.add('show'); moveTip(e); }
  function moveTip(e) {
    const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = x + 'px'; tip.style.top = (e.clientY + 14) + 'px';
  }
  function hideTip() { tip.classList.remove('show'); }

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function hoverable(node, html) {
    node.addEventListener('mouseenter', (e) => showTip(e, html));
    node.addEventListener('mousemove', moveTip);
    node.addEventListener('mouseleave', hideTip);
  }
  // A bar with only its top corners rounded, anchored to the baseline.
  function topRoundedBar(x, y, w, h, r) {
    r = Math.min(r, h, w / 2);
    return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
  }

  // ---------------- chart A: grouped bars ----------------
  function drawWinChart(sessions) {
    const data = K.Stats.byInfoAndAlly(sessions);
    const W = 520, H = 260, m = { l: 40, r: 10, t: 16, b: 34 };
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Escape rate by information level and Pandava coordination' });
    const ih = H - m.t - m.b, iw = W - m.l - m.r;
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      const y = m.t + ih * (1 - v);
      el('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: 'var(--grid)', 'stroke-width': 1 }, svg);
      el('text', { x: m.l - 6, y: y + 4, 'text-anchor': 'end' }, svg).textContent = Math.round(v * 100) + '%';
    }
    const gw = iw / data.length, bw = Math.min(46, gw * 0.3);
    data.forEach((g, i) => {
      const cx = m.l + gw * i + gw / 2;
      el('text', { x: cx, y: H - 12, 'text-anchor': 'middle' }, svg).textContent = g.infoLevel[0].toUpperCase() + g.infoLevel.slice(1);
      g.series.forEach((s, j) => {
        const x = cx + (j === 0 ? -bw - 1 : 1);
        const label = `${g.infoLevel} information, coordination ${s.allyComms ? 'on' : 'off'}`;
        if (!s.n) {
          el('text', { x: x + bw / 2, y: m.t + ih - 4, 'text-anchor': 'middle' }, svg).textContent = 'n=0';
          return;
        }
        const h = Math.max(0, ih * s.escapeRate);
        const y = m.t + ih - h;
        // Generous invisible hit target over the whole column.
        const hit = el('rect', { x, y: m.t, width: bw, height: ih, fill: 'transparent' }, svg);
        if (h > 0) el('path', { d: topRoundedBar(x, y, bw, h, 4), fill: `var(--series-${j + 1})`, 'pointer-events': 'none' }, svg);
        else el('line', { x1: x, x2: x + bw, y1: m.t + ih, y2: m.t + ih, stroke: `var(--series-${j + 1})`, 'stroke-width': 2 }, svg);
        if (s.ci) { // 95% confidence interval whisker
          const y1 = m.t + ih * (1 - s.ci[1]), y0 = m.t + ih * (1 - s.ci[0]), cx2 = x + bw / 2;
          el('line', { x1: cx2, x2: cx2, y1, y2: y0, stroke: 'var(--text)', 'stroke-width': 1.2, opacity: 0.7, 'pointer-events': 'none' }, svg);
          for (const yy of [y1, y0]) el('line', { x1: cx2 - 5, x2: cx2 + 5, y1: yy, y2: yy, stroke: 'var(--text)', 'stroke-width': 1.2, opacity: 0.7, 'pointer-events': 'none' }, svg);
        }
        el('text', { x: x + bw / 2 + 9, y: y - 5, 'text-anchor': 'start', style: 'fill:var(--text)' }, svg).textContent = pct(s.escapeRate);
        hoverable(hit, `<b>${esc(label)}</b><br>Escaped: ${pct(s.escapeRate)} of ${s.n} rounds${s.ci ? `<br>95% CI ${pct(s.ci[0])} to ${pct(s.ci[1])}` : ''}`);
      });
    });
    $('chartWin').replaceChildren(svg);
  }

  // ---------------- chart B: 100% stacked horizontal bars ----------------
  function drawQualityChart(sessions) {
    const data = K.Stats.qualityByInfo(sessions);
    const W = 520, H = 200, m = { l: 70, r: 50, t: 10, b: 10 };
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Share of moves by quality class for each information level' });
    const iw = W - m.l - m.r, rowH = (H - m.t - m.b) / data.length, bh = Math.min(28, rowH * 0.5);
    const parts = [['optimal', 'Optimal'], ['info', 'Information error'], ['decision', 'Decision error'], ['forced', 'Route blocked']];
    data.forEach((d, i) => {
      const y = m.t + rowH * i + (rowH - bh) / 2;
      el('text', { x: m.l - 8, y: y + bh / 2 + 4, 'text-anchor': 'end' }, svg).textContent = d.infoLevel[0].toUpperCase() + d.infoLevel.slice(1);
      if (!d.moves) { el('text', { x: m.l, y: y + bh / 2 + 4 }, svg).textContent = 'no moves yet'; return; }
      const clipId = 'clip-q-' + i;
      const defs = el('defs', {}, svg);
      const cp = el('clipPath', { id: clipId }, defs);
      el('rect', { x: m.l, y, width: iw, height: bh, rx: 4 }, cp);
      const g = el('g', { 'clip-path': `url(#${clipId})` }, svg);
      let x = m.l;
      parts.forEach(([key, label], j) => {
        const w = iw * d[key];
        if (w <= 0) return;
        const seg = el('rect', { x, y, width: Math.max(0, w - 2), height: bh, fill: `var(--series-${j + 1})` }, g);
        hoverable(seg, `<b>${esc(d.infoLevel)} information</b><br>${label}: ${pct(d[key])} of ${d.moves} moves`);
        x += w;
      });
      el('text', { x: W - m.r + 6, y: y + bh / 2 + 4, style: 'fill:var(--text)' }, svg).textContent = pct(d.optimal);
    });
    $('chartQuality').replaceChildren(svg);
  }

  // ---------------- counsel ----------------
  const ADV_LABEL = { reliable: 'Reliable messenger', unreliable: 'Careless messenger', planner: "Krishna's insight", llm: 'AI Krishna', none: 'No counsel' };
  function drawCounsel(sessions) {
    const rows = K.Stats.byAdvisor(sessions).filter((r) => r.advisor !== 'none');
    $('counselSection').classList.toggle('hidden', rows.length === 0);
    if (!rows.length) return;
    const W = 520, H = 260, m = { l: 40, r: 10, t: 16, b: 46 };
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Share of good and bad counsel that players followed' });
    const ih = H - m.t - m.b, iw = W - m.l - m.r;
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      const y = m.t + ih * (1 - v);
      el('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: 'var(--grid)', 'stroke-width': 1 }, svg);
      el('text', { x: m.l - 6, y: y + 4, 'text-anchor': 'end' }, svg).textContent = Math.round(v * 100) + '%';
    }
    const gw = iw / rows.length, bw = Math.min(40, gw * 0.3);
    rows.forEach((r, i) => {
      const cx = m.l + gw * i + gw / 2;
      el('text', { x: cx, y: H - 26, 'text-anchor': 'middle' }, svg).textContent = ADV_LABEL[r.advisor];
      el('text', { x: cx, y: H - 12, 'text-anchor': 'middle' }, svg).textContent = r.explain ? 'with reasons' : 'no reasons';
      [['followGood', 1], ['followBad', 2]].forEach(([key, j], k) => {
        const v = r[key];
        if (v == null) return;
        const x = cx + (k === 0 ? -bw - 1 : 1), h = ih * v, y = m.t + ih - h;
        if (h > 0) el('path', { d: topRoundedBar(x, y, bw, h, 4), fill: `var(--series-${j})` }, svg);
        el('text', { x: x + bw / 2, y: y - 5, 'text-anchor': 'middle', style: 'fill:var(--text)' }, svg).textContent = pct(v);
        const hit = el('rect', { x, y: m.t, width: bw, height: ih, fill: 'transparent' }, svg);
        hoverable(hit, `<b>${ADV_LABEL[r.advisor]}${r.explain ? ', with reasons' : ''}</b><br>${key === 'followGood' ? 'Followed good counsel' : 'Followed bad counsel'}: ${pct(v)}<br>${r.n} rounds`);
      });
    });
    $('chartCounsel').replaceChildren(svg);
    const all = K.Stats.byAdvisor(sessions);
    $('counselTable').innerHTML = '<thead><tr><th class="l">Counsel</th><th class="l">Reasons</th><th>n</th><th>Escaped</th><th>Counsel right</th><th>Followed good</th><th>Followed bad</th><th>Appropriate</th></tr></thead><tbody>' +
      all.map((r) => `<tr><td class="l">${ADV_LABEL[r.advisor]}</td><td class="l">${r.explain == null ? '—' : r.explain ? 'yes' : 'no'}</td><td>${r.n}</td><td>${pct(r.escapeRate)}</td><td>${pct(r.adviceAccuracy)}</td><td>${pct(r.followGood)}</td><td>${pct(r.followBad)}</td><td>${pct(r.appropriate)}</td></tr>`).join('') + '</tbody>';
  }

  // ---------------- tables & tiles ----------------
  function renderTiles(sessions) {
    const people = new Set(sessions.map((s) => s.participantId).filter(Boolean));
    const d = sessions.length ? K.Stats.describe(sessions) : null;
    const tiles = [
      [sessions.length, 'Sessions'],
      [people.size || '—', 'Participants'],
      [d ? pct(d.escapeRate) : '—', 'Escaped'],
      [d ? pct(d.coreRate) : '—', 'Reached the core'],
      [d ? pct(d.optimalShare) : '—', 'Optimal moves'],
      [d && d.meanDecisionS != null ? d.meanDecisionS.toFixed(1) + 's' : '—', 'Average decision time'],
    ];
    $('tiles').innerHTML = tiles.map(([v, k]) => `<div class="tile"><b>${v}</b><span>${k}</span></div>`).join('');
  }

  function renderCondTable(sessions) {
    const rows = K.Stats.byCondition(sessions);
    const head = ['Information', 'Pandava coord.', 'Kaurava coord.', 'n', 'Escaped (95% CI)', 'Core', 'Score', 'Turns', 'Optimal', 'Info err.', 'Decision err.', 'Decision s', 'Scouts', 'Orders', 'Map wrong', 'Felt informed', 'Allies helped'];
    $('condTable').innerHTML = `<thead><tr>${head.map((h, i) => `<th class="${i < 3 ? 'l' : ''}">${h}</th>`).join('')}</tr></thead><tbody>` +
      rows.map((r) => `<tr><td class="l">${r.infoLevel}</td><td class="l">${r.allyComms ? 'on' : 'off'}</td><td class="l">${r.enemyComms ? 'on' : 'off'}</td>
        <td>${r.n}</td><td>${pct(r.escapeRate)} <span class="muted">${r.escapeCI ? `(${Math.round(r.escapeCI[0] * 100)}–${Math.round(r.escapeCI[1] * 100)})` : ''}</span></td><td>${pct(r.coreRate)}</td><td>${num(r.meanScore, 0)}</td><td>${num(r.meanTurns)}</td>
        <td>${pct(r.optimalShare)}</td><td>${pct(r.infoShare)}</td><td>${pct(r.decisionShare)}</td><td>${num(r.meanDecisionS)}</td>
        <td>${num(r.meanScouts)}</td><td>${num(r.meanSignals)}</td><td>${pct(r.meanStale)}</td><td>${num(r.fbEnoughInfo)}</td><td>${num(r.fbAlliesHelped)}</td></tr>`).join('') + '</tbody>';
  }

  function renderSessionTable(sessions) {
    const list = sessions.slice().sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)).slice(0, 300);
    $('sessionTable').innerHTML = `<thead><tr><th class="l">Started</th><th class="l">Participant</th><th class="l">Mode</th><th class="l">Condition</th><th class="l">Result</th><th>Turns</th><th>Score</th><th>Optimal</th><th></th></tr></thead><tbody>` +
      list.map((s) => `<tr><td class="l">${esc(new Date(s.startedAt).toLocaleString())}</td><td class="l">${esc(s.participantId || '—')}</td><td class="l">${esc(s.mode)}${s.round ? ' · R' + s.round : ''}</td>
        <td class="l">${esc(s.condition.infoLevel)} · P ${s.condition.allyComms ? 'on' : 'off'} · K ${s.condition.enemyComms ? 'on' : 'off'} · seed ${s.condition.seed}</td>
        <td class="l">${esc(s.summary.result)}${s.summary.coreReached && s.summary.result !== 'escaped' ? ' (core)' : ''}</td><td>${s.summary.turns}</td><td>${s.summary.score}</td><td>${pct(s.summary.optimalRate)}</td>
        <td><a class="btn small" href="index.html?replay=${encodeURIComponent(s.id)}" title="Watch this round again in 3D">Replay</a> <button data-del="${esc(s.id)}">Delete</button></td></tr>`).join('') + '</tbody>' +
      (sessions.length > 300 ? `<caption class="muted small">Showing the newest 300 of ${sessions.length}.</caption>` : '');
    $('sessionTable').querySelectorAll('button[data-del]').forEach((b) => b.addEventListener('click', () => {
      K.Logger.remove(b.dataset.del);
      all = all.filter((s) => s.id !== b.dataset.del);
      render();
    }));
  }

  function render() {
    const sessions = filtered();
    renderTiles(sessions);
    $('emptyState').classList.toggle('hidden', sessions.length > 0);
    $('content').classList.toggle('hidden', sessions.length === 0);
    if (!sessions.length) return;
    // The information experiment uses rounds without counsel; counsel rounds have their own section.
    const noCounsel = sessions.filter((s) => !s.condition.advisor || s.condition.advisor === 'none');
    drawWinChart(noCounsel);
    drawQualityChart(noCounsel);
    drawCounsel(sessions);
    renderCondTable(noCounsel);
    renderSessionTable(sessions);
  }

  function status(text) { $('status').textContent = text; }

  // ---------------- controls ----------------
  $('filterMode').addEventListener('change', render);

  $('importFile').addEventListener('change', async (e) => {
    let added = 0, bad = 0;
    for (const f of e.target.files) {
      try {
        for (const s of K.Logger.parseImport(await f.text())) {
          if (!all.some((x) => x.id === s.id)) { all.push(s); K.Logger.save(s); added++; }
        }
      } catch (err) { bad++; }
    }
    e.target.value = '';
    status(`Imported ${added} session${added === 1 ? '' : 's'}${bad ? `. ${bad} file${bad === 1 ? '' : 's'} could not be read` : ''}.`);
    render();
  });

  $('demoBtn').addEventListener('click', () => {
    status('Running bot games…');
    setTimeout(() => {
      const seeds = 8;
      let n = 0;
      for (const infoLevel of K.Stats.LEVELS) for (const allyComms of [false, true]) for (const enemyComms of [false, true]) {
        for (let seed = 1; seed <= seeds; seed++) {
          const game = K.createGame({ seed, infoLevel, allyComms, enemyComms });
          K.playBot(game, 'belief');
          const s = K.Logger.buildSession(game, { mode: 'bot', id: `BOT-${infoLevel}-${+allyComms}${+enemyComms}-${seed}` });
          all = all.filter((x) => x.id !== s.id);
          all.push(s);
          n++;
        }
      }
      // Counsel baseline: a calibrated-trust bot with a reliable and a careless messenger.
      for (const advisor of ['reliable', 'unreliable', 'planner']) for (let seed = 1; seed <= seeds; seed++) {
        const game = K.createGame({ seed, infoLevel: 'medium', allyComms: true, enemyComms: true, advisor, explain: true });
        K.playBot(game, 'calibrated');
        const s2 = K.Logger.buildSession(game, { mode: 'bot', id: `BOT-counsel-${advisor}-${seed}` });
        all = all.filter((x) => x.id !== s2.id);
        all.push(s2);
        n++;
      }
      const list = K.Logger.loadAll().filter((x) => !x.id.startsWith('BOT-')).concat(all.filter((x) => x.id.startsWith('BOT-')));
      try { localStorage.setItem('kurukshetra.sessions.v1', JSON.stringify(list)); } catch (err) { /* in-memory only */ }
      $('filterMode').value = 'bot';
      status(`Generated ${n} bot games (${seeds} seeds per condition).`);
      render();
    }, 30);
  });

  const stamp = () => new Date().toISOString().slice(0, 10);
  $('exportSummary').addEventListener('click', () => K.Logger.download(`kurukshetra-summary-${stamp()}.csv`, K.Logger.summaryCsv(filtered()), 'text/csv'));
  $('exportTurns').addEventListener('click', () => K.Logger.download(`kurukshetra-turns-${stamp()}.csv`, K.Logger.turnsCsv(filtered()), 'text/csv'));
  $('exportJson').addEventListener('click', () => K.Logger.download(`kurukshetra-sessions-${stamp()}.json`, JSON.stringify({ sessions: filtered() }, null, 1), 'application/json'));
  $('clearBtn').addEventListener('click', () => {
    if (!confirm('Delete every stored session in this browser? Export first if you need them.')) return;
    K.Logger.clear();
    all = [];
    render();
  });

  if (!filtered().length && all.some((s) => s.mode === 'bot')) $('filterMode').value = 'bot';
  render();
})();
