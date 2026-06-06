# NPC 系统

## 一、介绍

NPC 系统是 OpenTaleRunner 游戏世界中所有非玩家角色的核心驱动模块，负责 NPC 的数据存储、生成、行为调度、交互检测以及服务端管理。系统采用模块化设计，支持基于模板的批量生成、从玩家描述中动态创建（幽灵 NPC）、昼夜行为调度、以及与玩家的多维度关系追踪。

**核心能力：**

- NPC 全生命周期管理：创建、注册、淘汰、晋升
- 九种内置职业模板，支持从模板或叙述文本生成 NPC
- 幽灵 NPC 机制：短期存在的临时 NPC，2 天后自动过期
- 可配置的行为调度器（FSM + LLM 可选）
- 玩家-NPC 交互检测与态度/关系动态变化
- 13 个 REST API 端点，支持 NPC 的查询、注册、关系管理、语音/肖像等

---

## 二、设计

### 2.1 数据模型

NPC 的核心数据结构为 `GameNPC`，定义如下：

| 字段 | 类型 | 说明 |
|------|------|------|
| `npcId` | `string` | 唯一标识符 |
| `name` | `string` | NPC 名称 |
| `title` | `string` | 头衔/职业称谓 |
| `region` | `string` | 所在区域 |
| `subRegion` | `string` | 子区域 |
| `appearance` | `string` | 外貌描述 |
| `background` | `string` | 背景故事 |
| `personality` | `string` | 性格描述 |
| `motivation` | `string` | 动机/目标 |
| `attributes` | `dict` | 六维属性（力量、敏捷、体质、智力、感知、魅力） |
| `skills` | `list[string]` | 技能列表 |
| `relationship` | `object` | 与玩家的关系对象（见下方） |
| `isHostile` | `bool` | 是否敌对 |
| `canBeRecruited` | `bool` | 是否可招募入队 |
| `canGrow` | `bool` | 是否可成长 |
| `source` | `string` | 来源（`template` / `intro` / `client_created` / `encounter` 等） |
| `secrets` | `list[string]` | NPC 的秘密信息 |
| `faction` | `string` | 所属阵营 |
| `isMet` | `bool` | 玩家是否已见过该 NPC |

**关系对象（`relationship`）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `attitude` | `int` | 态度值，范围 `[-100, 100]` |
| `level` | `string` | 关系等级（根据态度值推导） |
| `firstMet` | `timestamp` | 首次相遇时间 |
| `interactionCount` | `int` | 交互次数 |
| `history` | `list[string]` | 交互历史记录（上限 20 条） |
| `playerKnowsAbout` | `string[]` | 类型实际是字符串数组（玩家从该 NPC 处得知的信息条目），不是 `bool` |

**关系等级（`level`）判定规则：**

| 等级 | 态度值范围 | 说明 |
|------|-----------|------|
| `stranger` | `< 5` | 陌生人 |
| `acquaintance` | `5 – 24` | 相识 |
| `friend` | `25 – 49` | 朋友 |
| `close` | `50 – 79` | 亲密 |
| `ally` | `≥ 80` | 盟友 |

---

### 2.2 生成管线

NPC 的生成由 `NPCGenerator` 类统一管理，支持两种生成方式：

**方式一：从模板生成**

> 职业模板：代码 `client/src/services/npc/NPCGenerator.ts` 中 `DEFAULT_TEMPLATES` 实际只有 **8 个**键：

| 模板键 | 职业 | 说明 |
|--------|------|------|
| `merchant` | 商人 | 偏向魅力与智力，技能涉及交易、估价 |
| `blacksmith` | 铁匠 | 偏向力量与体质，技能涉及锻造、修理 |
| `innkeeper` | 旅店老板 | 偏向感知与魅力，技能涉及烹饪、交际 |
| `guard` | 守卫 | 偏向力量与敏捷，技能涉及警戒、剑术 |
| `healer` | 治疗师 | 偏向智力与感知，技能涉及治疗、草药学 |
| `scholar` | 学者 | 偏向智力，技能涉及知识、研究 |
| `hunter` | 猎人 | 偏向敏捷与感知，技能涉及追踪、射术 |
| `adventurer_guild_staff` | 公会职员 | 均衡属性，技能涉及探索、战斗 |

调用接口：

```
generateFromTemplate(templateKey, region, options)
```

- `templateKey`：模板键，如 `"merchant"`
- `region`：生成区域（必填）
- `options`：可选参数，用于覆盖默认属性或外貌

**方式二：从描述文本生成**

当玩家在游戏中用自然语言描述一个 NPC 时（例如"一个戴着斗篷的神秘旅人"），系统提取关键信息生成 NPC。

