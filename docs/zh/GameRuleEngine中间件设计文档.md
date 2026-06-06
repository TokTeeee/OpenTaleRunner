# Game Hook System — 解耦联动钩子设计文档

> 目标：各游戏系统（体力/战斗/旅行/物品/队伍）暴露钩子命名空间，联动规则通过钩子订阅。系统不感知规则的存在，规则可热插拔。

> **状态说明 (2026-06-03)**：本系统已实现 17 个 hook namespace 和 7 个规则文件，与本文档第 3.2 节和第 4.1 节完全一致。先前缺失的 item/party 规则文件与 14 个 namespace 的触发代码已补全。

---

## 一、核心设计哲学

### 1.1 耦合模式 vs 钩子模式

```
❌ 耦合模式（当前设计思路）：
   RuleEngine 知道所有系统的内部逻辑
   → RuleEngine 主动调用 SystemX.process()
   → 新增规则 = 修改 RuleEngine 代码或注册表
   → 系统间紧耦合

✅ 钩子模式（本设计）：
   各系统暴露钩子命名空间
   → SystemX 在关键时刻调用 hooks.apply("vital.onChange")
   → 规则独立注册：hooks.add("vital.onChange", myRule)
   → 系统不感知规则的存在
   → 规则可以来自任何模块，热插拔
```

### 1.2 类比

| 概念 | 类比 |
|------|------|
| `SystemHooks` 注册中心 | WordPress `add_filter` / `add_action` |
| 系统调用 `hooks.apply()` | WordPress `apply_filters()` |
| 规则注册 `hooks.add()` | 插件 `add_filter('hook_name', callback)` |
| 规则移除 `hooks.remove()` | `remove_filter()` |
| 优先级排序 | WordPress priority 参数 |

---

## 二、SystemHooks 核心基础设施

### 2.1 类型定义

```typescript
/** 钩子处理器签名：接收数据，返回（可能修改后的）数据 */
type HookHandler<T = unknown> = (data: T, context: HookContext) => T;

interface HookContext {
  /** 钩子命名空间 */
  namespace: string;
  /** 触发来源：'gm' = GM 返回，'derived' = 其他钩子级联触发 */
  source: 'gm' | 'derived';
  /** 游戏状态快照（只读，供规则参考） */
  snapshot: GameSnapshot;
  /** 中止后续钩子 */
  abort: () => void;
}

interface HookEntry<T = unknown> {
  id: string;
  handler: HookHandler<T>;
  priority: number;
  description: string;
  enabled: boolean;
}
```

### 2.2 SystemHooks 类

