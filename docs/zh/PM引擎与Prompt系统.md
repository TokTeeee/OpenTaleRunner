# PM 引擎与 Prompt 系统

## 一、介绍

PM（Prompt Manager）引擎是 OpenTaleRunner 客户端与 LLM（GM）之间的核心桥接层，负责组装、发送、解析 Prompt，将服务器端世界数据与客户端角色数据统一注入给 GM，使每次玩家行动都能得到连贯、准确的叙事响应。

**7 层 Prompt 分层架构**：Prompt 由世界层、角色层、场景层、上下文层、任务指令层、JSON Schema 层和查询协议层逐层叠加组成。每层职责清晰，可独立裁剪和定制，确保 GM 拥有完成叙事所需的最小且最精准的上下文。

**多轮查询协议**：传统方案将全部数据（物品列表、NPC 档案、编年史等）一次性注入 Prompt，导致大量 Token 浪费在 GM 并不需要的数据上。多轮查询协议改为"客户端注入核心上下文 + GM 按需查询"，初始 Prompt 从 ~2400 tokens 压缩到 ~1200 tokens（节省约 50%），按需产生的查询轮次 Token 仅在真正需要时才产生。

**Token 预算系统**：基于优先级分层和动态分配算法，确保在任意模型 Context Window 限制下，重要数据（HP、位置、行动）始终优先注入，次要数据（背包杂物、远古编年史）按预算灵活降级为精简版或延迟到查询协议。

---

## 二、设计

> **架构总览**：`PromptBuilder` 类实际有 **11 个** `build*` 方法，且没有"按层一一对应"的强制关系（部分层共用一个方法，部分方法横跨多层）。"七层"是 GM 视角的语义分类，不是代码实现边界。本节按真实代码列出 11 个 `build*` 方法，**七层概念保留为读者理解的语义脚手架**。

### 2.1 Prompt 分层架构

PM 引擎的每一轮 GM 交互 Prompt 由 `PromptBuilder` 类的 **11 个 `build*` 方法** 组合产出（按代码实现顺序）：

| 层级 | 名称 | 职责 | 注入时机 | Token 占比 |
|------|------|------|----------|------------|
| 1 | 世界层 | 设定世界观、时代、局势、叙事风格 | 所有变体 | 15-25% |
| 2 | 角色层 | 玩家数据：属性、技能、装备、背包、状态 | 所有变体 | 10-15% |
| 3 | 场景层 | 位置、地形、天气、已知 NPC、幽灵 NPC | 所有变体 | 10-20% |
| 4 | 上下文层 | 位置锚点 + 近期对话历史 | Scene/Advance | 20-40% |
| 5 | 任务指令层 | 本轮 GM 需完成的任务列表 | Scene/Advance | 3-5% |
| 6 | JSON Schema 层 | 输出结构约束（NarrativeResponse） | Scene/Advance | 3-5% |
| 7 | 查询协议层 | 数据查询接口说明和可用查询提示 | Advance（可选） | 2-5% |

**世界层** (`PromptBuilder.buildWorldLayer()`)：包含 GM 身份声明、世界观文本（来自 `worldStore.worldLore`）、当前时代（`currentEra`）、世界局势（`milestones`）、近期动态（`recentChronicle`）、当前区域状态（`regions`）以及 9 条叙事风格指南。离线时回退到硬编码的简短文本。

**角色层** (`PromptBuilder.buildCharacterLayer()`)：包含角色姓名/背景、六维属性（STR/DEX/CON/INT/WIS/CHA）、技能列表（含等级与描述）、当前装备（武器/防具/饰品）、背包概要（截断 200 字）、HP/体力状态、异常状态、近期 3 天经历摘要。

> **附加层**（`PromptBuilder` 中存在，常见集成路径）：
> - **Party 层** (`PromptBuilder.buildPartyLayer()`)：在 `buildSceneGeneratePrompt` / `buildNarrativeAdvancePrompt` / `buildCombinedAdvancePrompt` 中显式调用，注入队伍成员（NPC / 动物 / 怪物 / 幽灵 NPC）的 HP / 忠诚度 / 战斗与辅助能力。`buildActionEvaluatePrompt` 与 `buildCombinedAdvanceWithQueriesPrompt` 不调用此层。
> - **Ghost NPC 提示层** (`PromptBuilder.buildGhostEncounterHint()`)：当场景层有幽灵 NPC（其他玩家化身）时，生成"附近幽灵 NPC 偶遇提示"插入到 Combined Advance 任务指令末尾，提示 PM 在叙事中考虑玩家之间的偶遇（见 `narrative.npcsIntroduced` 字段）。

