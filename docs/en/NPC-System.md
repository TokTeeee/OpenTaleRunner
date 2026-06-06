# NPC System

## 1. Introduction

The NPC System is the core driving module for all non-player characters in the OpenTaleRunner game world. It is responsible for NPC data storage, generation, behavior scheduling, interaction detection, and server-side management. The system adopts a modular design and supports template-based batch generation, dynamic creation from player descriptions (Ghost NPCs), day/night behavior scheduling, and multi-dimensional relationship tracking with players.

**Core Capabilities:**

- Full NPC lifecycle management: creation, registration, retirement, promotion
- Nine built-in profession templates; generate NPCs from templates or narrative text
- Ghost NPC mechanism: short-lived temporary NPCs that expire automatically after 2 days
- Configurable behavior scheduler (FSM + optional LLM)
- Player–NPC interaction detection with dynamic attitude / relationship changes
- 13 REST API endpoints for NPC querying, registration, relationship management, voice/portrait, and more

---

## 2. Design

### 2.1 Data Model

The core data structure for NPCs is `GameNPC`, defined as follows:

| Field | Type | Description |
|------|------|------|
| `npcId` | `string` | Unique identifier |
| `name` | `string` | NPC name |
| `title` | `string` | Title / profession label |
| `region` | `string` | Current region |
| `subRegion` | `string` | Sub-region |
| `appearance` | `string` | Appearance description |
| `background` | `string` | Backstory |
| `personality` | `string` | Personality description |
| `motivation` | `string` | Motivation / goal |
| `attributes` | `dict` | Six-dimensional attributes (Strength, Agility, Constitution, Intelligence, Perception, Charisma) |
| `skills` | `list[string]` | Skill list |
| `relationship` | `object` | Relationship object with the player (see below) |
| `isHostile` | `bool` | Whether hostile |
| `canBeRecruited` | `bool` | Whether recruitable into party |
| `canGrow` | `bool` | Whether capable of growth |
| `source` | `string` | Source (`template` / `intro`) |
| `secrets` | `list[string]` | NPC's secret information |
| `faction` | `string` | Affiliated faction |
| `isMet` | `bool` | Whether the player has met this NPC |

**Relationship Object (`relationship`):**

| Field | Type | Description |
|------|------|------|
| `attitude` | `int` | Attitude value, range `[-100, 100]` |
| `level` | `string` | Relationship level (derived from attitude value) |
| `firstMet` | `timestamp` | Time of first encounter |
| `interactionCount` | `int` | Number of interactions |
| `history` | `list[string]` | Interaction history (capped at 20 entries) |
| `playerKnowsAbout` | `bool` | Whether the player knows this NPC's background |

**Relationship Level (`level`) Determination Rules:**

| Level | Attitude Range | Description |
|------|-----------|------|
| `stranger` | `< 5` | Stranger |
| `acquaintance` | `5 – 24` | Acquaintance |
| `friend` | `25 – 49` | Friend |
| `close` | `50 – 79` | Close |
| `ally` | `≥ 80` | Ally |

---

### 2.2 Generation Pipeline

NPC generation is centrally managed by the `NPCGenerator` class and supports two generation modes:

**Mode 1: Generation from Template**

The system provides nine built-in profession templates, each pre-defining personality tendencies, attribute weights, and a skill pool for that profession.

| Template Key | Profession | Description |
|--------|------|------|
| `merchant` | Merchant | Favors Charisma & Intelligence; skills involve trading, appraisal |
| `blacksmith` | Blacksmith | Favors Strength & Constitution; skills involve smithing, repair |
| `innkeeper` | Innkeeper | Favors Perception & Charisma; skills involve cooking, socializing |
| `guard` | Guard | Favors Strength & Agility; skills involve vigilance, swordsmanship |
| `healer` | Healer | Favors Intelligence & Perception; skills involve healing, herbalism |
| `scholar` | Scholar | Favors Intelligence; skills involve knowledge, research |
| `hunter` | Hunter | Favors Agility & Perception; skills involve tracking, archery |
| `adventurer_guild` | Adventurer Guild | Balanced attributes; skills involve exploration, combat |

**Interface:**

```
generateFromTemplate(templateKey, region, options)
```

- `templateKey`: Template key, e.g. `"merchant"`
- `region`: Generation region (required)
- `options`: Optional parameters to override default attributes or appearance

**Mode 2: Generation from Description Text**

When a player describes an NPC in natural language during gameplay (e.g. "a mysterious traveler in a cloak"), the system extracts key information to generate the NPC.

**Interface:**

```
generateFromIntro(intro)
```

The `intro` object contains:

| Field | Type | Description |
|------|------|------|
| `name` | `string` | Name |
| `title` | `string` | Title |
| `appearance` | `string` | Appearance description |
| `personality` | `string` | Personality |
| `region` | `string` | Region |
| `relation_to_player` | `string` | Relationship type with the player |

**Generation Flow:**