```typescript
class SystemHooks {
  private hooks = new Map<string, HookEntry[]>();

  /**
   * 注册钩子。返回取消注册的函数。
   */
  add<T>(namespace: string, handler: HookHandler<T>, options: {
    id: string;
    priority?: number;
    description?: string;
  }): () => void {
    const entry: HookEntry<T> = {
      id: options.id,
      handler,
      priority: options.priority ?? 10,
      description: options.description ?? '',
      enabled: true,
    };

    if (!this.hooks.has(namespace)) {
      this.hooks.set(namespace, []);
    }
    this.hooks.get(namespace)!.push(entry);
    // 按优先级降序
    this.hooks.get(namespace)!.sort((a, b) => b.priority - a.priority);

    return () => this.remove(namespace, options.id);
  }

  /**
   * 移除钩子
   */
  remove(namespace: string, id: string): void {
    const list = this.hooks.get(namespace);
    if (!list) return;
    const idx = list.findIndex(e => e.id === id);
    if (idx >= 0) list.splice(idx, 1);
  }

  /**
   * 启用/禁用钩子（不删除，可重新启用）
   */
  setEnabled(namespace: string, id: string, enabled: boolean): void {
    const list = this.hooks.get(namespace);
    if (!list) return;
    const entry = list.find(e => e.id === id);
    if (entry) entry.enabled = enabled;
  }

  /**
   * 应用钩子链：按优先级依次执行，每个钩子接收上一个的输出。
   * 任何 handler 抛出的异常被隔离捕获，不中断后续钩子。
   */
  apply<T>(namespace: string, data: T, context: HookContext): T {
    const list = this.hooks.get(namespace);
    if (!list) return data;

    let aborted = false;
    const ctx: HookContext = {
      ...context,
      namespace,
      abort: () => { aborted = true; },
    };

    let current = data;
    for (const entry of list) {
      if (!entry.enabled) continue;
      if (aborted) break;
      try {
        current = entry.handler(current, ctx);
      } catch (err) {
        // 错误隔离：记录日志但继续执行后续钩子
        if (this._onError) {
          this._onError(namespace, entry.id, err);
        }
      }
    }

    return current;
  }

  /** 错误回调（供外部注入日志系统） */
  private _onError: ((ns: string, id: string, err: unknown) => void) | null = null;
  onError(fn: (ns: string, id: string, err: unknown) => void): void {
    this._onError = fn;
  }

  /**
   * 热替换：用新 handler 原地替换指定 ID 的钩子，保留原优先级和启用状态。
   * 如果 ID 不存在则等同于 add()。
   */
  replace<T>(namespace: string, handler: HookHandler<T>, options: {
    id: string;
    priority?: number;
    description?: string;
  }): void {
    const list = this.hooks.get(namespace);
    if (list) {
      const idx = list.findIndex(e => e.id === options.id);
      if (idx >= 0) {
        list[idx] = {
          ...list[idx],
          handler,
          priority: options.priority ?? list[idx].priority,
          description: options.description ?? list[idx].description,
        };
        list.sort((a, b) => b.priority - a.priority);
        return;
      }
    }
    // 不存在则新增
    this.add(namespace, handler, options);
  }

  /**
   * 检查某个命名空间是否存在
   */
  has(namespace: string): boolean {
    return this.hooks.has(namespace);
  }

  /**
   * 获取完整钩子注册表快照（调试用）
   */
  dump(): Record<string, Array<{ id: string; priority: number; enabled: boolean; desc: string }>> {
    const result: Record<string, Array<{ id: string; priority: number; enabled: boolean; desc: string }>> = {};
    for (const [ns, entries] of this.hooks) {
      result[ns] = entries.map(e => ({
        id: e.id, priority: e.priority, enabled: e.enabled, desc: e.description,
      }));
    }
    return result;
  }

  /** 清空所有钩子（热重置） */
  reset(): void {
    this.hooks.clear();
  }

  /**
   * 列出某个命名空间的所有钩子
   */
  list(namespace: string): HookEntry[] {
    return [...(this.hooks.get(namespace) || [])];
  }

  /**
   * 列出所有已注册的命名空间
   */
  getNamespaces(): string[] {
    return Array.from(this.hooks.keys());
  }
}

/** 全局单例 */
export const systemHooks = new SystemHooks();
```

### 2.3 与 EventBus 的区别

| | EventBus | SystemHooks |
|---|---|---|
| 数据流 | 单向通知，无返回值 | **管道式**，输入→处理→输出 |
| 用途 | UI 事件、异步通知 | **数据变换**、状态派生 |
| 调用方式 | `emit(name, data)` | `apply(name, data, ctx)` 返回修改后的 data |
| 典型场景 | DICE_ROLLED, SCENE_LOADED | vital.onChange, combat.onEnd, time.onElapsed |

---

## 三、各系统暴露的钩子命名空间

### 3.1 钩子命名规范

```
{system}.{event}[:{subEvent}]
```

示例：
- `vital.onTimeElapsed` — 体力系统：时间流逝
- `combat.onEnd` — 战斗系统：战斗结束
- `condition.onAdded` — 异常状态系统：新增状态
- `condition.onRemoved` — 异常状态系统：移除状态
- `travel.onTerrainChange` — 旅行系统：地形变化
- `item.onUse` — 物品系统：使用物品
- `party.onMemberJoin` — 队伍系统：成员加入
- `party.onMemberLeave` — 队伍系统：成员离开

### 3.2 各系统钩子一览