**场景层** (`PromptBuilder.buildSceneLayer()`)：包含世界日、大区域/子区域、位置锚点、地形、天气、行动点数、当前区域已知 NPC 完整档案以及同区域幽灵 NPC（其他玩家化身）摘要（`buildKnownNPCs` + `buildGhostNPCText` 逐个构造）。

> `PromptBuilder` 类实际有 **11 个 `build*` 方法**（`buildWorldLayer` / `buildCharacterLayer` / `buildCharacterLayerSlim` / `buildPartyLayer` / `buildSceneLayer` / `buildSceneLayerSlim` / `buildKnownNPCs` / `buildGhostNPCText` / `buildGhostEncounterHint` / 4 个 `build*Prompt` 顶层组装器）。"七层"是按 GM 视角的语义分类，不是代码实现边界。

**上下文层**：位置锚点（500 字加强版，带 ⚠ 标记）和最近 16 条对话消息（每条截断 150-200 字，标注"玩家行动"/"叙事"/"系统"），为 GM 提供即时剧情上下文。

**任务指令层**：四种 Prompt 变体中仅 **Combined Advance** 和 **Scene Generate** 实际使用。Combined Advance 要求 GM 同时完成：①评估行动耗时 → `time_elapsed`；②叙述结果（2-6 句）→ `narrative`；③生成 3 个选项 → `choices`；④评估状态影响 → `state_changes`；⑤回报/物品 → `consequences`；⑥给出精确位置 → `current_location`。

**JSON Schema 层**：强制 GM 输出符合 `NarrativeResponse` 结构的 JSON，包括叙事文本、消耗时间、位置、选项、后果（物品得失/货币变动/声望变动/状态变动/属性变动/异常状态）、引入的 NPC、场景修正值和氛围。

**查询协议层**：通知 GM 可用的数据查询接口（`inventory_search`、`npc_lookup`、`location_info`、`character_state`、`skill_check`、`recent_events`、`world_lore`），以及在 Token 预算紧张时可通过查询获取的额外数据提示。

---

### 2.2 多轮查询协议

#### 设计动机

传统方案在每次 Prompt 调用前将所有数据（完整物品列表、NPC 列表、对话历史、编年史）一次性注入，大量 Token 消耗在 GM 可能根本不需要的数据上，且固定截断策略（背包 200 字、锚点 500 字）牺牲了精度。

查询协议将交互改为 **多轮按需模式**：

```
客户端 ──[注入核心上下文]──► LLM ──[数据查询]──► 客户端
                                    ◄──[查询结果]──
                              LLM ──[输出叙事]──► 客户端
```

对玩家完全透明——交互体验与单轮全量注入一致。

#### 消息格式

GM 响应有两种类型：

**类型 A：数据查询（Query）**
```json
{
  "type": "query",
  "reasoning": "我需要确认玩家携带了哪些武器才能描述修理场景",
  "queries": [
    {"query_id": "q1", "intent": "inventory_search", "keyword": "剑"},
    {"query_id": "q2", "intent": "npc_lookup", "name": "铁匠", "region": "铁炉城"}
  ]
}
```

**类型 B：最终叙事（Narrative）** — 标准 `NarrativeResponse` JSON，含 `narrative`、`choices`、`consequences` 等字段。

#### 查询类型

| intent | 参数 | 返回值 |
|--------|------|--------|
| `inventory_search` | `keyword` | 匹配的物品完整信息（名称/描述/效果/耐久） |
| `npc_lookup` | `name`, `region?` | NPC 档案（外貌/性格/关系/历史） |
| `location_info` | `location` | 是否已探索、上次访问的叙事摘要 |
| `character_state` | `aspects?` | HP/体力/属性/异常状态 |
| `skill_check` | `keyword` | 匹配的技能详情 |
| `recent_events` | `count?` | 最近 N 条编年史摘要 |
| `world_lore` | `topic` | 世界观中与主题相关的段落 |

#### 交互流程

```
玩家: "我去铁匠铺修理我的剑"
  → Turn 1: 客户端注入核心上下文（世界层 + 角色概要 + 场景 + 查询协议）
  ← GM 返回 Query: {inventory_search("剑"), npc_lookup("铁匠")}
  → 客户端 QueryResolver 查询本地数据，组装结果
  → Turn 2: 客户端将查询结果续接到对话
  ← GM 返回 Narrative: "你推开格里姆铁匠铺的木门..."
```