**调用接口：**

```
generateFromIntro(intro)
```

`intro` 对象包含：

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 名称 |
| `title` | `string` | 头衔 |
| `appearance` | `string` | 外貌描述 |
| `personality` | `string` | 性格 |
| `region` | `string` | 区域 |
| `relation_to_player` | `string` | 与玩家的关系类型 |

**生成流程：**

> `NPCGenerator.generateFromIntro()` **硬编码六维属性**为 `STR:10/DEX:10/CON:10/INT:10/WIS:10/CHA:12`，并按 `relation_to_player` 是否含"玩伴/朋友/家族"决定初始 `attitude`（25 vs 10）和 `level`（friend vs acquaintance）。`source` 标记为 `client_created`。`playerKnowsAbout` 初始化为空数组（不是 `false`）。

---

### 2.3 幽灵 NPC

幽灵 NPC 是一种临时存在的 NPC，用于支持玩家临时描述的角色。这类 NPC 有生命周期限制，到期自动清理，避免 NPC 数据库无限膨胀。

**核心模块：** `ghost_manager.py`

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `ghost_npc_ttl` | `172800` 秒（2 天） | 幽灵 NPC 的存活时间 |

**`upsert_from_character` 方法：**

当玩家描述一个角色时，该方法执行以下处理：

1. **提取性格标签**——通过 19 条正则表达式匹配性格关键词，如 `/勇敢|胆[小怯]|无畏/` → `brave`
2. **意图推断**——通过 10 条正则模式推断 NPC 的意图，如 `/寻找|在找/` → `seeking`
3. **对陌生人态度**——根据性格标签和意图推断 NPC 对陌生玩家的初始态度值
4. **Upsert 逻辑**——若同名幽灵 NPC 已存在，则更新；否则创建新幽灵 NPC
5. **设置 `expiresAt`**——当前时间 + TTL，到期后由定时清理任务移除

**`expiresAt` 清理流程：**

```
cleanup_expired_ghosts() → 遍历所有幽灵 NPC
    → 若 expiresAt < now → 标记删除 → 移除 NPC 记录
```

> 清理任务由 `server/main.py:54` 的 `_ghost_cleanup_loop` 每 **3600 秒（1 小时）** 触发一次（不是行为调度器的 300 秒 tick）。`cleanup_expired_ghosts()` 复用 `IGhostRepo.remove_expired()`，遍历整个 `ghost_npcs` 表删除过期记录。

---

### 2.4 行为调度

NPC 的行为由 `NPCBehaviorScheduler` 统一调度，以 **300 秒（5 分钟）** 为一个 tick 循环运行。

**架构设计：**

- **Tick 循环：** 每 300 秒扫描所有活跃 NPC，决策下一步行为
- **优先昼夜调度：** NPC 根据游戏内时间和自身职业遵循昼夜节奏（如商人白天营业、夜晚休息）
- **可配置行为：** 每种行为定义为 `ConfigurableBehavior` 对象，基于有限状态机（FSM）规则驱动
- **LLM 行为（可选）：** 在 LLM 模式下，NPC 行为由大语言模型实时生成，用于更丰富的叙事体验

**调度范围：**

> 调度器 `_get_ai_npcs` SQL 包含 `source='ai_npc'` 过滤——**只有 `source='ai_npc'` 的 NPC 会被调度**。由客户端创建（`client_created`）或模板/遭遇生成的 NPC 永远不会被行为调度器处理，需要客户端手动驱动或后续 `npc_behavior` 服务重构。

**行为工厂映射：**

> 实际 `server/services/npc_behavior/rule_fsm.py` 中只有 `ConfigurableBehavior` 一个真正的行为实现，8 个"行为类"全部继承自它（甚至 `BlacksmithBehavior` 别名为 `MerchantBehavior`）。差异化逻辑不在行为类，而在每个 NPC `data.behavior_config` 字段中。

| 职业键 | 类 | 实际行为差异 |
|--------|----|--------------|
| `merchant` | `MerchantBehavior`（= `ConfigurableBehavior`） | `behavior_config.actions` |
| `guard` | `GuardBehavior`（= `ConfigurableBehavior`） | `behavior_config.actions` |
| `villager` | `CivilianBehavior`（= `ConfigurableBehavior`） | `behavior_config.actions` |
| `civilian` | `CivilianBehavior`（= `ConfigurableBehavior`） | `behavior_config.actions` |
| `healer` | `ConfigurableBehavior` | `behavior_config.actions` |
| `scholar` | `ConfigurableBehavior` | `behavior_config.actions` |
| `hunter` | `GuardBehavior`（= `ConfigurableBehavior`） | `behavior_config.actions` |
| `blacksmith` | `MerchantBehavior`（= `ConfigurableBehavior`） | `behavior_config.actions` |

