# Client Architecture and Mechanisms

> Based on the current implementation in `client/src`, this document consolidates architecture design, system index, runtime flow, and component directory into a single reference.

---

## Layered Architecture

### 1.1 Technology Stack

| Layer | Current Implementation | Description |
|----|----------|------|
| Application framework | React 19 + TypeScript 6 + Vite 8 | Standard frontend web client structure |
| State management | Zustand 5 | `gameStore` / `characterStore` / `worldStore` etc. split by domain |
| Styling | Tailwind CSS 4 + global stylesheet | Utility-first classes, supplemented by `index.css` |
| Animation | Framer Motion 12 | Narrative overlays and animation components |
| Network layer | `fetch` + `EventSource` | REST access + world update SSE push |
| Local persistence | `localStorage` + `IndexedDB` | Settings, character list, multiplayer saves, image cache |
| AI capabilities | Client-direct LLM / TTS / Image API | Player-provided API keys; server handles world data and multiplayer room state |

### 1.2 Layered Structure

```text
App / Components
  ├─ Handles title screen, solo interface, multiplayer lobby/room views, and modal assembly
  ├─ Reads state from stores and dispatches user interactions
  └─ Does not directly implement complex rules

Hooks Orchestration
  ├─ usePMEngine: solo main loop + multiplayer result consumption + consequence application
  ├─ useAutoPlay: AutoPlay control orchestration
  ├─ useVoiceInput: STT interaction orchestration
  └─ useLocalization: localization access

Domain Stores
  ├─ gameStore: current session runtime state
  ├─ characterStore: current character state
  ├─ worldStore: server-synced world state
  ├─ multiplayerStore: multiplayer room state
  ├─ npcStore / partyStore / autoPlayStore / uiStore / settingsStore
  └─ characterListStore: local character index

Services
  ├─ engine/: Prompt, Query, TokenBudget, History compression, PMEngine
  ├─ judgment/: Local judgment and condition effects
  ├─ sync/: Generic APIClient and world sync management
  ├─ multiplayer/: Multiplayer REST, polling, heartbeat, saves
  ├─ hooks/: Game Hook System and rule registration
  ├─ storybook/: Storybook runtime and field normalization
  ├─ npc / party / travel / activity / autoPlay
  └─ tts / image / character card and other extended capabilities

Server Interfaces
  ├─ Solo world data: storybook / world / sync / chronicle / activity
  ├─ Multiplayer room data: multiplayer rooms / round / save / narratives
  └─ Media capabilities: LLM / TTS / Image mostly via third-party APIs
```

### 1.3 Responsibility Breakdown

**UI Layer** — Rooted at `App.tsx`, determines rendering branches based on `phase`, multiplayer room state, and active modals. Layout components map state to visual structure; panel and modal components handle local interaction without undertaking cross-system business orchestration.

**Store Layer** — Holds "factual state" and does not initiate complex side effects:

- `gameStore`: current time, location, messages, waiting state, travel state, and dice results.
- `characterStore`: current character sheet, providing atomic updates to attributes, conditions, items, and history.
- `worldStore`: storybook, world day, region states, world chronicles, ghost NPCs, and pending encounters.
- `multiplayerStore`: room snapshot, character slots, lobby phase, action round results, and local multiplayer save index.
- `settingsStore`: cross-session configuration; `characterListStore`: local character directory.
- `npcStore`: known NPC registry, relationships, and interaction history.
- `partyStore`: party members, loyalty, XP, and combat bonuses.
- `autoPlayStore` / `uiStore`: AutoPlay progress and display-only state.

**Hook Orchestration Layer** — Bridges component behavior, wiring multiple services and stores together:

- `usePMEngine`: the core orchestration layer for the solo main loop and multiplayer result consumption, also handling local judgment, consequence application, chronicle recording, and message sync.
- `useAutoPlay`: connects `AutoPlayEngine` to the main action submission pipeline.
- `useVoiceInput`: feeds browser speech recognition or custom STT results back into the input field.
- `useLocalization`: provides unified access to localized text.

**Service Layer** — Carries rules, I/O, and cross-store shared capabilities:

- `PMEngine`: handles only Prompt and LLM round-trips; does not directly write to stores.
- `JudgmentSystem`: executes local 2d6 judgments, stacking attributes, skills, equipment, conditions, nighttime penalties, and party bonuses.
- `SyncManager`: world state sync; `SyncServices`: room polling, heartbeat, and real-time nearby player sync.
- `MultiplayerAPI` and `APIClient`: network access layer, the former focused on multiplayer room domains and the latter on general world domains.
- `SystemHooks`: rule subscription-based linkage, decoupling time passage, rest, combat, environment, and condition effects.