1. Validate completeness of required fields in `intro`
2. Extract attribute tendencies from appearance and personality text
3. Randomly generate six-dimensional attributes (constrained by text descriptions)
4. Assign skills based on profession / background
5. Create a `GameNPC` instance with `source = "intro"`
6. Initialize the `relationship` object (`attitude = 0`, `level = "stranger"`)

---

### 2.3 Ghost NPCs

Ghost NPCs are temporary NPCs that support characters described on-the-fly by players. These NPCs have a limited lifespan and are cleaned up automatically on expiry, preventing unbounded growth of the NPC database.

**Core Module:** `ghost_manager.py`

| Configuration | Value | Description |
|--------|-----|------|
| `ghost_npc_ttl` | `172800` seconds (2 days) | Lifetime of a Ghost NPC |

**`upsert_from_character` Method:**

When a player describes a character, this method performs the following processing:

1. **Extract Personality Tags** — Match personality keywords via 19 regex patterns, e.g. `/brave|coward|fearless/` → `brave`
2. **Infer Intent** — Infer the NPC's intent via 10 regex patterns, e.g. `/searching for|looking for/` → `seeking`
3. **Attitude Toward Strangers** — Infer the NPC's initial attitude toward unfamiliar players based on personality tags and intent
4. **Upsert Logic** — If a Ghost NPC with the same name already exists, update it; otherwise, create a new Ghost NPC
5. **Set `expiresAt`** — Current time + TTL; removed by the scheduled cleanup task on expiry

**`expiresAt` Cleanup Flow:**

```
cleanup_expired_ghosts() → iterate over all Ghost NPCs
    → if expiresAt < now → mark for deletion → remove NPC record
```

The cleanup task runs alongside the behavior scheduler's main loop (once per tick).

---

### 2.4 Behavior Scheduling

NPC behavior is centrally scheduled by `NPCBehaviorScheduler`, which runs a tick loop at an interval of **300 seconds (5 minutes)**.

**Architecture:**

- **Tick Loop:** Scans all active NPCs every 300 seconds and decides each NPC's next behavior.
- **Day/Night Scheduling First:** NPCs follow a day/night rhythm according to in-game time and their own profession (e.g. merchants do business by day, rest by night).
- **Configurable Behaviors:** Each behavior is defined as a `ConfigurableBehavior` object, driven by finite-state machine (FSM) rules.
- **LLM Behavior (Optional):** In LLM mode, NPC behavior is generated in real time by a large language model for richer narrative experiences.

**Behavior Factory Mapping:**

| Profession | Behavior Class |
|------|--------|
| Merchant | `MerchantBehavior` |
| Blacksmith | `BlacksmithBehavior` |
| Innkeeper | `InnkeeperBehavior` |
| Guard | `GuardBehavior` |
| Healer | `HealerBehavior` |
| Scholar | `ScholarBehavior` |
| Hunter | `HunterBehavior` |
| Adventurer Guild | `AdventurerGuildBehavior` |

---

### 2.5 Interaction Detection

The interaction detection module parses player action text, automatically identifies interactions with NPCs, and updates relationship status.

**`detectNPCInteraction(actionText, repChanges)`**

- **Trigger Condition:** Detects whether `actionText` contains the name of any known NPC via substring matching.
- **Execution Flow:**
    1. Search `actionText` for all known NPC names.
    2. If an NPC is matched → call `meetNPC` to mark the encounter.
    3. Call `addInteraction` to append an interaction record.
    4. Call `modifyAttitude` to adjust attitude based on `repChanges` (reputation change value).

**`handleNPCIntroduced(npcs)`**

Called when a batch of NPCs is introduced at once, used for scenarios where party members share NPC information:

1. **Deduplication** — Skip NPCs already present in the `npcs` list.
2. **Generate Individually** — Call `npcGenerator.generateFromIntro(intro)` for each new NPC.
3. **Register** — Call `registerNPC` to add the new NPC to NPC storage.
4. **Broadcast Event** — Fire the `GHOST_NPC_APPEARED` game event to notify all online players.

---

### 2.6 Server Side

`NPCService` is the service layer of the NPC System, exposing 13 API endpoints externally and managing NPC registration and promotion flows.

**API Endpoints:**

| Endpoint | Method | Description |
|------|------|------|
| `/api/npc/known` | `GET` | Retrieve all NPCs known to the player |
| `/api/npc/region` | `GET` | Query NPCs by region (params: `region`, `subRegion`) |
| `/api/npc/register` | `POST` | Register a new NPC (param: `npcData`) |
| `/api/npc/relationship` | `GET` | Get relationship details between the player and a given NPC |
| `/api/npc/behavior` | `GET` | Get an NPC's current behavior state |
| `/api/npc/voice` | `GET` | Get NPC voice configuration |
| `/api/npc/portrait` | `GET` | Get NPC portrait / sprite configuration |
| `/api/npc/full` | `GET` | Get full NPC data (including secrets, hidden info, etc.) |
| `/api/npc/patch` | `PATCH` | Partially update NPC data |
| (remaining four endpoints) | — | Reserved extension endpoints |

**NPC Promotion Mechanism:**

NPCs can be promoted (from Ghost NPC to permanent NPC) when any of the following conditions are met:

