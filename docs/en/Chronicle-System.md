# Chronicle System

## 1. Introduction

The Chronicle System is OpenTaleRunner's world narrative recording and aggregation mechanism. It records every adventure action (including judgment results) as structured logs and, when aggregation thresholds are met, invokes an LLM on the server side via the Grand PM to produce region-level world chronicle narratives.

The system follows an asynchronous pipeline: **client-side recording → batch upload at the end of a world day → server-side aggregation**. Logs that fail to upload during offline periods are automatically cached in `localStorage` and flushed on the next connection, ensuring no records are lost during network interruptions.

**Core Concepts:**

- **ChronicleRecorder**: An in-memory chronicle log buffer on the client that records judgment results and narrative output for all player actions.
- **World Day (`worldDay`)**: A server-wide shared logical date counter, advanced by the client's `startNewDay()`; the server aggregates logs by `worldDay`.
- **Grand PM**: The sole LLM invocation point on the server (`chronicle_engine.py`), which summarizes the day's player logs within a region into world chronicle entries in the tone of an official historian.
- **Offline Buffer**: When uploads fail, logs are automatically written to the `localStorage` key `aeslan-offline-logs` and flushed together once a subsequent upload succeeds.

This system is tightly coupled with the PM Engine (client-side narrative), the Multiplayer System (player interaction records), and the Architecture & Configuration (environment-variable thresholds) — see the cross-references at the end.

## 2. Design

### 2.1 ChronicleRecorder

**Source**: `client/src/services/chronicle/ChronicleRecorder.ts`

`ChronicleRecorder` is the sole in-memory chronicle log buffer on the client. The global singleton is initialized at `client/src/hooks/pmEngine/shared.ts:18`:

```ts
export const _chronicleRecorder = new ChronicleRecorder('player_local', 'Adventurer');
```

The constructor accepts `playerId` (default `'player_local'`) and `characterName` (default `'Adventurer'`), both of which can be rebound via `rebind()` after character loading.

**Public Methods:**

| Method | Signature | Description |
|---|---|---|
| `constructor` | `(playerId: string, characterName: string)` | Initializes an empty entry array and binds player identity |
| `rebind` | `(playerId, characterName, clearEntries?)` | Updates identity when switching characters; optionally clears the buffer |
| `recordEntry` | `(entry: Omit<ChronicleLogEntry, 'entryId'\|'playerId'\|'characterName'\|'syncStatus'>)` | Accepts a log with system fields stripped; auto-completes `entryId`/`playerId`/`characterName`/`syncStatus` |
| `getEntries` | `(worldDay?: number) → ChronicleLogEntry[]` | Filters by world day (returns a copy of all entries when no argument is given) |
| `getPendingEntries` | `() → ChronicleLogEntry[]` | Returns all entries where `syncStatus === 'pending'` |
| `getRecentEntries` | `(limit: number) → HistoryEntry[]` | Returns a condensed summary of the most recent N entries (for the history review UI) |
| `packDailyLogs` | `(worldDay: number) → ChronicleLogBatch` | Packs all pending entries for the given world day into an upload batch |
| `markSynced` | `(entryIds: string[]) → void` | Marks entries with the given IDs as `'synced'` |
| `toJSON` / `fromJSON` | `→ / ← ChronicleLogEntry[]` | Serializes / deserializes the entire buffer (for save persistence) |
| `countByDay` | `(worldDay: number) → number` | Counts log entries for the given world day |

**State Management**: Each entry maintains an independent `syncStatus` with possible values `'pending' | 'synced' | 'failed'`. Entries added via `recordEntry` default to `'pending'`; `packDailyLogs` only packs entries that are `pending` and match the world day; `markSynced` is called by the consumer after a successful upload to transition status in bulk.

### 2.2 ChronicleLogEntry

**Client type**: `client/src/types/chronicle.ts`  
**Server model**: `server/models/chronicle.py → ChronicleLogEntry`

Every time a player submits an action and receives a PM narrative, `useActionSubmit` constructs a `ChronicleLogEntry` with the following fields:

| Field | Type | Source / Description |
|---|---|---|
| `entryId` | `string` | Generated on the client by `generateId()`; stored server-side with `INSERT OR IGNORE` for deduplication |
| `playerId` | `string` | Bound by ChronicleRecorder; `'player_local'` in single-player mode |
| `characterName` | `string` | Current character name |
| `worldDay` | `number` | Server world day counter |
| `localDay` | `number` | Character's local day (used for vitality tracking; may diverge from `worldDay`) |
| `location.region` | `string` | Current region (e.g. `Royal Capital Plains`) |
| `location.subRegion` | `string` | Sub-region (e.g. `Southern Village`) |
| `location.coordinates` | `{x, y, z}` | Character's current coordinates |
| `action.summary` | `string` | Action text truncated to the first 80 characters |
| `action.playerChoice` | `string` | Full original player input |
| `action.wasCustomInput` | `boolean` | Whether this was custom input (currently always `true`) |
| `action.absurdityLevel` | `number` | Absurdity level (1–10), calculated by `estimateAbsurdity()` |
| `action.difficulty` | `number` | Difficulty level LC, mapped from absurdity by `absurdityToLC()` |
| `action.rollResult` | `string` | Judgment result (`critical_success` / `success` / `partial_success` / `failure` / `critical_failure`) |
| `action.rollDetail.dice` | `number[]` | Dice values (typically 2 d6) |
| `action.rollDetail.modifier` | `number` | Total attribute / skill / environment modifier |
| `action.rollDetail.total` | `number` | Final roll value (dice sum + modifier) |
| `action.rollDetail.dc` | `number` | Difficulty class (same as `difficulty`) |
| `narrativeOutput` | `string` | Full narrative text returned by the PM |
| `consequences` | `Record<string, unknown>` | Consequences object (hpChange / stateChanges / skillsLearned, etc.) |
| `timestamp` | `string` | ISO 8601 timestamp |
| `syncStatus` | `'pending' \| 'synced' \| 'failed'` | Sync status; maintained client-side only |

**Server-side differences**: The server-side `ChronicleLogEntry` (Pydantic model) does not include the `syncStatus` field; it is a client-internal state marker and is not persisted. The server uses `INSERT OR IGNORE` with `entryId` as the unique key to guarantee idempotency.

### 2.3 Server-side Aggregation (`chronicle_engine.py`)

**Source**: `server/services/chronicle_engine.py`

`ChronicleEngine` is the sole LLM invocation point on the server, serving as the "Grand PM". It performs aggregation in a **triggered** manner when client logs are received — no scheduled polling is required:

**Call Chain**:
```
POST /api/v1/chronicle/upload
  → chronicle_router.upload_chronicle()        # Persists logs + updates player activity
    → engine.aggregate_region(region, worldDay) # Triggered per region for each entry
```

**Aggregation Flow** (`aggregate_region(region, worldDay)`):

1. **Threshold Check**: `chronicle_repo.get_recent_by_region(region, worldDay)` queries the day's log count for the region. If it is `< CHRONICLE_AGGREGATE_MIN_LOGS` (env var, default `1`), returns `None` immediately — aggregation is skipped.
2. **Assemble Summary**: For each log, extracts `characterName`, `action.summary`, and `action.rollResult`, formatted as `- Name: Summary → Result`.
3. **Build Prompt**: `_build_prompt()` generates a roughly 300-token historian instruction, requesting 200–400 words of third-person epic narrative with a `#` title on the first line.
4. **LLM Call**: POSTs to `llm_endpoint`; model / temperature / max tokens are controlled by environment variables. Falls back to `_fallback_aggregate()` on failure or when no API Key is configured — outputs only the region event count.
5. **Parse Result**: The first line (with the `#` prefix stripped) becomes the title; the remaining text becomes the narrative body.
6. **Persist**: `INSERT OR REPLACE INTO world_chronicle`, keyed by `wc_{worldDay}_{region}` to ensure only the latest aggregation result per region per day is retained.

**Key Configuration** (`server/config.py`):

| Env Variable | Default | Description |
|---|---|---|
| `SERVICE_LLM_KEY` | — | LLM API Key (fallback enabled when empty) |
| `SERVICE_LLM_ENDPOINT` | `https://api.deepseek.com/chat/completions` | LLM endpoint |
| `SERVICE_LLM_MODEL` | `deepseek-chat` | Model name |
| `SERVICE_LLM_TEMPERATURE` | `0.7` | LLM temperature |
| `SERVICE_LLM_MAX_TOKENS` | `2048` | Maximum output tokens |
| `CHRONICLE_AGGREGATE_MIN_LOGS` | `1` | Minimum log count to trigger aggregation |