### 1.4 Key Data Channels

| Channel | Entry Point | Flow Summary |
|------|------|----------|
| Solo main loop | `InteractionArea` → `usePMEngine.submitAction()` | Local judgment → LLM narrative → consequence application → messages/chronicle/save |
| Multiplayer room loop | `MultiplayerAPI` + `SyncServices` | REST requests + lobby/action round polling + heartbeat + `usePMEngine` consuming results |
| World sync | `SyncManager` (started during `playing` phase) | Periodic `syncAll()` uploading chronicles, pulling updates; SSE push writes to `worldStore` |
| Activity reporting | `ActivityReporter` (started during `playing` phase) | Periodic reporting of position, action, and online status |

### 1.5 Architecture Assessment and Evolution

**Strengths:**

1. The `store → hook → service` layering is well-formed; solo, multiplayer, world sync, and media capabilities all have clear boundaries.
2. `SyncManager` and `SyncServices` have distinct responsibilities — the former syncs the world, the latter syncs rooms and real-time players. This division should be preserved.
3. The storybook runtime has become the unified source of world settings, no longer relying on early hardcoded values.

**Areas for Improvement:**

1. `usePMEngine.ts` remains a heavy orchestration layer, simultaneously handling solo progression, multiplayer result consumption, consequence application, chronicle recording, and message sync — making testing and maintenance costly.
2. `APIClient.ts` and `MultiplayerAPI.ts` each maintain their own request encapsulation, auth, and JSON adaptation, resulting in duplicated network layer logic.
3. Authentication token ownership is unclear — some modules read it as a `settingsStore` field; the "auth session" has not been formalized as an independent state layer.
4. The main chunk exceeds 500 kB; dynamic imports within `SyncServices.ts` do not produce actual bundle-splitting benefits because the referenced modules are statically imported elsewhere.
5. `CacheManager.ts` remains a placeholder system — a decision is needed on formal integration or cleanup.

**Evolution Suggestions:**

1. Split `usePMEngine` into four smaller services or hooks: "action submission", "consequence application", "multiplayer result consumption", and "message write-back".
2. Extract a unified network base layer so `APIClient` and `MultiplayerAPI` share base request, auth, and error normalization logic.
3. Establish an independent auth session state.
4. Apply route-based or interaction-based code splitting for secondary capabilities (multiplayer, voice, images, character cards) to reduce main bundle pressure.

---

## System Index

### 2.1 Root Entry and Overall Orchestration

| System | Entry File | Primary Responsibility | Key Dependencies | Notes |
|------|----------|----------|----------|------|
| Application root | `client/src/App.tsx` | Switches between title screen, solo play, multiplayer lobby/room views; assembles storybook runtime, global modals, world sync and activity reporting lifecycles | `usePMEngine`, `useAutoPlay`, `SyncManager`, various stores | System assembly layer; does not carry core rule computation |
| React entry point | `client/src/main.tsx` | Mounts React root node, imports global styles and starts the app | `App.tsx`, `index.css` | No business logic |

### 2.2 State Management Systems (Stores)