#### 降级策略

如果 LLM 不支持查询协议（直接返回叙事而非 Query），客户端提取 JSON 后若 `type !== "query"` 则直接作为最终叙事处理；若返回非 JSON 文本则使用 `parseNarrativeResponse` 正常处理。实现透明降级——旧 LLM 行为不变。

#### JSON 解析回退

> `PMEngine.parseNarrativeResponse()` 含 **三层回退**：
> 1. 正常 `JSON.parse(text)`。
> 2. 失败时尝试 `unwrapCodeFence(raw)` 移除 ``` 围栏后再 `JSON.parse`。
> 3. 仍失败时调用 `extractLooseJsonFields(raw)`：用正则 + 平衡花括号/方括号扫描，从损坏的 JSON 中提取 `narrative` / `scene_description` / `time_elapsed` / `current_location` / `scene_modifier` / `choices` / `consequences` / `atmosphere` / `npcs_introduced` 9 个字段（见 `PMEngine.ts:474-505`）。
> 4. 全部回退后仍无字段时，返回 `{ narrative: <原始文本> }`，保证 UI 仍能展示。

#### Token 节省

| 模块 | 全量注入 | 按需查询 |
|------|---------|---------|
| 角色层 | 完整属性+技能+背包全列表+NPC列表 | 仅属性+技能+装备名+HP |
| 场景层 | 区域+NPC全档案+幽灵NPC+锚点500字 | 区域+位置+天气+锚点200字 |
| 上下文 | 16条全量 | 摘要或最近3条 |

**初始 Prompt 从 ~2400 → ~1200 tokens（减少 50%）**，查询轮次额外 Token 按需产生。最大查询轮次 `MAX_QUERY_ROUNDS = 3`。

---

### 2.3 2d6 判定系统

Combined Advance 内置判断机制：GM 每次需先评估玩家行动的**合理程度**，再决定叙事走向。

- **判定基准**：由角色六维属性（STR/DEX/CON/INT/WIS/CHA，范围 3-18）提供参考基线——GM 根据行为对应属性和当前环境评估难度
- **离谱度映射（Absurdity Mapping）**：已废弃的 `buildActionEvaluatePrompt` 曾专门评估行为离谱程度，**该能力当前未通过独立函数实现**——2d6 判定系统直接通过 GM 叙事反馈体现离谱度（无 `estimateAbsurdity` 之类的本地预评估函数）。离谱度以 2d6 判定为参考，结果映射到叙事变体：合理 → 顺利叙事 / 偏难 → 部分成功或代价 / 离谱 → 失败或意外后果
- **状态联动**：判定结果直接关联 `consequences` 中的 `hp_change`、`state_changes`（疲劳/士气等）、`attribute_changes` 和 `conditions_added`

---

### 2.4 故事书集成

**数据流**：服务器端故事书（StoryBook）是世界观和区域数据的唯一权威来源。启动时 `initPM` 从服务器拉取故事书的完整世界设定（`worldLore`）、里程碑（`milestones`）、编年史（`chronicle`）和区域数据（`regions`），注入 `worldStore`。PM 引擎在组装 Prompt 时从 `worldStore` 读取并注入世界层。

**故事书版本兼容**：角色卡片（`.sao-char.json`）携带 `storybookHash`。导入角色时校验：若哈希不匹配则弹出警告（"角色来自不同版本的故事书"），但允许导入——不兼容的 NPC 或物品标记为"已失效"。

**区域差异化**：故事书通过 `PromptOverride` 机制为不同区域定义差异化叙事风格（详见 2.7 节）。如王都平原附加"宫廷感和政治暗流"指引，魔王领地附加"压迫感和恐惧氛围"指引。

**离线缓存**（规划中）：`initPM` 响应缓存到 `localStorage`，离线时读取缓存而非回退到 10 字硬编码，确保离线游玩时 GM 拥有完整世界观。

---

### 2.5 流式输出

PM 引擎支持 LLM 的流式输出（Streaming），在玩家等待 GM 回复时逐 token 展示叙事文本，提升交互沉浸感。

- **实现方式**：
  - `PMEngine.combinedAdvance()` —— 非流式版本, 调用 `llmClient.chat()`, 阻塞等待完整响应
  - `PMEngine.streamCombinedAdvance()` —— 流式版本，调用 `llmClient.streamChat()`，返回 `AsyncGenerator<string, NarrativeResponse, void>`，逐 chunk yield 文本，结束返回解析后的 `NarrativeResponse`
  - 两个方法共享 `buildCombinedAdvancePromptString()` 私有方法, 确保 prompt 装配完全一致
- **查询协议兼容**：流式输出过程中若 GM 返回 Query（非 Narrative），客户端累积到完整 JSON 后暂停流式展示、执行查询解析、在后台续接第二轮调用——玩家感知到的仍是连续的"GM 正在思考..."
- **状态指示**：流式输出期间 `isWaitingForPM` 保持 `true`，叙事区实时更新文本。若 GM 查询物品，可将第一个 Query 的 `reasoning` 展示为"GM 正在确认你的装备..."
- **Budget 模式降级**：`experimental.enableTokenBudget = true` 时, `streamCombinedAdvance()` 自动 fallback 到 `combinedAdvanceWithBudget()` 非流式 (预算推导需要整段 prompt 完整组装), 整段 yield

---

### 2.6 Token 预算管理

#### 问题

当前所有数据采用**固定字节截断**（背包 200 字、锚点 500 字、对话 16 条），缺乏基于**重要性**的动态分配——重要数据（HP、位置）与次要数据（背包杂物、远古老剧情）被同等对待。

#### 优先级分层

```
P0 — 必须完整，不可裁剪：
  GM 身份声明、叙事风格指南（精简为禁忌规则）、玩家行动文本、
  判定结果、任务指令 + JSON Schema、当前区域名 + 子区域名

