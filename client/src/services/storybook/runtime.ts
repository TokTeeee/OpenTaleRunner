import type { NPCRoleTemplate, RegionData, StoryBook, StoryKeyNPC, SubRegion } from '../../types/world';
import { normalizeStoryBook } from './normalizeStoryBook';
import { APIClient } from '../sync/APIClient';

export const STORYBOOK_CACHE_KEY = 'aeslan-storybook';
export const DEFAULT_WORLD_NAME = '当前世界';
export const DEFAULT_WORLD_LORE = '一个等待被探索的世界。';
export const DEFAULT_WORLD_ERA = '未记之纪';
export const DEFAULT_START_REGION_ID = 'starting_region';
export const DEFAULT_START_REGION_NAME = '启程之地';
export const DEFAULT_START_SUB_REGION = '旅途起点';

export interface ResolvedBirthLocation {
  id: string;
  name: string;
  coord: string;
  desc: string;
  coordinates?: { x: number; z: number };
  type?: string;
}

export interface ResolvedStartingContext {
  regionId: string;
  regionName: string;
  subRegion: string;
  description: string;
  birthLocations: ResolvedBirthLocation[];
  keyNPCs: StoryKeyNPC[];
}

let inflightStorybookLoad: Promise<StoryBook | null> | null = null;

function formatCoordinates(coordinates?: { x?: number; z?: number }): string {
  return `(${coordinates?.x ?? 0}, ${coordinates?.z ?? 0})`;
}

function sanitizeLocationId(prefix: string, name: string, index: number): string {
  const encoded = encodeURIComponent(name || String(index)).replace(/%/g, '').slice(0, 24);
  return `${prefix}_${encoded || index}`;
}

function isSubRegion(value: unknown): value is SubRegion {
  return !!value && typeof value === 'object' && typeof (value as SubRegion).name === 'string';
}

function hasBirthplaceFlag(location: SubRegion): boolean {
  return Boolean(location.canBeBirthplace ?? location.can_be_birthplace);
}

function normalizeKeyNPC(raw: unknown): StoryKeyNPC | null {
  if (!raw || typeof raw !== 'object') return null;

  const npc = raw as Record<string, unknown>;
  const name = typeof npc.name === 'string' ? npc.name.trim() : '';
  if (!name) return null;

  return {
    name,
    role: typeof npc.role === 'string' ? npc.role : '',
    personality: typeof npc.personality === 'string' ? npc.personality : '',
    appearance: typeof npc.appearance === 'string' ? npc.appearance : undefined,
    templateKey: typeof npc.templateKey === 'string'
      ? npc.templateKey
      : (typeof npc.template_key === 'string' ? npc.template_key : undefined),
  };
}

function getRegionKeyNPCs(region?: RegionData): StoryKeyNPC[] {
  if (!region) return [];

  const candidates = Array.isArray(region.keyNPCs)
    ? region.keyNPCs
    : (Array.isArray(region.key_npcs) ? region.key_npcs : []);
  return candidates.map(normalizeKeyNPC).filter((npc): npc is StoryKeyNPC => Boolean(npc));
}

function getBirthLocationsFromRegion(region?: RegionData): SubRegion[] {
  if (!region) return [];

  const candidates = Array.isArray(region.sub_regions)
    ? region.sub_regions.filter(isSubRegion)
    : [];
  const markedBirthplaces = candidates.filter(hasBirthplaceFlag);
  return (markedBirthplaces.length > 0 ? markedBirthplaces : candidates).slice(0, 6);
}

function findRegion(storybook?: StoryBook | null, regionId?: string): RegionData | undefined {
  if (!storybook?.regions?.length) return undefined;
  if (regionId) {
    const exact = storybook.regions.find((region) => region.id === regionId || region.name === regionId);
    if (exact) return exact;
  }
  return storybook.regions[0];
}

function hasRegion(storybook?: StoryBook | null, regionId?: string): boolean {
  return Boolean(regionId && storybook?.regions?.some((region) => region.id === regionId || region.name === regionId));
}

function getFirstSubRegionName(region?: RegionData): string {
  const firstStructured = Array.isArray(region?.sub_regions) ? region.sub_regions.find(isSubRegion) : undefined;
  if (firstStructured?.name) return firstStructured.name;
  const firstNamed = Array.isArray(region?.subRegions) ? region.subRegions[0] : undefined;
  return firstNamed || '';
}

export function getWorldName(storybook?: StoryBook | null): string {
  return storybook?.worldName?.trim() || storybook?.world_name?.trim() || DEFAULT_WORLD_NAME;
}

export function getWorldLore(storybook?: StoryBook | null, fallbackLore?: string): string {
  return storybook?.worldLore?.geography?.trim()
    || storybook?.world_lore?.geography?.trim()
    || fallbackLore?.trim()
    || DEFAULT_WORLD_LORE;
}

export function getWorldEra(storybook?: StoryBook | null): string {
  return storybook?.currentEra?.trim() || storybook?.current_era?.trim() || DEFAULT_WORLD_ERA;
}

