import type { WorldTileType, BuildingType } from '../../types/map';

// World map tile colors (pixel 8-bit style)
export const WORLD_TILE_COLORS: Record<WorldTileType, { fill: string; border: string }> = {
  ocean:    { fill: '#2a5c8a', border: '#1e4a70' },
  plains:   { fill: '#8ab860', border: '#6a9840' },
  forest:   { fill: '#4a7840', border: '#3a5830' },
  mountain: { fill: '#8a7868', border: '#6a5848' },
  desert:   { fill: '#d4b878', border: '#b49858' },
  snow:     { fill: '#c8d8e8', border: '#a8b8c8' },
  swamp:    { fill: '#5a6848', border: '#4a4838' },
};

// Region type colors (for region markers on world map)
export const REGION_TYPE_COLORS: Record<string, { fill: string; border: string; label: string }> = {
  kingdom:   { fill: '#d4a040', border: '#b48020', label: '👑' },
  wasteland: { fill: '#a06040', border: '#804020', label: '💀' },
  frontier:  { fill: '#60a080', border: '#408060', label: '⚔' },
  island:    { fill: '#40a0c0', border: '#2080a0', label: '🏝' },
};

// Location type colors (for location markers on region map)
export const LOCATION_TYPE_COLORS: Record<string, { fill: string; border: string; label: string }> = {
  capital:    { fill: '#d4a040', border: '#b48020', label: '🏰' },
  town:       { fill: '#a0a0a0', border: '#808080', label: '🏘' },
  village:    { fill: '#80a060', border: '#608040', label: '🏡' },
  dungeon:    { fill: '#a04040', border: '#802020', label: '⚔' },
  wilderness: { fill: '#608040', border: '#406020', label: '🌲' },
  mountain:   { fill: '#8a7868', border: '#6a5848', label: '⛰' },
  forest:     { fill: '#4a7840', border: '#3a5830', label: '🌳' },
};

// Building type colors (for building markers on location map)
export const BUILDING_TYPE_COLORS: Record<BuildingType, { fill: string; border: string; label: string }> = {
  guild:      { fill: '#d4a040', border: '#b48020', label: '⚔' },
  blacksmith: { fill: '#a06040', border: '#804020', label: '🔨' },
  shop:       { fill: '#60a080', border: '#408060', label: '🏪' },
  inn:        { fill: '#a08060', border: '#806040', label: '🍺' },
  temple:     { fill: '#c0c0e0', border: '#a0a0c0', label: '⛪' },
  house:      { fill: '#808080', border: '#606060', label: '🏠' },
  landmark:   { fill: '#d4d040', border: '#b4b020', label: '★' },
};

// Player marker color
export const PLAYER_MARKER = { fill: '#6060ff', border: '#4040ff', glow: 'rgba(96,96,255,0.4)' };

// NPC marker color
export const NPC_MARKER = { fill: '#40c080', border: '#20a060' };

// Fog color
export const FOG_COLOR = 'rgba(20,20,30,0.7)';

// Tile size in pixels
export const TILE_SIZE = 16;
