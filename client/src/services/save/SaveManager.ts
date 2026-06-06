/**
 * SaveManager — PR-5 4 域独立存档
 *
 * 顶层流程:
 * - saveArchive(archiveId): 收集 4 域 → 写入 localStorage (v2 格式)
 * - loadArchive(archiveId): 读取 → 校验 → 注入 4 个 store, 单域失败不阻塞
 * - listArchives(): 返回存档索引 (元数据)
 * - deleteArchive(archiveId): 移除
 *
 * 与 v1 (characterListStore 全 JSON) 不兼容; 历史 v1 走 best-effort 迁移.
 */
import type { SaveArchive, LoadResult, DomainName, DomainMeta } from '../../types/save';
import { SAVE_ARCHIVE_VERSION } from '../../types/save';
import { useCharacterStore } from '../../stores/characterStore';
import { useCharacterListStore } from '../../stores/characterListStore';
import { useNPCStore } from '../../stores/npcStore';
import { useItemRegistryStore } from '../../stores/itemRegistryStore';
import { useWorldStore } from '../../stores/worldStore';
import { useGameStore } from '../../stores/gameStore';

const STORAGE_KEY_PREFIX = 'opentale-runner.save.v2.';
const INDEX_KEY = 'opentale-runner.save.v2.index';

export interface ArchiveIndexEntry {
  archiveId: string;
  archiveName?: string;
  createdAt: string;
  updatedAt: string;
  worldDay: number;
  domains: Partial<Record<DomainName, DomainMeta>>;
}

