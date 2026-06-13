import type { LocationRef, LocationMapData, MapBuilding, MapNPC, MapLandmark, BuildingType, LocationType } from '../../types/map';
import { useSettingsStore } from '../../stores/settingsStore';
import * as mapStorage from './mapStorage';

// Location type descriptions for AI prompt
const LOCATION_DESCRIPTIONS: Record<LocationType, string> = {
  capital: 'a grand capital city with towering castle, bustling market square, and ornate temples',
  town: 'a medieval town with stone buildings, a town square, and a tavern',
  village: 'a small peaceful village with wooden houses, a well, and farmland',
  dungeon: 'a dark underground dungeon with stone corridors, traps, and treasure rooms',
  wilderness: 'a vast wilderness with scattered ruins, campsites, and natural features',
  mountain: 'a mountainous area with peaks, caves, and a mountain pass',
  forest: 'a dense forest with ancient trees, clearings, and hidden paths',
};

// Building templates by location type
const BUILDING_TEMPLATES: Record<LocationType, { type: BuildingType; name: string; minCount: number; maxCount: number }[]> = {
  capital: [
    { type: 'landmark', name: '王城', minCount: 1, maxCount: 1 },
    { type: 'guild', name: '冒险家公会', minCount: 1, maxCount: 1 },
    { type: 'blacksmith', name: '铁匠铺', minCount: 1, maxCount: 2 },
    { type: 'shop', name: '杂货店', minCount: 1, maxCount: 2 },
    { type: 'inn', name: '旅店', minCount: 1, maxCount: 2 },
    { type: 'temple', name: '神殿', minCount: 1, maxCount: 1 },
    { type: 'house', name: '民居', minCount: 3, maxCount: 6 },
  ],
  town: [
    { type: 'guild', name: '冒险家公会', minCount: 1, maxCount: 1 },
    { type: 'blacksmith', name: '铁匠铺', minCount: 1, maxCount: 1 },
    { type: 'shop', name: '杂货店', minCount: 1, maxCount: 1 },
    { type: 'inn', name: '旅店', minCount: 1, maxCount: 1 },
    { type: 'temple', name: '教堂', minCount: 0, maxCount: 1 },
    { type: 'house', name: '民居', minCount: 2, maxCount: 4 },
  ],
  village: [
    { type: 'shop', name: '杂货铺', minCount: 1, maxCount: 1 },
    { type: 'inn', name: '小酒馆', minCount: 0, maxCount: 1 },
    { type: 'house', name: '民居', minCount: 2, maxCount: 4 },
  ],
  dungeon: [
    { type: 'landmark', name: '入口', minCount: 1, maxCount: 1 },
  ],
  wilderness: [
    { type: 'landmark', name: '营地', minCount: 0, maxCount: 1 },
  ],
  mountain: [
    { type: 'landmark', name: '山口', minCount: 1, maxCount: 1 },
  ],
  forest: [
    { type: 'landmark', name: '林间空地', minCount: 0, maxCount: 1 },
  ],
};

// Simple seeded PRNG
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

/**
 * Build AI image generation prompt for a location
 */
export function buildLocationPrompt(location: LocationRef, climate?: string): string {
  const desc = LOCATION_DESCRIPTIONS[location.type] || 'a mysterious location';
  const climateStr = climate ? `, ${climate} climate` : '';
  return `pixel art 8-bit RPG game map, top-down view, ${desc}${climateStr}, ${location.name}, detailed tilemap style, no text, no UI elements, dark fantasy atmosphere`;
}

/**
 * Generate structured location data (buildings, NPCs, landmarks)
 */
