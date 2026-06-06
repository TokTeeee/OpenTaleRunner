# Combat System

## 1. Introduction

The Combat System is the turn-based combat module introduced in v0.4. It manages the encounter flow between the player and hostile creatures. The system uses a hybrid mechanism combining an **ACT queue** (initiative ordering) with a **6-attribute formula**, mapping every action to explicit hit/damage/status changes.

**Core Concepts:**

- **ACT Queue (initiative queue)**: Computed at combat start as `d20 + effectiveDEX`, sorted descending; all combatants take turns in order.
- **6 Attributes (six attributes)**: Strength (STR) / Dexterity (DEX) / Constitution (CON) / Intelligence (INT) / Wisdom (WIS) / Charisma (CHA). **STR drives melee damage**, **DEX drives hit & initiative**, **CON drives max HP**.
- **AP (Action Points)**: Combatants start each fight at `maxAp` (player 6 / monster 4). AP is **not** reset at the start of each round; instead, when it becomes an actor's turn they gain +1 AP (clamped at `maxAp`). The very first actor of the entire fight is the lone exception — they start at `maxAp` and skip the +1. See §2.3.
- **5-Phase FSM**: The combat finite-state machine has five stages: `idle → initializing → active → resolving → settled`.
- **4 Difficulty Ratings (balance rating)**: `trivial / normal / hard / deadly`, which drive both balance evaluation and failure penalty.

> v0.4 Combat System consists of four core modules: **CombatEngine** (flow orchestration), **ActionResolver** (action resolution), **combatTools** (GM toolcall protocol), **CombatView** (UI). See [Client Architecture](Client-Architecture.md) for details.

## 2. Design

### 2.1 Combat Flow Overview

```
  Trigger startCombat (GM toolcall)
          │
          ▼
  ┌──────────────────┐
  │  initializing    │ ── Validate payload + compute BalanceReport
  └──────────────────┘
          │
          ▼
  ┌──────────────────┐
  │     active       │ ── ACT queue loop (turn advances)
  │  (turn-based)    │    Each round: player + enemies take turns
  └──────────────────┘
          │
          │ Combat ends (either side HP=0 or all flee/disrupted)
          ▼
  ┌──────────────────┐
  │   resolving      │ ── Compute outcome (victory/defeat/fled/...)
  └──────────────────┘
          │
          ▼
  ┌──────────────────┐
  │    settled       │ ── Write narrativeClosing + apply failure penalty
  └──────────────────┘
          │
          ▼
       idle (return to exploration)
```

**Key points:**
- `idle → initializing` guard: prevents duplicate combat starts
- `active → resolving` guard: triggered by either side reaching HP=0; `active → idle` direct jump is forbidden
- `settled → idle`: endCombat handler resets internally and writes the player's finalState

### 2.2 6-Attribute Formula

Damage and hit-chance calculations are based on the six attributes. Each combatant's **effective attribute** equals the base attribute plus the sum of all buff `modifiers`:

```
effectiveSTR = baseSTR + Σ buff.modifiers.STR
effectiveDEX = baseDEX + Σ buff.modifiers.DEX
```

**Melee damage formula:**

```
damage = max(1, d6 + effectiveSTR // 2 + weapon.damage_bonus - target.defense)
```

Where:
- `d6`: 1d6 die (base randomness)
- `effectiveSTR // 2`: Strength modifier, `floor(STR/2) - 5`
- `weapon.damage_bonus`: damage bonus from the equipped weapon
- `target.defense`: defense value of the target's armor (e.g. leather +1, plate +3)

**Hit resolution (d20 rules):**

```
attackRoll = d20 + effectiveDEX // 2
hit = attackRoll >= target.evasion (default 10 + DEX // 2)
```

> Hit and damage are separate steps: roll d20 for the hit check, then roll d6 for damage. Equipment `accuracy` effects boost the attack roll, while `defense` reduces the chance of being hit.

### 2.3 AP=6 Action Points

At the start of each round, every combatant's `ap` resets to `maxAp=6` (tactical-RPG style). Each action consumes a different amount of AP:

| Action | AP Cost | Effect |
|--------|---------|--------|
| `attack` | 1 | d20 hit check + d6 damage roll |
| `defend` | 2 | +2 AC; incoming damage halved next round |
| `skill` | 1–4 | Depends on skill level (1–4 AP) |
| `item` | 1 | Consume a backpack item's `use` effect |
| `wait` | 0 | Skip this turn, save AP for next turn |
| `flee` | 2 | d20 + DEX check; on failure, no action this turn |

