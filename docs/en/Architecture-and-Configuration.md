# Architecture and Configuration Overview

> Covers client architecture, server architecture, and complete configuration items. For developer and deployer reference.

---

## Client Architecture

### Layered Design

```
┌─────────────────────────────────────────────────┐
│ UI Layer (components/)                            │
│   App.tsx, InteractionArea, panels, modals        │
├─────────────────────────────────────────────────┤
│ Hooks Layer (hooks/)                              │
│   usePMEngine, useAutoPlay, useVoiceInput         │
├─────────────────────────────────────────────────┤
│ Stores Layer (stores/)         Zustand + persist  │
│   gameStore, characterStore, worldStore,          │
│   settingsStore, multiplayerStore, partyStore ... │
├─────────────────────────────────────────────────┤
│ Services Layer (services/)   Stateless / pure logic │
│   engine/PMEngine, judgment/, sync/,             │
│   tts/, image/, crypto/, event/, activity/       │
├─────────────────────────────────────────────────┤
│ LLM / TTS / Image APIs (called directly from client) │
│   DeepSeek / OpenAI / MiMo / Anthropic / Edge    │
└─────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Description |
|---|---|
| **Client-side AI** | The server does not run game LLM. All AI (PM narration, NPC dialogue, AutoPlay) runs on the client using the user's own API key. |
| **Server is data-only** | FastAPI provides REST APIs: world state, character saves, chronicles, NPC registration, multiplayer room coordination. |
| **Unified action pipeline** | Whether manual, voice, or AutoPlay, all actions flow through `usePMEngine.submitAction()` → judgment → PM request → consequence application → save. |
| **Zustand persistence** | settingsStore is encrypted to localStorage (AES-256-GCM). API keys are never stored in plaintext on disk. |
| **Event bus** | 14 event types, loosely-coupled communication between components (SCENE_LOADED, DICE_ROLLED, NARRATIVE_RECEIVED, etc.). |

### Security Features

| Feature | Implementation | File |
|---|---|---|
| API Key encrypted storage | AES-256-GCM + PBKDF2 + device-unique seed | `services/crypto/CryptoService.ts` |
| Prompt injection protection | 10 regex sanitization patterns (`###`, ` ```json `, `<system>`, `ignore previous instructions`, etc.) | `services/security/sanitize.ts` |
| XSS output filtering | DOMPurify, whitelist tags (b/i/em/strong/br/p/ul/ol/li/span) | `services/security/sanitize.ts` |
| Debug logging | 12 categories (GM/HTTP/TOOL/PM/TTS...), IndexedDB persistence, browser Console API | `services/logging/` |

### Complete Client Configuration

All settings are persisted in `settingsStore`. Sensitive fields (`apiKey`) are encrypted via CryptoService.

#### LLM Configuration (`llm` / `autoPlayLLM`)

| Setting | Default | Description |
|---|---|---|
| `provider` | `'deepseek'` | `'openai' \| 'deepseek' \| 'mimo' \| 'anthropic' \| 'ollama' \| 'custom'` |
| `apiKey` | `''` | Encrypted storage |
| `endpoint` | `https://api.deepseek.com/chat/completions` | Configurable custom-compatible endpoint |
| `model` | `deepseek-chat` | Model identifier |
| `temperature` | 0.8 (main) / 0.7 (AutoPlay) | |
| `maxTokens` | 4096 (main) / 1024 (AutoPlay) | |
| `autoPlayUseSeparateConfig` | false | When true, AutoPlay uses independent `autoPlayLLM` config |

#### TTS Configuration (`tts`) — Text-to-Speech

| Setting | Default | Description |
|---|---|---|
| `ttsEnabled` | false | Master switch |
| `provider` | `'openai'` | `'openai' \| 'edge' \| 'mimo' \| 'custom'` |
| `apiKey` | `''` | Encrypted storage |
| `endpoint` | `https://api.openai.com/v1/audio/speech` | |
| `model` | `tts-1` | |
| `voice` | `'onyx'` | |
| `speed` | 1.0 | |
| `npcIndependentVoice` | false | NPC independent voice switch |

#### Image Generation (`imageGen`)

