import { useEffect, useRef, useState, useCallback } from 'react';
import { useMapStore } from '../../stores/mapStore';
import { generateLocationMap } from '../../services/map/locationMapGenerator';
import { renderLocationOverlay } from '../../services/map/tileRenderer';
import * as mapStorage from '../../services/map/mapStorage';
import type { MapBuilding, MapNPC, MapLandmark } from '../../types/map';
import { LOCATION_TYPE_COLORS, TILE_SIZE } from '../../services/map/tilesets';

interface TooltipInfo {
  x: number;
  y: number;
  content: string;
  sub?: string;
}

export function LocationMapView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef({ offsetX: 0, offsetY: 0, zoom: 2 });
  const dragRef = useRef(false);
  const hasDraggedRef = useRef(false);
  const drawRef = useRef<(() => void) | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);

  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);

  const {
    locationMap,
    currentLocationId,
    currentRegion,
    isLoadingLocation,
    navigateBack,
  } = useMapStore();

  const locationRef = currentRegion?.locations.find(l => l.id === currentLocationId) ?? null;

  // Auto-generate location map if no data
  useEffect(() => {
    if (!currentLocationId || !locationRef || !currentRegion || locationMap) return;
    let cancelled = false;
    generateLocationMap(locationRef, currentRegion.climate).then(data => {
      if (cancelled || !data) return;
      useMapStore.setState({ locationMap: data });
    });
    return () => { cancelled = true; };
  }, [currentLocationId]); // only trigger on location id change

  // Load background image from IndexedDB
  useEffect(() => {
    if (!locationMap?.backgroundImageKey) {
      bgImageRef.current = null;
      return;
    }

    let cancelled = false;
    let objectUrl = '';
    mapStorage.getLocationImage(locationMap.backgroundImageKey).then(blob => {
      if (cancelled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        if (!cancelled) bgImageRef.current = img;
      };
      img.src = objectUrl;
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [locationMap?.backgroundImageKey]);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !locationMap) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    const v = viewRef.current;

    const draw = () => {
      ctx.clearRect(0, 0, rect.width, rect.height);

      const bgImg = bgImageRef.current;
      if (bgImg) {
        ctx.drawImage(bgImg, 0, 0, rect.width, rect.height);
      } else {
        const colors = LOCATION_TYPE_COLORS[locationMap.type] || LOCATION_TYPE_COLORS.town;
        ctx.fillStyle = colors.fill + '40';
        ctx.fillRect(0, 0, rect.width, rect.height);
      }

      ctx.save();
      ctx.translate(v.offsetX, v.offsetY);
      const currentTileSize = TILE_SIZE * v.zoom;
      renderLocationOverlay(ctx, locationMap, currentTileSize);
      ctx.restore();
    };

    drawRef.current = draw;
    draw();

    const onMouseDown = () => { dragRef.current = true; hasDraggedRef.current = false; };
    const onMouseUp = () => { dragRef.current = false; };
    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      hasDraggedRef.current = true;
      v.offsetX += e.movementX;
      v.offsetY += e.movementY;
      setTooltip(null);
      draw();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 0.87;
      v.zoom = Math.max(0.5, Math.min(8, v.zoom * factor));
      draw();
    };

    const hitTestBuilding = (mx: number, my: number): MapBuilding | null => {
      const ts = TILE_SIZE * v.zoom;
      for (const b of locationMap.buildings) {
        const bx = b.tileX * ts + v.offsetX;
        const by = b.tileY * ts + v.offsetY;
        const bw = b.width * ts;
        const bh = b.height * ts;
        if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) return b;
      }
      return null;
    };

    const hitTestNPC = (mx: number, my: number): MapNPC | null => {
      const ts = TILE_SIZE * v.zoom;
      for (const npc of locationMap.npcs) {
        const nx = npc.tileX * ts + ts / 2 + v.offsetX;
        const ny = npc.tileY * ts + ts / 2 + v.offsetY;
        const radius = ts * 0.4;
        const dist = Math.sqrt((mx - nx) ** 2 + (my - ny) ** 2);
        if (dist < radius) return npc;
      }
      return null;
    };

    const hitTestLandmark = (mx: number, my: number): MapLandmark | null => {
      const ts = TILE_SIZE * v.zoom;
      for (const lm of locationMap.landmarks) {
        const lx = lm.tileX * ts + ts / 2 + v.offsetX;
        const ly = lm.tileY * ts + ts / 2 + v.offsetY;
        const radius = ts * 0.5;
        const dist = Math.sqrt((mx - lx) ** 2 + (my - ly) ** 2);
        if (dist < radius) return lm;
      }
      return null;
    };

    const onClick = (e: MouseEvent) => {
      if (hasDraggedRef.current) return;
      const canvasRect = canvas.getBoundingClientRect();
      const mx = e.clientX - canvasRect.left;
      const my = e.clientY - canvasRect.top;

      const npc = hitTestNPC(mx, my);
      if (npc) {
        const loc = npc.buildingId
          ? locationMap.buildings.find(b => b.id === npc.buildingId)?.name ?? ''
          : '户外';
        setTooltip({ x: mx, y: my, content: npc.name, sub: loc });
        return;
      }

      const lm = hitTestLandmark(mx, my);
      if (lm) {
        setTooltip({ x: mx, y: my, content: lm.name, sub: lm.description });
        return;
      }

      const bld = hitTestBuilding(mx, my);
      if (bld) {
        const npcNames = bld.npcIds
          .map(id => locationMap.npcs.find(n => n.id === id)?.name)
          .filter(Boolean)
          .join(', ');
        setTooltip({ x: mx, y: my, content: bld.name, sub: npcNames || undefined });
        return;
      }

      setTooltip(null);
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('click', onClick);

    return () => {
      drawRef.current = null;
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('click', onClick);
    };
  }, [locationMap]);

  const handleCenterOnPlayer = useCallback(() => {
    if (!locationMap) return;
    const container = containerRef.current;
    const cw = container?.getBoundingClientRect().width ?? 400;
    const ch = container?.getBoundingClientRect().height ?? 300;
    const px = locationMap.playerPos.x * TILE_SIZE * viewRef.current.zoom;
    const py = locationMap.playerPos.y * TILE_SIZE * viewRef.current.zoom;
    viewRef.current.offsetX = cw / 2 - px;
    viewRef.current.offsetY = ch / 2 - py;
    drawRef.current?.();
  }, [locationMap]);

  // No location selected
  if (!currentLocationId || !currentRegion) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-xs">
        未选择地点
      </div>
    );
  }

  // Loading state (auto-generating or loading)
  if (!locationMap || isLoadingLocation) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="text-gray-500 text-xs animate-pulse">正在生成地点地图…</div>
        <button
          onClick={navigateBack}
          className="text-[9px] px-3 py-1 rounded bg-white/[.03] border border-white/[.06] text-gray-500 hover:text-indigo-400 transition-colors"
        >
          ← 返回区域地图
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
        <button
          onClick={navigateBack}
          className="text-[9px] px-2 py-1 rounded bg-white/[.03] border border-white/[.06] text-gray-500 hover:text-indigo-400 transition-colors"
        >
          ← 区域地图
        </button>
        <span className="text-[9px] text-gray-600">
          {currentRegion.name} / {locationMap.name}
        </span>
      </div>
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <button
          onClick={handleCenterOnPlayer}
          className="text-[9px] px-2 py-1 rounded bg-white/[.03] border border-white/[.06] text-gray-500 hover:text-indigo-400 transition-colors"
        >
          定位自己
        </button>
      </div>

      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      {tooltip && (
        <div
          className="absolute z-20 pointer-events-none bg-black/80 border border-white/10 rounded px-2 py-1 max-w-[200px]"
          style={{ left: tooltip.x + 10, top: tooltip.y - 10 }}
        >
          <div className="text-[10px] text-white font-medium">{tooltip.content}</div>
          {tooltip.sub && (
            <div className="text-[9px] text-gray-400 mt-0.5">{tooltip.sub}</div>
          )}
        </div>
      )}
    </div>
  );
}
