# AutoPlay 系统

> AutoPlay 让 AI 代替玩家做决策。配置好 LLM 后，AI 会自行阅读场景、选择行动、提交判定，全程复用与手动游玩相同的 PM 引擎管线。

---

## 一、介绍

AutoPlay 是一个独立的 AI 决策引擎。它不修改 PM 引擎的行为——只是替代了人类玩家的"选择行动"环节。引擎读取当前场景和角色状态，调用 LLM 做出决策，然后将选择的行动文本提交到 `usePMEngine.submitAction()` 管线。

这意味着 AutoPlay 和手动游玩经过完全相同的判定系统、PM 叙事生成、后果应用和自动存档——唯一区别是谁在做决策。

---

## 二、设计

### 2.1 状态机

```
┌──────┐  start()   ┌─────────┐  pause()   ┌────────┐
│ idle │ ─────────→ │ running │ ─────────→ │ paused │
└──────┘            └─────────┘            └────────┘
    ↑                    │                      │
    │   stop()           │ 3 errors             │ resume()
    │                    │ auto-stop            │
    │  ┌─────────┐       ↓                      ↓
    └──│  error  │  ┌─────────┐           ┌─────────┐
       └─────────┘  │ (继续)  │           │ running │
                     └─────────┘           └─────────┘
```

> 状态图说明：`stop()` **不修改** `totalRounds`，引擎实例可在 `start()` 后复用同一 totalRounds 重新启动。totalRounds 仅在 `start()` 时初始化，在 `step()` 完成后递减。

| 方法 | 行为 |
|---|---|
| `start()` | 创建 LLM Client → 设置 `isActive=true` → 开始决策循环 |
| `pause()` | 取消定时器 → `isActive=false` → 保持引擎状态 |
| `resume()` | 重建 LLM Client → `isActive=true` → 继续循环 |
| `stop()` | 取消定时器 → 中止 LLM 请求（`AbortController`） → `isActive=false` |
| `step()` | 执行恰好一轮 → 回到 `idle` |

**轮次控制**: `totalRounds = -1` 表示无限循环。当 `currentRound >= totalRounds > 0` 时自动停止。

### 2.2 LLM 决策循环

每轮 `processRound()` 的执行流程：

```
1. 守卫检查
   ├─ !isActive? → 返回
   ├─ 无角色数据? → stop() + error
   ├─ PM 正在处理中 (isWaitingForPM)? → 延迟重试
   └─ 无可用选项且非玩家回合? → 延迟重试

2. 构建上下文 (PlayerDecisionContext)
   {
     characterName, background, attributes, hp, maxHp,
     vital, recentActions[5], sceneDescription, choices[]
   }

3. 调用 LLM → callPlayerAI(ctx)
   系统 Prompt: "你是一个 TRPG 玩家的 AI 代理..."
   期望输出: JSON { choice_index: -1, custom_action: "", reasoning: "", style: "" }

4. 解析决策 → parsePlayerDecision(raw)
   ├─ 成功 → 返回 PlayerDecision
   └─ 失败 → 回退到选项 0

5. 执行决策
   ├─ choiceIndex >= 0 → choices[choiceIndex].text
   ├─ customAction 非空 → customAction
   └─ 否则 → choices[0].text || "继续探索"

6. 提交 → this.submitAction(action)
   进入 PM 引擎管线 (判定 → 叙事 → 后果 → 存档)

7. 调度下一轮 → setTimeout(processRound, intervalMs)
```

### 2.3 JSON 解析与回退

`parsePlayerDecision(raw: string)` 使用多层解析策略：

```
1. 代码块提取: /```(?:json)?\s*([\s\S]*?)```/  — 剥离 markdown 围栏
2. 尾逗号清理: 移除 } 或 ] 前的非法逗号
3. 花括号提取: 深度扫描找到最外层 { ... }
4. JSON.parse(): 解析清理后的文本
5. 回退: 失败时返回 { choiceIndex: 0, customAction: '', reasoning: '解析失败', style: 'explore' }
```

### 2.4 共享管线

```
AutoPlayEngine              usePMEngine
     │                           │
     │  constructor(submitAction)│
     │←─────────────────────────│  注入 submitAction 回调
     │                           │
     │  this.submitAction(text)  │
     │──────────────────────────→│  进入 PM 引擎管线
     │                           │  ├─ 判定系统 (2d6)
     │                           │  ├─ PM 叙事生成
     │                           │  ├─ 后果应用
     │                           │  └─ 自动存档
     │                           │
```

