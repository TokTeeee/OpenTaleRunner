import type { WorldMapData, WorldTile, WorldTileType, RegionRef, RegionType } from '../../types/map';

// Simple seeded PRNG (mulberry32)
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Convert string seed to number
function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

// Simple 2D value noise
function generateNoiseGrid(width: number, height: number, rng: () => number, scale: number = 8): number[][] {
  // Generate low-res noise
  const lowW = Math.ceil(width / scale) + 2;
  const lowH = Math.ceil(height / scale) + 2;
  const lowNoise: number[][] = [];
  for (let y = 0; y < lowH; y++) {
    lowNoise[y] = [];
    for (let x = 0; x < lowW; x++) {
      lowNoise[y][x] = rng();
    }
  }

  // Interpolate to full resolution
  const result: number[][] = [];
  for (let y = 0; y < height; y++) {
    result[y] = [];
    for (let x = 0; x < width; x++) {
      const fx = x / scale;
      const fy = y / scale;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const dx = fx - ix;
      const dy = fy - iy;

      // Bilinear interpolation
      const v00 = lowNoise[iy]?.[ix] ?? 0.5;
      const v10 = lowNoise[iy]?.[ix + 1] ?? 0.5;
      const v01 = lowNoise[iy + 1]?.[ix] ?? 0.5;
      const v11 = lowNoise[iy + 1]?.[ix + 1] ?? 0.5;

      const top = v00 + (v10 - v00) * dx;
      const bottom = v01 + (v11 - v01) * dx;
      result[y][x] = top + (bottom - top) * dy;
    }
  }
  return result;
}

// Map noise value to terrain type
function noiseToTerrain(value: number): WorldTileType {
  if (value < 0.25) return 'ocean';
  if (value < 0.40) return 'plains';
  if (value < 0.55) return 'forest';
  if (value < 0.65) return 'plains';
  if (value < 0.75) return 'mountain';
  if (value < 0.85) return 'desert';
  if (value < 0.92) return 'swamp';
  return 'snow';
}

// Determine region type from terrain
function terrainToRegionType(terrain: WorldTileType): RegionType {
  switch (terrain) {
    case 'ocean': return 'island';
    case 'desert': return 'wasteland';
    case 'snow': return 'frontier';
    case 'mountain': return 'frontier';
    default: return 'kingdom';
  }
}

// Region name prefixes
const REGION_PREFIXES: Record<RegionType, string[]> = {
  kingdom: ['翡翠', '银月', '金狮', '赤焰', '碧风', '苍穹', '紫晶'],
  wasteland: ['焦土', '荒芜', '枯骨', '暗影', '裂隙', '灰烬'],
  frontier: ['北境', '边陲', '铁壁', '风暴', '寒霜', '雷霆'],
  island: ['星海', '碧波', '珊瑚', '潮汐', '浪花', '深渊'],
};

const REGION_SUFFIXES: Record<RegionType, string[]> = {
  kingdom: ['王国', '帝国', '联邦', '公国'],
  wasteland: ['荒原', '废土', '裂谷', '深渊'],
  frontier: ['要塞', '防线', '边墙', '堡垒'],
  island: ['群岛', '列岛', '岛链', '环礁'],
};

export interface WorldMapGenOptions {
  seed: string;
  width?: number;  // default 40
  height?: number; // default 30
  regionCount?: number; // default 5
}

/**
 * Generate a world map from seed
 */
export function generateWorldMap(options: WorldMapGenOptions): WorldMapData {
  const { seed, width = 40, height = 30, regionCount = 5 } = options;
  const rng = mulberry32(hashSeed(seed));

  // Generate noise grid
  const noise = generateNoiseGrid(width, height, rng, 6);

  // Convert to tiles
  const tiles: WorldTile[][] = [];
  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    for (let x = 0; x < width; x++) {
      tiles[y][x] = {
        type: noiseToTerrain(noise[y][x]),
      };
    }
  }

  // Find suitable positions for regions (not in ocean, spread out)
  const regions: RegionRef[] = [];
  const usedPositions = new Set<string>();

  for (let i = 0; i < regionCount; i++) {
    let attempts = 0;
    while (attempts < 100) {
      const x = Math.floor(rng() * width);
      const y = Math.floor(rng() * height);
      const tile = tiles[y]?.[x];
      if (!tile || tile.type === 'ocean') { attempts++; continue; }

      const posKey = `${x},${y}`;
      if (usedPositions.has(posKey)) { attempts++; continue; }

      // Check minimum distance from other regions
      const minDist = 5;
      const tooClose = regions.some(r => Math.abs(r.worldX - x) + Math.abs(r.worldY - y) < minDist);
      if (tooClose) { attempts++; continue; }

      usedPositions.add(posKey);
      const regionType = terrainToRegionType(tile.type);
      const prefixes = REGION_PREFIXES[regionType];
      const suffixes = REGION_SUFFIXES[regionType];
      const name = `${prefixes[Math.floor(rng() * prefixes.length)]}${suffixes[Math.floor(rng() * suffixes.length)]}`;

      regions.push({
        id: `region_${i}`,
        name,
        type: regionType,
        worldX: x,
        worldY: y,
        climate: tile.type,
        terrain: tile.type,
        discovered: i === 0, // first region is discovered (starting area)
        locations: [],
      });
      break;
    }
  }

  // Assign tiles to regions (nearest region)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y][x].type === 'ocean') continue;
      let nearestRegion: string | undefined;
      let nearestDist = Infinity;
      for (const region of regions) {
        const dist = Math.abs(region.worldX - x) + Math.abs(region.worldY - y);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestRegion = region.id;
        }
      }
      tiles[y][x].regionId = nearestRegion;
    }
  }

  // Player starts in first discovered region
  const startRegion = regions.find(r => r.discovered) || regions[0];

  return {
    id: `world_${hashSeed(seed)}`,
    width,
    height,
    tiles,
    regions,
    playerPos: { regionId: startRegion?.id ?? '' },
    generatedAt: Date.now(),
  };
}
