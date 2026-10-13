/*
 * KURUKSHETRA — levels.js
 * "Learn to play": five short levels, each teaching ONE idea. Pure data, so the
 * unit tests can check every level is winnable.
 *
 *   hud:   which HUD panels are shown (revealed gradually)
 *   route: show a dotted route to the goal, computed from the player's own belief
 *   tips:  coach messages, shown when their trigger happens
 */
(function () {
  'use strict';
  const K = (globalThis.KURU = globalThis.KURU || {});

  const LEVELS = [
    {
      id: 1,
      title: 'Find the gate',
      lesson: 'Walls can only be crossed at gates.',
      goalText: 'Reach the golden light at the centre.',
      cond: { infoLevel: 'high', allyComms: false, enemyComms: false, seed: 21 },
      config: { rings: 2, sentinelRings: [], gatekeeper: false, allies: [], rotationPeriod: 0, resolve: 10, turnLimit: 30, goal: 'core' },
      hud: { allies: false, minimap: false, scout: false, legend: true },
      route: true,
      tips: {
        start: 'This is you, <b>Abhimanyu</b>. The <b>glowing tiles</b> are where you can step. Click one, or press <kbd>A</kbd> / <kbd>D</kbd>.',
        move: 'Walls can only be crossed at a <b>gate</b>: the gap with two torches. Follow the <b>blue dots</b>, then press <kbd>W</kbd> or click to step through.',
        breach: 'You are inside. Find the next gate and reach the <b>golden light</b>.',
      },
    },
    {
      id: 2,
      title: 'The walls turn',
      lesson: 'What you remember can become wrong.',
      goalText: 'Reach the core, even though the gates move.',
      cond: { infoLevel: 'medium', allyComms: false, enemyComms: false, seed: 26 },
      config: { rings: 3, sentinelRings: [], gatekeeper: false, allies: [], rotationPeriod: 3, resolve: 10, turnLimit: 45, goal: 'core' },
      hud: { allies: false, minimap: true, scout: true, legend: true },
      route: true,
      tips: {
        start: 'You were <b>shown the map</b> before the battle. Every <b>3 turns</b> the walls turn and the gates move. Watch the drum counter at the top.',
        rotation: 'The walls turned! <b>Grey, faded</b> walls are only <b>memories</b>: the gate may not be there any more. The route updates as you see more.',
        scoutHint: 'Not sure where the gate went? <b>Scout</b> (<kbd>E</kbd>) spends a turn to see much further.',
      },
    },
    {
      id: 3,
      title: 'Sentinels and cover',
      lesson: 'Never end a turn next to a sentinel unless an ally is beside you.',
      goalText: 'Reach the core with resolve to spare.',
      cond: { infoLevel: 'high', allyComms: true, enemyComms: false, seed: 23 },
      config: { rings: 3, sentinelRings: [2, 3], gatekeeper: false, allies: ['bhima'], rotationPeriod: 0, resolve: 8, turnLimit: 50, goal: 'core' },
      hud: { allies: true, minimap: true, scout: true, legend: true, orders: false },
      route: false,
      tips: {
        start: '<b>Red soldiers</b> are sentinels. A <b>!</b> over one means it has seen you and is coming. <b>Bhima</b> (blue) follows you.',
        sentinelSeen: 'A sentinel is in sight. If it ends a turn <b>next to you</b>, you lose 1 resolve. Keep moving.',
        pressed: 'Ouch, the red line shows who drained you. Stand <b>beside Bhima</b>: an ally next to you blocks one point of pressure.',
        covered: 'The <b>blue line</b> is Bhima covering you. Allies are your shield.',
      },
    },
    {
      id: 4,
      title: 'Hold the gate',
      lesson: 'Getting in is easy. Someone must keep the way out open.',
      goalText: 'Reach the core, then get back out to the field.',
      cond: { infoLevel: 'high', allyComms: true, enemyComms: false, seed: 4 },
      config: { rings: 3, sentinelRings: [2], gatekeeper: true, allies: ['satyaki', 'bhima'], rotationPeriod: 0, resolve: 12, turnLimit: 60, goal: 'escape' },
      hud: { allies: true, minimap: true, scout: true, legend: true, orders: true },
      route: true,
      tips: {
        start: 'This time you must <b>escape</b> too. <b>Jayadratha</b> (purple) will seal the outer gates once you break in.',
        breach: 'Jayadratha is moving! On the right, under <b>Satyaki</b>, click <b>Hold gate</b>. A gate with an ally standing on it cannot be sealed.',
        sealing: 'Jayadratha is preparing to seal a gate. Whichever one Satyaki holds stays open.',
        core: 'The core! Now head back out. <b>Green beams</b> mark outer gates that are still open.',
      },
    },
    {
      id: 5,
      title: 'The Chakravyuha',
      lesson: 'Partial sight, turning walls, sentinels and the gatekeeper, all at once.',
      goalText: 'Reach the core and escape.',
      cond: { infoLevel: 'medium', allyComms: true, enemyComms: true, seed: 16 },
      config: { goal: 'escape' },
      hud: { allies: true, minimap: true, scout: true, legend: true, orders: true },
      route: false,
      tips: {
        start: 'Everything at once. You were briefed, but the formation will turn. Use your allies: <b>Nakula</b> scouts, <b>Satyaki</b> holds a gate, <b>Bhima</b> covers you.',
        rotation: 'Remember: faded walls may be wrong now. Your allies\' eyes update the shared map.',
      },
    },
    {
      id: 6,
      title: "Krishna's counsel",
      lesson: 'Advice is only as good as the information behind it. Trust it when it agrees with what you see.',
      goalText: 'Reach the core. A messenger brings counsel each turn, and it is not always right.',
      cond: { infoLevel: 'medium', allyComms: true, enemyComms: false, seed: 31, advisor: 'unreliable', explain: true },
      config: { rings: 3, sentinelRings: [2], gatekeeper: false, allies: ['bhima'], rotationPeriod: 4, resolve: 10, turnLimit: 45, goal: 'core' },
      hud: { allies: true, minimap: true, scout: true, legend: true, orders: false, counsel: true },
      route: false,
      tips: {
        start: 'A messenger relays <b>Krishna\'s counsel</b> each turn: the tile with the teal <b>K</b>. Press <kbd>F</kbd> to follow it, or make your own move. This messenger is careless, so the counsel is <b>sometimes wrong</b>.',
        move: 'Check the counsel against what you can see. Does the marked tile lead toward a gate you know is open? Hover a tile to see your own route.',
        rotation: 'The walls turned. Counsel based on old information can now be wrong, and so can your memory.',
        core: 'Well done. The lesson: <b>neither trust advice blindly nor ignore it</b>. Weigh it against your own information.',
      },
    },
  ];

  K.LEVELS = LEVELS;
})();
