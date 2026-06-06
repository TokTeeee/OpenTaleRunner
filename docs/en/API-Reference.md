# Server API Reference

## Authentication

Unless otherwise noted, all endpoints require the header `Authorization: Bearer <token>`.

| Field | Description |
|---|---|
| Token algorithm | JWT HS256 |
| Validity period | 72h (configurable via `SERVICE_JWT_EXPIRE_HOURS`) |
| Refresh | `POST /auth/refresh` exchanges current token for a new token |
| Logout | `POST /auth/logout` adds token to blacklist |

---

## Endpoint Overview

### Auth (4 endpoints)

| Method | Path | Auth | Request Body | Response |
|--------|------|------|--------|------|
| `POST` | `/auth/register` | No | `{ username: string(2-32, alphanumeric underscore hyphen), password: string(6-128) }` | `{ token, player_id, username }` |
| `POST` | `/auth/login` | No | `{ username: string, password: string }` | `{ token, player_id, username }` |
| `POST` | `/auth/refresh` | **Yes** | — | New `{ token, player_id, username }` |
| `POST` | `/auth/logout` | **Yes** | — | `{ message: "Logged out" }` |

### Storybook (5 endpoints) — No Auth Required

| Method | Path | Description |
|--------|------|------|
| `GET` | `/storybook` | Complete storybook data |
| `GET` | `/storybook/world-lore` | World lore description text |
| `GET` | `/storybook/main-quest` | Main quest information |
| `GET` | `/storybook/regions` | List of all regions |
| `GET` | `/storybook/full` | Full data (includes cache fallback) |

### World (13 endpoints)

| Method | Path | Description |
|--------|------|------|
| `GET` | `/world/state/{region_id}` | Region state (weather/factions/events) |
| `GET` | `/world/chronicle?day=N` | World chronicle entries |
| `GET` | `/world/chronicle/latest` | Latest 5 chronicle entries |
| `GET` | `/world/timeline` | Current world day |
| `GET` | `/world/stream?playerId=X&regionId=Y` | SSE real-time world update stream |
| `GET` | `/world/ghost-npcs/{region_id}` | Region ghost NPCs |
| `GET` | `/world/terrain?region=X&x=Y&z=Z` | Terrain data |
| `GET` | `/world/weather?region=X&day=N` | Weather data |
| `GET` | `/world/aliases` | Region/terrain alias mappings |
| `GET` | `/world/map?region=X&world_day=N` | Map grid data |
| `GET` | `/world/roads?region=X` | Road data |
| `GET` | `/world/waters?region=X` | Water body data |
| `POST` | `/world/locations` | Report new location |

### Characters (4 endpoints) — Auth Required

| Method | Path | Description |
|--------|------|------|
| `POST` | `/characters/create` | Create character `{ data: dict }` |
| `GET` | `/characters/{char_id}` | Get character data |
| `PATCH` | `/characters/{char_id}` | Update character |
| `GET` | `/characters/{char_id}/history` | Character history log |

### Chronicle (2 endpoints) — Auth Optional

| Method | Path | Description |
|--------|------|------|
| `POST` | `/chronicle/upload` | Batch upload chronicle logs |
| `POST` | `/chronicle/upload/single` | Upload single entry |

### Sync (3 endpoints)

| Method | Path | Description |
|--------|------|------|
| `GET` | `/sync/updates?playerId=X&regionId=Y` | Get world sync deltas |
| `PUT` | `/sync/session` | Report real-time position `{ character_name, region, coordinates, current_action, status, ... }` |
| `GET` | `/sync/nearby-players?region=X` | Nearby online players |

### Encounters (2 endpoints)

| Method | Path | Description |
|--------|------|------|
| `GET` | `/encounters/pending` | Pending encounters |
| `POST` | `/encounters/{enc_id}/resolve` | Mark encounter as resolved |

### NPC (13 endpoints)

| Method | Path | Description |
|--------|------|------|
| `GET` | `/npcs/known?ids=X,Y,Z` | Get known NPCs (with relationship data) |
| `GET` | `/npcs/region/{region_id}` | Region NPC list |
| `POST` | `/npcs/register` | Register new NPC |
| `PATCH` | `/npcs/{npc_id}/relationship` | Update NPC relationship |
| `PATCH` | `/npcs/{npc_id}/behavior` | Set NPC behavior config |
| `GET` | `/npcs/{npc_id}/behavior` | Get NPC behavior config |
| `POST` | `/npcs/{npc_id}/behavior/tick` | Manually trigger NPC behavior tick |
| `PATCH` | `/npcs/{npc_id}/voice` | Set NPC voice parameters |
| `GET` | `/npcs/{npc_id}/voice` | Get NPC voice parameters |
| `PATCH` | `/npcs/{npc_id}/portrait` | Set NPC portrait |
| `GET` | `/npcs/{npc_id}/portrait` | Get NPC portrait |
| `GET` | `/npcs/{npc_id}/full?player_id=X` | Full NPC data (with relationship/voice/portrait) |
| `PATCH` | `/npcs/{npc_id}` | Batch update NPC |

### Events (3 endpoints)

| Method | Path | Description |
|--------|------|------|
| `GET` | `/events/available?region=X` | Available event templates |
| `POST` | `/events/{event_id}/trigger` | Trigger event |
| `POST` | `/events/{event_id}/progress` | Update event progress |

### Activity (4 endpoints)

| Method | Path | Description |
|--------|------|------|
| `POST` | `/activity/report` | Report activity status |
| `GET` | `/activity/active?region=X&entity_type=Y` | Active entity list |
| `POST` | `/activity/heartbeat?entityId=X` | Heartbeat |
| `GET` | `/activity/history/{entity_id}?limit=20` | Activity history |