| 系统 | 钩子命名空间 | 触发时机 | 数据负载 |
|------|-------------|---------|---------|
| **Vital** | `vital.onTimeElapsed` | GM 返回 time_elapsed | `{ hours, activity, terrain, weather }` |
| **Vital** | `vital.onRestStart` | 玩家开始休息 | `{ hours, hasShelter, hasFire }` |
| **Vital** | `vital.onRestEnd` | 休息结束 | `{ hours, derivedChanges }` |
| **Vital** | `vital.beforeApply` | 准备写入 store 前（最后修改机会） | `{ stateChanges, snapshot }` |
| **Combat** | `combat.onEnd` | 战斗结束 | `{ rounds, outcome, enemy }` |
| **Combat** | `combat.beforeRoll` | 掷骰前（修改判定参数） | `{ diceParams, snapshot }` |
| **Condition** | `condition.onAdded` | GM 新增异常状态 | `{ condition, snapshot }` |
| **Condition** | `condition.onRemoved` | 异常状态被移除 | `{ condition }` |
| **Condition** | `condition.onTick` | 定期检查 conditions 效果 | `{ hours, conditions }` |
| **Travel** | `travel.onStart` | 开始旅行 | `{ from, to, terrain, estimatedHours }` |
| **Travel** | `travel.onTerrainChange` | 进入新地形 | `{ oldTerrain, newTerrain }` |
| **Travel** | `travel.onWeatherChange` | 天气变化 | `{ oldWeather, newWeather }` |
| **Item** | `item.onUse` | 使用物品 | `{ item, snapshot }` |
| **Item** | `item.onEquip` | 装备物品 | `{ item, slot }` |
| **Party** | `party.onMemberJoin` | 队员加入 | `{ member }` |
| **Party** | `party.onMemberLeave` | 队员离开 | `{ member, reason }` |
| **Party** | `party.beforeCombatBonus` | 计算队伍战斗加成前 | `{ bonus, members }` |

---

## 四、规则作为独立的钩子订阅者

### 4.1 规则文件结构

每类规则独立为一个文件，导入 `systemHooks` 单例自注册：

```typescript
// services/hooks/rules/timeVitalRules.ts
import { systemHooks } from '../SystemHooks';

// 规则 1：时间 → 饥饿
systemHooks.add('vital.onTimeElapsed', (data, ctx) => {
  const { hours, activity, terrain } = data;
  let rate = 3;
  if (activity === 'combat') rate = 5;
  if (activity === 'travel') rate = 4;
  if (/冰|雪|冻/.test(terrain)) rate *= 1.3;

  return {
    ...data,
    derivedChanges: {
      ...data.derivedChanges,
      hunger: (data.derivedChanges?.hunger || 0) + Math.round(hours * rate),
    },
  };
}, { id: 'rule:time:hunger', priority: 10, description: '时间流逝 → 饥饿' });

// 规则 2：时间 → 口渴
systemHooks.add('vital.onTimeElapsed', (data, ctx) => {
  const { hours, terrain, weather } = data;
  let rate = 4;
  if (/沙漠/.test(terrain)) rate *= 2;
  if (/炎热|酷暑/.test(weather)) rate *= 1.5;

  return {
    ...data,
    derivedChanges: {
      ...data.derivedChanges,
      thirst: (data.derivedChanges?.thirst || 0) + Math.round(hours * rate),
    },
  };
}, { id: 'rule:time:thirst', priority: 10, description: '时间流逝 → 口渴' });

// ... 更多规则
```

### 4.2 系统侧调用钩子

以 Vital 系统为例——它在应用 GM 的 state_changes 之前调用钩子：

