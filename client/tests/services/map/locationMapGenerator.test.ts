import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildLocationPrompt, generateLocationStructure, generateLocationMap } from '../../../src/services/map/locationMapGenerator';
import type { LocationRef } from '../../../src/types/map';
import { useSettingsStore } from '../../../src/stores/settingsStore';
import { resetClientStores } from '../../utils/resetStores';

// ─── Mock mapStorage ────────────────────────────────────────────────────────

vi.mock('../../../src/services/map/mapStorage', () => ({
  getLocationMap: vi.fn().mockResolvedValue(null),
  saveLocationMap: vi.fn().mockResolvedValue(undefined),
  saveLocationImage: vi.fn().mockResolvedValue(undefined),
}));

import * as mapStorage from '../../../src/services/map/mapStorage';

// ─── Test data factory ──────────────────────────────────────────────────────

function makeLocationRef(overrides: Partial<LocationRef> = {}): LocationRef {
  return {
    id: 'loc-test-001',
    name: '测试城镇',
    type: 'town',
    regionX: 5,
    regionY: 5,
    discovered: true,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('locationMapGenerator', () => {
  beforeEach(() => {
    resetClientStores();
    vi.clearAllMocks();
    // Reset mapStorage mocks to default
    vi.mocked(mapStorage.getLocationMap).mockResolvedValue(null);
    vi.mocked(mapStorage.saveLocationMap).mockResolvedValue(undefined);
    vi.mocked(mapStorage.saveLocationImage).mockResolvedValue(undefined);
  });

  // ─── buildLocationPrompt ────────────────────────────────────────────────

  describe('buildLocationPrompt', () => {
    it('generates prompt with correct location type description for capital', () => {
      const loc = makeLocationRef({ type: 'capital', name: '王都' });
      const prompt = buildLocationPrompt(loc);
      expect(prompt).toContain('pixel art 8-bit RPG game map');
      expect(prompt).toContain('top-down view');
      expect(prompt).toContain('grand capital city');
      expect(prompt).toContain('王都');
      expect(prompt).toContain('dark fantasy atmosphere');
    });

    it('generates prompt with correct location type description for town', () => {
      const loc = makeLocationRef({ type: 'town', name: '铁壁镇' });
      const prompt = buildLocationPrompt(loc);
      expect(prompt).toContain('medieval town');
      expect(prompt).toContain('铁壁镇');
    });

    it('generates prompt with correct location type description for village', () => {
      const loc = makeLocationRef({ type: 'village', name: '碧风村' });
      const prompt = buildLocationPrompt(loc);
      expect(prompt).toContain('small peaceful village');
    });

    it('generates prompt with correct location type description for dungeon', () => {
      const loc = makeLocationRef({ type: 'dungeon', name: '暗影洞窟' });
      const prompt = buildLocationPrompt(loc);
      expect(prompt).toContain('dark underground dungeon');
    });

    it('generates prompt with correct location type description for wilderness', () => {
      const loc = makeLocationRef({ type: 'wilderness', name: '荒原' });
      const prompt = buildLocationPrompt(loc);
      expect(prompt).toContain('vast wilderness');
    });

    it('generates prompt with correct location type description for mountain', () => {
      const loc = makeLocationRef({ type: 'mountain', name: '苍穹峰' });
      const prompt = buildLocationPrompt(loc);
      expect(prompt).toContain('mountainous area');
    });

    it('generates prompt with correct location type description for forest', () => {
      const loc = makeLocationRef({ type: 'forest', name: '翡翠林' });
      const prompt = buildLocationPrompt(loc);
      expect(prompt).toContain('dense forest');
    });

    it('includes climate when provided', () => {
      const loc = makeLocationRef({ type: 'town', name: '赤焰镇' });
      const prompt = buildLocationPrompt(loc, 'arid');
      expect(prompt).toContain('arid climate');
    });

    it('omits climate when not provided', () => {
      const loc = makeLocationRef({ type: 'town', name: '赤焰镇' });
      const prompt = buildLocationPrompt(loc);
      expect(prompt).not.toContain('climate');
    });

    it('includes required style keywords', () => {
      const loc = makeLocationRef({ type: 'town', name: '测试' });
      const prompt = buildLocationPrompt(loc);
      expect(prompt).toContain('pixel art 8-bit');
      expect(prompt).toContain('top-down view');
      expect(prompt).toContain('detailed tilemap style');
      expect(prompt).toContain('no text');
      expect(prompt).toContain('no UI elements');
    });
  });

  // ─── generateLocationStructure ──────────────────────────────────────────

  describe('generateLocationStructure', () => {
    it('generates buildings for capital', () => {
      const loc = makeLocationRef({ id: 'struct-capital', type: 'capital', name: '王都' });
      const result = generateLocationStructure(loc);
      expect(result.buildings.length).toBeGreaterThan(0);
      // Capital should have at least landmark, guild, blacksmith, shop, inn, temple, houses
      const types = new Set(result.buildings.map(b => b.type));
      expect(types.has('landmark')).toBe(true);
      expect(types.has('guild')).toBe(true);
    });

    it('generates buildings for town', () => {
      const loc = makeLocationRef({ id: 'struct-town', type: 'town', name: '铁壁镇' });
      const result = generateLocationStructure(loc);
      expect(result.buildings.length).toBeGreaterThan(0);
    });

    it('generates buildings for village', () => {
      const loc = makeLocationRef({ id: 'struct-village', type: 'village', name: '碧风村' });
      const result = generateLocationStructure(loc);
      expect(result.buildings.length).toBeGreaterThan(0);
    });

    it('generates buildings for dungeon', () => {
      const loc = makeLocationRef({ id: 'struct-dungeon', type: 'dungeon', name: '暗影洞窟' });
      const result = generateLocationStructure(loc);
      expect(result.buildings.length).toBeGreaterThan(0);
    });

    it('generates NPCs associated with buildings', () => {
      const loc = makeLocationRef({ id: 'struct-npc', type: 'town', name: '测试镇' });
      const result = generateLocationStructure(loc);
      // Should have up to 3 NPCs
      expect(result.npcs.length).toBeGreaterThan(0);
      expect(result.npcs.length).toBeLessThanOrEqual(3);

      // Each NPC should reference a valid building
      for (const npc of result.npcs) {
        expect(npc.buildingId).not.toBeNull();
        const building = result.buildings.find(b => b.id === npc.buildingId);
        expect(building).toBeDefined();
        // Building should list this NPC
        expect(building!.npcIds).toContain(npc.id);
      }
    });

    it('generates player position at center of grid', () => {
      const loc = makeLocationRef({ id: 'struct-pos', type: 'town', name: '测试' });
      const result = generateLocationStructure(loc, 16);
      expect(result.playerPos).toEqual({ x: 8, y: 8 });
    });

    it('respects custom gridSize', () => {
      const loc = makeLocationRef({ id: 'struct-grid', type: 'town', name: '测试' });
      const result = generateLocationStructure(loc, 20);
      expect(result.playerPos).toEqual({ x: 10, y: 10 });
      // All buildings should fit within grid
      for (const b of result.buildings) {
        expect(b.tileX + b.width).toBeLessThanOrEqual(20);
        expect(b.tileY + b.height).toBeLessThanOrEqual(20);
      }
    });

    it('has no overlapping buildings', () => {
      const loc = makeLocationRef({ id: 'struct-overlap', type: 'capital', name: '王都' });
      const result = generateLocationStructure(loc);

      const occupied = new Set<string>();
      for (const b of result.buildings) {
        for (let dy = 0; dy < b.height; dy++) {
          for (let dx = 0; dx < b.width; dx++) {
            const key = `${b.tileX + dx},${b.tileY + dy}`;
            expect(occupied.has(key)).toBe(false);
            occupied.add(key);
          }
        }
      }
    });

    it('is deterministic: same id produces same result', () => {
      const locA = makeLocationRef({ id: 'same-id-123', type: 'capital', name: '王都' });
      const locB = makeLocationRef({ id: 'same-id-123', type: 'capital', name: '王都' });
      const resultA = generateLocationStructure(locA);
      const resultB = generateLocationStructure(locB);

      expect(resultA.buildings).toHaveLength(resultB.buildings.length);
      for (let i = 0; i < resultA.buildings.length; i++) {
        expect(resultA.buildings[i].id).toBe(resultB.buildings[i].id);
        expect(resultA.buildings[i].tileX).toBe(resultB.buildings[i].tileX);
        expect(resultA.buildings[i].tileY).toBe(resultB.buildings[i].tileY);
        expect(resultA.buildings[i].width).toBe(resultB.buildings[i].width);
        expect(resultA.buildings[i].height).toBe(resultB.buildings[i].height);
      }
      expect(resultA.npcs).toHaveLength(resultB.npcs.length);
      expect(resultA.playerPos).toEqual(resultB.playerPos);
    });

    it('different id produces different result', () => {
      const locA = makeLocationRef({ id: 'alpha-id', type: 'town', name: '镇A' });
      const locB = makeLocationRef({ id: 'beta-id', type: 'town', name: '镇B' });
      const resultA = generateLocationStructure(locA);
      const resultB = generateLocationStructure(locB);

      // At least some buildings should differ in position
      let differCount = 0;
      const len = Math.min(resultA.buildings.length, resultB.buildings.length);
      for (let i = 0; i < len; i++) {
        if (
          resultA.buildings[i].tileX !== resultB.buildings[i].tileX ||
          resultA.buildings[i].tileY !== resultB.buildings[i].tileY
        ) {
          differCount++;
        }
      }
      expect(differCount).toBeGreaterThan(0);
    });

    it('building ids are unique', () => {
      const loc = makeLocationRef({ id: 'struct-unique', type: 'capital', name: '王都' });
      const result = generateLocationStructure(loc);
      const ids = result.buildings.map(b => b.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('npc ids are unique', () => {
      const loc = makeLocationRef({ id: 'struct-npc-unique', type: 'town', name: '镇' });
      const result = generateLocationStructure(loc);
      const ids = result.npcs.map(n => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('returns correct id, name, type from input', () => {
      const loc = makeLocationRef({ id: 'my-loc', type: 'village', name: '碧风村' });
      const result = generateLocationStructure(loc);
      expect(result.id).toBe('my-loc');
      expect(result.name).toBe('碧风村');
      expect(result.type).toBe('village');
    });

    it('generatedAt is a recent timestamp', () => {
      const loc = makeLocationRef({ id: 'struct-time', type: 'town', name: '测试' });
      const before = Date.now();
      const result = generateLocationStructure(loc);
      const after = Date.now();
      expect(result.generatedAt).toBeGreaterThanOrEqual(before);
      expect(result.generatedAt).toBeLessThanOrEqual(after);
    });
  });

  // ─── generateLocationMap ────────────────────────────────────────────────

  describe('generateLocationMap', () => {
    it('returns existing data if already in storage', async () => {
      const existingData = {
        id: 'loc-exist',
        name: '已存在',
        type: 'town' as const,
        backgroundImageKey: 'img-key',
        buildings: [],
        npcs: [],
        landmarks: [],
        playerPos: { x: 8, y: 8 },
        generatedAt: 1000,
      };
      vi.mocked(mapStorage.getLocationMap).mockResolvedValue(existingData);

      const loc = makeLocationRef({ id: 'loc-exist', name: '已存在', type: 'town' });
      const result = await generateLocationMap(loc);

      expect(result).toEqual(existingData);
      // Should NOT call saveLocationMap since data already exists
      expect(mapStorage.saveLocationMap).not.toHaveBeenCalled();
    });

    it('generates and saves new data when not in storage', async () => {
      // No API configured — skip image generation
      const loc = makeLocationRef({ id: 'loc-new', name: '新镇', type: 'town' });
      const result = await generateLocationMap(loc);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('loc-new');
      expect(result!.name).toBe('新镇');
      expect(result!.type).toBe('town');
      expect(result!.buildings.length).toBeGreaterThan(0);
      // No API configured, so backgroundImageKey should be empty
      expect(result!.backgroundImageKey).toBe('');
      // Should have saved the data
      expect(mapStorage.saveLocationMap).toHaveBeenCalledTimes(1);
    });

    it('generates image when API is configured and returns success', async () => {
      useSettingsStore.setState((s) => ({
        ...s,
        mapImageGen: {
          apiEndpoint: 'https://image.test/v1/images/generations',
          apiKey: 'test-key',
          imageSize: '512x512' as const,
        },
      }));

      const fakeBase64 = btoa('fake-png-data');
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ b64_json: fakeBase64 }] }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const loc = makeLocationRef({ id: 'loc-img', name: '图镇', type: 'town' });
      const result = await generateLocationMap(loc);

      expect(result).not.toBeNull();
      expect(result!.backgroundImageKey).toBe('loc_img_loc-img');
      expect(mapStorage.saveLocationImage).toHaveBeenCalledTimes(1);
      expect(mapStorage.saveLocationMap).toHaveBeenCalledTimes(1);

      // Verify fetch was called with correct params
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://image.test/v1/images/generations');
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer test-key');
      const body = JSON.parse(String(init.body));
      expect(body.prompt).toContain('图镇');
      expect(body.size).toBe('512x512');
      expect(body.response_format).toBe('b64_json');
    });

    it('handles API failure gracefully', async () => {
      useSettingsStore.setState((s) => ({
        ...s,
        mapImageGen: {
          apiEndpoint: 'https://image.test/v1/images/generations',
          apiKey: 'test-key',
          imageSize: '512x512' as const,
        },
      }));

      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });
      vi.stubGlobal('fetch', fetchMock);

      const loc = makeLocationRef({ id: 'loc-fail', name: '失败镇', type: 'town' });
      const result = await generateLocationMap(loc);

      expect(result).not.toBeNull();
      expect(result!.backgroundImageKey).toBe('');
      // Should still save the map data (without image)
      expect(mapStorage.saveLocationMap).toHaveBeenCalledTimes(1);
      // Should NOT try to save an image
      expect(mapStorage.saveLocationImage).not.toHaveBeenCalled();
    });

    it('handles fetch throwing an error gracefully', async () => {
      useSettingsStore.setState((s) => ({
        ...s,
        mapImageGen: {
          apiEndpoint: 'https://image.test/v1/images/generations',
          apiKey: 'test-key',
          imageSize: '512x512' as const,
        },
      }));

      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

      const loc = makeLocationRef({ id: 'loc-throw', name: '异常镇', type: 'town' });
      const result = await generateLocationMap(loc);

      expect(result).not.toBeNull();
      expect(result!.backgroundImageKey).toBe('');
      expect(mapStorage.saveLocationMap).toHaveBeenCalledTimes(1);
    });

    it('skips image generation when API is not configured', async () => {
      // Default settings have empty apiEndpoint and apiKey
      const loc = makeLocationRef({ id: 'loc-noapi', name: '无API镇', type: 'town' });
      const result = await generateLocationMap(loc);

      expect(result).not.toBeNull();
      expect(result!.backgroundImageKey).toBe('');
      expect(mapStorage.saveLocationImage).not.toHaveBeenCalled();
    });

    it('handles API response with missing b64_json gracefully', async () => {
      useSettingsStore.setState((s) => ({
        ...s,
        mapImageGen: {
          apiEndpoint: 'https://image.test/v1/images/generations',
          apiKey: 'test-key',
          imageSize: '512x512' as const,
        },
      }));

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{}] }), // no b64_json
      });
      vi.stubGlobal('fetch', fetchMock);

      const loc = makeLocationRef({ id: 'loc-nob64', name: '无数据镇', type: 'town' });
      const result = await generateLocationMap(loc);

      expect(result).not.toBeNull();
      expect(result!.backgroundImageKey).toBe('');
      expect(mapStorage.saveLocationImage).not.toHaveBeenCalled();
    });
  });
});
