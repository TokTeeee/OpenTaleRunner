# Character System

> Characters are the player's avatar in the world of Aiselan. This document describes the character data model, attribute system, skill mechanics, status system, reputation system, and character creation workflow.

---

## 1. Introduction

The Character System is the game's core data container. Each character possesses six attributes, a dynamic skill list, HP and vitality status, reputation values, condition states, and an item inventory. Character data is managed via the Zustand `characterStore` and persisted to the server at `/api/v1/characters` for cross-device synchronization.

Characters are generated through a six-step creation wizard: from choosing a starting village to initial equipment allocation, with the PM engine guiding the narrative throughout, ensuring every character has a unique origin background.

---

## 2. Design

### 2.1 Data Model

```
Character {
  playerId: string           // Unique player identifier
  name: string               // Character name
  attributes: {              // Six attributes, range 3-18
    STR: number  // Strength — affects physical judgment
    DEX: number  // Dexterity — affects speed/evasion
    CON: number  // Constitution — affects HP/resistance
    INT: number  // Intelligence — affects knowledge/magic
    WIS: number  // Wisdom — affects observation/intuition
    CHA: number  // Charisma — affects social/NPC attitudes
  }
  skills: Skill[]            // Skill list
  hp: number                 // Current HP (0~maxHp)
  maxHp: number              // Maximum HP
  reputation: Reputation     // Reputation system
  inventory: Inventory       // Item inventory
  conditions: string[]       // Current condition states
  history: HistoryEntry[]    // Most recent 10 history entries
  currentRegion: string
  currentSubRegion: string
  currentLocation: string
  currentCoordinates: { x, y, z }
  background: string         // Character backstory
  appearance: string         // Appearance description
  joinedRegion: string       // Origin region
}
```

Each `Skill` contains: `id`, `name`, `level` (1-10), `maxLevel`, `type` (`background` | `acquired`), `relatedAttribute`, `description`, `acquiredAt`, `experience`, `expToNext`.

### 2.2 characterStore API

Zustand store, supports `getState()` for use outside React:

| Method | Signature | Description |
|--------|-----------|-------------|
| `setCharacter` | `(char: Character) => void` | Load full character (init/load save) |
| `updateAttributes` | `(attrs: Partial<Attrs>) => void` | Update attributes, auto-clamped to [3, 18] |
| `updateIdentity` | `(changes) => void` | Modify character name/appearance/background |
| `addCondition` | `(condition: string) => void` | Add a condition, triggers `condition.onAdded` hook |
| `removeCondition` | `(condition: string) => void` | Remove a condition, triggers `condition.onRemoved` hook |
| `modifySkill` | `(skillId, {newName?, levelChange?}) => void` | Modify skill name or level |
| `addSkill` | `(skill: Skill) => void` | Learn a new skill |
| `updateHP` | `(hp: number) => void` | Update HP, clamped to [0, maxHp] |
| `updateVital` | `(delta: Partial<Vital>) => void` | Update vitality, clamped to [0, 100] |
| `updateReputation` | `(delta) => void` | Apply reputation changes, clamped to [-100, 100] |
| `updateInventory` | `(inv: Inventory) => void` | Replace entire inventory |
| `addHistory` | `(entry: HistoryEntry) => void` | Append history entry (retains most recent 10) |
| `setLastActionTime` | `(time: string) => void` | Record last action time |

### 2.3 Six-Step Creation Wizard

```
Step 1: Choose starting village
  └─ Select from 12 starting villages (Royal Plains region)

Step 2: PM-guided backstory
  └─ GM (LLM) generates a character origin narrative based on the chosen village

Step 3: Attribute allocation
  └─ Base 10 + freely allocated points → six attributes (3-18)

Step 4: Skill generation
  └─ GM assigns initial skills based on backstory (type='background')

Step 5: Initial equipment
  └─ GM grants initial weapons/armor/items based on origin

Step 6: Enter the world
  └─ Character data written to characterStore + characterListStore
  └─ Uploaded to server POST /api/v1/characters/create
  └─ PM engine called to generate the first scene
```

### 2.4 Status System

**HP**: Current hit points, range `[0, maxHp]`. Modified via `updateHP()`, clamped to prevent out-of-range values. HP reaching zero does not mean permanent death (v0.3), but triggers negative status conditions.

**Vitality**: Four indicators, range `[0, 100]`:

| Indicator | Description | Consumption |
|-----------|-------------|-------------|
| `fatigue` | Fatigue level | +5 per action, +10 per combat, -30 per day of rest |
| `hunger` | Hunger level | +3 per hour elapsed, restored by eating |
| `hygiene` | Hygiene | +2 per exploration/combat, restored by resting in town |
| `morale` | Morale | +5 on successful action, -10 on failure, adjusted by narrative events |

