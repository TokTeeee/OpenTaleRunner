# 服务端 API 参考

## 认证

除标注外，所有接口需在 Header 中携带 `Authorization: Bearer <token>`。

| 字段 | 说明 |
|---|---|
| Token 算法 | JWT HS256 |
| 有效期 | 72h (可配 `SERVICE_JWT_EXPIRE_HOURS`) |
| 刷新 | `POST /auth/refresh` 使用当前 token 换取新 token |
| 登出 | `POST /auth/logout` 将 token 加入黑名单 |

---

## 端点总览

### Auth（4 端点）

| Method | Path | Auth | 请求体 | 响应 |
|--------|------|------|--------|------|
| `POST` | `/auth/register` | 否 | `{ username: string(2-32, 字母数字下划线连字符), password: string(6-128) }` | `{ token, player_id, username }` |
| `POST` | `/auth/login` | 否 | `{ username: string, password: string }` | `{ token, player_id, username }` |
| `POST` | `/auth/refresh` | **是** | — | 新 `{ token, player_id, username }` |
| `POST` | `/auth/logout` | **是** | — | `{ message: "Logged out" }` |

### Storybook（5 端点）- 无认证

| Method | Path | 说明 |
|--------|------|------|
| `GET` | `/storybook` | 完整故事书数据 |
| `GET` | `/storybook/world-lore` | 世界观描述文本 |
| `GET` | `/storybook/main-quest` | 主线任务信息 |
| `GET` | `/storybook/regions` | 所有区域列表 |
| `GET` | `/storybook/full` | 完整数据（含缓存回退） |

### World（13 端点）

| Method | Path | 说明 |
|--------|------|------|
| `GET` | `/world/state/{region_id}` | 区域状态（天气/派系/事件） |
| `GET` | `/world/chronicle?day=N` | 世界编年史条目 |
| `GET` | `/world/chronicle/latest` | 最近 5 条编年史 |
| `GET` | `/world/timeline` | 当前世界日 |
| `GET` | `/world/stream?playerId=X&regionId=Y` | SSE 实时世界更新流（可选认证，未登录亦可订阅） |
| `GET` | `/world/ghost-npcs/{region_id}` | 区域幽灵 NPC |
| `GET` | `/world/terrain?region=X&x=Y&z=Z` | 地形数据 |
| `GET` | `/world/weather?region=X&day=N` | 天气数据 |
| `GET` | `/world/aliases` | 区域/地形别名映射 |
| `GET` | `/world/map?region=X&world_day=N` | 地图网格数据 |
| `GET` | `/world/roads?region=X` | 道路数据 |
| `GET` | `/world/waters?region=X` | 水域数据 |
| `POST` | `/world/locations` | 上报新位置 |

### Characters（4 端点）

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| `POST` | `/characters/create` | **是** | 创建角色 `{ data: dict }` |
| `GET` | `/characters/{char_id}` | **否** | 获取角色数据（开放端点） |
| `PATCH` | `/characters/{char_id}` | **否** | 更新角色（开放端点） |
| `GET` | `/characters/{char_id}/history` | **否** | 角色历史记录（开放端点） |

### Chronicle（2 端点）- 可选认证

| Method | Path | 说明 |
|--------|------|------|
| `POST` | `/chronicle/upload` | 批量上传编年史日志 |
| `POST` | `/chronicle/upload/single` | 单条上传 |

### Sync（3 端点）

| Method | Path | 说明 |
|--------|------|------|
| `GET` | `/sync/updates?playerId=X&regionId=Y` | 获取世界同步增量 |
| `PUT` | `/sync/session` | 上报实时位置 `{ character_name, region, coordinates, current_action, status, ... }` |
| `GET` | `/sync/nearby-players?region=X` | 附近在线玩家 |

### Encounters（2 端点）

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| `GET` | `/encounters/pending` | **是** | 待处理遭遇 |
| `POST` | `/encounters/{enc_id}/resolve` | **否** | 标记遭遇已解决（开放端点） |

### NPC（13 端点）

