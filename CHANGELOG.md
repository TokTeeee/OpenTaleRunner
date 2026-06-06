# Changelog

## v0.5.1 — 2026-06-06 (Level-EXP foundation)

This version introduces the level / experience system and the foundation for
the class system (v0.5.2+). All v0.4 character saves are migrated
automatically and idempotently on every create/update.

### Server
- `repositories/character_repo.py::_migrate_v04_to_v05` — idempotent backfill of
  `level`, `exp`, `expToNext`, `unspentAttributePoints`, `classId`,
  `classSkills`; attribute clamp widened from `[3, 18]` to `[1, 20]`
- `services/exp_formula.py` — pure formula `expToNext(level) = round(100 * L^1.5)`
  (capped at `MAX_LEVEL=20`) + `apply_exp_formula` chain-level helper
- `routers/character_router.py` — two new PATCH endpoints:
  - `PATCH /api/v1/characters/{id}/exp` — grants EXP with difficulty multiplier
    (easy 0.5× / normal 1.0× / hard 1.5× / deadly 2.0×), chains level-ups
  - `PATCH /api/v1/characters/{id}/attributes/spend` — spends an
    `unspentAttributePoints` to bump a single attribute (capped at 20)
- Owner-only access (returns 403 if `character.playerId != current_user`)

### Client
- `services/level/expFormula.ts` + `services/level/grantExp.ts` — pure client
  mirrors of the server formula, used for local UI feedback
- `types/character.ts` — `Character` interface gains the 6 v0.5 fields
- `stores/characterStore.ts` — `applyServerExpGrant` + `applyServerAttributeSpend`
  patch appliers; `updateAttributes` clamp widened to `[1, 20]`
- `services/event/events.ts` — new event constants:
  `COMBAT_HIT`, `COMBAT_KILL`, `COMBAT_END`, `NARRATIVE_SUBMIT`, `LEVEL_UP`
- `services/combat/ActionResolver.ts` — emits `COMBAT_HIT` on every hit and
  `COMBAT_KILL` when the target HP drops to 0 or below
- `components/combat/CombatView.tsx` — emits `COMBAT_END` with
  `{outcome: 'victory'|'defeat'|'fled'}` before `beginResolving`
- `hooks/pmEngine/useActionSubmit.ts` — emits `NARRATIVE_SUBMIT` after PM
  finishes
- `components/panels/CharacterPanel.tsx` — `LevelBar` (Lv. number + exp bar
  with `MAX` sentinel at level 20) and per-attribute `+1` buttons that PATCH
  `/attributes/spend`; `AttributeRadar` `MAX` widened to 20
- `tests/setup.ts` — adds explicit `cleanup()` from `@testing-library/react`
  to fix DOM accumulation between tests in jsdom

### Tests
- 13 server tests pass (`test_exp_formula`, `test_migrate_v04_to_v05`,
  `test_character_router_exp`)
- 841 client tests pass (74 test files; new: `expFormula`, `grantExp`,
  `eventBus_v051`, `characterStore_v051`, `CharacterPanel_v051`)

---

## v0.4 (unreleased)

This version shifts focus to "playability": a full combat system, item comparison + affix pool, generalized UI refactor, cross-session NPC memory, and in-game codex.

### Combat System v0.4
- ACT turn-based combat — ActionResolver with 6-attribute formulas (toHit, dodge, damage, flee)
- ActionMenu with QTE (Timing + Typing modes) + floating damage + combat log
- Debug Mode for testing via combat starter UI
- Dodge decay mechanics (successive dodges increase difficulty threshold)

### Item & UI
- Item Comparison UI — BackpackModal hover triggers side-by-side stat difference display
- Item Affix Pool — `affixPools` data + `drawAffixes` API + loot path wired into `applyConsequences`
- UI Token Migration (P0) — `tokens.ts` centralized palette, 6 components migrated
- UI Shared Components (P1) — `ItemChip` / `ItemCardRow` / `ItemDetailPanel` / `ItemEffectList`

### Codex & Memory
- Codex system — `codexStore` + signature dedup + 6 categories + CodexModal + unlock notifications
- NPC Memory System — `MemoryManager` + `InMemoryMemoryStore` + `EpisodicSummarizer` + MemoryModal with 6-scope overview

