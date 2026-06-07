# PM Engine and Prompt System

## 1. Introduction

The PM (Prompt Manager) engine is the core bridge layer between the OpenTaleRunner client and the LLM (GM). It assembles, sends, and parses prompts, injecting server-side world data and client-side character data into the GM in a unified manner, ensuring that every player action receives a coherent, accurate narrative response.

**7-Layer Prompt Architecture (GM semantic scaffold)**: The prompt is composed of seven layers stacked in order: World Layer, Character Layer, Scene Layer, Context Layer, Task Instruction Layer, JSON Schema Layer, and Query Protocol Layer. Each layer has a clear responsibility and can be independently trimmed and customized, ensuring the GM receives precisely the minimal yet most accurate context needed to complete narration.

> Implementation note: `PromptBuilder` has 11 `build*` methods (4 private + 7 public), not strictly 1:1 with the "seven layers" (some layers share a method, some methods span multiple layers). The "7-layer" view is GM-perspective semantic grouping, not a code boundary. See §2.1 for the actual method list.

**Multi-Round Query Protocol**: Traditional approaches inject all data (item lists, NPC profiles, chronicles, etc.) at once into each prompt call, wasting large amounts of tokens on data the GM may never need. The multi-round query protocol shifts to "client injects core context + GM queries on demand," compressing the initial prompt from ~2400 tokens to ~1200 tokens (saving approximately 50%), with query round tokens generated only when truly needed.

**Token Budget System**: Based on priority tiers and a dynamic allocation algorithm, it ensures that within any model's context window limit, important data (HP, location, actions) always gets injected first, while secondary data (backpack miscellany, ancient chronicles) is flexibly downgraded to compact versions or deferred to the query protocol based on remaining budget.

---

## 2. Design

### 2.1 Prompt Layered Architecture

Every round of GM interaction prompt assembled by the PM engine consists of the following seven layers:

| Layer | Name | Responsibility | Injection Timing | Token Share |
|-------|------|----------------|------------------|-------------|
| 1 | World Layer | Defines world setting, era, situation, narrative style | All variants | 15-25% |
| 2 | Character Layer | Player data: attributes, skills, equipment, backpack, status | All variants | 10-15% |
| 3 | Scene Layer | Location, terrain, weather, known NPCs, ghost NPCs | All variants | 10-20% |
| 4 | Context Layer | Location anchor + recent dialogue history | Scene/Advance | 20-40% |
| 5 | Task Instruction Layer | List of tasks the GM must complete this round | Scene/Advance | 3-5% |
| 6 | JSON Schema Layer | Output structure constraint (NarrativeResponse) | Scene/Advance | 3-5% |
| 7 | Query Protocol Layer | Data query interface description and available query hints | Advance (optional) | 2-5% |

**World Layer** (`PromptBuilder.buildWorldLayer()`): Contains the GM identity declaration, world lore text (from `worldStore.worldLore`), current era (`currentEra`), world situation (`milestones`), recent developments (`recentChronicle`), current region status (`regions`), and 9 narrative style guidelines. Falls back to a short hardcoded text when offline.

**Character Layer** (`PromptBuilder.buildCharacterLayer()`): Contains character name/background, six attributes (STR/DEX/CON/INT/WIS/CHA), skill list (with levels and descriptions), current equipment (weapon/armor/accessory), backpack summary (truncated to 200 characters), HP/stamina status, abnormal conditions, and a summary of the last 3 days' experiences.

**Scene Layer** (`PromptBuilder.buildSceneLayer()`): Contains the world day, major region/sub-region, location anchor, terrain, weather, action points, full profiles of known NPCs in the current region, and a summary of ghost NPCs (other player avatars) in the same region.

**Context Layer**: The location anchor (an enhanced 500-character version with ⚠ markers) and the most recent 16 dialogue messages (each truncated to 150-200 characters, labeled "Player Action" / "Narration" / "System"), providing the GM with immediate plot context.

**Task Instruction Layer**: Among the four prompt variants, only **Combined Advance** and **Scene Generate** actually use this layer. Combined Advance requires the GM to simultaneously: ① assess action time cost → `time_elapsed`; ② narrate the result (2-6 sentences) → `narrative`; ③ generate 3 options → `choices`; ④ assess status effects → `state_changes`; ⑤ determine rewards/items → `consequences`; ⑥ provide a precise location → `current_location`.

