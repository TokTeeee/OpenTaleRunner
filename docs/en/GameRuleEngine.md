# Game Hook System — Decoupled Inter-System Hook Design

> Goal: Each game system (Vital/Combat/Travel/Items/Party) exposes hook namespaces. Inter-system rules subscribe via hooks. Systems have no awareness that rules exist; rules are hot-swappable.

---

## 1. Core Design Philosophy

### 1.1 Coupled Mode vs. Hook Mode

```
❌ Coupled mode (current approach):
   RuleEngine knows all systems' internal logic
   → RuleEngine proactively calls SystemX.process()
   → New rule = modify RuleEngine code or registry
   → Tight coupling between systems

✅ Hook mode (this design):
   Each system exposes hook namespaces
   → SystemX calls hooks.apply("vital.onChange") at key moments
   → Rules subscribe independently: hooks.add("vital.onChange", myRule)
   → Systems are unaware rules exist
   → Rules can come from any module, hot-swappable
```

### 1.2 Analogy

| Concept | Analogy |
|---|---|
| `SystemHooks` registry | WordPress `add_filter` / `add_action` |
| System calls `hooks.apply()` | WordPress `apply_filters()` |
| Rule subscription `hooks.add()` | Plugin `add_filter('hook_name', callback)` |
| Rule removal `hooks.remove()` | `remove_filter()` |
| Priority ordering | WordPress priority parameter |

---

## 2. SystemHooks Core Infrastructure

### 2.1 Type Definitions

```typescript
/** Hook handler signature: receives data, returns (potentially modified) data */
type HookHandler<T = unknown> = (data: T, context: HookContext) => T;

interface HookContext {
  /** Hook namespace */
  namespace: string;
  /** Trigger source: 'gm' = GM return, 'derived' = cascaded from other hook */
  source: 'gm' | 'derived';
  /** Game state snapshot (read-only, for rule reference) */
  snapshot: GameSnapshot;
  /** Abort subsequent hooks */
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

### 2.2 SystemHooks Class

```typescript
class SystemHooks {
  private hooks = new Map<string, HookEntry[]>();

  /**
   * Register a hook. Returns an unsubscribe function.
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
    // Sort by priority descending
    this.hooks.get(namespace)!.sort((a, b) => b.priority - a.priority);

    return () => this.remove(namespace, options.id);
  }

  /**
   * Remove a hook
   */
  remove(namespace: string, id: string): void {
    const list = this.hooks.get(namespace);
    if (!list) return;
    const idx = list.findIndex(e => e.id === id);
    if (idx >= 0) list.splice(idx, 1);
  }

  /**
   * Enable/disable a hook (no deletion, can be re-enabled)
   */
  setEnabled(namespace: string, id: string, enabled: boolean): void {
    const list = this.hooks.get(namespace);
    if (!list) return;
    const entry = list.find(e => e.id === id);
    if (entry) entry.enabled = enabled;
  }

  /**
   * Apply the hook chain: execute in priority order, each handler receives the output of the previous.
   * Exceptions thrown by any handler are isolated and caught, never interrupting subsequent hooks.
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
        // Error isolation: log but continue subsequent hooks
        if (this._onError) {
          this._onError(namespace, entry.id, err);
        }
      }
    }

    return current;
  }

  /** Error callback (for external logging injection) */
  private _onError: ((ns: string, id: string, err: unknown) => void) | null = null;
  onError(fn: (ns: string, id: string, err: unknown) => void): void {
    this._onError = fn;
  }

  /**
   * Hot-replace: swap the handler for a given ID in-place, preserving original priority and enabled state.
   * If ID does not exist, behaves like add().
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
    // Not found → add as new
    this.add(namespace, handler, options);
  }

  /**
   * Check if a namespace exists
   */
  has(namespace: string): boolean {
    return this.hooks.has(namespace);
  }

  /**
   * Get full hook registry snapshot (for debugging)
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

  /** Clear all hooks (hot reset) */
  reset(): void {
    this.hooks.clear();
  }

  /**
   * List all hooks in a namespace
   */
  list(namespace: string): HookEntry[] {
    return [...(this.hooks.get(namespace) || [])];
  }