| Setting | Default |
|---|---|
| `imageGenEnabled` | false |
| `provider` | `'openai'` (`'sd' \| 'custom'`) |
| `endpoint` | `https://api.openai.com/v1/images/generations` |
| `model` | `dall-e-3` |
| `size` | `'1024x1024'` |
| `quality` | `'standard'` |

#### STT (`stt`) — Speech-to-Text

| Setting | Default |
|---|---|
| `provider` | `'browser'` (Web Speech API) |
| `language` | `'zh-CN'` |

#### Experimental Features (`experimental`)

| Switch | Description |
|---|---|
| `enableTokenBudget` | Token budget management, allocates prompt space by priority |
| `enableStructuredLocation` | Structured location data |
| `enableHistoryCompression` | Conversation history compression (reduces token consumption) |
| `enablePromptOverrides` | Prompt template overrides |
| `enableSystemHooks` | Game hook system (time/rest/combat/environment, 17 rules) |
| `enableContextMerge` | Context merging (exists but not enabled) |

#### Prompt Budget (`promptBudget`)

| Setting | Default | Description |
|---|---|---|
| `enabled` | true | Enable budget management |
| `maxInputTokens` | 0 | Max input tokens (0 = no limit) |
| `safetyMargin` | 0.9 | Safety margin ratio |
| `responseReserve` | 1024 | Tokens reserved for response |

#### Server Connection (`server`)

| Setting | Default |
|---|---|
| `endpoint` | `http://localhost:8000` |
| `autoSyncInterval` | 15 (minutes) |
| `syncOnExit` | true |

#### Debug Logging (`debug`) — Added in v0.3

| Setting | Default | Description |
|---|---|---|
| `enabled` | false | Master switch |
| `logLevel` | `'info'` | Minimum level: `debug\|info\|warn\|error` |
| `categories` | `['SYSTEM','ERROR']` | Enabled log categories |
| `persistToIndexedDB` | false | Persist to IndexedDB |

#### UI

| Setting | Default |
|---|---|
| `diceType` | `'2d6'` |
| `language` | `'zh-CN'` |
| `enableStreaming` | true |
| `fontSize` | `'medium'` |
| `theme` | `'dark'` |

---

## Server Architecture

### Directory Structure

```
server/
├── main.py                     # FastAPI entry point + lifecycle management
├── config.py                   # Environment variable configuration
├── logging_config.py           # Logging system (RotatingFileHandler)
├── run.py                      # Main API startup script
├── run_dashboard.py            # Dashboard startup script
│
├── db/                         # Database layer
│   ├── database.py             # Database abstract class + SQLite implementation
│   ├── schema.py               # DDL (21 tables)
│   └── seed.py                 # JSON seed data loader
│
├── models/                     # Pydantic models
│   ├── auth.py                 # RegisterRequest, TokenResponse
│   ├── character.py            # CharacterCreate
│   ├── chronicle.py            # ChronicleLogBatch
│   ├── npc.py                  # NPCRegisterRequest
│   ├── multiplayer.py          # CreateRoomRequest, SubmitActionRequest
│   └── common.py               # ErrorResponse
│
├── repositories/               # Data access layer (interface + SQLite impl)
│   ├── player_repo.py          # Player CRUD
│   ├── character_repo.py       # Character CRUD
│   ├── chronicle_repo.py       # Chronicle logs
│   ├── npc_repo.py             # NPC registration / relationships
│   ├── world_repo.py           # World state / chronicles
│   ├── encounter_repo.py       # Encounters / Ghost NPCs
│   └── multiplayer_repo.py     # Multiplayer rooms / sessions
│
├── services/                   # Business logic layer
│   ├── chronicle_engine.py     # Grand-PM chronicle aggregation (only server-side LLM call)
│   ├── conflict_detector.py    # Multi-player conflict detection
│   ├── ghost_manager.py        # Ghost NPC TTL management
│   ├── npc_service.py          # NPC templates / registration / promotion
│   ├── event_generator.py      # Event template generation
│   ├── terrain_service.py      # Terrain / weather / water / roads
│   ├── multiplayer_service.py  # Multiplayer room lifecycle
│   ├── multiplayer_pm.py       # Multiplayer narrative generation
│   └── token_blacklist.py      # JWT blacklist
│
├── routers/                    # HTTP routes (thin layer, no business logic)
│   ├── deps.py                 # Dependency injection factories (get_db, get_current_player)
│   ├── auth_router.py          # /api/v1/auth/*
│   ├── storybook_router.py     # /api/v1/storybook/*
│   ├── world_router.py         # /api/v1/world/*
│   ├── character_router.py     # /api/v1/characters/*
│   ├── chronicle_router.py     # /api/v1/chronicle/*
│   ├── sync_router.py          # /api/v1/sync/*
│   ├── encounter_router.py     # /api/v1/encounters/*
│   ├── npc_router.py           # /api/v1/npcs/*
│   ├── event_router.py         # /api/v1/events/*
│   ├── activity_router.py      # /api/v1/activity/*
│   └── multiplayer_router.py   # /api/v1/multiplayer/*
│
├── dashboard/                  # Dashboard (standalone FastAPI app)
│   ├── main.py                 # Port 8081
│   ├── stats_api.py            # /api/stats/* (11 stats endpoints)
│   └── static/index.html       # Dashboard frontend page
│
└── data/                       # Data and seed files
    ├── storybook.json          # Storybook data
    └── npc_templates.json      # NPC templates
```

