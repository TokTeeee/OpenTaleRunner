import { useGameStore } from '../../stores/gameStore';
import { useCharacterStore } from '../../stores/characterStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAutoPlayStore } from '../../stores/autoPlayStore';
import { APIClient } from '../sync/APIClient';
import { logger } from '../../utils/logger';

export type EntityType = 'player' | 'auto_play' | 'ai_npc';

interface ActivityReport {
  entityId: string;
  entityType: EntityType;
  entityName: string;
  currentAction: string;
  actionType: string;
  location: {
    region: string;
    subRegion: string;
    coordinates: { x: number; y: number; z: number };
  };
  worldDay: number;
  isOnline: boolean;
}

export class ActivityReporter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private apiClient: APIClient | null = null;
  private reportInterval: number;
  private lastAction: string = '';
  private lastActionType: string = 'idle';
  private started = false;

  constructor(reportIntervalMs = 30000) {
    this.reportInterval = reportIntervalMs;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    logger.info('ActivityReporter', `Starting with interval ${this.reportInterval}ms`);
    this.reportNow();
    this.timer = setInterval(() => this.reportNow(), this.reportInterval);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('ActivityReporter', 'Stopped, final report sent');
  }

  updateAction(action: string, actionType = 'explore'): void {
    this.lastAction = action;
    this.lastActionType = actionType;
  }

  private getApiClient(): APIClient {
    if (!this.apiClient) {
      const settings = useSettingsStore.getState();
      this.apiClient = new APIClient(settings.server.endpoint);
    }
    return this.apiClient;
  }

  private buildReport(): ActivityReport {
    const game = useGameStore.getState();
    const character = useCharacterStore.getState().character;
    const autoPlay = useAutoPlayStore.getState();

    const entityType: EntityType = autoPlay.status === 'running' ? 'auto_play' : 'player';

    const action = this.lastAction ||
      autoPlay.lastAction ||
      (game.isWaitingForPM ? '正在等待GM回应...' : '探索中');

    const actionType = this.lastActionType ||
      (autoPlay.lastAction ? 'explore' : 'idle');

    return {
      entityId: character?.characterId || 'unknown',
      entityType,
      entityName: character?.name || '未知冒险者',
      currentAction: action,
      actionType,
      location: {
        region: game.currentRegion,
        subRegion: game.currentSubRegion,
        coordinates: game.coordinates,
      },
      worldDay: game.currentDay,
      isOnline: true,
    };
  }

  private async reportNow(): Promise<void> {
    try {
      const report = this.buildReport();
      const api = this.getApiClient();
      await api.reportActivity(report);
    } catch (e) {
      logger.warn('ActivityReporter', `Report failed: ${e}`);
    }
  }
}

export const activityReporter = new ActivityReporter();