function getKey(archiveId: string): string {
  return `${STORAGE_KEY_PREFIX}${archiveId}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

function meta(recordCount: number, data: unknown): DomainMeta {
  return {
    savedAt: nowISO(),
    recordCount,
    sizeBytes: new Blob([JSON.stringify(data)]).size,
  };
}

function readIndex(): Record<string, ArchiveIndexEntry> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeIndex(idx: Record<string, ArchiveIndexEntry>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
  } catch {
    // localStorage 满
  }
}

function readArchive(archiveId: string): SaveArchive | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getKey(archiveId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveArchive;
    if (parsed.version !== SAVE_ARCHIVE_VERSION) {
      // 不兼容的旧版 — 走迁移路径
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeArchive(archive: SaveArchive): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(getKey(archive.archiveId), JSON.stringify(archive));
  } catch {
    throw new Error('localStorage 写入失败, 存档过大?');
  }
}

function deleteArchive(archiveId: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(getKey(archiveId));
  const idx = readIndex();
  delete idx[archiveId];
  writeIndex(idx);
}

// ============================================================
// 收集/注入
// ============================================================

function collectDomains(archiveId: string, archiveName?: string): SaveArchive {
  const char = useCharacterStore.getState().character;
  const npcs = useNPCStore.getState().npcs;
  const items = useItemRegistryStore.getState().items;
  const world = useWorldStore.getState();
  const game = useGameStore.getState();

  const charData = char ? { [char.characterId]: char } : {};
  const npcData = { ...npcs };
  const itemData = { ...items };
  const chronicleData = {
    world: world.worldChronicle || [],
    personal: (char?.recentHistory || []).map((h, i) => ({
      entryId: `pce_${archiveId}_${i}`,
      characterName: char?.name || 'unknown',
      worldDay: h.worldDay || game.currentDay,
      action: { summary: h.summary || '', type: undefined },
      location: { region: h.region || game.currentRegion, subRegion: h.subRegion || game.currentSubRegion },
      startedAt: new Date().toISOString(),
    })),
  };

  return {
    archiveId,
    archiveName,
    version: SAVE_ARCHIVE_VERSION,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    character: { byPlayer: charData, meta: meta(Object.keys(charData).length, charData) },
    npcs: { byId: npcData, meta: meta(Object.keys(npcData).length, npcData) },
    items: { byId: itemData, meta: meta(Object.keys(itemData).length, itemData) },
    chronicle: {
      world: chronicleData.world as never,
      personal: chronicleData.personal as never,
      meta: meta(chronicleData.world.length + chronicleData.personal.length, chronicleData),
    },
    world: {
      currentDay: game.currentDay,
      currentClock: game.gameClock,
      currentRegion: game.currentRegion,
      currentSubRegion: game.currentSubRegion,
      weather: game.weather,
      terrain: game.terrain,
    },
  };
}

function injectDomains(archive: SaveArchive, errors: Partial<Record<DomainName, string>>): void {
  // 1. Character 域
  try {
    const charList = Object.values(archive.character.byPlayer);
    if (charList.length > 0) {
      const c = charList[0];
      useCharacterStore.getState().setCharacter(c);
      useCharacterListStore.getState().addCharacter(c);
    }
  } catch (e) {
    errors.character = e instanceof Error ? e.message : String(e);
  }

  // 2. NPC 域
  try {
    const npcs = Object.values(archive.npcs.byId);
    if (npcs.length > 0) {
      useNPCStore.getState().registerBatch(npcs);
    }
  } catch (e) {
    errors.npcs = e instanceof Error ? e.message : String(e);
  }

  // 3. Item 域
  try {
    const items = Object.values(archive.items.byId);
    useItemRegistryStore.getState().hydrate(items);
  } catch (e) {
    errors.items = e instanceof Error ? e.message : String(e);
  }

  // 4. Chronicle 域
  try {
    useWorldStore.setState({ worldChronicle: archive.chronicle.world as never });
    if (archive.character.byPlayer) {
      const firstChar = Object.values(archive.character.byPlayer)[0];
      if (firstChar) {
        useCharacterStore.setState({
          character: {
            ...firstChar,
            recentHistory: archive.chronicle.personal.map((p) => ({
              worldDay: p.worldDay,
              region: p.location.region,
              subRegion: p.location.subRegion,
              summary: p.action.summary,
            })),
          },
        });
      }
    }
  } catch (e) {
    errors.chronicle = e instanceof Error ? e.message : String(e);
  }

  // 5. World snapshot
  try {
    useGameStore.setState({
      currentDay: archive.world.currentDay,
      gameClock: archive.world.currentClock,
      currentRegion: archive.world.currentRegion,
      currentSubRegion: archive.world.currentSubRegion,
      weather: archive.world.weather,
      terrain: archive.world.terrain,
    });
  } catch (e) {
    errors.world = e instanceof Error ? e.message : String(e);
  }
}

// ============================================================
// 公共 API
// ============================================================

export const SaveManager = {
  /**
   * 保存当前 4 域状态到 v2 存档
   */
  saveArchive(archiveId: string, archiveName?: string): SaveArchive {
    const archive = collectDomains(archiveId, archiveName);
    writeArchive(archive);

    const idx = readIndex();
    idx[archiveId] = {
      archiveId,
      archiveName,
      createdAt: idx[archiveId]?.createdAt || archive.createdAt,
      updatedAt: archive.updatedAt,
      worldDay: archive.world.currentDay,
      domains: {
        character: archive.character.meta,
        npcs: archive.npcs.meta,
        items: archive.items.meta,
        chronicle: archive.chronicle.meta,
      },
    };
    writeIndex(idx);
    return archive;
  },

  /**
   * 加载存档, 单域失败不阻塞其他域
   */
  loadArchive(archiveId: string): LoadResult {
    const errors: Partial<Record<DomainName, string>> = {};
    const archive = readArchive(archiveId);
    if (!archive) {
      return { archive: null, domainErrors: { character: '存档不存在或版本不兼容' } };
    }

    injectDomains(archive, errors);
    return { archive, domainErrors: errors };
  },

  /**
   * 列出所有存档元数据
   */
  listArchives(): ArchiveIndexEntry[] {
    const idx = readIndex();
    return Object.values(idx).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  /**
   * 删除存档
   */
  deleteArchive(archiveId: string): void {
    deleteArchive(archiveId);
  },

  /**
   * 检查 archiveId 是否存在
   */
  exists(archiveId: string): boolean {
    return getKey(archiveId) in (typeof localStorage !== 'undefined' ? localStorage : {});
  },
};
