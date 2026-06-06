import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SaveManager } from '../../../src/services/save/SaveManager';
import { useCharacterStore } from '../../../src/stores/characterStore';
import { useNPCStore } from '../../../src/stores/npcStore';
import { useItemRegistryStore } from '../../../src/stores/itemRegistryStore';
import { useGameStore } from '../../../src/stores/gameStore';
import { SAVE_ARCHIVE_VERSION } from '../../../src/types/save';
import { resetClientStores } from '../../utils/resetStores';
import type { Character } from '../../../src/types/character';
import type { GameNPC } from '../../../src/types/npc';

const CHAR_ID = 'p_alice';
const NPC_ID = 'npc_merchant';

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    characterId: CHAR_ID,
    playerId: 'p1',
    name: 'Alice',
    race: 'human',
    background: '',
    appearance: '',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    skills: [],
    inventory: { backpack: [], equipped: { weapon: null, armor: null, accessory: null }, currency: { gold: 0, silver: 0, copper: 0 } },
    hp: 30, maxHp: 30,
    vital: { hunger: 0, thirst: 0, fatigue: 0, hygiene: 0, morale: 0, wound: 0, temperature: 0, encumbrance: 0 },
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    conditions: [],
    joinedRegion: 'r1', joinedWorldDay: 1, currentLocalDay: 1, lastActionTime: '',
    recentHistory: [],
    currentRegion: 'r1',
    ...overrides,
  };
}

function makeNPC(): GameNPC {
  return {
    npcId: NPC_ID,
    name: '王二',
    race: 'human',
    background: '酒馆老板',
    personality: '精明',
    appearance: '',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    skills: [],
    hp: 30, maxHp: 30,
    region: 'r1',
    met: true,
    metAt: { worldDay: 1, region: 'r1' },
    metDay: 1,
    attitude: 0,
    familiarity: 0,
    relationshipLevel: 'stranger',
    interactionCount: 0,
    knownInfo: [],
    secrets: [],
    history: [],
  };
}

beforeEach(() => {
  resetClientStores();
  localStorage.clear();
  useCharacterStore.getState().setCharacter(makeChar());
});

afterEach(() => {
  resetClientStores();
  localStorage.clear();
});