P1 — 优先保证，可轻度裁剪：
  角色名 + HP/体力、当前装备（仅名称）、当前位置（结构化）、
  最近 3 条对话、天气 + 光照

P2 — 预算允许时完整注入：
  角色属性 + 技能列表、近期经历（3 条摘要）、背包重要物品、
  当前区域 NPC（好感度排序，前 5 完整/其余姓名）、幽灵 NPC（前 3 个）

P3 — 仅在充裕时注入：
  完整世界观、世界局势/里程碑/编年史、对话第 4-16 条、
  背包全部物品、派系态度、区域事件列表
```

#### 分配算法

1. P0 组件无条件分配完整空间
2. P1-P3 按优先级轮次分配，同一优先级内按 **相关性得分 / Token 成本** 排序（性价比优先）
3. 充裕 → 完整版；适中 → 精简版（仅 P1/P2，P3 无精简版）；不足 → `defer_to_query`

#### 三级水位策略

| 水位 | 判定 (allocated/maxTokens) | 策略 |
|------|--------------------------|------|
| 充裕 (abundant) | ≤ 40% (使用率低) | 全部完整注入，无查询提示 |
| 适中 (moderate) | 40-70% | P0 完整 + P1 完整 + P2 精简 + P3 defer |
| 紧张 (tight) | > 70% (使用率高, 空间告急) | P0 完整 + P1 精简 + P2/P3 全 defer，查询协议加"重要"前缀 |

> `determineBudgetLevel` 等级判定逻辑：高使用率（>70%）返回 `tight`，低使用率返回 `abundant`（高使用率 = 告急，低使用率 = 充裕）。判定函数实现在 `client/src/services/engine/TokenBudget.ts:50-63`。

#### 配置化

```typescript
interface PromptBudgetSettings {
  enabled: boolean;          // 字段定义存在但代码不读；Token Budget 实际启用由 experimental.enableTokenBudget 控制
  maxInputTokens: number;    // 0 = 自动计算（基于模型 Context Window）
  safetyMargin: number;      // 默认 0.9（使用 90% 上下文窗口）
  responseReserve: number;   // 默认 1024
}
```

> `PromptBudgetSettings.enabled` 字段定义在 `settingsStore.ts:57` 存在，但代码中**无任何读取**（`PMEngine.ts:162/198` 只读 `settings.experimental.enableTokenBudget`）。`enabled` 字段是**死字段**，实际行为取决于 `experimental.enableTokenBudget = false`（默认）。

#### 组件到查询映射

当组件被延迟到 Query/Resolve 时，GM 可通过以下查询类型获取等效数据：

| 组件 | 可用查询 |
|------|---------|
| `backpack_full` | `inventory_search(keyword)` |
| `known_npcs` | `npc_lookup(name, region?)` |
| `world_lore` | `world_lore(topic)` |
| `character_state` | `character_state(aspects?)` |
| `character_skills` | `skill_check(keyword)` |
| `world_chronicle` | `recent_events(count?)` |

---

### 2.7 Prompt 模板定制

故事书编写者可覆盖 Prompt 的指定片段（Slots），实现区域级别和节拍级别的差异化。

#### 可覆盖槽位

```typescript
type PromptSlot =
  | 'identity'            // GM 身份声明
  | 'worldLore'           // 世界观描述
  | 'narrativeGuide'      // 叙事风格指南
  | 'sceneGenerateTask'   // 场景生成任务指令
  | 'combineAdvanceTask'  // Combined Advance 任务指令
  | 'queryProtocol'       // 查询协议说明
  | 'jsonSchemaAdvance'   // Combined Advance JSON Schema
  | 'jsonSchemaScene'     // Scene Generate JSON Schema
  | 'ghostNPCIntro'       // 幽灵 NPC 引入文本
  | 'knownNPCIntro'       // 已知 NPC 引入文本
  | 'preActionHint'       // 行动前引导提示
  | 'customInjection';    // 自定义注入点
