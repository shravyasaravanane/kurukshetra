# KURUKSHETRA — Project Plan

**A Multi-Agent Strategy Game for Decision-Making Under Incomplete Information**
Mini Research & Innovation Project · B.Tech II Year · Amrita Vishwa Vidyapeetham, Chennai
Theme: Strategic Lessons from the Mahabharata

---

## 1. From insight to system

| Layer | What it is in this project |
|---|---|
| Mahabharata / IKS | The Chakravyuha episode, Drona Parva. Abhimanyu knows how to break *into* the formation but not how to get *out*. Jayadratha seals the breach, so the Pandavas who were meant to follow are held outside. The formation keeps turning under Drona's command. |
| Strategic insight | A decision-maker with **partial knowledge**, depending on **coordination** with others who have **different information, goals and capabilities**, inside an environment that **changes while they act**. |
| Contemporary problem | Teams act on incomplete, stale or conflicting information. Each member knows something different. Coordination failures turn good individual decisions into bad collective outcomes. |
| Research gap | Multi-agent / partial-observability platforms (PettingZoo, SMAC, Dec-POMDP research) study **agents with agents**. Few accessible environments put a **human** inside a partially observable, multi-agent setting and **measure** how information and coordination change the human's decisions. |
| Interactive innovation | A browser game where the human and autonomous agents each hold a different slice of the truth, and where information level and coordination are **experimental variables**, not fixed design choices. |
| Evidence | Every decision is logged with what the player *believed* and what was *true*, so errors can be split into **information errors** and **decision errors**. |

The Mahabharata is the source of the insight. The game is the experimental environment. The logs are the evidence.

---

## 2. The scenario (game design)

### 2.1 The formation
- The Chakravyuha is drawn as **7 concentric rings** around a **core**, with an open **field** outside.
- Each ring has **12 segments**. Moving along a ring is free.
- Between rings stand **walls**. A wall can only be crossed at its **gates**.
- The formation **turns**. Every few turns the inner walls rotate, so gates move. A gate you saw earlier may no longer be where you remember it. This is the core source of uncertainty: **stale information**.
- The outer wall has fixed gates: the points of entry.

### 2.2 Objective
1. **Breach** the formation.
2. Reach the **core**.
3. **Get back out** to the field before the turn limit, the loss of resolve, or encirclement.

Reaching the core but not escaping is the *Abhimanyu outcome*: a partial result, recorded separately.