**JSON Schema Layer**: Enforces that the GM outputs JSON conforming to the `NarrativeResponse` structure, including narrative text, elapsed time, location, choices, consequences (items gained/lost, currency changes, reputation changes, status changes, attribute changes, abnormal conditions), introduced NPCs, scene modifier values, and atmosphere.

**Query Protocol Layer**: Informs the GM of available data query interfaces (`inventory_search`, `npc_lookup`, `location_info`, `character_state`, `skill_check`, `recent_events`, `world_lore`), along with hints about additional data obtainable via queries when the token budget is tight.

---

### 2.2 Multi-Round Query Protocol

#### Motivation

Traditional approaches inject all data (full item lists, NPC lists, dialogue history, chronicles) at once before each prompt call, wasting large amounts of tokens on data the GM may never need, while fixed truncation strategies (backpack 200 chars, anchor 500 chars) sacrifice precision.

The query protocol transforms the interaction into a **multi-round on-demand model**:

```
Client ──[inject core context]──► LLM ──[data query]──► Client
                                       ◄──[query result]──
                                 LLM ──[output narrative]──► Client
```

Completely transparent to the player — the interaction experience is identical to single-round full injection.

#### Message Format

GM responses have two types:

**Type A: Data Query**
```json
{
  "type": "query",
  "reasoning": "I need to confirm what weapons the player is carrying to describe the repair scene",
  "queries": [
    {"query_id": "q1", "intent": "inventory_search", "keyword": "sword"},
    {"query_id": "q2", "intent": "npc_lookup", "name": "Blacksmith", "region": "Ironforge"}
  ]
}
```

**Type B: Final Narrative** — Standard `NarrativeResponse` JSON, containing `narrative`, `choices`, `consequences`, and other fields.

#### Query Types

| intent | Parameters | Return Value |
|--------|------------|--------------|
| `inventory_search` | `keyword` | Full matched item info (name/description/effects/durability) |
| `npc_lookup` | `name`, `region?` | NPC profile (appearance/personality/relationships/history) |
| `location_info` | `location` | Whether explored, narrative summary of last visit |
| `character_state` | `aspects?` | HP/stamina/attributes/abnormal conditions |
| `skill_check` | `keyword` | Matched skill details |
| `recent_events` | `count?` | Summary of most recent N chronicle entries |
| `world_lore` | `topic` | Paragraphs from world lore related to the topic |

#### Interaction Flow

```
Player: "I'll go to the blacksmith to repair my sword"
  → Turn 1: Client injects core context (World Layer + Character Summary + Scene + Query Protocol)
  ← GM returns Query: {inventory_search("sword"), npc_lookup("Blacksmith")}
  → Client QueryResolver queries local data, assembles results
  → Turn 2: Client appends query results to the conversation
  ← GM returns Narrative: "You push open the wooden door of Grim's Blacksmith Shop..."
```

#### Fallback Strategy

If the LLM does not support the query protocol (returns a narrative directly instead of a Query), after extracting JSON, if `type !== "query"` the client treats it directly as a final narrative; if non-JSON text is returned, it processes normally via `parseNarrativeResponse`. Transparent fallback — legacy LLM behavior is unchanged.

#### Token Savings

| Module | Full Injection | On-Demand Query |
|--------|---------------|-----------------|
| Character Layer | Full attributes + skills + backpack list + NPC list | Only attributes + skills + equipment names + HP |
| Scene Layer | Region + full NPC profiles + ghost NPCs + anchor 500 chars | Region + location + weather + anchor 200 chars |
| Context | 16 messages full | Summary or latest 3 messages |

**Initial prompt reduced from ~2400 → ~1200 tokens (50% reduction)**, with additional query round tokens generated on demand. Maximum query rounds `MAX_QUERY_ROUNDS = 3`.

---

### 2.3 2d6 Judgment System

Combined Advance has a built-in judgment mechanism: the GM must first assess the **reasonableness** of the player's action before deciding the narrative direction.