AutoPlay 不重复实现任何游戏逻辑——它只是一个"决策层"。

### 2.5 错误处理

| 条件 | 行为 |
|---|---|
| 单次 LLM 调用失败 | `consecutiveErrors++`, 继续下一轮 |
| 连续 3 次失败 | `stop()` + `setErrorMessage("连续3次失败: ...")` |
| 成功完成一轮 | `consecutiveErrors = 0`(重置计数器) |
| 角色数据为空 | `stop()` + 错误消息 |
| LLM 返回无法解析 | 回退到选项 0, 记录 `[AutoPlay] Decision parse failed` 日志 |

> `consecutiveErrors` 计数器在 `start()` 和 `resume()` 时被重置为 0（与"成功完成一轮"路径相同的初始化点）。`resume()` 此外还要求 `status === 'paused'` 守卫：若当前不是 `paused` 状态，直接返回并打印警告，不重建 LLM Client。

> `stop()` 仅在当前状态非 `error` 时才回退到 `idle`，保留错误信息供 UI 展示。`forceStop()` 强制重置（包括 error 状态）。

### 2.6 Hook API

`useAutoPlay()` 暴露给 UI 组件：

```typescript
const {
  startAutoPlay,        // 开始自动游玩
  pauseAutoPlay,        // 暂停
  stopAutoPlay,         // 完全停止
  stepAutoPlay,         // 单步执行
  startActivityReporter, // 启动活动上报（保持设备活跃）
  stopActivityReporter,  // 停止活动上报
} = useAutoPlay();
```

清理：组件卸载时自动停止引擎和活动上报。

### 2.7 AutoPlayStore 状态

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `status` | `'idle'\|'running'\|'paused'\|'error'` | `'idle'` | 引擎状态 |
| `currentRound` | `number` | 0 | 当前轮次 |
| `totalRounds` | `number` | -1 | 总轮次（-1 无限） |
| `lastAction` | `string` | '' | 最后一轮执行的动作 |
| `lastReasoning` | `string` | '' | LLM 的决策理由 |
| `errorMessage` | `string` | '' | 错误消息（非空 → status='error'） |
| `intervalMs` | `number` | 3000 | 轮次间隔（毫秒） |

### 2.8 LLM 配置

| 配置路径 | 说明 |
|---|---|
| `settingsStore.autoPlayUseSeparateConfig = false` | 复用主 LLM 配置 |
| `settingsStore.autoPlayUseSeparateConfig = true` | 使用独立 `autoPlayLLM` 配置 |
| 独立配置默认值 | DeepSeek, temp=0.7, maxTokens=1024 |

> AutoPlay 实际通过 `settings.getAutoPlayLLMContext()` 解析最终配置——该函数会按 `autoPlayUseSeparateConfig` 开关决定返回独立的 `autoPlayLLM` 还是主 `llm` 配置，并自动补全默认值（缺省 endpoint/model 回落 `providerCatalog.getLLMProviderDefaults()`）。

AutoPlay 使用更低的 `maxTokens`（1024 vs 主 LLM 的 4096）以节省成本——决策只需要简短 JSON。

### 2.9 相关系统

| 系统 | 关系 |
|---|---|
| [PM 引擎](PM引擎与Prompt系统.md) | AutoPlay 提交动作进入同一 PM 管线 |
| [判定系统](判定系统.md) | AutoPlay 的动作同样经过 2d6 判定 |
| [角色系统](角色系统.md) | 读取角色属性/状态构建决策上下文 |

---

## 三、规划

期望赋予 AI 多样化的决策风格：冒险型勇闯未知、谨慎型步步为营、社交型长袖善舞，让每一次自动游玩都呈现出独特的角色个性。战斗中，AI 也将具备动态战术意识，根据自身 HP、敌人强度和队伍配置自主选择进攻、防守或撤退，而非机械重复。

期待 AutoPlay 从经验中成长。希望引入学习型决策机制，基于历史行动的成功率动态调整策略权重，使 AI 的行为随时间推移越来越贴合角色的优势和玩家的偏好。

希望支持批量运行模式，让玩家可以设定轮次数后交由 AI 自主推进，随后以摘要形式回放关键事件与抉择，在节省时间的同时不丢失叙事脉络。

展望多人协作 AutoPlay，在多人联机房间中 AI 玩家之间能够协调行动、分工配合，形成一支真正的 AI 冒险队伍。