### CI Hardening
- Client job: added `lint` (advisory), `typecheck` (`tsc -b --noEmit`), `test:coverage` (lcov artifact)
- Service job: added inline `pip-audit` step (advisory)
- New `audit` job: combined `npm audit` + `pip-audit` runner
- Coverage provider: `@vitest/coverage-v8`; initial baseline 21.51% lines
- ESLint: `tests/**` override for mocking, mechanical lint fixes across 6 modules

---

## v0.3 — 2026-06-04

Open-source readiness release. Client API key encryption, security hardening, code splitting, CI/CD pipeline, comprehensive documentation.

### Security
- Client API keys encrypted at rest (AES-GCM via Web Crypto API)
- Server CORS whitelist replaces wildcard `*`
- Token bucket rate limiting middleware
- Auth token moved to independent store with encrypted persistence

### Infrastructure
- GitHub Actions CI (client build + service tests + acceptance)
- `pytest` runs independently (auto-starts service via conftest)
- `SECURITY.md` with vulnerability disclosure flow
- `.github/CODEOWNERS` for auto-assigned review
- `NOTICE.md` and `logs/check_licenses.py` for license audit

### Architecture
- Unified HTTP client layer (`HttpClient.ts`) shared by `APIClient` and `MultiplayerAPI`
- Auth session normalized to dedicated `authStore`
- Bundle splitting: main bundle 588 kB → 377 kB (gzip 109 kB) via `manualChunks`
- Removed 3 ineffective dynamic imports, dead code `CacheManager.ts`
- `usePMEngine.ts` (God Hook, 1330 lines) split into 7 domain modules

### Logging
- Client: 12-category debug logger with console + IndexedDB persistence
- Service: logging rewritten with `RotatingFileHandler`, env-configurable

### Documentation
- Rewritten `docs/API参考.md`: 79 endpoints across 13 routers + Dashboard API
- New `docs/架构与配置.md`: client-server architecture overview, full settings reference
- README doc index reorganized by functional domain

### Tests
- Party system: 16 test cases (recruitment, loyalty, level-up chain, departure)
- AutoPlay: 7 smoke test cases (decision loop with mocked LLM)
- TTS queue: 7 test cases (queue ordering, failure recovery)
- Image client: 7 test cases (request construction, cache miss path)
- Consequence application: 16 unit tests

### Bugfixes
- `partyStore.addMemberExperience`: level-up state overwrite fixed
- `TTSClient.playNext`: single TTS failure no longer freezes queue
- `MultiplayerAPI.test.ts`: auth store integration fixed

---

## v0.2

Core feature expansion: PM Engine 7-layer prompt architecture, GM on-demand query protocol, judgment system, chronicle engine, character/item/NPC/multiplayer systems.

### Core Systems
- PM Engine with 7-layer prompt architecture (World, Character, Scene, Context, Task, Schema, Query)
- GM on-demand query protocol — 7 query types, up to 50% token savings
- Judgment system (2d6 + 7 modifiers + 5-tier result mapping)
- Chronicle recorder with server-side aggregation engine
- Full character system (6 attributes, skills, HP/stamina, reputation, conditions)
- Item system (7 categories, 6 qualities, 11 effects, inventory/equipment, history tracking)
- Streaming output + token budget management
- Multi-LLM provider support (DeepSeek/OpenAI/MiMo/Anthropic/Ollama/Custom)

### AutoPlay
- Independent AI decision engine with separate LLM configuration
- Step-by-step mode

### AI NPC System
- Rule-based FSM (5 behavior types: merchant, guard, villager, healer, scholar)
- LLM-empowered NPC behaviors with behavior scheduler

### Multiplayer
- Room-based games (1–10 players), turn-based action rounds
- Spectator system with mid-game join
- Character slot management, save/load with archive packaging
- Real-time sync mode

### Party System
- NPC/ghost NPC/animal/monster recruitment
- Combat and utility abilities, loyalty system

### Game Hook System
- Decoupled rule engine (17 rules across 5 categories), hot-swappable

### Media
- TTS (text-to-speech) with NPC voice pool
- Image generation with IndexedDB caching
- Voice input (STT) via Web Speech API

### World
- StoryBook-driven swappable world data (JSON Schema)
- Terrain, weather, water, road systems
- Travel system with coordinate-based navigation
- Game clock with time-of-day effects

### Dashboard
- 8-tab world management dashboard with Canvas hand-drawn map
- Real-time entity tracking

---

## v0.1 — Initial Prototype

- Basic PM Engine with single-round narrative
- Character creation (6-step wizard)
- Simple 2d6 dice mechanic
- Local save system
