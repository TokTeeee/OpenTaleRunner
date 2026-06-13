import { useEffect, useRef, useCallback } from 'react';
import { useMapStore } from '../../stores/mapStore';
import { generateRegionMap } from '../../services/map/regionMapGenerator';
import { renderRegionMap } from '../../services/map/tileRenderer';
import type { Viewport } from '../../services/map/tileRenderer';


export function RegionMapView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef({ offsetX: 0, offsetY: 0, zoom: 1.5 });
  const dragRef = useRef(false);
  const hasDraggedRef = useRef(false);

  const { currentRegion, updateCurrentRegion, navigateToLocation, navigateBack } = useMapStore();

  const handleGenerate = useCallback(() => {
    if (!currentRegion) return;
    const updated = generateRegionMap({ region: currentRegion });
    updateCurrentRegion(updated);
  }, [currentRegion, updateCurrentRegion]);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !currentRegion) return;

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
    const viewport: Viewport = {
      offsetX: v.offsetX,
      offsetY: v.offsetY,
      zoom: v.zoom,
      canvasWidth: rect.width,
      canvasHeight: rect.height,
    };

    const draw = () => {
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(0, 0, rect.width, rect.height);
      viewport.offsetX = v.offsetX;
      viewport.offsetY = v.offsetY;
      viewport.zoom = v.zoom;
      renderRegionMap(ctx, currentRegion, viewport);
    };

    draw();

    // Mouse handlers
    const onMouseDown = () => { dragRef.current = true; hasDraggedRef.current = false; };
    const onMouseUp = () => { dragRef.current = false; };
    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      hasDraggedRef.current = true;
      v.offsetX += e.movementX;
      v.offsetY += e.movementY;
      draw();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 0.87;
      v.zoom = Math.max(0.3, Math.min(6, v.zoom * factor));
      draw();
    };
    const onClick = (e: MouseEvent) => {
      if (hasDraggedRef.current) return;
      const canvasRect = canvas.getBoundingClientRect();
      const mx = e.clientX - canvasRect.left;
      const my = e.clientY - canvasRect.top;
      const tileSize = 16 * v.zoom;

      // Check if clicked on a location
      for (const loc of currentRegion.locations) {
        const lx = loc.regionX * tileSize + v.offsetX + tileSize / 2;
        const ly = loc.regionY * tileSize + v.offsetY + tileSize / 2;
        const radius = tileSize * 1.2;
        const dist = Math.sqrt((mx - lx) ** 2 + (my - ly) ** 2);
        if (dist < radius) {
          navigateToLocation(loc.id);
          return;
        }
      }
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('click', onClick);

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('click', onClick);
    };
  }, [currentRegion, navigateToLocation]);

  if (!currentRegion) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-xs">
        未选择区域
      </div>
    );
  }

  const hasLocations = currentRegion.locations.length > 0;

  if (!hasLocations) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="text-gray-500 text-xs">{currentRegion.name} — 尚未生成区域地图</div>
        <button
          onClick={handleGenerate}
          className="text-[10px] px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
        >
          🗺 生成区域
        </button>
        <button
          onClick={navigateBack}
          className="text-[9px] px-3 py-1 rounded bg-white/[.03] border border-white/[.06] text-gray-500 hover:text-indigo-400 transition-colors"
        >
          ← 返回世界地图
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <button
          onClick={() => {
            // Center on first discovered location
            const discovered = currentRegion.locations.find(l => l.discovered);
            if (discovered) {
              viewRef.current.offsetX = -discovered.regionX * 16 * viewRef.current.zoom + 200;
              viewRef.current.offsetY = -discovered.regionY * 16 * viewRef.current.zoom + 150;
            }
          }}
          className="text-[9px] px-2 py-1 rounded bg-white/[.03] border border-white/[.06] text-gray-500 hover:text-indigo-400 transition-colors"
        >
          定位自己
        </button>
        <button
          onClick={navigateBack}
          className="text-[9px] px-2 py-1 rounded bg-white/[.03] border border-white/[.06] text-gray-500 hover:text-indigo-400 transition-colors"
        >
          ← 世界地图
        </button>
      </div>
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>
    </div>
  );
}