| Method | Path | 说明 |
|--------|------|------|
| `GET` | `/npcs/known?ids=X,Y,Z` | 获取已知 NPC（含关系数据） |
| `GET` | `/npcs/region/{region_id}` | 区域 NPC 列表 |
| `POST` | `/npcs/register` | 注册新 NPC |
| `PATCH` | `/npcs/{npc_id}/relationship` | 更新 NPC 关系 |
| `PATCH` | `/npcs/{npc_id}/behavior` | 设置 NPC 行为配置 |
| `GET` | `/npcs/{npc_id}/behavior` | 获取 NPC 行为配置 |
| `POST` | `/npcs/{npc_id}/behavior/tick` | 手动触发 NPC 行为 tick |
| `PATCH` | `/npcs/{npc_id}/voice` | 设置 NPC 语音参数 |
| `GET` | `/npcs/{npc_id}/voice` | 获取 NPC 语音参数 |
| `PATCH` | `/npcs/{npc_id}/portrait` | 设置 NPC 立绘 |
| `GET` | `/npcs/{npc_id}/portrait` | 获取 NPC 立绘 |
| `GET` | `/npcs/{npc_id}/full?player_id=X` | 完整 NPC 数据（含关系/语音/立绘） |
| `PATCH` | `/npcs/{npc_id}` | 批量更新 NPC |

### Events（3 端点）

| Method | Path | 说明 |
|--------|------|------|
| `GET` | `/events/available?region=X` | 可用事件模板 |
| `POST` | `/events/{event_id}/trigger` | 触发事件 |
| `POST` | `/events/{event_id}/progress` | 更新事件进度 |

### Activity（4 端点）

| Method | Path | 说明 |
|--------|------|------|
| `POST` | `/activity/report` | 上报活动状态 |
| `GET` | `/activity/active?region=X&entity_type=Y` | 活跃实体列表 |
| `POST` | `/activity/heartbeat?entityId=X` | 心跳 |
| `GET` | `/activity/history/{entity_id}?limit=20` | 活动历史 |

### Multiplayer（18 端点）- 需认证

| Method | Path | 说明 |
|--------|------|------|
| `POST` | `/multiplayer/rooms` | **是** | 创建房间 `{ mode: "new"\|"inherit", config: RoomConfig, inherit_data? }` |
| `GET` | `/multiplayer/rooms/{room_id}` | **否** | 获取房间状态（开放端点） |
| `POST` | `/multiplayer/rooms/{room_id}/join` | 加入房间 `{ password?, claimed_slot_id? }` |
| `POST` | `/multiplayer/rooms/{room_id}/leave` | 离开房间 |
| `POST` | `/multiplayer/rooms/{room_id}/heartbeat` | 房间心跳 |
| `POST` | `/multiplayer/rooms/{room_id}/claim-slot` | 认领角色槽 |
| `POST` | `/multiplayer/rooms/{room_id}/release-slot` | 释放角色槽 |
| `POST` | `/multiplayer/rooms/{room_id}/character-ready` | 标记角色就绪 |
| `POST` | `/multiplayer/rooms/{room_id}/generate-common-backstory` | 生成共同背景 |
| `POST` | `/multiplayer/rooms/{room_id}/start` | 开始游戏 |
| `POST` | `/multiplayer/rooms/{room_id}/action` | 提交行动 `{ action: string, dice_result? }` |
| `POST` | `/multiplayer/rooms/{room_id}/action-skip` | 跳过本轮 |
| `GET` | `/multiplayer/rooms/{room_id}/round-status` | **否** | 获取轮次状态（开放端点） |
| `GET` | `/multiplayer/rooms/{room_id}/narratives?since_round=N` | 获取叙事历史 |
| `POST` | `/multiplayer/rooms/{room_id}/round-process` | 手动触发轮次结算 |
| `GET` | `/multiplayer/rooms/{room_id}/notifications?since_round=N` | 获取通知 |
| `POST` | `/multiplayer/rooms/{room_id}/spectator-ready` | 观战者就绪 |
| `POST` | `/multiplayer/rooms/{room_id}/save` | 存档（仅房主） |

