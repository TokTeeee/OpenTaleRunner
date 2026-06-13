// ===== View Level =====
export type MapViewLevel = 'world' | 'region' | 'location';

// ===== World Map =====
export type WorldTileType = 'ocean' | 'plains' | 'forest' | 'mountain' | 'desert' | 'snow' | 'swamp';

export interface WorldTile {
  type: WorldTileType;
  regionId?: string;       // which region this tile belongs to
}

export interface WorldMapData {
  id: string;              // based on storybook seed
  width: number;           // grid count
  height: number;
  tiles: WorldTile[][];    // terrain tiles
  regions: RegionRef[];    // enterable regions
  playerPos: { regionId: string }; // player's current region
  generatedAt: number;
}

// ===== Region Reference (on world map) =====
export type RegionType = 'kingdom' | 'wasteland' | 'frontier' | 'island';

export interface RegionRef {
  id: string;
  name: string;
  type: RegionType;
  worldX: number;
  worldY: number;
  climate: string;         // inherited from world map terrain
  terrain: string;
  discovered: boolean;
  locations: LocationRef[];
}

// ===== Location Reference (on region map) =====
export type LocationType = 'capital' | 'town' | 'village' | 'dungeon' | 'wilderness' | 'mountain' | 'forest';

export interface LocationRef {
  id: string;
  name: string;
  type: LocationType;
  regionX: number;
  regionY: number;
  discovered: boolean;
}

// ===== Location Map (detailed) =====
export interface LocationMapData {
  id: string;              // matches LocationRef.id
  name: string;
  type: LocationType;
  backgroundImageKey: string; // IndexedDB Blob key
  buildings: MapBuilding[];
  npcs: MapNPC[];
  landmarks: MapLandmark[];
  playerPos: { x: number; y: number };
  generatedAt: number;
}

// ===== Building =====
export type BuildingType = 'guild' | 'blacksmith' | 'shop' | 'inn' | 'temple' | 'house' | 'landmark';

export interface MapBuilding {
  id: string;
  type: BuildingType;
  name: string;
  tileX: number;
  tileY: number;
  width: number;
  height: number;
  npcIds: string[];        // NPCs inside building
}

// ===== NPC =====
export interface MapNPC {
  id: string;
  name: string;
  buildingId: string | null; // null = outdoors
  tileX: number;
  tileY: number;
  spriteType: string;
}

// ===== Landmark =====
export interface MapLandmark {
  id: string;
  name: string;
  tileX: number;
  tileY: number;
  description: string;
}

// ===== Map Settings (stored in settingsStore) =====
export type MapImageSize = '256x256' | '512x512' | '1024x1024';

export interface MapImageGenConfig {
  apiEndpoint: string;
  apiKey: string;
  imageSize: MapImageSize;
}

// ===== GM Location Change =====
export interface LocationChange {
  type: 'region' | 'location' | 'building';
  targetId: string;
  description: string;
}