**Data Tables**:

- `chronicle_entries` — Raw logs, keyed by `entryId`, deduplicated via `INSERT OR IGNORE`
- `world_chronicle` — Aggregated chronicle narratives, keyed by `wc_{worldDay}_{region}`

### 2.4 World Day Advancement (`startNewDay`)

**Source**: `client/src/hooks/pmEngine/useDayTransition.ts`

`startNewDay()` is the player's "rest / end day" action. The full flow is as follows:

```
startNewDay()
  ├─ game.setDay(currentDay + 1)          # World day +1
  ├─ game.setDiceResult(null)             # Clear previous dice result
  ├─ game.addDayDivider(newDay)            # Insert day divider into message stream
  ├─ character.updateVital(...)            # Restore fatigue / hunger / hygiene / morale
  ├─ character.updateHP(...)              # Restore 5 HP (capped at maxHp)
  ├─ game.addMessage(system, 'After a night's rest...')  # System message
  │
  ├─ packDailyLogs(game.currentDay)       # Pack all pending logs for the day
  ├─ [if logs exist] uploadChronicle (3 retries)   # → See 2.5
  └─ requestScene()                       # Pull the scene for the new day
```

**Restoration Values**: `{ fatigue: -30, hunger: +10, hygiene: +5, morale: +5 }`; HP restored by 5 (capped at `maxHp`).

**Timeline Divergence**: Each character's `localDay` (used for vitality tracking) and `worldDay` (used for chronicle aggregation) are allowed to diverge. The server aggregates by `worldDay`; different players may be at different `worldDay` values — fast-paced players reach higher world days earlier, while slower-paced players catch up later.

### 2.5 Upload Retry Mechanism

Uploads occur inside `startNewDay()` with **3 retries + exponential backoff**:

| Retry | Backoff Delay |
|---|---|
| 1st failure | Retry immediately (no delay) |
| 2nd failure | Retry after 2 s |
| 3rd failure | Retry after another 2 s (4 s cumulative) → final attempt → if still failed, write to offline buffer |

**Success Path** (when a retry succeeds):
```
uploadChronicle(batch) ✅
  → Attempt to flush localStorage offline buffer
    → Buffer exists: pack as offlineBatch, call uploadChronicle → delete localStorage key
    → No buffer / flush fails: silently continue
```

**Failure Path** (all 3 retries fail):
```
uploadChronicle(batch) ❌
  → 3rd attempt still fails
    → Read localStorage 'aeslan-offline-logs'
    → Merge failed entries [existing, ...batch.entries]
    → Write back to localStorage
```

Backoff delay uses `setTimeout(r, 2000 * (retry + 1))`, i.e. retry 0 (no delay), retry 1 (2 s), retry 2 (4 s).

### 2.6 Offline Buffer (`localStorage`)

**Key**: `aeslan-offline-logs`  
**Format**: JSON-serialized array of `ChronicleLogEntry[]`  
**Write trigger**: After 3 failed upload attempts  
**Read trigger**: Immediately after the next successful upload (flush)  
**Delete trigger**: After a successful flush, `localStorage.removeItem('aeslan-offline-logs')`

The offline batch constructed during flushing reuses the same `playerId` and `lastWorldDay`:

```ts
const offlineBatch = {
  playerId: batch.playerId,
  entries,
  lastWorldDay: game.currentDay
};
await api.uploadChronicle(offlineBatch);
localStorage.removeItem('aeslan-offline-logs');
```

A failed flush (network issue or server error) does not block the main flow; it is silently ignored, and offline entries remain for the next upload attempt.

### 2.7 Call Sites & API Examples

#### Call Site: `useActionSubmit` (after every PM narrative)

**Source**: `client/src/hooks/pmEngine/useActionSubmit.ts:304-329`