---

### 2.5 交互检测

交互检测模块负责解析玩家行为文本，自动识别与 NPC 的互动并更新关系状态。

**`detectNPCInteraction(actionText, repChanges)`**

- **触发条件：** 通过子字符串匹配检测 `actionText` 中是否包含已知 NPC 的名称
- **执行流程：**
    1. 在 `actionText` 中搜索所有已知 NPC 名称
    2. 若匹配到 NPC → 调用 `meetNPC` 标记相遇
    3. 调用 `addInteraction` 追加交互记录
    4. 调用 `modifyAttitude` 根据 `repChanges`（声望变化值）调整态度

**`handleNPCIntroduced(npcs)`**

当一次性引入一批 NPC 时调用，用于队员共享 NPC 信息的场景：

1. **去重**——`npcs` 列表中已存在的 NPC 跳过
2. **逐个生成**——对每个新 NPC 调用 `npcGenerator.generateFromIntro(intro)`
3. **注册**——调用 `registerNPC` 将新 NPC 加入 NPC 存储
4. **广播事件**——调用 `eventBus.emit(EVENTS.GHOST_NPC_APPEARED, newNPC)`，由本地 `useMultiplayerStore` 派发

> `handleNPCIntroduced`（位于 `client/src/hooks/pmEngine/useActionSubmit.ts`）**只在本地 eventBus 发射 `GHOST_NPC_APPEARED` 事件**，不通过联机模块向其他在线玩家广播。多人共享 NPC 需通过服务端 `POST /api/v1/npcs/register` + `sync_router` 完成。

---

### 2.6 服务端

`NPCService` 是 NPC 系统的服务层，对外暴露 11 个 API 端点（在 `server/routers/npc_router.py` 中定义），同时管理 NPC 的注册与晋升流程。

**API 端点（`/api/v1/npcs`）：**

