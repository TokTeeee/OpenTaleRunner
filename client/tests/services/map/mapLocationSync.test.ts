import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncMapLocationFromGame, applyLocationChange } from '../../../src/services/map/mapLocationSync';
import { useMapStore } from '../../../src/stores/mapStore';
import { useGameStore } from '../../../src/stores/gameStore';
import type { WorldMapData, RegionRef, LocationMapData, MapBuilding } from '../../../src/types/map';
import type { LocationChange } from '../../../src/types/map';

// ─── Test data factories ─────────────────────────────────────────────────────

function makeRegion(overrides: Partial<RegionRef> = {}): RegionRef {
  return {
    id: 'region-1',
    name: '翡翠王国',
    type: 'kingdom',
    worldPos: { x: 3, y: 3 },
    climate: 'temperate',
    terrain: 'plains',
    discovered: true,
    locations: [
      { id: 'loc-1', name: '王都', type: 'capital', regionPos: { x: 2, y: 2 }, discovered: true },
      { id: 'loc-2', name: '铁壁镇', type: 'town', regionPos: { x: 5, y: 5 }, discovered: true },
    ],
    ...overrides,
  };
}

function makeWorldMap(overrides: Partial<WorldMapData> = {}): WorldMapData {
  return {
    id: 'world-test',
    width: 10,
    height: 10,
    tiles: [],
    regions: [makeRegion()],
    playerPos: { regionId: 'region-1' },
    generatedAt: Date.now(),
    ...overrides,
  };
}

