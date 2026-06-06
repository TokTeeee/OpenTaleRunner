/**
 * 物品世界注册表。
 *
 * 与 characterStore.inventory 的关系：
 * - characterStore.inventory 是"持有者视图"，存储 WorldItem 引用 + 数量
 * - 本 store 是"世界真相"，所有脱手/转手/销毁的物品都在这里
 *
 * 任何对物品的修改（拾取/丢弃/交易/放入世界容器/销毁）必须经过本 store 的 transfer/destroy，
 * 不可直接改 characterStore.inventory.backpack。这是 PR-1 的关键契约。
 *
 * 同步策略：
 * - 本地优先：所有 mutation 先写本地 store，标记 dirty
 * - pushDelta：脏 itemId 批量推送服务端
 * - pullFromServer：启动/读档时按 playerId 拉取该玩家可访问的物品
 *
 * PR 范围：仅本地 store + 类型。服务端同步逻辑在 PR-5 (SaveManager 4 域化) 中提供。
 */
import { create } from 'zustand';
import type {
  WorldItem,
  ItemHolder,
  ItemHistoryEntry,
  ItemEffect,
} from '../types/item';
import { generateItemId } from '../types/item';
import { request } from '../services/sync/HttpClient';
import { clientLogger } from '../services/logging/ClientLogger';
import { LogCategory } from '../services/logging/types';

export interface RegisterItemInput {
  name: string;
  category: WorldItem['category'];
  quality: WorldItem['quality'];
  description?: string;
  effects?: ItemEffect[];
  value?: number;
  quantity?: number;
  durability?: WorldItem['durability'];
  spawnInfo: WorldItem['spawnInfo'];
  holder: ItemHolder;
  subCategory?: string;
  source?: string;
  canBeEquipped?: boolean;
  canBeUsed?: boolean;
  usePrompt?: string;
  equipSlot?: 'weapon' | 'armor' | 'accessory';
  history?: ItemHistoryEntry[];
}

interface ItemRegistryState {
  items: Record<string, WorldItem>;
  /** 本地已变更但尚未推送到服务端的 itemId 集合 */
  dirtyIds: Set<string>;

  /** 注册一个新物品到世界 */
  register: (input: RegisterItemInput) => WorldItem;
  /** 批量注册 */
  registerBatch: (inputs: RegisterItemInput[]) => WorldItem[];
  /** 转移物品持有者 (核心方法 — 任何物品转手都走这里) */
  transfer: (itemId: string, newHolder: ItemHolder, reason: string) => void;
  /** 销毁物品 (物品彻底从世界消失, holder=null) */
  destroy: (itemId: string, reason: string) => void;
  /** 追加历史记录 */
  addHistory: (itemId: string, entry: Omit<ItemHistoryEntry, 'timestamp'>) => void;
  /** 修改物品属性 (名称/描述/耐久度/词条) */
  patch: (itemId: string, patch: Partial<Pick<WorldItem, 'name' | 'description' | 'value' | 'effects' | 'durability' | 'quality' | 'quantity'>>) => void;

  /** 查询 */
  get: (itemId: string) => WorldItem | undefined;
  byHolder: (holder: ItemHolder) => WorldItem[];
  byPlayer: (playerId: string) => WorldItem[];
  exists: (itemId: string) => boolean;

  /** 同步 (PR-5 接入 SaveManager 后由其调度) */
  pullFromServer: (playerId: string) => Promise<void>;
  pushDelta: (changedIds?: string[]) => Promise<void>;
  getDirtyIds: () => string[];

  /** 测试/重置用 */
  hydrate: (items: WorldItem[]) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  items: {} as Record<string, WorldItem>,
  dirtyIds: new Set<string>(),
};

function nowISO(): string {
  return new Date().toISOString();
}

function defaultHistory(input: RegisterItemInput): ItemHistoryEntry[] {
  if (input.history && input.history.length > 0) return input.history;
  return [{
    timestamp: nowISO(),
    event: 'spawned',
    description: `${input.name} 出现在 ${input.spawnInfo.region}`,
    location: input.spawnInfo.region,
  }];
}