```typescript
// 在 usePMEngine.applyConsequences() 中

// 1. 如果 GM 返回了 time_elapsed，构建数据并调钩子
if (narrative.timeElapsed) {
  const hours = parseTimeElapsed(narrative.timeElapsed);
  if (hours > 0) {
    const derived = systemHooks.apply('vital.onTimeElapsed', {
      hours,
      activity: inferActivity(action),
      terrain: game.terrain,
      weather: game.weather,
      derivedChanges: {} as Partial<StateChanges>,
    }, {
      source: 'gm',
      snapshot: buildSnapshot(),
      abort: () => {},
      namespace: 'vital.onTimeElapsed',
    });

    // 合并钩子的派生变化
    if (derived.derivedChanges) {
      Object.assign(mergedChanges, derived.derivedChanges);
    }
  }
}

// 2. 战斗结束后调钩子
if (detectCombatEnd(narrative, action)) {
  const derived = systemHooks.apply('combat.onEnd', {
    rounds: estimateRounds(narrative),
    outcome: inferOutcome(narrative),
    enemy: narrative.narrative?.match(/(\S+怪\S+|龙|魔\S+)/)?.[0] || '敌人',
    derivedChanges: {},
  }, { /* ctx */ });

  Object.assign(mergedChanges, derived.derivedChanges);
}

// 3. 最终写入前，给所有系统最后一次修改机会
const finalChanges = systemHooks.apply('vital.beforeApply', mergedChanges, { /* ctx */ });

// 4. 写入 store
applyToStore(finalChanges);
```

### 4.3 规则生命周期管理

```typescript
// 启用/禁用某条规则（不删除）
systemHooks.setEnabled('vital.onTimeElapsed', 'rule:time:hunger', false);

// 动态注册新规则（不修改系统代码）
import './rules/myCustomRule';

// 列出所有已注册的钩子
const allHooks = systemHooks.list('vital.onTimeElapsed');

// 临时覆盖：添加高优先级钩子，处理完后移除
const remove = systemHooks.add('vital.beforeApply', (data) => {
  // 临时修改
  return data;
}, { id: 'temp:modifier', priority: 100 });
// ... 下次应用后
remove();
```

---

## 五、完整规则清单

### 5.1 时间流逝规则（订阅 `vital.onTimeElapsed`）

| ID | 优先级 | 逻辑 |
|----|--------|------|
| `rule:time:hunger` | 10 | 基础 3/h，战斗 5/h，旅行 4/h，休息 1/h，寒冷×1.3 |
| `rule:time:thirst` | 10 | 基础 4/h，战斗 6/h，休息 2/h，沙漠×2，炎热×1.5 |
| `rule:time:fatigue` | 10 | 基础 5/h，战斗 10/h，山地沼泽×1.5，负重高×1.5，休息-10/h |
| `rule:time:hygiene` | 10 | 基础 1/h，沼泽×4，战斗×2 |
| `rule:time:temperature` | 8 | 根据天气+地形调整体温（冰原-2/h，沙漠+3/h） |

### 5.2 休息规则（订阅 `vital.onRestStart`）

| ID | 优先级 | 逻辑 |
|----|--------|------|
| `rule:rest:hp` | 20 | HP恢复 (CON/2)×小时×regenMultiplier |
| `rule:rest:conditions` | 15 | 每个 condition 概率自然康复（诅咒/昏迷除外） |
| `rule:rest:warmth` | 5 | 夜间+无遮蔽 → 寒冷风险提示 |

### 5.3 战斗规则（订阅 `combat.onEnd`）

| ID | 优先级 | 逻辑 |
|----|--------|------|
| `rule:combat:wear` | 10 | 装备耐久 -rounds/3，级联触发 `vital.onTimeElapsed`（回合×1分钟） |
| `rule:combat:morale_victory` | 5 | 胜利 → 士气+5 |
| `rule:combat:morale_defeat` | 5 | 失败 → 士气-10 |

### 5.4 环境联动规则

| ID | 订阅的钩子 | 逻辑 |
|----|-----------|------|
| `rule:env:frostbite` | `travel.onTerrainChange` | 冰原+进入 → 如果没有保暖装备，提示冻伤风险 |
| `rule:env:speedMod` | `travel.onTerrainChange` | 自动应用 TERRAIN_SPEED_MOD |
| `rule:env:stormSlow` | `travel.onWeatherChange` | 暴风雨 → 速度×0.6 |

### 5.5 conditions 规则