### 2.3 Decision-makers
| Agent | Side | Knows | Wants | Behaviour |
|---|---|---|---|---|
| **Player** (Abhimanyu's role) | Pandava | Only what is in view, plus whatever the info level grants | Core, then exit | Human decisions |
| **Bhima** | Pandava | Own vision | Stay close to the player | Follower; pins sentinels near the player |
| **Nakula** | Pandava | Own vision | Map the formation | Scout; explores unknown walls |
| **Satyaki** | Pandava | Own vision | Keep the breach open | Guardian; holds an outer gate |
| **Jayadratha** (gatekeeper) | Kaurava | Full formation map, limited vision of Pandavas | Seal every outer gate once the breach happens | Moves along the outer ring, sealing gates unless an ally holds them |
| **Sentinels** ×N | Kaurava | Full map, limited vision | Contain the intruder | Patrol; chase when the player is seen; drain resolve when adjacent |
| **Drona** (commander) | Kaurava | Sightings reported by sentinels (if Kaurava coordination is on) | Keep the player from the core | Decides how the formation turns; adaptive when informed |

The two sides have **asymmetric information**: Kauravas know the formation but not where the intruder is. The player knows where they are but not how the formation is laid out.

### 2.4 Core mechanics (non-violent, abstract)
- **Resolve**: the player's stamina. Each un-pinned sentinel adjacent at the end of a turn drains 1. Each ally adjacent to the player cancels one drain (cover).
- **Pinning**: a sentinel next to any ally cannot move or drain that turn.
- **Sealing**: when the gatekeeper stands on an outer gate that no ally is holding, that gate is sealed permanently.
- **Encirclement**: no free move and at least 2 sentinels adjacent means the run ends.
- **Sealed in**: if every outer gate is sealed while the player is inside, the run ends.

### 2.5 Player actions per turn
- **Move** to an adjacent cell (along the ring, or through a gate).
- **Wait**.
- **Scout**: spend the turn to see much further this turn. This trades time for information and is a measurable *information-seeking* behaviour.
- **Signal** (free, one per turn, only when Pandava coordination is on): **Follow me**, **Hold the breach**, **Scout ahead**.

---

## 3. Experimental design

### 3.1 Independent variables (conditions)
| Variable | Levels |
|---|---|
| **Information level** | `low`: vision 1, nothing known in advance · `medium`: vision 2, initial gate layout known, but it goes stale as the formation turns · `high`: vision 2, live gate knowledge |
| **Pandava coordination** | `off`: allies act on their own beliefs, no signals, no shared map · `on`: signals work and allies' observations merge into the player's map |
| **Kaurava coordination** | `off`: each sentinel acts on its own sightings, the formation turns on a fixed schedule · `on`: sightings are shared and Drona turns the formation adaptively |
| **Advisor (Krishna's counsel)** | none · reliable messenger (90%) · careless messenger (60%) · Krishna's insight (free planner that sees only what the player knows) · AI agent (Claude, same information, optional) |
| **Reasons** | Counsel with or without a one-line explanation |
| **Seed** | Fixes the starting layout so conditions can be compared on identical formations |

### 3.2 Dependent variables (logged automatically)
- Outcome (escaped / core only / exhausted / encircled / sealed in / timeout), completion rate, turns used, score.
- Resolve remaining, scouts used, signals sent.
- **Decision time** per turn (ms).
- **Map knowledge**: fraction of gates known, and fraction of the player's beliefs that are *wrong* (staleness).
- **Decision quality** of every move, computed against two maps:
  - `optimal`: on a shortest path in the **true** formation.
  - `info-error`: optimal given what the player **believed**, but wrong in reality. The information failed the player.
  - `decision-error`: not optimal even by the player's own beliefs.
- Agent response: ally actions, sealed gates, pins, rotation events.
- Post-game questionnaire: perceived information, difficulty, ally usefulness, satisfaction, free text.

### 3.3 Research questions it answers
| RQ | How it is measured |
|---|---|
| RQ1 How does limited information affect decisions? | Decision quality mix, decision time and scouting across info levels |
| RQ2 Does more information improve performance? | Completion rate and score by info level |
| RQ3 How does coordination affect outcomes? | Pandava / Kaurava coordination on vs off |
| RQ4 How do autonomous agents change decisions? | Signal use, cover/pin events, performance with vs without ally help |
| RQ5 How does strategy change when the environment changes? | Behaviour before vs after rotations; adaptive vs fixed Drona |
| RQ6 Can gameplay data reveal decision patterns? | Per-turn logs, exported CSV, analysis dashboard |

### 3.4 Baselines
A headless **simulator** runs scripted bot players across every condition on hundreds of seeds. This gives:
- an agent-only baseline to compare human players against,
- evidence that the conditions differ in a measurable way before any user study,
- a tool for tuning difficulty.

---

## 4. Build plan (milestones)

| # | Milestone | Output | Status |
|---|---|---|---|
| **M1** | Plan | This document | Done |
| **M2** | Engine core | Formation geometry, gates, rotation, seeded RNG, shortest paths, deterministic turn loop | Done |
| **M3** | Information model | Vision, belief maps, staleness, info levels, map sharing | Done |
| **M4** | Autonomous agents | Allies (follow / scout / guard), gatekeeper, sentinels, Drona (fixed vs adaptive) | Done |
| **M5** | Metrics & logging | Move classification, decision timing, session schema, JSON / CSV export | Done |
| **M6** | Playable UI | Circular formation view with fog, controls, signals, event feed, debrief that reveals the true formation | Done |
| **M6b** | 3D presentation | Animated characters, 3D formation, intro cinematic, guided tutorial, follow camera | Done |
| **M7** | Study mode | Participant ID, condition assignment, questionnaire | Done |
| **M8** | Analysis dashboard | Aggregates by condition, decision-quality breakdown, import/export | Done |
| **M9** | Headless simulator | Bot players, condition grid, CSV results | Done |
| **M10** | Tests | Engine invariants, determinism, agent rules | Done |
| **M6c** | Professional polish | HDR bloom pipeline, loading screen, pause menu, graphics and motion settings | Done |
| **M8b** | Replay | Deterministic replay of any recorded round with a move-quality timeline and verification | Done |
| **M9b** | Statistics | Wilson 95% intervals, two-proportion z-tests, auto-generated report and figures | Done |
| **M10b** | Engineering | Browser end-to-end tests, CI, GitHub Pages workflow, docs/GUIDE.md | Done |
| **M10c** | Krishna's counsel | Scripted advisors of controlled reliability, a Claude tool-use advisor agent restricted to the player's knowledge, reliance metrics, level 6, counsel study protocol, counsel experiment, agent evaluation harness, Python analysis | Done |
| **M11** | Tuning & pilot | Balance via simulator, pilot play-tests with classmates | Started: first simulator tuning done |
| **M12** | User study & report | Faculty/tester sessions, analysis, write-up | To do |

M1–M10 are code and docs. M11–M12 need real players. The first tuning pass used the simulator: the turn limit, resolve and a breakthrough move were adjusted until the conditions separated clearly and the random bot never wins.

---

## 5. Engineering principles
- **Runs by opening `index.html`**. No install, no server, no build step, so any faculty member can play it.
- **Deterministic engine**. A seed plus the action list reproduces a whole game, which allows replay and fair comparison.
- **One engine, two hosts**. The same engine code runs in the browser and in Node (simulator + tests).
- **Truth and belief kept separate**. The engine knows the truth. The player, every ally and every Kaurava has its own belief state. The UI only ever draws the player's belief.
- **Data stays local**. Sessions are kept in the browser and exported as files. Nothing is sent anywhere.

## 6. Future potential
More Mahabharata scenarios (e.g. the Padmavyuha, the dice game as a bluffing/information game, the night battle), learned agents (RL) trained in the simulator and played against humans, larger user studies, and a classroom version for teaching decision-making.
