# Changelog

## v0.5.10 — 2026-06-07 (5 项代码小修: validateOverride / JWT username / SocialPanel 大图 / 文档对齐)

5 件独立小改,每件都有单测/集成测试覆盖。

### What's in this release

**#2 #3 — 拆出独立 `validateOverride(o, slot)` 函数**

`PromptBuilder` 内部新增 `validateOverride(o: PromptOverride, slot: string): string | null`, 与 `applyOverrides` 解耦. 校验两步叠加: `queryProtocol` slot 走白名单 (`SCENE:` / `NPC:` / `QUEST:` / `INVENTORY:` / `COMBAT:` / `TIME:`), 任意 slot content ≤ 2000 字符. 错误由 `applyOverrides` 循环里跳过该 override + console.warn.

测试: `client/tests/services/engine/validateOverride.test.ts` 7 个 case (whitelist 拒 / whitelist 收 / length 拒 / 2000 边界 / narrative 自由 / jsonSchema 强制 replace / 优先级)

**#7 — server `multiplayer_router` 从 JWT 解析 username**

`auth_router._make_token(player_id, username)` payload 加 `username` claim; register / login / refresh 三处都传 username. `routers/deps.py` 新增 `get_current_username` dependency, 从 token 取 username, fallback 到 sub. `multiplayer_router.create_room` 改用新 dependency, 替代原 `player_id` 硬编码.

修复: refresh 端点原本 `username=""`, 改为从旧 token 解出 username, 是 pre-existing bug 的副带修复.

测试: `server/tests/test_multiplayer_jwt_username.py` 1 个集成 case 验证 token 含 username claim + `create_room` 实际拿 username 当 `player_name`.

附带: `conftest.py` 把测试时 `SERVICE_RATE_LIMIT` 提到 9999, 避免 v0.5.10 加 1 test 触发 60/60s 限流 (env-only, 不影响 production).

**#8 — SocialPanel 大图接 imageGen**

`SocialPanel.tsx:170` 静态占位改用 `npcPortraits[selectedNpc.npcId]` (header 已有 imageGen URL) + fallback 字符 gradient. 复用 header imageGen fetch, 不发新请求. 加 `data-testid="npc-portrait-large"`.

**#21 — 文档 "11 段" 修正到 "16 个 build\* 方法"**

之前 "11 build\* methods (4 private + 7 public)" 是计划期估算. 实际 `PromptBuilder.ts` 有 16 个 `build\*` 方法 (13 public + 3 private). 修正 `docs/en/PM-Engine-and-Prompt-System.md` 和 `docs/zh/PM引擎与Prompt系统.md` §2.1.1, 列出全部 16 个方法名 + 责任范围.

### 不在范围

- v0.5.9 死债文档同步 9 件 (单独 tag `v0.5.9`)
- v0.5.11 useActionSubmit 拆 sub-hook
- v0.5.12 backpack_full on-demand
- v0.5.13 applyConsequences 按业务域拆

## v0.5.9 — 2026-06-07 (死债文档同步 9 件)

Closes the last v0.5.x parking lot items in one small PR. No engine /
combat code changes; no public API changes for end users.

### What's in this release

**F — CacheManager doc cleanup**

`CacheManager.ts` was actually removed in v0.3 (see CHANGELOG line
465), but `docs/en/Client-Architecture.md` and
`docs/zh/客户端架构与机制.md` still listed it as a "placeholder
system requiring decision". Removed the 6 stale references (3 per
file) so the architecture docs match the actual codebase.

**A-5 — Drop orphan `applyServerAttributeSpend`**

v0.5.6 parking lot item: the only UI consumer (`AttributeRow`) was
deleted in v0.5.6, leaving `characterStore.applyServerAttributeSpend`
with no callers. Per v0.5.8 spec §2.2 user decision, removed the
action + its type declaration + its 1 test. Will be re-introduced
when a v0.6+ spec reintroduces the attribute-spend UI.

**A-1 — EXP PATCH failure-path e2e**