> Monsters default to `maxAp=4` (4-action mob tempo); players and NPCs default to `maxAp=6`. This is v0.4's asymmetric design: players have more action space, while monsters trade fewer actions for higher individual impact.

> **AP behavior detail (synced with code, clarified in v0.5.5)**:
> - `ap` is **not** reset to `maxAp` at the start of each round.
> - The **first actor of the entire fight** starts at `maxAp` directly, **without** the +1.
> - **Subsequently, when it becomes any actor's turn**, that actor gains +1 AP (clamped at `maxAp`).
> - The implementation is split into two store actions:
>   - `advanceTurn()`: when `turn < queue.length` (handing off within the same round), the next actor `queue[newTurn-1]` gets +1.
>   - `advanceRound()`: when `turn == queue.length` (new round), `round += 1`, `turn = 1`, and the new round's first actor `queue[0]` gets +1.
> - The +1 happens during the store-action phase at the end of `processTurn`, so it is equivalent to "the next actor's turn-start bonus" (the next actor has already received +1 by the time their own `processTurn` runs).
> - A player cycling between `attack=2` and `wait=0+1` keeps a stable AP economy.

### 2.4 QTE Overview

**QTE (Quick Time Event)** is a timing-based interaction layer introduced in v0.4. It pops up during certain player actions as a time-limited input:

| QTE Type | Trigger | Action |
|----------|---------|--------|
| Attack QTE | Player `attack` | Click within 0.5s window; hold duration affects damage (±20%) |
| Defend QTE | Player `defend` | 0.3s dodge window; precise click grants +30% dodge rate |
| Skill QTE | Player `skill` | Some skills require precise input (e.g. mage chant QTE chain) |

QTE is **not mandatory**: failure only forfeits the QTE bonus (reduced damage/dodge), with no backfire. QTE is suited for combat-flow debugging, letting the player switch between slow deliberation and fast reflex.

### 2.5 4 Failure-Penalty Tiers

On combat defeat (`outcome=defeat`), the endCombat handler applies a failure penalty based on `appliedBalanceRating`:

| Difficulty | Damage Taken | Gold Lost | Conditions Applied | Survives |
|------------|--------------|-----------|-------------------|----------|
| `trivial` | `none` | 0% | none | true |
| `normal` | `minor` (-10% HP) | 10% | `wounded_1` | true |
| `hard` | `major` (-30% HP) | 30% | `wounded_2`, `exhausted` | true |
| `deadly` | `death-narrative` (HP→0) | 50% | `perma-wound` (permanent) | **true** (near-death narrative replaces real death) |

**Why `survives=true` matters**: even when HP=0, the player does not actually die. The system enters a "near-death" narrative branch and injects `perma-wound` as the cost. This is v0.4's "player can always continue" design philosophy. See `endCombatHandler` in `combatTools.ts` for details.

> Failure penalty only applies to real `defeat` / `disrupted` outcomes. `victory` / `fled` go through the loot path and **do not** apply failure penalty.

## 3. Debug Mode

### 3.1 Entry Point

