# KURUKSHETRA — The Complete Guide

This guide explains everything about the project: the idea, the story behind it, every rule, every agent, every number the game records, how to run a study, how the code is built, and what all of it teaches about real-world decision-making. It ends with likely viva questions and suggested resume lines.

---

## Contents

1. [The project in one paragraph](#1-the-project-in-one-paragraph)
2. [The story: the Chakravyuha](#2-the-story-the-chakravyuha)
3. [From the epic to the game](#3-from-the-epic-to-the-game)
4. [How to play: every rule](#4-how-to-play-every-rule)
5. [What you see: the visual language](#5-what-you-see-the-visual-language)
6. [The autonomous agents](#6-the-autonomous-agents)
7. [The information model](#7-the-information-model)
8. [The experiment](#8-the-experiment)
9. [What gets measured](#9-what-gets-measured)
10. [Analysis, export and replay](#10-analysis-export-and-replay)
11. [The simulator and what it found](#11-the-simulator-and-what-it-found)
12. [Krishna's counsel: trust in advice](#12-krishnas-counsel-trust-in-advice)
13. [How this helps real-life decision-making](#13-how-this-helps-real-life-decision-making)
14. [How the code is built](#14-how-the-code-is-built)
15. [Testing and quality](#15-testing-and-quality)
16. [Limitations and threats to validity](#16-limitations-and-threats-to-validity)
17. [Future work](#17-future-work)
18. [Viva and interview questions](#18-viva-and-interview-questions)
19. [Presenting the project](#19-presenting-the-project)
20. [Glossary](#20-glossary)

---

## 1. The project in one paragraph

KURUKSHETRA is a browser-based 3D strategy game, and also a research instrument. The player takes Abhimanyu's place inside the Chakravyuha, a turning army formation of concentric rings. The goal is to reach its core and get back out. The player sees only what is near them. Allies, enemies and the enemy commander are autonomous agents, and each acts on its own information. The amount of information the player has and the level of coordination on each side are experimental conditions. Every move is recorded against both what the player believed and what was true. That record separates mistakes caused by bad information from mistakes caused by bad judgement. A built-in dashboard, a replay viewer and a headless simulator turn the gameplay into evidence about how information and coordination shape decisions.

**The central question:** how do people make strategic decisions when they do not have complete information, especially when they must coordinate with other decision-makers?

---

## 2. The story: the Chakravyuha

On the thirteenth day of the Kurukshetra war (Drona Parva), Drona, commander of the Kaurava army, arranges his forces into the **Chakravyuha**. It is a circular formation of concentric rings of soldiers that rotate, closing gaps and opening new ones.

- **Arjuna** knows how to break the formation and how to escape it, but he has been lured to another part of the battlefield.
- **Abhimanyu**, Arjuna's sixteen-year-old son, once learned how to *enter* the Chakravyuha. He never learned how to *exit*.
- The Pandavas agree on a plan. Abhimanyu breaks in, and **Bhima**, **Satyaki** and the others follow through the breach to support him.
- **Jayadratha** has a boon that lets him hold back all the Pandavas except Arjuna for one day. He seals the breach behind Abhimanyu.
- Abhimanyu fights his way deep into the formation, alone and surrounded, and is killed.

**Why this episode, and not another?** It contains every element of decision-making under incomplete information in one compact situation:

| Element | In the story |
|---|---|
| Partial knowledge | Abhimanyu knows half the procedure: in, but not out. |
| Asymmetric information | The Kauravas know the formation. The Pandavas know their own plan. Neither knows the other's. |
| A changing environment | The formation rotates, so what was true a moment ago is not true now. |
| Coordination dependency | The plan only works if the allies follow through the breach. |
| An adversary who coordinates | Drona commands, and Jayadratha executes. The Kaurava side acts as a team. |
| Commitment | Once inside, retreat depends on an exit that someone else controls. |

The project does not re-enact the battle. There is no combat, no weapons focus and no gore. The Mahabharata supplies the **strategic structure**, and the game turns that structure into an experiment.

---

## 3. From the epic to the game

| Story element | Game mechanic | Real-world analogue |
|---|---|---|
| The rotating formation | Rings of walls (5 by default), crossed only at gates. Every 5 turns the inner walls turn and the gates move. | A market, a disaster zone or a codebase that changes while you act. |
| Knowing how to get in, not out | You start outside and must reach the core, then get back to the field. | Projects that are easy to start and hard to finish or exit. |
| Arjuna's knowledge | The "high information" condition: you always know where every gate is. | A live dashboard or an expert on call. |
| Abhimanyu's knowledge | The "low information" condition: you see only adjacent cells. | Working from the ground with no overview. |
| Being briefed once | The "medium information" condition: you see the full layout at the start, and it goes stale. | An old map, an outdated plan or last quarter's report. |
| Allies following the breach | Bhima, Nakula and Satyaki, each with its own role and information. | Teammates with different jobs and different views. |
| Communication between allies | Pandava coordination: a shared map and the ability to give orders. | A common operating picture, a team chat, an incident channel. |
| Jayadratha sealing the breach | A gatekeeper who seals outer gates after you enter, unless an ally holds them. | An exit window closing: a deadline, a regulator, a competitor. |
| Kaurava soldiers | Sentinels that patrol, spot you and drain your resolve when adjacent. | Risks and pressures that grow when they "see" you. |
| Drona's command | A commander who turns the formation adaptively when sightings reach him. | An opponent who learns and reacts. |
| Abhimanyu's fall | "Abhimanyu's fate": you reach the core but not the exit. | Winning the first half of a plan and failing the second. |

---

## 4. How to play: every rule

### 4.1 The board

- **Core:** the golden lotus at the centre. Reach it first.
- **Rings 1 to 5:** the formation (ring 1 is innermost). Each ring has 12 cells (segments) and you can always walk around a ring. The engine supports any number of rings; the epic's seven-ring Chakravyuha is `config: { rings: 7 }`.
- **Field (ring 6):** the open ground outside, where you start and where you must return.
- **Walls** separate neighbouring rings. You can only cross a wall at a **gate**.
  - The inner walls have 2 gates each, and the core wall has 1. These **rotate** every 5 turns, in alternating directions.
  - The outer wall has 3 fixed gates at segments 1, 5 and 9. They do not rotate, but they can be **sealed**.

### 4.2 Your turn

Each turn you do one of these:

| Action | Effect |
|---|---|
| **Move** | Step to an adjacent cell: along the ring, or through a gate. Legal moves glow. |
| **Wait** | Stay where you are. |
| **Scout** | Spend the turn to see 2 cells further than normal, for this turn only. |
| **Break through** | Move into a cell occupied by a sentinel. You swap places with it and lose 2 resolve. |

In addition, if Pandava coordination is on, you may give **one free order per turn** to one ally: *Follow me*, *Hold the breach* or *Scout ahead*. The order is sent along with your next action.

### 4.3 Then everyone else acts

1. **Allies** move according to their role and your orders.
2. **Jayadratha** moves along the outer ring, or seals a gate.
3. **Sentinels** patrol or chase.
4. Every 5th turn, **Drona** turns the walls.
5. **Pressure:** each sentinel next to you drains 1 resolve, unless it is pinned. Each ally next to you cancels one point of drain (cover). A sentinel next to any ally is **pinned**: it cannot move or drain that turn.
6. Everyone **observes** what is now within sight.

### 4.4 How a round ends

| Result | When | Category |
|---|---|---|
| **Escaped** | You reached the core, then stepped back into the field. | Win |
| **Abhimanyu's fate** | You reached the core, then the round ended any other way. | Partial |
| **Exhausted** | Resolve fell to 0. | Loss |
| **Encircled** | No free move, at least 2 sentinels adjacent, and too little resolve to break through. | Loss |
| **Sealed inside** | Every outer gate was sealed while you were inside. | Loss |
| **Held at the gate** | Every outer gate was sealed before you reached the core. | Loss |
| **The day ended** | 70 turns passed. | Loss |
| **Level complete** | (Learn-to-play levels with a core goal) you reached the core. | Win |
| **Abandoned** | You left the round. | Loss |

### 4.5 Score

```
score = 400 if you reached the core
      + 400 if you escaped
      + 10 × resolve left
      + 5 × turns left (only if you escaped)
```

Score is a convenience for players. The research analysis relies mostly on outcome, time and the move-quality classes.

### 4.6 Default settings

| Setting | Value |
|---|---|
| Rings × segments | 5 × 12, plus the core and the field |
| Starting resolve | 15 (levels: 8 to 12) |
| Turn limit | 70 (levels: 30 to 60) |
| Formation turns every | 5 turns |
| Your sight | 1 cell (low information) or 2 cells (medium and high) |
| Scout bonus | +2 cells for one turn |
| Ally sight | 2 cells |
| Kaurava sight | 2 cells |
| Kaurava memory of a sighting | 3 turns |
| Sentinel chase range | 6 steps |
| Breakthrough cost | 2 resolve |
| Sentinels | one per ring, 5 in total (levels: none, or one or two rings) |

### 4.7 Controls

| Input | Action |
|---|---|
| Click a glowing tile | Move there |
| W / A / S / D or the arrow keys | Move in that **screen** direction (relative to the camera) |
| Space | Wait |
| E | Scout |
| Drag | Rotate the camera |
| Right-drag, middle-drag or Shift-drag | Pan |
| Scroll | Zoom |
| Double-click | Centre the view on that spot |
| C, or the camera button | Cycle the views: **Tactical** (default, angled, whole formation) → **Close-up** (behind you) → **Map view** (top-down) |
| Click a unit or a tile that is not glowing | **Inspect** it (right panel): what you know about it, how far it is by your map, and why you cannot move there |
| F | Follow Krishna's counsel (when an advisor is on) |
| Hover a tile | Shows your route there, by what you know, and how many steps it takes |
| H | Field manual |
| Esc | Close the inspector; otherwise pause (your thinking time stops counting) |

### 4.8 Learn to play: six levels, one idea each

New players learn one rule at a time, in levels of one to three minutes. Each level unlocks the next, and the HUD panels appear only once they matter.

| Level | Teaches | What is switched on |
|---|---|---|
| 1 · Find the gate | Walls can only be crossed at gates | 2 rings, no enemies, no rotation. Route dots to the core |
| 2 · The walls turn | What you remember can become wrong | 3 rings, briefed map, walls turn every 3 turns. Scout appears |
| 3 · Sentinels and cover | Never end a turn next to a sentinel unless an ally is beside you | 2 sentinels, Bhima follows you. Allies panel appears |
| 4 · Hold the gate | Getting in is easy; someone must keep the way out open | Jayadratha, Satyaki and Bhima. Orders appear; you must escape |
| 5 · The Chakravyuha | Everything at once | The standard game |
| 6 · Krishna's counsel | Advice is only as good as the information behind it | A careless messenger marks a tile each turn; press F to follow |

A coach message explains each idea at the moment it happens: the first move, the first rotation, the first sentinel, the first drain, the first sealing. A failed level explains why and gives a tip. A won level gives up to three stars (finishing, keeping half your resolve, and making at least 75% best-possible moves). Every level is checked by a unit test to be winnable on its fixed layout.

---

## 5. What you see: the visual language

The 3D view draws **only what you know**. This is essential for the research: the screen never leaks information the condition says you should not have.

| You see | It means |
|---|---|
| Gold ring, crowned figure labelled "Abhimanyu (you)" | You |
| Glowing orange tiles with arrows | Your legal moves (red means breaking through a sentinel) |
| Ranks of red soldiers behind a low red wall | A wall you can see **right now** |
| A faded grey wall | A wall you **remember**. The formation may have turned since. |
| Misty, glass-like wall | A wall you have **never seen** |
| Pillars with torches, flags and a glowing threshold | A gate: a way through |
| Faded pillars with no flames | A gate you remember. It may have moved. |
| A red barricade across an outer gate | A sealed gate |
| Lit floor / dim floor / dark floor | Visible now / seen before / never seen |
| Blue figures (Bhima, Nakula, Satyaki) | Allies |
| Red soldiers with shields | Sentinels |
| Purple crowned figure | Jayadratha |
| Robed figure on the platform | Drona |
| Translucent column labelled "seen N turns ago" | The last place you saw an enemy |
| Golden beam over the centre | The core: your first goal |
| Green beams over outer gates (after the core) | Exits that you believe are still open |
| Blue dots | Levels 1, 2 and 4: your route to the goal. Anywhere: the route to the tile under your mouse. Always computed from **your own** belief, never the truth |
| "RING 1 … RING 5", "FIELD" on the ground | Which ring is which. The panel top left says "Ring 3 of 5 · 3 walls to the core" |
| A blue **?** over a wall | The edge of what you know: a wall right beside cells you have seen, but never seen itself |
| A grey tag "seen 4 turns ago" over a gate | A gate you remember, and how old that memory is |
| A red **!** over a sentinel | It has seen you and is coming for you. Without it, the sentinel is just patrolling |
| A red line from a sentinel to you | That sentinel just drained your resolve |
| A blue line from an ally to you | That ally just covered you |
| "Drums: the walls turn in N turns" (top) | A countdown to the next rotation. It pulses red on the last turn |
| A teal **K** and ring on a tile | Krishna's counsel for this turn. The panel on the right shows its reason and source |
| Pale mist over a tile | Ground you have **never seen**. It thins to a haze over ground you remember, and clears where you can see |
| Rings that rise in terraces toward the centre | Depth: the core is the highest ground, the field the lowest |
| Red hatching on the ground | **Possible enemy**: a sentinel you saw 1 to 3 turns ago could have walked here since, through walls you believe could be open. It is worked out from your memory only, never from where the sentinel really is |
| Dashed blue lines from allies | Where an ally says it is heading. Shown only when allies can talk to you (Pandava coordination on) |
| A pulsing purple ring and "Sealing next turn" | Jayadratha is sealing that gate. Shown only if you can see him, or your allies report it |
| An ivory outline on a tile, or a gold ring under a unit | What you have selected for inspection |
| The sun sinking and the sky reddening | The day running out. The status panel shows the turns left |
| The legend panel (left) | A permanent reminder of the symbols above |

**Screen flow.** Landing → **scenario briefing** (objectives, what you will and will not know, your allies, the enemy, controls; first-time players are offered the levels) → the command interface → **after-action report** → replay of the round. Pause (Esc or the pause button) is available at any time.

The command interface (the panels over the 3D view):
- **Top bar:** the mission, the three objectives (done ✓ / current / still to come), the drum countdown, the turn counter, and the camera, sound, field manual, pause and leave buttons.
- **Left:** your status (where you are, resolve, daylight, condition), then **Intelligence**: how much of the formation is in sight, remembered or never seen, how many gates you know and how many of those are memories, recent enemy sightings, and a reminder when your allies know things you cannot hear.
- **Right:** Krishna's counsel (when an advisor is on), the **inspector**, and your allies with their status and order buttons. Clicking an ally selects and centres it.
- **Bottom:** the action bar (Move, Wait, Scout) with an **action note** above it that reports each result: *done* (green), *failed* (red, e.g. "That way is closed"), *queued* (gold, dashed: an order that goes with your next action) or *unavailable* (dashed, with the reason).
- **Bottom left:** a 2D minimap of what you know. **Bottom right:** the chronicle. It only reports what you perceive. For example, a gate being sealed is reported only if you can see Jayadratha or your allies tell you.

---

## 6. The autonomous agents

Every agent decides from its **own** information, not from the true state of the game. This is what makes it a multi-agent environment rather than a single player against scripted obstacles.

### 6.1 Pandava allies

All allies see 2 cells around them and keep their own belief map. With **Pandava coordination on**, their maps are merged with yours every turn, they always know where you are, and they obey your orders. With it **off**, they act only on what they have seen. They know where you are only if they saw you, and only as of the moment they saw you.

| Ally | Default role | Behaviour |
|---|---|---|
| **Bhima** | Follower | Moves toward where he believes you are and stops next to you, giving cover. |
| **Nakula** | Scout | Heads for the nearest wall he has not seen, revealing gates. That map becomes yours too if you are linked. |
| **Satyaki** | Guardian | Goes to the outer gate nearest you that is not sealed, and stands on it so it cannot be sealed. |

Orders change an ally's role:
- **Follow me** makes it a follower.
- **Hold the breach** makes it a guardian, choosing the open gate nearest to you that no other ally is holding.
- **Scout ahead** makes it a scout.

Allies plan routes with Dijkstra's shortest-path algorithm on their belief. A known open gate costs 1, a known closed gate cannot be crossed, and an unknown gate costs 2. That makes them willing to try unknown walls, but they prefer known routes.

### 6.2 Jayadratha, the gatekeeper

- Does nothing until you **breach** the outer wall.
- Walks along the outer ring toward the nearest open outer gate that he does not believe is held.
- He knows a gate is held if he sees the ally there, or if a sentinel reports it (with Kaurava coordination on).
- **Sealing takes two turns.** He arrives and prepares (you may see "preparing to seal"), and seals on the next turn if no ally is standing on the gate. That window is your chance to react.
- A sealed gate stays sealed for the rest of the round.

### 6.3 Sentinels

- One per ring. They know the formation perfectly, but they see you only within 2 cells.
- **Patrol:** walk around their ring, turning back when blocked.
- **Chase:** if they have a sighting of you from the last 3 turns, and your last known position is within 6 steps, they move to stand next to that position.
  - With **Kaurava coordination on**, any sighting by any Kaurava is shared with all of them.
  - With it **off**, each sentinel only uses its own sightings.
- An adjacent, unpinned sentinel drains 1 resolve per turn.

### 6.4 Drona, the commander

- Every 5 turns he turns the six inner walls one step each, in alternating directions.
- **Adaptive mode** (Kaurava coordination on, with a fresh sighting of you): for the wall you need to cross next, he tries three options: turn it the usual way, keep it still, or turn it backwards. He picks whichever makes your true shortest path to your goal longest. In effect he moves the gate away from you.
- Without coordination, he turns the formation on a fixed schedule, because nobody tells him where you are.

### 6.5 Why these designs

Each agent's behaviour is simple enough to explain in a viva, yet the combination produces emergent situations. For example:
- Bhima follows you so closely that he blocks a corridor.
- Satyaki holds a gate on the wrong side of the formation, because nobody told him where you went.
- Drona closes the gate you were walking to, because a sentinel saw you two turns ago.

---

## 7. The information model

### 7.1 Truth and belief

The engine keeps the **true** formation. Every decision-maker keeps a **belief**:

- For every gate position: open, closed, or unknown.
- When each gate was last observed (a turn number).
- Which outer gates are known to be sealed.
- For every cell, when it was last seen.
- For every other agent, where and when it was last seen.

### 7.2 Vision

At the end of every turn, each agent observes the cells within its sight radius. Distance is counted as rings plus segments, and you can see over walls. For each visible cell you learn the state of the gate positions in the walls on either side of it, and which agents stand there.

### 7.3 Staleness

When the formation turns, your belief does **not** update by itself. A gate you saw 4 turns ago is still in your belief, marked with its age, but it may now be wrong. That is drawn as a faded wall or gate. This is the heart of the project: **old information looks exactly like current information unless you track its age.**

### 7.4 Information levels

| Level | Sight | Starting knowledge | Updates |
|---|---|---|---|
| Low (Abhimanyu) | 1 | Only the outer gates | Only what you see |
| Medium (briefed) | 2 | The whole formation, as it was at turn 0 | Only what you see, so the briefing goes stale |
| High (Arjuna) | 2 | The whole formation | Every gate is updated live, every turn |

In every condition you can **never** see enemies beyond your sight. High information is about the formation, not about the enemy.

### 7.5 Map sharing

With Pandava coordination on, all Pandava beliefs are merged every turn, keeping whichever observation is newest. The minimap and the 3D view then show what any ally has seen. This is the game's version of a **common operating picture**.

---

## 8. The experiment

### 8.1 Independent variables

| Variable | Levels | What it tests |
|---|---|---|
| Information level | low, medium, high | Does more, or fresher, information improve decisions? |
| Pandava coordination | off, on | Does a shared picture plus orders improve outcomes? |
| Kaurava coordination | off, on | How much does an adversary's coordination hurt? |
| Seed | any number | Holds the formation constant across conditions |

That gives 3 × 2 × 2 = **12 conditions**. The formation is generated from the seed alone, so two players with the same seed face the same layout regardless of condition. Agent randomness uses a separate stream.

### 8.2 Research questions and how each is answered

| Question | Evidence |
|---|---|
| RQ1: How does limited information affect decisions? | Move-class mix, decision time and number of scouts, by information level |
| RQ2: Does more information improve performance? | Escape rate, core rate and score, by information level |
| RQ3: How does coordination affect outcomes? | Pandava and Kaurava coordination on versus off |
| RQ4: How do autonomous agents change decisions? | Orders given, cover events, ally actions per turn |
| RQ5: How does strategy change when the environment changes? | Behaviour before versus after rotations, and fixed versus adaptive Drona |
| RQ6: Can gameplay data reveal decision patterns? | Turn-level logs, replays and the dashboard |

### 8.3 Study mode

1. The participant enters an ID, for example P07.
2. They play **learn-to-play levels 1 to 4** as practice. These are saved with mode "tutorial" but not analysed.
3. They play **three rounds**, one at each information level.
4. The **order** of the levels comes from a hash of the ID, mapped to one of the 6 possible orders. This **counterbalances** learning effects across participants.
5. Pandava coordination is on or off for that participant, also from the hash. It is a between-subjects factor. Kaurava coordination is on.
6. The rounds use seeds 101, 102 and 103 in round order, so every participant faces the same three formations in the same positions.
7. After each round there are five 1-to-5 agreement questions plus a free comment:
   - I understood what was happening around me.
   - I had enough information to make good decisions.
   - My allies helped me reach my goal.
   - The scenario was difficult.
   - I enjoyed playing.

### 8.4 Running a study: step-by-step protocol

1. **Prepare.** Use one laptop with Chrome or Edge. Open `index.html`. In *Graphics & sound*, choose Fast if the laptop is old.
2. **Consent.** Explain that it is a game about decision-making, that only gameplay and answers are recorded, anonymously by ID, and that they can stop at any time.
3. **Assign IDs** in order: P01, P02 and so on. Aim for a multiple of 12 participants, which balances all 6 orders across both coordination groups.
4. **Run.** Click *Study session*, enter the ID and click *Begin study*. Do not coach the participant after the practice levels.
5. **Export.** After each participant, or at least at the end of every day, open *Analysis* and click **Export JSON**. Browser storage can be cleared by accident.
6. **Combine.** On one machine, **Import JSON** every file. The dashboard merges them, ignoring duplicates.
7. **Analyse.** Use the dashboard, or export the **summary CSV** (one row per round) and the **turn-level CSV** (one row per turn) to Excel, Python or R.

---

## 9. What gets measured

### 9.1 Move-quality classification (the key metric)

Before your move is applied, the engine computes two distance fields to your current goal (the core, or after the core, any field cell):

- **True distance:** a breadth-first search on the real formation, ignoring agents.
- **Belief distance:** Dijkstra's algorithm on your belief. Unknown gates cost 2, known closed gates cannot be crossed, and seals you know about are respected.

Then your move is classified:

| Class | Rule | Meaning |
|---|---|---|
| `optimal` | The cell you moved to is one step closer on a true shortest path | The best possible move |
| `forced` | Every optimal next cell was occupied by an enemy | The best route was blocked |
| `info-error` | Not optimal in truth, but on a shortest path in **your belief** | Right for what you knew, wrong in reality |
| `decision-error` | Not optimal even in your belief | Off course even by what you knew |
| `no-route` | No true route existed at all | For example, everything was sealed |

Waits, scouts and invalid moves are recorded as their own types.

**A worked example.** You are on ring 4. You remember a gate inward at segment 6, seen 3 turns ago. You walk toward it. Last turn the wall rotated, and the gate is now at segment 7.
- Your belief says segment 6 is the way, so your move is on a belief-shortest path.
- The truth says segment 7, so your move is not on a true shortest path.
- The move is classified as an **info-error**. You decided correctly, but your information was stale.

If you had walked away from both gates for no reason, it would be a **decision-error**.

*Note:* a decision-error is not always a mistake. Stepping away from a sentinel or waiting for an ally can be smart. The class measures **route quality** only. Read it together with the outcome.

### 9.2 Per-turn record (turn-level CSV)

| Column | Meaning |
|---|---|
| `t` | Turn number |
| `phase` | `core` before reaching the core, `exit` after |
| `action` | `move`, `wait` or `scout` |
| `moveClass` | See the table above |
| `decisionMs` | Milliseconds from the turn being shown to the action, minus time paused or in another tab |
| `from`, `to`, `ring` | Cell ids and the ring after the move |
| `trueDistBefore`, `trueDistAfter` | True steps to the goal |
| `beliefCostBefore` | Belief cost to the goal |
| `knownFrac` | Share of inner gate positions you have any belief about |
| `staleFrac` | Share of those beliefs that are wrong |
| `resolve` | Resolve after the turn |
| `pressing`, `cover`, `drain` | Sentinels pressing you, allies covering you, and resolve lost |
| `visibleEnemies` | Enemies in sight |
| `signal` | The order given this turn, if any |
| `events` | For example `breach`, `rotation`, `sealed`, `core`, `pressed`, `covered`, `breakthrough`, `escaped` |
| `infoLevel`, `allyComms`, `enemyComms`, `seed` | The condition |

### 9.3 Per-round summary (summary CSV)

Outcome (`result`, `category`), `turns`, `coreReached`, `coreTurn`, `resolve`, `score`, the counts of each move class, `optimalRate`, `waits`, `scouts`, `signals`, `meanDecisionMs`, `meanKnownFrac`, `meanStaleFrac`, `totalDrain`, `coverEvents`, `gatesSealed`, `rotations`, `breachTurn`, and the questionnaire answers (`fb_*`).

---

## 10. Analysis, export and replay

### 10.0 The after-action report (end of every round)

Everything on it is computed from this round's log or from the rounds stored in this browser. Nothing is estimated.

- **Objectives:** each one, achieved or not, and on which turn.
- **Metrics:** score, turns, resolve, share of best moves, scouts, orders, map known and map wrong, average thinking time, gates sealed, and the counsel figures when an advisor was on.
- **Turn by turn:** one bar per turn coloured by move class, with rotations, resolve lost, the breach and the core marked. Hover a bar for that turn.
- **Turning points:** the moments that decided the round (breaking in, the first rotation and the first one aimed at you, orders, the first information error, being caught, covers, seals, counsel followed or ignored).
- **Your decisions:** the move-quality bar and the plain-language lesson.
- **What the others did:** each ally (covered you, held a gate, scouted, could not move), Jayadratha (seals, and attempts stopped), the sentinels (turns they pressed you, resolve cost) and Drona (rotations, and how many were aimed using sentinel reports).
- **What you knew, turn by turn:** the share of the formation you knew, and how much of that was wrong in truth.
- **Compared with your earlier rounds:** escape rate and best-move share by information level, from rounds without counsel stored in this browser. With no earlier rounds it says so instead of showing empty numbers.
- **Four viewpoints** for the 3D battlefield: *You knew it*, *It truly was*, *Your allies knew it* (their maps merged) and *The Kauravas knew it* (the formation in full, and you where they last placed you).
- **Replay this round** opens the verified replay and comes back to the report.

### 10.1 The dashboard (`analysis.html`)

- **Filter:** human sessions (play and study), bot sessions, tutorial sessions, or all.
- **Tiles:** sessions, participants, escape rate, core rate, optimal share and average decision time.
- **Escape rate by information level**, split by Pandava coordination, with 95% confidence intervals.
- **Move quality by information level**, as stacked bars.
- **By condition:** a table of all 12 conditions with n, escape rate and its interval, core rate, score, turns, move-class shares, decision time, scouts, orders, staleness and questionnaire means.
- **Sessions:** a list of every round with **Replay** and **Delete** buttons.
- **Generate bot baseline:** plays 96 bot rounds in the browser, so the dashboard can be demonstrated with no participants.
- **Export:** summary CSV, turn-level CSV and JSON. **Import:** JSON files from other machines.

### 10.2 Replay

Click **Replay** on any session. The game:

1. Rebuilds the round from its seed, settings and recorded actions.
2. Re-simulates it completely and checks the result matches the recording. That is the **"Verified: identical re-simulation"** badge.
3. Shows a timeline with one bar per turn, coloured by move class. Gold ticks mark rotations, gold dots mark the core and red marks show resolve lost.
4. Lets you play, pause, step, jump or click anywhere on the timeline. **Show the truth** switches between what the player knew and the real formation.

That makes replay useful for after-action reviews with participants and for spotting decision patterns. For example: "every info-error came within two turns of a rotation".

### 10.3 Reading confidence intervals and p-values

- **95% confidence interval:** the range of plausible values for the true rate. "40% (28–53%)" means that with this sample size, the real escape rate could reasonably be anywhere from 28% to 53%. Wide intervals mean you need more participants.
- **Wilson interval:** a method for computing that range that stays accurate even with small samples or rates near 0% or 100%.
- **p-value:** if there were really no difference between two conditions, how often would chance alone produce a gap this large? Below 0.05 is conventionally called significant. It does not measure how big or important the effect is. The difference in points does that.

---

## 11. The simulator and what it found

### 11.1 Bots

| Bot | Knows | Purpose |
|---|---|---|
| `belief` | Exactly the player's own belief, like a human | The main comparison agent |
| `oracle` | The true formation | Upper reference: how well perfect map knowledge can do |
| `random` | Nothing | Lower reference |

The belief bot moves along its belief-shortest path. It avoids cells next to recently seen sentinels, scouts when its plan crosses an unknown wall, and when linked, orders one ally to hold a gate after the breach.

### 11.2 Running it

```sh
npm run sim      # 3 bots × 12 conditions × 200 seeds = 7,200 games, then the report
```

Outputs:
- `results/sim-games.csv`: one row per game.
- `results/REPORT.md`: every table, interval and test.
- `results/figures/*.svg`: the charts.

### 11.3 Findings (belief-planning bot)

| Effect | Escape rate | p |
|---|---|---|
| Low → high information | 49.3% → 77.9% | < 0.001 |
| Low → medium information | 49.3% → 53.5% (no significant gain) | 0.089 |
| Pandava coordination off → on | 47.9% → 72.5% | < 0.001 |
| Kaurava coordination off → on | 68.8% → 51.7% | < 0.001 |

What these mean:
1. **Live information matters most.** Knowing the current formation raises success by almost 29 points.
2. **A briefing that goes stale is worth almost nothing.** The agent briefed once does no better than the agent with no briefing.
3. **Coordination is a force multiplier.** Linking the allies adds about 25 points of success.
4. **The adversary's coordination matters about as much as yours.**
5. **The metric behaves as designed.** With high information there are zero information errors, so any remaining mistake must be a decision error.

These are scripted agents. Whether humans show the same pattern, and where they differ, is exactly what the user study measures.

---

## 12. Krishna's counsel: trust in advice

### 12.1 The idea

Arjuna wins where Abhimanyu falls, and part of the difference is his advisor: Krishna. Today the "advisor" is often a colleague, a dashboard, or an AI system. Advice is only as good as the information behind it, so the question is not "is advice good?" but **"when should I trust it?"** The game makes that measurable.

Each turn, counsel can mark one tile with a teal **K** and give a one-line reason. The player may press **F** to follow it, or make any other move.

### 12.2 The conditions

| Advisor | How it works |
|---|---|
| None | No counsel |
| Reliable messenger | Relays the expert's move; right about **90%** of the time |
| Careless messenger | Garbles it more often; right about **62%** of the time |
| **Krishna's insight** | Reasons **only from what the player knows** and recommends the best route by that knowledge. It explains what its advice rests on, for example "relies on 2 walls you have never seen". Free, offline and deterministic |
| AI agent | Claude, acting as Krishna, sees **only what the player knows** (section 12.6) |

A second factor is **reasons on or off**. With reasons on, the advice carries a short explanation. The wording is **identical for right and wrong advice**, so the text gives no clue. The player has to judge the advice against what they can see, which is exactly the skill being measured. Scripted counsel is deterministic per seed and turn, so it replays exactly.

### 12.3 What counts as good counsel

"Good" means what an **expert** would accept. The expert is a commander with the true map and sight of every sentinel, played by the oracle bot. Good counsel is the expert's own move, or any move on a true shortest path that doesn't end next to a sentinel. (An earlier version scored only shortest paths. Even "perfect" advice then walked players into sentinels, and blind followers were exhausted 46% of the time. That is why the definition includes danger.)

### 12.4 Reliance metrics (logged automatically)

| Metric | Meaning |
|---|---|
| Followed good counsel | Share of right advice the player took |
| Followed bad counsel (**over-reliance**) | Share of wrong advice the player took |
| Ignored good counsel (**under-reliance**) | Share of right advice the player passed up |
| Appropriate reliance | (followed good + ignored bad) ÷ all counsel |

Every turn's record also stores the advised cell, its source, whether it was good, whether it was on a shortest path, whether it matched the player's own belief, and, for the AI agent, how long it took.

### 12.5 What the simulator found

Three scripted trust policies were tested:
- **Ignore:** the belief bot, which disregards counsel.
- **Always trust:** follows every piece of counsel.
- **Calibrated:** follows counsel unless it clearly contradicts its own map.

Each policy faced each advisor on the same 200 formations.

| Advisor | Ignore | Always trust | Calibrated |
|---|---|---|---|
| None | 49.5% | — | — |
| Reliable (90%) | 49.5% | 57.0% | **65.0%** |
| Careless (60%) | 49.5% | **1.5%** | 44.5% |
| Krishna's insight | 49.5% | 52.0% | 52.0% |

- **Calibrated trust is the only way good advice becomes a significant gain:** +15.5 points, p = 0.002. Blind trust gains only +7.5 points (p = 0.133), because the occasional wrong step costs as much as the good ones save.
- **An advisor limited to your information can't fix your blind spots.** Krishna's insight is right 95% of the time, and every wrong piece is wrong because the player's information was. Trusting it doesn't significantly help a bot that already plans perfectly on its own map (p = 0.617). It can only help players who reason less carefully than it does, and the human study measures exactly that.
- **Blind trust in a careless source is catastrophic,** and calibration almost fully protects against it. A logistic regression gives an odds ratio of about 53.
- Full tables are in `results/COUNSEL.md` and `results/ANALYSIS_PY.md`.

### 12.6 The AI agent (`js/krishna.js`)

- **Model and SDK:** Claude through the official Anthropic SDK. The default is `claude-opus-5-5` at low effort, for speed, and both can be changed in the settings.
- **Tools:** `get_situation`, `get_known_map`, `get_legal_moves` and `plan_route` all read **only the player's belief, sight and legal moves.** A unit test checks that nothing the player doesn't know leaks through.
- **Finishing:** the agent ends by calling the strict `give_advice` tool with `move_to`, `explanation` and `confidence`. An illegal move is sent back to it as a tool error, so it can correct itself.
- **The loop:** a manual tool-use loop.
  - Responses are appended unchanged, which keeps thinking blocks valid.
  - All tool results for a turn go back in one message.
  - The system prompt is cached.
  - A refusal or a `max_tokens` stop is reported instead of being guessed around.
  - Server-side fallbacks (`fallbacks: "default"`) are enabled.
- **In the game:** choose *Counsel → AI agent* and paste an API key. The SDK loads from the CDN only for this condition. Thinking time is measured from when the counsel arrives.
- **Evaluation:** `npm run krishna:mock` runs the whole pipeline with a stand-in client. `npm run krishna:eval -- --yes --seeds 3` runs the real agent; it costs money, so it asks for `--yes`. Both write `results/KRISHNA_EVAL.md` with:
  - Good, shortest-path and consistent-with-knowledge rates.
  - Wrong because of bad information versus wrong by the agent's own reasoning.
  - Latency, tokens and estimated cost.

  `--mode drive` lets the agent play the game outright.
- **A free stand-in for the LLM: Krishna's insight.** It answers the same question, "what is the best move by what the player knows?", deterministically and at no cost. It sets the bar any LLM advisor limited to the player's view must beat: about 95% good counsel at medium information.
- **No API key?** The project is complete without one. Every experiment uses the free advisors, and the Claude agent is built and tested against a mock client, so a live run is optional.

### 12.7 Running the counsel study

1. Click *Study session*, choose **Counsel study**, enter the ID and click *Begin study*.
2. The participant plays practice **levels 1 to 4 and level 6** (*Krishna's counsel*). These are saved but not analysed.
3. They then play **four rounds**, with a reliable messenger, a careless one, Krishna's insight and no counsel. The order comes from a **balanced Latin square** chosen by the ID: each advisor appears once in each position and follows every other advisor exactly once. Information is medium, both sides are coordinated, and the seeds are 201 to 204.
4. **Reasons on or off** is assigned per participant from the ID, so it is a between-subjects factor. A multiple of 8 participants balances every order with both settings.
5. Export and analyse as usual. The dashboard's counsel section and `analysis/analyze.py --sessions` both report reliance.

### 12.8 The lessons for real life

- **Automation bias is real.** People tend to follow confident advice even when it is wrong. The careless messenger sounds exactly as sure as the reliable one.
- **Calibrate, don't obey or dismiss.** The best policy was neither "always follow" nor "ignore". It was "follow unless it contradicts what I can see".
- **An advisor that only sees what you see can't fix your blind spots.** The LLM is limited to the player's knowledge, so when the map is stale, its counsel goes stale too.
- **Explanations persuade, but they don't prove.** Whether reasons make people follow bad advice *more* is exactly what the reasons condition measures.

## 13. How this helps real-life decision-making

### 13.1 Seven lessons from the Chakravyuha

1. **Incomplete information is the normal case, not the exception.** No one ever sees the whole formation. Good decision-makers act on partial information *and* actively reduce uncertainty. In the game, scouting costs a turn, just as real information-gathering costs time.
2. **Stale information is more dangerous than missing information, because it does not look missing.** The medium condition shows it: a confident but outdated map leads you into walls. In practice, **date-stamp your beliefs**, as the game fades remembered walls: "this was true as of Tuesday".
3. **Shared situational awareness multiplies a team.** The biggest single improvement in the simulator came from linking the allies. Teams that pool what each member sees outperform teams of individually smart members.
4. **Someone must hold the exit.** Abhimanyu's real failure was not the entry but the closed exit. In planning, assign responsibility for the way back: a rollback plan, a contingency budget, an exit clause. That is Satyaki holding the gate.
5. **Your opponent coordinates too.** The Kaurava side got much stronger when its sentinels shared sightings and Drona adapted. Competitors, adversaries and even environments respond to what you do.
6. **Judge a decision by the information available when it was made.** The info-error versus decision-error split is a formal version of a good habit. Do not punish someone for a sound decision that met bad information. Fix the information flow instead. This is the idea behind blameless post-mortems and after-action reviews.
7. **Getting in is easier than getting out.** Commitment narrows your options. Before committing, ask what you need to know, and who you need beside you, to come back.

### 13.2 Where the same structure appears

| Domain | The "formation" | Stale information | Coordination | Holding the exit |
|---|---|---|---|---|
| Disaster response | A collapsing building, a flood zone | Yesterday's map of passable roads | A shared incident command picture | A secured evacuation route |
| Military and police operations | Hostile terrain | Old intelligence | Radio, a common operating picture | Extraction plan |
| Hospitals | A patient's changing condition | Vitals from the last shift | Handover between shifts | Escalation protocol |
| Software incidents | A failing distributed system | An outdated runbook or dashboard | An incident channel, an incident commander | Rollback |
| Business strategy | A market with competitors | Last year's market research | Teams sharing customer data | An exit clause, a pivot plan |
| Supply chains | Suppliers, routes, demand | Delayed inventory reports | Shared forecasting | Backup suppliers |
| Everyday life | A trip in an unfamiliar city | Last year's bus timetable | Group chat with friends | Knowing the last train home |

### 13.3 How the game itself helps

- **Experiential learning.** Feeling a gate move away from you teaches "beliefs go stale" faster than any lecture.
- **The debrief is an after-action review.** Switching to *The truth* shows exactly where belief and reality diverged.
- **Personal feedback.** "You made 4 information errors and 1 decision error" tells a player whether to improve their information-seeking or their judgement. Those are different skills.
- **Evidence for design.** If a team, a company or a classroom wanted to know whether a shared dashboard is worth building, this is the kind of controlled comparison that answers it.

---

## 14. How the code is built

### 14.1 Principles

- **No build step, no runtime dependencies.** Plain JavaScript files loaded in order. It runs from `file://`, a USB stick or GitHub Pages. Three.js r128 is vendored in `vendor/`.
- **One engine, two hosts.** Every engine file attaches to one global object (`globalThis.KURU`). The browser loads them with `<script>` tags. Node loads them with `require` through `sim/load.js`. The tests and the simulator therefore run exactly the code people play.
- **Truth versus belief.** The engine owns the truth. The renderer receives a **view**: `playerView()` during play, and `truthView()` only in the debrief and replay.
- **Determinism.** The randomness is seeded (mulberry32), with separate streams for the layout and for agent behaviour. The same seed and the same actions produce the same game. Replay relies on this, and a test checks it.

### 14.2 Files

| File | Responsibility |
|---|---|
| `js/core.js` | Seeded randomness, ring/segment geometry, links, gate generation, rotation, Dijkstra distance fields, belief maps (observe, merge, staleness) |
| `js/agents.js` | Ally, gatekeeper, sentinel and commander policies, plus pinning and the hold logic |
| `js/engine.js` | Configuration and conditions, game creation, the turn loop, observation, move classification, end conditions, scoring, summaries, views |
| `js/bots.js` | Baseline player policies and `playBot()` |
| `js/logger.js` | Session schema (`kurukshetra/session@1`), local storage, CSV/JSON export and import |
| `js/stats.js` | Aggregation by condition, Wilson intervals, two-proportion z-test |
| `js/world3d.js` | 3D scene: sky, lighting, ground, armies, the formation (floors, walls, gates, soldier ranks), fog-of-war colouring, characters, ghosts, effects, camera, picking, the post-processing pipeline (HDR, bloom, sRGB, vignette, FXAA) |
| `js/characters.js` | Procedural low-poly characters and their animation (walk, idle, push, cheer, raise arms) |
| `js/audio.js` | Synthesised sound effects (drums, conch, chime) through Web Audio |
| `js/render.js` | The 2D minimap |
| `js/advisor.js` | Messengers of controlled reliability, Krishna's insight (knowledge-only planner), and scoring of any advice against the expert |
| `js/krishna.js` | The Claude tool-use advisor agent (tools read only the player's knowledge) |
| `sim/counsel.js`, `sim/krishna-eval.js` | Counsel experiment (report + CSV); LLM-agent evaluation harness (mock and live) |
| `analysis/analyze.py` | Python analysis: pandas tables, logistic regression (IRLS in NumPy), matplotlib figures |
| `js/levels.js` | The six learn-to-play levels, as pure data (tested for winnability) |
| `js/views.js` | Knowledge views for the interface, each stating whose knowledge it uses: possible-enemy zones, ally plans, sealing, tile reports, and the post-game Kaurava and ally pictures |
| `js/insights.js` | The scenario briefing and the after-action report (objectives, turning points, agent summaries, knowledge series, comparison), derived from the real state and log |
| `css/game.css` | The design system: colour tokens, bundled fonts (Cinzel, Cormorant Garamond, Inter), components and every screen |
| `js/ui.js` | Landing, intro, briefing, learn-to-play levels, command interface, inspector and selection, input (click and camera-relative keys), action notes, event narration, pause, settings, after-action report, study mode, replay |
| `js/analysis.js` | Dashboard charts, tables, import/export, bot baseline |
| `sim/run.js`, `sim/report.js` | Experiment runner, report and figure generator |
| `tests/run-tests.js` | Unit tests |
| `tests/e2e.js` | Browser end-to-end tests |
| `tools/cdp.js` | Zero-dependency Chrome DevTools Protocol driver |
| `tools/screenshots.js`, `tools/serve.js` | Screenshot generator, static server |

### 14.3 Algorithms worth knowing

- **Geometry:** cell id = 1 + (ring − 1) × 12 + segment, and the core is id 0. Links are either along a ring (always open) or radial through a wall position (open only where there is a gate).
- **Shortest paths:** Dijkstra's algorithm from the goal cells outward, with costs supplied by a function. Swapping that function gives the true map, a belief, or a danger-weighted belief.
- **Rotation:** shifting a wall's gate array by ±1 segment.
- **Adaptive commander:** a one-step lookahead over three rotation options, choosing the one that maximises the player's true distance to the goal.
- **Rendering geometry:** walls and floors share one geometry per ring, rotated per segment. The soldier ranks are a single instanced mesh. Walls rise and sink when your belief about them changes.
- **Colour pipeline:** the scene renders into a half-float target, then bloom, then sRGB encoding. The fog colour and the sky shader are corrected so the result matches the plain renderer exactly.

### 14.4 Data schema (one session)

```json
{
  "schema": "kurukshetra/session@1",
  "id": "S…", "participantId": "P07", "mode": "study", "round": 2,
  "condition": { "infoLevel": "medium", "allyComms": true, "enemyComms": true, "seed": 102 },
  "config": { "rings": 7, "segments": 12, "resolve": 15, "turnLimit": 90, "…": "…" },
  "startedAt": "…", "endedAt": "…",
  "summary": { "result": "escaped", "turns": 61, "optimal": 44, "infoErrors": 5, "…": "…" },
  "turns": [ { "t": 1, "action": "move", "moveClass": "optimal", "decisionMs": 2310, "…": "…" } ],
  "feedback": { "understood": 4, "enoughInfo": 2, "alliesHelped": 4, "difficulty": 4, "enjoyed": 5, "comment": "…" }
}
```

---

## 15. Testing and quality

| Layer | What is checked |
|---|---|
| **Unit tests** (41) | Geometry symmetry, id round-trips, rotation keeping the gate count, every seed being solvable, same seed giving the same formation, high information never stale, medium information going stale, low information starting unknown, scout radius, map sharing, walls blocking moves, breach detection, two-turn sealing, holding preventing sealing, sealed gates blocking Pandavas, cover reducing drain, resolve never rising, **deterministic replay**, every game ending, move classes adding up, zero info-errors under high information, JSON/CSV round-trips, aggregation, Wilson intervals, z-test, deterministic counsel, reliability rates, reliance accounting, the agent's information constraint, the agent loop against a mock Claude client (parallel tools, illegal-move correction, fallbacks), refusal handling, Krishna's insight using only the player's knowledge, **no truth leaking into the interface views** (possible-enemy zones ignore true sentinel positions and never cover visible ground; tile reports describe walls from the belief; ally plans and sealing stay hidden without coordination or sight), the briefing matching the configuration, and the report agreeing with the log and summary |
| **End-to-end tests** (9) | The real game in headless Chrome: menu, levels 1 and 2 played to completion with progress unlocking, keyboard moves, the pause menu stopping input, the briefing, the tile and unit inspector, the camera cycle, the after-action report with its four viewpoints and replay-and-return, a full study flow (four practice levels, then three counterbalanced rounds), the dashboard, counsel (marked tile, following with F, logging, and the AI agent's no-key message), **replay verification**, and no JavaScript or console errors |
| **CI** | Unit tests, a simulator smoke run, the mock agent evaluation, the browser suite and the Python analysis on every push (`.github/workflows/ci.yml`) |
| **Visual checks** | `npm run screenshots` regenerates every README image from the live game |

---

## 16. Limitations and threats to validity

Be ready to state these honestly. Examiners respect it.

- **The AI advisor was not run live during development.** Its loop, tools and information constraint are unit-tested against a mock client, and the browser path was checked up to a real API call that rejected a dummy key. A successful live run needs your key: `npm run krishna:eval -- --yes`.
- **LLM counsel is not deterministic.** Replays use the counsel that was recorded, so they stay exact, but the same seed can produce different AI advice on a fresh run. That is why the main counsel study uses the scripted messengers.
- **"Good counsel" depends on the expert definition** (section 12.3). A different expert would move the numbers, although not the direction of the effects.
- **Bots are not humans.** The current results come from scripted agents. Human data from the user study is the next step.
- **Scripted agents.** The agents follow hand-written rules, not learned policies. That keeps them explainable, but they are less adaptive than people.
- **Decision-error is route quality only.** Deliberate detours, such as avoiding a sentinel, count as decision-errors. Interpret the class together with outcomes.
- **Small samples.** A class study gives wide confidence intervals. The intervals are shown so readers do not over-read small differences.
- **Order and learning effects.** Counterbalancing spreads them across participants but cannot remove them for any single person.
- **Seed and round position.** Each round position uses a fixed seed. Across participants the information levels rotate through those seeds, but with few participants, layout difficulty can still mix with condition.
- **One scenario.** The findings are about this formation. Other structures may behave differently.
- **Local storage.** Data lives in the browser until it is exported. The protocol says to export after every participant.

---

## 17. Future work

- **More scenarios** from the Mahabharata: the dice game as a bluffing and hidden-information game, the Padmavyuha, the night battle with even less visibility.
- **Learned agents:** train reinforcement-learning agents in the simulator, the same environment humans play, and compare human, scripted and learned behaviour.
- **Human–AI teaming:** let an AI advisor suggest moves, and measure when players trust it and when they shouldn't.
- **Multiplayer:** two humans as Pandava teammates with genuinely different views.
- **Larger studies:** online deployment through GitHub Pages, with a consent screen and optional anonymous upload.
- **Classroom mode:** an instructor dashboard comparing a whole class's decision patterns.

---

## 18. Viva and interview questions

**Q: Isn't this just a Mahabharata-themed game?**
No. The theme is the source of the strategic structure, and the contribution is the measurement. The game separates information errors from decision errors and manipulates information and coordination as controlled variables.

**Q: What is novel here, given PettingZoo and the StarCraft Multi-Agent Challenge exist?**
Those environments study agents playing with agents. This one puts a human inside a partially observable multi-agent environment, makes information and coordination experimental conditions, and logs belief versus truth for every human move. It is also accessible: anyone can play it in a browser in three minutes.

**Q: How do you know a move was an "information error"?**
Before each move the engine computes the true shortest-path field and the player's belief field. A move that is optimal in the belief but not in the truth is an information error. With high information the two fields coincide, and the simulator confirms zero information errors in that condition.

**Q: Why three information levels?**
Low and high are the extremes, Abhimanyu and Arjuna. Medium tests a specific, realistic case: you were briefed once, and the world moved on. It is also where the most interesting result appeared: a stale briefing gave no significant benefit.

**Q: Why are the agents rule-based and not trained with machine learning?**
Explainability and control. Every behaviour can be described and defended, and conditions differ only in the variable being studied. Learned agents are listed as future work, and the simulator is the environment they would train in.

**Q: How do you make sure the results are not caused by the map layout?**
Seeds. All 12 conditions run on the same 200 layouts in the simulator, and every study participant faces the same three layouts.

**Q: How do you measure decision time fairly?**
From the moment the turn is shown to the moment the player acts. Time spent with the game paused or in another browser tab is subtracted.

**Q: What does "deterministic" buy you?**
Reproducibility. Any recorded round can be replayed exactly from its seed and actions, which the replay viewer verifies, and any bug can be reproduced. It also makes the comparison between conditions fair.

**Q: Why does the AI advisor only see what the player sees?**
So its advice is a fair comparison. If it saw the truth it would just be an oracle, and the experiment would only measure obedience. Restricting it shows something realistic: an advisor with your information can't fix your blind spots. Its information errors are measured separately from its reasoning errors.

**Q: How do you know the LLM's advice was good?**
The engine scores every piece of counsel against an expert, the oracle bot, which has the true map and sees every sentinel. The evaluation harness reports how often the agent was right, how often it was wrong because the player's information was wrong, and how often it was wrong anyway.

**Q: You didn't run the LLM live. Isn't that a gap?**
The research doesn't depend on it. Its question, whether advice limited to your information can fix your blind spots, is answered by Krishna's insight, a deterministic advisor with exactly the LLM's information. That makes it reproducible and free. The LLM agent is built, tested against a mock client, and checked up to a real API call. Running it live is one command and a key away.

**Q: Isn't calling an LLM every turn slow and expensive?**
Low effort and prompt caching keep it to a few seconds. Thinking time is measured from when the counsel arrives. The evaluation harness prints the token use and estimated cost, and it refuses to spend money without `--yes`. Scripted advisors carry the main experiment, so results don't depend on API availability.

**Q: What would you change with more time?**
Run the human study, add learned agents, and add a second scenario to test whether the findings generalise.

**Q: How does this help in real life?**
It turns three habits into something measurable: date-stamping your beliefs, sharing situational awareness, and assigning someone to hold the exit. It also models the most important evaluation habit: judging decisions by the information available at the time. See section 13.

**Q: Why no framework or bundler?**
Faculty and testers must be able to run it by double-clicking a file, with no install and no internet. The engine also has to run unchanged in Node for the tests and the simulator.

**Q: What was the hardest technical problem?**
Keeping the 3D view honest. It must never show what the player does not know, while still showing remembered information and its age. A second hard problem was matching colours between the plain renderer and the post-processing pipeline (HDR, bloom, sRGB), which needed explicit fixes for the fog and the sky shader.

---

## 19. Presenting the project

### 19.1 Suggested resume lines

- Built an **LLM-powered advisor agent** (Claude, Anthropic SDK, tool use) for a partially observable 3D strategy game, restricted to the player's own information. Evaluated its advice against ground truth with a cost-aware harness, and ran a controlled study of when people over-trust AI recommendations.
- Built **KURUKSHETRA**, a 3D multi-agent strategy game (JavaScript, Three.js) that measures decision-making under incomplete information. Every move is classified against true and believed shortest-path fields, separating information errors from decision errors.
- Designed belief-based autonomous agents (followers, scouts, a gatekeeper, an adaptive commander) and a 12-condition experiment with seeded, counterbalanced study mode and deterministic replay.
- Showed in 1,400 simulated games that calibrated trust is the only way a 90%-reliable advisor becomes a significant gain (+15.5 points, p = 0.002), while blind trust in a 60% advisor collapses success to 1.5%. Analysed in Python (pandas, logistic regression).
- Ran 7,200 simulated games showing live information raises success from 49% to 78% and team coordination from 48% to 73% (p < 0.001), with Wilson confidence intervals and an auto-generated report.
- Shipped with zero runtime dependencies, 27 unit tests, 7 headless-browser end-to-end tests run by a custom Chrome DevTools Protocol driver, CI, and GitHub Pages deployment.

### 19.2 A 60-second demo script

1. **Menu (10 s):** "The Chakravyuha: a formation that keeps turning. Abhimanyu knows how to get in, not out."
2. **Level 2, The walls turn (15 s):** "I was shown the map, but the drums just sounded. Faded walls are memories, and this one is wrong now."
3. **Tactical view (10 s):** "Dark rings are unknown, a blue ? is the edge of what I know, and a red ! means a sentinel is hunting me."
4. **Debrief, The truth (10 s):** "Here is what was really there. These amber moves were right for what I knew, wrong in reality."
5. **Dashboard and replay (15 s):** "Every round becomes data. Replay re-simulates it exactly, verified, with a timeline of decision quality."

### 19.3 Publishing on GitHub

1. Create a repository and push the project folder. Nothing has been committed yet.
2. In *Settings → Pages*, set *Source* to **GitHub Actions**. The included workflow deploys the game. It will be at `https://shravyasaravanane.github.io/kurukshetra/`.
3. Add that link to the top of the README and to your resume.
4. Pin the repository on your GitHub profile.
5. Edit the copyright line in `LICENSE` to your names.

---

## 20. Glossary

| Term | Meaning |
|---|---|
| **Belief** | What a decision-maker thinks is true. It may be incomplete or out of date. |
| **Breach** | Entering the formation through an outer gate. |
| **Common operating picture** | A shared, up-to-date view of a situation that the whole team can see. |
| **Counterbalancing** | Varying condition order across participants so learning effects cancel out. |
| **Cover** | An ally next to you cancels one point of sentinel pressure. |
| **Decision error** | A move that is wrong even according to your own belief. |
| **Deterministic** | The same inputs always give the same outputs. |
| **Dijkstra's algorithm** | A shortest-path algorithm on a graph with edge costs. |
| **Information error** | A move that is right for your belief but wrong in reality. |
| **Partial observability** | Agents cannot see the whole state of the world. |
| **Pinned** | A sentinel next to an ally cannot move or press you that turn. |
| **Resolve** | Your stamina. At 0 the round ends. |
| **Seed** | A number that fixes all randomness, so a situation can be reproduced. |
| **Staleness** | The share of your beliefs that are no longer true. |
| **Wilson interval** | A reliable way to compute a confidence range for a rate. |