```

#### 覆盖定义

```typescript
interface PromptOverride {
  slot: PromptSlot;
  scope: 'global' | 'regional' | 'beat';
  targetIds?: string[];
  mode: 'replace' | 'prepend' | 'append';
  content: string;         // 支持占位符变量
  comment?: string;
}
```

#### 占位符

| 占位符 | 替换为 | 示例 |
|--------|--------|------|
| `{{characterName}}` | 角色姓名 | 艾琳·灰烬 |
| `{{currentRegion}}` | 当前区域名 | 王都平原 |
| `{{currentSubRegion}}` | 当前子区域 | 光辉城·商业区 |
| `{{worldDay}}` | 世界日 | 47 |
| `{{currentEra}}` | 当前时代 | 暗潮纪元 |
| `{{hp}}` / `{{maxHp}}` | HP | 18 / 22 |
| `{{weather}}` | 天气 | 晴朗 |
| `{{terrain}}` | 地形 | 平原 |

#### 安全约束

> 本节"安全约束"列出的 4 条规则在代码侧**仅 schema 类型层面（PromptOverride.mode 类型）有限**——下面 3 条运行时校验**全部未实现**：
> - ❌ JSON Schema 覆盖仅允许 `replace` 模式（防破坏结构）——**未运行时校验**，`prepend`/`append` 不会检查
> - ❌ `queryProtocol` 覆盖不允许删除任何查询类型声明——**未运行时校验**
> - ❌ 覆盖内容长度限制 2000 字符——**未运行时校验**
> - ⚠️ 覆盖内容不允许包含 `{` `}` 之外的 JSON——schema 上不限制，由 LLM 自律
>
> 旧版本将这些列为"已实现"是文档虚构。当前真实行为：所有 PromptOverride 在 `applyOverrides()` 中**只做类型校验 + 占位符替换 + 字符串拼接**，不进行任何注入防御。`sanitizePromptInput`（在用户 action 端）只对玩家输入生效，对 override 内容不生效。**规划小节见"三、规划"第 N 项**。

---

### 2.8 结构化位置

#### 问题

当前使用 `lastNarrative.slice(0, 200)` 作为位置锚点——非结构化的叙事文本切片，GM 需从自然语言中重新解析位置，容易导致位置漂移，且无法精确回答 `location_info` 查询。

#### StructuredLocation 类型

```typescript
interface StructuredLocation {
  region: string;           // 区域 ID
  regionName: string;       // 区域显示名
  subRegion: string;        // 子区域
  specificPlace: string;    // 具体地点（GM 可动态创造）
  description: string;      // 地点描述
  coordinates: { x: number; y: number; z: number };
  firstVisitedAt: string;
  lastVisitedAt: string;
  visitCount: number;
  isKnown: boolean;         // 已探索 vs GM 新创造
}
```

#### gameStore 扩展

- `currentLocation: StructuredLocation | null` — 替代叙事文本切片的结构化位置
- `currentSceneNarrative: string` — 仅用于上下文理解（非位置信息）
- `knownLocations: KnownLocation[]` — 已知地点列表（已有字段，扩展为结构化格式）

#### PromptBuilder 改造

结构化位置优先——若 `data.structuredLocation` 存在则注入精确位置信息（区域·子区域·具体地点 + 描述 + 访问次数 + 坐标）；否则回退到叙事文本切片（兼容旧数据）。位置锚点字段改名为"场景叙事锚点"，不再承担位置定位职责。

#### 位置更新机制

PM 返回 NarrativeResponse 后，客户端检测 `currentLocation` 字段或 `worldEffects` 中的位置变更关键词：
1. 旧位置推入历史
2. 检查 `knownLocations`：已有 → 更新 `visitCount`/时间；新地点 → 新增条目
3. 更新 `currentLocation`

#### 与查询协议联动

`location_info` 查询现在可精确回答"是否已探索"：
- 已探索 → 返回区域名、首次到达时间、访问次数、描述
- 新地点 → 告知 GM 这是未探索位置，可通过 `currentLocation` 字段记录

---

### 2.9 历史压缩

#### 双模式设计

| 模式 | 触发条件 | 方式 | Token 消耗 |
|------|---------|------|-----------|
| 模式 A：结构化时间线 | 预算适中/紧张（默认） | 纯客户端计算，提取行动+结果关键词 | ~200-400 tokens |
| 模式 B：LLM 增强 | 预算充裕 + 用户允许 | 调用轻量 LLM 生成冒险日志摘要 | ~150-300 tokens（摘要本身） |

#### 模式 A 输出格式

```
【近期事件时间线】
世界日47 · 午后 · 王都平原 · 光辉城：
  ▶ 玩家在商业区遇到可疑商人 → 拒绝了走私邀请
  ▶ 前往冒险者公会 → 与老巴托克交谈 → 接取"调查地下水道"委托
  ▶ 在公会结识矮人佣兵（NPC: 布洛克，好感+15）