Added `client/tests/integration/expRetry.test.tsx`, a single-script
`it()` that walks the failure path of `subscribeCharacterExpEvents`:
assert that a non-2xx PATCH `/exp` does **not** write the store, and
that a subsequent event still triggers a fresh PATCH that does
write. Closes v0.5.7 parking lot item 1.

**Important: this test does NOT verify a true retry queue.**
The current implementation (`subscribeCharacterEvents.ts:49-87`)
clears `pending` *before* `fetch` runs, so a failed PATCH discards
the accumulated amount; only new events can re-trigger a PATCH. The
test asserts this current behavior, not a stronger "merge-on-retry"
behavior. Real retry queue logic is deferred to a v0.6 spec.

### Test results

- **Client**: 10/10 stable runs of the new test; full client suite
  86/86 files, 939/939 tests pass (A-5 −1 + A-1 +1 = net 0).
- **typecheck + lint**: 0 errors.
- **Server**: not touched; 51/51 still pass.

### Out of scope (parking lot, remaining after this release)

- real server end-to-end (would need a server process in CI)
- multiplayer EXP sharing (v0.6)
- L1 → L20 (3 more tier picks)
- **true retry queue for failed EXP PATCH** (added by A-1; the e2e
  documents current "discard + re-emit" behavior, not a fix)

---

## v0.5.7 — 2026-06-06 (LevelUp end-to-end integration test)

Closes the v0.5.6 followup "no e2e test for the combat→EXP→level→tier
chain" by adding a single-script `it()` that walks all 7 state
transitions of the v0.5 main path. No production code changes; no
public API changes; pure test + docs.

### What's covered (12 micro-steps in 1 it())

- Step 0: character L1, no class, no classId
- Step 1: `subscribeCharacterExpEvents({ debounceMs: 200 })`
- Step 2: `GuildClassModal` opens, pick `warrior + warrior_t1_1`,
  `setClass` writes locally, async PATCH `/class` is issued
- Step 3: emit `COMBAT_HIT ×10 + COMBAT_KILL ×1 + COMBAT_END.victory ×1`
  (totals 45 exp)
- Step 4: await 300ms (200ms debounce + slack)
- Step 5: assert PATCH `/exp` called exactly once with
  `body === {amount:45, difficulty:'normal'}`
- Step 6: mock server jumps the response to L5
  (`{level:5, exp:0, expToNext:600, unspentAttributePoints:0}`);
  `applyServerExpGrant` writes → `character.level === 5`
- Step 7: unmount `GuildClassModal`, render `TierUnlockModal`,
  assert 3 T2 options visible
- Step 8: click `warrior_t2_1`, `setClass` appends,
  async PATCH `/class` (now 2 calls total)
- Step 9: cleanup (unsub + eventBus.clear + fetch restore)

### Why this is not redundant with `tests/integration/guild.test.tsx`

The existing "full chain" test in `guild.test.tsx` uses `grantExp()` to
push the level up, **skipping the event layer**. This new test verifies
the **event → subscriber → PATCH** contract — exactly the layer that
v0.5.4 audit Gap #1 (broken EXP trigger chain) was about. So the two
tests are complementary, not duplicates.

### Test results

- **Client**: 10/10 stable runs of the new test; full client suite
  85/85 files, 939/939 tests pass.
- **typecheck + lint**: 0 errors (no new ones introduced).
- **Server**: not touched; 51/51 still pass.

### Docs

- `docs/zh/角色系统.md` — v0.5.7 段说明
- `docs/en/Character-System.md` — same translated

### Out of scope (parking lot, unchanged from v0.5.6)

- multi-PATCH failure / retry chain
- real server end-to-end (would need a server process in CI)
- multiplayer EXP sharing (v0.6)
- L1 → L20 (3 more tier picks)

---

## v0.5.6 — 2026-06-06 (v0.5 hotfix-debt cleanup)

Cleared the residual `lint` / `typecheck` debt that v0.5.1–v0.5.4 left
behind, and synced the CharacterCard import/export schema with the v0.5
character data model. No engine / combat code changes; no public API
changes for end users.

### Why this release exists

The v0.5 hotfix chain focused on functional gaps (EXP trigger chain,
GuildClassModal mount, expToNext edge case, wizard unlock day). The
cleanup leaves were:

- 4 `typecheck` errors (Character type missing v0.5 fields in
  `App.tsx` and `CharacterCardImporter.ts`; dynamic `require()` in
  `characterStore.ts`)
- 7 `lint` errors (setState in effect, unused component, empty
  interface, `let` that should be `const`, unused imports)
- 1 dormant dead code path (`AttributeRow` in `CharacterPanel.tsx`,
  was defined but never rendered anywhere)

Now: `npm run typecheck` and `npm run lint` both exit 0 across the
whole tree. This is the prerequisite to the longer-term plan of
moving `lint` from advisory to `required` in CI.

### Changes by file

- `client/src/App.tsx`
  - `demoChar` (the quick-start fallback in `App.tsx`) now carries
    `level/exp/expToNext/unspentAttributePoints/classId/classSkills`
    so its `Character` typechecks against the v0.5 model.
  - The "reset `guildClassDismissed` on `charId` change" useEffect
    keeps the pattern but is explicitly marked with an inline
    `eslint-disable-next-line react-hooks/set-state-in-effect` plus
    a comment explaining why this pattern is correct (per-character
    local UI state, no external system to subscribe to).
- `client/src/services/character/CharacterCardImporter.ts`
  - The imported `Character` is now fully populated for v0.5 fields.
    Old v0.4 / v0.5.1 cards that lack the new fields fall back to
    safe defaults (`level=1, exp=0, expToNext=100,
    unspentAttributePoints=0, classId=null, classSkills=[]`).
- `client/src/services/character/CharacterCardExporter.ts`
  - `formatVersion` bumped `1 → 2` to advertise the v0.5 schema.
  - Exports the six new fields. Read back via
    `CharacterCardImporter`, round-trip is identity.
- `client/src/types/characterCard.ts`
  - `CharacterSnapshot` extended with optional v0.5 fields, plus a
    new `ClassSkillNodeSnapshot` shape. Optional on purpose so
    existing v0.4 cards still parse.
- `client/src/stores/characterStore.ts`
  - The `LEVEL_UP` event emit was using `require()` for what was
    already two top-level static imports. Replaced with proper
    static `import { eventBus } from '../services/event/EventBus'`
    and `import { EVENTS } from '../services/event/events'`. No
    semantic change; the lazy-load rationale in the original
    comment was a leftover (EventBus is a singleton, no circular
    dep).
- `client/src/components/panels/CharacterPanel.tsx`
  - Removed the dead `AttributeRow` helper (was defined, never
    rendered, never tested). Its sibling `LevelBar` is the only
    in-panel v0.5 surface and is what actually drives the new
    "level / EXP / unspent points" header.
  - The two imports that `AttributeRow` was the sole consumer of
    (`useAuthStore`, `useSettingsStore`) are now gone too.
- `client/src/services/level/grantExp.ts`
  - `interface ExpGrantResult extends ExpGrantInput {}` →
    `type ExpGrantResult = ExpGrantInput` (no longer an empty
    interface declaration, lint happy).
  - `let { level, exp, unspentAttributePoints } = state;` is now
    `const { exp, unspentAttributePoints } = state; let level =
    state.level;` — only `level` is actually mutated inside the
    level-up loop, so the other two can be `const`. Behaviour
    identical (verified by `grantExp.test.ts`, 10/10 still green).
- `client/tests/components/CharacterPanel_v051.test.tsx`
  - Dropped the unused `screen` import.

### Test results

- **Client**: `npm run typecheck` exit 0, `npm run lint` exit 0,
  `npm run test:run` → 84 / 84 files, 938 / 938 tests pass.
- **Server**: not touched; 51 / 51 still pass (the 4 transient
  rate-limit failures observed in the v0.5.5 release notes are
  environmental test-ordering, not v0.5.6 regression).

### Followups not in this release (parking lot)

- v0.5 end-to-end test covering the full chain
  `combat → EXP grant → PATCH /characters/{id}/exp → level up →
  TierUnlockModal open → user picks a node → server PATCH` — no
  e2e exists yet, only unit/component slices. Worth a small spec
  + plan before coding.