| System | Entry File | Primary Function | Key Data | Notes |
|------|----------|----------|----------|------|
| Game runtime state | `client/src/stores/gameStore.ts` | Manages current phase, time, location, message stream, options, waiting state, dice results, travel state | `phase`, `currentDay`, `messages`, `coordinates`, `travelState` | Short-lived state center shared by all UI components |
| Current character state | `client/src/stores/characterStore.ts` | Manages current player character's attributes, skills, HP, vitality, items, history; triggers system hooks on condition changes | `character`, `vital`, `inventory`, `recentHistory` | Describes "current character" only; does not manage character list |
| World sync state | `client/src/stores/worldStore.ts` | Stores storybook, world day, region states, world chronicles, ghost NPCs, encounters, and last sync time | `storybook`, `regions`, `worldChronicle`, `ghostNPCs` | Unified landing point for server world data written back to the client |
| UI state | `client/src/stores/uiStore.ts` | Manages modal toggles, sidebar collapse, font, theme, and other display-only state | `activeModal`, panel collapse state | Should not carry domain business data |
| Settings state | `client/src/stores/settingsStore.ts` | Persists LLM, server, voice, image generation, experimental switches, etc. | `llm`, `server`, `tts`, `imageGen`, `experimental` | Persisted across sessions via `persist` |
| NPC state | `client/src/stores/npcStore.ts` | Manages known NPC registry, relationships, interaction history, and promotions on the client | `npcs`, relationship history, secret info | Reused by social panel, prompt injection, and party system |
| Character list state | `client/src/stores/characterListStore.ts` | Maintains local character save index for title screen "continue" and save/load modals | `savedCharacters` | A "character directory", not current character details |
| AutoPlay state | `client/src/stores/autoPlayStore.ts` | Manages AutoPlay execution status, rounds, last action, and error info | `status`, `currentRound`, `lastAction` | Provides execution progress for `AutoPlayControl` |
| Multiplayer state | `client/src/stores/multiplayerStore.ts` | Manages room info, player sessions, character slots, lobby phase, action round results, and local multiplayer save index | `roomId`, `players`, `characterSlots`, `localArchives` | Core state center for multiplayer UI |
| Party state | `client/src/stores/partyStore.ts` | Manages party members, loyalty, XP, combat bonuses, and support ability queries | `members`, `maxSize`, `getCombatBonus` | Provides shared facts for judgment, travel, and party panel |
| Combat state | `client/src/stores/combatStore.ts` | Manages v0.4 combat system's 5-phase state machine (idle / setup / rolling / acting / resolution / ended) + ACT queue + QTE timing | `session`, `currentRound`, `pendingActions` | Only holds values during combat; cleared on end |
| Item registry | `client/src/stores/itemRegistryStore.ts` | Maintains v0.4 affix pool runtime registry (prefix/suffix + weights) for `applyConsequences` loot path queries | `affixPools`, `drawAffixes` | Used with `data/affixPools.ts` data layer |
| Codex state | `client/src/stores/codexStore.ts` | Manages v0.4 Codex entries (npc/item/event/location/faction/lore 6 categories) + signature dedup + unlock time | `entries`, `unlockedAt` | Uses `codexSignature` pure function to prevent duplicates |

### 2.3 Business Orchestration Systems (Hooks)

| System | Entry File | Primary Function | Key Dependencies | Notes |
|------|----------|----------|----------|------|
| PM orchestration | `client/src/hooks/usePMEngine.ts` | Wires together PMEngine, local judgment, consequence application, chronicle recording, auto-save, multiplayer round message sync | `PMEngine`, `JudgmentSystem`, `ChronicleRecorder`, various stores | Currently the heaviest orchestration layer; primary target for future splitting |
| AutoPlay orchestration | `client/src/hooks/useAutoPlay.ts` | Connects `AutoPlayEngine` with `submitAction` and activity reporting | `AutoPlayEngine`, `usePMEngine`, `activityReporter` | Exposes start, pause, stop, step interfaces to components |
| Localization access | `client/src/hooks/useLocalization.ts` | Provides unified localization text reading capability | i18n config | Currently lightweight in scope |
| Voice input orchestration | `client/src/hooks/useVoiceInput.ts` | Manages browser STT, custom STT API fallback, and input field integration | Web Speech API, MediaRecorder, settings state | Voice entry point for the interaction input area |

### 2.4 Core Reasoning and Rule Systems (Services / engine, judgment, hooks)

| System | Entry File | Primary Function | Key Collaborators | Notes |
|------|----------|----------|---------------|------|
| PM Engine | `client/src/services/engine/PMEngine.ts` | Assembles prompts, coordinates Query Protocol, calls LLM and parses into scene/narrative responses | `PromptBuilder`, `LLMClient`, `QueryResolver` | Returns results only; does not write directly to stores |
| Prompt Builder | `client/src/services/engine/PromptBuilder.ts` | Generates prompt text from world layer, character layer, scene layer, and context layer | `TokenBudget`, `ContextMerger`, `HistoryCompressor` | Core assembly layer for prompt engineering |
| Token Budget | `client/src/services/engine/TokenBudget.ts` | Allocates token budget to prompt components; generates Query Hints when necessary | `PromptBuilder` | Truncation strategy for overly long contexts |
| Context Merger | `client/src/services/engine/ContextMerger.ts` | Deduplicates and prioritizes multi-source context, controls injection priority | World/NPC/history context | Optimization for the prompt side |
| History Compressor | `client/src/services/engine/HistoryCompressor.ts` | Compresses long conversations into shorter narrative summaries | Recent messages, LLM optional compression | Used in conjunction with token budget |
| Query Resolver | `client/src/services/engine/QueryResolver.ts` | Handles inventory/npc/location etc. queries from the PM Query Protocol | Various stores | Auxiliary module for PMEngine |
| Local Judgment System | `client/src/services/judgment/JudgmentSystem.ts` | Executes 2d6 judgment, stacking attributes, skills, equipment, conditions, nighttime penalties, and party bonuses | `characterStore`, `partyStore`, system hooks | Unified entry point for both solo and multiplayer local judgment |
| Conditions Registry | `client/src/services/judgment/ConditionsRegistry.ts` | Maintains preset condition effects and provides condition effect resolution | `JudgmentSystem`, travel/recovery systems | Makes conditions more than just display properties |
| Game Hook System | `client/src/services/hooks/SystemHooks.ts` | Provides namespace-based hook registration, replacement, enable/disable, and chained execution | `services/hooks/rules/*` | Used to decouple cross-system linkages |
| Snapshot Builder | `client/src/services/hooks/GameSnapshot.ts` | Builds a unified game snapshot for hook execution | `gameStore`, `characterStore` | Provides rules with environment/character context |
| Trigger Extractor | `client/src/services/hooks/extractTriggers.ts` | Extracts trigger events consumable by rules from PM consequences or actions | `usePMEngine` | Maps GM output to hook namespaces |
| Rule Registration Entry | `client/src/services/hooks/rules/index.ts` | Registers time, rest, combat, environment, condition, etc. rules at app startup | `systemHooks` | Loaded by `App.tsx` via side-effect import |