- **Judgment Baseline**: The character's six attributes (STR/DEX/CON/INT/WIS/CHA, range 3-18) provide a reference baseline — the GM evaluates difficulty based on the attribute relevant to the action and the current environment.
- **Absurdity Mapping**: The deprecated `buildActionEvaluatePrompt` once specifically evaluated action absurdity and has now been replaced by the local `estimateAbsurdity()` function. Absurdity uses 2d6 judgment as a reference, with results mapped to narrative variants: reasonable → smooth narration / somewhat difficult → partial success or cost / absurd → failure or unexpected consequences.
- **Status Integration**: Judgment results directly correlate with `hp_change`, `state_changes` (fatigue/morale, etc.), `attribute_changes`, and `conditions_added` in `consequences`.

---

### 2.4 StoryBook Integration

**Data Flow**: The server-side StoryBook is the single source of truth for world setting and region data. On startup, `initPM` fetches the StoryBook's complete world setting (`worldLore`), milestones (`milestones`), chronicle (`chronicle`), and region data (`regions`) from the server, injecting them into `worldStore`. The PM engine reads from `worldStore` and injects into the World Layer when assembling prompts.

**StoryBook Version Compatibility**: Character cards (`.sao-char.json`) carry a `storybookHash`. When importing a character, the hash is verified: if it mismatches, a warning is shown ("Character is from a different version of the StoryBook"), but import is allowed — incompatible NPCs or items are marked as "voided."

**Region Differentiation**: The StoryBook uses the `PromptOverride` mechanism to define differentiated narrative styles for different regions (see Section 2.7). For example, the Royal Plains region applies "courtly and political undercurrent" guidance, while the Demon Lord's Territory applies "oppressive and fearful atmosphere" guidance.

**Offline Cache** (planned): `initPM` responses are cached to `localStorage`. When offline, the cache is read instead of falling back to a 10-character hardcoded string, ensuring the GM has the full world setting during offline play.

---

### 2.5 Streaming Output

The PM engine supports LLM streaming output, displaying narrative text token by token while the player waits for the GM's reply, enhancing interaction immersion.

- **Implementation**:
  - `PMEngine.combinedAdvance()` — non-streaming version, calls `llmClient.chat()`, blocks for full response
  - `PMEngine.streamCombinedAdvance()` — streaming version, calls `llmClient.streamChat()`, returns `AsyncGenerator<string, NarrativeResponse, void>`, yields text chunk by chunk, returns parsed `NarrativeResponse` on completion
  - Both methods share `buildCombinedAdvancePromptString()` private method, ensuring prompt assembly is identical
- **Query Protocol Compatibility**: If during streaming the GM returns a Query (not a Narrative), the client accumulates the full JSON, pauses streaming display, executes query resolution, and continues with the second round call in the background — the player perceives only a continuous "GM is thinking..."
- **Status Indication**: During streaming, `isWaitingForPM` stays `true`, and the narrative area updates text in real time. If the GM queries an item, the first Query's `reasoning` can be displayed as "GM is checking your equipment..."
- **Budget Mode Fallback**: When `experimental.enableTokenBudget = true`, `streamCombinedAdvance()` automatically falls back to `combinedAdvanceWithBudget()` non-streaming (budget derivation needs the full prompt assembled), yielding the whole text in one chunk

---

### 2.6 Token Budget Management

#### Problem

Currently all data uses **fixed character truncation** (backpack 200 chars, anchor 500 chars, dialogue 16 messages), lacking dynamic allocation based on **importance** — important data (HP, location) is treated the same as secondary data (backpack miscellany, ancient distant plotlines).

#### Priority Tiers

```
P0 — Must be complete, cannot be trimmed:
  GM identity declaration, narrative style guidelines (condensed to forbidden rules),
  player action text, judgment results, task instructions + JSON Schema,
  current region name + sub-region name

P1 — Prioritized, can be lightly trimmed:
  Character name + HP/stamina, current equipment (names only),
  current location (structured), most recent 3 dialogue messages, weather + lighting

P2 — Full injection when budget allows:
  Character attributes + skill list, recent experiences (3 summaries),
  important backpack items, current region NPCs (sorted by affinity, top 5 full / rest names only),
  ghost NPCs (top 3)

P3 — Inject only when abundant:
  Full world lore, world situation/milestones/chronicle, dialogue messages 4-16,
  all backpack items, faction attitudes, region event list
```

