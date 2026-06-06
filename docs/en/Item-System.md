# Item System

## 1. Introduction

The Item System is OpenTaleRunner's core data and gameplay support module, responsible for managing the definition, generation, storage, equipping, and circulation of all items in the game world. The system defines **7 major categories**, **6 quality tiers**, and **11 effect types**, covering all item forms including equippable weapons/armor/accessories, single-use consumables, materials, key items, and containers.

**Backpack and Equipment Slots**: The character inventory (`Inventory`) consists of equipment slots (`equipped`) and a backpack (`backpack`). Equipment slots hold three types of equippable items — weapon, armor, and accessory — while the backpack holds all other items. Currency is an independent `currency: { gold, silver, copper }` subsystem.

**Item History Tracking**: Every item, from acquisition to upgrade and transformation, carries a complete timeline record (`history[]`), supporting tracing the item's full lifecycle — when it was obtained, what forging/enchanting it underwent, how it was redefined by the GM.

**GM-Driven Generation**: Item creation, acquisition, modification, and loss are all driven by the GM (LLM) through the narrative engine — the PM engine's `NarrativeResponse.consequences` returns `itemsGained`, `itemsLost`, and `itemsModified` data, and the client's `applyConsequences()` drives all item system CRUD operations based on this data.

---

## 2. Design

### 2.1 Item Data Model

The Item interface defines 20+ fields. All optional fields have defaults, uniformly populated by `normalizeItem()`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `itemId` | `string` | No | Unique identifier, default `item_{timestamp}_{random}` |
| `name` | `string` | Yes | Item name |
| `category` | `ItemCategory` | No | One of seven categories, default `'consumable'` |
| `subCategory` | `string` | No | Subcategory (e.g., "sword" for "longsword"), default `''` |
| `quality` | `ItemQuality` | No | One of six quality tiers, default `'common'` |
| `quantity` | `number` | No | Stack quantity, default `1` |
| `description` | `string` | No | Item description text, default `''` |
| `effects` | `ItemEffect[]` | No | Effect list, default `[]` |
| `value` | `number` | No | Base value, default `0` |
| `durability` | `number` | No | Current durability (nullable) |
| `maxDurability` | `number` | No | Max durability (nullable) |
| `history` | `ItemHistoryEntry[]` | No | History record array, default `[]` |
| `createdAt` | `string` | No | ISO creation timestamp, default current time |
| `source` | `string` | No | Source (NPC name/location/event), default `''` |
| `equipped` | `boolean` | No | Whether currently equipped |
| `equipSlot` | `'weapon' \| 'armor' \| 'accessory'` | No | Equipment slot |
| `canBeEquipped` | `boolean` | No | Whether the item can be equipped |
| `canBeUsed` | `boolean` | No | Whether the item can be used |
| `usePrompt` | `string` | No | Prompt text when using the item |

**normalizeItem()** is located at `client/src/types/item.ts:68`, accepts `Partial<Item>`, fills in all defaults, and returns a valid `Item` object. Core logic:

