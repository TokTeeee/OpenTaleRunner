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
  /** 连续失败次数, 用于指数退避; 达到阈值后停止 reporter (server 显然未启) */
  private consecutiveFailures = 0;
  /** 失败后退避期间不调用 API, 避免每个 interval 都打一条 console error */
  private inBackoff = false;
  /** 用户手动 enable (默认 dev mode 关, 防 console 噪音) */
  private enabled = true;

  constructor(reportIntervalMs = 30000) {
    this.reportInterval = reportIntervalMs;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.consecutiveFailures = 0;
    this.inBackoff = false;
    logger.info('ActivityReporter', `Starting with interval ${this.reportInterval}ms`);
    // 启动时不立即 report, 给 server 一点启动时间, 也避免首页冷启刷出 ERR_CONNECTION_REFUSED
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

  /** dev mode 或单测用: 完全禁用 (避免控制台噪声) */
  setEnabled(value: boolean): void {
    this.enabled = value;
    if (!value && this.started) this.stop();
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
    if (!this.enabled || this.inBackoff) return;
    try {
      const report = this.buildReport();
      const api = this.getApiClient();
      await api.reportActivity(report);
      // 成功: 重置退避
      this.consecutiveFailures = 0;
    } catch (e) {
      this.consecutiveFailures += 1;
      // 1) 第一次失败: log + 进入 60s 退避 (避免连续打 console)
      // 2) 连续 ≥ 3 次失败: 假设 server 长期不可用, 暂停 reporter (用户可手动 enable)
      if (this.consecutiveFailures === 1) {
        logger.warn('ActivityReporter', `Report failed, entering 60s backoff: ${e}`);
        this.inBackoff = true;
        setTimeout(() => {
          this.inBackoff = false;
        }, 60_000);
      } else if (this.consecutiveFailures >= 3) {
        logger.warn('ActivityReporter', `3 次连续失败, 暂停 reporter. 启动 server 后可调用 activityReporter.start() 恢复.`);
        this.stop();
      }
    }
  }
}

export const activityReporter = new ActivityReporter();