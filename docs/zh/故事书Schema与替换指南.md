# 故事书 Schema 参考

> 故事书（StoryBook）是 OpenTaleRunner 世界的数据核心。替换 `storybook.json` 即可获得完全不同的世界观，无需修改任何代码。

## 一、顶层结构

```json
{
  "version": 1,
  "world_name": "世界名称",
  "current_era": "当前时代描述",
  "world_lore": { ... },
  "main_quest": { ... },
  "regions": [ ... ],
  "milestones": [ ... ],
  "location_types": { ... },
  "starting_context": { ... },
  "narrative_guide": { ... },
  "npc_role_templates": [ ... ],
  "terrain_seeds": [ ... ],
  "prompt_overrides": [ ... ],
  "water_seeds": [ ... ],
  "road_seeds": [ ... ]
}
```

## 二、world_lore（世界观）

```json
{
  "geography": "地理描述文本",
  "history_summary": "历史年代摘要",
  "races": "种族描述",
  "magic_system": {
    "description": "魔法体系描述",
    "rules": ["规则1", "规则2"]
  },
  "deities_and_religion": {
    "description": "神祇与宗教描述",
    "note": "补充说明"
  },
  "worldspine_tower": "通天塔描述"
}
```

## 三、regions（区域）

每个区域包含子区域、派系、关键 NPC、地下城和动态事件：

```json
{
  "id": "region_id",
  "name": "区域显示名",
  "full_name": "完整名称",
  "description": "区域描述",
  "terrain": "地形类型",
  "weather_patterns": ["天气1", "天气2"],
  "sub_regions": [
    {"name": "子区域名", "type": "类型", "description": "描述"}
  ],
  "factions": [
    {"name": "派系名", "attitude": 50, "description": "描述"}
  ],
  "key_npcs": [
    {"name": "NPC名", "role": "角色", "personality": "性格描述"}
  ],
  "dungeons": [
    {"name": "地下城名", "level": "新手/中阶/高阶", "description": "描述"}
  ],
  "dynamic_events": [
    {"trigger": "random/milestone:beat_id", "event": "事件描述"}
  ]
}
```

### 子区域类型（location_types）

```json
{
  "主城": {
    "label": "主城",
    "subtypes": [
      {"id": "city_square", "label": "城市广场", "icon": "🏛", "can_be_birthplace": true}
    ]
  }
}
```

## 四、main_quest（主线任务）

```json
{
  "premise": "故事前提",
  "current_chapter": {
    "id": "ch_01",
    "name": "章节名",
    "summary": "章节概要",
    "world_day_range": [1, 100]
  },
  "beats": [
    {
      "id": "beat_01_01",
      "name": "节拍名称",
      "status": "pending/locked",
      "depends_on": "beat_id 或 null",
      "unlock_condition": "解锁条件描述",
      "narrative_when_unlocked": "解锁时触发的叙事"
    }
  ],
  "milestones_for_next_chapter": "进入下一章的条件"
}
```

## 五、milestones（里程碑）

```json
{
  "id": "M0",
  "name": "里程碑名称",
  "status": "locked/pending/active/completed",
  "description": "描述",
  "trigger_condition": "触发条件"
}
```

## 六、narrative_guide（叙事风格指南）

```json
{
  "point_of_view": "使用第二人称「你」对玩家说话",
  "tone": "史诗感但不做作，幽默可接受但不轻浮",
  "scene_length": "场景描写2-4句话勾勒环境",
  "choice_rules": [
    "选项互有区别（战斗/社交/探索/投机/回避）",
    "选项推动故事前进"
  ],
  "forbidden": [
    "绝不替玩家做决定",
    "不打破第四面墙"
  ],
  "consistency_checks": [
    "检查物品状态（已消耗/已损坏）",
    "检查 NPC 生死状态"
  ]
}
```

## 七、npc_role_templates（NPC 角色模板）

```json
{
  "key": "merchant",
  "name": "商人",
  "attributes": {"STR": 10, "DEX": 12, "CON": 10, "INT": 13, "WIS": 12, "CHA": 14},
  "skills": [
    {"name": "估价", "level": 3, "description": "准确评估物品价值", "attribute": "INT"}
  ],
  "services": ["买卖物品", "鉴定"]
}
```

### behavior_configs（行为配置）

```json
{
  "behavior_type": "rule",
  "npc_role": "merchant",
  "actions": {
    "morning": "正在{location}整理货架准备开张",
    "afternoon": "正在{location}招揽顾客"
  }
}
```

## 八、starting_context（起始上下文）

```json
{
  "region_id": "royal_plains",
  "sub_region": "光辉城",
  "birth_locations": [
    {"name": "麦穗村", "type": "村庄", "description": "农业村庄", "can_be_birthplace": true, "coordinates": {"x": -120, "z": 80}}
  ]
}
```

## 九、terrain_seeds（地形种子）