| Condition | Description |
|------|------|
| Attitude `attitude ≥ 80` | Player has established an ally relationship with this NPC |
| Interactions `interactions ≥ 20` | Frequent interaction |
| ≥ 3 players & ≥ 30 interactions | NPC recognized by multiple players |

Meeting any single condition triggers `promoteNPC`, which removes the `expiresAt` restriction and marks `source` as permanent.

---

### 2.7 Store API

`npcStore` is the core state management module for NPC data storage, providing atomic data manipulation methods:

| Method | Parameters | Description |
|------|------|------|
| `registerNPC` | `npc` | Register a new NPC; generates a unique `npcId` |
| `meetNPC` | `npcId, playerId` | Mark the player as having met this NPC; sets `isMet = true` and `firstMet` |
| `modifyAttitude` | `npcId, delta` | Adjust attitude value. `delta` is clamped to keep the result within `[-100, 100]`; `level` is automatically recalculated after the attitude change |
| `addInteraction` | `npcId, actionText, playerId` | Append an interaction record to `history`, capped at 20 entries (FIFO). Also `interactionCount += 1` |
| `processInteraction` | `npcId, actionText, repChanges` | Composite operation: detect interaction → modify attitude → append history, in a single call |
| `promoteNPC` | `npcId` | Promote a Ghost NPC to a permanent NPC (clear `expiresAt`, update `source`) |

---

### 2.8 API Examples

**Example 1: Generate a Merchant NPC from a Template**

```
POST /api/npc/register
{
  "source": "template",
  "templateKey": "merchant",
  "region": "Town of Beginnings",
  "options": {
    "name": "Eileen",
    "subRegion": "Central Market"
  }
}
```

**Response:**

```json
{
  "npcId": "npc_a1b2c3d4",
  "name": "Eileen",
  "title": "Traveling Merchant",
  "region": "Town of Beginnings",
  "subRegion": "Central Market",
  "attributes": {
    "strength": 8,
    "agility": 10,
    "constitution": 9,
    "intelligence": 14,
    "perception": 12,
    "charisma": 16
  },
  "skills": ["Trading", "Appraisal", "Negotiation"],
  "relationship": {
    "attitude": 0,
    "level": "stranger",
    "interactionCount": 0,
    "history": []
  },
  "isHostile": false,
  "canBeRecruited": false,
  "source": "template"
}
```

**Example 2: Update NPC Attitude Value**

```
PATCH /api/npc/patch
{
  "npcId": "npc_a1b2c3d4",
  "relationship": {
    "attitude": 30
  }
}
```

**Response:**

```json
{
  "npcId": "npc_a1b2c3d4",
  "relationship": {
    "attitude": 30,
    "level": "friend"
  }
}
```

**Example 3: Query NPCs by Region**

```
GET /api/npc/region?region=Town+of+Beginnings&subRegion=Central+Market
```

**Response:**

```json
{
  "npcs": [
    { "npcId": "npc_a1b2c3d4", "name": "Eileen", "title": "Traveling Merchant" },
    { "npcId": "npc_e5f6g7h8", "name": "Gregory", "title": "Blacksmith" }
  ]
}
```

---

### 2.9 Related Systems

The NPC System has cross-reference relationships with the following game subsystems:

| System | Relationship Description |
|------|----------|
| **Storybook** | NPC fields such as `secrets` and `background` correspond to the Storybook's Schema templates; NPC data can serve as substitution sources for storybook content. See [Storybook (Schema & Substitution Guide)] |
| **Party System** | `canBeRecruited` controls whether an NPC can join the player's party; after recruitment, NPC data is synced to the party management module |
| **PM Engine** | The LLM mode of the NPC behavior scheduler relies on the inference capabilities provided by the PM engine |
| **Multiplayer** | The `GHOST_NPC_APPEARED` event for Ghost NPCs is broadcast to all online players through the multiplayer module; `handleNPCIntroduced` supports party members sharing NPC information |

---

## 3. Roadmap

The goal is to introduce a long-term NPC memory system so that every interaction is genuinely remembered by NPCs. NPCs will be able to recall historical conversations, shared events, and pivotal decisions with the player. These memories will be compressed and stored via LLM summarization, continuously influencing NPC attitude toward the player and subsequent dialogue content, giving relationship development true continuity and depth.

NPCs are expected to gain the ability to proactively issue quests. When a relationship with a player is deep enough, NPCs will generate personalized commissions based on their own motivations and personalities — a merchant requests an escort for valuable goods through dangerous territory, a hunter invites the player to track a legendary beast together, a healer yearns to collect rare herbs. These quests will be naturally woven into the world narrative rather than appearing as rigid list entries.

The aspiration is to build a living NPC social network, where every character in the city is interconnected and mutually influential. The merchant and the blacksmith maintain a supply relationship, the guard and the healer coordinate tacitly, information propagates naturally among NPCs, and conflicts are resolved in ways consistent with each character's personality. The behaviors of individual NPCs interweave, presenting a self-organizing, self-evolving virtual social ecology.