A discreet **🐞 Debug Mode** button sits at the bottom of the title page (minimal style, doesn't compete with the primary buttons). Clicking it opens a modal with 4 preset battle cards.

Debug Mode is meant for v0.4 combat-system development and testing. It **completely skips the LLM**: after clicking a battle card, the client dispatches `startCombat` toolcall directly, and the combat UI is immediately available without the PM Engine in the loop.

### 3.2 The 4 Preset Cards

| Card | Difficulty | Enemies | Test Target |
|------|------------|---------|-------------|
| **Roadside Skirmish** | `trivial` | 1× Goblin Scout (HP 8) | 6-attribute formula & basic attack flow |
| **Goblin Ambush** | `normal` | 3× Goblin Scout | Multi-enemy ACT queue & group-combat logic |
| **Goblin Elite Squad** | `hard` | 1× Goblin Warrior (HP 25) + 1× Scout | Defend action & item use |
| **Troll Chieftain** | `deadly` | 1× Troll Chieftain (HP 60) | deadly-tier failure penalty (perma-wound) |

Each card lists the **expected outcome** (round count, QTE triggers, penalty triggers) for regression testing.

### 3.3 Synthetic Player

The Debug Mode player is a **preset synthetic character** called "Test Hero":

- **Attributes**: STR 14 / DEX 16 / CON 12 / INT 10 / WIS 15 / CHA 13
- **Resources**: HP 30 / AP 6
- **Equipment**: Iron Sword (+4 attack), Leather Armor (+1 defense), no accessory

The synthetic player is **fully isolated** from your real character save:
- Does **not** read `characterStore.character`
- Does **not** write to `characterStore` (even on defeat, gold / conditions / HP are not changed)
- Debug combat **does not pollute** your game progress

### 3.4 Auto-Reopen

After combat ends (regardless of outcome), the modal reopens automatically so you can immediately pick another preset. This is a developer-productivity feature—no need to click back to the title page between fights.

To exit a combat early, simply close the modal via [X]. The combat will go through the endCombat handler's cleanup flow and return to `idle`.

### 3.5 Notes

- Debug Mode is only accessible from the title page; you cannot open a new debug combat while a combat is in progress
- The monster factories (`goblinScout` / `goblinWarrior` / `trollChief`) use **fixed values** for testing—they do not change with LLM tuning
- Debug combat runs the full 5-phase FSM + failure penalty pipeline, so **all regression tests** should be reproducible here

## 4. Related Systems

| System | File | Interaction |
|--------|------|-------------|
| Judgment System | [Judgment-System](Judgment-System.md) | 2d6 dice and outcome tiers (out-of-combat resolution) |
| Item System | [Item-System](Item-System.md) | `item` action routes through `ItemCallbackRouter` to item's `combatUse` hook |
| PM Engine | [PM-Engine-and-Prompt-System](PM-Engine-and-Prompt-System.md) | `startCombat` / `endCombat` are GM-triggered toolcalls |
| Character System | [Client-Architecture](Client-Architecture.md) | `characterStore` holds the player's final state (debug mode does not write) |
| Party System | [Party-System](Party-System.md) | `party` array is passed to startCombat; NPCs join the ACT queue |

## 5. v0.4 Increment

The combat system was delivered as a complete subsystem in v0.4, already recorded in sections 2 (Design) and 3 (Debug Mode) of this document. This section consolidates the v0.4 deliverables and version alignment information.

### 5.1 Component Inventory (9 UI + 10 service)

- **UI** — `CombatView` (main panel) / `CombatField` (battlefield) / `CombatantCard` (combatant card) / `ActionMenu` (player action menu) / `ACTQueueBar` (initiative queue) / `QTETimingBar` / `QTETypingBox` (QTE timing + typing) / `FloatingDamage` / `CombatLog` (scrolling log)
- **Service** — `CombatEngine` (main engine) / `ActionResolver` (hit + damage) / `BalanceEvaluator` (balance assessment) / `BuffManager` (Buff/Debuff) / `QTELayer` (QTE scheduling) / `ItemCallbackRouter` (item hooks) / `combatTools` (toolcall definitions) / `debugCombatStarter` (Debug entry) / `dice` (2d6 roller) / `effectTypeCompat` (13 effectType combat compatibility map)
- **Store** — `combatStore` (combat state machine: idle / setup / rolling / acting / resolution / ended)

### 5.2 State Machine (5 Phases)

```
idle → setup → rolling → acting → resolution → ended → idle
```

Each phase is advanced by `CombatEngine`. Player actions (action menu selects attack / skill / item / defend / flee) trigger `ActionResolver` to compute hit and damage; on hit, `BalanceEvaluator` assesses parity, `BuffManager` maintains buff/debuff timing, and `QTELayer` inserts QTE timing checks at appropriate moments.

### 5.3 Debug Mode (Isolated from Real Combat)

Only accessible from the title page. Monster factories `goblinScout` / `goblinWarrior` / `trollChief` use fixed values. Debug combat **neither reads nor writes** `characterStore`. Modal auto-reopens after combat ends for repeated regression.

### 5.4 GM Trigger Entry (toolcall)

`PMEngine` fuses combat with narrative through toolcalls `startCombat` / `endCombat`:

- `startCombat({ enemies, party, terrain })` — Creates a combat session, writes to `combatStore.session`
- `endCombat({ outcome, loot })` — Closes the session; items go through v0.4 affix pool via `applyConsequences.itemsGained`

### 5.5 v0.4 Key Commits (8)

- `8f1fa84` docs(en): add v0.4 combat system user manual
- `9c5fdb8` docs(zh): add v0.4 combat system user manual
- And subsequent combat engine / UI / debug / toolcall integration commits

### 5.6 Known Constraints (To be Resolved After v0.4)

- `sceneModifier` always hardcoded to 0 — not yet implemented
- Elemental resistance recorded only, not participating in judgment — Listed in v0.6
- 13 effectType compatibility map (`effectTypeCompat`) is a temporary solution; will be unified into `ActionResolver` after v0.6
- Debug combat monster factories don't change with LLM tuning, suitable for regression but not real combat balance reflection

