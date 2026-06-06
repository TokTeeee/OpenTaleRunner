> **Narrative drives everything.** This is not a pre-written script — it's an endless saga woven by AI and you, together.
<p align="center">
  <img src="docs/img/icon.jpg" alt="OpenTaleRunner" width="650" height="328" />
</p>


[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Client](https://img.shields.io/badge/client-React_19-61dafb)](https://react.dev)
[![Server](https://img.shields.io/badge/server-FastAPI-009688)](https://fastapi.tiangolo.com)
[![Docs](https://img.shields.io/badge/docs-20_EN+20_ZH-blue)](docs/)
[![Tests](https://img.shields.io/badge/tests-852_passed-brightgreen)](client/)
[![Version](https://img.shields.io/badge/version-v0.4.0-orange)](CHANGELOG.md)

[中文文档](./README.md) · [Changelog](./CHANGELOG.md)

---

> This project was **coded using AI Agents.** However, all game mechanics, architecture designs, test cases, and design documents are the result of individual thinking. The project uses extensive automated tests and design documents to ensure stable iteration. Everyone is welcome to contribute using AI Agents in the same way (please don't over-invest your own time).

---

## Vision

**"Whatever you dream becomes real."**

Swords and magic, starships and abyss — there's everything, because you imagined it all. Create your own story together with the GM (please don't turn the GM into a catgirl).

---

## Gameplay: At Its Core, It's Text Adventure

OpenTaleRunner starts as a text adventure.

The GM describes your scene and offers several choices.

- You can pick one
- Or you can dream up whatever you want to say!

The GM performs a classic dice roll — leading to delightful critical successes or shocking critical failures.

**Every choice you make shapes this world.**

The world remembers your footprints:

- Server consolidates client stories
- NPC memories stored independently
- Item Codex system

---

## Features

### Narrative-Driven Everything

No preset items, NPCs, or storylines. **Everything is decided by the GM's narrative on the fly:**

- Weapons have no preset stats — the GM describes how sharp they are; the code only records the damage
- NPCs have no preset lines — the GM decides what they say in the moment
- Events have no preset branches — the GM responds to your actions in real time

### GM On-Demand Query, Not Full Injection

Traditional approaches dump the entire world state into the Prompt — your inventory, NPC list, quest progress, map... OpenTaleRunner's GM only queries when needed:

> `GM is recalling an NPC you met...` → Only relevant NPC info is queried → Narrative returns

**On-demand queries**: inventory, NPCs, locations, character state, skills, recent events, world lore. Reducing token consumption per interaction.

### Freely Swap Worlds

OpenTaleRunner's worlds are defined by the **Storybook** format — a JSON file containing regions, characters, quests, and item templates. You can:

- Experience the default Aetherlan world
- Design and share your own world settings (Storybook JSON)

**Swords & sorcery, cyberpunk, Cthulhu, xianxia, wasteland — any world, one-click swap.**

### Real-Time Multiplayer or Async Exploration (What's the point of RPG alone?)

- Real-time multiplayer: The host creates a room, and everyone has fun together.
- Async exploration: Multiple players can adventure in the same world. Everyone's actions are recorded by the chronicle engine, shaping the shared world. Other players' characters appear as "ghost NPCs" in your world.

### World Dashboard (Not Fully Implemented)

The server includes a Web dashboard (`localhost:8081`) for viewing world development from a god's-eye perspective — daily events, NPC statuses, player character experiences, and even a real-time world map of player/NPC positions. Your adventures in the client will eventually become part of the chronicle.

---

| | |
|---|---|
| ![Text Adventure Main Interface](docs/img/MainScreen.png) | ![Dice Roll Judgment](docs/img/Roll.png) |
| **Text Adventure** — The core experience. The GM narrates your world, you make choices. | **Dice Roll** — Every action is judged by 2d6 + modifiers in real time. |
| ![Item Codex](docs/img/Item.png) | ![Combat System](docs/img/Combat.png) |
| **Item Codex** — All discovered items, their history, and quality tiers tracked. | **Combat** — ACT turn-based combat with 6-attribute formulas and dodge decay. |

---

## Quick Start

### Local Development

**Prerequisites**: Node.js 22+ / Python 3.12+ / AI API key

```bash
# Client
cd client && npm install && npm run dev

# Server (optional, needed for online features)
cd server && pip install -r requirements.txt
SERVICE_JWT_SECRET=dev-secret python run.py
```

### AI API KEY

There are currently 3 types of Agents you can configure in the settings menu:

- Story Narrative GM (Required)
- NPC Portrait & Terrain Image Generation (Optional, in development)
- Narration & NPC Voice Acting (Optional, in development)

---

## Tech Stack

| Layer | Client | Server |
|---|---|---|
| Language | TypeScript (strict) | Python 3.12 |
| Framework | Vite + React 19 | FastAPI + uvicorn |
| State | Zustand (persist + encrypted) | Native Python |
| Database | IndexedDB / localStorage | SQLite 21 tables (aiosqlite) |
| AI | 6 LLM providers, direct call | Chronicle aggregation only (low-frequency) |
| Judgment | `crypto.getRandomValues()` | — |
| Testing | Vitest (852 cases, 68 files) | pytest |

---

## Feature Map

| System | Description | Doc |
|---|---|---|
| **PM Engine** | 7-layer prompt, multi-turn queries, streaming, token budget | [📄](docs/en/PM-Engine-and-Prompt-System.md) |
| **Judgment** | 2d6 + 7 modifier sources, night penalty, 15 conditions | [📄](docs/en/Judgment-System.md) |
| **Character** | 6 attributes, skills, HP/vital, reputation, 6-step creation | [📄](docs/en/Character-System.md) |
| **Items** | 7 categories, 6 qualities, 11 effects, backpack/equipped, history | [📄](docs/en/Item-System.md) |
| **Multiplayer** | Rooms 1-10, turn-based, spectating, 18 API endpoints | [📄](docs/en/Multiplayer-System.md) |
| **NPC** | Template generation, ghost NPCs, FSM scheduler, interaction | [📄](docs/en/NPC-System.md) |
| **Party** | NPC recruitment, loyalty, combat/utility abilities | [📄](docs/en/Party-System.md) |
| **Storybook** | JSON Schema world data, region/quest/role templates, hot-swap | [📄](docs/en/Storybook-Schema.md) |
| **Hook System** | 17 rules, 5 categories, hot-swap, error isolation | [📄](docs/en/GameRuleEngine.md) |
| **Chronicle** | Action recording, aggregation engine, world day, offline buffer | [📄](docs/en/Chronicle-System.md) |
| **AutoPlay** | AI decision engine, LLM loop, JSON parse fallback | [📄](docs/en/AutoPlay-System.md) |
| **Media** | TTS 3 providers + voice pool · Image 3 providers · STT 4 providers | [📄](docs/en/Media-System.md) |
| **Security** | AES-GCM encryption, prompt injection defense, XSS, JWT | [📄](docs/en/Security-System.md) |
| **Logging** | Client 12-category IndexedDB · Server RotatingFileHandler | [📄](docs/en/Logging-System.md) |
| **Combat** | ACT turn-based, 6-attribute formula, dodge decay, QTE | [📄](docs/en/Combat-System.md) |

---

## Project Structure

```
OpenTaleRunner/
├── client/                     # Frontend React + TypeScript (68 test files, 852 cases)
│   └── src/
│       ├── components/         # Game area / 3-column layout / modals / panels
│       ├── hooks/              # usePMEngine / useAutoPlay / useVoiceInput
│       ├── services/
│       │   ├── engine/         # PMEngine · PromptBuilder · QueryResolver · TokenBudget
│       │   ├── judgment/       # Judgment system · condition registry
│       │   ├── chronicle/      # Chronicle recorder
│       │   ├── consequence/    # Consequence application engine
│       │   ├── sync/           # HttpClient · APIClient · SyncManager
│       │   ├── multiplayer/    # Multiplayer API · sync services
│       │   ├── combat/         # Combat system (ACT queue / ActionResolver / balance)
│       │   ├── tts/ image/ stt/# Media capabilities (12 provider implementations)
│       │   ├── npc/ autoPlay/  # NPC generator · AutoPlay engine
│       │   ├── crypto/         # AES-256-GCM encryption
│       │   ├── security/       # Prompt injection defense · XSS filtering
│       │   ├── logging/        # 12-category debug logger (IndexedDB)
│       │   └── event/          # 14-event pub/sub bus
│       ├── stores/             # Zustand stores
│       └── types/              # TypeScript type definitions
│
├── server/                    # Backend Python FastAPI
│   ├── routers/                # 79 REST endpoints (13 router files)
│   ├── services/               # Chronicle aggregation · conflict detection · ghost mgmt · NPC behavior
│   ├── repositories/           # Data access layer (interfaces + SQLite impl)
│   ├── models/                 # Pydantic request/response models
│   ├── db/                     # 21-table DDL + seed data
│   └── dashboard/              # World dashboard (standalone FastAPI :8081)
│
├── docs/                       # 40+ system docs (Chinese + English)
├── .github/                    # CI/CD · Issue templates · PR template
└── .gitignore                  # Git ignore rules
```

---

## Community

| | |
|---|---|
| Changelog | [CHANGELOG.md](./CHANGELOG.md) |
| License | [MIT](LICENSE) |

---

> *"Code is the container; the GM's narrative is the soul."*