**Conditions**: A list of negative statuses (poisoned, injured, fractured, cursed, etc.). 15 predefined conditions, supporting fuzzy name matching. Conditions affect:
- `dicePenalty`: Judgment dice penalty (takes the maximum across all conditions)
- `travelSpeed`: Travel speed multiplier (takes the minimum)
- `regenMultiplier`: Recovery multiplier (takes the minimum)
- Applying/removing triggers the `condition.onAdded` / `condition.onRemoved` system hooks

### 2.5 Reputation System

| Field | Range | Description |
|-------|-------|-------------|
| `goodness` | -100 ~ 100 | Benevolence value (increased by positive deeds) |
| `violence` | 0 ~ 100 | Violence value (accumulated through combat/killing) |
| `lawfulness` | -100 ~ 100 | Lawfulness value (obeying vs. breaking rules) |
| `regional` | Record<string, number> | Reputation with each region/faction |

After each action, the PM engine outputs `reputationChange` based on the narrative. `applyConsequences()` separates global keys (goodness/violence/lawfulness/charisma) from regional keys and writes them respectively to `characterStore`.

> Note: `charisma` is recognized as a global key in `applyConsequences` and passed to `updateReputation`, but the current `characterStore.updateReputation` does not implement charisma handling (pending v0.4 completion).

### 2.6 Related Systems

| System | Relationship |
|--------|-------------|
| [PM Engine](PM-Engine-and-Prompt-System.md) | Character data injected into the Prompt's Character Layer |
| [Judgment System](Judgment-System.md) | Attributes/skills/conditions provide judgment modifiers |
| [Item System](Item-System.md) | Inventory and equipment belong to the character |
| [Party System](Party-System.md) | Character is the data source for party members |
| [Chronicle System](Chronicle-System.md) | Character actions generate chronicle entries |
| [Security System](Security-System.md) | Character data upload requires JWT authentication |

---

## 3. Roadmap

We intend to introduce a level-experience mechanism, allowing character growth to have a clear quantitative path — every action accumulates experience, every level-up unlocks free attribute points, with the growth curve shaped by the player's own hands. In parallel, we will complete the full charisma loop within the reputation system, making social charm a genuine invisible force that shapes the world.

Building on this foundation, we will explore class and job-change systems, endowing characters with richer role-playing depth — from initial class selection to condition-triggered spectacular job advancements, each identity transformation comes with new skills and narrative possibilities. Paired with a character portrait system, every adventurer will have a unique visual identity.

In the longer term, we intend to open up lineage and race systems, introducing non-human race options with race-inherent traits, so that identity choices on the continent of Aiselan transcend human boundaries and open up truly diverse character creation dimensions.

## 4. v0.4 Increment

v0.4 has three crossover points with the character system: v0.4 Codex treats "character" as one of 6 categories (player scope); the combat system reads characterStore's HP/stamina/status fields; the NPC memory system writes and retrieves by `entityId='character:<id>'`. v0.4 still does not introduce the level-XP system.

### 4.1 Character in Codex (player scope)

- v0.4 `codexStore`'s 6 categories include `player`, recording player "milestone snapshots" at different time points (e.g., first BOSS defeat / first hidden area entry / first bond formation with NPC)
- Trigger timing: `applyConsequences` detects `reputationChange` crossing thresholds / `conditionsAdded` containing key conditions, then calls `codexSignature` to unlock
- Key commits: `c0664c6` codexStore, `e34676b` codexSignature, `e379a86` applyConsequences trigger

### 4.2 Combat System Access to characterStore

- During v0.4 combat: `CombatEngine.startCombat({ party })` copies `character` HP / stamina / status to `combatStore.session.combatants`
- On combat end: `endCombat` writes `combatants[i].hp / stamina / conditions` back to `characterStore`
- Important constraint: During combat, `characterStore` is **not directly written**, avoiding the dual-binding issue between combat UI and main view
- See [Combat-System](Combat-System.md) section 5 v0.4 Increment

### 4.3 Cross-Session NPC Memory (Character Participation)

- Player action triggered `commitEpisode` writes `player: <npcsInvolved>` events to `MemoryManager`, `scope='npc'`, `entityId=npcId`
- When the player interacts with that NPC again, `PromptBuilder.buildGmMemoryRetrievalSection` recalls these npc-scope memories
- Key commit: `ba3fbe6` useActionSubmit integration
- See [PM-Engine-and-Prompt-System](PM-Engine-and-Prompt-System.md) section 4 v0.4 Increment

### 4.4 Character Features Not Yet Introduced in v0.4

- **Level-XP** — v0.5 first deliverable
- **Charisma full support** — v0.5 second deliverable
- **Enhanced character card export** (with equipment/skills/history) — v0.5 third deliverable
- **Class and job-change system** — long-term
- **Portrait system** — long-term
- **Lineage and race system** — long-term

