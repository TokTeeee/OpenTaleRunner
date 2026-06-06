/**
 * 世界同步状态中心。
 * 保存 Storybook、世界日、区域状态、世界编年史、幽灵 NPC 和待处理奇遇，
 * 是客户端消费服务端世界快照与增量同步结果的唯一落点。
 */
import { create } from 'zustand';
import type { RegionData, GhostNPC, WorldChronicleEntry, Encounter, StoryBook } from '../types/world';
import { normalizeStoryBook } from '../services/storybook/normalizeStoryBook';
import { DEFAULT_WORLD_LORE } from '../services/storybook/runtime';

interface WorldState {
  currentWorldDay: number;
  worldLore: string;
  storybook: StoryBook | null;
  regions: Record<string, RegionData>;
  worldChronicle: WorldChronicleEntry[];
  ghostNPCs: GhostNPC[];
  pendingEncounters: Encounter[];
  lastSyncTime: number;

  setWorldDay: (day: number) => void;
  setWorldLore: (lore: string) => void;
  setStorybook: (sb: StoryBook) => void;
  setRegions: (regions: RegionData[]) => void;
  mergeRegionStates: (regions: Record<string, RegionData>) => void;
  addChronicleEntry: (entry: WorldChronicleEntry) => void;
  setChronicle: (entries: WorldChronicleEntry[]) => void;
  setGhostNPCs: (npcs: GhostNPC[]) => void;
  setPendingEncounters: (encounters: Encounter[]) => void;
  addEncounter: (enc: Encounter) => void;
  resolveEncounter: (id: string) => void;
  setLastSyncTime: (time: number) => void;
}

export const useWorldStore = create<WorldState>((set) => ({
  currentWorldDay: 1,
  worldLore: DEFAULT_WORLD_LORE,
  storybook: null,
  regions: {},
  worldChronicle: [],
  ghostNPCs: [],
  pendingEncounters: [],
  lastSyncTime: 0,

  setWorldDay: (day) => set({ currentWorldDay: day }),
  setWorldLore: (lore) => set({ worldLore: lore }),
  setStorybook: (sb) => set((state) => {
    const normalized = normalizeStoryBook(sb);
    if (!normalized) return state;

    const nextRegions: Record<string, RegionData> = { ...state.regions };
    for (const region of normalized.regions) {
      nextRegions[region.id] = { ...(nextRegions[region.id] || {}), ...region };
    }

    return {
      storybook: normalized,
      worldLore: normalized.worldLore?.geography || DEFAULT_WORLD_LORE,
      regions: nextRegions,
    };
  }),
  setRegions: (regions) => {
    const map: Record<string, RegionData> = {};
    for (const r of regions) {
      map[r.id] = r;
    }
    set({ regions: map });
  },
  mergeRegionStates: (regions) => set((state) => ({
    regions: Object.entries(regions).reduce<Record<string, RegionData>>((acc, [regionId, region]) => {
      acc[regionId] = {
        ...(acc[regionId] || {}),
        ...region,
        id: region.id || regionId,
        currentEvents: region.currentEvents || [],
        subRegions: region.subRegions || [],
        factions: region.factions || [],
        terrain: region.terrain || acc[regionId]?.terrain || '',
        description: region.description || acc[regionId]?.description || '',
        name: region.name || acc[regionId]?.name || regionId,
      };
      return acc;
    }, { ...state.regions }),
  })),
  addChronicleEntry: (entry) =>
    set((s) => ({ worldChronicle: [...s.worldChronicle, entry].slice(-50) })),
  setChronicle: (entries) => set({ worldChronicle: entries }),
  setGhostNPCs: (npcs) => set({ ghostNPCs: npcs }),
  setPendingEncounters: (encounters) => set({ pendingEncounters: encounters }),
  addEncounter: (enc) =>
    set((s) => ({ pendingEncounters: [...s.pendingEncounters, enc] })),
  resolveEncounter: (id) =>
    set((s) => ({
      pendingEncounters: s.pendingEncounters.filter((e) => e.encounterId !== id),
    })),
  setLastSyncTime: (time) => set({ lastSyncTime: time }),
}));
