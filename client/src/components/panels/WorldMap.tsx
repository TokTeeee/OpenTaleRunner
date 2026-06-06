import { useState, useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useWorldStore } from '../../stores/worldStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAuthStore } from '../../stores/authStore';
import { usePMEngine } from '../../hooks/usePMEngine';
import { fetchNearbyPlayers } from '../../services/multiplayer/SyncServices';
import type { NearbyPlayer } from '../../types/multiplayer';
import { bg, accent, alpha } from '../../styles/tokens';

interface TerrainCell {
  x_min: number; x_max: number; z_min: number; z_max: number;
  terrain_type: string; region: string; description: string;
}

const TERRAIN_FILL: Record<string, string> = {
  '平原': '#d4c8a8', '都城': '#d4c090', '村庄': '#c8c0a0',
  '农田村': '#c0d0a0', '商镇': '#d0c898', '林边村': '#b0c898',
  '牧场村': '#c8c8a0', '采石村': '#c0b898',
  '原始森林': '#608858', '森林': '#709868', '树冠城市': '#80a070',
  '沙漠': '#d8c898', '山脉': '#b0a090', '火山都市': '#c09080',
  '冰原': '#c8d8e8', '要塞': '#b8c0d0', '焦土': '#b09098',
  '海洋群岛': '#98c0d0', '港口都市': '#a0c8d8',
  '地热温泉': '#d0b0a0', '矿道': '#b8a898',
};

const TERRAIN_BORDER: Record<string, string> = {
  '都城': '#8b6914', '村庄': '#9e8e6e', '原始森林': '#306030',
  '沙漠': '#b89868', '山脉': '#807060', '火山都市': '#a06040',
  '海洋群岛': '#6898b0', '冰原': '#88a8c0', '要塞': '#8090b0',
};

function getFillColor(t: TerrainCell): string {
  if (TERRAIN_FILL[t.terrain_type]) return TERRAIN_FILL[t.terrain_type];
  if (t.terrain_type.includes('森林')) return '#689870';
  if (t.terrain_type.includes('沼泽')) return '#587860';
  if (t.terrain_type.includes('山')) return '#a89888';
  if (t.terrain_type.includes('湖') || t.terrain_type.includes('河')) return '#88b8d0';
  return '#c8c0b0';
}