```typescript
export function normalizeItem(partial: Partial<Item>): Item {
  return {
    itemId: partial.itemId || `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: partial.name || 'Unknown Item',
    category: partial.category || 'consumable',
    subCategory: partial.subCategory || '',
    quality: partial.quality || 'common',
    quantity: partial.quantity ?? 1,
    description: partial.description || '',
    effects: partial.effects || [],
    value: partial.value || 0,
    durability: partial.durability,
    maxDurability: partial.maxDurability,
    history: partial.history || [],
    createdAt: partial.createdAt || new Date().toISOString(),
    source: partial.source || '',
    equipped: partial.equipped,
    equipSlot: partial.equipSlot,
    canBeEquipped: partial.canBeEquipped,
    canBeUsed: partial.canBeUsed,
    usePrompt: partial.usePrompt,
  };
}
```

### 2.2 Seven Major Categories

| Category | Identifier | Equippable | Stackable | Description |
|----------|------------|------------|-----------|-------------|
| Weapon | `weapon` | Yes | No | Equipped to weapon slot |
| Armor | `armor` | Yes | No | Equipped to armor slot |
| Accessory | `accessory` | Yes | No | Equipped to accessory slot |
| Consumable | `consumable` | No | Yes | Single-use, `canBeUsed = true` |
| Material | `material` | No | Yes | Crafting/synthesis ingredient |
| Key Item | `key_item` | No | No | Quest/plot related, cannot be discarded |
| Container | `container` | No | No | Backpack/chest type container items |

**equipSlot Mapping**: Only weapon/armor/accessory categories are equippable, with `equipSlot` values corresponding one-to-one with `category`. `canBeEquipped` is `true` for these three categories, `false` for all others.

**Icons and Labels** (defined at `client/src/types/item.ts:15-25`):

```typescript
const CATEGORY_ICONS: Record<ItemCategory, string> = {
  weapon: '⚔️', armor: '🛡️', accessory: '💍',
  consumable: '🧪', material: '🪨',
  key_item: '🔑', container: '🎒',
};
```

### 2.3 Six Quality Tiers

Quality ranges from low to high across six tiers, each mapped to a Tailwind CSS color class:

| Quality | Tailwind Color Class | Visual Effect |
|---------|---------------------|---------------|
| Crude | `text-gray-400` | Gray, dull and lifeless |
| Common | `text-gray-200` | Light gray, base quality |
| Fine | `text-emerald-400` | Emerald green |
| Rare | `text-blue-400` | Bright blue |
| Epic | `text-purple-400` | Purple |
| Legendary | `text-amber-400` | Amber gold |

Defined at `client/src/types/item.ts:9-13`:

```typescript
export const QUALITY_COLORS: Record<ItemQuality, string> = {
  'crude': 'text-gray-400', 'common': 'text-gray-200',
  'fine': 'text-emerald-400', 'rare': 'text-blue-400',
  'epic': 'text-purple-400', 'legendary': 'text-amber-400',
};
```

Quality determines the item's base value and its perceived rarity in GM narration. The six tiers cover the full gradient from starter-zone drops to world-class artifacts.

### 2.4 Eleven Effect Types

Each effect is defined by the `ItemEffect` interface with 4 fields:

```typescript
interface ItemEffect {
  id: string;
  type: EffectType;
  value: number | string | Record<string, unknown>;
  description: string;
}
```

| Effect Type | Identifier | value Type | Description | Used in Judgment? |
|-------------|------------|-----------|-------------|-------------------|
| Damage Bonus | `damage_bonus` | `number` | Directly increases damage | Yes (counts toward equipmentBonus) |
| Defense Bonus | `defense_bonus` | `number` | Reduces incoming damage | No |
| Attribute Modifier | `attribute_mod` | `Record<string, number>` | e.g., `{ STR: 2, DEX: 1 }` | Yes (STR/DEX only) |
| HP Restore | `hp_restore` | `number` | Restores HP | No |
| Max HP Bonus | `hp_max_bonus` | `number` | Increases max HP | No |
| Vitality Restore | `vital_restore` | `number` | Restores vitality | No |
| Elemental Damage | `elemental_damage` | `string \| Record` | Additional elemental damage | No (planned v0.4 integration) |
| Elemental Resist | `elemental_resist` | `string \| Record` | Reduces elemental damage | No (planned v0.4 integration) |
| Skill Bonus | `skill_bonus` | `number` | Boosts skill level | Yes (counts toward skillBonus) |
| Light Source | `light_source` | `number` | Brightness level | Yes (affects night penalty) |
| Special | `special` | Any | Custom effect | No |

**Judgment System Interaction**: Effects participating in the 2d6 judgment formula are handled in three ways (see [Judgment System](Judgment-System.md) Section 2.6):
- **Directly counted in equipmentBonus**: `damage_bonus`, `attribute_mod` (STR/DEX)
- **Counted in skillBonus**: `skill_bonus`
- **Affects night penalty**: `light_source`
- **Ignored**: `hp_restore`, `hp_max_bonus`, `vital_restore`, `special`

### 2.5 Backpack and Equipment System

`Inventory` structure (`client/src/types/character.ts:28`):

```typescript
interface Inventory {
  equipped: {
    weapon: Item | null;
    armor: Item | null;
    accessory: Item | null;
  };
  backpack: Item[];
  currency: {
    gold: number;
    silver: number;
    copper: number;
  };
}
```

**Equipment Slots**: Each slot can hold only one item. Equipping moves an item from `backpack` to the corresponding `equipped` slot; unequipping reverses the operation. Equipment operations trigger the `item.onEquip` hook (see [Game Rule Engine Middleware](Game-Rule-Engine-Middleware.md) Section 3.2).

**Backpack**: `backpack` is an array, allowing stacking of same-name consumables and materials via the `quantity` field. When the GM returns `itemsGained`, `applyConsequences()` automatically detects items with the same name and category and stacks quantities (see Section 2.7).

**Currency**: A tri-coin system — gold, silver, copper. The GM can adjust currency via `ConsequenceData.currencyChange`.

**updateInventory()**: Replaces the entire `inventory` object (not a patch-style update). Callers must first spread the old state then merge changes. Defined in `characterStore`, called uniformly by `applyConsequences()`.

### 2.6 Item History Tracking

Every item carries a `history: ItemHistoryEntry[]` array recording its full lifecycle:

```typescript
interface ItemHistoryEntry {
  timestamp: string;         // ISO timestamp
  event: string;             // Event type: acquired / upgraded / transformed
  description: string;       // Event description
  oldName?: string;          // Old name (during upgrade)
  oldDescription?: string;   // Old description (during upgrade)
  addedEffects?: ItemEffect[];  // Newly added effects (during transformation)
  removedEffects?: string[];    // Removed effect IDs (during transformation)
  location?: string;         // Acquisition location
  relatedNPC?: string;       // Related NPC
}
```

**Three Event Types**:

- **`acquired`** — Item first obtained. Records acquisition time, source description, location, and NPC.
- **`upgraded`** — Item upgraded (via `replacesItemId`). Preserves the old item's full history, appends a new entry recording `oldName` and `oldDescription`.
- **`transformed`** — Item transformed (via `itemsModified`). Records GM operations such as renaming, quality changes, effect additions/removals, appending a transformation event to the history.

**Upgrade Chain Example**:

```
"Iron Sword" (Day 5 acquired)
  → "Fine Steel Longsword" (Day 12 upgraded, replacesItemId)
    → "Blade of Flames" (Day 20 transformed, added fire damage effect)
