import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMapStore } from '../../src/stores/mapStore';
import type { WorldMapData, RegionRef, LocationMapData } from '../../src/types/map';

vi.mock('../../src/services/map/mapStorage', () => ({
  getWorldMap: vi.fn(),
  saveWorldMap: vi.fn(),
  getLocationMap: vi.fn(),
  clearAllMapData: vi.fn(),
}));

import * as mapStorage from '../../src/services/map/mapStorage';

const mockGetWorldMap = vi.mocked(mapStorage.getWorldMap);
const mockSaveWorldMap = vi.mocked(mapStorage.saveWorldMap);
const mockGetLocationMap = vi.mocked(mapStorage.getLocationMap);
const mockClearAllMapData = vi.mocked(mapStorage.clearAllMapData);

function makeRegion(overrides: Partial<RegionRef> = {}): RegionRef {
  return {
    id: 'region_1',
    name: '翡翠森林',
    description: '一片古老的森林',
    terrain: 'forest',
    ...overrides,
  };
}

function makeWorldMap(overrides: Partial<WorldMapData> = {}): WorldMapData {
  return {
    id: 'world_1',
    name: '艾瑟兰',
    regions: [makeRegion()],
    ...overrides,
  };
}

function makeLocationMap(overrides: Partial<LocationMapData> = {}): LocationMapData {
  return {
    id: 'loc_1',
    name: '古树祭坛',
    description: '森林深处的祭坛',
    width: 20,
    height: 20,
    tiles: [],
    ...overrides,
  };
}