#### Allocation Algorithm

1. P0 components are allocated full space unconditionally
2. P1-P3 are allocated in priority rounds; within the same priority, ordered by **relevance score / token cost** (cost-effectiveness preferred)
3. Abundant → full version; Moderate → compact version (P1/P2 only, P3 has no compact version); Tight → `defer_to_query`

#### Three-Level Waterline Strategy

| Waterline | Threshold (allocated/maxTokens) | Strategy |
|-----------|--------------------------------|----------|
| Abundant | ≤ 40% (low usage) | All injected in full, no query hints |
| Moderate | 40-70% | P0 full + P1 full + P2 compact + P3 defer |
| Tight | > 70% (high usage, space tight) | P0 full + P1 compact + P2/P3 all defer, query protocol prefixed with "IMPORTANT" |

> `determineBudgetLevel` uses intuitive semantics: high usage (above 70%) returns `tight`, low usage returns `abundant`. Implementation in `client/src/services/engine/TokenBudget.ts:50-63`.

#### Configuration

```typescript
interface PromptBudgetSettings {
  enabled: boolean;          // default true
  maxInputTokens: number;    // 0 = auto-calculate (based on model context window)
  safetyMargin: number;      // default 0.9 (use 90% of context window)
  responseReserve: number;   // default 1024
}
```

#### Component-to-Query Mapping

When a component is deferred to Query/Resolve, the GM can obtain equivalent data via the following query types:

| Component | Available Query |
|-----------|----------------|
| `backpack_full` | `inventory_search(keyword)` |
| `known_npcs` | `npc_lookup(name, region?)` |
| `world_lore` | `world_lore(topic)` |
| `character_state` | `character_state(aspects?)` |
| `character_skills` | `skill_check(keyword)` |
| `world_chronicle` | `recent_events(count?)` |

---

### 2.7 Prompt Template Customization

StoryBook authors can override specified prompt fragments (Slots) to achieve region-level and beat-level differentiation.

#### Overridable Slots

```typescript
type PromptSlot =
  | 'identity'              // GM identity declaration
  | 'worldLore'             // World lore description
  | 'narrativeGuide'        // Narrative style guidelines
  | 'sceneGenerateTask'     // Scene generation task instructions
  | 'combineAdvanceTask'    // Combined Advance task instructions
  | 'queryProtocol'         // Query protocol description
  | 'jsonSchemaAdvance'     // Combined Advance JSON Schema
  | 'jsonSchemaScene'       // Scene Generate JSON Schema
  | 'ghostNPCIntro'         // Ghost NPC introduction text
  | 'knownNPCIntro'         // Known NPC introduction text
  | 'preActionHint'         // Pre-action guidance hint
  | 'customInjection';      // Custom injection point
```

#### Override Definition

```typescript
interface PromptOverride {
  slot: PromptSlot;
  scope: 'global' | 'regional' | 'beat';
  targetIds?: string[];
  mode: 'replace' | 'prepend' | 'append';
  content: string;         // supports placeholder variables
  comment?: string;
}
```

#### Placeholders

| Placeholder | Replaced With | Example |
|-------------|---------------|---------|
| `{{characterName}}` | Character name | Eileen Ash |
| `{{currentRegion}}` | Current region name | Royal Plains |
| `{{currentSubRegion}}` | Current sub-region | Radiant City · Commercial District |
| `{{worldDay}}` | World day | 47 |
| `{{currentEra}}` | Current era | Age of Dark Tides |
| `{{hp}}` / `{{maxHp}}` | HP | 18 / 22 |
| `{{weather}}` | Weather | Clear |
| `{{terrain}}` | Terrain | Plains |

#### Security Constraints

- JSON Schema overrides only allow `replace` mode (no append/prepend, to prevent breaking the JSON structure)
- `queryProtocol` overrides may not remove any query type declarations
- Override content length is limited to 2000 characters
- Override content may not contain JSON outside `{` `}` (to prevent injection attacks)

---

### 2.8 Structured Location

#### Problem

Currently `lastNarrative.slice(0, 200)` is used as the location anchor — an unstructured narrative text slice. The GM must re-parse the location from natural language, easily leading to location drift and making it impossible to precisely answer `location_info` queries.