### 2.5 Sync and Network Systems (Services / sync, multiplayer, activity)

| System | Entry File | Primary Function | Key Dependencies | Notes |
|------|----------|----------|----------|------|
| Generic API Client | `client/src/services/sync/APIClient.ts` | Accesses storybook, world state, characters, chronicles, encounters, NPCs, activity tracking, auth, etc. REST endpoints | `fetch` | Base network layer for solo and world sync paths |
| World Sync Manager | `client/src/services/sync/SyncManager.ts` | Periodically fetches `sync/updates`, uploads chronicles, connects to world update SSE; writes results back to `worldStore` | `APIClient`, `eventBus` | Handles only "world sync"; does not handle multiplayer room polling |
| Multiplayer REST Client | `client/src/services/multiplayer/MultiplayerAPI.ts` | Encapsulates room, lobby, action round, spectating, multiplayer save endpoints; adapts snake_case responses | `fetch`, `settingsStore` | Shares partial network responsibilities with `APIClient` |
| Multiplayer Polling Coordinator | `client/src/services/multiplayer/SyncServices.ts` | Manages room polling, action round polling, heartbeat keep-alive, and solo real-time nearby player sync | `MultiplayerAPI`, various stores | Belongs to the "short-cycle sync" system |
| Multiplayer Save Manager | `client/src/services/multiplayer/SaveManager.ts` | Saves, imports, exports, and deletes local multiplayer saves | `localStorage` | Host-side local save entry point |
| Activity Reporter | `client/src/services/activity/ActivityReporter.ts` | Periodically reports player's current action, position, and online status | `APIClient`, various stores | Serves both solo world activity and server dashboard |

### 2.6 World, NPC, Party, and Travel Systems

| System | Entry File | Primary Function | Key Dependencies | Notes |
|------|----------|----------|----------|------|
| Storybook Runtime | `client/src/services/storybook/runtime.ts` | Fetches storybook from server and provides runtime resolution utilities for world name, era, starting region, key NPCs, etc. | `APIClient`, `normalizeStoryBook` | Unified entry point for "world data-driven" approach |
| Storybook Normalizer | `client/src/services/storybook/normalizeStoryBook.ts` | Adapts snake_case / camelCase fields and outputs a client-unified structure | Server storybook response | Reduces field drift impact |
| NPC Generator | `client/src/services/npc/NPCGenerator.ts` | Generates client-side NPC data using storybook templates or runtime info | `storybook runtime` | Collaborates with `npcStore` |
| Party Template System | `client/src/services/party/PartyTemplates.ts` | Provides animal/monster party member templates | `partyStore` | Used for recruitment and test data |
| Party Ability Inference | `client/src/services/party/inferAbilities.ts` | Infers combat/support abilities from NPC text info and generates `PartyMember` | `types/npc`, `types/party` | Adapter layer between party and NPC systems |
| Travel System | `client/src/services/travel/TravelSystem.ts` | Calculates distance, speed, travel time, coordinate interpolation, and interruption recovery | `gameStore`, `worldStore`, system hooks | Supports movement, map, and time progression |

### 2.7 Media and Extended Capability Systems