export function WorldMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const centerMapRef = useRef<(() => void) | null>(null);
  const { coordinates, currentRegion, knownLocations } = useGameStore();
  const worldDay = useWorldStore((s) => s.currentWorldDay);
  const regionOptions = useWorldStore((s) => s.storybook?.regions || []);
  const { submitCustom } = usePMEngine();
  const baseUrl = useSettingsStore((s) => s.server?.endpoint || 'http://localhost:8000');

  const [terrain, setTerrain] = useState<TerrainCell[]>([]);
  const [nearbyPlayers, setNearbyPlayers] = useState<NearbyPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // View state (refs to avoid re-render)
  const viewRef = useRef({ cx: 0, cz: 0, zoom: 1, dragX: 0, dragY: 0 });
  const dragRef = useRef(false);
  const playerPosRef = useRef({ x: 0, z: 0 });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = useAuthStore.getState().token || '';
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const [terrainRes, players] = await Promise.all([
        fetch(`${baseUrl}/api/v1/world/map?world_day=${worldDay}`, { headers }),
        fetchNearbyPlayers().catch(() => [] as NearbyPlayer[]),
      ]);

      if (terrainRes.ok) {
        const data = await terrainRes.json();
        setTerrain(data as TerrainCell[]);
      } else {
        setTerrain([]);
      }
      setNearbyPlayers(players);
    } catch {
      setError('地图数据加载失败');
    }
    setLoading(false);
  }, [baseUrl, worldDay]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial mount + interval-driven poll; refactor to subscription in v0.4
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Update player position ref
  useEffect(() => {
    playerPosRef.current = { x: coordinates.x, z: coordinates.z };
  }, [coordinates.x, coordinates.z]);

  // Draw
  useEffect(() => {
    if (loading || terrain.length === 0) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;

    const v = viewRef.current;
    const pp = playerPosRef.current;

    // Init view centered on player
    if (v.cx === 0 && v.cz === 0) {
      v.cx = pp.x;
      v.cz = pp.z;
      v.zoom = 1.5;
    }

    const toScreen = (x: number, z: number): [number, number] => [
      (x - v.cx) * v.zoom + W / 2 + v.dragX,
      (z - v.cz) * v.zoom + H / 2 + v.dragY,
    ];

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // Background
      ctx.fillStyle = bg.canvas;
      ctx.fillRect(0, 0, W, H);

      // Grid lines
      ctx.strokeStyle = alpha.whiteA03;
      ctx.lineWidth = 0.5;
      const gridStep = Math.max(50, 200 / v.zoom);
      const [sx0] = toScreen(0, 0);
      const startX = Math.floor(-sx0 / gridStep) * gridStep;
      for (let gx = startX; gx < W + gridStep; gx += gridStep) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
      }
      for (let gy = startX; gy < H + gridStep; gy += gridStep) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
      }

      // Terrain cells
      for (const t of terrain) {
        const [sx1, sz1] = toScreen(t.x_min, t.z_min);
        const [sx2, sz2] = toScreen(t.x_max, t.z_max);
        const sw = sx2 - sx1, sh = sz2 - sz1;
        if (sw < -W || sx1 > W * 2 || sh < -H || sz1 > H * 2) continue;

        // Fill
        ctx.fillStyle = getFillColor(t);
        if (sw < 3 && sh < 3) {
          ctx.fillRect(sx1, sz1, Math.max(2, sw), Math.max(2, sh));
        } else {
          ctx.fillRect(sx1, sz1, sw, sh);
        }

        // Border for important types
        const border = TERRAIN_BORDER[t.terrain_type];
        if (border && sw > 20 && sh > 20) {
          ctx.strokeStyle = border;
          ctx.lineWidth = 0.5;
          ctx.strokeRect(sx1, sz1, sw, sh);
        }

        // Label for settlements
        const label = t.description?.split('——')[0] || t.terrain_type;
        if (v.zoom > 1.0 && sw > 60 && sh > 20 && TERRAIN_BORDER[t.terrain_type]) {
          ctx.fillStyle = bg.canvasLabel;
          ctx.font = '9px system-ui, sans-serif';
          ctx.fillText(label, sx1 + 2, sz1 + 10);
        }
      }

      // Known locations
      for (const loc of knownLocations) {
        if (!loc.coordinates) continue;
        const [sx, sz] = toScreen(loc.coordinates.x, loc.coordinates.z);
        if (sx < -20 || sx > W + 20 || sz < -20 || sz > H + 20) continue;

        ctx.fillStyle = accent.amber[500];
        ctx.beginPath();
        ctx.arc(sx, sz, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = accent.amber[600];
        ctx.lineWidth = 1.5;
        ctx.stroke();

        if (v.zoom > 1.2) {
          ctx.fillStyle = accent.amber[600];
          ctx.font = '8px system-ui, sans-serif';
          ctx.fillText(loc.name.slice(0, 10), sx + 5, sz + 3);
        }
      }

      // Player position
      const [px, pz] = toScreen(pp.x, pp.z);
      // Outer glow
      const glow = ctx.createRadialGradient(px, pz, 3, px, pz, 15);
      glow.addColorStop(0, alpha.indigo500A60);
      glow.addColorStop(1, alpha.indigo500A00);
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(px, pz, 15, 0, Math.PI * 2); ctx.fill();

      // Player dot
      ctx.fillStyle = accent.indigo[500];
      ctx.beginPath(); ctx.arc(px, pz, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = bg.white;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Player label
      ctx.fillStyle = accent.indigo[200];
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.fillText('你', px + 8, pz + 3);

      // Nearby real-time players
      for (const np of nearbyPlayers) {
        const [nsx, nsz] = toScreen(np.coordinates.x, np.coordinates.z);
        if (nsx < -20 || nsx > W + 20 || nsz < -20 || nsz > H + 20) continue;

        // Pulse glow
        const pglow = ctx.createRadialGradient(nsx, nsz, 2, nsx, nsz, 10);
        pglow.addColorStop(0, alpha.emerald500A50);
        pglow.addColorStop(1, alpha.emerald500A00);
        ctx.fillStyle = pglow;
        ctx.beginPath(); ctx.arc(nsx, nsz, 10, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = accent.emerald[500];
        ctx.beginPath(); ctx.arc(nsx, nsz, 4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = accent.emerald[700];
        ctx.lineWidth = 1;
        ctx.stroke();

        if (v.zoom > 1.5) {
          ctx.fillStyle = accent.emerald[300];
          ctx.font = '8px system-ui, sans-serif';
          ctx.fillText(np.characterName.slice(0, 8), nsx + 6, nsz + 3);
        }
      }

      // Region labels
      if (v.zoom > 0.8) {
        const regions = new Map<string, { cx: number; cz: number; count: number }>();
        for (const t of terrain) {
          if (!t.description?.startsWith(t.region)) continue;
          const prev = regions.get(t.region) || { cx: 0, cz: 0, count: 0 };
          regions.set(t.region, {
            cx: prev.cx + (t.x_min + t.x_max) / 2,
            cz: prev.cz + (t.z_min + t.z_max) / 2,
            count: prev.count + 1,
          });
        }
        for (const [rname, info] of regions) {
          if (info.count < 2) continue;
          const cx = info.cx / info.count, cz = info.cz / info.count;
          const [rx, rz] = toScreen(cx, cz);
          if (rx < 0 || rx > W || rz < 0 || rz > H) continue;
          ctx.fillStyle = alpha.blackA30;
          ctx.font = 'bold 11px system-ui, sans-serif';
          const m = ctx.measureText(rname);
          ctx.fillRect(rx - m.width / 2 - 4, rz - 12, m.width + 8, 16);
          ctx.fillStyle = alpha.whiteA40;
          ctx.fillText(rname, rx - m.width / 2, rz + 1);
        }
      }
    };

    draw();

    // Mouse handlers
    const onMouseDown = (_e: MouseEvent) => { dragRef.current = true; };
    const onMouseUp = () => { dragRef.current = false; };
    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      v.dragX += e.movementX;
      v.dragY += e.movementY;
      draw();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 0.87;
      v.zoom = Math.max(0.3, Math.min(6, v.zoom * factor));
      draw();
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // Center on player button
    const centerOnPlayer = () => {
      v.cx = playerPosRef.current.x;
      v.cz = playerPosRef.current.z;
      v.dragX = 0;
      v.dragY = 0;
      draw();
    };
    centerMapRef.current = centerOnPlayer;

    return () => {
      centerMapRef.current = null;
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [terrain, nearbyPlayers, knownLocations, loading]);

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-600 text-xs">
        正在加载世界地图...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center space-y-2">
        <div className="text-xs text-rose-400">{error}</div>
        <button onClick={fetchData} className="text-[10px] px-3 py-1 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 transition-colors">
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Controls bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[.04]">
        <span className="text-[10px] text-gray-500">
          {terrain.length} 地块 · {nearbyPlayers.length} 玩家在线
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => { centerMapRef.current?.(); }}
            className="text-[9px] px-2 py-1 rounded bg-white/[.03] border border-white/[.06] text-gray-500 hover:text-indigo-400 transition-colors"
          >
            定位自己
          </button>
        </div>
      </div>
      {/* 坐标 (从环境栏搬过来) */}
      <div className="px-3 py-1.5 bg-indigo-500/[0.04] border-b border-white/[.04] flex items-center gap-3 text-[10px]">
        <span className="text-gray-500 uppercase tracking-wider">📍 坐标</span>
        <span className="text-indigo-300 font-mono">X:{coordinates.x} Y:{coordinates.y} Z:{coordinates.z}</span>
      </div>
      {/* Canvas */}
      <div ref={containerRef} className="w-full h-[55vh] cursor-grab active:cursor-grabbing">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>
      {/* 远行 (从环境栏搬过来) */}
      <div className="px-3 py-2 border-t border-white/[.04]">
        <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">🗺 远行</div>
        <div className="flex flex-wrap gap-1.5">
          {regionOptions.filter((r) => r.id !== currentRegion).length === 0 ? (
            <span className="text-[10px] text-gray-600">PM 将在探索中解锁新区域</span>
          ) : (
            regionOptions.filter((r) => r.id !== currentRegion).map((region) => (
              <button
                key={region.id}
                onClick={() => submitCustom(`[前往${region.name}]`)}
                className="text-[10px] px-2.5 py-1 rounded-lg bg-amber-500/[0.06] border border-amber-500/15 text-amber-300/80 hover:text-amber-200 hover:bg-amber-500/15 transition-colors"
                title={`远行至 ${region.name}`}
              >
                🚶 {region.name}
              </button>
            ))
          )}
        </div>
      </div>
      {/* Legend */}
      <div className="absolute bottom-3 right-3 bg-ink-950/90 border border-white/[.06] rounded-lg p-2 flex gap-3 text-[9px]">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500" /> 你</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> 在线玩家</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> 已探索</span>
      </div>
    </div>
  );
}