  /**
   * List all registered namespaces
   */
  getNamespaces(): string[] {
    return Array.from(this.hooks.keys());
  }
}

/** Global singleton */
export const systemHooks = new SystemHooks();
```

### 2.3 Difference from EventBus

| | EventBus | SystemHooks |
|---|---|---|
| Data flow | One-way notification, no return value | **Pipeline**, input → process → output |
| Purpose | UI events, async notifications | **Data transformation**, state derivation |
| Invocation | `emit(name, data)` | `apply(name, data, ctx)` returns modified data |
| Typical scenario | DICE_ROLLED, SCENE_LOADED | vital.onChange, combat.onEnd, time.onElapsed |

---

## 3. Hook Namespaces Exposed by Each System

### 3.1 Hook Naming Convention

```
{system}.{event}[:{subEvent}]
```

Examples:
- `vital.onTimeElapsed` — Vital system: time elapsed
- `combat.onEnd` — Combat system: combat ended
- `condition.onAdded` — Condition system: condition added
- `condition.onRemoved` — Condition system: condition removed
- `travel.onTerrainChange` — Travel system: terrain changed
- `item.onUse` — Item system: item used
- `party.onMemberJoin` — Party system: member joined
- `party.onMemberLeave` — Party system: member left

### 3.2 System Hook Overview

| System | Hook Namespace | Trigger Timing | Data Payload |
|---|---|---|---|
| **Vital** | `vital.onTimeElapsed` | GM returns time_elapsed | `{ hours, activity, terrain, weather }` |
| **Vital** | `vital.onRestStart` | Player starts resting | `{ hours, hasShelter, hasFire }` |
| **Vital** | `vital.onRestEnd` | Rest ends | `{ hours, derivedChanges }` |
| **Vital** | `vital.beforeApply` | Before writing to store (last chance to modify) | `{ stateChanges, snapshot }` |
| **Combat** | `combat.onEnd` | Combat ends | `{ rounds, outcome, enemy }` |
| **Combat** | `combat.beforeRoll` | Before dice roll (modify judgment params) | `{ diceParams, snapshot }` |
| **Condition** | `condition.onAdded` | GM adds a condition | `{ condition, snapshot }` |
| **Condition** | `condition.onRemoved` | Condition removed | `{ condition }` |
| **Condition** | `condition.onTick` | Periodic condition effect check | `{ snapshot }` |
| **Travel** | `travel.onStart` | Travel begins | `{ from, to, terrain, estimatedHours }` |
| **Travel** | `travel.onTerrainChange` | Enter new terrain | `{ oldTerrain, newTerrain }` |
| **Travel** | `travel.onWeatherChange` | Weather changes | `{ oldWeather, newWeather }` |
| **Item** | `item.onUse` | Item used | `{ item, snapshot }` |
| **Item** | `item.onEquip` | Item equipped | `{ item, slot }` |
| **Party** | `party.onMemberJoin` | Member joins | `{ member }` |
| **Party** | `party.onMemberLeave` | Member leaves | `{ member, reason }` |
| **Party** | `party.beforeCombatBonus` | Before calculating party combat bonus | `{ bonus, members }` |

---

## 4. Rules as Independent Hook Subscribers

### 4.1 Rule File Structure

Each category of rules is an independent file, importing the `systemHooks` singleton for self-registration:

```typescript
// services/hooks/rules/timeVitalRules.ts
import { systemHooks } from '../SystemHooks';

// Rule 1: Time → Hunger
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
}, { id: 'rule:time:hunger', priority: 10, description: 'Time elapsed → hunger' });

// Rule 2: Time → Thirst
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
}, { id: 'rule:time:thirst', priority: 10, description: 'Time elapsed → thirst' });

// ... more rules
```

### 4.2 System-Side Hook Invocation

Using the Vital system as an example — it invokes hooks before applying GM's state_changes:

```typescript
// In usePMEngine.applyConsequences()

// 1. If GM returned time_elapsed, build data and invoke hook
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

    // Merge hook-derived changes
    if (derived.derivedChanges) {
      Object.assign(mergedChanges, derived.derivedChanges);
    }
  }
}