describe('SaveManager — PR-5 4 域独立存档', () => {
  describe('saveArchive', () => {
    it('返回 v2 SaveArchive, 包含 4 域', () => {
      const archive = SaveManager.saveArchive('test_save_1', 'Test Save');
      expect(archive.version).toBe(SAVE_ARCHIVE_VERSION);
      expect(archive.character.meta.recordCount).toBe(1);
      expect(archive.npcs.meta.recordCount).toBe(0);
      expect(archive.items.meta.recordCount).toBe(0);
      expect(archive.world.currentDay).toBe(1);
    });

    it('存档中包含 NPC 和 Item', () => {
      useNPCStore.getState().registerNPC(makeNPC());
      useItemRegistryStore.getState().register({
        name: '黑铁剑', category: 'weapon', quality: '精良',
        spawnInfo: { worldDay: 1, region: 'r1', source: 'test' },
        holder: { kind: 'character', refId: CHAR_ID },
      });

      const archive = SaveManager.saveArchive('test_save_2');
      expect(archive.npcs.meta.recordCount).toBe(1);
      expect(archive.items.meta.recordCount).toBe(1);
      expect(archive.npcs.byId[NPC_ID]).toBeDefined();
    });

    it('archiveName 写入索引', () => {
      SaveManager.saveArchive('test_save_3', 'My Adventure');
      const idx = SaveManager.listArchives();
      const entry = idx.find((e) => e.archiveId === 'test_save_3');
      expect(entry?.archiveName).toBe('My Adventure');
    });

    it('多次保存同 archiveId 会更新 updatedAt', async () => {
      const a1 = SaveManager.saveArchive('test_save_4');
      await new Promise((r) => setTimeout(r, 10));
      const a2 = SaveManager.saveArchive('test_save_4');
      expect(new Date(a2.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(a1.updatedAt).getTime());
    });
  });

  describe('loadArchive', () => {
    it('加载已存在的存档: 4 域全部恢复', () => {
      // 准备数据
      useNPCStore.getState().registerNPC(makeNPC());
      useItemRegistryStore.getState().register({
        name: '盾', category: 'armor', quality: '精良',
        spawnInfo: { worldDay: 1, region: 'r1', source: 'test' },
        holder: { kind: 'character', refId: CHAR_ID },
      });
      useGameStore.getState().setRegion('北方雪原', '霜风谷');
      useGameStore.getState().setDay(5);
      useGameStore.getState().setClock(720);  // 中午

      SaveManager.saveArchive('test_load_1');

      // 重置所有 store (不清理 localStorage, 保留存档)
      resetClientStores();

      const result = SaveManager.loadArchive('test_load_1');
      expect(result.archive).not.toBeNull();
      expect(Object.keys(result.domainErrors).length).toBe(0);

      // 验证各域已恢复
      expect(useCharacterStore.getState().character?.name).toBe('Alice');
      expect(useNPCStore.getState().npcs[NPC_ID]?.name).toBe('王二');
      expect(Object.keys(useItemRegistryStore.getState().items).length).toBe(1);
      expect(useGameStore.getState().currentRegion).toBe('北方雪原');
      expect(useGameStore.getState().currentDay).toBe(5);
    });

    it('存档不存在时返回错误', () => {
      const result = SaveManager.loadArchive('nonexistent_xxx');
      expect(result.archive).toBeNull();
      expect(result.domainErrors.character).toBeDefined();
    });

    it('损坏的存档 JSON 返回错误而非崩溃', () => {
      localStorage.setItem('opentale-runner.save.v2.corrupted', '{ broken json');
      const result = SaveManager.loadArchive('corrupted');
      expect(result.archive).toBeNull();
    });
  });

  describe('listArchives / deleteArchive / exists', () => {
    it('listArchives 按 updatedAt 降序', async () => {
      SaveManager.saveArchive('save_A');
      await new Promise((r) => setTimeout(r, 10));
      SaveManager.saveArchive('save_B');
      const idx = SaveManager.listArchives();
      expect(idx.length).toBe(2);
      expect(idx[0].archiveId).toBe('save_B');  // 较新的在前面
    });

    it('deleteArchive 移除存档和索引', () => {
      SaveManager.saveArchive('to_delete');
      expect(SaveManager.exists('to_delete')).toBe(true);
      SaveManager.deleteArchive('to_delete');
      expect(SaveManager.exists('to_delete')).toBe(false);
      expect(SaveManager.listArchives().find((e) => e.archiveId === 'to_delete')).toBeUndefined();
    });
  });

  describe('4 域独立性 (核心契约)', () => {
    it('Character 域数据损坏时, 其他域仍能加载', () => {
      // 创建一个部分损坏的存档: character 域坏, 其他域好
      const partial = {
        archiveId: 'partial_1',
        version: SAVE_ARCHIVE_VERSION,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        character: { byPlayer: 'not an object' as never, meta: { savedAt: '', recordCount: 0, sizeBytes: 0 } },
        npcs: { byId: {}, meta: { savedAt: '', recordCount: 0, sizeBytes: 0 } },
        items: { byId: {}, meta: { savedAt: '', recordCount: 0, sizeBytes: 0 } },
        chronicle: { world: [], personal: [], meta: { savedAt: '', recordCount: 0, sizeBytes: 0 } },
        world: { currentDay: 1, currentClock: 0, currentRegion: '', currentSubRegion: '', weather: '', terrain: '' },
      };
      localStorage.setItem('opentale-runner.save.v2.partial_1', JSON.stringify(partial));

      // 这里我们实际上预期: saveArchive 时收集是同步的, 加载时 setCharacter(nullish) 不会崩
      // 但如果 partial.character 是字符串, setCharacter 会抛错 — 我们期望 errors.character 被填
      const result = SaveManager.loadArchive('partial_1');
      // character 域失败 (因为 byPlayer 是字符串), 但 npcs/items/world 应仍可加载
      expect(result.archive).not.toBeNull();
      // errors 应至少包含 character
      expect(result.domainErrors.character).toBeDefined();
    });
  });
});
