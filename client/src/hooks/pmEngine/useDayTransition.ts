import { useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useCharacterStore } from '../../stores/characterStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { APIClient } from '../../services/sync/APIClient';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/text';
import { _chronicleRecorder } from './shared';

interface DayTransitionDeps {
  requestScene: () => Promise<void>;
  setWaitingForPM: (v: boolean) => void;
}

export function useDayTransition(deps: DayTransitionDeps) {
  const { requestScene, setWaitingForPM } = deps;

  const startNewDay = useCallback(async () => {
    const game = useGameStore.getState();
    const character = useCharacterStore.getState();

    // 1. 先快照旧日期,再用旧日期打包日志——否则 setDay 后打包的是新一天(空)
    const oldDay = game.currentDay;

    game.setDay(oldDay + 1);
    game.setDiceResult(null);
    game.addDayDivider(oldDay + 1);  // 修正:之前传 currentDay+1 = oldDay+2
    character.updateVital({ fatigue: -30, hunger: 10, hygiene: 5, morale: 5 });
    character.updateHP(Math.min(character.character?.maxHp ?? 20, (character.character?.hp ?? 0) + 5));
    game.addMessage({ id: generateId(), type: 'system', content: '一夜休整后，你恢复了精力。新的一天开始了。', timestamp: Date.now() });

    const settings = useSettingsStore.getState();
    const api = new APIClient(settings.server.endpoint);
    // 用旧日期打包,确保前一天的编年史不丢失
    const batch = _chronicleRecorder.packDailyLogs(oldDay);
    if (batch.entries.length > 0) {
      let uploaded = false;
      for (let retry = 0; retry < 3 && !uploaded; retry++) {
        try {
          await api.uploadChronicle(batch);
          logger.info('sync', `Uploaded ${batch.entries.length} chronicle entries`);
          uploaded = true;
          try {
            const buffered = localStorage.getItem('aeslan-offline-logs');
            if (buffered) {
              const entries = JSON.parse(buffered);
              if (Array.isArray(entries) && entries.length > 0) {
                const offlineBatch = { playerId: batch.playerId, entries, lastWorldDay: game.currentDay };
                await api.uploadChronicle(offlineBatch);
                localStorage.removeItem('aeslan-offline-logs');
                logger.info('sync', `Flushed ${entries.length} offline-buffered entries`);
              }
            }
          } catch { /* buffered flush failed */ }
        } catch {
          if (retry === 2) {
            try {
              const existing = JSON.parse(localStorage.getItem('aeslan-offline-logs') || '[]');
              localStorage.setItem('aeslan-offline-logs', JSON.stringify([...existing, ...batch.entries]));
              logger.info('sync', `Buffered ${batch.entries.length} entries to localStorage for retry`);
            } catch { logger.warn('sync', 'Failed to buffer offline logs'); }
          } else {
            await new Promise(r => setTimeout(r, 2000 * (retry + 1)));
          }
        }
      }
    }

    await requestScene();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setWaitingForPM is stable from useState; tracked for v0.4
  }, [requestScene, setWaitingForPM]);

  return { startNewDay };
}