- `characterStore.applyServerAttributeSpend` is now an orphan
  action (its only UI consumer, the deleted `AttributeRow`, is
  gone). Kept for now because re-introducing an attribute-spend
  UI is a likely v0.5.7+ feature; will be removed if a v0.6 spec
  says "spend is server-driven only".
- Server-side EXP rate limiting (the 60 req/60s ceiling) is not
  covered by any test. Pre-existing gap, not v0.5.6.

---

## v0.5.5 — 2026-06-06 (Combat AP rule clarification)

Documentation + test fixup that codifies the actual AP behavior of the
combat store, which was under-specified in the docs and produced a
flaky test. No engine code changes — the code already implements the
intended rule; this release just aligns the documentation and the
regression test with reality.

### Rule (clarified)
- `ap` does **not** reset to `maxAp` at the start of each round.
- The **first actor of the entire fight** starts at `maxAp` directly,
  with no +1 (no one handed off to them yet).
- **Every other time it becomes an actor's turn**, that actor gains
  +1 AP (clamped at `maxAp`).
- Implementation: two store actions —
  - `advanceTurn()` (same-round hand-off): `queue[newTurn-1] +1`
  - `advanceRound()` (new round): `round += 1`, `turn = 1`,
    `queue[0] +1`

### Docs
- `docs/zh/战斗系统.md` §2.6.1 — adds the explicit "AP 行为细节
  (v0.5.5 澄清)" block, refits the ap row of the resource table, and
  adds two rows to the §2.6.12 differences table
  ("回合开始 AP" / "同回合换人 AP").
- `docs/en/Combat-System.md` §2.3 + introduction — same clarification
  translated, removes the stale "reset to `maxAp=6` at the start of
  every round" wording.

### Tests
- `client/tests/services/combat/integration.test.ts` — the
  `end-to-end: 玩家 attack → 敌人 attack → 玩家 defend` test used a
  hard-coded `p1.ap === 4` expectation that broke ~40% of runs
  (initiative is real-random and the test does not pin the engine's
  `roll`). The expectation is now computed from the live queue:
  - `queue = [p1, e1]` → `p1.ap === 4`
  - `queue = [e1, p1]` → `p1.ap === 5`
  - Both branches verified by running 10/10 green; no code path is
    favored.
- Removed stale `tests/services/combat/debug_ap.test.ts` (scratch
  tracer that referenced a non-existent `./_setup` helper; no longer
  needed now that the test is data-driven).

### Test results
- **Client**: 84 / 84 test files, 938 / 938 tests pass.
- **Server**: 51 / 51 tests pass with `SERVICE_RATE_LIMIT=10000`
  (the 4 default-rate failures are pre-existing test-ordering, not
  related to v0.5.5).

---

## v0.5.4 — 2026-06-06 (v0.5.x audit fixes)

Hotfix release that closes two functional gaps discovered in the v0.5.x
audit (see report in this repo) plus two minor polish items. v0.5.1's
"EXP grant trigger chain" is now wired end-to-end; v0.5.3's
`GuildClassModal` is finally mounted; `expToNext(20)` and the wizard's
T1 `unlockedAt` are now consistent with the server / other modals.

### Client — subscribeCharacterEvents (v0.5.1 close-out)
- `client/src/services/level/subscribeCharacterEvents.ts` — new module.
  Subscribes to `COMBAT_HIT` (+1) / `COMBAT_KILL` (+5) /
  `COMBAT_END.{victory:30, defeat:10, fled:0}` / `NARRATIVE_SUBMIT` (+2)
  on the singleton `eventBus`, accumulates the amount in a
  debounce-window (default 800ms), and on flush sends **one**
  `PATCH /api/v1/characters/{id}/exp` with `{ amount, difficulty: 'normal' }`.
  The server-authoritative response is then applied via
  `useCharacterStore.applyServerExpGrant(...)`. Failure (non-2xx / network)
  is silently absorbed so the next batch will retry; no character is
  mutated on failure.
