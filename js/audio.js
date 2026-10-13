/*
 * KURUKSHETRA — audio.js
 * Tiny synthesised sound effects (Web Audio). No audio files needed.
 */
(function () {
  'use strict';
  const K = (globalThis.KURU = globalThis.KURU || {});
  let ctx = null, master = null, muted = false;
  try { muted = localStorage.getItem('kurukshetra.muted') === '1'; } catch (e) { /* ignore */ }

  function ensure() {
    if (ctx) return ctx;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    return ctx;
  }

  function tone(freq, dur, type, vol, glideTo, delay) {
    if (muted || !ensure()) return;
    const t0 = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise(dur, vol, filterFreq, delay) {
    if (muted || !ensure()) return;
    const t0 = ctx.currentTime + (delay || 0);
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq || 800;
    const g = ctx.createGain(); g.gain.value = vol || 0.4;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }

  const SFX = {
    step() { noise(0.08, 0.12, 500); },
    drum() { for (let i = 0; i < 3; i++) { tone(70, 0.35, 'sine', 0.5, 40, i * 0.22); noise(0.15, 0.25, 300, i * 0.22); } },
    conch() { tone(233, 1.2, 'sawtooth', 0.08, 247); tone(466, 1.2, 'sine', 0.12, 470); },
    chime() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.8, 'sine', 0.18, null, i * 0.09)); },
    thud() { tone(110, 0.25, 'square', 0.12, 55); noise(0.12, 0.3, 400); },
    shield() { tone(880, 0.3, 'triangle', 0.1, 1320); },
    seal() { tone(90, 0.6, 'sawtooth', 0.12, 60); noise(0.4, 0.3, 200); },
    order() { tone(660, 0.12, 'triangle', 0.12); tone(990, 0.15, 'triangle', 0.1, null, 0.08); },
    scout() { tone(400, 0.6, 'sine', 0.12, 1200); },
    win() { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.9, 'triangle', 0.15, null, i * 0.12)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.9, 'sine', 0.15, null, i * 0.2)); },
    click() { tone(1200, 0.05, 'square', 0.04); },
  };

  K.Audio = {
    play(name) { try { SFX[name] && SFX[name](); } catch (e) { /* ignore */ } },
    unlock() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); },
    get muted() { return muted; },
    toggle() { muted = !muted; try { localStorage.setItem('kurukshetra.muted', muted ? '1' : '0'); } catch (e) { /* ignore */ } return muted; },
  };
})();
