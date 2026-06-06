/**
 * 世界同步协调器。
 * 负责定时拉取 `/sync/updates`、上传编年史、维护世界更新 SSE 通道，并把结果回写到 worldStore。
 * 它处理的是“单人世界态同步”，不负责多人房间的轮询与回合推进。
 */
import { APIClient } from './APIClient';
import { eventBus } from '../event/EventBus';
import { EVENTS } from '../event/events';
import type { ChronicleRecorder } from '../chronicle/ChronicleRecorder';
import type { PullResult, SyncResult } from '../../types/api';
import { useWorldStore } from '../../stores/worldStore';
import { useGameStore } from '../../stores/gameStore';

export class SyncManager {
  private api: APIClient;
  private chronicleRecorder: ChronicleRecorder;
  private autoSyncTimer: ReturnType<typeof setInterval> | null = null;
  private worldUpdateStream: EventSource | null = null;
  private isOnline = true;

  constructor(api: APIClient, chronicleRecorder: ChronicleRecorder) {
    this.api = api;
    this.chronicleRecorder = chronicleRecorder;
    this.checkOnlineStatus();
  }

  async syncAll(): Promise<SyncResult> {
    const pull = await this.pullWorldData();
    const push = await this.pushChronicleLogs();

    return {
      pulledWorldDay: pull.worldDay,
      pulledChronicleCount: (pull.chronicle ?? []).length,
      pushedLogCount: push.uploaded,
      newEncounters: pull.newEncounters ?? [],
      newGhostNPCs: pull.ghostNPCs ?? [],
      lastSyncTime: pull.lastSyncTime,
    };
  }

  async pullWorldData(): Promise<PullResult> {
    const pull = await this.api.getSyncUpdates(this.chronicleRecorder.getPlayerId(), this.getRegionId());
    this.applyPullResult(pull, 'poll');
    return pull;
  }

  async pushChronicleLogs() {
    const pending = this.chronicleRecorder.getPendingEntries();
    if (pending.length === 0) return { uploaded: 0, failed: 0, newEncounters: [] };

    const batch = {
      playerId: pending[0].playerId,
      entries: pending,
      lastWorldDay: pending[pending.length - 1].worldDay,
    };

    const result = await this.api.uploadChronicle(batch);
    if (result.uploaded > 0) {
      this.chronicleRecorder.markSynced(pending.slice(0, result.uploaded).map((e) => e.entryId));
    }
    return result;
  }

  async checkEncounters() {
    return this.api.getPendingEncounters();
  }

  startAutoSync(intervalSeconds: number): void {
    this.stopAutoSync();
    this.ensureWorldUpdateStream();
    this.syncAll().catch(() => {});
    this.autoSyncTimer = setInterval(() => {
      if (this.isOnline) {
        this.ensureWorldUpdateStream();
        this.syncAll().catch(() => {});
      }
    }, intervalSeconds * 1000);
  }

  stopAutoSync(): void {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
    if (this.worldUpdateStream) {
      this.worldUpdateStream.close();
      this.worldUpdateStream = null;
    }
  }

  forceUpload(): Promise<void> {
    return this.syncAll().then(() => {});
  }

  private getRegionId(): string | undefined {
    const region = useGameStore.getState().currentRegion;
    return region || undefined;
  }

  private applyPullResult(pull: PullResult, channel: 'poll' | 'push'): {
    channel: 'poll' | 'push';
    lastSyncTime: string;
    newEncounterCount: number;
    previousWorldDay: number;
    reason: string;
    worldDay: number;
    worldDayChanged: boolean;
  } {
    const world = useWorldStore.getState();
    const previousWorldDay = world.currentWorldDay;
    const existingEncounterIds = new Set(world.pendingEncounters.map((encounter) => encounter.encounterId));
    const newEncounterCount = (pull.newEncounters || []).filter((encounter) => !existingEncounterIds.has(encounter.encounterId)).length;
    world.setWorldDay(pull.worldDay);
    world.mergeRegionStates(pull.regionStates || {});
    world.setChronicle(pull.chronicle || []);
    world.setGhostNPCs(pull.ghostNPCs || []);
    world.setPendingEncounters(pull.newEncounters || []);
    world.setLastSyncTime(Date.now());

    const payload = {
      channel,
      lastSyncTime: pull.lastSyncTime || new Date().toISOString(),
      newEncounterCount,
      previousWorldDay,
      reason: pull.reason || channel,
      worldDay: pull.worldDay,
      worldDayChanged: pull.worldDay !== previousWorldDay,
    };

    eventBus.emit(EVENTS.WORLD_SYNCED, payload);
    return payload;
  }

  private ensureWorldUpdateStream(): void {
    if (this.worldUpdateStream || !this.isOnline) return;

    this.worldUpdateStream = this.api.openWorldUpdateStream(
      this.chronicleRecorder.getPlayerId(),
      this.getRegionId(),
    );

    this.worldUpdateStream.addEventListener('world_update', (event) => {
      try {
        const pull = JSON.parse((event as MessageEvent).data) as PullResult;
        const payload = this.applyPullResult(pull, 'push');
        eventBus.emit(EVENTS.WORLD_UPDATE_PUSHED, payload);
      } catch {
        // Ignore malformed push payloads and rely on the polling fallback.
      }
    });

    this.worldUpdateStream.onerror = () => {
      this.worldUpdateStream?.close();
      this.worldUpdateStream = null;
    };
  }

  private checkOnlineStatus(): void {
    const goOnline = () => {
      this.isOnline = true;
      this.ensureWorldUpdateStream();
      eventBus.emit(EVENTS.NETWORK_ONLINE);
    };
    const goOffline = () => {
      this.isOnline = false;
      this.worldUpdateStream?.close();
      this.worldUpdateStream = null;
      eventBus.emit(EVENTS.NETWORK_OFFLINE);
    };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    this.isOnline = navigator.onLine;
  }
}
