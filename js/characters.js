/*
 * KURUKSHETRA — characters.js
 * Stylised low-poly characters built from primitives, with simple procedural
 * animation (walk, idle, push, celebrate, raise arms). Shields and banners,
 * no weapons: the game is about decisions, not combat.
 */
(function () {
  'use strict';
  const K = (globalThis.KURU = globalThis.KURU || {});
  const T = globalThis.THREE;

  const mat = (color, extra) => new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.62, metalness: 0.12 }, extra || {}));

  function makeLabel(text, color, sub) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 160;
    const g = c.getContext('2d');
    // shrink long names so the tag never clips
    let size = 60;
    g.font = `700 ${size}px Georgia, serif`;
    while (g.measureText(text).width > 440 && size > 34) { size -= 2; g.font = `700 ${size}px Georgia, serif`; }
    const w = Math.min(508, g.measureText(text).width + 56);
    g.fillStyle = 'rgba(10,8,14,0.72)';
    const x = (512 - w) / 2;
    g.beginPath();
    if (g.roundRect) g.roundRect(x, 18, w, 92, 46); else g.rect(x, 18, w, 92);
    g.fill();
    g.strokeStyle = color; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#f5ecd9'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 66);
    if (sub) { g.font = '600 34px system-ui, sans-serif'; g.fillStyle = color; g.fillText(sub, 256, 138); }
    const tex = new T.CanvasTexture(c);
    tex.anisotropy = 4;
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set(3.2, 1, 1);
    s.renderOrder = 10;
    return s;
  }

  function makeCharacter(o) {
    const root = new T.Group();
    const body = new T.Group();
    root.add(body);
    const skin = mat(o.skin || '#b97a52');
    const cloth = mat(o.body);
    const accent = mat(o.accent, { metalness: 0.45, roughness: 0.35 });
    const parts = {};

    // Team ring under the feet: makes every figure readable from far away.
    const ring = new T.Mesh(new T.RingGeometry(0.55, 0.78, 32), new T.MeshBasicMaterial({ color: o.team, transparent: true, opacity: 0.85, side: T.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
    root.add(ring);
    parts.ring = ring;

    // Legs
    const legGeo = new T.CylinderGeometry(0.13, 0.11, 0.95, 8);
    for (const side of [-1, 1]) {
      const pivot = new T.Group();
      pivot.position.set(side * 0.17, 1.0, 0);
      const leg = new T.Mesh(legGeo, mat(o.legs || '#3a2b1f'));
      leg.position.y = -0.47;
      const foot = new T.Mesh(new T.BoxGeometry(0.22, 0.1, 0.34), mat('#2a1d14'));
      foot.position.set(0, -0.95, 0.06);
      pivot.add(leg, foot);
      body.add(pivot);
      parts[side < 0 ? 'legL' : 'legR'] = pivot;
    }
    // Skirt / dhoti
    const skirt = new T.Mesh(new T.CylinderGeometry(0.3, 0.42, 0.45, 10), cloth);
    skirt.position.y = 1.02;
    body.add(skirt);
    // Torso
    const robe = o.robe ? 1.25 : 1;
    const torso = new T.Mesh(new T.CylinderGeometry(0.36, 0.3, 0.85 * robe, 10), cloth);
    torso.position.y = 1.5;
    body.add(torso);
    const chest = new T.Mesh(new T.CylinderGeometry(0.37, 0.33, 0.45, 10, 1, true), accent);
    chest.position.y = 1.62;
    if (!o.robe) body.add(chest);
    const belt = new T.Mesh(new T.TorusGeometry(0.31, 0.05, 6, 16), accent);
    belt.rotation.x = Math.PI / 2; belt.position.y = 1.15;
    body.add(belt);
    // Head
    const head = new T.Group();
    head.position.y = 2.12;
    const face = new T.Mesh(new T.SphereGeometry(0.25, 16, 12), skin);
    head.add(face);
    if (o.beard) {
      const beard = new T.Mesh(new T.ConeGeometry(0.2, 0.42, 10), mat('#eeeae0'));
      beard.position.set(0, -0.25, 0.1); beard.rotation.x = Math.PI;
      head.add(beard);
    }
    const hat = o.hat || 'helm';
    if (hat === 'crown') {
      const band = new T.Mesh(new T.CylinderGeometry(0.27, 0.27, 0.16, 12, 1, true), accent);
      band.position.y = 0.17;
      head.add(band);
      for (let i = 0; i < 6; i++) {
        const spike = new T.Mesh(new T.ConeGeometry(0.06, 0.2, 5), accent);
        const a = (i / 6) * Math.PI * 2;
        spike.position.set(Math.cos(a) * 0.24, 0.33, Math.sin(a) * 0.24);
        head.add(spike);
      }
    } else if (hat === 'turban') {
      const t1 = new T.Mesh(new T.TorusGeometry(0.22, 0.1, 8, 16), mat(o.hatColor || '#e8dcc0'));
      t1.rotation.x = Math.PI / 2; t1.position.y = 0.14;
      const t2 = new T.Mesh(new T.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(o.hatColor || '#e8dcc0'));
      t2.position.y = 0.14;
      head.add(t1, t2);
    } else if (hat === 'hood') {
      const h = new T.Mesh(new T.SphereGeometry(0.3, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), cloth);
      h.position.y = 0.02;
      head.add(h);
    } else {
      const dome = new T.Mesh(new T.SphereGeometry(0.28, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), accent);
      dome.position.y = 0.04;
      const spike = new T.Mesh(new T.ConeGeometry(0.06, 0.3, 6), accent);
      spike.position.y = 0.42;
      head.add(dome, spike);
    }
    body.add(head);
    parts.head = head;

    // Arms
    const armGeo = new T.CylinderGeometry(0.09, 0.08, 0.72, 8);
    for (const side of [-1, 1]) {
      const pivot = new T.Group();
      pivot.position.set(side * 0.45, 1.86, 0);
      const arm = new T.Mesh(armGeo, o.robe ? cloth : skin);
      arm.position.y = -0.36;
      const hand = new T.Mesh(new T.SphereGeometry(0.09, 8, 6), skin);
      hand.position.y = -0.74;
      const shoulder = new T.Mesh(new T.SphereGeometry(0.14, 10, 8), accent);
      pivot.add(arm, hand, shoulder);
      body.add(pivot);
      parts[side < 0 ? 'armL' : 'armR'] = pivot;
    }
    // Shield on the left arm
    if (o.shield) {
      const sh = new T.Group();
      const disc = new T.Mesh(new T.CylinderGeometry(0.46, 0.46, 0.07, 20), mat(o.shield, { metalness: 0.3 }));
      disc.rotation.z = Math.PI / 2;
      const boss = new T.Mesh(new T.SphereGeometry(0.12, 10, 8), accent);
      boss.position.x = -0.05;
      sh.add(disc, boss);
      sh.position.set(-0.12, -0.45, 0.1);
      sh.rotation.y = Math.PI / 2;
      parts.armL.add(sh);
      parts.shield = sh;
    }
    // Banner staff in the right hand
    if (o.banner) {
      const pole = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 2.8, 6), mat('#5b4026'));
      pole.position.set(0, -0.2, 0.08);
      const flag = new T.Mesh(new T.PlaneGeometry(0.62, 0.42, 6, 1), new T.MeshStandardMaterial({ color: o.banner, side: T.DoubleSide, roughness: 0.8 }));
      flag.position.set(0.32, 1.0, 0.08);
      parts.armR.add(pole, flag);
      parts.flag = flag;
    }
    // Cape
    if (o.cape) {
      const cape = new T.Mesh(new T.PlaneGeometry(0.8, 1.25, 4, 6), new T.MeshStandardMaterial({ color: o.cape, side: T.DoubleSide, roughness: 0.85 }));
      cape.position.set(0, 1.35, -0.33);
      cape.rotation.x = 0.12;
      body.add(cape);
      parts.cape = cape;
    }

    body.scale.setScalar(o.scale || 1);
    root.traverse((m) => { if (m.isMesh && m !== ring) { m.castShadow = true; } });

    if (o.label) {
      const label = makeLabel(o.label, o.team);
      label.position.y = 3.15 * (o.scale || 1);
      root.add(label);
      parts.label = label;
    }

    // Flash material: tint everything briefly when hit or covered.
    const flashMats = [];
    root.traverse((m) => { if (m.isMesh && m.material && m.material.emissive) flashMats.push(m.material); });

    const anim = { phase: Math.random() * 10, moving: 0, push: 0, raise: 0, cheer: 0, flash: 0, flashColor: new T.Color('#ff3b30'), yaw: 0, targetYaw: 0 };

    function update(dt, t) {
      anim.phase += dt * (anim.moving > 0 ? 9 : 2);
      const walk = anim.moving > 0 ? 1 : 0;
      const s = Math.sin(anim.phase);
      parts.legL.rotation.x = s * 0.7 * walk;
      parts.legR.rotation.x = -s * 0.7 * walk;
      const armSwing = s * 0.6 * walk;
      const raise = anim.raise;
      const cheer = anim.cheer > 0 ? Math.abs(Math.sin(t * 8)) : 0;
      parts.armL.rotation.x = -armSwing - raise * 2.6 - cheer * 2.4 - anim.push * 1.2;
      parts.armR.rotation.x = armSwing - raise * 2.6 - cheer * 2.4 - anim.push * 0.6;
      parts.armL.rotation.z = -0.08 - raise * 0.4;
      parts.armR.rotation.z = 0.08 + raise * 0.4;
      body.position.y = walk ? Math.abs(s) * 0.08 : Math.sin(t * 2 + anim.phase) * 0.015 + cheer * 0.25;
      body.rotation.x = anim.push * 0.35;
      if (parts.flag) parts.flag.rotation.y = Math.sin(t * 3 + anim.phase) * 0.25;
      if (parts.cape) parts.cape.rotation.x = 0.12 + walk * 0.35 + Math.sin(t * 2.5) * 0.04;
      // Turn to face
      let d = anim.targetYaw - anim.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      anim.yaw += d * Math.min(1, dt * 10);
      body.rotation.y = anim.yaw;
      parts.ring.material.opacity = 0.55 + 0.3 * Math.sin(t * 3 + anim.phase);
      if (anim.moving > 0) anim.moving -= dt;
      if (anim.push > 0) anim.push = Math.max(0, anim.push - dt * 1.6);
      if (anim.cheer > 0) anim.cheer -= dt;
      if (anim.flash > 0) {
        anim.flash = Math.max(0, anim.flash - dt * 2.2);
        for (const m of flashMats) m.emissive.copy(anim.flashColor).multiplyScalar(anim.flash * 0.9);
      }
    }

    return {
      root, parts, anim, update,
      flash(color) { anim.flashColor.set(color); anim.flash = 1; },
      push() { anim.push = 1; },
      cheer(sec) { anim.cheer = sec || 2; },
      face(yaw) { anim.targetYaw = yaw; },
    };
  }

  const ROSTER = {
    player: { label: 'Abhimanyu (you)', team: '#f2b134', body: '#a5401f', accent: '#e3b23c', cape: '#e0662a', hat: 'crown', banner: '#f2b134', scale: 1.08 },
    bhima: { label: 'Bhima', sub: 'Follower', team: '#4f95e8', body: '#244c86', accent: '#a8c1e0', hat: 'turban', hatColor: '#d9cfb8', shield: '#2f5f9e', scale: 1.28 },
    nakula: { label: 'Nakula', sub: 'Scout', team: '#4f95e8', body: '#2e6fae', accent: '#c7d7ea', hat: 'hood', scale: 0.98 },
    satyaki: { label: 'Satyaki', sub: 'Guardian', team: '#4f95e8', body: '#1f416c', accent: '#d0d8e2', hat: 'helm', shield: '#3a78c2', banner: '#4f95e8' },
    sentinel: { team: '#e0453a', body: '#6e1c1c', accent: '#9c8a74', hat: 'helm', shield: '#a3241f', banner: '#c0392b', legs: '#2b1b14' },
    jayadratha: { label: 'Jayadratha', sub: 'Gatekeeper', team: '#a777e8', body: '#3f2161', accent: '#c9c2d6', cape: '#6a3fa0', hat: 'crown', shield: '#5b3392', scale: 1.22 },
    drona: { label: 'Drona', sub: 'Commander', team: '#e0453a', body: '#e8dcc0', accent: '#d9a441', robe: true, beard: true, hat: 'turban', hatColor: '#f1ead8', scale: 1.5 },
  };

  K.Characters = { makeCharacter, makeLabel, ROSTER };
})();