| System | Entry File | Primary Function | Key Dependencies | Notes |
|------|----------|----------|----------|------|
| TTS Client | `client/src/services/tts/TTSClient.ts` | Calls speech synthesis API, generates and plays PM or NPC voice | `settingsStore`, browser audio capabilities | Collaborates with `TTSQueue` and `NPCVoiceManager` |
| NPC Voice Manager | `client/src/services/tts/NPCVoiceManager.ts` | Assigns and persists voice parameters for NPCs | `localStorage`, server NPC data | Ensures consistent NPC voice across sessions |
| Image Generation Client | `client/src/services/image/ImageClient.ts` | Calls image generation API, manages local cache and error fallback | `IndexedDB`, `settingsStore` | Supports terrain illustrations and NPC portraits |
| AutoPlay Engine | `client/src/services/autoPlay/AutoPlayEngine.ts` | Generates action decision loops for AI players | `useAutoPlay`, `usePMEngine` | For unattended or observation mode |
| Character Card Exporter | `client/src/services/character/CharacterCardExporter.ts` | Exports character snapshots from stores to a unified character card format | `characterStore`, `npcStore` | For cross-world / cross-storybook migration |
| Character Card Importer | `client/src/services/character/CharacterCardImporter.ts` | Validates and imports character cards, handling storybook compatibility | Various stores | Includes version and basic validity checking |
| Event Bus | `client/src/services/event/EventBus.ts` | Publish/subscribe cross-module events | `services/event/events.ts` | Used for network online status, world sync notifications, etc. |
| Cache Manager | `client/src/services/cache/CacheManager.ts` | Provides generic caching capability | Not yet integrated | Placeholder system; decision needed on integration or cleanup |

### 2.8 System Boundary Assessment

1. The current client has formed a basic layering of "stores hold facts, hooks handle orchestration, services carry rules and I/O" — the direction is sound.
2. `usePMEngine.ts` currently bears excessive orchestration responsibility and is the top-priority core system for further splitting.
3. `APIClient.ts` and `MultiplayerAPI.ts` each maintain their own request, auth, and error handling — the network layer is not fully consolidated.
4. The responsibility boundary between `SyncManager.ts` and `SyncServices.ts` is clear (world sync vs. room/real-time player) and should be preserved.
5. `CacheManager.ts`, auth token ownership, and the unification approach for multiplayer API vs. generic API are the most apparent architectural improvement targets.

---

## Runtime Flow

### 3.1 Startup Flow

```text
npm run dev / npm run build
  -> main.tsx mounts <App />
  -> App.tsx import './services/hooks/rules'
  -> App initializes stores, global modals, and overlays
  -> Fetches storybook runtime data hydrateStorybook()
  -> Based on phase and multiplayer room state, enters title screen, solo play, or multiplayer view
```

**Title screen phase** provides four entry points:

1. Create new character: opens `CharacterCreationWizard`.
2. Quick start: generates a demo character and directly enters solo flow.
3. Continue: loads a local character from `characterListStore`.
4. Multiplayer: opens `MultiplayerSetupModal`, entering create or join room flow.

**Storybook runtime assembly**: `App.tsx` executes `hydrateStorybook()` after startup; on success, normalized storybook data is written to `worldStore.storybook`. From this point, world name, era, starting region, key NPCs, and world lore are all provided by the storybook runtime.

### 3.2 Entering Solo Game

`startGame` is responsible for converting a character from a "title screen object" into "runtime state":

1. Writes character to `characterStore`.
2. Resolves starting region, sub-area, location, coordinates, terrain, and time via `resolveRuntimeStartState()`.
3. Backfills initial runtime state into `gameStore` and `worldStore`.
4. Injects date separators and initial message environment.
5. Creates starting NPCs via storybook runtime and `npcGenerator`.
6. Calls `initPM()` to initialize the shared `PMEngine`.
7. Requests the first scene via `requestScene()`, formally entering the main loop.

When `phase === 'playing'`, `App.tsx` starts two long-running side effects:

- `ActivityReporter`: periodically reports current player activity state.
- `SyncManager`: starts automatic sync and world update push.

Both side effects stop when returning to the title screen; if `syncOnExit` is enabled, a forced upload is performed first.

### 3.3 Solo Main Loop

```text
InteractionArea / Quick Actions / Voice Input
  -> usePMEngine.submitAction(action)
  -> Estimate absurdity and decide whether local judgment is needed
  -> JudgmentSystem generates dice result (or auto-success)
  -> PMEngine generates composite narrative result
  -> applyConsequences applies to characterStore / gameStore / npcStore / partyStore
  -> Appends message stream, chronicle, and local auto-save
  -> As needed, triggers world sync notifications, activity reporting, NPC registration, and hints
```

`usePMEngine` currently handles: solo action submission and local judgment, multiplayer round result message sync, consequence application (attributes, status, items, conditions, relationships, etc.), chronicle recording and local character auto-save, and hook system triggering (driving time passage, rest, environment, and condition linkages).

**PM request chain**: `PMEngine` assembles the following context into a single prompt — world layer (era, lore, storybook guidance), character layer (attributes, skills, equipment, status, party info), scene layer (structured location, terrain, weather, known/ghost NPCs), context layer (recent messages, narrative summary, compressed if necessary), query protocol (fills in inventory/npc/location on demand when token budget is tight).