function makeLocationMap(overrides: Partial<LocationMapData> = {}): LocationMapData {
  return {
    id: 'loc-1',
    name: '王都',
    type: 'capital',
    backgroundImageKey: 'bg-key',
    buildings: [
      { id: 'bld-1', type: 'guild', name: '冒险者公会', tileX: 3, tileY: 4, width: 2, height: 2, npcIds: [] },
    ],
    npcs: [],
    landmarks: [],
    playerPos: { x: 0, y: 0 },
    generatedAt: Date.now(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('mapLocationSync', () => {
  beforeEach(() => {
    useMapStore.setState({
      worldMap: null,
      currentRegion: null,
      locationMap: null,
      playerRegionId: null,
      playerLocationId: null,
      playerLocationPos: { x: 0, y: 0 },
    });
    useGameStore.setState({
      currentRegion: '',
      currentSubRegion: '',
      currentLocation: '',
    });
  });

  // ─── syncMapLocationFromGame ─────────────────────────────────────────────

  describe('syncMapLocationFromGame', () => {
    it('updates playerRegionId when region matches by id', () => {
      const worldMap = makeWorldMap();
      useMapStore.setState({ worldMap });
      useGameStore.setState({ currentRegion: 'region-1' });

      syncMapLocationFromGame();

      expect(useMapStore.getState().playerRegionId).toBe('region-1');
    });

    it('updates playerRegionId when region matches by name', () => {
      const worldMap = makeWorldMap();
      useMapStore.setState({ worldMap });
      useGameStore.setState({ currentRegion: '翡翠王国' });

      syncMapLocationFromGame();

      expect(useMapStore.getState().playerRegionId).toBe('region-1');
    });

    it('updates playerLocationId when location matches in current region', () => {
      const worldMap = makeWorldMap();
      const region = worldMap.regions[0];
      useMapStore.setState({ worldMap, currentRegion: region, playerRegionId: 'region-1' });
      useGameStore.setState({ currentRegion: 'region-1', currentLocation: '王都' });

      syncMapLocationFromGame();

      expect(useMapStore.getState().playerLocationId).toBe('loc-1');
    });

    it('updates playerLocationId when location name partially matches', () => {
      const worldMap = makeWorldMap();
      const region = worldMap.regions[0];
      useMapStore.setState({ worldMap, currentRegion: region, playerRegionId: 'region-1' });
      useGameStore.setState({ currentRegion: 'region-1', currentLocation: '铁壁镇集市' });

      syncMapLocationFromGame();

      expect(useMapStore.getState().playerLocationId).toBe('loc-2');
    });

    it('does nothing when no world map exists', () => {
      useGameStore.setState({ currentRegion: 'region-1', currentLocation: '王都' });

      syncMapLocationFromGame();

      expect(useMapStore.getState().playerRegionId).toBeNull();
      expect(useMapStore.getState().playerLocationId).toBeNull();
    });

    it('does not update region if already at that region', () => {
      const worldMap = makeWorldMap();
      useMapStore.setState({ worldMap, playerRegionId: 'region-1' });
      useGameStore.setState({ currentRegion: 'region-1' });

      const updateSpy = vi.spyOn(useMapStore.getState(), 'updatePlayerPosition');
      syncMapLocationFromGame();

      // updatePlayerPosition should not be called since region already matches
      expect(updateSpy).not.toHaveBeenCalled();
      updateSpy.mockRestore();
    });

    it('does not update location if already at that location', () => {
      const worldMap = makeWorldMap();
      const region = worldMap.regions[0];
      useMapStore.setState({ worldMap, currentRegion: region, playerRegionId: 'region-1', playerLocationId: 'loc-1' });
      useGameStore.setState({ currentRegion: 'region-1', currentLocation: '王都' });

      const updateSpy = vi.spyOn(useMapStore.getState(), 'updatePlayerPosition');
      syncMapLocationFromGame();

      // updatePlayerPosition should not be called for location since it already matches
      expect(updateSpy).not.toHaveBeenCalled();
      updateSpy.mockRestore();
    });

    it('does nothing when currentRegion is empty', () => {
      const worldMap = makeWorldMap();
      useMapStore.setState({ worldMap });
      useGameStore.setState({ currentRegion: '' });

      syncMapLocationFromGame();

      expect(useMapStore.getState().playerRegionId).toBeNull();
    });
  });

  // ─── applyLocationChange ─────────────────────────────────────────────────

  describe('applyLocationChange', () => {
    it('applies region type change by id', () => {
      const worldMap = makeWorldMap();
      useMapStore.setState({ worldMap });

      const change: LocationChange = { type: 'region', targetId: 'region-1', description: '前往翡翠王国' };
      applyLocationChange(change);

      expect(useMapStore.getState().playerRegionId).toBe('region-1');
    });

    it('applies region type change by name', () => {
      const worldMap = makeWorldMap();
      useMapStore.setState({ worldMap });

      const change: LocationChange = { type: 'region', targetId: '翡翠王国', description: '前往翡翠王国' };
      applyLocationChange(change);

      expect(useMapStore.getState().playerRegionId).toBe('region-1');
    });

    it('applies location type change by id', () => {
      const worldMap = makeWorldMap();
      const region = worldMap.regions[0];
      useMapStore.setState({ worldMap, currentRegion: region });

      const change: LocationChange = { type: 'location', targetId: 'loc-1', description: '进入王都' };
      applyLocationChange(change);

      expect(useMapStore.getState().playerLocationId).toBe('loc-1');
    });

    it('applies location type change by name', () => {
      const worldMap = makeWorldMap();
      const region = worldMap.regions[0];
      useMapStore.setState({ worldMap, currentRegion: region });

      const change: LocationChange = { type: 'location', targetId: '王都', description: '进入王都' };
      applyLocationChange(change);

      expect(useMapStore.getState().playerLocationId).toBe('loc-1');
    });

    it('applies building type change', () => {
      const worldMap = makeWorldMap();
      const locationMap = makeLocationMap();
      useMapStore.setState({ worldMap, locationMap });

      const change: LocationChange = { type: 'building', targetId: 'bld-1', description: '走进冒险者公会' };
      applyLocationChange(change);

      expect(useMapStore.getState().playerLocationPos).toEqual({ x: 3, y: 4 });
    });

    it('applies building type change by name', () => {
      const worldMap = makeWorldMap();
      const locationMap = makeLocationMap();
      useMapStore.setState({ worldMap, locationMap });

      const change: LocationChange = { type: 'building', targetId: '冒险者公会', description: '走进冒险者公会' };
      applyLocationChange(change);

      expect(useMapStore.getState().playerLocationPos).toEqual({ x: 3, y: 4 });
    });

    it('does nothing when no world map exists', () => {
      const change: LocationChange = { type: 'region', targetId: 'region-1', description: '前往翡翠王国' };
      applyLocationChange(change);

      expect(useMapStore.getState().playerRegionId).toBeNull();
    });

    it('does nothing for location change when no current region', () => {
      const worldMap = makeWorldMap();
      useMapStore.setState({ worldMap, currentRegion: null });

      const change: LocationChange = { type: 'location', targetId: 'loc-1', description: '进入王都' };
      applyLocationChange(change);

      expect(useMapStore.getState().playerLocationId).toBeNull();
    });

    it('does nothing for building change when no location map', () => {
      const worldMap = makeWorldMap();
      useMapStore.setState({ worldMap, locationMap: null });

      const change: LocationChange = { type: 'building', targetId: 'bld-1', description: '走进冒险者公会' };
      applyLocationChange(change);

      expect(useMapStore.getState().playerLocationPos).toEqual({ x: 0, y: 0 });
    });
  });
});