describe('mapStore', () => {
  beforeEach(() => {
    useMapStore.setState(useMapStore.getInitialState(), true);
    vi.clearAllMocks();
  });

  describe('初始状态', () => {
    it('默认值正确', () => {
      const s = useMapStore.getState();
      expect(s.viewLevel).toBe('world');
      expect(s.currentWorldMapId).toBeNull();
      expect(s.currentRegionId).toBeNull();
      expect(s.currentLocationId).toBeNull();
      expect(s.worldMap).toBeNull();
      expect(s.currentRegion).toBeNull();
      expect(s.locationMap).toBeNull();
      expect(s.playerRegionId).toBeNull();
      expect(s.playerLocationId).toBeNull();
      expect(s.playerLocationPos).toEqual({ x: 0, y: 0 });
      expect(s.isLoadingWorldMap).toBe(false);
      expect(s.isLoadingRegion).toBe(false);
      expect(s.isLoadingLocation).toBe(false);
    });
  });

  describe('setViewLevel', () => {
    it('更改 viewLevel', () => {
      useMapStore.getState().setViewLevel('region');
      expect(useMapStore.getState().viewLevel).toBe('region');

      useMapStore.getState().setViewLevel('location');
      expect(useMapStore.getState().viewLevel).toBe('location');

      useMapStore.getState().setViewLevel('world');
      expect(useMapStore.getState().viewLevel).toBe('world');
    });
  });

  describe('navigateToRegion', () => {
    it('worldMap 存在且 regionId 匹配时更新状态', async () => {
      const region = makeRegion();
      const worldMap = makeWorldMap({ regions: [region] });
      useMapStore.setState({ worldMap });

      await useMapStore.getState().navigateToRegion('region_1');

      const s = useMapStore.getState();
      expect(s.viewLevel).toBe('region');
      expect(s.currentRegionId).toBe('region_1');
      expect(s.currentRegion).toEqual(region);
      expect(s.currentLocationId).toBeNull();
      expect(s.locationMap).toBeNull();
    });

    it('worldMap 为 null 时不更新', async () => {
      useMapStore.setState({ worldMap: null, viewLevel: 'world' });
      await useMapStore.getState().navigateToRegion('region_1');
      expect(useMapStore.getState().viewLevel).toBe('world');
    });

    it('regionId 不匹配时不更新', async () => {
      const worldMap = makeWorldMap();
      useMapStore.setState({ worldMap, viewLevel: 'world' });
      await useMapStore.getState().navigateToRegion('nonexistent');
      expect(useMapStore.getState().viewLevel).toBe('world');
    });
  });

  describe('navigateBack', () => {
    it('location → region', () => {
      const region = makeRegion();
      useMapStore.setState({
        viewLevel: 'location',
        currentRegionId: 'region_1',
        currentRegion: region,
        currentLocationId: 'loc_1',
        locationMap: makeLocationMap(),
      });

      useMapStore.getState().navigateBack();

      const s = useMapStore.getState();
      expect(s.viewLevel).toBe('region');
      expect(s.currentLocationId).toBeNull();
      expect(s.locationMap).toBeNull();
      expect(s.currentRegionId).toBe('region_1');
      expect(s.currentRegion).toEqual(region);
    });

    it('region → world', () => {
      useMapStore.setState({
        viewLevel: 'region',
        currentRegionId: 'region_1',
        currentRegion: makeRegion(),
      });

      useMapStore.getState().navigateBack();

      const s = useMapStore.getState();
      expect(s.viewLevel).toBe('world');
      expect(s.currentRegionId).toBeNull();
      expect(s.currentRegion).toBeNull();
    });

    it('world 时不变', () => {
      useMapStore.setState({ viewLevel: 'world' });
      useMapStore.getState().navigateBack();
      expect(useMapStore.getState().viewLevel).toBe('world');
    });

    it('location → region → world 连续后退', () => {
      const region = makeRegion();
      useMapStore.setState({
        viewLevel: 'location',
        currentRegionId: 'region_1',
        currentRegion: region,
        currentLocationId: 'loc_1',
        locationMap: makeLocationMap(),
      });

      useMapStore.getState().navigateBack();
      expect(useMapStore.getState().viewLevel).toBe('region');

      useMapStore.getState().navigateBack();
      expect(useMapStore.getState().viewLevel).toBe('world');
      expect(useMapStore.getState().currentRegionId).toBeNull();
      expect(useMapStore.getState().currentRegion).toBeNull();
    });
  });

  describe('updatePlayerPosition', () => {
    it('更新 regionId', () => {
      useMapStore.getState().updatePlayerPosition({ regionId: 'r1' });
      expect(useMapStore.getState().playerRegionId).toBe('r1');
      expect(useMapStore.getState().playerLocationId).toBeNull();
    });

    it('更新 locationId', () => {
      useMapStore.getState().updatePlayerPosition({ locationId: 'l1' });
      expect(useMapStore.getState().playerLocationId).toBe('l1');
      expect(useMapStore.getState().playerRegionId).toBeNull();
    });

    it('更新 locationPos', () => {
      useMapStore.getState().updatePlayerPosition({ locationPos: { x: 5, y: 10 } });
      expect(useMapStore.getState().playerLocationPos).toEqual({ x: 5, y: 10 });
    });

    it('部分更新不影响其他字段', () => {
      useMapStore.setState({
        playerRegionId: 'r1',
        playerLocationId: 'l1',
        playerLocationPos: { x: 3, y: 7 },
      });

      useMapStore.getState().updatePlayerPosition({ regionId: 'r2' });

      const s = useMapStore.getState();
      expect(s.playerRegionId).toBe('r2');
      expect(s.playerLocationId).toBe('l1');
      expect(s.playerLocationPos).toEqual({ x: 3, y: 7 });
    });

    it('同时更新多个字段', () => {
      useMapStore.getState().updatePlayerPosition({
        regionId: 'r_new',
        locationId: 'l_new',
        locationPos: { x: 1, y: 2 },
      });

      const s = useMapStore.getState();
      expect(s.playerRegionId).toBe('r_new');
      expect(s.playerLocationId).toBe('l_new');
      expect(s.playerLocationPos).toEqual({ x: 1, y: 2 });
    });
  });

  describe('resetMapData', () => {
    it('清除所有状态', async () => {
      mockClearAllMapData.mockResolvedValue(undefined);

      useMapStore.setState({
        viewLevel: 'location',
        currentWorldMapId: 'world_1',
        currentRegionId: 'region_1',
        currentLocationId: 'loc_1',
        worldMap: makeWorldMap(),
        currentRegion: makeRegion(),
        locationMap: makeLocationMap(),
        playerRegionId: 'r1',
        playerLocationId: 'l1',
        playerLocationPos: { x: 5, y: 10 },
      });

      await useMapStore.getState().resetMapData();

      const s = useMapStore.getState();
      expect(s.viewLevel).toBe('world');
      expect(s.currentWorldMapId).toBeNull();
      expect(s.currentRegionId).toBeNull();
      expect(s.currentLocationId).toBeNull();
      expect(s.worldMap).toBeNull();
      expect(s.currentRegion).toBeNull();
      expect(s.locationMap).toBeNull();
      expect(s.playerRegionId).toBeNull();
      expect(s.playerLocationId).toBeNull();
      expect(s.playerLocationPos).toEqual({ x: 0, y: 0 });

      expect(mockClearAllMapData).toHaveBeenCalledOnce();
    });
  });
});
