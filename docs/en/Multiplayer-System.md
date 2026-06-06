# Multiplayer System Design Document

> Aeslan multiplayer mode design. Supports 1–10 players adventuring together in the same room, sharing a unified party-action abstraction with single-player async / real-time sync modes.

---

## 1. Introduction

### 1.1 What It Is

The Multiplayer System allows 2–10 players to adventure cooperatively in a single game room. Each player independently controls their own character and submits actions on a turn-based schedule. Once all players in a round have acted (or skipped), the server aggregates actions and invokes the multiplayer PM engine to generate a unified narrative result, which is broadcast to all clients.

### 1.2 Core Concepts

| Concept | Description |
|---|---|
| **Room** | An independent game session created by the host. Each room has a unique snowflake ID |
| **Round** | All players submit actions → GM generates narrative → consequences applied → proceed to next round |
| **Slot** | When inheriting a save, predefined character slots must be claimed by real players before the game can start |
| **Spectating** | Players joining mid-game first enter as spectators and are introduced by the GM once conditions are met |
| **Heartbeat** | The client reports online status to the server every 30 seconds |

### 1.3 Key Design Decisions

| Decision | Description |
|---|---|
| Host-local saves | Multiplayer saves are stored locally by the host client (localStorage) and not uploaded to the server |
| Save isolation | Multiplayer saves are for multiplayer mode only; single-player saves cannot be directly used in multiplayer |
| Save inheritance | When creating a room, a player can choose to inherit an existing multiplayer save to resume previous progress |
| Forced partying | V1 does not allow players to explore separately; all players remain in party formation |
| Action-round sync | Each round only advances once all players have completed their actions (or skipped) |
| Independent inventories | Each player's character attributes, inventory, and status are fully independent |
| Async fault tolerance | Supports temporary player disconnection with reconnection recovery |

---

## 2. Design

### 2.1 Room Lifecycle

#### Creating a Room

```
Host: POST /api/v1/multiplayer/rooms { mode: "new"|"inherit", config: RoomConfig }
  |
  ├─ mode="new": Fresh start
  │    └─ Server creates empty room (phase="waiting")
  │
  └─ mode="inherit": Inherit save
       └─ Upload character data from save → Server creates room + loads character slots
            └─ Host automatically claims the matching character slot
```

**RoomConfig fields**: Room name (1–30 chars), Max players (1–10), Password (≥ 4), Difficulty (-5 to +5), Round timeout (60–600 s), Recovery multiplier (0.5–2.0), Narrative style, Language preference, Death penalty, Spectator delay (1–5 rounds)

#### Joining a Room

```
Player: POST /api/v1/multiplayer/rooms/{id}/join { password?, claimed_slot_id? }
  |
  ├─ phase="waiting" → Enter waiting lobby
  │    ├─ mode="inherit": Can claim a specific slot or auto-assign the first unclaimed slot
  │    └─ mode="new": Begin character creation
  │
  └─ phase="playing" + allow_late_join=true → Join as spectator
       └─ phase="playing" + allow_late_join=false → Reject (game already started)
```

#### Starting the Game

The host confirms all players are ready and clicks "Start Game":
- Fresh start: The GM reads all player backgrounds and generates a unified origin story and common starting location
- Inherited save: Directly loads the save's world state and starting location

#### Leaving & Destruction

- Player leaves → Releases the claimed character slot
- Last player leaves → Room auto-deleted
- Host leaves with remaining players → Host transferred to the first remaining player
- All players offline and room idle > 30 min → Auto-deleted
- Waiting-phase room older than 24 h → Auto-deleted

### 2.2 Round System

#### Action Submission Flow

```
Each player:
  1. Enter action text (1–2000 characters)
  2. Client rolls dice locally → generates diceResult
  3. POST /api/v1/multiplayer/rooms/{id}/action { action, dice_result? }
  4. Server records action and dice result, marks player as "acted"

After all players have acted (or skipped):
  1. Client detects pendingPlayers.length === 0
  2. Calls POST /api/v1/multiplayer/rooms/{id}/round-process
  3. Server: conflict_detector → multiplayer_pm.generate_narrative() → returns RoundResult
  4. Each client: syncRoundResultMessages() → applyConsequences() → proceed to next round
```

#### Skip