#### StructuredLocation Type

```typescript
interface StructuredLocation {
  region: string;           // Region ID
  regionName: string;       // Region display name
  subRegion: string;        // Sub-region
  specificPlace: string;    // Specific place (dynamically creatable by GM)
  description: string;      // Place description
  coordinates: { x: number; y: number; z: number };
  firstVisitedAt: string;
  lastVisitedAt: string;
  visitCount: number;
  isKnown: boolean;         // Explored vs. newly created by GM
}
```

#### gameStore Extension

- `currentLocation: StructuredLocation | null` — Structured location replacing the narrative text slice
- `currentSceneNarrative: string` — Used solely for context comprehension (not location information)
- `knownLocations: KnownLocation[]` — Known location list (existing field, extended to structured format)

#### PromptBuilder Rework

Structured location takes priority — if `data.structuredLocation` exists, inject precise location information (Region · Sub-Region · Specific Place + Description + Visit Count + Coordinates); otherwise fall back to narrative text slice (compatible with legacy data). The location anchor field is renamed to "Scene Narrative Anchor" and no longer serves location positioning duties.

#### Location Update Mechanism

After the PM returns a NarrativeResponse, the client detects the `currentLocation` field or location change keywords in `worldEffects`:
1. Push old location to history
2. Check `knownLocations`: existing → update `visitCount`/time; new location → add entry
3. Update `currentLocation`

#### Query Protocol Integration

`location_info` queries can now precisely answer "has this been explored":
- Explored → Returns region name, first arrival time, visit count, description
- New location → Informs the GM this is an unexplored location, recordable via the `currentLocation` field

---

### 2.9 History Compression

#### Dual-Mode Design

| Mode | Trigger | Method | Token Cost |
|------|---------|--------|------------|
| Mode A: Structured Timeline | Budget moderate/tight (default) | Pure client-side computation, extracts action + result keywords | ~200-400 tokens |
| Mode B: LLM Enhanced | Budget abundant + user permitted | Calls lightweight LLM to generate adventure log summary | ~150-300 tokens (summary itself) |

#### Mode A Output Format

```
【Recent Events Timeline】
World Day 47 · Afternoon · Royal Plains · Radiant City:
  ▶ Player encounters a suspicious merchant in the commercial district → rejects smuggling invitation
  ▶ Goes to the Adventurers' Guild → speaks with Old Bartok → accepts "Investigate the Underground Waterway" quest
  ▶ Befriends a dwarf mercenary at the guild (NPC: Brock, Affinity +15)
World Day 47 · Evening · Radiant City · Underground Waterway Entrance:
  ▶ Player enters the underground waterway → PM generates scene
  ▶ [Current action pending evaluation]
```

#### Compression Algorithm

1. Group by world day
2. Extract key actions from each message (remove literary descriptions, retain verb clauses)
3. Truncate by token budget (stop adding when threshold exceeded)
4. Player actions marked `▶`, narration marked `◈`

#### Mode B Flow

1. Call LLM with System Prompt specifying output format: `World Day {N} · {Region}: ▶ {Action} → {Result} [{Consequences}]`
2. Client caches compression result (reused within the same scene)
3. Inject compressed text in Combined Advance; retain only the most recent 3 original messages

#### Token Budget Integration

```typescript
if (recentTokens >= 800) → Mode B or 16 full messages
else if (recentTokens >= 300) → Mode A Structured Timeline
else → only most recent 3 original messages
```

**Benefit**: Dialogue history token consumption reduced by approximately 60%, and the structured format grouped by world day + location improves story coherence.

---

### 2.10 Character Card Export

#### File Format

- Filename: `{CharacterName}_{ExportDate}.sao-char.json`
- Encoding: UTF-8, indented 2 spaces
- Example: `Eileen-Ash_2026-05-14.sao-char.json`

#### Data Structure

```typescript
interface CharacterCard {
  formatVersion: 1;
  metadata: {
    exportedAt: string;
    exportedFrom: 'sao-client';
    clientVersion: string;
    storybookName: string;
    storybookVersion: number;
    storybookHash: string;          // SHA256, exact match on import
  };
  character: CharacterSnapshot;     // Full character state snapshot
  avatar?: { mimeType: string; data: string };  // Base64 avatar (optional)
  playerNotes?: string;
}
```

