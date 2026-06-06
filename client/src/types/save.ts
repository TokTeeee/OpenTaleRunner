/**
 * SaveArchive v2 — PR-5
 *
 * 4 域独立存档顶层结构.
 * 各域 (Character/NPC/Item/Chronicle) 独立存储, 单域损坏不波及其他域.
 * 与 v1 (characterListStore 的全 Character JSON) 不兼容, 加载时 v1 旧档
 * 走迁移路径 (migrations.ts).
 */
import type { Character } from './character';
import type { GameNPC } from './npc';
import type { WorldItem } from './item';

export const SAVE_ARCHIVE_VERSION = 2;

export interface WorldSnapshot {
  currentDay: number;
  currentClock: number;
  currentRegion: string;
  currentSubRegion: string;
  weather: string;
  terrain: string;
}

export interface WorldChronicleEntryLite {
  id: string;
  worldDay: number;
  region: string;
  title: string;
  narrative: string;
  createdAt: string;
}

export interface PersonalChronicleEntryLite {
  entryId: string;
  characterName: string;
  worldDay: number;
  action: { summary: string; type?: string };
  location: { region: string; subRegion?: string; coordinates?: { x: number; y: number; z: number } };
  startedAt: string;
}

export interface DomainMeta {
  savedAt: string;
  recordCount: number;
  /** 域数据 size 估算 (bytes) */
  sizeBytes: number;
}

export interface SaveArchive {
  archiveId: string;
  archiveName?: string;
  version: typeof SAVE_ARCHIVE_VERSION;
  createdAt: string;
  updatedAt: string;

  /** 4 域数据 (Record<id, entity>) */
  character: { byPlayer: Record<string, Character>; meta: DomainMeta };
  npcs: { byId: Record<string, GameNPC>; meta: DomainMeta };
  items: { byId: Record<string, WorldItem>; meta: DomainMeta };
  chronicle: {
    world: WorldChronicleEntryLite[];
    personal: PersonalChronicleEntryLite[];
    meta: DomainMeta;
  };
  world: WorldSnapshot;
}

/** 加载结果 — 任意域失败不阻塞其他域 */
export interface LoadResult {
  archive: SaveArchive | null;
  domainErrors: Partial<Record<DomainName, string>>;
}

export type DomainName = 'character' | 'npcs' | 'items' | 'chronicle' | 'world';

export const DOMAIN_NAMES: DomainName[] = ['character', 'npcs', 'items', 'chronicle', 'world'];