export const useItemRegistryStore = create<ItemRegistryState>((set, get) => ({
  ...INITIAL_STATE,

  register: (input) => {
    const now = nowISO();
    const item: WorldItem = {
      itemId: generateItemId(),
      name: input.name,
      category: input.category,
      quality: input.quality,
      effects: input.effects || [],
      description: input.description || '',
      value: input.value ?? 0,
      durability: input.durability,
      history: defaultHistory(input),
      holder: input.holder,
      quantity: input.quantity ?? 1,
      spawnInfo: input.spawnInfo,
      createdAt: now,
      updatedAt: now,
      subCategory: input.subCategory,
      source: input.source || input.spawnInfo.source,
      canBeEquipped: input.canBeEquipped,
      canBeUsed: input.canBeUsed,
      usePrompt: input.usePrompt,
      equipSlot: input.equipSlot,
    };
    set((s) => {
      const dirty = new Set(s.dirtyIds);
      dirty.add(item.itemId);
      return {
        items: { ...s.items, [item.itemId]: item },
        dirtyIds: dirty,
      };
    });
    return item;
  },

  registerBatch: (inputs) => {
    const items: WorldItem[] = [];
    for (const input of inputs) items.push(get().register(input));
    return items;
  },

  transfer: (itemId, newHolder, reason) => {
    set((s) => {
      const existing = s.items[itemId];
      if (!existing) return s;
      if (existing.holder === null) return s; // 已销毁, 不允许转移

      const fromDesc = existing.holder
        ? `${existing.holder.kind}:${existing.holder.refId ?? 'world'}`
        : 'void';
      const toDesc = `${newHolder.kind}:${newHolder.refId ?? 'world'}`;

      const next: WorldItem = {
        ...existing,
        holder: newHolder,
        updatedAt: nowISO(),
        history: [
          ...existing.history,
          {
            timestamp: nowISO(),
            event: 'transferred',
            description: reason || `从 ${fromDesc} 转移到 ${toDesc}`,
            location: existing.spawnInfo.region,
          },
        ],
      };
      const dirty = new Set(s.dirtyIds);
      dirty.add(itemId);
      return {
        items: { ...s.items, [itemId]: next },
        dirtyIds: dirty,
      };
    });
  },

  destroy: (itemId, reason) => {
    set((s) => {
      const existing = s.items[itemId];
      if (!existing) return s;
      const next: WorldItem = {
        ...existing,
        holder: null,
        updatedAt: nowISO(),
        history: [
          ...existing.history,
          {
            timestamp: nowISO(),
            event: 'destroyed',
            description: reason || '物品销毁',
            location: existing.spawnInfo.region,
          },
        ],
      };
      const dirty = new Set(s.dirtyIds);
      dirty.add(itemId);
      return {
        items: { ...s.items, [itemId]: next },
        dirtyIds: dirty,
      };
    });
  },

  addHistory: (itemId, entry) => {
    set((s) => {
      const existing = s.items[itemId];
      if (!existing) return s;
      const next: WorldItem = {
        ...existing,
        updatedAt: nowISO(),
        history: [
          ...existing.history,
          { ...entry, timestamp: nowISO() },
        ],
      };
      const dirty = new Set(s.dirtyIds);
      dirty.add(itemId);
      return {
        items: { ...s.items, [itemId]: next },
        dirtyIds: dirty,
      };
    });
  },

  patch: (itemId, patch) => {
    set((s) => {
      const existing = s.items[itemId];
      if (!existing) return s;
      const next: WorldItem = {
        ...existing,
        ...patch,
        updatedAt: nowISO(),
        history: [
          ...existing.history,
          {
            timestamp: nowISO(),
            event: 'modified',
            description: `物品属性变更: ${Object.keys(patch).join(', ')}`,
            location: existing.spawnInfo.region,
          },
        ],
      };
      const dirty = new Set(s.dirtyIds);
      dirty.add(itemId);
      return {
        items: { ...s.items, [itemId]: next },
        dirtyIds: dirty,
      };
    });
  },

  get: (itemId) => get().items[itemId],

  byHolder: (holder) =>
    Object.values(get().items).filter(
      (it) => it.holder && it.holder.kind === holder.kind && it.holder.refId === holder.refId,
    ),

  byPlayer: (playerId) => {
    // 可访问物品: 玩家自己持有 / 玩家队伍持有 / 玩家已知 NPC 持有 / 公共世界容器
    return Object.values(get().items).filter((it) => {
      if (!it.holder) return false;
      const h = it.holder;
      if (h.kind === 'character' && h.refId === playerId) return true;
      // 队伍/容器: PR-5 接入 SaveManager 时再细化访问规则, 本期保守返回 character
      return false;
    });
  },

  exists: (itemId) => itemId in get().items,

  pullFromServer: async (playerId) => {
    // v0.5: 真实 REST 接入. 服务端对应端点 (PR-2 SaveManager 4 域化 时提供)
    // 当前调用可能 404 — 失败时静默降级, 本地缓存继续工作
    try {
      const items = await request<WorldItem[]>(
        'GET',
        `/api/v1/items/registry?playerId=${encodeURIComponent(playerId)}`,
      );
      get().hydrate(items);
    } catch (err) {
      clientLogger.warn(
        LogCategory.HTTP,
        'itemRegistry',
        `pullFromServer failed: ${(err as Error).message} — fallback to local cache`,
      );
    }
  },

  pushDelta: async (changedIds) => {
    const ids = changedIds ?? get().getDirtyIds();
    if (ids.length === 0) return;
    const payload: WorldItem[] = ids
      .map((id) => get().items[id])
      .filter((it): it is WorldItem => Boolean(it));
    if (payload.length === 0) return;
    try {
      await request<{ ok: true; accepted: number }>('POST', '/api/v1/items/registry/delta', { items: payload });
      // 推送成功 -> 清掉已同步的脏标记
      set((s) => {
        const next = new Set(s.dirtyIds);
        for (const id of ids) next.delete(id);
        return { dirtyIds: next };
      });
    } catch (err) {
      clientLogger.warn(
        LogCategory.HTTP,
        'itemRegistry',
        `pushDelta failed: ${(err as Error).message} — items stay dirty for retry`,
      );
    }
  },

  getDirtyIds: () => Array.from(get().dirtyIds),

  hydrate: (items) => {
    const map: Record<string, WorldItem> = {};
    for (const it of items) map[it.itemId] = it;
    set({ items: map, dirtyIds: new Set() });
  },

  reset: () => set({ ...INITIAL_STATE, dirtyIds: new Set() }),
}));