CharacterSnapshot includes: base identity (name/race/background/appearance), six attributes, skill list (with experience and upgrade thresholds), inventory (equipment + backpack + currency), HP/stamina, reputation, abnormal conditions, world association (joined region/joined world day/current local day), recent experiences, and all known NPC relationship states.

#### Import Logic

1. Version check: `formatVersion > 1` → reject
2. StoryBook compatibility: `storybookHash` mismatch → warn but allow import, incompatible entities marked "voided"
3. Data validation: required fields, attribute range [3,18], HP legality
4. Write to `characterStore` and `npcStore`

#### Import Strategy

| Scenario | Behavior |
|----------|----------|
| No existing character | Create directly |
| Has character, same name | Overwrite / Merge (keep current items) / Cancel |
| Has character, different name | Replace current character / Cancel |
| StoryBook version differs | Warn but allow import |
| Validation fails | Reject, show error reason |

---

## 3. Roadmap

### Implemented

The Prompt layered architecture, Combined Advance variant, Query Protocol Query/Resolve, 2d6 judgment system, and foundational streaming output support have been delivered, forming the stable backbone of OpenTaleRunner narration.

### Evolution Direction

**Core Infrastructure**: Aiming to establish a comprehensive Token Budget Management system that dynamically allocates context space based on priority tiers, ensuring important data always holds priority ground. In parallel, advancing Structured Location Anchors to replace narrative text slices with precise coordinates and place names, completely eliminating location drift.

**Context and Dialogue Optimization**: Aiming to introduce multi-source context merging strategies, intelligently trimming injected content through deduplication and relevance scoring. Combined with dialogue history compression (dual-mode: client-side structured timeline extraction and LLM-enhanced summarization), ensuring the GM maintains clear awareness of key plot threads amidst vast dialogue.

**Backpack and NPC Information Injection**: Aiming to implement priority-tiered backpack item injection, ensuring equipment and important items are prioritized when tokens are tight. In parallel, advancing ghost NPC personality extraction and NPC relationship context enhancement, giving every character in the world a perceivable personality and relationship network.

**Prompt Customization and Character Cards**: Aiming to open Prompt Template Override capabilities, allowing different regions and different beats to have differentiated narrative style guidance. Simultaneously perfecting the character card export/import system, enabling characters to flow freely across different worlds and devices. Also implementing world lore offline caching, ensuring the GM retains the full world setting during offline play.

**Streaming and Multi-Model Adaptation**: Aiming to enhance Combined Advance streaming output, providing seamless streaming transitions between query protocol rounds. In parallel, automatically adjusting budget parameters and task instruction wording based on different LLMs (DeepSeek / GPT / Claude) with their respective context windows and instruction-following characteristics, unleashing each model's optimal narrative potential.

### Experimental Toggles

All new optimizations are controlled via feature flags in `settingsStore`; when turned off, they immediately fall back to the current logic — Token Budget falls back to fixed truncation, Structured Location falls back to narrative text slices, Dialogue Compression falls back to 16 original messages, Overrides fall back to hardcoded prompts.

## 4. v0.4 Increment

v0.4 added two new dimensions to the PM engine: **Cross-Session NPC Memory** and **In-Game Codex**.

### 4.1 Long-Term Memory Segment Injection (`buildGmMemoryRetrievalSection`)

v0.4 added the 12th `build*` method in `PromptBuilder`, dedicated to GM long-term memory retrieval.

#### 4.1.1 Injection Point

- Insertion: end of `buildCombinedAdvancePrompt`, right after "Recent Conversation"
- Section name: `## 🧠 长期记忆 (GM 检索 - N 条)` (long-term memory retrieved by GM, N entries)
- Priority: Same level as recent conversation, but **only injected when settingsStore.memory is enabled**

#### 4.1.2 Retrieval Flow

