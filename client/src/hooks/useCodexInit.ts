/**
 * App 启动时调用: 从 localStorage 恢复 codex, 或 seed from inventory。
 *
 * seed 时所有 record.isNew = false (避免老玩家开游戏瞬间全 ✨ 炸屏)。
 */
import { useEffect } from 'react';
import { useCodexStore } from '../stores/codexStore';
import { useCharacterStore } from '../stores/characterStore';
import { useItemRegistryStore } from '../stores/itemRegistryStore';

const STORAGE_KEY = 'aeslan.codex.v1';
const STORAGE_VERSION = 1;

interface PersistedShape {
  version: number;
  records: ReturnType<typeof useCodexStore.getState>['discoveries'][string][];
}

export function useCodexInit(): void {
  // 1) 启动恢复 / seed
  useEffect(() => {
    let recovered = false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: PersistedShape = JSON.parse(raw);
        if (parsed.version === STORAGE_VERSION && Array.isArray(parsed.records)) {
          useCodexStore.getState().hydrate(parsed.records);
          recovered = true;
        }
      }
    } catch (e) {
      console.warn('[useCodexInit] localStorage 解析失败, 走 seed', e);
    }

    if (recovered) return;

    // Seed: 从 character inventory + itemRegistry 拉现有物品
    const char = useCharacterStore.getState().character;
    if (!char) return;
    const playerId = char.characterId;
    const registry = useItemRegistryStore.getState();
    const items = registry.byPlayer(playerId);

    for (const it of items) {
      useCodexStore.getState().recordDiscovery(it);
    }
    // seed 完所有 isNew 清 false (避免老玩家瞬间炸屏)
    useCodexStore.getState().markAllSeen();
  }, []);

  // 2) 监听 discoveries 变化, debounce 写 localStorage
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useCodexStore.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          const records = Object.values(useCodexStore.getState().discoveries);
          const payload: PersistedShape = { version: STORAGE_VERSION, records };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (e) {
          console.warn('[useCodexInit] localStorage 写入失败', e);
        }
      }, 500);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);
}