### 3.4 Multiplayer Flow

**Lobby and starting the game:**

```text
MultiplayerSetupModal
  -> createRoom / joinRoom
  -> multiplayerStore.syncRoomSnapshot()
  -> LobbyPanel renders players, character slots, and host controls
  -> character-ready / common backstory / start
  -> room.state.phase enters playing
  -> App.tsx switches to MultiplayerGameView
```

**Action round sync** is managed by `SyncServices.ts`:

- `startHeartbeat()`: 30-second keep-alive.
- `startRoomPoll()`: 5-second room snapshot polling.
- `startRoundPoll()`: 3-second action round status polling; when all players have submitted and no latest results exist, actively calls `processRound()`.
- `usePMEngine`: consumes round results, writes back to the message system, and applies consequences to the current player.

**Mid-game joining and spectating:**

1. When mid-game joining is allowed while the game is in progress, new players enter `spectating`.
2. After completing `spectator-ready`, they enter `pending_intro`.
3. Once the action round advances to meet `late_join_intro_delay`, the server formally introduces the player in the multiplayer PM narrative.
4. After successful introduction, the state switches to `in_game` and the player can submit actions normally thereafter.

### 3.5 World Sync and Activity Reporting

**World sync**: `SyncManager` starts two channels during the solo `playing` phase:

1. Polling sync: periodically executes `syncAll()`, uploading chronicles and pulling `/api/v1/sync/updates`.
2. SSE push: connects to `/api/v1/world/stream`; server-pushed world updates are directly written back to `worldStore`.

Sync results uniformly land in: `worldStore.currentWorldDay`, `regions`, `worldChronicle`, `ghostNPCs`, `pendingEncounters`.

**Activity reporting**: `ActivityReporter` periodically reports the player's current position, action, and online status. This is an "observability data channel" and does not directly alter the client's main flow.

### 3.6 Extended Capability Flows

- **AutoPlay**: `useAutoPlay` generates actions via `AutoPlayEngine`, reusing the `submitAction` main pipeline and sharing the same judgment, consequence, and save logic as manual play.
- **Voice input / output / illustration**: `useVoiceInput` prioritizes the Web Speech API, falling back to STT when needed; `TTSClient` + `NPCVoiceManager` handle text-to-speech and voice persistence; `ImageClient` handles terrain illustration and NPC portrait generation with IndexedDB caching. These capabilities are "main-loop-adjacent experience enhancements" and do not invert the main state management boundary.

---

## Component Directory

### 4.1 Root Components and Main Layout

| Component | File | Primary Responsibility | Key Dependencies |
|------|------|----------|----------|
| Root entry | `client/src/App.tsx` | Switches between title screen, solo play, multiplayer lobby, and multiplayer game views; assembles global modals, overlays, and sync lifecycles | Multiple stores, `usePMEngine`, `useAutoPlay` |
| Main layout | `client/src/components/layout/AppLayout.tsx` | Three-column layout skeleton for solo mode | `LeftPanel`, `CenterPanel`, `RightPanel` |
| Center area | `client/src/components/layout/CenterPanel.tsx` | Hosts narrative area and interaction area | `NarrativeArea`, `InteractionArea` |
| Left panel | `client/src/components/layout/LeftPanel.tsx` | Tab-switching entry for character / social / party panels | `CharacterPanel`, `SocialPanel`, `PartyPanel` |
| Right panel | `client/src/components/layout/RightPanel.tsx` | Environment info, quick actions, backpack/refresh entry points | `EnvironmentInfo`, `usePMEngine` |

### 4.2 Game Area Components

| Component | File | Primary Responsibility | Key State |
|------|------|----------|----------|
| Narrative area | `client/src/components/game/NarrativeArea.tsx` | Renders PM, player, system, multiplayer round summary, and other message streams | `gameStore.messages` |
| Interaction area | `client/src/components/game/InteractionArea.tsx` | Provides option buttons, custom input, voice input, multiplayer waiting state, and quick action entry | `usePMEngine`, `gameStore`, `multiplayerStore` |
| PM thinking overlay | `client/src/components/game/PMThinkingOverlay.tsx` | Displays global waiting overlay during PM/GM reasoning | `gameStore.isWaitingForPM` |
| Dice result overlay | `client/src/components/game/DiceResultOverlay.tsx` | Shows local judgment animation and result summary | `gameStore.currentDiceResult` |
| AutoPlay control | `client/src/components/game/AutoPlayControl.tsx` | Displays AutoPlay start, pause, stop, step, and round status | `autoPlayStore`, `useAutoPlay` |

