/*
 * KURUKSHETRA — world3d.js
 * The 3D battlefield. It renders a VIEW (the player's belief during play, the
 * truth only in the debrief), so what you see is exactly what you know:
 *   solid stone wall        known wall, seen this turn
 *   faded wall / gate       remembered, may have moved since
 *   misty glass wall        never seen
 *   torch-lit gap           a gate
 */
(function () {
  'use strict';
  const K = (globalThis.KURU = globalThis.KURU || {});
  const T = globalThis.THREE;
  const C = () => K.Characters;

  const RC = 4.5, RW = 4.2, WALL_T = 0.7;
  const TAU = Math.PI * 2;
  const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  const lerp = (a, b, k) => a + (b - a) * k;

  function noiseTexture(base, vary, size, blocks) {
    const c = document.createElement('canvas');
    c.width = c.height = size || 256;
    const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, c.width, c.height);
    const col = new T.Color(base);
    for (let i = 0; i < c.width * c.height / 18; i++) {
      const v = (Math.random() - 0.5) * vary;
      g.fillStyle = `rgb(${Math.max(0, Math.min(255, col.r * 255 + v * 255))},${Math.max(0, Math.min(255, col.g * 255 + v * 230))},${Math.max(0, Math.min(255, col.b * 255 + v * 200))})`;
      g.fillRect(Math.random() * c.width, Math.random() * c.height, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    if (blocks) {
      g.strokeStyle = 'rgba(40,25,15,0.45)'; g.lineWidth = 3;
      const rows = 4, cols = 4;
      for (let r = 0; r <= rows; r++) { g.beginPath(); g.moveTo(0, r * c.height / rows); g.lineTo(c.width, r * c.height / rows); g.stroke(); }
      for (let r = 0; r < rows; r++) for (let q = 0; q <= cols; q++) {
        const x = (q + (r % 2) * 0.5) * c.width / cols;
        g.beginPath(); g.moveTo(x, r * c.height / rows); g.lineTo(x, (r + 1) * c.height / rows); g.stroke();
      }
    }
    const tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  }

  function glowTexture(color) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, color); gr.addColorStop(0.35, color.replace('1)', '0.5)')); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new T.CanvasTexture(c);
  }

  // Final pass: sRGB encoding after bloom, matching three.js's own forward-render output.
  const FINAL_SHADER = {
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    // In three r128 materials are already tone-mapped when rendering into a target, so this pass only
    // encodes to sRGB (LinearTosRGB is injected into every ShaderMaterial).
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main() { vec4 t = texture2D(tDiffuse, vUv); gl_FragColor = LinearTosRGB(vec4(t.rgb, 1.0)); }',
  };

  const loadPref = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
  const savePref = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };

  function create(canvas) {
    const prefs = { quality: loadPref('kurukshetra.quality', 'high'), motion: loadPref('kurukshetra.motion', 'full') };
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(prefs.quality === 'high' ? Math.min(2, window.devicePixelRatio || 1) : 1);
    renderer.shadowMap.enabled = prefs.quality === 'high';
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    const scene = new T.Scene();
    const FOG_SRGB = 0x3a281c;
    scene.fog = new T.Fog(FOG_SRGB, 70, 210);
    const camera = new T.PerspectiveCamera(48, 1, 0.5, 900);

    // ---------------- post-processing: bloom, vignette, gamma, FXAA ----------------
    let composer = null, bloom = null, fxaa = null;
    function buildComposer() {
      composer = null;
      if (sky) sky.material.uniforms.toLinear.value = 0;
      // three applies fog after sRGB encoding in a forward render, but before it in our HDR pipeline.
      scene.fog.color.set(FOG_SRGB);
      if (prefs.quality !== 'high' || !T.EffectComposer || !T.UnrealBloomPass) return;
      // Render in HDR (half float), bloom the highlights, then tone-map and encode once at the end.
      const hdr = new T.WebGLRenderTarget(256, 256, { type: T.HalfFloatType, format: T.RGBAFormat, minFilter: T.LinearFilter, magFilter: T.LinearFilter });
      composer = new T.EffectComposer(renderer, hdr);
      if (sky) sky.material.uniforms.toLinear.value = 1;
      scene.fog.color.set(FOG_SRGB).convertSRGBToLinear();
      composer.addPass(new T.RenderPass(scene, camera));
      bloom = new T.UnrealBloomPass(new T.Vector2(256, 256), 0.6, 0.45, 0.86);
      composer.addPass(bloom);
      const finalPass = new T.ShaderPass(FINAL_SHADER);
      composer.addPass(finalPass);
      if (T.VignetteShader) { const v = new T.ShaderPass(T.VignetteShader); v.uniforms.offset.value = 1.0; v.uniforms.darkness.value = 1.35; composer.addPass(v); }
      if (T.FXAAShader) { fxaa = new T.ShaderPass(T.FXAAShader); composer.addPass(fxaa); }
    }

    // ---------------- sky, light, ground ----------------
    const sky = new T.Mesh(new T.SphereGeometry(500, 32, 16), new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new T.Color('#151b30') }, mid: { value: new T.Color('#9a5230') }, bottom: { value: new T.Color('#3a281c') }, toLinear: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform float toLinear; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h*1.6,0.0,1.0),0.7)) : bottom; if (toLinear > 0.5) c = pow(c, vec3(2.2)); gl_FragColor = vec4(c,1.0); }',
    }));
    scene.add(sky);
    // The sun, low over the battlefield
    const sunDisc = new T.Sprite(new T.SpriteMaterial({ map: glowTexture('rgba(255,214,150,1)'), color: 0xffe0b0, fog: false, depthWrite: false, transparent: true, blending: T.AdditiveBlending }));
    sunDisc.position.set(-260, 60, -240); sunDisc.scale.set(110, 110, 1);
    scene.add(sunDisc);

    const hemi = new T.HemisphereLight(0x9aa6c4, 0x2a1c12, 0.36); // cool sky fill, dark earth bounce
    scene.add(hemi);
    const sun = new T.DirectionalLight(0xffc98a, 1.65);
    sun.position.set(-62, 40, -34);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 10, far: 220 });
    sun.shadow.bias = -0.0008;
    scene.add(sun);

    const groundTex = noiseTexture('#3a2a1c', 0.26, 256);
    groundTex.repeat.set(60, 60);
    const ground = new T.Mesh(new T.CircleGeometry(600, 64), new T.MeshStandardMaterial({ map: groundTex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);

    const tweens = [];
    function tween(dur, fn, done) { tweens.push({ t: 0, dur, fn, done }); }

    // ---------------- formation geometry (built in load) ----------------
    let geom = null, segA = 0;
    const formation = new T.Group();
    scene.add(formation);
    const rIn = (r) => (r === 0 ? 0 : RC + (r - 1) * RW);
    const rOut = (r) => (r === 0 ? RC : RC + r * RW);
    const angleOf = (s) => -Math.PI / 2 + s * segA;
    // Terraces: the formation rises ring by ring toward a raised core; the field is level ground.
    const TERRACE = 0.22;
    const ringH = (r) => (!geom ? 0 : r === 0 ? TERRACE * (geom.R + 1) + 0.12 : r > geom.R ? 0 : TERRACE * (geom.R + 1 - r));
    function cellPos(cell, out) {
      out = out || new T.Vector3();
      if (cell == null) return out.set(0, 0, 0);
      if (cell === 0) return out.set(0, ringH(0), 0);
      const r = geom.ringOf(cell), a = angleOf(geom.segOf(cell));
      const rad = (rIn(r) + rOut(r)) / 2;
      return out.set(Math.cos(a) * rad, ringH(r), Math.sin(a) * rad);
    }
    function sectorGeom(r1, r2) { // centred on segment 0
      const a1 = -segA / 2, a2 = segA / 2;
      const g = new T.RingGeometry(r1, r2, 10, 1, -a2, a2 - a1);
      g.rotateX(-Math.PI / 2);
      return g;
    }
    // A slightly wider stone course along the top of a wall, sitting from h to h + 0.16.
    function copingGeom(R, h) {
      const a1 = -segA / 2 + 0.004, a2 = segA / 2 - 0.004, w = WALL_T / 2 + 0.09;
      const sh = new T.Shape();
      sh.absarc(0, 0, R + w, -a2, -a1, false);
      sh.absarc(0, 0, R - w, -a1, -a2, true);
      const g = new T.ExtrudeGeometry(sh, { depth: 0.16, bevelEnabled: false, curveSegments: 10 });
      g.rotateX(-Math.PI / 2);
      g.translate(0, h, 0);
      return g;
    }
    function wallGeom(R, h) {
      const a1 = -segA / 2 + 0.004, a2 = segA / 2 - 0.004;
      const sh = new T.Shape();
      sh.absarc(0, 0, R + WALL_T / 2, -a2, -a1, false);
      sh.absarc(0, 0, R - WALL_T / 2, -a1, -a2, true);
      const g = new T.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 10 });
      g.rotateX(-Math.PI / 2);
      return g;
    }

    const stoneTex = noiseTexture('#b89a72', 0.22, 256, true);
    stoneTex.repeat.set(1.5, 0.6);
    const M = {
      stone: new T.MeshStandardMaterial({ map: stoneTex, color: 0x4a2c1c, roughness: 0.82 }),
      stoneOuter: new T.MeshStandardMaterial({ map: stoneTex, color: 0x3a2014, roughness: 0.82 }),
      coping: new T.MeshStandardMaterial({ map: stoneTex, color: 0x6a4c2e, roughness: 0.7 }),
      bronze: new T.MeshStandardMaterial({ color: 0x8c6a3c, metalness: 0.65, roughness: 0.38 }),
      stale: new T.MeshStandardMaterial({ map: stoneTex, color: 0x9a8f86, roughness: 0.9, transparent: true, opacity: 0.42, depthWrite: false }),
      ghost: new T.MeshStandardMaterial({ color: 0x9fb6d0, roughness: 0.3, transparent: true, opacity: 0.13, depthWrite: false, emissive: 0x23344a, emissiveIntensity: 0.6 }),
      pillar: new T.MeshStandardMaterial({ map: stoneTex, color: 0x6b4a30, roughness: 0.7 }),
      pillarStale: new T.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.7, transparent: true, opacity: 0.45 }),
      gold: new T.MeshStandardMaterial({ color: 0xe3b23c, metalness: 0.6, roughness: 0.3, emissive: 0x6b4a10, emissiveIntensity: 0.4 }),
      sealed: new T.MeshStandardMaterial({ color: 0x5a1712, roughness: 0.8, emissive: 0x3a0806, emissiveIntensity: 0.6 }),
      flame: new T.SpriteMaterial({ map: glowTexture('rgba(255,170,60,1)'), blending: T.AdditiveBlending, depthWrite: false, transparent: true }),
      highlight: new T.MeshBasicMaterial({ color: 0xff8c00, transparent: true, opacity: 0.6, depthWrite: false, side: T.DoubleSide, toneMapped: false }),
      highlightBad: new T.MeshBasicMaterial({ color: 0xff4a3d, transparent: true, opacity: 0.35, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }),
    };
    const FLOOR = {
      lit: new T.Color('#82603a'), seen: new T.Color('#2e241c'), fog: new T.Color('#0a0809'),
      field: new T.Color('#54432a'), fieldSeen: new T.Color('#231d14'), fieldFog: new T.Color('#0d0b08'),
    };

    let floors = [], walls = [], floorPick = [], coreMesh = null, highlightPool = [], beacon = null, lotus = null, exitBeacons = [];
    let pathDots = [];
    let troopBody = null, troopHead = null;
    let mist = [];
    const MIST_MAT = new T.ShaderMaterial({
      transparent: true, depthWrite: false, side: T.DoubleSide, fog: false,
      uniforms: { time: { value: 0 }, opacity: { value: 0 }, color: { value: new T.Color('#1b1820') } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: [
        'uniform float time; uniform float opacity; uniform vec3 color; varying vec3 vW;',
        'float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }',
        'float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);',
        '  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }',
        'void main(){ vec2 p = vW.xz * 0.18 + vec2(time*0.05, time*0.03);',
        '  float m = n(p) * 0.6 + n(p*2.3 - time*0.04) * 0.4;',
        '  gl_FragColor = vec4(color, opacity * (0.55 + 0.45 * m)); }',
      ].join(String.fromCharCode(10)),
    });
    let ringLabels = [], qMarks = [], staleTags = [];
    const texCache = new Map();
    function textTexture(text, opts) {
      const key = text + '|' + JSON.stringify(opts || {});
      if (texCache.has(key)) return texCache.get(key);
      const o = Object.assign({ w: 512, h: 128, font: '700 72px Georgia, serif', fg: '#fff3dc', bg: null, stroke: null }, opts || {});
      const c = document.createElement('canvas'); c.width = o.w; c.height = o.h;
      const g = c.getContext('2d');
      if (o.bg) {
        g.fillStyle = o.bg;
        g.beginPath();
        if (g.roundRect) g.roundRect(4, 4, o.w - 8, o.h - 8, (o.h - 8) / 2); else g.rect(4, 4, o.w - 8, o.h - 8);
        g.fill();
        if (o.stroke) { g.strokeStyle = o.stroke; g.lineWidth = 6; g.stroke(); }
      }
      g.font = o.font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = o.fg;
      g.fillText(text, o.w / 2, o.h / 2 + 4);
      const t = new T.CanvasTexture(c);
      texCache.set(key, t);
      return t;
    }
    function marker(text, opts, scale) {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: textTexture(text, opts), transparent: true, depthTest: false, toneMapped: false }));
      sp.scale.set(scale[0], scale[1], 1);
      sp.renderOrder = 9;
      return sp;
    }
    const dummy = new T.Object3D();
    const PER = 3;

    function makeGate(R, h, outer) {
      const g = new T.Group();
      const parts = { flames: [], pillars: [] };
      for (const side of [-1, 1]) {
        const a = side * (segA / 2 - 0.05);
        const x = Math.cos(a) * R, z = Math.sin(a) * R;
        const pil = new T.Mesh(new T.CylinderGeometry(0.42, 0.5, h + 0.9, 8), M.pillar);
        pil.position.set(x, (h + 0.9) / 2, z);
        pil.castShadow = true;
        const cap = new T.Mesh(new T.ConeGeometry(0.6, 0.7, 8), M.gold);
        cap.position.set(x, h + 1.25, z);
        const flame = new T.Sprite(M.flame);
        flame.position.set(x, h + 1.9, z);
        flame.scale.set(1.6, 2.2, 1);
        g.add(pil, cap, flame);
        parts.pillars.push(pil);
        parts.flames.push(flame);
      }
      // A bronze lintel spanning the opening: the gate reads as an architectural doorway
      {
        const a = segA / 2 - 0.05, sh = new T.Shape();
        sh.absarc(0, 0, R + 0.22, -a, a, false);
        sh.absarc(0, 0, R - 0.22, a, -a, true);
        const lg = new T.ExtrudeGeometry(sh, { depth: 0.26, bevelEnabled: false, curveSegments: 12 });
        lg.rotateX(-Math.PI / 2);
        const lintel = new T.Mesh(lg, M.bronze);
        lintel.position.y = h + 0.62;
        lintel.castShadow = true;
        g.add(lintel);
        parts.lintel = lintel;
      }
      // A glowing threshold on the ground: reads as "a way through" from any angle
      const banner = new T.Mesh((() => { const a = segA / 2 - 0.12; const gg = new T.RingGeometry(R - 0.9, R + 0.9, 8, 1, -a, 2 * a); gg.rotateX(-Math.PI / 2); return gg; })(),
        new T.MeshBasicMaterial({ color: outer ? 0xffb347 : 0xffd27a, transparent: true, opacity: 0.55, depthWrite: false, side: T.DoubleSide }));
      banner.position.y = 0.05;
      g.add(banner);
      parts.banner = banner;
      for (const side of [-1, 1]) {
        const a = side * (segA / 2 - 0.05);
        const flag = new T.Mesh(new T.PlaneGeometry(0.9, 1.3), new T.MeshStandardMaterial({ color: outer ? 0xa8402a : 0xc98a2e, side: T.DoubleSide, roughness: 0.85 }));
        flag.position.set(Math.cos(a) * R, h + 0.2, Math.sin(a) * R + side * 0.0);
        flag.rotation.y = -a;
        flag.position.x += Math.cos(a) * 0.55;
        flag.position.z += Math.sin(a) * 0.55;
        g.add(flag);
      }
      // Barricade (only ever shown on sealed outer gates)
      const bar = new T.Group();
      for (const t of [-0.35, 0.35]) {
        const log = new T.Mesh(new T.BoxGeometry(0.35, 0.35, R * segA * 1.05), M.sealed);
        log.position.set(R, 1.1, 0);
        log.rotation.x = t * 1.6;
        bar.add(log);
      }
      bar.visible = false;
      g.add(bar);
      parts.bar = bar;
      g.userData = parts;
      return g;
    }

    function clearFormation() {
      while (formation.children.length) formation.remove(formation.children[0]);
      floors = []; walls = []; floorPick = []; highlightPool = []; exitBeacons = []; pathDots = []; adviceMark = null;
    }

    function buildFormation(g) {
      clearFormation();
      geom = g;
      segA = TAU / geom.S;
      // floors
      const ringGeos = [];
      for (let r = 1; r <= geom.FIELD; r++) ringGeos[r] = sectorGeom(rIn(r) + 0.02, rOut(r) - 0.02);
      for (let r = 1; r <= geom.FIELD; r++) {
        for (let s = 0; s < geom.S; s++) {
          const cell = geom.cellId(r, s);
          const m = new T.Mesh(ringGeos[r], new T.MeshStandardMaterial({ color: FLOOR.fog.clone(), roughness: 0.95 }));
          m.rotation.y = -angleOf(s);
          m.position.y = ringH(r) + 0.01;
          m.receiveShadow = true;
          m.userData = { cell, field: r === geom.FIELD, target: FLOOR.fog.clone() };
          formation.add(m);
          floors[cell] = m;
          floorPick.push(m);
        }
      }
      // core
      coreMesh = new T.Mesh(new T.CircleGeometry(RC - 0.05, 40), new T.MeshStandardMaterial({ color: 0xe9c46a, emissive: 0x8a5a12, emissiveIntensity: 0.35, roughness: 0.5 }));
      coreMesh.rotation.x = -Math.PI / 2; coreMesh.position.y = ringH(0) + 0.02;
      coreMesh.userData = { cell: 0, target: new T.Color(0xe9c46a) };
      formation.add(coreMesh);
      floors[0] = coreMesh;
      floorPick.push(coreMesh);
      // core beacon + lotus
      beacon = new T.Mesh(new T.CylinderGeometry(1.4, 2.4, 60, 24, 1, true), new T.MeshBasicMaterial({ color: 0xffc95a, transparent: true, opacity: 0.18, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
      beacon.position.y = 30;
      formation.add(beacon);
      lotus = new T.Group();
      for (let i = 0; i < 10; i++) {
        const petal = new T.Mesh(new T.SphereGeometry(0.55, 10, 8), M.gold);
        petal.scale.set(0.45, 0.25, 1.4);
        const a = (i / 10) * TAU;
        petal.position.set(Math.cos(a) * 1.0, 0.5, Math.sin(a) * 1.0);
        petal.rotation.y = -a + Math.PI / 2;
        petal.rotation.x = -0.5;
        lotus.add(petal);
      }
      const bud = new T.Mesh(new T.SphereGeometry(0.6, 16, 12), M.gold);
      bud.position.y = 0.8;
      lotus.add(bud);
      lotus.position.y = ringH(0) + 0.1;
      formation.add(lotus);
      // Stone risers between terraces give the formation real depth.
      const riserMat = new T.MeshStandardMaterial({ map: stoneTex, color: 0x4a3524, roughness: 0.92 });
      for (let r = 0; r <= geom.R; r++) {
        const hi = ringH(r), lo = ringH(r + 1), h = hi - lo;
        if (h <= 0.001) continue;
        const riser = new T.Mesh(new T.CylinderGeometry(rOut(r), rOut(r), h, 72, 1, true), riserMat);
        riser.position.y = lo + h / 2;
        riser.receiveShadow = true;
        formation.add(riser);
      }
      // Drifting mist over ground the player has never seen (thin haze over remembered ground).
      mist = [];
      const mistGeos = [];
      for (let r = 1; r <= geom.FIELD; r++) mistGeos[r] = sectorGeom(rIn(r) + 0.05, rOut(r) - 0.05);
      for (let r = 1; r <= geom.FIELD; r++) for (let s2 = 0; s2 < geom.S; s2++) {
        const mm = new T.Mesh(mistGeos[r], MIST_MAT.clone());
        mm.rotation.y = -angleOf(s2);
        mm.position.y = ringH(r) + 0.6;
        mm.renderOrder = 3;
        mm.userData = { cell: geom.cellId(r, s2), target: 0 };
        formation.add(mm);
        mist[geom.cellId(r, s2)] = mm;
      }
      const coreLight = new T.PointLight(0xffc35a, 1.4, 22);
      coreLight.position.set(0, ringH(0) + 4, 0);
      formation.add(coreLight);

      // walls
      for (let k = 0; k <= geom.R; k++) {
        const R = rOut(k);
        const outer = k === geom.R;
        const h = outer ? 1.5 : k === 0 ? 0.9 : 1.05;
        const wg = wallGeom(R, h);
        const cg = copingGeom(R, h);
        walls[k] = [];
        for (let s = 0; s < geom.S; s++) {
          const solid = new T.Mesh(wg, outer ? M.stoneOuter : M.stone);
          solid.castShadow = true; solid.receiveShadow = true;
          const cap = new T.Mesh(cg, M.coping);
          cap.castShadow = true;
          solid.add(cap);
          solid.userData.cap = cap;
          const ghost = new T.Mesh(wg, M.ghost);
          for (const m of [solid, ghost]) { m.rotation.y = -angleOf(s); m.position.y = ringH(k + 1); m.visible = false; m.scale.y = 0.001; formation.add(m); }
          walls[k][s] = { k, s, R, h, outer, solid, ghost, gate: null, state: 'none', stale: false };
        }
      }
      // Living walls: a rank of Kaurava soldiers behind every wall segment you know about
      const total = (geom.R + 1) * geom.S * PER;
      troopBody = new T.InstancedMesh(new T.CylinderGeometry(0.27, 0.36, 1.45, 7), new T.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.85 }), total);
      troopHead = new T.InstancedMesh(new T.ConeGeometry(0.26, 0.55, 7), new T.MeshStandardMaterial({ color: 0xa8854a, metalness: 0.6, roughness: 0.35 }), total);
      troopBody.castShadow = troopHead.castShadow = true;
      dummy.scale.set(0, 0, 0); dummy.updateMatrix();
      for (let i = 0; i < total; i++) { troopBody.setMatrixAt(i, dummy.matrix); troopHead.setMatrixAt(i, dummy.matrix); }
      formation.add(troopBody, troopHead);
      let base = 0;
      for (let k = 0; k <= geom.R; k++) for (let s = 0; s < geom.S; s++) { walls[k][s].troopBase = base; walls[k][s].troopScale = 0; base += PER; }
      // Ring labels lying on the ground; repositioned each frame to face the camera.
      ringLabels = [];
      for (let r = 1; r <= geom.FIELD; r++) {
        const text = r === geom.FIELD ? 'FIELD' : 'RING ' + r;
        const m = new T.Mesh(new T.PlaneGeometry(4.4, 1.1), new T.MeshBasicMaterial({ map: textTexture(text, { font: '600 74px Cinzel, Georgia, serif', fg: 'rgba(246,230,196,1)' }), transparent: true, depthWrite: false, opacity: 0.78, toneMapped: false }));
        m.userData.r = r;
        m.renderOrder = 1;
        formation.add(m);
        ringLabels.push(m);
      }
      qMarks = []; staleTags = [];
      // highlight pool
      for (let i = 0; i < 6; i++) {
        const m = new T.Mesh(sectorGeom(0, 1), M.highlight.clone());
        m.visible = false; m.position.y = 0.09; m.renderOrder = 2;
        const arrow = new T.Mesh(new T.ConeGeometry(0.6, 1.2, 4), new T.MeshBasicMaterial({ color: 0xffb000, toneMapped: false }));
        arrow.rotation.x = Math.PI;
        arrow.visible = false;
        formation.add(m, arrow);
        highlightPool.push({ mesh: m, arrow, cell: null, ring: null });
      }
    }

    function setSegState(w, state, stale, animate) {
      const changed = w.state !== state;
      if (!changed && w.stale === stale) return;
      const objFor = (st) => (st === 'wall' ? w.solid : st === 'unknown' ? w.ghost : st === 'gate' || st === 'sealed' ? ensureGate(w) : null);
      const prev = objFor(w.state), next = objFor(state);
      if (changed) {
        if (prev && prev !== next) {
          if (animate) {
            tween(0.55, (k) => { prev.scale.y = Math.max(0.001, 1 - k); }, () => { prev.visible = false; });
          } else { prev.visible = false; prev.scale.y = 0.001; }
        }
        if (next) {
          next.visible = true;
          if (animate && prev !== next) { next.scale.y = 0.001; tween(0.65, (k) => { next.scale.y = Math.max(0.001, k); }); }
          else next.scale.y = 1;
        }
      }
      w.state = state;
      w.stale = stale;
      troopsTo(w, state === 'wall' && !stale ? 1 : 0, animate);
      if (state === 'wall') { w.solid.material = stale ? M.stale : (w.outer ? M.stoneOuter : M.stone); w.solid.userData.cap.material = stale ? M.stale : M.coping; }
      if (state === 'gate' || state === 'sealed') {
        const p = w.gate.userData;
        for (const pl of p.pillars) pl.material = stale ? M.pillarStale : M.pillar;
        p.lintel.material = stale ? M.pillarStale : M.bronze;
        for (const f of p.flames) f.visible = !stale && state === 'gate';
        p.banner.material.opacity = stale ? 0.15 : 0.55;
        p.banner.material.color.set(stale ? 0x9a9088 : (w.outer ? 0xffb347 : 0xffd27a));
        p.bar.visible = state === 'sealed';
      }
    }

    function setTroops(w, sc) {
      const R = w.R - 0.75, baseY = ringH(w.k);
      for (let i = 0; i < PER; i++) {
        const a = angleOf(w.s) + (i - 1) * segA * 0.3;
        const yaw = Math.atan2(Math.cos(a), Math.sin(a));
        dummy.position.set(Math.cos(a) * R, baseY + 0.72 * sc, Math.sin(a) * R);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(sc > 0.01 ? 1 : 0, Math.max(0.001, sc), sc > 0.01 ? 1 : 0);
        dummy.updateMatrix();
        troopBody.setMatrixAt(w.troopBase + i, dummy.matrix);
        dummy.position.y = baseY + 1.65 * sc;
        dummy.updateMatrix();
        troopHead.setMatrixAt(w.troopBase + i, dummy.matrix);
      }
      troopBody.instanceMatrix.needsUpdate = true;
      troopHead.instanceMatrix.needsUpdate = true;
    }
    function troopsTo(w, target, animate) {
      const from = w.troopScale;
      if (from === target) return;
      w.troopScale = target;
      if (animate) tween(0.6, (k) => setTroops(w, from + (target - from) * k));
      else setTroops(w, target);
    }

    function ensureGate(w) {
      if (!w.gate) {
        w.gate = makeGate(w.R, w.h, w.outer);
        w.gate.rotation.y = -angleOf(w.s);
        w.gate.position.y = ringH(w.k + 1);
        w.gate.visible = false;
        w.gate.scale.y = 0.001;
        formation.add(w.gate);
      }
      return w.gate;
    }

    // ---------------- characters ----------------
    let chars = new Map(), ghosts = new Map(), drona = null, ambient = null;

    function buildAmbient() {
      if (ambient) return;
      ambient = new T.Group();
      // Armies around the field: instanced figures
      const fig = new T.CylinderGeometry(0.35, 0.45, 2.0, 6);
      const red = new T.InstancedMesh(fig, new T.MeshStandardMaterial({ color: 0x3a1c16, roughness: 0.9 }), 420);
      const blue = new T.InstancedMesh(fig, new T.MeshStandardMaterial({ color: 0x1e2a40, roughness: 0.9 }), 160);
      const m4 = new T.Matrix4();
      let ri = 0, bi = 0;
      for (let i = 0; i < 580; i++) {
        const a = Math.random() * TAU;
        const nearPandava = Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2))) < 0.55;
        const rad = 62 + Math.random() * 16;
        m4.makeTranslation(Math.cos(a) * rad, 1, Math.sin(a) * rad);
        if (nearPandava && bi < 160) blue.setMatrixAt(bi++, m4);
        else if (!nearPandava && ri < 420) red.setMatrixAt(ri++, m4);
      }
      red.count = ri; blue.count = bi;
      const headGeo = new T.SphereGeometry(0.32, 8, 6);
      const mkHeads = (src, color) => {
        const h = new T.InstancedMesh(headGeo, new T.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.4 }), src.count);
        const m = new T.Matrix4(), p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3();
        for (let i = 0; i < src.count; i++) { src.getMatrixAt(i, m); m.decompose(p, q, s); p.y = 2.25; m.compose(p, q, s); h.setMatrixAt(i, m); }
        return h;
      };
      ambient.add(mkHeads(red, 0x6e5a3e), mkHeads(blue, 0x8a8270));
      red.castShadow = blue.castShadow = true;
      ambient.add(red, blue);
      // Tents and flags far out
      const tent = new T.ConeGeometry(2.4, 3.2, 6);
      const tents = new T.InstancedMesh(tent, new T.MeshStandardMaterial({ color: 0x6e5a42, roughness: 0.95 }), 70);
      for (let i = 0; i < 70; i++) {
        const a = Math.random() * TAU, rad = 95 + Math.random() * 50;
        m4.makeTranslation(Math.cos(a) * rad, 1.6, Math.sin(a) * rad);
        tents.setMatrixAt(i, m4);
      }
      ambient.add(tents);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU, rad = 58;
        const pole = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 6, 5), M.pillar);
        pole.position.set(Math.cos(a) * rad, 3, Math.sin(a) * rad);
        const flag = new T.Mesh(new T.PlaneGeometry(1.6, 1.0), new T.MeshStandardMaterial({ color: i % 6 === 0 ? 0x24324c : 0x5e2218, side: T.DoubleSide }));
        flag.position.set(Math.cos(a) * rad + 0.8, 5.3, Math.sin(a) * rad);
        flag.userData.phase = i;
        ambient.add(pole, flag);
      }
      // Drona's command platform, opposite the Pandava side
      const a = Math.PI / 2, rad = 62;
      const plat = new T.Group();
      const base = new T.Mesh(new T.CylinderGeometry(4, 4.6, 4, 8), M.stoneOuter);
      base.position.y = 2; base.castShadow = true; base.receiveShadow = true;
      plat.add(base);
      for (let i = 0; i < 4; i++) {
        const pa = (i / 4) * TAU + Math.PI / 4;
        const pil = new T.Mesh(new T.CylinderGeometry(0.25, 0.25, 4, 6), M.pillar);
        pil.position.set(Math.cos(pa) * 3.2, 6, Math.sin(pa) * 3.2);
        plat.add(pil);
      }
      const roof = new T.Mesh(new T.ConeGeometry(4.6, 2.4, 8), new T.MeshStandardMaterial({ color: 0x8c2a1f, roughness: 0.8 }));
      roof.position.y = 9.2;
      plat.add(roof);
      plat.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad);
      ambient.add(plat);
      drona = C().makeCharacter(C().ROSTER.drona);
      drona.root.position.set(Math.cos(a) * rad, 4, Math.sin(a) * rad);
      drona.face(Math.atan2(-Math.cos(a), -Math.sin(a)));
      ambient.add(drona.root);
      scene.add(ambient);
    }

    // Dust in the air
    const dustGeo = new T.BufferGeometry();
    const dustN = 600, dustPos = new Float32Array(dustN * 3);
    for (let i = 0; i < dustN; i++) { dustPos[i * 3] = (Math.random() - 0.5) * 140; dustPos[i * 3 + 1] = Math.random() * 14; dustPos[i * 3 + 2] = (Math.random() - 0.5) * 140; }
    dustGeo.setAttribute('position', new T.BufferAttribute(dustPos, 3));
    const dust = new T.Points(dustGeo, new T.PointsMaterial({ color: 0xffe2b0, size: 0.18, transparent: true, opacity: 0.55, depthWrite: false }));
    scene.add(dust);

    function buildCharacters(state) {
      for (const c of chars.values()) formation.remove(c.root);
      for (const g of ghosts.values()) formation.remove(g);
      chars = new Map(); ghosts = new Map();
      const R = C().ROSTER;
      const add = (id, spec) => { const c = C().makeCharacter(spec); c.cell = null; c.shown = false; c.root.visible = false; formation.add(c.root); chars.set(id, c); return c; };
      add('player', R.player);
      for (const a of state.allies) add(a.id, R[a.id] || R.bhima);
      add('jayadratha', R.jayadratha);
      for (const s of state.sentinels) add(s.id, R.sentinel);
    }

    function ghostFor(id, kind) {
      if (ghosts.has(id)) return ghosts.get(id);
      const color = kind === 'gatekeeper' ? 0xa777e8 : kind === 'ally' ? 0x4f95e8 : 0xe0453a;
      const g = new T.Group();
      const col = new T.Mesh(new T.CylinderGeometry(0.55, 0.7, 2.4, 12, 1, true), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, side: T.DoubleSide }));
      col.position.y = 1.2;
      const ring = new T.Mesh(new T.RingGeometry(0.6, 0.8, 24), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: T.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
      g.add(col, ring);
      g.userData = { col, label: null, kind };
      g.visible = false;
      formation.add(g);
      ghosts.set(id, g);
      return g;
    }
    function ghostLabel(g, text) {
      if (g.userData.text === text) return;
      if (g.userData.label) g.remove(g.userData.label);
      const l = C().makeLabel(text, g.userData.kind === 'gatekeeper' ? '#a777e8' : '#e0453a');
      l.scale.set(2.4, 0.75, 1);
      l.position.y = 3;
      g.add(l);
      g.userData.label = l;
      g.userData.text = text;
    }

    function moveChar(c, cell, animate) {
      const to = cellPos(cell);
      if (c.cell == null || !animate || !c.shown) {
        c.root.position.copy(to);
        c.cell = cell;
        return;
      }
      if (c.cell === cell) return;
      const from = c.root.position.clone();
      const fromR = Math.hypot(from.x, from.z), toR = Math.hypot(to.x, to.z);
      const fromA = Math.atan2(from.z, from.x);
      let toA = toR < 0.01 ? fromA : Math.atan2(to.z, to.x);
      if (fromR < 0.01) toA = Math.atan2(to.z, to.x);
      let dA = Math.atan2(Math.sin(toA - fromA), Math.cos(toA - fromA));
      const startA = fromR < 0.01 ? toA : fromA;
      c.face(Math.atan2(to.x - from.x, to.z - from.z));
      c.anim.moving = 0.5;
      c.cell = cell;
      tween(0.48, (k) => {
        const rad = lerp(fromR, toR, k), a = startA + dA * k;
        c.root.position.set(Math.cos(a) * rad, lerp(from.y, to.y, k), Math.sin(a) * rad);
      });
    }

    // ---------------- sync with a view ----------------
    let lastView = null, playerCell = null;

    function sync(view, opts) {
      opts = opts || {};
      const animate = !!opts.animate;
      lastView = view;
      const b = view.belief, turn = view.turn;
      // floors
      for (let cell = 0; cell < geom.N; cell++) {
        const f = floors[cell];
        if (!f) continue;
        const vis = view.truth || (view.visible && view.visible.has(cell));
        const seen = view.truth || b.cellSeen[cell] >= 0;
        if (cell === 0) { f.userData.target.set(vis ? 0xf2cf72 : seen ? 0x9a7a3a : 0x5a4720); continue; }
        const fld = f.userData.field;
        f.userData.target.copy(vis ? (fld ? FLOOR.field : FLOOR.lit) : seen ? (fld ? FLOOR.fieldSeen : FLOOR.seen) : (fld ? FLOOR.fieldFog : FLOOR.fog));
        if (mist[cell]) mist[cell].userData.target = vis ? 0 : seen ? 0.22 : 0.7;
      }
      // walls
      for (let k = 0; k <= geom.R; k++) {
        for (let s = 0; s < geom.S; s++) {
          const g = b.gate[k][s];
          const stale = !view.truth && b.seen[k][s] >= 0 && b.seen[k][s] < turn && k !== geom.R;
          let st = g === -1 ? 'unknown' : g === 0 ? 'wall' : 'gate';
          if (k === geom.R && g === 1 && b.sealed[s]) st = 'sealed';
          setSegState(walls[k][s], st, stale, animate);
        }
      }
      // "?" over unknown walls that border cells you have seen; "seen N ago" over nearby remembered gates.
      let qi = 0, ti = 0;
      if (!view.truth) {
        const pr = view.playerCell === 0 ? 0 : geom.ringOf(view.playerCell);
        for (let k = 0; k < geom.R; k++) {
          for (let s2 = 0; s2 < geom.S; s2++) {
            const g = b.gate[k][s2];
            // Seeing a cell reveals the walls on both sides of it, so the edge of what you know is the
            // unknown wall just beside the cells you have seen.
            const seenAt = (r, sg) => (r === 0 ? b.cellSeen[0] >= 0 : b.cellSeen[geom.cellId(r, sg)] >= 0);
            const near = [s2 - 1, s2 + 1].some((sg) => seenAt(k, sg) || seenAt(k + 1, sg));
            const a = angleOf(s2), R = rOut(k);
            if (g === -1 && near && qi < 40) {
              if (!qMarks[qi]) { qMarks[qi] = marker('?', { w: 128, h: 128, font: '800 92px system-ui, sans-serif', fg: '#dbe8ff', bg: 'rgba(30,45,70,0.85)', stroke: '#9fb6d0' }, [1.1, 1.1]); formation.add(qMarks[qi]); }
              qMarks[qi].visible = true;
              qMarks[qi].position.set(Math.cos(a) * R, ringH(k + 1) + 1.9, Math.sin(a) * R);
              qi++;
            } else if (g === 1 && b.seen[k][s2] >= 0 && b.seen[k][s2] < turn && Math.abs(k - pr) <= 2 && ti < 12) {
              const age = turn - b.seen[k][s2];
              const text = 'seen ' + age + ' turn' + (age === 1 ? '' : 's') + ' ago';
              if (!staleTags[ti]) { staleTags[ti] = marker(text, { w: 512, h: 112, font: '700 54px system-ui, sans-serif', fg: '#f1e8d6', bg: 'rgba(60,55,50,0.85)', stroke: '#a99d89' }, [3.6, 0.79]); formation.add(staleTags[ti]); }
              staleTags[ti].material.map = textTexture(text, { w: 512, h: 112, font: '700 54px system-ui, sans-serif', fg: '#f1e8d6', bg: 'rgba(60,55,50,0.85)', stroke: '#a99d89' });
              staleTags[ti].visible = true;
              staleTags[ti].position.set(Math.cos(a) * R, ringH(k + 1) + 3.6, Math.sin(a) * R);
              ti++;
            }
          }
        }
      }
      for (let i = qi; i < qMarks.length; i++) qMarks[i].visible = false;
      for (let i = ti; i < staleTags.length; i++) staleTags[i].visible = false;

      // characters
      playerCell = view.playerCell;
      const pc = chars.get('player');
      pc.root.visible = true;
      if (!pc.shown) { pc.shown = true; moveChar(pc, view.playerCell, false); }
      else moveChar(pc, view.playerCell, animate);
      for (const [id, c] of chars) {
        if (id === 'player') continue;
        const rec = view.known.get(id);
        const fresh = rec && rec.age === 0;
        if (fresh) {
          if (!c.shown) { c.shown = true; c.root.visible = true; moveChar(c, rec.cell, false); c.root.scale.setScalar(0.01); tween(0.3, (k) => c.root.scale.setScalar(Math.max(0.01, k))); }
          else moveChar(c, rec.cell, animate);
          // face the player when idle
          const p = cellPos(view.playerCell), me = cellPos(rec.cell);
          if (!animate) c.face(Math.atan2(p.x - me.x, p.z - me.z));
        } else if (c.shown) {
          c.shown = false;
          c.root.visible = false;
        }
        if (id.startsWith('sentinel')) {
          const intent = view.intents && view.intents.get(id);
          const alert = !!(fresh && intent && intent.alert && !view.truth);
          if (alert && !c.alertSprite) { c.alertSprite = marker('!', { w: 128, h: 128, font: '900 100px system-ui, sans-serif', fg: '#fff', bg: 'rgba(200,40,30,0.95)', stroke: '#ffd0c8' }, [0.9, 0.9]); c.alertSprite.position.y = 3.2; c.root.add(c.alertSprite); }
          if (c.alertSprite) c.alertSprite.visible = alert;
        }
        const gh = ghostFor(id, rec ? rec.kind : 'sentinel');
        if (rec && rec.age > 0 && rec.kind !== 'ally' && !view.truth) {
          gh.visible = true;
          cellPos(rec.cell, gh.position);
          gh.userData.col.material.opacity = Math.max(0.08, 0.3 - rec.age * 0.025);
          ghostLabel(gh, `seen ${rec.age} turn${rec.age === 1 ? '' : 's'} ago`);
        } else gh.visible = false;
      }
      // goal beacons
      const coreDone = !!opts.coreReached;
      beacon.material.opacity = coreDone ? 0.04 : 0.18;
      for (const e of exitBeacons) formation.remove(e);
      exitBeacons = [];
      if (coreDone && !view.truth) {
        for (const s of view.outerGates) {
          if (b.sealed[s]) continue;
          const m = new T.Mesh(new T.CylinderGeometry(0.9, 1.6, 40, 16, 1, true), new T.MeshBasicMaterial({ color: 0x6bff9a, transparent: true, opacity: 0.16, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
          cellPos(geom.cellId(geom.FIELD, s), m.position);
          m.position.y = 20;
          formation.add(m);
          exitBeacons.push(m);
        }
      }
    }

    // ---------------- legal moves, hover, path ----------------
    let legal = [], hoverCell = null;
    function setLegal(list) {
      legal = list || [];
      highlightPool.forEach((h, i) => {
        const m = legal[i];
        if (!m) { h.mesh.visible = false; h.arrow.visible = false; h.cell = null; return; }
        h.cell = m.to;
        const r = m.to === 0 ? 0 : geom.ringOf(m.to);
        if (h.ring !== r) {
          h.mesh.geometry.dispose();
          h.mesh.geometry = r === 0 ? (() => { const g = new T.CircleGeometry(RC - 0.3, 32); g.rotateX(-Math.PI / 2); return g; })() : sectorGeom(rIn(r) + 0.25, rOut(r) - 0.25);
          h.ring = r;
        }
        h.mesh.rotation.y = m.to === 0 ? 0 : -angleOf(geom.segOf(m.to));
        h.mesh.position.y = ringH(r) + 0.09;
        h.baseY = ringH(r);
        h.mesh.material.color.set(m.breakthrough ? 0xff2a1a : 0xff8c00);
        h.arrow.material.color.set(m.breakthrough ? 0xff3b2b : 0xffb000);
        h.mesh.visible = true;
        h.arrow.visible = true;
        cellPos(m.to, h.arrow.position);
        if (m.to !== 0 && playerCell != null && playerCell !== 0 && geom.ringOf(m.to) === geom.ringOf(playerCell)) {
          // along the ring: put the arrow on the edge of the tile nearest the player
          const r = geom.ringOf(m.to), rad = (rIn(r) + rOut(r)) / 2;
          const ta = angleOf(geom.segOf(m.to)), pa = angleOf(geom.segOf(playerCell));
          const d = Math.atan2(Math.sin(pa - ta), Math.cos(pa - ta));
          const a = ta + Math.sign(d) * segA * 0.3;
          h.arrow.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad);
        }
        h.breakthrough = !!m.breakthrough;
      });
    }
    // Krishna's counsel: a teal ring on the advised tile and a floating "K" above it.
    let adviceMark = null;
    function setAdvice(cell) {
      if (!adviceMark) {
        const g = new T.Group();
        const ring = new T.Mesh(new T.RingGeometry(1.1, 1.5, 40), new T.MeshBasicMaterial({ color: 0x2fd6c8, transparent: true, opacity: 0.9, side: T.DoubleSide, depthWrite: false, toneMapped: false }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12;
        const k = marker('K', { w: 128, h: 128, font: '800 84px Georgia, serif', fg: '#ffffff', bg: 'rgba(20,120,140,0.95)', stroke: '#9ff5ec' }, [1.2, 1.2]);
        k.position.y = 4.2;
        g.add(ring, k);
        g.userData = { ring, k };
        formation.add(g);
        adviceMark = g;
      }
      if (cell == null) { adviceMark.visible = false; return; }
      adviceMark.visible = true;
      cellPos(cell, adviceMark.position);
    }

    // Possible positions of sentinels seen recently (inferred from the player's own sightings).
    const HATCH = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      g.strokeStyle = 'rgba(200,70,60,0.9)'; g.lineWidth = 6;
      for (let i = -64; i < 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); }
      const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(3, 3);
      return t;
    })();
    let threatMeshes = [];
    function setThreats(zones) {
      for (const m of threatMeshes) formation.remove(m);
      threatMeshes = [];
      if (!zones || !geom) return;
      const cells = new Map();
      for (const z of zones) for (const c of z.cells) cells.set(c, Math.max(cells.get(c) || 0, 1 / z.age));
      for (const [c, w] of cells) {
        if (c === 0) continue;
        const r = geom.ringOf(c);
        const m = new T.Mesh(sectorGeom(rIn(r) + 0.15, rOut(r) - 0.15), new T.MeshBasicMaterial({ map: HATCH, transparent: true, opacity: 0.25 + 0.35 * w, depthWrite: false, toneMapped: false }));
        m.rotation.y = -angleOf(geom.segOf(c));
        m.position.y = ringH(r) + 0.66; // above the mist, so a possible enemy reads even on unexplored ground
        m.renderOrder = 4;
        formation.add(m);
        threatMeshes.push(m);
      }
    }

    // Selection: a gold ring under a unit, or a gold outline on a tile.
    let selection = null, selRing = null, selTile = null;
    function setSelection(sel) {
      selection = sel;
      if (!selRing) {
        selRing = new T.Mesh(new T.RingGeometry(0.95, 1.12, 48), new T.MeshBasicMaterial({ color: 0xe2c07a, transparent: true, opacity: 0.95, side: T.DoubleSide, depthWrite: false, toneMapped: false }));
        selRing.rotation.x = -Math.PI / 2; selRing.renderOrder = 4;
        formation.add(selRing);
      }
      if (selTile) { formation.remove(selTile); selTile = null; }
      selRing.visible = !!(sel && sel.type === 'unit');
      if (sel && sel.type === 'cell' && geom) {
        const c = sel.cell;
        const g = c === 0 ? (() => { const gg = new T.RingGeometry(RC - 0.5, RC - 0.2, 48); gg.rotateX(-Math.PI / 2); return gg; })()
          : (() => { const r = geom.ringOf(c); return sectorGeom(rIn(r) + 0.12, rOut(r) - 0.12); })();
        if (c === 0) selTile = new T.Mesh(g, new T.MeshBasicMaterial({ color: 0xe2c07a, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, side: T.DoubleSide }));
        else {
          // an ivory outline on all four edges with a faint fill: distinct from the amber "you can move here" tiles
          selTile = new T.Group();
          selTile.add(new T.Mesh(g, new T.MeshBasicMaterial({ color: 0xfff6e0, transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false, side: T.DoubleSide })));
          const r = geom.ringOf(c), edge = new T.MeshBasicMaterial({ color: 0xfff6e0, transparent: true, opacity: 1, depthWrite: false, depthTest: false, toneMapped: false, side: T.DoubleSide });
          const rim = new T.Mesh(sectorGeom(rOut(r) - 0.42, rOut(r) - 0.12), edge);
          const rim2 = new T.Mesh(sectorGeom(rIn(r) + 0.12, rIn(r) + 0.42), edge);
          rim.position.y = rim2.position.y = 0.01;
          selTile.add(rim, rim2);
          const rm = (rIn(r) + rOut(r)) / 2, len = rOut(r) - rIn(r) - 0.24;
          for (const side of [-1, 1]) {
            const th = side * (segA / 2 - 0.3 / rm);
            const sg = new T.PlaneGeometry(len, 0.3); sg.rotateX(-Math.PI / 2);
            const strip = new T.Mesh(sg, edge);
            strip.rotation.y = th;
            strip.position.set(rm * Math.cos(th), 0.01, -rm * Math.sin(th));
            selTile.add(strip);
          }
        }
        if (c !== 0) selTile.rotation.y = -angleOf(geom.segOf(c));
        selTile.position.y = (c === 0 ? ringH(0) : ringH(geom.ringOf(c))) + 0.7;
        selTile.renderOrder = 5;
        selTile.traverse((o) => { o.renderOrder = 5; });
        formation.add(selTile);
      }
    }

    // Allies' reported routes (only passed in when allies are linked).
    let planLines = [];
    function setPlans(plans) {
      for (const l of planLines) { formation.remove(l); l.geometry.dispose(); }
      planLines = [];
      if (!plans) return;
      for (const p of plans) {
        const ch = chars.get(p.id);
        if (!ch || !p.path || !p.path.length) continue;
        const pts = [ch.root.position.clone()].concat(p.path.map((c) => cellPos(c)));
        for (const v of pts) v.y += 0.35;
        const g = new T.BufferGeometry().setFromPoints(pts);
        const line = new T.Line(g, new T.LineDashedMaterial({ color: 0x6d9fd6, dashSize: 0.6, gapSize: 0.45, transparent: true, opacity: 0.85, toneMapped: false }));
        line.computeLineDistances();
        line.renderOrder = 3;
        formation.add(line);
        planLines.push(line);
      }
    }

    // A gate being sealed this turn (observed or reported).
    let sealMark = null;
    function setSealing(info) {
      if (sealMark) { formation.remove(sealMark); sealMark = null; }
      if (!info || !geom) return;
      const g = new T.Group();
      const ring = new T.Mesh(new T.RingGeometry(1.3, 1.6, 48, 1, 0, Math.PI * 2), new T.MeshBasicMaterial({ color: 0xb07be0, transparent: true, opacity: 0.9, side: T.DoubleSide, depthWrite: false, toneMapped: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.14;
      const tag = marker(info.reported ? 'Sealing (reported)' : 'Sealing next turn', { w: 512, h: 112, font: '700 50px Inter, system-ui, sans-serif', fg: '#f3e9ff', bg: 'rgba(60,30,90,0.92)', stroke: '#b07be0' }, [3.6, 0.79]);
      tag.position.y = 3.4;
      g.add(ring, tag);
      g.userData = { ring };
      cellPos(geom.cellId(geom.R, info.seg), g.position);
      formation.add(g);
      sealMark = g;
    }

    // Time of day: the sun sinks toward the horizon as the turn limit approaches.
    const SKY = { top: new T.Color('#151b30'), mid: new T.Color('#9a5230'), duskTop: new T.Color('#0b0c18'), duskMid: new T.Color('#5e2418') };
    function setDay(f) {
      f = Math.max(0, Math.min(1, f || 0));
      const elev = 40 - 24 * f;
      sun.position.set(-62 - 14 * f, elev, -34 + 8 * f);
      sun.color.setHSL(0.09 - 0.04 * f, 0.75, 0.78 - 0.18 * f);
      sun.intensity = 1.65 - 0.5 * f;
      hemi.intensity = 0.36 - 0.12 * f;
      sky.material.uniforms.top.value.copy(SKY.top).lerp(SKY.duskTop, f);
      sky.material.uniforms.mid.value.copy(SKY.mid).lerp(SKY.duskMid, f);
      sunDisc.position.set(-260, 60 - 48 * f, -240);
    }

    function showPath(cells, color) {
      for (const d of pathDots) formation.remove(d);
      pathDots = [];
      if (!cells) return;
      cells.forEach((c, i) => {
        const d = new T.Mesh(new T.SphereGeometry(0.22, 10, 8), new T.MeshBasicMaterial({ color: color || 0x29c8ff, transparent: true, opacity: 0.9, toneMapped: false }));
        cellPos(c, d.position);
        d.position.y += 0.4;
        d.userData.i = i;
        formation.add(d);
        pathDots.push(d);
      });
    }

    // ---------------- effects ----------------
    const fx = [];
    function shockwave(pos, color, size) {
      const m = new T.Mesh(new T.RingGeometry(0.5, 0.8, 40), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: T.DoubleSide, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.copy(pos); m.position.y = 0.15;
      formation.add(m);
      tween(0.8, (k) => { const s = 1 + k * (size || 4); m.scale.set(s, s, s); m.material.opacity = 0.9 * (1 - k); }, () => formation.remove(m));
    }
    function dome(pos, color) {
      const m = new T.Mesh(new T.SphereGeometry(1.6, 24, 16, 0, TAU, 0, Math.PI / 2), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
      m.position.copy(pos);
      formation.add(m);
      tween(0.9, (k) => { m.scale.setScalar(1 + k * 0.4); m.material.opacity = 0.5 * (1 - k); }, () => formation.remove(m));
    }
    function burst(pos, color, n) {
      const g = new T.BufferGeometry();
      const N = n || 60, p = new Float32Array(N * 3), v = [];
      for (let i = 0; i < N; i++) { p[i * 3] = pos.x; p[i * 3 + 1] = 1.2; p[i * 3 + 2] = pos.z; v.push([(Math.random() - 0.5) * 8, Math.random() * 7 + 2, (Math.random() - 0.5) * 8]); }
      g.setAttribute('position', new T.BufferAttribute(p, 3));
      const pts = new T.Points(g, new T.PointsMaterial({ color, size: 0.35, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      formation.add(pts);
      fx.push({ pts, v, t: 0, dur: 1.3 });
    }
    function floatText(pos, text, color) {
      const l = C().makeLabel(text, color);
      l.scale.set(2.2, 0.7, 1);
      l.position.copy(pos); l.position.y = 3.6;
      formation.add(l);
      tween(1.2, (k) => { l.position.y = 3.6 + k * 2; l.material.opacity = 1 - k; }, () => formation.remove(l));
    }
    function beam(fromPos, toPos, color) {
      const a = fromPos.clone(), b2 = toPos.clone();
      a.y = b2.y = 1.5;
      const len = a.distanceTo(b2);
      if (len < 0.1) return;
      const m = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, len, 8, 1, true), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
      m.position.copy(a).add(b2).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b2.clone().sub(a).normalize());
      formation.add(m);
      tween(1.3, (k) => { m.material.opacity = 0.95 * (1 - k); m.scale.x = m.scale.z = 1 + k; }, () => { formation.remove(m); m.geometry.dispose(); });
    }
    let shakeAmt = 0;
    function shake(a) { if (prefs.motion === 'full') shakeAmt = Math.max(shakeAmt, a); }

    function playEvent(e, ctx) {
      const pc = chars.get('player');
      const ppos = pc.root.position.clone();
      switch (e.type) {
        case 'pressed':
          shockwave(ppos, 0xff4a3d, 3); pc.flash('#ff2a1a'); floatText(ppos, `-${e.drain} resolve`, '#ff6a5d'); shake(0.35);
          for (const id of ctx.pressingSentinels || ctx.adjacentSentinels || []) { const c = chars.get(id); if (c && c.shown) { c.push(); beam(c.root.position, ppos, 0xff3b2b); } }
          K.Audio.play('thud');
          break;
        case 'covered': floatText(ppos, 'Covered', '#6d9fd6'); dome(ppos, 0x4f95e8); for (const id of ctx.coverAllies || []) { const c = chars.get(id); if (c && c.shown) beam(c.root.position, ppos, 0x4f95e8); } K.Audio.play('shield'); break;
        case 'breakthrough': burst(ppos, 0xff5a3d, 40); pc.flash('#ff2a1a'); floatText(ppos, `-${e.cost} resolve`, '#ff6a5d'); shake(0.4); K.Audio.play('thud'); break;
        case 'rotation': shake(0.8); K.Audio.play('drum'); if (drona) { drona.anim.raise = 1; tween(2.2, (k) => { drona.anim.raise = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3; }); }
          for (let r = 1; r < geom.FIELD; r += 2) shockwave(new T.Vector3(0, 0, 0), 0xffd9a0, rOut(r) / 1.2);
          break;
        case 'sealing': if (ctx.gatekeeperSeen) { const g = chars.get('jayadratha'); shockwave(g.root.position, 0xa777e8, 2.5); g.flash('#a777e8'); } break;
        case 'sealed': if (ctx.sealPerceived) { K.Audio.play('seal'); shake(0.3); const g = cellPos(geom.cellId(geom.R, e.seg)); burst(g, 0xa777e8, 50); floatText(g, 'Gate sealed', '#b07be0'); } break;
        case 'breach': K.Audio.play('conch'); shockwave(ppos, 0xffc95a, 5); break;
        case 'core': K.Audio.play('chime'); burst(new T.Vector3(0, 0, 0), 0xffd36a, 120); pc.cheer(2.5); shockwave(new T.Vector3(), 0xffd36a, 8); break;
        case 'escaped': K.Audio.play('win'); burst(ppos, 0x6bff9a, 120); pc.cheer(4); break;
        case 'signal': { const c = chars.get(e.allyId); if (c && c.shown) { shockwave(c.root.position, 0x4f95e8, 2); c.flash('#4f95e8'); floatText(c.root.position, 'Order received', '#6d9fd6'); } K.Audio.play('order'); break; }
        case 'swap': break;
        default: break;
      }
    }
    function scoutPulse(radiusCells) {
      const pc = chars.get('player');
      shockwave(pc.root.position, 0x7fe0ff, (radiusCells || 3) * 2.2);
      pc.anim.raise = 1;
      tween(1, (k) => { pc.anim.raise = 1 - k; });
      K.Audio.play('scout');
    }
    function stepSound() { K.Audio.play('step'); }

    // ---------------- camera ----------------
    const cam = { mode: 'menu', yaw: 0, pitch: 0.75, dist: 24, target: new T.Vector3(), userYaw: 0, userPitch: 0, userDist: 0, t: 0, pan: new T.Vector3() };
    const cur = { yaw: 0, pitch: 0.7, dist: 70, target: new T.Vector3(), shift: 0 };
    // Composition: on wide screens the formation sits beside the text it accompanies
    // (right of the landing title, left of the after-action report), never under it.
    const SHIFT = { menu: 0.19, debrief: -0.2 };
    function setCameraMode(m) { cam.mode = m; if (m === 'follow') { cam.userYaw = 0; } }
    function playerYaw() {
      const pc = chars.get('player');
      if (!pc) return Math.PI / 2;
      const p = pc.root.position;
      return Math.hypot(p.x, p.z) > 0.5 ? Math.atan2(p.z, p.x) : Math.PI / 2;
    }
    function desired() {
      if (cam.mode === 'menu') return { yaw: cam.t * 0.035 + 1.2, pitch: 0.4, dist: 64, target: new T.Vector3(0, 1.5, 0) };
      if (cam.mode === 'cinematic') return { yaw: cam.t * 0.05 + 1.0, pitch: 0.3, dist: 50, target: new T.Vector3(0, 2.5, 0) };
      if (cam.mode === 'overview') return { yaw: cam.userYaw + playerYaw(), pitch: Math.min(1.45, 1.2 + cam.userPitch), dist: Math.max(40, 86 + cam.userDist), target: (() => { const pc = chars.get('player'); return pc ? new T.Vector3(pc.root.position.x * 0.3, 0, pc.root.position.z * 0.3) : new T.Vector3(); })() };
      if (cam.mode === 'top') {
        const fr = geom ? rOut(geom.FIELD) : 40;
        return { yaw: cam.userYaw + playerYaw(), pitch: 1.47, dist: Math.max(30, fr * 2.35 + cam.userDist), target: cam.pan.clone() };
      }
      if (cam.mode === 'tactical') {
        const pc = chars.get('player');
        const p = pc ? pc.root.position : new T.Vector3();
        const fr = geom ? rOut(geom.FIELD) : 40;
        return { yaw: cam.userYaw + playerYaw(), pitch: Math.min(1.45, Math.max(0.5, 1.02 + cam.userPitch)), dist: Math.max(22, fr * 1.95 + cam.userDist), target: new T.Vector3(p.x * 0.55 + cam.pan.x, 0, p.z * 0.55 + cam.pan.z) };
      }
      if (cam.mode === 'debrief') return { yaw: cam.t * 0.04, pitch: 1.05, dist: 80, target: new T.Vector3(0, 0, 0) };
      const p = chars.get('player') ? chars.get('player').root.position : new T.Vector3();
      const rad = Math.hypot(p.x, p.z);
      const baseYaw = rad > 0.5 ? Math.atan2(p.z, p.x) : cur.yaw - cam.userYaw;
      const base = 13 + rad * 0.6; // cells are wider in the outer rings, so pull back there
      const look = rad > 0.5 ? Math.min(4, rad * 0.12) / rad : 0; // look slightly toward the core
      return { yaw: baseYaw + cam.userYaw, pitch: Math.min(1.45, Math.max(0.3, 0.82 + cam.userPitch)), dist: Math.min(80, Math.max(9, base + cam.userDist)), target: new T.Vector3(p.x * (1 - look), 1.2, p.z * (1 - look)) };
    }
    function updateCamera(dt) {
      cam.t += dt;
      const d = desired();
      const k = 1 - Math.exp(-dt * (cam.mode === 'follow' ? 5 : cam.mode === 'tactical' ? 3 : 1.6));
      let dy = d.yaw - cur.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      cur.yaw += dy * k;
      cur.pitch += (d.pitch - cur.pitch) * k;
      cur.dist += (d.dist - cur.dist) * k;
      cur.target.lerp(d.target, k);
      const cp = Math.cos(cur.pitch);
      camera.position.set(cur.target.x + Math.cos(cur.yaw) * cp * cur.dist, cur.target.y + Math.sin(cur.pitch) * cur.dist, cur.target.z + Math.sin(cur.yaw) * cp * cur.dist);
      if (shakeAmt > 0) {
        camera.position.x += (Math.random() - 0.5) * shakeAmt;
        camera.position.y += (Math.random() - 0.5) * shakeAmt * 0.6;
        shakeAmt = Math.max(0, shakeAmt - dt * 1.2);
      }
      camera.lookAt(cur.target);
      const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
      const want = w / h > 1.25 ? (SHIFT[cam.mode] || 0) : 0;
      cur.shift += (want - cur.shift) * Math.min(1, dt * 2.5);
      if (Math.abs(cur.shift) > 0.002) camera.setViewOffset(w, h, -cur.shift * w, 0, w, h);
      else if (camera.view && camera.view.enabled) camera.clearViewOffset();
    }

    // ---------------- input ----------------
    const ray = new T.Raycaster();
    const ndc = new T.Vector2();
    let handlers = { click: null, hover: null };
    let drag = null;
    function pick(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      // characters first (for tooltips)
      const bodies = [];
      for (const [id, c] of chars) if (c.root.visible) c.root.traverse((m) => { if (m.isMesh) { m.userData.charId = id; bodies.push(m); } });
      const hc = ray.intersectObjects(bodies, false)[0];
      const hf = ray.intersectObjects(floorPick, false)[0];
      return { charId: hc ? hc.object.userData.charId : null, cell: hf ? hf.object.userData.cell : null };
    }
    canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0, button: e.button, pan: e.button === 2 || e.button === 1 || e.shiftKey }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointermove', (e) => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        drag.x = e.clientX; drag.y = e.clientY;
        if (drag.moved > 6 && drag.pan && ['tactical', 'top', 'follow'].includes(cam.mode)) {
          // Pan across the ground plane, relative to where the camera is looking.
          const fwd = new T.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
          const right = new T.Vector3().crossVectors(fwd, new T.Vector3(0, 1, 0));
          const k = cur.dist * 0.0016;
          cam.pan.addScaledVector(right, -dx * k).addScaledVector(fwd, dy * k);
          const lim = geom ? rOut(geom.FIELD) : 40;
          if (cam.pan.length() > lim) cam.pan.setLength(lim);
          return;
        }
        if (drag.moved > 6 && (cam.mode === 'follow' || cam.mode === 'overview' || cam.mode === 'tactical' || cam.mode === 'top')) {
          cam.userYaw -= dx * 0.006;
          cam.userPitch = Math.max(-0.5, Math.min(0.7, cam.userPitch + dy * 0.004));
        }
        return;
      }
      const p = pick(e.clientX, e.clientY);
      hoverCell = p.cell;
      if (handlers.hover) handlers.hover(Object.assign(p, { x: e.clientX, y: e.clientY }));
    });
    canvas.addEventListener('pointerup', (e) => {
      const wasClick = drag && drag.moved < 6;
      drag = null;
      if (wasClick && handlers.click) handlers.click(pick(e.clientX, e.clientY));
    });
    canvas.addEventListener('pointerleave', () => { hoverCell = null; if (handlers.hover) handlers.hover({ cell: null, charId: null }); });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.userDist = Math.max(-16, Math.min(45, cam.userDist + e.deltaY * 0.03)); }, { passive: false });

    function project(cell) {
      const v = cellPos(cell).clone();
      v.y = 1;
      v.project(camera);
      return { x: v.x, y: -v.y };
    }

    // ---------------- loop ----------------
    function resize() {
      const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (composer) {
        composer.setSize(w, h);
        const pr = renderer.getPixelRatio();
        if (fxaa) fxaa.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
      }
    }
    buildComposer();
    window.addEventListener('resize', resize);
    resize();

    const clock = new T.Clock();
    let running = true;
    function frame() {
      if (!running) return;
      requestAnimationFrame(frame);
      const rawDt = Math.min(0.5, clock.getDelta());
      const dt = Math.min(0.05, rawDt);
      const t = clock.elapsedTime;
      for (let i = tweens.length - 1; i >= 0; i--) {
        const tw = tweens[i];
        tw.t += Math.min(0.25, rawDt);
        const k = Math.min(1, tw.t / tw.dur);
        tw.fn(ease(k));
        if (k >= 1) { tweens.splice(i, 1); if (tw.done) tw.done(); }
      }
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i];
        f.t += dt;
        const p = f.pts.geometry.attributes.position;
        for (let j = 0; j < f.v.length; j++) {
          f.v[j][1] -= 9 * dt;
          p.array[j * 3] += f.v[j][0] * dt; p.array[j * 3 + 1] = Math.max(0.1, p.array[j * 3 + 1] + f.v[j][1] * dt); p.array[j * 3 + 2] += f.v[j][2] * dt;
        }
        p.needsUpdate = true;
        f.pts.material.opacity = 1 - f.t / f.dur;
        if (f.t >= f.dur) { formation.remove(f.pts); fx.splice(i, 1); }
      }
      if (geom) {
        for (let c = 0; c < floors.length; c++) {
          const f = floors[c];
          if (f && c !== 0) f.material.color.lerp(f.userData.target, Math.min(1, dt * 4));
        }
        if (coreMesh) coreMesh.material.color.lerp(coreMesh.userData.target, Math.min(1, dt * 4));
        for (const h of highlightPool) {
          if (!h.mesh.visible) continue;
          const hov = h.cell === hoverCell;
          h.mesh.material.opacity = (hov ? 0.9 : 0.62) + Math.sin(t * 4) * 0.12;
          h.arrow.position.y = (h.baseY || 0) + 2.6 + Math.sin(t * 3 + (h.cell || 0)) * 0.3 + (hov ? 0.5 : 0);
          h.arrow.rotation.y = t * 2;
        }
        for (let c = 1; c < mist.length; c++) {
          const mm = mist[c];
          if (!mm) continue;
          const u = mm.material.uniforms;
          u.time.value = t;
          u.opacity.value += (mm.userData.target - u.opacity.value) * Math.min(1, rawDt * 3);
          mm.visible = u.opacity.value > 0.01;
        }
        if (selRing && selRing.visible && selection && selection.type === 'unit') {
          const ch = chars.get(selection.id);
          if (ch && ch.root.visible) { selRing.position.set(ch.root.position.x, ch.root.position.y + 0.08, ch.root.position.z); selRing.scale.setScalar(1 + Math.sin(t * 4) * 0.05); }
          else selRing.visible = false;
        }
        if (sealMark) sealMark.userData.ring.scale.setScalar(1 + Math.sin(t * 6) * 0.08);
        if (adviceMark && adviceMark.visible) { adviceMark.userData.k.position.y = 4.2 + Math.sin(t * 2.5) * 0.25; adviceMark.userData.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.08); }
        for (const d of pathDots) d.material.opacity = 0.35 + 0.55 * Math.max(0, Math.sin(t * 4 - d.userData.i * 0.6));
        for (const w of walls.flat()) if (w.gate && w.gate.visible) for (const f of w.gate.userData.flames) { const s = 1.4 + Math.sin(t * 13 + w.s * 3 + w.k) * 0.15 + Math.random() * 0.1; f.scale.set(s, s * 1.4, 1); }
        const showLabels = cam.mode === 'tactical' || cam.mode === 'follow' || cam.mode === 'overview';
        const psi = Math.atan2(camera.position.z, camera.position.x);
        for (const m of ringLabels) {
          m.visible = showLabels;
          if (!showLabels) continue;
          const r = m.userData.r, rad = (rIn(r) + rOut(r)) / 2, a = psi + segA * 0.5;
          m.position.set(Math.cos(a) * rad, ringH(r) + 0.08, Math.sin(a) * rad);
          m.rotation.set(-Math.PI / 2, Math.PI / 2 - psi, 0, 'YXZ');
        }
        if (lotus) { lotus.rotation.y = t * 0.3; lotus.position.y = 0.1 + Math.sin(t * 1.5) * 0.08; }
        if (beacon) beacon.rotation.y = t * 0.2;
      }
      for (const c of chars.values()) if (c.root.visible) c.update(Math.min(0.1, rawDt), t);
      if (drona) drona.update(dt, t);
      if (ambient) ambient.children.forEach((o) => { if (o.userData.phase != null) o.rotation.y = Math.sin(t * 2 + o.userData.phase) * 0.3; });
      const dp = dust.geometry.attributes.position;
      for (let i = 0; i < dustN; i++) { dp.array[i * 3] += Math.sin(t * 0.3 + i) * 0.01 + 0.02; if (dp.array[i * 3] > 70) dp.array[i * 3] = -70; }
      dp.needsUpdate = true;
      updateCamera(rawDt);
      if (composer) composer.render(rawDt); else renderer.render(scene, camera);
      fpsFrames++;
      if (t - fpsT > 1) { fps = fpsFrames / (t - fpsT); fpsFrames = 0; fpsT = t; }
    }
    let fps = 60, fpsFrames = 0, fpsT = 0;
    frame();
    buildAmbient();

    return {
      load(game) { buildFormation(game.state.geom); buildCharacters(game.state); },
      sync, setLegal, showPath, setAdvice, playEvent, scoutPulse, stepSound, project,
      setCameraMode, get cameraMode() { return cam.mode; },
      resetCamera() { cam.userYaw = 0; cam.userPitch = 0; cam.userDist = 0; cam.pan.set(0, 0, 0); },
      // Centre the camera on a tile or unit without changing the camera mode.
      focusOn(cell) {
        if (cell == null || !geom) return;
        const target = cellPos(cell);
        const pc = chars.get('player'), p = pc ? pc.root.position : new T.Vector3();
        if (cam.mode === 'top') cam.pan.set(target.x, 0, target.z);
        else cam.pan.set(target.x - p.x * 0.55, 0, target.z - p.z * 0.55);
      },
      charCell(id) { const c = chars.get(id); return c && c.root.visible ? c.cell : null; },
      setThreats, setSelection, setPlans, setSealing, setDay,
      onClick(fn) { handlers.click = fn; }, onHover(fn) { handlers.hover = fn; },
      resize, cellPos,
      get fps() { return fps; },
      get prefs() { return Object.assign({}, prefs); },
      setQuality(q) {
        prefs.quality = q; savePref('kurukshetra.quality', q);
        renderer.shadowMap.enabled = q === 'high';
        scene.traverse((o) => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach((x) => { x.needsUpdate = true; }); } });
        renderer.setPixelRatio(q === 'high' ? Math.min(2, window.devicePixelRatio || 1) : 1);
        buildComposer(); resize();
      },
      setMotion(m) { prefs.motion = m; savePref('kurukshetra.motion', m); },
      _debug: () => highlightPool.map((h) => ({ vis: h.mesh.visible, cell: h.cell, op: h.mesh.material.opacity, pos: h.arrow.position.toArray().map((x) => +x.toFixed(1)) })),
    };
  }

  K.World = { create };
})();