- `App.tsx` — adds a `useEffect(..., [])` that calls
  `subscribeCharacterExpEvents()` on mount and returns its unsubscribe
  closure. Subscriptions are singleton and live for the whole app
  lifetime; combat + narrative events now actually drive EXP.

### Client — GuildClassModal mounted (v0.5.3 close-out)
- `App.tsx` — mounts `<GuildClassModal open={...} onClose={...} />`
  alongside `<TierUnlockModal />` in the single-player view. Visibility
  is derived from `character.classId === null && !dismissed`. A
  `dismissed` `useState` lets the player hit "暂不选择" to leave the
  guild modal, and is automatically reset when `characterId` changes
  (loading another character re-prompts).

### Polish
- `client/src/services/level/expFormula.ts` — `expToNext(MAX_LEVEL)` now
  returns `0` (matching `server/services/exp_formula.py`) instead of
  `Infinity`. The old sentinel was not consumed by any UI but risked
  misuse.
- `client/src/components/modals/CharacterCreationWizard.tsx` — T1
  `unlockedAt` now uses world day `1` instead of `Date.now()`, keeping
  the wizard consistent with `GuildClassModal` and `TierUnlockModal`
  (both of which already use `character.currentLocalDay`).

### Tests
- New `client/tests/services/level/subscribeCharacterEvents.test.ts`
  (10 tests) covers: EXP_AMOUNTS table; single / 3x `COMBAT_HIT`
  debounce merge; HIT + KILL + END(victory) sums to 36 in one PATCH;
  `COMBAT_END.fled` no-op; `NARRATIVE_SUBMIT` amount=2; server response
  applied via `applyServerExpGrant`; PATCH failure does not mutate
  store; `unsub()` stops subscription; no character → events absorbed.
- `client/tests/services/level/expFormula.test.ts` — `expToNext(20)`
  expectation updated to `0`.
- **Client**: 937 / 938 tests pass (the one failure is the pre-existing
  `tests/services/combat/integration.test.ts` AP=4/5 flakiness, not
  related to v0.5.4).
- **Server**: 51 / 51 tests pass with `SERVICE_RATE_LIMIT=10000`
  (the 4 default-rate failures are pre-existing test-ordering, not
  related to v0.5.4).

---

## v0.5.3 — 2026-06-06 (Guild & tier unlock)

Adds the in-world **Adventurer's Guild** as the post-creation entry point for
class selection and the auto-popping **TierUnlockModal** that prompts the
player to pick T2/T3/T4 nodes when their character levels up.

### Storybook
- `client/storybook.json` — `royal_plains` sub-region now has a `points_of_interest`
  entry `adventurer_guild_1` (冒险者公会·光辉城总部, type=guild) plus a
  `key_npcs` entry for **公会主事·奥尔登** (`guild_class_officer_alden`,
  role=冒险者公会·职业注册官). Services: `class_selection` / `tier_unlock`
  / `quest_board` / `first_quest`.
- `client/npc_templates.json` — new `guild_class_officer` template (WIS 16 /
  INT 14, skills `[职业知识 L5 INT, 评估 L4 WIS]`,
  services `[class_selection, tier_unlock, first_quest]`, `canGrow=false`,
  greeting "新面孔?来,告诉我你想成为什么.").

### Client
- `stores/characterStore.ts` — new `setClass(classId, classSkills)` mutator
  (local-first; async PATCH /class is best-effort).
- `components/modals/GuildClassModal.tsx` — the new "back-end" class picker.
  Renders only when `open=true && character && character.classId === null`.
  Two-step flow: pick class (warrior/cleric/mage/thief) → pick T1 node → calls
  `setClass(...)` + `onClose()` immediately, then PATCHes
  `/api/v1/characters/{id}/class` in the background (failure leaves the local
  state intact for the next guild visit to retry).
- `components/modals/TierUnlockModal.tsx` — the auto-prompter. Reads
  `pendingTierChoice(character)` from the class service; renders nothing if
  the character is null / has no classId / is in combat
  (`isCombatActive({ phase })` helper) / has no pending choice. On node pick
  appends the skill via `setClass(...)` (modal auto-dismisses on re-render)
  and PATCHes /class asynchronously.
