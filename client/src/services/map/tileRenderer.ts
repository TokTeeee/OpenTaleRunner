import type { WorldMapData, RegionRef, LocationMapData } from '../../types/map';
import { WORLD_TILE_COLORS, REGION_TYPE_COLORS, LOCATION_TYPE_COLORS, BUILDING_TYPE_COLORS, PLAYER_MARKER, NPC_MARKER, TILE_SIZE } from './tilesets';

export interface Viewport {
  offsetX: number;
  offsetY: number;
  zoom: number;
  canvasWidth: number;
  canvasHeight: number;
}

export function renderWorldMap(
  ctx: CanvasRenderingContext2D,
  worldMap: WorldMapData,
  viewport: Viewport,
) {
  const { offsetX, offsetY, zoom, canvasWidth, canvasHeight } = viewport;
  const tileSize = TILE_SIZE * zoom;

  // Calculate visible tile range
  const startCol = Math.max(0, Math.floor(-offsetX / tileSize));
  const startRow = Math.max(0, Math.floor(-offsetY / tileSize));
  const endCol = Math.min(worldMap.width, Math.ceil((canvasWidth - offsetX) / tileSize));
  const endRow = Math.min(worldMap.height, Math.ceil((canvasHeight - offsetY) / tileSize));

  // Draw tiles
  for (let row = startRow; row < endRow; row++) {
    for (let col = startCol; col < endCol; col++) {
      const tile = worldMap.tiles[row]?.[col];
      if (!tile) continue;

      const sx = col * tileSize + offsetX;
      const sy = row * tileSize + offsetY;
      const colors = WORLD_TILE_COLORS[tile.type];

      ctx.fillStyle = colors.fill;
      ctx.fillRect(sx, sy, tileSize + 0.5, tileSize + 0.5);

      // Subtle border at higher zoom
      if (zoom > 1.0) {
        ctx.strokeStyle = colors.border;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(sx, sy, tileSize, tileSize);
      }
    }
  }

  // Draw region markers
  for (const region of worldMap.regions) {
    drawRegionMarker(ctx, region, offsetX, offsetY, zoom);
  }

  // Draw player position
  if (worldMap.playerPos?.regionId) {
    const playerRegion = worldMap.regions.find(r => r.id === worldMap.playerPos!.regionId);
    if (playerRegion) {
      const px = (playerRegion.worldPos.x) * tileSize + offsetX + tileSize / 2;
      const py = (playerRegion.worldPos.y) * tileSize + offsetY + tileSize / 2;

      // Glow
      const glow = ctx.createRadialGradient(px, py, 3, px, py, 15 * zoom);
      glow.addColorStop(0, PLAYER_MARKER.glow);
      glow.addColorStop(1, 'rgba(96,96,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px, py, 15 * zoom, 0, Math.PI * 2);
      ctx.fill();

      // Dot
      ctx.fillStyle = PLAYER_MARKER.fill;
      ctx.beginPath();
      ctx.arc(px, py, 5 * zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PLAYER_MARKER.border;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      if (zoom > 0.8) {
        ctx.fillStyle = '#a0a0ff';
        ctx.font = `bold ${Math.max(9, 9 * zoom)}px system-ui, sans-serif`;
        ctx.fillText('你', px + 8 * zoom, py + 3 * zoom);
      }
    }
  }
}

function drawRegionMarker(
  ctx: CanvasRenderingContext2D,
  region: RegionRef,
  offsetX: number,
  offsetY: number,
  zoom: number,
) {
  const tileSize = TILE_SIZE * zoom;
  const rx = region.worldPos.x * tileSize + offsetX + tileSize / 2;
  const ry = region.worldPos.y * tileSize + offsetY + tileSize / 2;

  const colors = REGION_TYPE_COLORS[region.type] || REGION_TYPE_COLORS.kingdom;
  const markerSize = 8 * zoom;

  // Background circle
  ctx.fillStyle = region.discovered ? colors.fill : 'rgba(60,60,60,0.6)';
  ctx.beginPath();
  ctx.arc(rx, ry, markerSize, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = region.discovered ? colors.border : 'rgba(40,40,40,0.8)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Icon
  if (zoom > 0.6) {
    ctx.font = `${Math.max(10, 10 * zoom)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(colors.label, rx, ry);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }

  // Name label
  if (zoom > 1.0 && region.discovered) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.font = `bold ${Math.max(9, 9 * zoom)}px system-ui, sans-serif`;
    const metrics = ctx.measureText(region.name);
    ctx.fillRect(rx - metrics.width / 2 - 3, ry + markerSize + 2, metrics.width + 6, 14 * zoom);
    ctx.fillStyle = '#e0e0e0';
    ctx.textAlign = 'center';
    ctx.fillText(region.name, rx, ry + markerSize + 12 * zoom);
    ctx.textAlign = 'start';
  }

  // Fog overlay for undiscovered
  if (!region.discovered) {
    ctx.fillStyle = 'rgba(20,20,30,0.7)';
    ctx.beginPath();
    ctx.arc(rx, ry, markerSize + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#888';
    ctx.font = `bold ${Math.max(12, 12 * zoom)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', rx, ry);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }
}

/**
 * Render region map on canvas
 */
export function renderRegionMap(
  ctx: CanvasRenderingContext2D,
  region: RegionRef,
  viewport: Viewport,
  playerLocationId?: string | null,
  selectedLocationId?: string | null,
): void {
  const { offsetX, offsetY, zoom, canvasWidth, canvasHeight } = viewport;
  const tileSize = TILE_SIZE * zoom;

  // Background terrain based on climate
  const terrainColors = getTerrainColorsForClimate(region.climate);
  ctx.fillStyle = terrainColors.fill;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 0.5;
  for (let x = offsetX % tileSize; x < canvasWidth; x += tileSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvasHeight); ctx.stroke();
  }
  for (let y = offsetY % tileSize; y < canvasHeight; y += tileSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasWidth, y); ctx.stroke();
  }

  // Location markers
  for (const loc of region.locations) {
    const lx = loc.regionPos.x * tileSize + offsetX + tileSize / 2;
    const ly = loc.regionPos.y * tileSize + offsetY + tileSize / 2;
    if (lx < -tileSize * 2 || lx > canvasWidth + tileSize * 2 || ly < -tileSize * 2 || ly > canvasHeight + tileSize * 2) continue;

    const colors = LOCATION_TYPE_COLORS[loc.type] || LOCATION_TYPE_COLORS.town;
    const radius = tileSize * 1.2;

    ctx.fillStyle = loc.discovered ? colors.fill : 'rgba(60,60,60,0.6)';
    ctx.beginPath();
    ctx.arc(lx, ly, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = loc.discovered ? colors.border : 'rgba(40,40,40,0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Icon + name
    if (zoom > 0.6 && loc.discovered) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `${Math.max(8, 9 * zoom)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`${colors.label} ${loc.name}`, lx, ly + radius + 10 * zoom);
      ctx.textAlign = 'start';
    }

    // Fog
    if (!loc.discovered) {
      ctx.fillStyle = 'rgba(20,20,30,0.7)';
      ctx.beginPath();
      ctx.arc(lx, ly, radius + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#888';
      ctx.font = `bold ${Math.max(12, 12 * zoom)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', lx, ly);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }
  }

  // Draw player position
  if (playerLocationId) {
    const playerLoc = region.locations.find(l => l.id === playerLocationId);
    if (playerLoc) {
      const px = playerLoc.regionPos.x * tileSize + offsetX + tileSize / 2;
      const py = playerLoc.regionPos.y * tileSize + offsetY + tileSize / 2;

      // Glow
      const glow = ctx.createRadialGradient(px, py, 3, px, py, 15 * zoom);
      glow.addColorStop(0, PLAYER_MARKER.glow);
      glow.addColorStop(1, 'rgba(96,96,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px, py, 15 * zoom, 0, Math.PI * 2);
      ctx.fill();

      // Dot
      ctx.fillStyle = PLAYER_MARKER.fill;
      ctx.beginPath();
      ctx.arc(px, py, 5 * zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PLAYER_MARKER.border;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      if (zoom > 0.8) {
        ctx.fillStyle = '#a0a0ff';
        ctx.font = `bold ${Math.max(9, 9 * zoom)}px system-ui, sans-serif`;
        ctx.fillText('你', px + 8 * zoom, py + 3 * zoom);
      }
    }
  }

  // Draw highlight on selected location (when not at that location)
  if (selectedLocationId && selectedLocationId !== playerLocationId) {
    const selLoc = region.locations.find(l => l.id === selectedLocationId);
    if (selLoc) {
      const sx = selLoc.regionPos.x * tileSize + offsetX + tileSize / 2;
      const sy = selLoc.regionPos.y * tileSize + offsetY + tileSize / 2;
      const radius = tileSize * 1.2;

      // Highlight border
      ctx.strokeStyle = '#fbbf24'; // amber-400
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(sx, sy, radius + 4, 0, Math.PI * 2);
      ctx.stroke();

      // Subtle glow
      const glow = ctx.createRadialGradient(sx, sy, radius, sx, sy, radius + 12);
      glow.addColorStop(0, 'rgba(251,191,36,0.15)');
      glow.addColorStop(1, 'rgba(251,191,36,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, radius + 12, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * Render location map overlay on top of AI background image
 */
export function renderLocationOverlay(
  ctx: CanvasRenderingContext2D,
  data: LocationMapData,
  tileSize: number,
): void {
  // Buildings
  for (const building of data.buildings) {
    const colors = BUILDING_TYPE_COLORS[building.type];
    const x = building.tileX * tileSize;
    const y = building.tileY * tileSize;
    const w = building.width * tileSize;
    const h = building.height * tileSize;

    ctx.fillStyle = colors.fill + '80';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.max(8, Math.round(tileSize * 0.6))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`${colors.label} ${building.name}`, x + w / 2, y + h / 2 + 4);
    ctx.textAlign = 'start';
  }

  // NPCs
  for (const npc of data.npcs) {
    const x = npc.tileX * tileSize + tileSize / 2;
    const y = npc.tileY * tileSize + tileSize / 2;
    const radius = tileSize * 0.3;

    ctx.fillStyle = NPC_MARKER.fill;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = NPC_MARKER.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#c0ffc0';
    ctx.font = `${Math.max(7, Math.round(tileSize * 0.5))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(npc.name, x, y - radius - 2);
    ctx.textAlign = 'start';
  }

  // Landmarks
  for (const landmark of data.landmarks) {
    const x = landmark.tileX * tileSize + tileSize / 2;
    const y = landmark.tileY * tileSize + tileSize / 2;

    ctx.fillStyle = '#d4d040';
    ctx.font = `${Math.max(10, Math.round(tileSize * 0.8))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('★', x, y + 4);
    ctx.textAlign = 'start';
  }

  // Player
  if (data.playerPos) {
    const px = data.playerPos.x * tileSize + tileSize / 2;
    const py = data.playerPos.y * tileSize + tileSize / 2;

    const glow = ctx.createRadialGradient(px, py, 2, px, py, tileSize);
    glow.addColorStop(0, PLAYER_MARKER.glow);
    glow.addColorStop(1, 'rgba(96,96,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(px, py, tileSize, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = PLAYER_MARKER.fill;
    ctx.beginPath();
    ctx.arc(px, py, tileSize * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PLAYER_MARKER.border;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#a0a0ff';
    ctx.font = `bold ${Math.max(8, Math.round(tileSize * 0.5))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('你', px, py - tileSize * 0.4);
    ctx.textAlign = 'start';
  }
}

function getTerrainColorsForClimate(climate: string): { fill: string; border: string } {
  const c = climate.toLowerCase();
  if (c.includes('snow') || c.includes('ice')) return WORLD_TILE_COLORS.snow;
  if (c.includes('desert') || c.includes('sand')) return WORLD_TILE_COLORS.desert;
  if (c.includes('forest') || c.includes('jungle')) return WORLD_TILE_COLORS.forest;
  if (c.includes('swamp') || c.includes('marsh')) return WORLD_TILE_COLORS.swamp;
  if (c.includes('mountain')) return WORLD_TILE_COLORS.mountain;
  return WORLD_TILE_COLORS.plains;
}