---

## 速率限制

- 默认 60 请求 / 60 秒 / IP
- 可配：`SERVICE_RATE_LIMIT` / `SERVICE_RATE_WINDOW`
- 超限返回 HTTP 429

## CORS

- 可配 `SERVICE_CORS_ORIGINS`（逗号分隔）
- 默认: `http://localhost:5173,http://localhost:3000`

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `SERVICE_JWT_SECRET` | **必填** | JWT 签名密钥 |
| `SERVICE_PORT` | 8000 | API 端口 |
| `SERVICE_DB_PATH` | `./data/aeslan.db` | SQLite 路径 |
| `SERVICE_JWT_EXPIRE_HOURS` | 72 | Token 有效期 |
| `SERVICE_LLM_KEY` | — | 服务端 LLM API Key（编年史聚合） |
| `SERVICE_LLM_ENDPOINT` | `https://api.deepseek.com/chat/completions` | LLM 端点 |
| `SERVICE_LLM_MODEL` | `deepseek-chat` | LLM 模型 |
| `SERVICE_LLM_TEMPERATURE` | 0.7 | LLM 温度 |
| `SERVICE_LLM_MAX_TOKENS` | 2048 | LLM 最大 Token |
| `SERVICE_CORS_ORIGINS` | `localhost:5173,localhost:3000` | CORS 白名单 |
| `SERVICE_RATE_LIMIT` | 60 | 速率限制值 |
| `SERVICE_RATE_WINDOW` | 60 | 速率限制窗口 |
| `SERVICE_LOG_ENABLED` | true | 日志开关 |
| `SERVICE_LOG_LEVEL` | INFO | 日志等级 (DEBUG/INFO/WARNING/ERROR) |
| `SERVICE_LOG_DIR` | `./logs` | 日志目录 |
| `SERVICE_LOG_FORMAT` | text | 日志格式 (text/json) |
| `CHRONICLE_AGGREGATE_MIN_LOGS` | 1 | 触发编年史聚合的最小日志数 |
| `STORYBOOK_PATH` | `./data/storybook.json` | 故事书路径 |

## Dashboard API（端口 8081，无需认证）

| Path | 说明 |
|---|---|
| `GET /api/stats/overview` | 世界总览 |
| `GET /api/stats/regions` | 各区域统计 |
| `GET /api/stats/activity` | 24h 活跃玩家 |
| `GET /api/stats/chronicle?day=N&region=X` | 编年史浏览 |
| `GET /api/stats/npcs?region=X&promoted=Y` | NPC 列表 |
| `GET /api/stats/timeline` | 时间线状态 |
| `GET /api/stats/events?region=X&level=Y&status=Z&limit=N` | 事件模板 |
| `GET /api/stats/waters` | 水域数据 |
| `GET /api/stats/roads` | 道路数据 |
| `GET /api/stats/realtime-players?region=X` | 实时玩家 |
| `GET /api/stats/map-entities` | 地图实体 |

---

## 三、规划

当前以 79 个 REST 端点覆盖 13 个路由模块与 Dashboard API（11 端点），为客户端提供完整的数据与交互能力。

在多人实时同步方面，期望引入 WebSocket 端点，以持久化连接替代短周期轮询，大幅降低同步延迟。同时规划 API 版本号 Header 机制，使服务端与客户端能够优雅地协商接口演进，并为列表类端点统一分页规范。还将引入请求与响应体压缩，在网络带宽受限场景下提升传输效率。

长期愿景包括提供可选的 GraphQL 端点，赋予客户端按需查询的灵活数据获取能力；以及 OpenAPI 3.1 规范的自动生成，让 API 文档始终与实现保持同步。端点级别的精细化速率管制也将落地，使不同类型接口拥有独立的流控策略。更高频的同步场景下，gRPC 的引入将带来二进制协议的性能优势。最终将制定明确的 Breaking Change 策略，确保接口演化过程可预期、可追溯。