export function resolveRegionName(storybook?: StoryBook | null, regionId?: string): string {
  if (!regionId) return DEFAULT_START_REGION_NAME;
  return findRegion(storybook, regionId)?.name || regionId;
}

export function resolveStartingContext(storybook?: StoryBook | null, preferredRegionId?: string): ResolvedStartingContext {
  const startingContext = storybook?.startingContext ?? storybook?.starting_context;
  const configuredRegionId = startingContext?.regionId ?? startingContext?.region_id;
  const regionId = hasRegion(storybook, preferredRegionId)
    ? (preferredRegionId as string)
    : (hasRegion(storybook, configuredRegionId) ? (configuredRegionId as string) : (storybook?.regions?.[0]?.id || preferredRegionId || DEFAULT_START_REGION_ID));
  const region = findRegion(storybook, regionId);
  const regionName = region?.name || regionId || DEFAULT_START_REGION_NAME;
  const subRegion = startingContext?.subRegion
    || startingContext?.sub_region
    || getFirstSubRegionName(region)
    || regionName
    || DEFAULT_START_SUB_REGION;
  const rawBirthLocations = (startingContext?.birthLocations?.length || startingContext?.birth_locations?.length)
    ? (startingContext?.birthLocations ?? startingContext?.birth_locations ?? [])
    : getBirthLocationsFromRegion(region);
  const birthLocations = rawBirthLocations.length > 0
    ? rawBirthLocations.map((location, index) => ({
        id: sanitizeLocationId('birth', location.name, index),
        name: location.name,
        coord: formatCoordinates(location.coordinates),
        desc: location.description || '',
        coordinates: location.coordinates,
        type: location.type,
      }))
    : [{
        id: 'birth_origin',
        name: subRegion || regionName,
        coord: '(0, 0)',
        desc: startingContext?.description || `${regionName}的旅途起点。`,
        coordinates: { x: 0, z: 0 },
        type: 'origin',
      }];

  return {
    regionId,
    regionName,
    subRegion,
    description: startingContext?.description?.trim() || region?.description?.trim() || `${regionName}是当前故事的启程之地。`,
    birthLocations,
    keyNPCs: getRegionKeyNPCs(region),
  };
}

export function matchTemplateKeyForRole(role: string, templates: NPCRoleTemplate[] = []): string | null {
  const normalizedRole = role.trim();
  if (!normalizedRole) return null;

  const exactTemplate = templates.find((template) => template.key === normalizedRole || template.name === normalizedRole);
  if (exactTemplate) return exactTemplate.key;

  const fuzzyTemplate = templates.find((template) => normalizedRole.includes(template.name) || template.name.includes(normalizedRole));
  if (fuzzyTemplate) return fuzzyTemplate.key;

  const keywordMappings: Array<[RegExp, string]> = [
    [/公会|会长|登记|委托/, 'adventurer_guild_staff'],
    [/商人|行商|店主/, 'merchant'],
    [/铁匠|锻造|炉匠/, 'blacksmith'],
    [/旅店|酒馆|老板/, 'innkeeper'],
    [/守卫|卫兵|骑士|巡逻/, 'guard'],
    [/治疗|医师|祭司|修女/, 'healer'],
    [/学者|法师|学院|顾问|女王/, 'scholar'],
    [/猎人|游侠|巡林/, 'hunter'],
    [/炼金/, 'alchemist'],
  ];

  for (const [pattern, key] of keywordMappings) {
    if (!pattern.test(normalizedRole)) continue;
    const matched = templates.find((template) => template.key === key);
    return matched?.key || key;
  }

  return null;
}

export function makeStarterNPCId(regionId: string, name: string): string {
  const encodedName = encodeURIComponent(name).replace(/%/g, '').slice(0, 32) || 'npc';
  return `storybook_${regionId}_${encodedName}`;
}

export function readCachedStorybook(): StoryBook | null {
  try {
    const cached = localStorage.getItem(STORYBOOK_CACHE_KEY);
    return cached ? normalizeStoryBook(JSON.parse(cached) as StoryBook) : null;
  } catch {
    return null;
  }
}

export async function fetchLatestStorybook(endpoint: string): Promise<StoryBook | null> {
  if (inflightStorybookLoad) return inflightStorybookLoad;

  inflightStorybookLoad = (async () => {
    try {
      const api = new APIClient(endpoint);
      const rawStorybook = await api.getFullStorybook() as StoryBook | null;
      const normalized = normalizeStoryBook(rawStorybook);
      if (normalized) {
        localStorage.setItem(STORYBOOK_CACHE_KEY, JSON.stringify(normalized));
      }
      return normalized;
    } catch {
      return null;
    } finally {
      inflightStorybookLoad = null;
    }
  })();

  return inflightStorybookLoad;
}

export async function hydrateStorybook(options: {
  endpoint: string;
  apply: (storybook: StoryBook) => void;
  preferCache?: boolean;
}): Promise<StoryBook | null> {
  const cached = options.preferCache === false ? null : readCachedStorybook();
  if (cached) {
    options.apply(cached);
  }

  const latest = await fetchLatestStorybook(options.endpoint);
  if (latest) {
    options.apply(latest);
  }

  return latest ?? cached;
}