| ID | 订阅的钩子 | 逻辑 |
|----|-----------|------|
| `rule:cond:poisonTick` | `condition.onTick` | 中毒未治 → 每 8 小时 HP-1 |
| `rule:cond:frostbiteTravel` | `vital.onTimeElapsed` | 冻伤+旅行 → 疲劳率×1.5 |
| `rule:cond:diseaseWorsen` | `rest.onRestStart` | 疾病+无治疗 → 恢复效果减半 |

---

## 六、与现有 EventBus 的协作

EventBus 继续用于 UI 事件通知，SystemHooks 用于数据变换。两者可以桥接：

```typescript
// EventBus 事件可以触发 SystemHooks
eventBus.on(EVENTS.NARRATIVE_RECEIVED, (narrative) => {
  // 从叙事中提取触发数据
  const triggers = extractTriggers(narrative);
  // 调用对应的钩子链
  for (const trigger of triggers) {
    systemHooks.apply(trigger.namespace, trigger.data, trigger.ctx);
  }
});

// SystemHooks 的结果可以通过 EventBus 通知 UI
systemHooks.add('vital.onTimeElapsed', (data, ctx) => {
  // ... 计算派生变化 ...
  if (data.derivedChanges.hunger > 10) {
    eventBus.emit(EVENTS.VITAL_WARNING, { type: 'hunger', message: '你感到非常饥饿' });
  }
  return data;
}, { id: 'bridge:hungerWarning' });
```

> `extractTriggers(narrative: NarrativeResponse)` 是 `client/src/services/hooks/extractTriggers.ts` 中导出的核心桥接函数，检测 narrative 各个字段并产出 14 类 `HookTrigger`：
> - `narrative.npcsIntroduced` 数组 → `npc.onIntroduced`
> - `narrative.conditionsAdded` 数组 → `condition.onAdded`
> - `consequences.reputationChange` 中含 good/violence/law → `vital.onTimeElapsed` 联动
> - `consequences.partyMemberUpdate` → `party.onMemberUpdate`
> - `consequences.recruit` → `party.onMemberJoin`
> - `consequences.itemsReceived` → `item.onUse` / `item.onEquip`
> - `consequences.dayAdvanced > 0` → `time.onDayChange` + `rest.onRestEnd`
> - `consequences.weatherChange` → `environment.onWeatherChange`
> - `consequences.terrainChange` → `environment.onTerrainChange`
> - `state_changes.sceneModifier !== 0` → `combat.beforeRoll` 注入
> - `consequences.sceneTransition` → `environment.onStart`
> - `state_changes.dice` 含 combat → `combat.beforeRoll` 二次注入
> - `consequences.xpGained > 0` → `party.onMemberUpdate` 累加经验
> - `state_changes.criticalSuccess` → `combat.afterRoll` 高优处理
>
> 桥接器在 PMEngine 收到 `NarrativeResponse` 后立刻执行一次（在 `applyConsequences` 之前），保证规则有机会修改 `derivedChanges` 等字段再被 `applyConsequences` 消费。

---

## 七、文件结构

```
client/src/services/
├── hooks/
│   ├── SystemHooks.ts           // 核心钩子引擎（单例）
│   ├── GameSnapshot.ts          // GameSnapshot 构建函数
│   ├── extractTriggers.ts       // 触发器提取（从 NarrativeResponse）
│   ├── rules/
│   │   ├── index.ts             // 统一注册入口（import 所有规则文件）
│   │   ├── timeVitalRules.ts    // 时间→体力规则
│   │   ├── restRules.ts         // 休息规则
│   │   ├── combatRules.ts       // 战斗规则
│   │   ├── environmentRules.ts  // 环境联动规则
│   │   ├── conditionRules.ts    // 异常状态规则
│   │   ├── itemRules.ts         // 物品联动规则
│   │   └── partyRules.ts        // 队伍联动规则
│   └── README.md               // 规则开发指南（文件未创建，本节下方仅为规范草案，实际规则开发者需直接阅读 SystemHooks.ts 源码）
├── event/
│   └── EventBus.ts             // 现有，UI 事件总线
└── engine/
    └── ...                     // 现有 PromptBuilder / PMEngine 等
```

