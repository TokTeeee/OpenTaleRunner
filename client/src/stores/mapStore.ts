import { create } from 'zustand';
import type { MapViewLevel, WorldMapData, RegionRef, LocationMapData } from '../types/map';
import * as mapStorage from '../services/map/mapStorage';

interface MapState {
  // View state
  viewLevel: MapViewLevel;
  currentWorldMapId: string | null;
  currentRegionId: string | null;
  currentLocationId: string | null;

  // Map data (runtime cache)
  worldMap: WorldMapData | null;
  currentRegion: RegionRef | null;
  locationMap: LocationMapData | null;

  // Player position
  playerRegionId: string | null;
  playerLocationId: string | null;
  playerLocationPos: { x: number; y: number };

  // Loading states
  isLoadingWorldMap: boolean;
  isLoadingRegion: boolean;
  isLoadingLocation: boolean;

  // Actions
  setViewLevel: (level: MapViewLevel) => void;
  navigateToRegion: (regionId: string) => Promise<void>;
  navigateToLocation: (locationId: string) => Promise<void>;
  navigateBack: () => void;
  updatePlayerPosition: (pos: { regionId?: string; locationId?: string; locationPos?: { x: number; y: number } }) => void;
  loadWorldMap: (worldMapId: string) => Promise<void>;
  generateAndSaveWorldMap: (data: WorldMapData) => Promise<void>;
  resetMapData: () => Promise<void>;
}

export const useMapStore = create<MapState>()((set, get) => ({
  viewLevel: 'world',
  currentWorldMapId: null,
  currentRegionId: null,
  currentLocationId: null,

  worldMap: null,
  currentRegion: null,
  locationMap: null,

  playerRegionId: null,
  playerLocationId: null,
  playerLocationPos: { x: 0, y: 0 },

  isLoadingWorldMap: false,
  isLoadingRegion: false,
  isLoadingLocation: false,

  setViewLevel: (level) => set({ viewLevel: level }),

  navigateToRegion: async (regionId) => {
    const { worldMap } = get();
    if (!worldMap) return;
    const region = worldMap.regions.find(r => r.id === regionId);
    if (!region) return;
    set({ viewLevel: 'region', currentRegionId: regionId, currentRegion: region, currentLocationId: null, locationMap: null });
  },

  navigateToLocation: async (locationId) => {
    set({ viewLevel: 'location', currentLocationId: locationId, isLoadingLocation: true });
    try {
      const locationMap = await mapStorage.getLocationMap(locationId);
      set({ locationMap, isLoadingLocation: false });
    } catch {
      set({ isLoadingLocation: false });
    }
  },

  navigateBack: () => {
    const { viewLevel } = get();
    if (viewLevel === 'location') {
      set({ viewLevel: 'region', currentLocationId: null, locationMap: null });
    } else if (viewLevel === 'region') {
      set({ viewLevel: 'world', currentRegionId: null, currentRegion: null });
    }
  },

  updatePlayerPosition: (pos) => {
    const updates: Partial<MapState> = {};
    if (pos.regionId !== undefined) updates.playerRegionId = pos.regionId;
    if (pos.locationId !== undefined) updates.playerLocationId = pos.locationId;
    if (pos.locationPos !== undefined) updates.playerLocationPos = pos.locationPos;
    set(updates);
  },

  loadWorldMap: async (worldMapId) => {
    set({ isLoadingWorldMap: true });
    try {
      const worldMap = await mapStorage.getWorldMap(worldMapId);
      if (worldMap) {
        set({ worldMap, currentWorldMapId: worldMapId, isLoadingWorldMap: false });
      } else {
        set({ isLoadingWorldMap: false });
      }
    } catch {
      set({ isLoadingWorldMap: false });
    }
  },

  generateAndSaveWorldMap: async (data) => {
    await mapStorage.saveWorldMap(data);
    set({ worldMap: data, currentWorldMapId: data.id });
  },

  resetMapData: async () => {
    await mapStorage.clearAllMapData();
    set({
      viewLevel: 'world',
      currentWorldMapId: null,
      currentRegionId: null,
      currentLocationId: null,
      worldMap: null,
      currentRegion: null,
      locationMap: null,
      playerRegionId: null,
      playerLocationId: null,
      playerLocationPos: { x: 0, y: 0 },
    });
  },
}));