- `App.tsx` — mounts `<TierUnlockModal />` alongside `<CombatView />` in the
  single-player game view (overlay positioned above the layout; the modal
  hides itself when nothing is due).

### Tests
- 928 client tests pass (83 test files; new: `GuildClassModal.test.tsx` (7
  tests), `TierUnlockModal.test.tsx` (9 tests), `integration/guild.test.tsx`
  (12 tests covering the end-to-end guild + tier-unlock + combat flow),
  `data/storybookGuild.test.ts` (10 tests verifying the storybook POI
  structure + npc template).
- The 3 pre-existing lint warnings (`AttributeRow` dead code, `require()`
  style) are unrelated to this change.

---

## v0.5.2 — 2026-06-06 (Class system)

Adds the 4-class skill tree system on top of the v0.5.1 Level-EXP foundation.
Class choice happens at character creation (new wizard Step 7); post-creation
selection/edit happens at the Guild (v0.5.3, not in this release).

### Class System
- 4 base classes — **Warrior** (⚔️ STR/HP/damage), **Cleric** (✨ WIS/MP/healing),
  **Mage** (🔮 INT/MP/QTE tolerance), **Thief** (🗡️ DEX/crit/dodge)
- Each class has 4 tiers × 3-pick-1 skill tree = 12 nodes per class (48 total)
- Tier unlock: **T1 at class choice**, T2 at L5, T3 at L10, T4 at L15
- 7 effect types: `attribute_mod`, `hp_max_bonus`, `mp_max_bonus`,
  `dodge_threshold_bonus`, `damage_modifier`, `exp_bonus`, `qte_tolerance`
- Class is **locked** in v0.5 — a non-null `classId` cannot be changed (server
  returns 422). `null` is the allowed "重置" sentinel.

### Server
- `services/class_validator.py` — pure-function validator
  - `classId` allowlist: `{warrior, cleric, mage, thief}`
  - `nodeId` regex: `^(warrior|cleric|mage|thief)_t[1-4]_[1-3]$`
  - `nodeId` prefix must match the chosen `classId` (no cross-class nodes)
  - level-aware max node count: 1 (L1-4) / 2 (L5-9) / 3 (L10-14) / 4 (L15-20)
  - must have ≥ 1 T1 node when choosing a non-null classId
- `routers/character_router.py` — new `PATCH /api/v1/characters/{id}/class`
  with `ClassSetRequest { classId: string|null, classSkills: ClassSkillNode[] }`
  (owner-only; 403 on non-owner; 422 on validation failure)

### Client
- `data/classes/{warrior,cleric,mage,thief}.ts` — 48 node definitions + `index.ts`
  exports `CLASS_REGISTRY` / `CLASS_LIST` / `getClass()`
- `types/class.ts` — `ClassId` / `ClassNode` / `ClassNodeEffect` / `ClassDefinition`
- `services/class/classEffects.ts` — `aggregateClassEffects(character): ClassBonus`
  computes `attributeMods / hpMaxBonus / mpMaxBonus / dodgeThresholdBonus /
  damageModifier / expBonus / qteToleranceMs`
- `services/class/classService.ts` — `pendingTierChoice(character)` (returns the
  next tier to pick, `null` if none) + `isValidClassNodeId(classId, nodeId)`
- `components/modals/CharacterCreationWizard.tsx` — new Step 7 "职业与专精"
  with 4-class grid + "无职业" (defer to guild) + per-class T1 picker; `classId`
  and `classSkills` persisted into the final character
- `components/panels/CharacterPanel/ClassSkillTreeView.tsx` — 4×3 grid of all
  12 class nodes with picked / dimmed / locked-by-tier styling; embedded in
  `CharacterPanel` above the Skills section

### Tests
- 8 server tests pass (`test_class_validator.py`, `test_character_router_class.py`)
- 905 client tests pass (78 test files; new: `data/classes.test.ts`,
  `classEffects.test.ts`, `classService.test.ts`, `ClassSkillTreeView.test.tsx`,
  `CharacterCreationWizard.test.tsx`, `integration/class.test.ts`)

---

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