```
POST /api/v1/multiplayer/rooms/{id}/action-skip
  → Equivalent to submitting action="Skip"
```

#### Round State Polling

| Poll | Interval | Content |
|---|---|---|
| Room Poll | 5 s | Overall room state (phase, players, slots) |
| Round Poll | 3 s | Current round state (players_acted, pending_players, actions, dice_results) |

The client automatically detects: when `pendingPlayers.length === 0` and local `lastProcessedRound < currentRound`, it automatically triggers `processRound`.

### 2.3 Player Management

#### Player States

| State | Meaning |
|---|---|
| `waiting` | In the waiting lobby; character creation not yet complete |
| `ready` | Character ready (inherit mode: slot claimed) |
| `in_game` | In-game, participating in action rounds |
| `spectating` | Mid-game join; spectating |
| `pending_intro` | Spectator has completed character creation; awaiting GM introduction |
| `disconnected` | Heartbeat timeout (marked offline after 90 s of no heartbeat) |

#### Spectator Introduction

```
Spectator joins → status="spectating", joined_at_round = current_round
  │
  ├─ Complete character creation (spectator_ready) → status="pending_intro"
  │
  └─ On each round's process_round check:
       rounds_waited = current_round - joined_at_round + 1
       If rounds_waited >= late_join_intro_delay → introduce
         status="in_game", generate introduced_players notification
```

#### Host Transfer

When the host leaves, the first remaining player automatically becomes the new host (implemented by delete + re-insert of the room row).

### 2.4 Sync Mechanism

#### Client Polling Architecture

```
startHeartbeat()     → Every 30 s: POST /heartbeat
startRoomPoll()      → Every 5 s:  GET /rooms/{id} → syncRoomSnapshot()
startRoundPoll()     → Every 3 s:  GET /rooms/{id}/round-status → updateRoundStatus()
startRealtimeSync()  → Every 30 s: PUT /sync/session (single-player mode)
```

#### Reconnect Mechanism (ReconnectService)

- Listens for `online` / `offline` browser events
- Exponential backoff retry after disconnection: `delay = max(15000, 2000 * (attempts + 1))`
- After reconnection: fetch room state → fetch round state → pull missing narrative history → sync messages to gameStore

#### Single-Player Real-time Sync

Independent of multiplayer rooms: uploads character location / region / action / status every 30 s; polls nearby online players for Ghost NPC display.

### 2.5 GM Integration

#### Multiplayer Narrative Generation (`multiplayer_pm.py`)

```
process_round() triggers:
  1. conflict_detector.detect() → Detect player action conflicts (target conflicts)
  2. multiplayer_pm.generate_narrative():
     - Build Prompt: world_day + round + location + party_members + actions + conflicts
     - Call LLM (same configuration as the server)
     - Extract <consequences> JSON block
  3. Generate RoundResult:
     {
       narrative: "Unified narrative text",
       consequences: { playerId: { hpChange, itemsGained, stateChanges } },
       world_state_changes: [],
       introduced_players: [...],
       next_round: N+1
     }
```

#### Consequence Application (Client-side)

```
syncRoundResultMessages() → Build Message objects
  ├─ round_summary (player actions + dice)
  ├─ pm (narrative text)
  └─ system (introduced player notification)

applyMultiplayerConsequenceIfNew() → Dedup check → applyConsequences()
  └─ Directly modify local character state (HP / items / status)
```

### 2.6 Server Architecture

```
routers/multiplayer_router.py  (HTTP endpoints, 18 total)
    │
    v
services/multiplayer_service.py  (Business logic, room locks, round orchestration)
    │                    │
    v                    v
repositories/           services/multiplayer_pm.py
multiplayer_repo.py     (LLM narrative generation)
(SQLite data access)
```

#### Room-Level Locking

All critical operations (join / leave / submit / process) use `asyncio.Lock` for concurrency safety, with double-checked locking on join operations.

#### Background Tasks

| Task | Period | Description |
|---|---|---|
| Heartbeat check | 30 s | Mark offline (> 90 s), auto-skip timed-out actions, remove long-offline players, clean up empty rooms |
| Waiting cleanup | 30 s | Auto-delete waiting rooms idle for > 24 h |

#### Database

| Table | Description |
|---|---|
| `multiplayer_rooms` | Room config, state, actions, dice, character slots, narrative history, notifications (JSON columns) |
| `room_player_sessions` | Per-player session data (state, heartbeat, character info) |