// 2. After combat ends, invoke hook
if (detectCombatEnd(narrative, action)) {
  const derived = systemHooks.apply('combat.onEnd', {
    rounds: estimateRounds(narrative),
    outcome: inferOutcome(narrative),
    enemy: narrative.narrative?.match(/(\S+怪\S+|龙|魔\S+)/)?.[0] || 'enemy',
    derivedChanges: {},
  }, { /* ctx */ });

  Object.assign(mergedChanges, derived.derivedChanges);
}

// 3. Before final write, give all systems one last chance to modify
const finalChanges = systemHooks.apply('vital.beforeApply', mergedChanges, { /* ctx */ });

// 4. Write to store
applyToStore(finalChanges);
```

### 4.3 Rule Lifecycle Management

```typescript
// Enable/disable a rule (without deleting)
systemHooks.setEnabled('vital.onTimeElapsed', 'rule:time:hunger', false);

// Dynamically register new rules (no system code changes)
import './rules/myCustomRule';

// List all registered hooks
const allHooks = systemHooks.list('vital.onTimeElapsed');

// Temporary override: add a high-priority hook, remove after use
const remove = systemHooks.add('vital.beforeApply', (data) => {
  // Temporary modification
  return data;
}, { id: 'temp:modifier', priority: 100 });
// ... after next application
remove();
```

---

## 5. Complete Rule Catalog

### 5.1 Time Elapsed Rules (subscribe to `vital.onTimeElapsed`)

| ID | Priority | Logic |
|---|---|---|
| `rule:time:hunger` | 10 | Base 3/h, combat 5/h, travel 4/h, rest 1/h, cold ×1.3 |
| `rule:time:thirst` | 10 | Base 4/h, combat 6/h, rest 2/h, desert ×2, hot weather ×1.5 |
| `rule:time:fatigue` | 10 | Base 5/h, combat 10/h, mountain/swamp ×1.5, heavy load ×1.5, rest -10/h |
| `rule:time:hygiene` | 10 | Base 1/h, swamp ×4, combat ×2 |
| `rule:time:temperature` | 8 | Adjust body temperature based on weather + terrain (tundra -2/h, desert +3/h) |

### 5.2 Rest Rules (subscribe to `vital.onRestStart`)

| ID | Priority | Logic |
|---|---|---|
| `rule:rest:hp` | 20 | HP recovery: (CON/2) × hours × regenMultiplier |
| `rule:rest:conditions` | 15 | Each condition has a chance of natural recovery (except curse/coma) |
| `rule:rest:warmth` | 5 | Night + no shelter → cold risk warning |

### 5.3 Combat Rules (subscribe to `combat.onEnd`)

| ID | Priority | Logic |
|---|---|---|
| `rule:combat:wear` | 10 | Equipment durability -rounds/3, cascaded trigger `vital.onTimeElapsed` (rounds × 1 minute) |
| `rule:combat:morale_victory` | 5 | Victory → morale +5 |
| `rule:combat:morale_defeat` | 5 | Defeat → morale -10 |

### 5.4 Environmental Interaction Rules

| ID | Subscribed Hook | Logic |
|---|---|---|
| `rule:env:frostbite` | `travel.onTerrainChange` | Enter tundra → if no cold-weather gear, warn of frostbite risk |
| `rule:env:speedMod` | `travel.onTerrainChange` | Auto-apply TERRAIN_SPEED_MOD |
| `rule:env:stormSlow` | `travel.onWeatherChange` | Storm → speed ×0.6 |

### 5.5 Condition Rules

| ID | Subscribed Hook | Logic |
|---|---|---|
| `rule:cond:poisonTick` | `condition.onTick` | Poisoned + untreated → HP -1 every 8 hours |
| `rule:cond:frostbiteTravel` | `vital.onTimeElapsed` | Frostbite + traveling → fatigue rate ×1.5 |
| `rule:cond:diseaseWorsen` | `rest.onRestStart` | Disease + no treatment → recovery effect halved |

---

## 6. Collaboration with Existing EventBus

EventBus continues to be used for UI event notifications; SystemHooks handles data transformation. The two can bridge:

```typescript
// EventBus events can trigger SystemHooks
eventBus.on(EVENTS.NARRATIVE_RECEIVED, (narrative) => {
  // Extract trigger data from narrative
  const triggers = extractTriggers(narrative);
  // Invoke corresponding hook chains
  for (const trigger of triggers) {
    systemHooks.apply(trigger.namespace, trigger.data, trigger.ctx);
  }
});