### Multiplayer (18 endpoints) — Auth Required

| Method | Path | Description |
|--------|------|------|
| `POST` | `/multiplayer/rooms` | Create room `{ mode: "new"\|"inherit", config: RoomConfig, inherit_data? }` |
| `GET` | `/multiplayer/rooms/{room_id}` | Get room status |
| `POST` | `/multiplayer/rooms/{room_id}/join` | Join room `{ password?, claimed_slot_id? }` |
| `POST` | `/multiplayer/rooms/{room_id}/leave` | Leave room |
| `POST` | `/multiplayer/rooms/{room_id}/heartbeat` | Room heartbeat |
| `POST` | `/multiplayer/rooms/{room_id}/claim-slot` | Claim character slot |
| `POST` | `/multiplayer/rooms/{room_id}/release-slot` | Release character slot |
| `POST` | `/multiplayer/rooms/{room_id}/character-ready` | Mark character ready |
| `POST` | `/multiplayer/rooms/{room_id}/generate-common-backstory` | Generate common backstory |
| `POST` | `/multiplayer/rooms/{room_id}/start` | Start game |
| `POST` | `/multiplayer/rooms/{room_id}/action` | Submit action `{ action: string, dice_result? }` |
| `POST` | `/multiplayer/rooms/{room_id}/action-skip` | Skip current round |
| `GET` | `/multiplayer/rooms/{room_id}/round-status` | Get round status |
| `GET` | `/multiplayer/rooms/{room_id}/narratives?since_round=N` | Get narrative history |
| `POST` | `/multiplayer/rooms/{room_id}/round-process` | Manually trigger round resolution |
| `GET` | `/multiplayer/rooms/{room_id}/notifications?since_round=N` | Get notifications |
| `POST` | `/multiplayer/rooms/{room_id}/spectator-ready` | Spectator ready |
| `POST` | `/multiplayer/rooms/{room_id}/save` | Save (host only) |

---

## Rate Limiting

- Default 60 requests / 60 seconds / IP
- Configurable: `SERVICE_RATE_LIMIT` / `SERVICE_RATE_WINDOW`
- Returns HTTP 429 when exceeded

## CORS

- Configurable `SERVICE_CORS_ORIGINS` (comma separated)
- Default: `http://localhost:5173,http://localhost:3000`

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SERVICE_JWT_SECRET` | **Required** | JWT signing secret |
| `SERVICE_PORT` | 8000 | API port |
| `SERVICE_DB_PATH` | `./data/aeslan.db` | SQLite path |
| `SERVICE_JWT_EXPIRE_HOURS` | 72 | Token validity (hours) |
| `SERVICE_LLM_KEY` | — | Server-side LLM API Key (chronicle aggregation) |
| `SERVICE_LLM_ENDPOINT` | `https://api.deepseek.com/chat/completions` | LLM endpoint |
| `SERVICE_LLM_MODEL` | `deepseek-chat` | LLM model |
| `SERVICE_LLM_TEMPERATURE` | 0.7 | LLM temperature |
| `SERVICE_LLM_MAX_TOKENS` | 2048 | LLM max tokens |
| `SERVICE_CORS_ORIGINS` | `localhost:5173,localhost:3000` | CORS whitelist |
| `SERVICE_RATE_LIMIT` | 60 | Rate limit value |
| `SERVICE_RATE_WINDOW` | 60 | Rate limit window |
| `SERVICE_LOG_ENABLED` | true | Logging enabled |
| `SERVICE_LOG_LEVEL` | INFO | Log level (DEBUG/INFO/WARNING/ERROR) |
| `SERVICE_LOG_DIR` | `./logs` | Log directory |
| `SERVICE_LOG_FORMAT` | text | Log format (text/json) |
| `CHRONICLE_AGGREGATE_MIN_LOGS` | 1 | Minimum logs to trigger chronicle aggregation |
| `STORYBOOK_PATH` | `./data/storybook.json` | Storybook path |

## Dashboard API (port 8081, no authentication required)

| Path | Description |
|---|---|
| `GET /api/stats/overview` | World overview |
| `GET /api/stats/regions` | Region statistics |
| `GET /api/stats/activity` | 24h active players |
| `GET /api/stats/chronicle?day=N&region=X` | Chronicle browser |
| `GET /api/stats/npcs?region=X&promoted=Y` | NPC list |
| `GET /api/stats/timeline` | Timeline status |
| `GET /api/stats/events?region=X&level=Y` | Event templates |
| `GET /api/stats/waters` | Water body data |
| `GET /api/stats/roads` | Road data |
| `GET /api/stats/realtime-players?region=X` | Real-time players |
| `GET /api/stats/map-entities` | Map entities |

---

## Planning

Currently, 79 REST endpoints across 13 router modules plus the Dashboard API (11 endpoints) provide the client with comprehensive data and interaction capabilities.

For multiplayer real-time sync, the plan is to introduce WebSocket endpoints, replacing short-cycle polling with persistent connections and significantly reducing sync latency. An API version header mechanism is also planned to allow graceful interface evolution negotiation between server and client, along with a unified pagination specification for list endpoints. Request and response body compression will also be introduced to improve transfer efficiency under bandwidth-constrained conditions.

The long-term vision includes offering an optional GraphQL endpoint to give clients flexible on-demand data access, and automatic generation of the OpenAPI 3.1 specification to keep API documentation in sync with implementation at all times. Endpoint-level fine-grained rate limiting will also be implemented, enabling independent throttling policies for different interface types. For higher-frequency sync scenarios, the introduction of gRPC will bring the performance advantages of binary protocols. Ultimately, a clear breaking change policy will be established to ensure the interface evolution process is predictable and traceable.