```

The history array preserves the full chain:
```json
[
  { "event": "acquired", "description": "Purchased at the blacksmith", "timestamp": "..." },
  { "event": "upgraded", "oldName": "Iron Sword", "description": "Upgraded to Fine Steel Longsword", "timestamp": "..." },
  { "event": "transformed", "addedEffects": [{...}], "description": "Enchanted with fire damage", "timestamp": "..." }
]
```

### 2.7 Item CRUD (Consequence System)

All item operations are handled via `applyConsequences()` (`client/src/services/consequence/applyConsequences.ts:77`), which receives `ConsequenceData` returned by the GM and performs three types of operations:

#### Gaining Items (itemsGained)

```typescript
interface ItemGainedData {
  name: string;
  category?: string;
  subCategory?: string;
  quality?: string;
  quantity?: number;
  description?: string;
  effects?: Array<{ type?: string; value?: number | string | Record<string, unknown>; description?: string }>;
  replacesItemId?: string;  // Non-empty = upgrade old item
}
```

Processing logic:

1. **Upgrade Mode** (`replacesItemId` is non-empty): Searches the backpack for the item matching `itemId` as `oldItem`, calls `buildItemFromGained(gained, oldItem, now)` to generate a new item, preserves the old item's `createdAt`, `history`, `durability` and other fields, and appends an `upgraded` event to the history.
2. **New Item Mode** (`replacesItemId` is empty): Searches the backpack for an item with the same name and category. If found and `quantity > 0`, stacks the quantity; otherwise calls `buildItemFromGained(gained, null, now)` to create a new item and `push` it into the backpack.

#### Losing Items (itemsLost)

```typescript
interface ItemLostData {
  itemId?: string;
  name?: string;
  quantity?: number;
}
```

Processing logic:

- Prioritizes exact matching by `itemId`, then by `name`
- If `quantity` is specified and current quantity > lost quantity → deduct quantity
- Otherwise, `splice` the entire item from the backpack

#### Modifying Items (itemsModified)

```typescript
interface ItemModifiedData {
  itemId: string;
  newName?: string;
  newQuality?: string;
  description?: string;
  addedEffects?: Array<{ type?: string; value?: number | string | Record<string, unknown>; description?: string }>;
  durabilityChange?: number;
}
```

Processing logic (`applyItemModification()`):

1. Searches the backpack for the target item by `itemId`
2. Modifies in place (mutation): updates `name`, `quality`, `description`, `durability`
3. Appends `addedEffects` to the effect list
4. Appends a `transformed` event to `history`

All three operations are ultimately written to the store via `characterStore.updateInventory()`, triggering UI updates.

### 2.8 API Examples

#### Item Interface

```typescript
// client/src/types/item.ts:46
interface Item {
  itemId?: string;
  name: string;
  category?: ItemCategory;
  subCategory?: string;
  quality?: ItemQuality;
  quantity?: number;
  description?: string;
  effects?: ItemEffect[];
  value?: number;
  durability?: number;
  maxDurability?: number;
  history?: ItemHistoryEntry[];
  createdAt?: string;
  source?: string;
  equipped?: boolean;
  equipSlot?: 'weapon' | 'armor' | 'accessory';
  canBeEquipped?: boolean;
  canBeUsed?: boolean;
  usePrompt?: string;
}
```

#### ItemEffect Interface

```typescript
// client/src/types/item.ts:27
interface ItemEffect {
  id: string;
  type: EffectType;
  value: number | string | Record<string, unknown>;
  description: string;
}
```

#### ItemHistoryEntry Interface

```typescript
// client/src/types/item.ts:34
interface ItemHistoryEntry {
  timestamp: string;
  event: string;
  description: string;
  oldName?: string;
  oldDescription?: string;
  addedEffects?: ItemEffect[];
  removedEffects?: string[];
  location?: string;
  relatedNPC?: string;
}
```

#### buildItemFromGained()

Located at `applyConsequences.ts:6`, builds a complete `Item` object from the GM-returned `ItemGainedData`:

```typescript
function buildItemFromGained(
  gained: ItemGainedData,
  oldItem: Item | null,    // Pass old item during upgrade, null for new items
  now: string              // ISO timestamp
): Item
```

When `oldItem` is non-null, its `createdAt`, `source`, `durability`, `equipped`, and other fields are preserved, and the `history` is merged with an `upgraded` event entry appended.

#### applyItemModification()

Located at `applyConsequences.ts:49`, modifies an item in place and appends a `transformed` event to the history:

```typescript
function applyItemModification(item: Item, mod: ItemModifiedData): Item
```

Supports renaming (`newName`), quality changes (`newQuality`), description updates, durability changes (`durabilityChange`), and effect additions (`addedEffects`).

### 2.9 Related Systems

| System | File | Interaction |
|--------|------|-------------|
| Consequence System (PM Engine) | [PM Engine and Prompt System](PM-Engine-and-Prompt-System.md) | `NarrativeResponse.consequences`'s `itemsGained`/`itemsLost`/`itemsModified` drive item circulation |
| Judgment System | [Judgment System](Judgment-System.md) | Equipment effect resolution provides `equipmentBonus`, `skillBonus`, `light_source` for the 2d6 judgment formula |
| Character System | `character.ts` | `Inventory` is a sub-field of `Character`; `characterStore.updateInventory()` writes character state |
| Hook System | [Game Rule Engine Middleware](Game-Rule-Engine-Middleware.md) | `item.onUse` / `item.onEquip` hooks for rule subscriptions; `combat.onEnd` triggers equipment durability wear rules |
| Token Budget | [PM Engine and Prompt System](PM-Engine-and-Prompt-System.md) Section 2.6 | Backpack items injected into GM prompt by priority tier; full backpack deferred to P3 on-demand |

---

## 3. Roadmap

We intend to build an intuitive equipment comparison interface, allowing players to instantly perceive attribute differences, quality gaps, and durability comparisons when hovering over items, ending blind equipment choices. In parallel, we will advance the item synthesis and forging system, consuming material items to generate new creations, forming a complete artisan loop from gathering to creation — synthesis products inherit the historical memory of their ingredients, with every crafted piece carrying the traces of the journey.

Building on this foundation, we will construct an item trading system — whether mutual exchanges between players or reputation-discounted transactions with NPC shops, all requiring a reliable workflow of bilateral confirmation and atomic transfer of currency and items. Paired with equipment durability consumption and repair mechanics, weapons and armor will genuinely wear down in combat, their effects invalidated but not destroyed at zero durability, with repairs requiring matching consumables or the aid of NPC blacksmiths.

In the longer term, we intend to introduce procedural item generation, using a prefix/suffix affix system to give every item unique personality — prefixes like "Sharp," "Flaming" add damage or elemental effects, while suffixes like "... of the Bear" rewrite attribute modifiers, with quality determining the number and rarity pool of affixes, ensuring that no two pieces of equipment on the continent of Aiselan are exactly alike.

## 4. v0.4 Increment

v0.4 delivered two key capabilities in the item system: **Item Comparison UI** and **Item Affix Pool**. The former solves the "blind equipment choice" problem; the latter lays the data foundation for the v0.6 synthesis/forging + affix system.

### 4.1 Item Comparison UI (`ItemCompareTooltip`)

- **Entry**: Triggered by 100ms hover on item rows within `BackpackModal`
- **Display**: Side-by-side attribute difference between current equipment and selected item (color blocks / arrows indicate ±)
- **Data**: Computed by `itemComparison` pure functions (8 unit tests); supports 3 categories: attributes / effects / durability
- **Key commits**: `82f96e6` feat(v0.4-item): add itemComparison pure functions; `18ad17b` feat(v0.4-item): add ItemCompareTooltip component; `a96b8cd` feat(v0.4-item): integrate ItemCompareTooltip in BackpackModal

### 4.2 Item Affix Pool

v0.4 landed the foundation for "procedural item generation": affix data pool + draw API + loot path integration.

#### 4.2.1 Data Layer (`affixPools.ts`)

- Prefix + suffix affix pools for 13 `effectType` resistances (fire/ice/lightning/poison/physical/...)
- 7 item categories (weapon / armor / accessory / consumable / material / quest / misc) each with independent weight tables
- Quality (common/uncommon/rare/epic/legendary) determines affix count + rarity pool ceiling
- 7 unit tests (data integrity)

#### 4.2.2 API Layer (`affixPool.ts` / `lootAffixes.ts`)

- `drawAffixes(category, quality, rng)` — Pure function, draws 1-3 affixes by weight
- `generateLootAffixes(template)` — Wrapped for loot path, includes deterministic RNG (reproducible)
- 13 unit tests (debuff probability + RNG determinism + weight distribution + quality range + non-main category)

#### 4.2.3 Integration Layer (`applyConsequences.itemsGained`)

- v0.4 routes "GM-given loot" through `applyConsequences.itemsGained` → `generateLootAffixes(template)` → actual affix injection
- 13 `effectType` extension (commit `935e5fe` types) compatible with 13 combat resistances
- Key commits: `a865f9f` feat(v0.4-item): add generateLootAffixes; `05d3579` feat(v0.4-item): integrate affix pool into applyConsequences loot paths

### 4.3 Shared UI Components (Linked with UI Generalization)

- **`ItemChip`** — Compact display shared by equipment slots / backpack / compare tooltip (`4139362`)
- **`ItemCardRow`** — BackpackModal item row (with quality color + count + hover) (`4139362`)
- **`ItemDetailPanel`** — Detail panel, reusable by BackpackModal / forge (v0.6) (`2024aa0`)
- **`ItemEffectList`** — Effect list, includes affix rendering (`c311644`)

### 4.4 Known Constraints (To be Resolved After v0.4)

- Affix drawing currently uses deterministic RNG; no LLM dynamic rarity adjustment — v0.6
- 13 `effectType` only effective in item attributes, not yet participating in damage mitigation — v0.6
- Item comparison only supports "equipped vs backpack", not "equipped vs equipped" — future
- Item durability not yet consumed in combat / exploration — v0.8