### 4.3 Panel Components

| Component | File | Primary Responsibility | Key State |
|------|------|----------|----------|
| Character panel | `client/src/components/panels/CharacterPanel.tsx` | Displays current character's attributes, skills, equipment, HP, vitality, reputation, etc. | `characterStore` |
| Social panel | `client/src/components/panels/SocialPanel.tsx` | Displays known NPCs, relationship levels, details, and quick interactions | `npcStore` |
| Party panel | `client/src/components/panels/PartyPanel.tsx` | Displays party members, loyalty, ability summaries, and leave/upgrade info | `partyStore` |
| Environment panel | `client/src/components/panels/EnvironmentInfo.tsx` | Displays location, time, weather, terrain, nearby players, map, and world info | `gameStore`, `worldStore`, `SyncServices` |
| World map | `client/src/components/panels/WorldMap.tsx` | Renders 2D world map, explored locations, and nearby player markers | World map API, `fetchNearbyPlayers` |
| Active entities panel | `client/src/components/panels/ActiveEntitiesPanel.tsx` | Displays active players, AutoPlay entities, and AI NPCs in the current region | `APIClient`, activity reporting data |

### 4.4 Multiplayer Components

| Component | File | Primary Responsibility | Key State |
|------|------|----------|----------|
| Multiplayer setup modal | `client/src/components/modals/MultiplayerSetupModal.tsx` | Create room, join room, select inherited save and advanced config | `multiplayerStore`, `SaveManager` |
| Lobby panel | `client/src/components/multiplayer/LobbyPanel.tsx` | Displays room info, player list, character slots, host controls, and character creation entry | `multiplayerStore` |
| Character slot selector | `client/src/components/multiplayer/CharacterSlotSelector.tsx` | Handles character slot claiming UI in inherit mode | `multiplayerStore` |
| Action round status | `client/src/components/multiplayer/ActionRoundStatus.tsx` | Displays current round, players who have acted, awaiting teammates, and countdown | `multiplayerStore` |
| Player mini panel | `client/src/components/multiplayer/PlayerMiniPanel.tsx` | Displays basic teammate status card | `multiplayerStore` |
| Room notifications | `client/src/components/multiplayer/RoomNotifications.tsx` | Displays system notifications for spectator joining, character creation, formal introduction, etc. | `multiplayerStore` |
| Multiplayer game view | `client/src/components/multiplayer/MultiplayerGameView.tsx` | Assembles multiplayer layout: teammate list, unified narrative, interaction area, and round status | `multiplayerStore`, `usePMEngine` |

### 4.5 Modal Components

| Component | File | Primary Responsibility | Key State |
|------|------|----------|----------|
| Character creation wizard | `client/src/components/modals/CharacterCreationWizard.tsx` | Completes origin, background, attributes, skills, equipment, and confirmation flow; compatible with solo and multiplayer character preparation | `settingsStore`, `storybook runtime` |
| Settings modal | `client/src/components/modals/SettingsModal.tsx` | Manages LLM, TTS, STT, image generation, server, and game toggle configuration | `settingsStore`, `uiStore` |
| Save/Load modal | `client/src/components/modals/SaveLoadModal.tsx` | Manages solo character import, export, deletion, and loading | `characterListStore` |
| Backpack modal | `client/src/components/modals/BackpackModal.tsx` | Manages item viewing, equipping, using, discarding, and history display | `characterStore`, `usePMEngine` |

### 4.6 Shared Components

| Component | File | Primary Responsibility | Notes |
|------|------|----------|------|
| Error boundary | `client/src/components/shared/ErrorBoundary.tsx` | Catches subtree rendering errors and falls back to safe UI | Prevents localized panel exceptions from crashing the entire page |
| World sync notifications | `client/src/components/shared/WorldSyncNotifications.tsx` | Displays alerts for world day changes, encounter syncs, system pushes, etc. | Depends on `EventBus` and `SyncManager` |

---

## Planning

The current build passes 66 tests stably, with the main bundle kept at 383 kB, providing a solid engineering foundation for subsequent feature expansion.

## 6. v0.4 Increment

v0.4 landed 3 new stores, 2 new hook clusters, 4 UI shared components, a test reset utility, and organization optimizations across 6 modules. This section consolidates these architecture-level changes.

### 6.1 New Stores (3)

| Store | Purpose | Key commits |
|-------|---------|------------|
| `codexStore` | v0.4 Codex 6-category persistence + signature dedup | `c0664c6` |
| `combatStore` | v0.4 combat 5-phase state machine + ACT queue | v0.4 combat series |
| `itemRegistryStore` | v0.4 affix pool runtime registry | v0.4 item series |

