/**
 * 物品图鉴 store — 记录玩家遇到过的所有物品 (按 signature 去重)。
 *
 * 数据来源: applyConsequences 拾取物品时调 recordDiscovery
 * 持久化:   localStorage (v1), SaveManager 4 域化在 PR-5
 */
import { create } from 'zustand';
import type { WorldItem, ItemCategory, ItemQuality, ItemEffect } from '../types/item';
import { computeSignature } from '../data/codexSignature';

export interface DiscoveryRecord {
  /** signature (主键) */
  signature: string;
  /** 首次遇到时的快照 (物品可能被 patch 改) */
  name: string;
  category: ItemCategory;
  quality: ItemQuality;
  effects: ItemEffect[];
  /** 引用, 用于拉最新 WorldItem */
  firstSeenItemId: string;
  /** 时间 (ISO) */
  firstSeenAt: string;
  lastSeenAt: string;
  /** 累计遇到次数 */
  encounterCount: number;
  /** 本次会话内首次发现, 用于 ✨ 标记 */
  isNew: boolean;
}

interface CodexState {
  discoveries: Record<string, DiscoveryRecord>;

  recordDiscovery: (item: WorldItem) => { isNew: boolean; signature: string };
  markAllSeen: () => void;
  reset: () => void;
  hydrate: (records: DiscoveryRecord[]) => void;
  serialize: () => DiscoveryRecord[];
}

export const useCodexStore = create<CodexState>((set, get) => ({
  discoveries: {},

  recordDiscovery: (item) => {
    const signature = computeSignature(item);
    const existing = get().discoveries[signature];
    const now = item.updatedAt || new Date().toISOString();

    if (existing) {
      const next: DiscoveryRecord = {
        ...existing,
        encounterCount: existing.encounterCount + 1,
        lastSeenAt: now,
        isNew: false,
      };
      set((s) => ({ discoveries: { ...s.discoveries, [signature]: next } }));
      return { isNew: false, signature };
    }

    const rec: DiscoveryRecord = {
      signature,
      name: item.name,
      category: item.category,
      quality: item.quality,
      effects: item.effects,
      firstSeenItemId: item.itemId,
      firstSeenAt: item.createdAt || now,
      lastSeenAt: now,
      encounterCount: 1,
      isNew: true,
    };
    set((s) => ({ discoveries: { ...s.discoveries, [signature]: rec } }));
    return { isNew: true, signature };
  },

  markAllSeen: () => {
    set((s) => {
      const next: Record<string, DiscoveryRecord> = {};
      for (const [k, v] of Object.entries(s.discoveries)) {
        if (v.isNew) next[k] = { ...v, isNew: false };
        else next[k] = v;
      }
      return { discoveries: next };
    });
  },

  reset: () => set({ discoveries: {} }),

  hydrate: (records) => {
    const map: Record<string, DiscoveryRecord> = {};
    for (const r of records) map[r.signature] = r;
    set({ discoveries: map });
  },

  serialize: () => Object.values(get().discoveries),
}));
