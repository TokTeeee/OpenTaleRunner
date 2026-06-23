import { describe, it, expect } from 'vitest';
import { generateWorldMap } from '../../../src/services/map/worldMapGenerator';

describe('worldMapGenerator', () => {
  const defaultOpts = { seed: 'test-seed-123' };

  it('same seed generates identical maps', () => {
    const a = generateWorldMap(defaultOpts);
    const b = generateWorldMap(defaultOpts);

    // Same id
    expect(a.id).toBe(b.id);

    // Same dimensions
    expect(a.width).toBe(b.width);
    expect(a.height).toBe(b.height);

    // Same tile types at every position
    for (let y = 0; y < a.height; y++) {
      for (let x = 0; x < a.width; x++) {
        expect(a.tiles[y][x].type).toBe(b.tiles[y][x].type);
      }
    }

    // Same regions (name, position, type)
    expect(a.regions).toHaveLength(b.regions.length);
    for (let i = 0; i < a.regions.length; i++) {
      expect(a.regions[i].id).toBe(b.regions[i].id);
      expect(a.regions[i].name).toBe(b.regions[i].name);
      expect(a.regions[i].worldPos.x).toBe(b.regions[i].worldPos.x);
      expect(a.regions[i].worldPos.y).toBe(b.regions[i].worldPos.y);
    }
  });

  it('different seeds generate different maps', () => {
    const a = generateWorldMap({ seed: 'alpha' });
    const b = generateWorldMap({ seed: 'beta' });

    // Different ids
    expect(a.id).not.toBe(b.id);

    // At least some tiles differ
    let differCount = 0;
    const w = Math.min(a.width, b.width);
    const h = Math.min(a.height, b.height);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (a.tiles[y][x].type !== b.tiles[y][x].type) differCount++;
      }
    }
    expect(differCount).toBeGreaterThan(0);
  });

  it('map dimensions match options', () => {
    const map = generateWorldMap({ seed: 'dim-test', width: 20, height: 15 });
    expect(map.width).toBe(20);
    expect(map.height).toBe(15);
    expect(map.tiles).toHaveLength(15);
    for (const row of map.tiles) {
      expect(row).toHaveLength(20);
    }
  });

  it('uses default dimensions when not specified', () => {
    const map = generateWorldMap(defaultOpts);
    expect(map.width).toBe(40);
    expect(map.height).toBe(30);
  });

  it('at least one region is discovered (starting area)', () => {
    const map = generateWorldMap(defaultOpts);
    const discovered = map.regions.filter(r => r.discovered);
    expect(discovered.length).toBeGreaterThanOrEqual(1);
  });

  it('no ocean tiles have regionId', () => {
    const map = generateWorldMap(defaultOpts);
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.tiles[y][x];
        if (tile.type === 'ocean') {
          expect(tile.regionId).toBeUndefined();
        }
      }
    }
  });

  it('non-ocean tiles have regionId assigned', () => {
    const map = generateWorldMap(defaultOpts);
    const regionIds = new Set(map.regions.map(r => r.id));
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.tiles[y][x];
        if (tile.type !== 'ocean') {
          expect(tile.regionId).toBeDefined();
          expect(regionIds.has(tile.regionId!)).toBe(true);
        }
      }
    }
  });

  it('region count is reasonable', () => {
    const map5 = generateWorldMap({ seed: 'rc', regionCount: 5 });
    expect(map5.regions.length).toBeGreaterThanOrEqual(1);
    expect(map5.regions.length).toBeLessThanOrEqual(5);

    const map10 = generateWorldMap({ seed: 'rc2', regionCount: 10 });
    expect(map10.regions.length).toBeGreaterThanOrEqual(1);
    expect(map10.regions.length).toBeLessThanOrEqual(10);
  });

  it('player position references a valid region', () => {
    const map = generateWorldMap(defaultOpts);
    const regionIds = map.regions.map(r => r.id);
    expect(regionIds).toContain(map.playerPos.regionId);
  });

  it('generatedAt is a recent timestamp', () => {
    const before = Date.now();
    const map = generateWorldMap(defaultOpts);
    const after = Date.now();
    expect(map.generatedAt).toBeGreaterThanOrEqual(before);
    expect(map.generatedAt).toBeLessThanOrEqual(after);
  });

  it('region names are non-empty strings', () => {
    const map = generateWorldMap(defaultOpts);
    for (const region of map.regions) {
      expect(region.name.length).toBeGreaterThan(0);
    }
  });

  it('regions have valid terrain types', () => {
    const map = generateWorldMap(defaultOpts);
    const validTerrains = new Set(['ocean', 'plains', 'forest', 'mountain', 'desert', 'snow', 'swamp']);
    for (const region of map.regions) {
      expect(validTerrains.has(region.terrain)).toBe(true);
      expect(validTerrains.has(region.climate)).toBe(true);
    }
  });
});