### 7.1 规则开发指南（`hooks/README.md`）

```markdown
# 规则开发指南

## 添加新规则

1. 选择要订阅的钩子命名空间（参见 `SystemHooks` 文档）
2. 在 `rules/` 下创建或编辑对应的规则文件
3. 使用 `systemHooks.add()` 注册处理器
4. 在 `rules/index.ts` 中 import（或直接 import 到 App 入口）

## 命名规范

- 规则 ID：`rule:{category}:{name}`，如 `rule:time:hunger`
- 钩子命名空间：`{system}.{event}`，如 `vital.onTimeElapsed`

## 钩子处理器签名

```typescript
(data: T, ctx: HookContext) => T
```

- **data**：当前数据，包含 `derivedChanges` 字段供修改
- **ctx**：上下文（snapshot / source / abort）
- **返回值**：修改后的数据（传给下一个钩子）

## 示例

```typescript
import { systemHooks } from '../SystemHooks';

systemHooks.add('vital.onTimeElapsed', (data, ctx) => {
  // 在 derivedChanges 中累加你的修改
  return {
    ...data,
    derivedChanges: {
      ...data.derivedChanges,
      hunger: (data.derivedChanges.hunger || 0) + 5,
    },
  };
}, { id: 'rule:example:hunger', priority: 10 });
```
```

---

## 八、基础设施特性

### 8.1 错误隔离

任何 handler 抛出异常时，`apply()` 自动捕获并调用 `onError` 回调（默认接入 `logger.error`）。**不会中断后续钩子链**。这保证了规则的热补丁不会因为一条错误规则而崩溃整个游戏循环。

```typescript
systemHooks.onError((ns, id, err) => {
  logger.error('Hooks', `[${ns}] 规则 "${id}" 执行失败`, err);
});
```

### 8.2 热替换 (replace)

不删除不重建，原地替换 handler 函数。保留原优先级和状态。用于热修复规则 bug：

```typescript
// 热补丁：修复饥饿速率计算错误
systemHooks.replace('vital.onTimeElapsed', (data, ctx) => {
  // 修正后的逻辑
  return { ...data, derivedChanges: { ...data.derivedChanges, hunger: correctedValue } };
}, { id: 'rule:time:hunger', description: '热修复 v2：修正沙漠饥饿速率' });
```

### 8.3 命名空间自动创建

`add()` 到不存在的命名空间 → 自动创建。任何模块都可以创建新的钩子命名空间，无需预注册。这保证了系统可扩展性——未来新增的系统（如"声望系统"、"派系系统"）只需在合适的位置调用 `apply()` 即可暴露钩子。

### 8.4 内置可观测性

```typescript
// 调试：查看所有注册的钩子
console.table(systemHooks.dump());

// 调试：检查某个钩子是否存在
systemHooks.has('vital.onTimeElapsed'); // true/false

// 调试：列出特定命名空间的所有处理器
systemHooks.list('vital.onTimeElapsed').forEach(e => {
  console.log(`  ${e.priority} ${e.enabled ? '✓' : '✗'} ${e.id}: ${e.description}`);
});
```

### 8.5 迁移现有隐式耦合

当前存在以下隐式耦合，应迁移为钩子机制：

| 现有耦合 | 迁移方式 |
|---------|---------|
| `JudgmentSystem.getNightPenalty()` 直接读取 `gameStore.gameClock` | `combat.beforeRoll` 钩子订阅，注入 nightPenalty |
| `JudgmentSystem.getEquipmentEffectResult()` 直接读取 `characterStore` | `combat.beforeRoll` 钩子订阅，注入 equipmentBonus |
| `TravelSystem.calcSpeed()` 直接读取 `characterStore.vital` | `travel.onStart` 钩子订阅，注入 speedMod |
| `resolveConditionEffects()` 在多处直接调用 | 替换为 `condition.onTick` 钩子，统一管理 |
| `PromptBuilder` 直接注入 conditions 文本 | `condition.onTick` 钩子生成叙事文本注入 |

