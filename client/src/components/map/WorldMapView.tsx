import { useEffect, useRef, useCallback } from 'react';
import { useMapStore } from '../../stores/mapStore';
import { generateWorldMap } from '../../services/map/worldMapGenerator';
import { renderWorldMap } from '../../services/map/tileRenderer';
import type { Viewport } from '../../services/map/tileRenderer';

export function WorldMapView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef({ offsetX: 0, offsetY: 0, zoom: 1.5 });
  const dragRef = useRef(false);
  const hasDraggedRef = useRef(false);
  const drawRef = useRef<(() => void) | null>(null);

  const { worldMap, generateAndSaveWorldMap, navigateToRegion, isLoadingWorldMap } = useMapStore();

  const handleGenerate = useCallback(async () => {
    const seed = `world_${Date.now()}`;
    const data = generateWorldMap({ seed });
    await generateAndSaveWorldMap(data);
  }, [generateAndSaveWorldMap]);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !worldMap) return;

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
      renderWorldMap(ctx, worldMap, viewport);
    };

    drawRef.current = draw;
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

      for (const region of worldMap.regions) {
        const rx = region.worldPos.x * tileSize + v.offsetX;
        const ry = region.worldPos.y * tileSize + v.offsetY;
        const dist = Math.sqrt((mx - rx - tileSize / 2) ** 2 + (my - ry - tileSize / 2) ** 2);
        if (dist < tileSize * 1.5) {
          navigateToRegion(region.id);
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
      drawRef.current = null;
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('click', onClick);
    };
  }, [worldMap, navigateToRegion]);

  const handleCenterOnPlayer = useCallback(() => {
    if (!worldMap) return;
    const playerRegion = worldMap.regions.find(r => r.id === worldMap.playerPos?.regionId);
    if (playerRegion) {
      const container = containerRef.current;
      const cw = container?.getBoundingClientRect().width ?? 400;
      const ch = container?.getBoundingClientRect().height ?? 300;
      viewRef.current.offsetX = -playerRegion.worldPos.x * 16 * viewRef.current.zoom + cw / 2;
      viewRef.current.offsetY = -playerRegion.worldPos.y * 16 * viewRef.current.zoom + ch / 2;
      drawRef.current?.();
    }
  }, [worldMap]);

  if (!worldMap && !isLoadingWorldMap) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="text-gray-500 text-xs">尚未生成世界地图</div>
        <button
          onClick={handleGenerate}
          className="text-[10px] px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
        >
          🌍 生成世界地图
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-full">
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
    </div>
  );
}
