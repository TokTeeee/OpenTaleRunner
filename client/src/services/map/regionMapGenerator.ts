import type { RegionRef, LocationRef, LocationType } from '../../types/map';

// Simple seeded PRNG (mulberry32) - same as worldMapGenerator
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Location type distribution by region type
const LOCATION_DISTRIBUTION: Record<string, { type: LocationType; weight: number }[]> = {
  kingdom: [
    { type: 'capital', weight: 1 },
    { type: 'town', weight: 3 },
    { type: 'village', weight: 4 },
    { type: 'forest', weight: 2 },
    { type: 'wilderness', weight: 1 },
  ],
  wasteland: [
    { type: 'town', weight: 1 },
    { type: 'village', weight: 2 },
    { type: 'dungeon', weight: 3 },
    { type: 'wilderness', weight: 4 },
  ],
  frontier: [
    { type: 'town', weight: 2 },
    { type: 'village', weight: 2 },
    { type: 'mountain', weight: 3 },
    { type: 'wilderness', weight: 3 },
    { type: 'dungeon', weight: 1 },
  ],
  island: [
    { type: 'town', weight: 2 },
    { type: 'village', weight: 3 },
    { type: 'wilderness', weight: 2 },
    { type: 'forest', weight: 2 },
  ],
};

// Location name templates
const LOCATION_NAMES: Record<LocationType, string[]> = {
  capital: ['王都', '帝都', '首府', '主城'],
  town: ['镇', '堡', '城', '港'],
  village: ['村', '庄', '屯', '营'],
  dungeon: ['洞窟', '遗迹', '地下城', '古墓'],
  wilderness: ['荒野', '旷原', '荒地', '原野'],
  mountain: ['山岭', '峰', '崖', '岭'],
  forest: ['林', '森', '树林', '密林'],
};

const LOCATION_PREFIXES = ['翡翠', '银月', '赤焰', '碧风', '苍穹', '紫晶', '暗影', '金狮', '铁壁', '星河'];

export interface RegionMapGenOptions {
  region: RegionRef;  // base region without locations
  locationCount?: number; // default 6
  gridWidth?: number;  // default 20
  gridHeight?: number; // default 15
}

/**
 * Generate locations for a region
 */
export function generateRegionMap(options: RegionMapGenOptions): RegionRef {
  const { region, locationCount = 6, gridWidth = 20, gridHeight = 15 } = options;
  const rng = mulberry32(hashString(region.id));

  const distribution = LOCATION_DISTRIBUTION[region.type] || LOCATION_DISTRIBUTION.kingdom;
  const totalWeight = distribution.reduce((sum, d) => sum + d.weight, 0);

  const locations: LocationRef[] = [];
  const usedPositions = new Set<string>();

  // Ensure first location is a capital/town for kingdom
  let hasCapital = false;

  for (let i = 0; i < locationCount; i++) {
    // Pick location type based on weighted distribution
    let locationType: LocationType;
    if (i === 0 && region.type === 'kingdom' && !hasCapital) {
      locationType = 'capital';
      hasCapital = true;
    } else {
      let roll = rng() * totalWeight;
      locationType = distribution[0].type;
      for (const d of distribution) {
        roll -= d.weight;
        if (roll <= 0) { locationType = d.type; break; }
      }
    }

    // Find position with minimum distance from other locations
    let attempts = 0;
    while (attempts < 50) {
      const x = Math.floor(rng() * gridWidth);
      const y = Math.floor(rng() * gridHeight);
      const posKey = `${x},${y}`;

      if (usedPositions.has(posKey)) { attempts++; continue; }

      // Minimum distance between locations
      const minDist = 3;
      const tooClose = locations.some(l => Math.abs(l.regionPos.x - x) + Math.abs(l.regionPos.y - y) < minDist);
      if (tooClose) { attempts++; continue; }

      usedPositions.add(posKey);

      // Generate name
      const prefix = LOCATION_PREFIXES[Math.floor(rng() * LOCATION_PREFIXES.length)];
      const suffix = LOCATION_NAMES[locationType][Math.floor(rng() * LOCATION_NAMES[locationType].length)];
      const name = `${prefix}${suffix}`;

      locations.push({
        id: `${region.id}_loc_${i}`,
        name,
        type: locationType,
        regionPos: { x, y },
        discovered: i === 0, // first location discovered
      });
      break;
    }
  }

  return {
    ...region,
    locations,
  };
}
