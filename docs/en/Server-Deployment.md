# Server Deployment & Development Guide

## Prerequisites

- Python 3.11+
- pip

## Quick Start

```bash
cd server

# 1. Install dependencies
pip install -r requirements.txt

# 2. (Optional) Configure LLM key for chronicle aggregation
set SERVICE_LLM_KEY=sk-xxx

# 3. Start the main API (port 8000)
python run.py

# 4. In a separate terminal, start the dashboard (port 8081)
python run_dashboard.py
```

Alternatively, double-click `start-server.ps1` to launch both services with one click.

## Configuration

All settings are configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVICE_PORT` | 8000 | Main API listening port |
| `SERVICE_LLM_KEY` | (empty) | LLM API key for grand-PM chronicle aggregation |
| `SERVICE_LLM_ENDPOINT` | `https://api.deepseek.com/chat/completions` | LLM endpoint |
| `SERVICE_LLM_MODEL` | `deepseek-chat` | Model name |
| `SERVICE_JWT_SECRET` | `aeslan-dev-secret` | JWT signing secret |
| `SERVICE_DB_PATH` | `./data/aeslan.db` | SQLite database path |
| `SERVICE_DATA_DIR` | `./data` | Seed data directory |

## Data Directory

```
server/data/
├── aeslan.db          # SQLite database (auto-created)
├── storybook.json     # Storybook (copied from client)
└── npc_templates.json # NPC templates (copied from client)
```

## Logging

Logs are written to `server/logs/YYYY-MM-DD.log` (daily rotation). Module-level log tags:
- `api` — service start/stop
- `db` — database operations
- `chronicle` — chronicle aggregation
- `npc` — NPC operations
- `ghost` — ghost NPCs
- `dashboard` — dashboard

## Port Conflict Handling

The startup script automatically detects port conflicts and kills the occupying process.

## Database Reset

```bash
del server\data\aeslan.db
# Restart the server to auto-create tables + seed data
```

## Dependencies

```
fastapi>=0.115.0     # Web framework
uvicorn>=0.30.0      # ASGI server
aiosqlite>=0.20.0    # Async SQLite
pyjwt>=2.9.0         # JWT authentication
httpx>=0.27.0        # HTTP client (LLM calls)
```

## Extension Guide

### Switching the Database to PostgreSQL

1. Create `db/postgres_database.py` implementing the `Database` interface
2. Create `repositories/postgres_xxx_repo.py` implementing each Repository interface
3. Modify the factory functions in `routers/deps.py` to point to the new implementations

**Zero changes required in the Router and Service layers.**

### Adding a New API Endpoint

1. Add new Pydantic models in `models/`
2. Add new data access methods in `repositories/`
3. Add new business logic in `services/`
4. Add new route files in `routers/`
5. Register the routes in `main.py`

### Adding New Seed Data

Modify the seed data definitions in `services/terrain_service.py` or `services/event_generator.py`, then restart the server to auto-load.

## 3. Roadmap

We aim to advance toward production-grade deployment at the container orchestration level, providing Kubernetes Helm Chart templates, paired with Nginx reverse proxy and Let's Encrypt automated SSL/TLS certificate management, along with built-in health-check endpoints to ensure high availability and observability.

Further planning includes an upgrade path for the database and caching layer — providing migration guides and automated scripts from SQLite to PostgreSQL, introducing a Redis caching layer to accelerate hot-data access, and supporting multi-worker load-balancing configurations so that the server can scale horizontally.

The long-term vision covers one-click deployment templates for major cloud platforms (AWS, GCP, Azure), complemented by CI/CD automated release pipelines and blue-green deployment strategies, enabling teams to deliver from development to production with zero operational overhead.