1. **Query assembly** — `actionText + game.currentRegion + game.currentSubRegion + npcNames + itemNames`
2. **Sync retrieval** — `MemoryManager.searchSync({ query, scopes: ['npc','item','event','player','location','lore'], topK: 8, minScore: 0.05 })`
3. **Active entity protection** — `MemoryManager.setActiveEntities(['character:<id>', 'npc:<name>', ...])`, used for decay strategy protection
4. **Formatting** — Each entry: `- NPC [Day N] <content> (importance: 0.X)`
5. **Failure tolerance** — `try/catch` wrapped; retrieval failure doesn't block main flow (returns empty string)

#### 4.1.3 Test Coverage

- `tests/services/engine/PromptBuilder-memory.test.ts` — 1 integration test
- `tests/services/memory/integration.test.ts` — 7 tests (commitEpisode / parseSummaries / fallbackSummary / 🧠 segment retrieval)

### 4.2 NPC Memory Layer (`EpisodicSummarizer` + `MemoryManager`)

#### 4.2.1 Data Write Timing

- **Trigger point**: `useActionSubmit.ts:440-449`, async call `commitEpisode()` after `applyConsequences`
- **Doesn't block main flow**: Explicit `void commitEpisode(...)`, only logs on failure
- **Extracted content**: `npcsInvolved` (from reputationChange keys) + `itemsChanged` (from itemsGained/lost names) + `locationChanged` (narrative.currentLocation vs game.currentLocation)

#### 4.2.2 Summarization Strategy

v0.4 uses **dual-path** summarization:

| Path | When used | Behavior |
|------|-----------|----------|
| `parseSummaries(llmOutput)` | LLM outputs `[SUMMARIES]…[/SUMMARIES]` block after narrative | Parse into structured MemoryRecordInput[] (with scope/entityId/content/importance) |
| `fallbackSummary(episode)` | LLM didn't output block / parse failure | Fallback: extract 1-3 facts from npcsInvolved + itemsChanged + narrative |

v0.4 defaults to `fallbackSummary` (avoids inserting another LLM call that would block the main flow). Planned to change to LLM-extracted-during-PM-request in v0.9.

#### 4.2.3 Abstraction Layer (Strategy Pattern)

`MemoryBackend` interface + existing `InMemoryMemoryStore` implementation + `Mem0ClientAdapter` placeholder. When switching to Mem0 / other backends in the future, the main architecture (UI / PromptBuilder / Summarizer) is unaware.

### 4.3 Codex (`codexStore` + `codexSignature`)

#### 4.3.1 Data Layer

- **Signature dedup**: `codexSignature` pure function (6 unit tests) — `hash(scope + name + metadata)`, avoids duplicate unlocks
- **store**: `codexStore` (6 unit tests) — 6 categories (npc / item / event / location / faction / lore), localStorage persistence
- **Trigger timing**: `applyConsequences` branches detect newly-unlocked codex entries, write store + emit Toast

#### 4.3.2 UI Layer

- **Entry**: RightPanel top-bar `📖 Codex` button
- **Modal**: `CodexModal` three-column (scope sidebar / grid / detail)
- **Shared component**: `CodexEntry` (same pattern as `MemoryEntry`, 6 scope colored icons)
- **Key commits**: `c0664c6` codexStore; `e34676b` codexSignature; `ac5d049` CodexModal; `e379a86` applyConsequences trigger

### 4.4 v0.4 Key Commits (Memory + Codex)

```
fc43abf  spec (memory)
fe5225a  spec self-review
2f3c24d  plan
1ed1059  Add missing types/memory.ts + handle missing embedding
a147c9f  useMemory hooks + MemoryManager subscribe + useMemoryInit
577e226  MemoryEntry + MemoryModal
ba3fbe6  useActionSubmit + RightPanel + App + SocialPanel integration
+ codex (c0664c6 / e34676b / ac5d049 / e379a86)
```

### 4.5 Known Constraints (To be Resolved After v0.4)

- Summarization uses fallback instead of LLM — v0.9 changes to LLM extraction during PM request
- Retrieval is sync full-table scan + cosine similarity, performance degrades with >1k records — v0.9 switch to sqlite-vec
- Memory layer has no real Mem0 integration, only placeholder — v0.9 switch to Mem0ClientAdapter
- Codex 6 categories (npc/item/event/location/faction/lore) not configurable — future
- CodexModal and MemoryModal duplicate scope filtering logic; consider shared component — v0.5