See 2.2 table above for details.

### 6.2 New Hook Clusters (2 sets)

| Cluster | Files | Responsibility |
|---------|-------|----------------|
| **Codex cluster** | `useCodexInit.ts` | On startup, hydrate `codexStore` (read from localStorage) |
| **Memory cluster** | `useMemory.ts` + `useMemoryInit.ts` | 4 React subscription hooks (`useMemoryRecords` / `useMemoryRecordsByScope` / `useMemoryByEntitySync` / `useMemorySearch`) + settings sync hook |
| **Combat cluster** | `hooks/combat/*` (implicit) | Combat UI state machine hooks + QTE scheduling |

`usePMEngine` was split into 6 files before v0.4 (useDayTransition / useActionSubmit / usePMInitialization / useSceneFlow / useMultiplayerSync / shared.ts), with the upper `usePMEngine` becoming a thin facade aggregator. Recorded in section 2.3.

### 6.3 New UI Shared Components (4)

| Component | Reuse Scenario | Key commits |
|-----------|----------------|------------|
| `ItemChip` | Equipment slots / backpack / compare tooltip | `4ce7fdc` |
| `ItemCardRow` | BackpackModal item row | `4139362` |
| `ItemDetailPanel` | Backpack detail / forge (v0.6) | `2024aa0` |
| `ItemEffectList` | Effect list / affix rendering | `c311644` |

See `UI-Design-Specification-and-Improvement.md` section 11.2.

### 6.4 Test Infrastructure

- `tests/utils/resetStores.ts` — Utility for resetting all zustand stores between tests
- `vitest.config.ts` — Explicit `environment: 'jsdom'` + `setupFiles`
- `tests/setup.ts` — Mock `matchMedia` / `speechSynthesis` / `AudioContext` browser APIs

### 6.5 v0.4 Key Architecture Commits

```
c0664c6  codexStore
e34676b  codexSignature util
ecf4f5b  toast system
ac5d049  CodexModal + CodexEntry + useCodexInit
e379a86  applyConsequences + App top entry
1ed1059  types/memory.ts
a147c9f  useMemory hooks
577e226  MemoryEntry + MemoryModal
ba3fbe6  useActionSubmit + RightPanel + App + SocialPanel integration
+ v0.4 combat (combatStore / CombatEngine / 9 UI components)
+ v0.4 item (itemRegistryStore / affixPools data / 4 shared components)
+ v0.4 ui (tokens / ItemChip / ItemCardRow / ItemDetailPanel / ItemEffectList)
```

### 6.6 Known Architecture Debt (To Be Resolved After v0.4)

- `usePMEngine` orchestration layer still has ~130 un-split lines (mainly PM error handling + idle state machine) — future
- `applyConsequences` is still a God function; after v0.4 affix injection, line count grew; needs split into `applyItemsConsequences` / `applyStateConsequences` / `applyReputationConsequences` — v0.5
- `combatStore` and `combatEngine` have partial logic duplication (Engine encapsulates state progression, but store also holds state for UI sync) — future
- `itemRegistryStore` and `data/affixPools.ts` have overlapping responsibilities (runtime cache vs static data) — future
- `codexStore` and `codexSignature` 6 categories hardcoded (npc/item/event/location/faction/lore) should be configurable — future
- No HMR/hot-reload architecture; prompt template changes require restart — not yet implemented

## Current v0.4 Metrics

- **Tests**: 851 (v0.3 832 + v0.4 +19)
- **Stores**: 15 (v0.3 12 + v0.4 +3: codexStore / combatStore / itemRegistryStore)
- **Typecheck**: 0 errors
- **Lint**: 0 warnings
- **Build**: 585 modules, 1.02s


For AI-driven gameplay experiences, AutoPlay is expected to evolve from a single-path decision model to a multi-strategy system — adventurous, cautious, social, and other play styles coexisting, giving AI characters richer personality layers in interactions. For real-time sync, the plan is to replace HTTP polling with WebSocket, achieving lower-latency multiplayer collaboration. Mobile responsive adaptation will also be advanced so the interface naturally embraces touch interaction.

For globalization and offline capabilities, an internationalization framework will be built, implementing an English UI and multi-language prompt template system. Persistent storage will migrate from localStorage to IndexedDB, providing greater storage capacity and more structured data management. On this foundation, a Service Worker will be introduced, giving the client progressive offline capability.

In the long term, the goal is to deliver a Tauri desktop application with native-level performance and system integration. A plugin system will be built to open the door for third-party extensions, which will serve as the foundation for incubating a community mod marketplace — extending Aeslan's ecosystem from the development team to every player.