### 2.7 Client Architecture

```
hooks/pmEngine/useMultiplayerSync.ts
  └─ hydrateMultiplayerScene()  ← Called when entering multiplayer mode
  └─ syncRoundResultMessages()  ← Round result synchronization
  └─ applyMultiplayerConsequenceIfNew()  ← Consequence application

hooks/pmEngine/useActionSubmit.ts
  └─ submitAction()  ← Branch: multiplayer mode vs single-player mode

services/multiplayer/MultiplayerAPI.ts
  └─ 18 API functions (createRoom / joinRoom / submitAction / ...)

services/sync/HttpClient.ts
  └─ request<T>()  ← Unified HTTP client (base URL + auth injection)
```

### 2.8 API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/multiplayer/rooms` | Create room |
| `GET` | `/multiplayer/rooms/{id}` | Get room state |
| `POST` | `/multiplayer/rooms/{id}/join` | Join room |
| `POST` | `/multiplayer/rooms/{id}/leave` | Leave room |
| `POST` | `/multiplayer/rooms/{id}/heartbeat` | Heartbeat |
| `POST` | `/multiplayer/rooms/{id}/claim-slot` | Claim character slot |
| `POST` | `/multiplayer/rooms/{id}/release-slot` | Release character slot |
| `POST` | `/multiplayer/rooms/{id}/character-ready` | Mark character ready |
| `POST` | `/multiplayer/rooms/{id}/generate-common-backstory` | Generate common backstory |
| `POST` | `/multiplayer/rooms/{id}/start` | Start game |
| `POST` | `/multiplayer/rooms/{id}/action` | Submit action |
| `POST` | `/multiplayer/rooms/{id}/action-skip` | Skip this round |
| `GET` | `/multiplayer/rooms/{id}/round-status` | Round status |
| `POST` | `/multiplayer/rooms/{id}/round-process` | Trigger round resolution |
| `GET` | `/multiplayer/rooms/{id}/narratives?since_round=N` | Get narrative history |
| `GET` | `/multiplayer/rooms/{id}/notifications?since_round=N` | Get notifications |
| `POST` | `/multiplayer/rooms/{id}/spectator-ready` | Spectator ready |
| `POST` | `/multiplayer/rooms/{id}/save` | Save (host only) |

---

## 3. Roadmap

### 3.1 Current Limitations

| Limitation | Description |
|---|---|
| No WebSocket | All synchronization relies on HTTP polling; latency of 3–5 s |
| No PvP | Direct conflict interaction between players is not supported |
| In-memory locks only | Room locks are single-process `asyncio.Lock`; multi-worker deployment is not supported |
| Host-only saves | Multiplayer saves can only be saved by the host client; other players cannot save independently |
| Simplified conflict detection | Only `target_conflict` type is detected; `space_conflict` / `causal_conflict` are not implemented |
| No room listing | No public room browsing / searching; rooms can only be joined by ID |
| Pure spectating unimplemented | `allowSpectators` config exists but is not in effect; spectators must intend to join the game |

### 3.2 Future Plans

The goal is to introduce a WebSocket real-time sync mechanism, reducing state sync latency from seconds-level polling to millisecond-level push, so that every player's actions are instantly reflected across all clients in the same room. A distributed locking solution will then be adopted, paving the way for server-side multi-worker horizontal scaling and supporting larger-scale concurrent rooms and a more stable online experience.

A full PvP conflict system is expected — building on the existing PvE cooperation foundation, introducing adversarial interactions between players and progressively expanding from simple target conflicts to full-dimensional coverage of spatial conflicts and causal conflicts. Simultaneously, a public room browsing feature will go live, allowing players to search, filter, and discover rooms that are waiting for adventuring partners, lowering the barrier to forming parties.

Pure spectator mode will be realized, allowing interested players to enter any public room as observers without bearing the burden of gameplay participation. The forced-party restriction will be further decoupled, allowing party members to freely separate and explore within safe zones, enjoying more flexible movement space and narrative possibilities.

The plan is to migrate the database from SQLite to PostgreSQL, fully leveraging its row-level locking, concurrent writes, and advanced indexing capabilities to support higher-concurrency multiplayer online experiences and data reliability guarantees.