export function generateLocationStructure(location: LocationRef, gridSize: number = 16): Omit<LocationMapData, 'backgroundImageKey'> {
  const rng = mulberry32(hashString(location.id));
  const buildings: MapBuilding[] = [];
  const npcs: MapNPC[] = [];
  const landmarks: MapLandmark[] = [];
  const usedPositions = new Set<string>();

  // Generate buildings
  const templates = BUILDING_TEMPLATES[location.type] || BUILDING_TEMPLATES.village;
  let buildingIndex = 0;

  for (const template of templates) {
    const count = template.minCount + Math.floor(rng() * (template.maxCount - template.minCount + 1));
    for (let i = 0; i < count; i++) {
      let attempts = 0;
      while (attempts < 30) {
        const w = template.type === 'house' ? 1 : template.type === 'landmark' ? 3 : 2;
        const h = template.type === 'house' ? 1 : template.type === 'landmark' ? 3 : 2;
        const x = Math.floor(rng() * (gridSize - w));
        const y = Math.floor(rng() * (gridSize - h));

        // Check overlap
        let overlaps = false;
        for (let dy = 0; dy < h; dy++) {
          for (let dx = 0; dx < w; dx++) {
            if (usedPositions.has(`${x + dx},${y + dy}`)) { overlaps = true; break; }
          }
          if (overlaps) break;
        }

        if (!overlaps) {
          for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
              usedPositions.add(`${x + dx},${y + dy}`);
            }
          }

          const buildingId = `${location.id}_bld_${buildingIndex++}`;
          const buildingName = count > 1 ? `${template.name}${i + 1}` : template.name;
          buildings.push({
            id: buildingId,
            type: template.type,
            name: buildingName,
            tileX: x,
            tileY: y,
            width: w,
            height: h,
            npcIds: [],
          });
          break;
        }
        attempts++;
      }
    }
  }

  // Generate a few NPCs (placeholder names)
  const npcNames = ['商人', '卫兵', '村民', '旅者', '铁匠', '祭司'];
  for (let i = 0; i < Math.min(3, buildings.length); i++) {
    const building = buildings[i];
    const npcId = `${location.id}_npc_${i}`;
    npcs.push({
      id: npcId,
      name: npcNames[i % npcNames.length],
      buildingId: building.id,
      tileX: building.tileX,
      tileY: building.tileY,
      spriteType: 'generic',
    });
    building.npcIds.push(npcId);
  }

  // Generate a landmark
  if (rng() > 0.5) {
    let attempts = 0;
    while (attempts < 20) {
      const x = Math.floor(rng() * gridSize);
      const y = Math.floor(rng() * gridSize);
      if (!usedPositions.has(`${x},${y}`)) {
        landmarks.push({
          id: `${location.id}_lm_0`,
          name: '古老石碑',
          tileX: x,
          tileY: y,
          description: '一块刻有古老文字的石碑',
        });
        break;
      }
      attempts++;
    }
  }

  return {
    id: location.id,
    name: location.name,
    type: location.type,
    buildings,
    npcs,
    landmarks,
    playerPos: { x: Math.floor(gridSize / 2), y: Math.floor(gridSize / 2) },
    generatedAt: Date.now(),
  };
}

/**
 * Generate location map: AI background + structured data
 * Returns the LocationMapData or null if generation fails
 */
export async function generateLocationMap(location: LocationRef, climate?: string): Promise<LocationMapData | null> {
  // Check if already exists in storage
  const existing = await mapStorage.getLocationMap(location.id);
  if (existing) return existing;

  // Generate structured data
  const structure = generateLocationStructure(location);

  // Try to generate AI background image
  const backgroundImageKey = `loc_img_${location.id}`;
  let imageGenerated = false;

  const settings = useSettingsStore.getState().mapImageGen;
  if (settings.apiEndpoint && settings.apiKey) {
    try {
      const prompt = buildLocationPrompt(location, climate);
      const response = await fetch(settings.apiEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          n: 1,
          size: settings.imageSize,
          response_format: 'b64_json',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const base64 = data.data?.[0]?.b64_json;
        if (base64) {
          // Convert base64 to Blob and save
          const binaryString = atob(base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: 'image/png' });
          await mapStorage.saveLocationImage(backgroundImageKey, blob);
          imageGenerated = true;
        }
      }
    } catch {
      // Image generation failed, continue without background
    }
  }

  // Save location map data
  const locationMapData: LocationMapData = {
    ...structure,
    backgroundImageKey: imageGenerated ? backgroundImageKey : '',
  };

  await mapStorage.saveLocationMap(locationMapData);
  return locationMapData;
}
