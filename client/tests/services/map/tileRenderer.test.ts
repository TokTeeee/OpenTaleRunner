import { describe, it, expect, vi } from 'vitest';
import { renderWorldMap, renderRegionMap, renderLocationOverlay } from '../../../src/services/map/tileRenderer';
import { WORLD_TILE_COLORS, REGION_TYPE_COLORS, LOCATION_TYPE_COLORS, BUILDING_TYPE_COLORS, TILE_SIZE } from '../../../src/services/map/tilesets';

function createMockCtx(): CanvasRenderingContext2D {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: '' as CanvasTextAlign,
    textBaseline: '' as CanvasTextBaseline,
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: '',
    createRadialGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    measureText: vi.fn(() => ({ width: 50 })),
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

const defaultViewport = {
  offsetX: 0,
  offsetY: 0,
  zoom: 1,
  canvasWidth: 800,
  canvasHeight: 600,
};

describe('tileRenderer', () => {
  describe('renderWorldMap', () => {
    it('should render without errors for basic world map data', () => {
      const ctx = createMockCtx();
      const data = {
        width: 3,
        height: 3,
        tiles: [
          [{ type: 'plains' }, { type: 'ocean' }, { type: 'forest' }],
          [{ type: 'mountain' }, { type: 'desert' }, { type: 'snow' }],
          [{ type: 'swamp' }, { type: 'plains' }, { type: 'ocean' }],
        ],
        regions: [],
        playerPos: null,
      } as any;

      expect(() => renderWorldMap(ctx, data, defaultViewport)).not.toThrow();
      expect(ctx.fillRect).toHaveBeenCalled();
    });

    it('should draw region markers', () => {
      const ctx = createMockCtx();
      const data = {
        width: 5,
        height: 5,
        tiles: Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => ({ type: 'plains' }))),
        regions: [
          { id: 'r1', name: 'Test Kingdom', type: 'kingdom', worldX: 2, worldY: 2, discovered: true },
        ],
        playerPos: null,
      } as any;

      renderWorldMap(ctx, data, defaultViewport);
      expect(ctx.arc).toHaveBeenCalled();
    });

    it('should draw fog over undiscovered regions', () => {
      const ctx = createMockCtx();
      const data = {
        width: 5,
        height: 5,
        tiles: Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => ({ type: 'plains' }))),
        regions: [
          { id: 'r1', name: 'Hidden', type: 'kingdom', worldX: 2, worldY: 2, discovered: false },
        ],
        playerPos: null,
      } as any;

      renderWorldMap(ctx, data, defaultViewport);
      // Fog fill and '?' text should be drawn
      expect(ctx.fillText).toHaveBeenCalledWith('?', expect.any(Number), expect.any(Number));
    });

    it('should draw player marker when playerPos is set', () => {
      const ctx = createMockCtx();
      const data = {
        width: 5,
        height: 5,
        tiles: Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => ({ type: 'plains' }))),
        regions: [
          { id: 'r1', name: 'Start', type: 'kingdom', worldX: 2, worldY: 2, discovered: true },
        ],
        playerPos: { regionId: 'r1' },
      } as any;

      renderWorldMap(ctx, data, defaultViewport);
      // Player label '你' should be drawn
      expect(ctx.fillText).toHaveBeenCalledWith('你', expect.any(Number), expect.any(Number));
    });

    it('should handle empty tiles gracefully', () => {
      const ctx = createMockCtx();
      const data = {
        width: 2,
        height: 2,
        tiles: [[null, null], [null, null]],
        regions: [],
        playerPos: null,
      } as any;

      expect(() => renderWorldMap(ctx, data, defaultViewport)).not.toThrow();
    });
  });

  describe('renderRegionMap', () => {
    it('should render without errors for basic region data', () => {
      const ctx = createMockCtx();
      const region = {
        climate: 'temperate',
        locations: [],
      } as any;

      expect(() => renderRegionMap(ctx, region, defaultViewport)).not.toThrow();
      expect(ctx.fillRect).toHaveBeenCalled();
    });

    it('should draw location markers', () => {
      const ctx = createMockCtx();
      const region = {
        climate: 'temperate',
        locations: [
          { name: 'Town', type: 'town', regionX: 5, regionY: 5, discovered: true },
        ],
      } as any;

      renderRegionMap(ctx, region, defaultViewport);
      expect(ctx.arc).toHaveBeenCalled();
    });

    it('should apply climate-based terrain colors', () => {
      const ctx = createMockCtx();
      const snowRegion = { climate: 'snow tundra', locations: [] } as any;

      renderRegionMap(ctx, snowRegion, defaultViewport);
      expect(ctx.fillStyle).toBe(WORLD_TILE_COLORS.snow.fill);
    });
  });

  describe('renderLocationOverlay', () => {
    it('should render without errors for basic location data', () => {
      const ctx = createMockCtx();
      const data = {
        buildings: [],
        npcs: [],
        landmarks: [],
        playerPos: null,
      } as any;

      expect(() => renderLocationOverlay(ctx, data, TILE_SIZE)).not.toThrow();
    });

    it('should draw buildings', () => {
      const ctx = createMockCtx();
      const data = {
        buildings: [
          { name: 'Guild Hall', type: 'guild', tileX: 2, tileY: 3, width: 2, height: 2 },
        ],
        npcs: [],
        landmarks: [],
        playerPos: null,
      } as any;

      renderLocationOverlay(ctx, data, TILE_SIZE);
      expect(ctx.fillRect).toHaveBeenCalled();
      expect(ctx.strokeRect).toHaveBeenCalled();
    });

    it('should draw NPCs', () => {
      const ctx = createMockCtx();
      const data = {
        buildings: [],
        npcs: [
          { name: 'Merchant', tileX: 4, tileY: 4 },
        ],
        landmarks: [],
        playerPos: null,
      } as any;

      renderLocationOverlay(ctx, data, TILE_SIZE);
      expect(ctx.arc).toHaveBeenCalled();
      expect(ctx.fillText).toHaveBeenCalledWith('Merchant', expect.any(Number), expect.any(Number));
    });

    it('should draw landmarks', () => {
      const ctx = createMockCtx();
      const data = {
        buildings: [],
        npcs: [],
        landmarks: [
          { name: 'Old Ruins', tileX: 1, tileY: 1 },
        ],
        playerPos: null,
      } as any;

      renderLocationOverlay(ctx, data, TILE_SIZE);
      expect(ctx.fillText).toHaveBeenCalledWith('★', expect.any(Number), expect.any(Number));
    });

    it('should draw player marker when playerPos is set', () => {
      const ctx = createMockCtx();
      const data = {
        buildings: [],
        npcs: [],
        landmarks: [],
        playerPos: { x: 3, y: 3 },
      } as any;

      renderLocationOverlay(ctx, data, TILE_SIZE);
      expect(ctx.fillText).toHaveBeenCalledWith('你', expect.any(Number), expect.any(Number));
    });
  });
});
