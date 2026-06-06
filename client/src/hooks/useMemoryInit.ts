/**
 * useMemoryInit — v0.4-memory 启动 hook。
 * 1. 同步 settings.memory.decayStrategy 到 MemoryManager
 * 2. 调试期提供 prune() hook (默认不调, 防止数据丢失)
 */
import { useEffect } from 'react';
import { MemoryManager } from '../services/memory/MemoryManager';
import { useSettingsStore } from '../stores/settingsStore';
import type { MemoryDecayConfig } from '../types/memory';

export function useMemoryInit(): void {
  useEffect(() => {
    // 1. 同步初始 decay config
    const sync = () => {
      const m = useSettingsStore.getState().memory;
      const cfg: MemoryDecayConfig = {
        strategy: m.decayStrategy,
        retentionDays: m.retentionDays,
        importanceFloor: m.importanceFloor,
        tauDays: m.tauDays,
        maxRecords: m.maxRecords,
      };
      MemoryManager.setDecayConfig(cfg);
    };
    sync();

    // 2. 订阅 settingsStore, 变更时同步
    const unsubscribeSettings = useSettingsStore.subscribe((state, prev) => {
      if (state.memory !== prev.memory) sync();
    });

    return () => {
      unsubscribeSettings();
    };
  }, []);
}