// SystemHooks results can notify UI via EventBus
systemHooks.add('vital.onTimeElapsed', (data, ctx) => {
  // ... calculate derived changes ...
  if (data.derivedChanges.hunger > 10) {
    eventBus.emit(EVENTS.VITAL_WARNING, { type: 'hunger', message: 'You feel extremely hungry' });
  }
  return data;
}, { id: 'bridge:hungerWarning' });
```

---

## 7. File Structure

```
client/src/services/
├── hooks/
│   ├── SystemHooks.ts           // Core hook engine (singleton)
│   ├── GameSnapshot.ts          // GameSnapshot builder
│   ├── extractTriggers.ts       // Trigger extractor (from NarrativeResponse)
│   ├── rules/
│   │   ├── index.ts             // Unified registration entry (imports all rule files)
│   │   ├── timeVitalRules.ts    // Time → vital rules
│   │   ├── restRules.ts         // Rest rules
│   │   ├── combatRules.ts       // Combat rules
│   │   ├── environmentRules.ts  // Environmental interaction rules
│   │   ├── conditionRules.ts    // Condition rules
│   │   ├── itemRules.ts         // Item interaction rules
│   │   └── partyRules.ts        // Party interaction rules
│   └── README.md                // Rule development guide
├── event/
│   └── EventBus.ts              // Existing, UI event bus
└── engine/
    └── ...                      // Existing PromptBuilder / PMEngine etc.
```

### 7.1 Rule Development Guide (`hooks/README.md`)

```markdown
# Rule Development Guide

## Adding a New Rule

1. Choose the hook namespace to subscribe to (see `SystemHooks` docs)
2. Create or edit the corresponding rule file under `rules/`
3. Use `systemHooks.add()` to register the handler
4. Import in `rules/index.ts` (or directly import at App entry)

## Naming Conventions

- Rule ID: `rule:{category}:{name}`, e.g. `rule:time:hunger`
- Hook namespace: `{system}.{event}`, e.g. `vital.onTimeElapsed`

## Hook Handler Signature

```typescript
(data: T, ctx: HookContext) => T
```

- **data**: Current data, contains a `derivedChanges` field for modification
- **ctx**: Context (snapshot / source / abort)
- **Return value**: Modified data (passed to the next hook)

## Example

```typescript
import { systemHooks } from '../SystemHooks';

systemHooks.add('vital.onTimeElapsed', (data, ctx) => {
  // Accumulate your changes in derivedChanges
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

## 8. Infrastructure Features

### 8.1 Error Isolation

When any handler throws an exception, `apply()` automatically catches it and calls the `onError` callback (defaults to `logger.error`). **Subsequent hooks in the chain are never interrupted**. This ensures that a single buggy rule does not crash the entire game loop.

```typescript
systemHooks.onError((ns, id, err) => {
  logger.error('Hooks', `[${ns}] Rule "${id}" execution failed`, err);
});
```

### 8.2 Hot Replace

Replace the handler function in-place without deleting and re-creating. Preserves original priority and status. Used for hot-fixing rule bugs:

```typescript
// Hot-patch: fix incorrect hunger rate calculation
systemHooks.replace('vital.onTimeElapsed', (data, ctx) => {
  // Corrected logic
  return { ...data, derivedChanges: { ...data.derivedChanges, hunger: correctedValue } };
}, { id: 'rule:time:hunger', description: 'Hotfix v2: fix desert hunger rate' });
```

### 8.3 Auto-Created Namespaces

`add()` to a non-existent namespace → auto-create. Any module can create new hook namespaces without pre-registration. This ensures system extensibility — future systems (e.g. "Reputation System", "Faction System") simply call `apply()` at appropriate points to expose hooks.

### 8.4 Built-in Observability

```typescript
// Debug: view all registered hooks
console.table(systemHooks.dump());