```json
{
  "region": "royal_plains",
  "x_min": -200, "x_max": 200,
  "y_min": -200, "y_max": 200,
  "z_min": -200, "z_max": 200,
  "terrain_type": "plains",
  "description": "广袤平原"
}
```

## 十、water_seeds / road_seeds（水域和道路）

```json
{
  "id": "ocean_west",
  "type": "ocean",
  "name": "无尽之海",
  "region": "",
  "path": [[-800, -600], [-800, 600]]
}
```

```json
{
  "id": "road_king",
  "name": "王都大道",
  "region": "royal_plains",
  "from": "光辉城",
  "to": "古道口",
  "path": [[0, 0], [30, 5]],
  "type": "major"
}
```

## 十一、prompt_overrides（Prompt 覆盖）

```json
{
  "slot": "narrative_guide",
  "scope": "regional",
  "target_ids": ["royal_plains"],
  "mode": "append",
  "content": "- 王都平原的叙事应有宫廷感",
  "comment": "王都平原专属风格"
}
```

### 可用占位符变量

> `PromptBuilder` 实际支持 **14 个**占位符（除常用 12 个外另含 `{{characterRace}}` / `{{inventoryDigest}}` / `{{vitalDigest}}` 等运行时计算字段）。下表为最常用的 14 个：

| 占位符 | 含义 |
|--------|------|
| `{{characterName}}` | 角色姓名 |
| `{{characterRace}}` | 种族 |
| `{{currentRegion}}` | 当前区域 |
| `{{currentSubRegion}}` | 当前子区域 |
| `{{worldDay}}` | 世界日 |
| `{{currentEra}}` | 当前时代 |
| `{{worldName}}` | 世界名称 |
| `{{hp}}` / `{{maxHp}}` | HP |
| `{{timeOfDay}}` | 时段 |
| `{{weather}}` | 天气 |
| `{{terrain}}` | 地形 |
| `{{lightLevel}}` | 光照等级 |
| `{{recentActions}}` | 玩家最近 5 步行动摘要 |
| `{{partyStatus}}` | 队伍成员 HP/忠诚摘要 |

### 字段命名兼容

> `client/src/services/storybook/normalizeStoryBook.ts` 在加载时**自动兼容 snake_case 和 camelCase 两种命名**。例如 `world_name` / `worldName`、`current_era` / `currentEra`、`starting_context` / `startingContext` 都会标准化为客户端统一结构。文档以 snake_case 为标准写法。

### runtime 配置字段

> 除 `prompt_overrides` 外，故事书顶层还支持 `rules_for_pm`（PM 决策规则）、`output_schemas`（GM 输出结构定义）、`behavior_configs`（NPC 行为配置）三个运行时配置字段。`behavior_configs` 在 NPC 行为调度器中直接读取（见 NPC 系统 2.4）；`rules_for_pm` / `output_schemas` 在 PMEngine 拼装 Prompt 时被引用。

### API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/storybook` | `GET` | 拉取当前故事书（标准字段） |
| `/api/v1/storybook/full` | `GET` | 获取完整故事书（含 `rules_for_pm` / `output_schemas` / `behavior_configs` 三个运行时字段） |

---

## 替换故事书指南

1. 复制 `storybook.json` 另存为新文件
2. 修改 `world_name`、`current_era`、`world_lore` 为新的世界设定
3. 按需修改 `regions`（可增删区域，最少保留 1 个含 `starting_context.region_id` 的区域）
4. 修改 `main_quest.beats` 为主线节拍
5. 修改 `milestones` 为关键节点
6. 修改 `narrative_guide` 为适合新世界的叙事风格
7. 修改 `terrain_seeds`、`water_seeds`、`road_seeds` 为匹配的地形数据
8. 可选：添加 `prompt_overrides` 为不同区域定制叙事风格
9. 替换服务端 `data/storybook.json` 和服务端 `STORYBOOK_PATH` 环境变量指向（默认路径 `./data/storybook.json`，由 `server/config.py:19` `os.getenv("STORYBOOK_PATH", "./data/storybook.json")` 解析）
10. 重启服务端，客户端会自动拉取新故事书

---

## 三、规划

期望建立故事书的版本管理体系，支持 Schema 版本化与自动迁移，让旧版故事书能够平滑升级到新格式。提供多世界切换界面，使玩家在多个世界观之间自由穿梭，同时探索社区故事书市场的可能性，构建玩家共创的开放内容生态。

进一步打造动态故事书能力——玩家的行动将真正改变世界，按需解锁新区域与任务线，让世界随玩家的选择而持续演化。配套开发图形化故事书编辑器，大幅降低创作门槛，让非技术创作者也能轻松构建自己的幻想世界。探索 i18n 多语言故事书支持，让艾瑟兰走向全球玩家。

长期愿景是将程序化世界生成与 AI 辅助创作深度融合，让大语言模型帮助创作者构思世界观、编写区域描述与任务线，开创人机协作的故事书创作新范式。