### Layered Architecture

```
Router (thin layer, handles HTTP only)
    │  Parse request → Call Service → Return JSON
    ▼
Service (business logic layer)
    │  Depends on Repository interface, not on concrete database
    ▼
Repository (data access interface + implementation)
    │  SqliteXxxRepo → replaceable with PostgresXxxRepo in future
    ▼
Database (connection management)
       SQLite (current) → PostgreSQL (future expansion)
```

### Ports

| Port | Purpose | Auth |
|---|---|---|
| 8000 | Main API (game data, multiplayer) | JWT |
| 8081 | Dashboard (world overview, stats) | None (public read-only) |

### Background Tasks

| Task | Interval | Description |
|---|---|---|
| Chronicle aggregation | 3600s | Aggregates client-uploaded logs to generate world chronicles, advances world day |
| Ghost NPC cleanup | 3600s | Cleans up ghost NPCs exceeding the 2-day TTL |
| Online status cleanup | 30s | Marks players offline if no heartbeat for >90s |
| Multiplayer room heartbeat check | 30s | Marks offline players, auto-skips timed-out actions, cleans up empty rooms |
| Token blacklist cleanup | 600s | Cleans up expired JWT blacklist entries |

### Complete Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SERVICE_JWT_SECRET` | **Required** | JWT signing secret. Generate with `openssl rand -hex 32` for production. |
| `SERVICE_PORT` | 8000 | API port |
| `SERVICE_DB_PATH` | `./data/aeslan.db` | SQLite database path |
| `SERVICE_DATA_DIR` | `./data` | Seed data directory |
| `SERVICE_JWT_EXPIRE_HOURS` | 72 | Token validity (hours) |
| `SERVICE_LLM_KEY` | — | Server-side LLM key (for chronicle aggregation) |
| `SERVICE_LLM_ENDPOINT` | `https://api.deepseek.com/chat/completions` | LLM endpoint |
| `SERVICE_LLM_MODEL` | `deepseek-chat` | LLM model |
| `SERVICE_LLM_TEMPERATURE` | 0.7 | LLM temperature |
| `SERVICE_LLM_MAX_TOKENS` | 2048 | Max tokens |
| `SERVICE_CORS_ORIGINS` | `localhost:5173,localhost:3000` | CORS whitelist |
| `SERVICE_RATE_LIMIT` | 60 | Rate limit (requests per window) |
| `SERVICE_RATE_WINDOW` | 60 | Rate window (seconds) |
| `SERVICE_LOG_ENABLED` | true | Logging enabled |
| `SERVICE_LOG_LEVEL` | INFO | DEBUG/INFO/WARNING/ERROR |
| `SERVICE_LOG_DIR` | `./logs` | Log file directory |
| `SERVICE_LOG_FORMAT` | text | text/json |
| `SERVICE_LOG_MAX_BYTES` | 10485760 (10MB) | Max single log file size |
| `SERVICE_LOG_BACKUP_COUNT` | 7 | Number of backup files to retain |
| `CHRONICLE_AGGREGATE_MIN_LOGS` | 1 | Minimum logs to trigger chronicle aggregation |
| `STORYBOOK_PATH` | `./data/storybook.json` | Storybook path |

### Database Table Overview

21 tables total:

| Table | Purpose | Key Columns |
|---|---|---|
| `players` | Registered players | `id` (PK), `username` (UNIQUE), `password_hash` |
| `characters` | Character data | `id` (PK), `player_id` (FK), `data` (JSON), `region`, `world_day` |
| `chronicle_entries` | Client chronicle logs | `id` (PK), `player_id`, `world_day`, `region`, `data` (JSON) |
| `world_chronicle` | Aggregated world chronicles | `id` (PK), `world_day`, `region`, `title`, `narrative` |
| `world_state` | Per-region world state | `region_id` (PK), `weather`, `current_events` (JSON), `faction_data` (JSON) |
| `world_meta` | KV config (world day, storybook) | `key` (PK), `value` |
| `npc_registry` | All NPCs | `id` (PK), `name`, `region`, `data` (JSON), `promoted` |
| `npc_relationships` | Player-NPC relationships | `npc_id`+`player_id` (PK), `attitude`, `level`, `history` (JSON) |
| `encounters` | Encounter instances | `id` (PK), `type`, `involved_players` (JSON), `region`, `resolved` |
| `ghost_npcs` | Ghost NPCs (2-day TTL) | `id` (PK), `player_id`, `appearance`, `region`, `expires_at` |
| `milestones` | Milestone tracking | `id` (PK), `name`, `status`, `unlocked_at` |
| `event_templates` | Event templates | `id` (PK), `name`, `level`, `region`, `trigger_conditions` (JSON) |
| `event_instances` | Triggered event instances | `id` (PK), `template_id` (FK), `status`, `participants` (JSON) |
| `player_activity` | Player activity / online status | `player_id` (PK), `current_action`, `region`, `is_online` |
| `activity_history` | Activity history log | `id` (auto), `entity_id`, `action_summary`, `world_day` |
| `terrain_grid` | Map grid | `region`+`x_min`+`y_min`+`z_min` (PK), `terrain_type` |
| `daily_weather` | Daily weather cache | `region`+`world_day` (PK), `weather`, `temperature`, `wind` |
| `water_bodies` | Water bodies | `id` (PK), `type`, `name`, `region`, `path` (JSON) |
| `roads` | Roads | `id` (PK), `name`, `region`, `from_loc`, `to_loc`, `path` (JSON) |
| `multiplayer_rooms` | Multiplayer rooms | `room_id` (PK), `host_player_id`, `config_json`, `state_json` |
| `player_realtime_sessions` | Solo real-time sessions | `player_id` (PK), `region`, `coordinates`, `is_online` |

Full DDL available in git history: `server/db/schema.py`.

---

---

## Planning

### Client

On the AutoPlay strategy front, the plan is to evolve from a single decision model to a multi-strategy AI system — adventurous, cautious, social and other play styles coexisting, enabling AI characters to exhibit richer behavioral diversity.

For real-time sync, the plan is to replace the current HTTP polling mechanism with WebSocket persistent connections, reducing sync latency to sub-second levels and laying the foundation for multiplayer collaboration and immediate event response.

On the frontend experience side, mobile responsive adaptation will be advanced so the interface feels natural on touchscreen devices. Internationalization will also begin, building an English UI and multi-language prompt template system to lower the entry barrier for non-Chinese players.

### Server

The storage layer will progress toward backend database upgrades — migrating from SQLite to PostgreSQL for higher concurrency support and richer data management capabilities. A Redis cache layer will be introduced to provide low-latency responses for high-frequency access scenarios such as ghost NPC TTL management and hot data queries.

The server architecture will move toward statelessness and horizontal scaling: supporting multi-worker deployment and load balancing so the system can gracefully handle growing player populations. Chronicle aggregation will evolve from a periodic polling model to a message queue-driven event model, enabling more immediate and precise world narrative generation.

LLM capability boundaries will also extend server-side — building on client-side AI execution, the server will gradually take on LLM-enhanced autonomous NPC behavior, making NPCs exhibit more vivid and self-consistent daily behaviors.

### Deployment

Operations infrastructure will align with production-grade standards: introducing Kubernetes Helm Charts for containerized orchestration; integrating Alembic for automated database migrations so schema changes during version iterations are safe and controlled; deploying Prometheus metrics collection and Grafana dashboards to establish end-to-end health checks and observability.