```typescript
_chronicleRecorder.recordEntry({
  worldDay: game.currentDay,
  localDay: charData.currentLocalDay,
  location: {
    region: game.currentRegion,
    subRegion: game.currentSubRegion,
    coordinates: game.coordinates,
  },
  action: {
    summary: action.slice(0, 80),
    playerChoice: action,
    wasCustomInput: true,
    absurdityLevel: absurdity,
    difficulty: lc,
    rollResult: diceOutcome,
    rollDetail: {
      dice: diceValues,
      modifier: diceModifier,
      total: diceFinal,
      dc: lc,
    },
  },
  narrativeOutput: narrative.narrative,
  consequences: narrative.consequences,
  timestamp: new Date().toISOString(),
});
```

Every player action submission → PM returns narrative → `recordEntry` is constructed. `entryId` / `playerId` / `characterName` / `syncStatus` are auto-completed internally by `ChronicleRecorder`.

#### API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/chronicle/upload` | Batch-upload chronicle logs (`ChronicleLogBatch`); triggers aggregation |
| `POST` | `/api/v1/chronicle/upload/single` | Upload a single log entry (lightweight fast path; does not trigger aggregation) |
| `GET` | `/api/v1/world/chronicle?day=N` | Query chronicle for the given world day |
| `GET` | `/api/v1/world/chronicle/latest` | Query the 5 most recent chronicle entries |
| `GET` | `/api/stats/chronicle?day=N&region=X` | Dashboard stats: browse chronicles by world day and region |

## 3. Roadmap

The goal is to implement an incremental sync mechanism, replacing the current "batch upload at end of world day" with immediate push on every record, narrowing the data-loss risk window so that every chronicle entry lands in real time. Concurrently, a conflict-merge capability will be introduced so that when offline buffer flushes and normal uploads race, the server can intelligently deduplicate and ensure world history is not contaminated by duplicate records. Backoff strategies and retry parameters will also be elevated from hard-coded values to configurable items accommodating different network environments.

On this foundation, a cross-world chronicle system will be explored — each game world holds its own independent chronicle volume, so new players joining a new world do not carry the full historical memory of a previous world. Cross-world narrative references will also be supported, allowing a ruin in the second world to gracefully allude to the legend of the first world's hero, providing a data skeleton for inter-world foreshadowing. Chronicle snapshots will be generated at intervals of several world days, serving as world-state checkpoints to support "time rewind" narrative needs.

In the long term, the chronicle system is expected to be opened to the community — upgrading from request-driven aggregation to an event-queue-driven asynchronous engine where logs are enqueued on persist, making the Grand PM's workflow more robust. The community dashboard will support visualization dimensions such as timeline scrolling, region heatmaps, and player contribution rankings. A read-only Public API will be opened to allow community tools and websites to consume world chronicle data and build third-party timelines. Ultimately, world-line branching will be supported, allowing the same region on the same day to hold multiple versions of chronicle narratives distinguished by branch IDs, truly placing the world's fate in the hands of the players.

## Cross-References

| Related System | Document | Relationship |
|---|---|---|
| PM Engine | `docs/PM-Engine-and-Prompt-System.md` | `_chronicleRecorder.recordEntry()` is called after every PM narrative; Prompt world layer injects `recentChronicle` context |
| Multiplayer | `docs/Multiplayer-System.md` | Multiplayer mode logs share `ChronicleRecorder`; Ghost NPCs are generated from uploaded chronicle logs |
| Architecture & Configuration | `docs/Architecture-and-Configuration.md` | `CHRONICLE_AGGREGATE_MIN_LOGS` threshold definition; server-side layered architecture (Router → Engine → Repo) |
| Judgment System | `docs/Judgment-System.md` | Judgment results (`rollResult`, `rollDetail`) are recorded as core fields of log entries |
| World Setting | `docs/World-Setting-Aeslan.md` | Region divisions and spawn-point rules form the regional dimension basis for chronicle aggregation |
| API Reference | `docs/API-Reference.md` | Complete list of chronicle route endpoints and environment variables |
| Server Deployment | `docs/Server-Deployment-and-Development-Guide.md` | `SERVICE_LLM_KEY` configuration; chronicle log channel description |
| Client Architecture | `docs/Client-Architecture-and-Mechanisms.md` | Call site and context of chronicle recording within the `usePMEngine` orchestration layer |
| GameRuleEngine | `docs/GameRuleEngine-Middleware-Design.md` | One of the downstream consumers of the consequence application chain (`consequences`) |