> `GET /api/npc/relationship` 端点**实际不存在**。关系数据只能通过 `PATCH /api/v1/npcs/{npc_id}/relationship` 更新，并通过 `GET /api/v1/npcs/{npc_id}/full` 间接获取。

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/npcs/known` | `GET` | 获取玩家已知的 NPC 列表（参数 `ids`） |
| `/api/v1/npcs/region/{region_id}` | `GET` | 按区域查询 NPC |
| `/api/v1/npcs/register` | `POST` | 注册新 NPC（参数 `npcData`） |
| `/api/v1/npcs/{npc_id}/relationship` | `PATCH` | 更新玩家与 NPC 的关系（无 GET 版本） |
| `/api/v1/npcs/{npc_id}/behavior` | `GET` / `PATCH` | 获取 / 设置 NPC 行为配置 |
| `/api/v1/npcs/{npc_id}/behavior/tick` | `POST` | 立即驱动一次 NPC 行为 tick |
| `/api/v1/npcs/{npc_id}/voice` | `GET` / `PATCH` | 获取 / 设置 NPC 音色参数 |
| `/api/v1/npcs/{npc_id}/portrait` | `GET` / `PATCH` | 获取 / 设置 NPC 立绘 |
| `/api/v1/npcs/{npc_id}/full` | `GET` | 获取 NPC 完整数据（含关系、升格状态等） |
| `/api/v1/npcs/{npc_id}` | `PATCH` | 客户端同步 NPC 数据（voice/portrait/attributes/skills/behavior_config） |

**NPC 晋升机制：**

NPC 可通过以下条件触发晋升（从幽灵 NPC 转为常驻 NPC）：

| 条件 | 说明 |
|------|------|
| 态度值 `attitude ≥ 80` | 玩家与该 NPC 建立盟友关系 |
| 交互次数 `interactions ≥ 20` | 频繁交互 |
| 3 名以上玩家 & 30 次以上交互 | 多人认同的 NPC |

> 晋升检查**仅在服务端 `NPCService.check_promotion` 实现**，调用入口是 `update_relationship` 之后的自动检查。客户端 `npcStore.promoteNPC` 是手动触发的"故事书式升格"（不检查阈值，直接为 NPC 注入背景和技能），与上面三条件不挂钩。

满足任一条件即触发 `promoteNPC`，移除 `expiresAt` 限制并将 `source` 标记为常驻。

### 2.7 Store API

`npcStore` 是 NPC 数据存储的核心状态管理模块，提供原子化的数据操作方法：

| 方法 | 参数 | 说明 |
|------|------|------|
| `registerNPC` | `npc` | 注册新 NPC，生成唯一 `npcId` |
| `meetNPC` | `npcId, playerId` | 标记玩家已见过该 NPC，设置 `isMet = true` 和 `firstMet` |
| `modifyAttitude` | `npcId, delta` | 调整态度值。`delta` 被钳制使结果在 `[-100, 100]` 范围内，态度变化后自动重新计算 `level` |
| `addInteraction` | `npcId, actionText, playerId` | 追加交互记录至 `history`，上限 20 条（FIFO）。同时 `interactionCount += 1` |
| `processInteraction` | `npcId, attitudeDelta, newInfo` | 实际签名是 `(npcId: string, attitudeDelta: number, newInfo: string[])`，**不是** `(npcId, actionText, repChanges)`。返回 `{ attitudeChange, newInfo, levelChange, narrative, unlockedSkill, unlockedQuest }` |
| `promoteNPC` | `npcId, background, skills` | 客户端手动升格——接收背景文本和技能数组（不是服务端阈值检查） |
| `getPromotableNPCs` | — | 仅客户端查询：`interactionCount >= 20 || attitude >= 80` |

---

### 2.8 API 示例

**示例 1：通过模板生成商人 NPC**

```
POST /api/npc/register
{
  "source": "template",
  "templateKey": "merchant",
  "region": "起始之镇",
  "options": {
    "name": "艾琳",
    "subRegion": "中央市场"
  }
}
```

**响应：**

```json
{
  "npcId": "npc_a1b2c3d4",
  "name": "艾琳",
  "title": "旅行商人",
  "region": "起始之镇",
  "subRegion": "中央市场",
  "attributes": {
    "strength": 8,
    "agility": 10,
    "constitution": 9,
    "intelligence": 14,
    "perception": 12,
    "charisma": 16
  },
  "skills": ["交易", "估价", "交涉"],
  "relationship": {
    "attitude": 0,
    "level": "stranger",
    "interactionCount": 0,
    "history": []
  },
  "isHostile": false,
  "canBeRecruited": false,
  "source": "template"
}
```

**示例 2：更新 NPC 态度值**

```
PATCH /api/npc/patch
{
  "npcId": "npc_a1b2c3d4",
  "relationship": {
    "attitude": 30
  }
}
```

**响应：**

```json
{
  "npcId": "npc_a1b2c3d4",
  "relationship": {
    "attitude": 30,
    "level": "friend"
  }
}
```

**示例 3：查询区域 NPC**

```
GET /api/npc/region?region=起始之镇&subRegion=中央市场
```

**响应：**

```json
{
  "npcs": [
    { "npcId": "npc_a1b2c3d4", "name": "艾琳", "title": "旅行商人" },
    { "npcId": "npc_e5f6g7h8", "name": "格里高利", "title": "铁匠" }
  ]
}
```

---

### 2.9 相关系统

NPC 系统与以下游戏子系统存在交叉引用关系：

| 系统 | 关联说明 |
|------|----------|
| **故事书** | NPC 的 `secrets`、`background` 等字段与故事书的 Schema 模板对应，NPC 数据可作为故事书内容替换的源。详见 [故事书（Schema 与替换指南）] |
| **队伍系统** | `canBeRecruited` 控制 NPC 能否加入玩家队伍，招募后 NPC 数据同步至队伍管理模块 |
| **PM 引擎** | NPC 行为调度器的 LLM 模式依赖 PM 引擎提供的大模型推理能力 |
| **多人联机** | 幽灵 NPC 的 `GHOST_NPC_APPEARED` 事件通过联机模块广播至所有在线玩家，`handleNPCIntroduced` 支持队员共享 NPC 信息 |

---

## 三、规划

期望引入 NPC 长期记忆系统，让每一次互动都被 NPC 真实铭记。NPC 能够记住与玩家的历史对话、共同经历的事件和关键抉择，这些记忆通过 LLM 摘要压缩存储，持续影响 NPC 对玩家的态度与后续对话内容，使关系发展具有真正的连续性和深度。

期待 NPC 获得主动发起任务的能力。当与玩家关系足够深厚时，NPC 将根据自身动机与性格生成个性化委托——商人请求护送珍贵的货物穿越危险区域，猎人邀请玩家一同追踪传说中的猎物，治疗师渴望采集稀有的草药。这些任务自然融入世界叙事，而非生硬的列表条目。

希望打造一个活生生的 NPC 社会网络，让城市中的每个角色彼此连接、相互影响。商人与铁匠维持供货关系，守卫与治疗师默契协作，信息在 NPC 间自然传播，冲突以符合角色性格的方式解决。各 NPC 的行为相互交织，呈现出一个自组织、自演化的虚拟社会生态。