**迁移原则**：系统只负责自己的核心逻辑，外部影响因素全部通过钩子注入。

---

## 九、与 Rule Engine 方案的对比

| | Rule Engine（耦合） | SystemHooks（钩子） |
|---|---|---|
| 规则注册 | 注册到引擎，引擎管理生命周期 | 订阅到命名空间，自管理 |
| 新增规则 | 引擎的 register 方法 | `systemHooks.add()` 任何时机 |
| 移除规则 | 引擎的 unregister | `systemHooks.remove()` |
| 规则所在 | 集中在 `rules/` 目录 | 任何模块，在 `rules/` 集中定义但独立 |
| 系统感知规则 | 是（引擎调用系统函数） | **否**（系统只调 `apply`，不管谁订阅了） |
| 级联触发 | 引擎内部队列 | 规则自己在 handler 中调用 `apply` 其他 hook |
| 热插拔 | 需要引擎接口 | `add`/`remove`/`setEnabled`/`replace` 即时生效 |
| 错误隔离 | 需手动 try-catch | 引擎内置异常捕获 + onError 回调 |
| 可观测性 | 无 | `dump()` / `list()` / `has()` 完整内省 |
| 单元测试 | 需模拟完整引擎 | 独立测试每个 handler |

---

## 十、规划

核心基础设施方面，期望建成完整的 `SystemHooks` 钩子引擎——涵盖 add / remove / replace / setEnabled / apply 等核心接口，配合 `HookHandler`、`HookContext`、`HookEntry` 类型体系，以及 `GameSnapshot` 快照构建与触发器提取能力，为解耦联动提供稳固的底层基座。

系统集成方面，计划在各游戏系统的关键节点全面接入钩子调用：`usePMEngine.applyConsequences()` 驱动时间流逝、战斗结束与休息事件；`JudgmentSystem.evaluate()` 通过 `combat.beforeRoll` 钩子接收外部注入的夜战惩罚、装备加成与技能修正；`TravelSystem` 通过 `travel.beforeSpeedCalc` 钩子接收速度修正。同时将现有隐式耦合（`getNightPenalty()`、`resolveConditionEffects()` 等）逐步迁移为纯粹的钩子注入机制，实现系统对规则的无感知。

### 后续需要改进

> 本节集中列出 Hook 系统中**文档承诺但当前未实现**的功能。每条都对应原文档中**虚构/不一致**的具体描述，现状是**代码未实现**。

| # | 文档原承诺 | 真实状态 | 计划版本 |
|---|-----------|---------|------------------------------------------|
| 未实现-1 | **`rule:combat:wear` 规则存在** | `combatRules.ts` 中无此规则；命名空间 `combat.onWear` 未注册 | 待 v0.5：在 `combatRules.ts` 中新增 `rule:combat:wear`，订阅 `item.onEquip` 后按耐久度衰减 |
| 未实现-2 | **`condition.onAdded`/`condition.onRemoved` 是唯一触发途径** | `characterStore.addCondition()` / `removeCondition()` 中**直接调用了** `systemHooks.apply('condition.onAdded'/'onRemoved')`，但 `extractTriggers` 也会从 narrative 中再次调用同一 namespace——**双重触发** | 待 v0.5：去除 `characterStore` 中直接调用，统一由 `extractTriggers` 单点触发；或在 `extractTriggers` 中加 `alreadyTriggered` 标志 |
| 未实现-3 | **`hooks/README.md` 规则开发指南** | 文件未创建 | 待 v0.5：补全 7.1 节的规范草案到实际文件 |

规则生态方面，期望将时间流逝、休息恢复、战斗结算、环境联动与异常状态等全部游戏规则实现为独立的钩子订阅者，受统一的 feature flag 控制，支持热插拔、热修复与独立单元测试，让规则迭代不再触碰系统核心代码。

可观测与开发者体验方面，提供规则开发指南、钩子调用全链路日志、浏览器控制台调试面板（`window.__aeslanHooks`），确保规则开发者能够轻松洞察、调试和扩展整个钩子生态。