世界日47 · 傍晚 · 光辉城 · 地下水道入口：
  ▶ 玩家进入地下水道 → PM生成场景
  ▶ [当前行动待评估]
```

#### 压缩算法

1. 按世界日分组
2. 提取每条消息的关键行动（去除文学描写，保留动词子句）
3. 按 Token 预算截断（超标时停止添加）
4. 玩家行动标记 `▶`，叙事标记 `◈`

#### 模式 B 流程

1. 调用 LLM，System Prompt 指定输出格式：`世界日{N} · {区域}：▶ {行动} → {结果} [{后果}]`
2. 客户端缓存压缩结果（同一场景内复用）
3. 在 Combined Advance 中注入压缩文本，原始消息仅保留最近 3 条

#### 与 Token 预算联动

```typescript
if (recentTokens >= 800) → 模式 B 或 16 条全量
else if (recentTokens >= 300) → 模式 A 结构化时间线
else → 仅最近 3 条原文
```

**收益**：对话历史 Token 消耗降低约 60%，且按世界日+位置分组的结构化格式提升故事连贯性。

---

### 2.10 角色卡导出

#### 文件格式

- 文件名：`{角色名}_{导出日期}.sao-char.json`
- 编码：UTF-8，缩进 2 空格
- 示例：`艾琳·灰烬_2026-05-14.sao-char.json`

#### 数据结构

```typescript
interface CharacterCard {
  formatVersion: 1;
  metadata: {
    exportedAt: string;
    exportedFrom: 'sao-client';
    clientVersion: string;
    storybookName: string;
    storybookVersion: number;
    storybookHash: string;          // SHA256，导入时精确匹配
  };
  character: CharacterSnapshot;     // 完整角色状态快照
  avatar?: { mimeType: string; data: string };  // Base64 头像（可选）
  playerNotes?: string;
}
```

CharacterSnapshot 包含：基础身份（姓名/种族/背景/外貌）、六维属性、技能列表（含经验和升级阈值）、物品栏（装备 + 背包 + 货币）、HP/体力、声望、异常状态、世界关联（加入区域/加入世界日/当前本地日）、近期经历、所有已知 NPC 关系状态。

#### 导入逻辑

1. 版本检查：`formatVersion > 1` 则拒绝
2. 故事书兼容性：`storybookHash` 不匹配 → 警告但允许导入，不兼容实体标记"已失效"
3. 数据校验：必填字段、属性范围 [3,18]、HP 合法性
4. 写入 `characterStore` 和 `npcStore`

#### 导入策略

| 场景 | 行为 |
|------|------|
| 无现有角色 | 直接创建 |
| 有角色，同名 | 覆盖 / 合并（保留当前物品）/ 取消 |
| 有角色，不同名 | 替换当前角色 / 取消 |
| 故事书版本不同 | 警告但允许导入 |
| 校验失败 | 拒绝，显示错误原因 |

---

## 三、规划

### 已实现

Prompt 分层架构、Combined Advance 变体、查询协议 Query/Resolve、2d6 判定系统和流式输出基础支持已交付，构成了 OpenTaleRunner 叙事的稳定骨架。

### 演进方向

**核心基础设施**：期望建立完善的 Token 预算管理系统，基于优先级分层动态分配上下文空间，让重要数据始终占据优先级高地。同步推进结构化位置锚点，以精确的坐标与地名取代叙事文本切片，彻底消除位置漂移。

**上下文与对话优化**：期望引入多源上下文合并策略，通过去重和相关性评分智能裁剪注入内容。配合对话历史压缩（客户端结构化时间线提取与 LLM 增强摘要双模式），让 GM 在海量对话中始终保持对关键剧情的清晰感知。

**背包与 NPC 信息注入**：期望实现背包物品按优先级分层注入，让装备和重要道具在 Token 紧张时优先呈现。同步推进幽灵 NPC 个性提取和 NPC 关系上下文增强，使世界中的每一个角色都拥有可感知的个性与关系网络。

**Prompt 定制与角色卡**：期望开放 Prompt 模板覆盖能力，允许不同区域、不同节拍拥有差异化的叙事风格指引。同时完善角色卡导出/导入体系，让角色可在不同世界、不同设备间自由流转。并实现世界观离线缓存，确保离线游玩时 GM 依然拥有完整的世界设定。

**流式与多模型适配**：期望增强 Combined Advance 流式输出，在查询协议轮次间提供无缝的流式过渡。同步针对不同 LLM（DeepSeek / GPT / Claude）的 Context Window 和指令遵循特性，自动调整预算参数与任务指令措辞，让每种模型都释放最佳叙事潜能。

### 实验性开关

所有新优化通过 `settingsStore` 中的 feature flag 控制，关闭后立即回退到当前逻辑——Token 预算回退固定截断、结构化位置回退叙事切片、对话压缩回退 16 条原文、覆盖回退硬编码 Prompt。

### 后续需要改进

> 本节集中列出本系统**承诺但当前未实现**的功能。每条都对应文档中**虚构**的具体功能描述，现状是**代码未实现**——而非文档"理解有误"。

| # | 文档原承诺 | 真实状态 | 计划版本 |
|---|-----------|---------|------------------------------------------|
| 未实现-1 | **JSON Schema 覆盖仅允许 `replace` 模式** | `applyOverrides()` 不限制 `mode`，允许 `prepend/append` | 待 v0.6：在 `applyOverrides` 中加 `mode !== 'replace'` 拒绝逻辑 |
| 未实现-2 | **`queryProtocol` 覆盖不允许删除任何查询类型** | `queryProtocol` 字段可任意改写 | 待 v0.6：解析后与默认 query type 列表求差集，缺失项补回 |
| 未实现-3 | **覆盖内容长度限制 2000 字符** | 无任何长度校验 | 待 v0.6：`if (override.content.length > 2000) throw new Error(...)` |
| 未实现-4 | **"七层 Prompt 架构各有独立 build 方法"** | 实际 11 个 `build*` 方法，无"层—方法一一对应"关系 | 本节按代码方法列出 |

## 四、v0.4 增量

v0.4 给 PM 引擎引入两个新维度：**跨会话 NPC 记忆** 和 **游戏内 Codex 图鉴**。前者让 GM 长期召回玩家与 NPC/物品/事件的过往事实，后者让物品 / NPC / 地点在玩家首次遭遇时自动解锁图鉴条目。

### 4.1 长期记忆段注入 (`buildGmMemoryRetrievalSection`)

v0.4 在 `PromptBuilder` 中新增第 12 个 `build*` 方法，专为 GM 检索长期记忆设计。

#### 4.1.1 注入位置

- 嵌入点: `buildCombinedAdvancePrompt` 末尾，紧跟在「最近对话」之后
- 段名: `## 🧠 长期记忆 (GM 检索 - N 条)`
- 优先级: 与最近对话同级，但**仅在 settingsStore.memory 开启时**注入

