import { describe, it, expect } from 'vitest';
import { generateRegionMap } from '../../../src/services/map/regionMapGenerator';
import type { RegionRef } from '../../../src/types/map';

function makeBaseRegion(overrides: Partial<RegionRef> = {}): RegionRef {
  return {
    id: 'region-test-001',
    name: '测试区域',
    type: 'kingdom',
    worldX: 5,
    worldY: 5,
    climate: 'plains',
    terrain: 'plains',
    discovered: true,
    locations: [],
    ...overrides,
  };
}

describe('regionMapGenerator', () => {
  it('generates correct number of locations', () => {
    const region = makeBaseRegion();
    const result = generateRegionMap({ region, locationCount: 8, gridWidth: 40, gridHeight: 30 });
    expect(result.locations).toHaveLength(8);
  });

  it('kingdom type has a capital as first location', () => {
    const region = makeBaseRegion({ type: 'kingdom' });
    const result = generateRegionMap({ region });
    expect(result.locations[0].type).toBe('capital');
  });

  it('all locations have unique positions', () => {
    const region = makeBaseRegion();
    const result = generateRegionMap({ region, locationCount: 10, gridWidth: 40, gridHeight: 30 });
    const positions = result.locations.map(l => `${l.regionX},${l.regionY}`);
    const uniquePositions = new Set(positions);
    expect(uniquePositions.size).toBe(result.locations.length);
  });

  it('first location is discovered', () => {
    const region = makeBaseRegion();
    const result = generateRegionMap({ region });
    expect(result.locations[0].discovered).toBe(true);
    // Other locations should not be discovered
    for (let i = 1; i < result.locations.length; i++) {
      expect(result.locations[i].discovered).toBe(false);
    }
  });

  it('same region id generates same result', () => {
    const regionA = makeBaseRegion({ id: 'region-same-id' });
    const regionB = makeBaseRegion({ id: 'region-same-id' });
    const resultA = generateRegionMap({ region: regionA, locationCount: 6 });
    const resultB = generateRegionMap({ region: regionB, locationCount: 6 });

    expect(resultA.locations).toHaveLength(resultB.locations.length);
    for (let i = 0; i < resultA.locations.length; i++) {
      expect(resultA.locations[i].id).toBe(resultB.locations[i].id);
      expect(resultA.locations[i].name).toBe(resultB.locations[i].name);
      expect(resultA.locations[i].type).toBe(resultB.locations[i].type);
      expect(resultA.locations[i].regionX).toBe(resultB.locations[i].regionX);
      expect(resultA.locations[i].regionY).toBe(resultB.locations[i].regionY);
    }
  });

  it('different region id generates different result', () => {
    const regionA = makeBaseRegion({ id: 'region-alpha' });
    const regionB = makeBaseRegion({ id: 'region-beta' });
    const resultA = generateRegionMap({ region: regionA, locationCount: 6 });
    const resultB = generateRegionMap({ region: regionB, locationCount: 6 });

    // At least some locations should differ
    let differCount = 0;
    const len = Math.min(resultA.locations.length, resultB.locations.length);
    for (let i = 0; i < len; i++) {
      if (
        resultA.locations[i].name !== resultB.locations[i].name ||
        resultA.locations[i].regionX !== resultB.locations[i].regionX ||
        resultA.locations[i].regionY !== resultB.locations[i].regionY
      ) {
        differCount++;
      }
    }
    expect(differCount).toBeGreaterThan(0);
  });

  it('location types match region distribution', () => {
    // Wasteland should not have capital or mountain
    const region = makeBaseRegion({ type: 'wasteland' });
    const result = generateRegionMap({ region, locationCount: 10, gridWidth: 40, gridHeight: 30 });
    const types = result.locations.map(l => l.type);

    const validWastelandTypes = new Set(['town', 'village', 'dungeon', 'wilderness']);
    for (const t of types) {
      expect(validWastelandTypes.has(t)).toBe(true);
    }

    // Island should not have capital, dungeon, or mountain
    const islandRegion = makeBaseRegion({ type: 'island' });
    const islandResult = generateRegionMap({ region: islandRegion, locationCount: 10, gridWidth: 40, gridHeight: 30 });
    const islandTypes = islandResult.locations.map(l => l.type);

    const validIslandTypes = new Set(['town', 'village', 'wilderness', 'forest']);
    for (const t of islandTypes) {
      expect(validIslandTypes.has(t)).toBe(true);
    }
  });

  it('all location ids are unique', () => {
    const region = makeBaseRegion();
    const result = generateRegionMap({ region, locationCount: 10, gridWidth: 40, gridHeight: 30 });
    const ids = result.locations.map(l => l.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(result.locations.length);
  });
});
