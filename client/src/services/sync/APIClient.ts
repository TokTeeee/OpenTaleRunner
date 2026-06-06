/**
 * 通用服务端 API 客户端。
 * 覆盖故事书、世界状态、角色、编年史、奇遇、NPC、活动追踪和认证等 REST 端点，
 * 是单人模式与世界同步链路的基础网络访问层。
 */
import { useAuthStore } from '../../stores/authStore';
import { request, getBaseUrl } from './HttpClient';
import type { ChronicleLogBatch } from '../../types/chronicle';
import type { PullResult, PushResult } from '../../types/api';
import type { GameNPC, NPCRelationship } from '../../types/npc';

export class APIClient {
  constructor(_baseUrl?: string, authToken = '') {
    if (authToken) {
      useAuthStore.getState().setToken(authToken);
    }
  }

  setToken(token: string): void {
    useAuthStore.getState().setToken(token);
  }

  private async apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    return request<T>(method, path, body);
  }

  private get<T>(path: string): Promise<T> { return this.apiRequest<T>('GET', path); }
  private post<T>(path: string, body?: unknown): Promise<T> { return this.apiRequest<T>('POST', path, body); }
  private patch<T>(path: string, body?: unknown): Promise<T> { return this.apiRequest<T>('PATCH', path, body); }

  // ---- 故事书 ----
  async getStorybook(): Promise<{ version: string; world_name: string; current_era: string; world_lore: string; regions: unknown[] }> { return this.get('/api/v1/storybook'); }
  async getWorldLore(): Promise<{ world_lore: string }> { return this.get('/api/v1/storybook/world-lore'); }
  async getFullStorybook(): Promise<unknown> { return this.get('/api/v1/storybook/full'); }
  async getMainQuest(): Promise<{ chapters: unknown[] }> { return this.get('/api/v1/storybook/main-quest'); }
  async getRegions(): Promise<unknown[]> { return this.get('/api/v1/storybook/regions'); }

  // ---- 世界状态 ----
  async getRegionState(regionId: string): Promise<Record<string, unknown>> { return this.get(`/api/v1/world/state/${regionId}`); }
  async getWorldChronicle(day?: number): Promise<unknown[]> {
    return this.get(`/api/v1/world/chronicle${day ? `?day=${day}` : ''}`);
  }
  async getLatestChronicle(): Promise<unknown[]> { return this.get('/api/v1/world/chronicle/latest'); }
  async getWorldTimeline(): Promise<{ worldDay: number }> { return this.get<{ worldDay: number }>('/api/v1/world/timeline'); }
  async getGhostNPCs(regionId: string): Promise<unknown[]> { return this.get(`/api/v1/world/ghost-npcs/${regionId}`); }

  // ---- 角色管理 ----
  async createCharacter(data: unknown): Promise<{ characterId: string }> { return this.post('/api/v1/characters/create', { data }); }
  async getCharacter(id: string): Promise<unknown> { return this.get(`/api/v1/characters/${id}`); }
  async updateCharacter(id: string, data: unknown): Promise<unknown> { return this.patch(`/api/v1/characters/${id}`, data); }
  async getCharacterHistory(id: string): Promise<unknown[]> { return this.get(`/api/v1/characters/${id}/history`); }

  // ---- 编年史上传 ----
  async uploadChronicle(batch: ChronicleLogBatch): Promise<PushResult> {
    return this.post<PushResult>('/api/v1/chronicle/upload', batch);
  }
  async uploadSingleChronicle(entry: unknown): Promise<PushResult> {
    return this.post('/api/v1/chronicle/upload/single', entry);
  }

  // ---- 同步 ----
  async getSyncUpdates(playerId?: string, regionId?: string): Promise<PullResult> {
    const params = new URLSearchParams();
    if (playerId) params.set('playerId', playerId);
    if (regionId) params.set('regionId', regionId);
    const query = params.toString();
    return this.get<PullResult>(`/api/v1/sync/updates${query ? `?${query}` : ''}`);
  }

  openWorldUpdateStream(playerId?: string, regionId?: string): EventSource {
    const params = new URLSearchParams();
    if (playerId) params.set('playerId', playerId);
    if (regionId) params.set('regionId', regionId);
    const query = params.toString();
    return new EventSource(`${getBaseUrl()}/api/v1/world/stream${query ? `?${query}` : ''}`);
  }

  // ---- 奇遇 ----
  async getPendingEncounters(): Promise<unknown[]> { return this.get('/api/v1/encounters/pending'); }
  async resolveEncounter(id: string): Promise<unknown> { return this.post(`/api/v1/encounters/${id}/resolve`); }

  // ---- NPC 系统 ----
  async getKnownNPCs(npcIds: string[]): Promise<unknown[]> {
    if (npcIds.length === 0) return [];
    return this.get(`/api/v1/npcs/known?ids=${npcIds.join(',')}`);
  }
  async getRegionNPCs(regionId: string): Promise<unknown[]> { return this.get(`/api/v1/npcs/region/${regionId}`); }
  async registerNPC(npcData: Partial<GameNPC>): Promise<{ npcId: string }> {
    return this.post('/api/v1/npcs/register', npcData);
  }
  async updateNPCRelationship(npcId: string, relationship: Partial<NPCRelationship>): Promise<unknown> {
    return this.patch(`/api/v1/npcs/${npcId}/relationship`, relationship);
  }

  // ---- 事件系统 ----
  async getAvailableEvents(region: string): Promise<unknown[]> {
    return this.get(`/api/v1/events/available?region=${encodeURIComponent(region)}`);
  }
  async triggerEvent(eventId: string, planDescription: string): Promise<unknown> {
    return this.post(`/api/v1/events/${eventId}/trigger`, { plan_description: planDescription });
  }
  async updateEventProgress(eventId: string, data: { status?: string; progress_narrative?: string; actual_narrative?: string; completed?: boolean }): Promise<unknown> {
    return this.post(`/api/v1/events/${eventId}/progress`, data);
  }

  // ---- 地形/天气 ----
  async getTerrain(region: string, x: number, y: number, z: number) {
    return this.get(`/api/v1/world/terrain?region=${encodeURIComponent(region)}&x=${x}&y=${y}&z=${z}`);
  }
  async getWeather(region: string, day: number) {
    return this.get<{region: string; world_day: number; weather: string}>(`/api/v1/world/weather?region=${encodeURIComponent(region)}&day=${day}`);
  }

  // ---- 活动追踪 ----
  async reportActivity(report: {
    entityId: string;
    entityType: string;
    entityName: string;
    currentAction: string;
    actionType: string;
    location: { region: string; subRegion: string; coordinates: { x: number; y: number; z: number } };
    worldDay: number;
    isOnline: boolean;
  }) {
    return this.post('/api/v1/activity/report', report);
  }

  async getActiveActivities(params?: { region?: string; entityType?: string; isOnline?: boolean }) {
    const qs = new URLSearchParams();
    if (params?.region) qs.set('region', params.region);
    if (params?.entityType) qs.set('entity_type', params.entityType);
    if (params?.isOnline !== undefined) qs.set('is_online', String(params.isOnline));
    const q = qs.toString();
    return this.get(`/api/v1/activity/active${q ? '?' + q : ''}`);
  }

  async activityHeartbeat(entityId: string) {
    return this.post(`/api/v1/activity/heartbeat?entityId=${encodeURIComponent(entityId)}`);
  }

  // ---- NPC 行为配置 ----
  async setNPCBehavior(npcId: string, config: { behavior_type: string; behavior_config?: Record<string, unknown> }) {
    return this.patch(`/api/v1/npcs/${npcId}/behavior`, config);
  }

  async getNPCBehavior(npcId: string) {
    return this.get(`/api/v1/npcs/${npcId}/behavior`);
  }

  async tickNPCBehavior(npcId: string) {
    return this.post(`/api/v1/npcs/${npcId}/behavior/tick`);
  }

  // ---- 认证 ----
  async login(username: string, password: string): Promise<string> {
    const data = await this.post<{ token: string }>('/api/v1/auth/login', { username, password });
    this.setToken(data.token);
    return data.token;
  }
  async register(username: string, password: string): Promise<string> {
    const data = await this.post<{ token: string }>('/api/v1/auth/register', { username, password });
    this.setToken(data.token);
    return data.token;
  }
}