#### 4.1.2 检索流程

1. **query 拼装** — `actionText + game.currentRegion + game.currentSubRegion + npcNames + itemNames`
2. **同步检索** — `MemoryManager.searchSync({ query, scopes: ['npc','item','event','player','location','lore'], topK: 8, minScore: 0.05 })`
3. **活跃实体豁免** — `MemoryManager.setActiveEntities(['character:<id>', 'npc:<name>', ...])`，用于衰减策略保护
4. **格式化** — 每条记录格式: `- NPC [第N天] <content> (重要性: 0.X)`
5. **失败容错** — `try/catch` 包裹, 检索失败不阻塞主流程 (返回空字符串)

#### 4.1.3 测试覆盖

- `tests/services/engine/PromptBuilder-memory.test.ts` — 1 个集成测试
- `tests/services/memory/integration.test.ts` — 7 个测试 (commitEpisode / parseSummaries / fallbackSummary / 🧠 段检索)

### 4.2 NPC 记忆层 (`EpisodicSummarizer` + `MemoryManager`)

#### 4.2.1 数据写入时机

- **触发点**: `useActionSubmit.ts:440-449`，在 `applyConsequences` 之后异步调 `commitEpisode()`
- **不阻塞主流程**: `void commitEpisode(...)` 显式标注, 失败时仅打日志
- **提取内容**: `npcsInvolved` (从 reputationChange keys) + `itemsChanged` (从 itemsGained/lost names) + `locationChanged` (narrative.currentLocation vs game.currentLocation)

