# Logging System

> Dual-track logging system: client-side 12-category debug logger (IndexedDB persistence) + server-side Python RotatingFileHandler (request middleware).

---

## 1. Introduction

The client `ClientLogger` provides 12 category channels with 4 log levels, colored console output, and an in-memory buffer; optional persistence to the browser's local database via `LogIndexedDB`. The server uses Python's standard `RotatingFileHandler` logging infrastructure paired with FastAPI middleware to automatically log all HTTP requests.

## 2. Design

### 2.1 Client Logger

`services/logging/ClientLogger.ts`. 12 categories:

| Category | Description |
|----------|-------------|
| `GM` | Game control flow (Game Master) |
| `HTTP` | HTTP requests / responses |
| `TOOL` | LLM tool calls |
| `PM` | PM engine (Plot Manager) |
| `STORE` | Zustand store state changes |
| `TTS` | Text-to-speech |
| `IMAGE` | Image generation |
| `GAME` | Game logic |
| `MULTI` | Multiplayer |
| `SYNC` | State synchronization |
| `SYSTEM` | System-level events |
| `ERROR` | Global error capture |

4 levels: `DEBUG(0)` / `INFO(1)` / `WARN(2)` / `ERROR(3)`. Console output carries colored prefix markers; in-memory buffer capped at 200 entries.

### 2.2 IndexedDB Persistence

`services/logging/LogIndexedDB.ts`.

- **Database**: `AeslanLogs`, version v1
- **Object Store**: `entries` (keyPath=`id`, autoIncrement)
- **Indexes**: `timestamp`, `category`, `level`
- **Auto-cleanup**: When storage exceeds `maxStorageMB` (default 10MB), purges the oldest 20% of records
- **Toggle**: Controlled by `settingsStore.debug.persistToIndexedDB`

### 2.3 Debug Configuration

`settingsStore.debug` fields:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Master switch |
| `logLevel` | `number` | `INFO(1)` | Minimum log level |
| `categories` | `string[]` | `["SYSTEM", "ERROR"]` | Enabled categories |
| `persistToIndexedDB` | `boolean` | `false` | Whether to write to IndexedDB |

Debugging is off by default, recording only the `SYSTEM` and `ERROR` categories with no persistence.

### 2.4 Console API

Debug entry points mounted on `window`:

- `__aeslanDebug(true|false)` — toggle debug mode on/off
- `__aeslanExportLogs('json'|'csv')` — export logs and trigger a browser download
- `__aeslanClearLogs()` — clear the in-memory buffer and all IndexedDB records

### 2.5 Instrumentation Points

| Instrumentation | Location |
|----------------|----------|
| GM request / response | `useActionSubmit` |
| HTTP latency | `HttpClient` |
| Scene generation | `useSceneFlow` |
| PM initialization | `usePMInitialization` |

### 2.6 Server-Side Logging

`server/logging_config.py`: built on Python's standard `logging` library with `RotatingFileHandler` (10MB per file, 7 backup rotations).

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVICE_LOG_ENABLED` | `true` | Enable logging |
| `SERVICE_LOG_LEVEL` | `INFO` | Log level |
| `SERVICE_LOG_DIR` | `./logs` | Log directory |
| `SERVICE_LOG_FORMAT` | `text` | Output format (`text` or `json`) |

8 loggers:

| Logger | Purpose |
|--------|---------|
| `api` | API endpoint calls |
| `db` | Database operations |
| `npc` | NPC-related logic |
| `chronicle` | Chronicle / world state |
| `ghost` | Ghost system |
| `dashboard` | Dashboard panel |
| `request` | HTTP request logging |
| `llm` | LLM call logging |

### 2.7 Request Logging Middleware

FastAPI `@app.middleware("http")` global middleware records each request's method, path, status code, duration, and client IP.

### 2.8 Related Systems

- **Architecture & Configuration** (`Architecture-and-Configuration.md`): full `settingsStore` config field definitions
- **Security System** (`Security-System.md`): sensitive information (API Key, token) is never written to logs; a filtering layer truncates them before recording

## 3. Roadmap

We aim to provide a browser-side log filter that allows flexible retrieval of IndexedDB historical records by category and level, enabling both developers and players to quickly locate root causes. The server-side logging infrastructure will evolve toward structured output, supporting JSON format to prepare for integration with mainstream log stacks such as ELK and Loki, enabling visualized aggregation and real-time monitoring & alerting.

Further planning includes a unified remote log reporting capability, providing both client and server with a configurable log-service endpoint for centralized log collection and analysis, dramatically reducing troubleshooting and operational costs in distributed environments.