// Debug: check if a hook exists
systemHooks.has('vital.onTimeElapsed'); // true/false

// Debug: list all handlers for a specific namespace
systemHooks.list('vital.onTimeElapsed').forEach(e => {
  console.log(`  ${e.priority} ${e.enabled ? '✓' : '✗'} ${e.id}: ${e.description}`);
});
```

### 8.5 Migrating Existing Implicit Coupling

The following implicit couplings currently exist and should be migrated to the hook mechanism:

| Existing Coupling | Migration Path |
|---|---|
| `JudgmentSystem.getNightPenalty()` directly reads `gameStore.gameClock` | Subscribe to `combat.beforeRoll` hook, inject nightPenalty |
| `JudgmentSystem.getEquipmentEffectResult()` directly reads `characterStore` | Subscribe to `combat.beforeRoll` hook, inject equipmentBonus |
| `TravelSystem.calcSpeed()` directly reads `characterStore.vital` | Subscribe to `travel.onStart` hook, inject speedMod |
| `resolveConditionEffects()` called directly in multiple places | Replace with `condition.onTick` hook, unified management |
| `PromptBuilder` directly injects conditions text | `condition.onTick` hook generates narrative text for injection |

**Migration principle**: Systems are responsible only for their own core logic. All external influences are injected through hooks.

---

## 9. Comparison with Rule Engine Approach

| | Rule Engine (coupled) | SystemHooks (hook-based) |
|---|---|---|
| Rule registration | Register with engine; engine manages lifecycle | Subscribe to namespace; self-managed |
| Adding rules | Engine's register method | `systemHooks.add()` at any time |
| Removing rules | Engine's unregister | `systemHooks.remove()` |
| Rule location | Centralized in `rules/` directory | Any module; defined centrally in `rules/` but independent |
| System aware of rules | Yes (engine calls system functions) | **No** (system only calls `apply`, unaware of subscribers) |
| Cascade triggering | Engine internal queue | Rules call `apply` on other hooks themselves |
| Hot-swap | Requires engine interface | `add`/`remove`/`setEnabled`/`replace` take immediate effect |
| Error isolation | Manual try-catch required | Built-in exception catching + onError callback |
| Observability | None | `dump()` / `list()` / `has()` full introspection |
| Unit testing | Must mock entire engine | Test each handler independently |

---

## 10. Roadmap

On the core infrastructure front, we aim to build a complete `SystemHooks` hook engine — covering `add` / `remove` / `replace` / `setEnabled` / `apply` core interfaces, along with the `HookHandler`, `HookContext`, `HookEntry` type system, and `GameSnapshot` snapshot construction and trigger extraction capabilities, providing a solid foundation for decoupled inter-system interaction.

On the system integration front, we plan to comprehensively integrate hook invocations at key nodes of each game system: `usePMEngine.applyConsequences()` driving time-elapsed, combat-end, and rest events; `JudgmentSystem.evaluate()` receiving externally injected night-combat penalties, equipment bonuses, and skill modifiers through the `combat.beforeRoll` hook; `TravelSystem` receiving speed modifiers through the `travel.beforeSpeedCalc` hook. Meanwhile, existing implicit couplings (`getNightPenalty()`, `resolveConditionEffects()`, etc.) will be gradually migrated to pure hook injection mechanisms, achieving zero awareness of rules within systems.

On the rule ecosystem front, we aim to implement all game rules — time elapsing, rest recovery, combat resolution, environmental interaction, and conditions — as independent hook subscribers, governed by unified feature flags, supporting hot-swap, hot-fix, and independent unit testing, so that rule iteration never touches system core code.

On the observability and developer experience front, we will provide a rule development guide, full-chain hook invocation logging, and a browser console debug panel (`window.__aeslanHooks`), ensuring that rule developers can easily inspect, debug, and extend the entire hook ecosystem.