#### 4.2.2 摘要策略

v0.4 采用**双路径**摘要:

| 路径 | 何时用 | 行为 |
|------|------|------|
| `parseSummaries(llmOutput)` | LLM 在 narrative 后输出 `[SUMMARIES]…[/SUMMARIES]` 块 | 解析为结构化 MemoryRecordInput[] (含 scope/entityId/content/importance) |
| `fallbackSummary(episode)` | LLM 没输出块 / 解析失败 | 兜底从 npcsInvolved + itemsChanged + narrative 抽 1-3 条事实 |

v0.4 默认走 `fallbackSummary` (避免再插一次 LLM 调用阻塞主流程)。PR-5 计划改造为 PM 请求时一并调 LLM 抽取本轮要点，后续需要改进。

#### 4.2.3 抽象层 (Strategy 模式)

`MemoryBackend` interface + `InMemoryMemoryStore` 现有实现, `Mem0ClientAdapter` 占位。未来切换 Mem0 / 其它后端时, 主架构 (UI / PromptBuilder / Summarizer) 不感知。

### 4.3 Codex 图鉴 (`codexStore` + `codexSignature`)

#### 4.3.1 数据层

- **签名去重**: `codexSignature` 纯函数 (6 单测) — `hash(scope + name + metadata)`, 避免重复解锁
- **store**: `codexStore` (6 单测) — 6 分类 (npc / item / event / location / faction / lore), localStorage 持久化
- **触发时机**: `applyConsequences` 各分支检测新解锁的 codex entry, 写 store + emit Toast

#### 4.3.2 UI 层

- **入口**: RightPanel 顶栏 `📖 图鉴` 按钮
- **Modal**: `CodexModal` 三栏 (scope sidebar / 网格 / 详情)
- **共享组件**: `CodexEntry` (跟 `MemoryEntry` 同款, 6 scope 彩色 icon)
- **关键 commit**: `c0664c6` codexStore; `e34676b` codexSignature; `ac5d049` CodexModal; `e379a86` applyConsequences 触发

### 4.4 v0.4 关键 commit 列表 (memory + codex)

```
fc43abf  spec  (memory)
fe5225a  spec self-review
2f3c24d  plan
1ed1059  types/memory.ts 补 + InMemoryMemoryStore 守卫
a147c9f  useMemory hooks + MemoryManager subscribe + useMemoryInit
577e226  MemoryEntry + MemoryModal
ba3fbe6  useActionSubmit + RightPanel + App + SocialPanel 集成
+ codex (c0664c6 / e34676b / ac5d049 / e379a86)
```

### 4.5 已知约束 (v0.4 后将解决)

- 摘要走 fallback 而非 LLM — v0.9 改用 LLM 在 PM 请求时一并抽取
- 检索是同步全表扫 + cosine 相似度, 数据量 > 1k 后性能下降 — v0.9 换 sqlite-vec
- 记忆层无 mem0 真实接入, 仅占位 — v0.9 切到 Mem0ClientAdapter
- Codex 6 分类 (npc/item/event/location/faction/lore) 不可配置 — 后续
- CodexModal 详情面板与 MemoryModal 重复了 scope 过滤逻辑, 后续考虑共用组件 — v0.5

