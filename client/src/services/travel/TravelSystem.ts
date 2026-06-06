import { useCharacterStore } from '../../stores/characterStore';
import { useGameStore } from '../../stores/gameStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { systemHooks } from '../hooks/SystemHooks';
import { buildSnapshot } from '../hooks/GameSnapshot';

export const WALK_SPEED = 5000;  // meters per hour (5 km/h)
export const HORSE_SPEED = 15000;
export const TERRAIN_SPEED_MOD: Record<string, number> = {
  '平原': 1.0, '城市': 1.0, '村庄': 1.0, '城镇': 1.0, '道路': 1.2,
  '森林': 0.7, '山地': 0.4, '沼泽': 0.5, '沙漠': 0.6,
  '冰原': 0.5, '焦土': 0.6, '海洋': 0.0,
};

export interface TravelEstimate {
  distanceMeters: number;
  distanceKm: number;
  hours: number;
  displayTime: string;
  speedMs: number;
}

export function calcDistance(from: { x: number; z: number }, to: { x: number; z: number }): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function calcSpeed(): number {
  let speed = WALK_SPEED;

  // Encumbrance penalty
  const char = useCharacterStore.getState().character;
  if (char?.vital) {
    const enc = char.vital.encumbrance || 0;
    if (enc > 70) speed *= 0.5;
    else if (enc > 50) speed *= 0.7;
    else if (enc > 30) speed *= 0.85;

    // Fatigue penalty
    const fatigue = char.vital.fatigue || 0;
    if (fatigue > 80) speed *= 0.6;
    else if (fatigue > 60) speed *= 0.8;
  }

  // Hook system: allow external modules to modify speed (H2.3)
  const hookEnabled = useSettingsStore.getState().experimental.enableSystemHooks;
  if (hookEnabled) {
    const snap = buildSnapshot();
    const hookResult = systemHooks.apply('travel.beforeSpeedCalc', {
      speed,
      terrain: useGameStore.getState().terrain,
      weather: useGameStore.getState().weather,
    }, {
      namespace: 'travel.beforeSpeedCalc',
      source: 'gm',
      snapshot: snap,
      abort: () => {},
    });
    if (hookResult && typeof hookResult === 'object') {
      const nextSpeed = (hookResult as { speed?: number }).speed;
      if (typeof nextSpeed === 'number') speed = nextSpeed;
    }
  }

  return speed;
}

export function calcTerrainMod(terrain: string): number {
  for (const [key, mod] of Object.entries(TERRAIN_SPEED_MOD)) {
    if (terrain.includes(key)) return mod;
  }
  return 1.0;
}

export function estimateTravel(
  from: { x: number; z: number },
  to: { x: number; z: number },
  terrain: string,
  roadFactor: number = 1.0,
): TravelEstimate {
  const distanceMeters = calcDistance(from, to);
  const distanceKm = distanceMeters / 1000;
  const speedMs = calcSpeed() * calcTerrainMod(terrain) * roadFactor;
  const hours = distanceMeters / speedMs;

  let displayTime: string;
  if (hours < 0.1) displayTime = '不到10分钟';
  else if (hours < 1) displayTime = `约${Math.round(hours * 60)}分钟`;
  else if (hours < 24) displayTime = `约${hours.toFixed(1)}小时`;
  else displayTime = `约${(hours / 24).toFixed(1)}天`;

  return { distanceMeters, distanceKm, hours, displayTime, speedMs };
}

export function interpolatePosition(
  from: { x: number; z: number },
  to: { x: number; z: number },
  elapsedHours: number,
  totalHours: number,
): { x: number; z: number } {
  if (totalHours <= 0) return to;
  const t = Math.min(1, elapsedHours / totalHours);
  return {
    x: from.x + (to.x - from.x) * t,
    z: from.z + (to.z - from.z) * t,
  };
}

const WATER_BODIES: Array<{ name: string; path: Array<{ x: number; z: number }> }> = [
  { name: '无尽之海', path: [{ x: -800000, z: -600000 }, { x: -800000, z: 600000 }, { x: -500000, z: 600000 }, { x: -500000, z: -600000 }] },
  { name: '迷雾之洋', path: [{ x: 500000, z: -600000 }, { x: 500000, z: 600000 }, { x: 800000, z: 600000 }, { x: 800000, z: -600000 }] },
  { name: '南海', path: [{ x: -800000, z: 400000 }, { x: 800000, z: 400000 }, { x: 800000, z: 600000 }, { x: -800000, z: 600000 }] },
  { name: '苍海', path: [{ x: 100000, z: 200000 }, { x: 800000, z: 200000 }, { x: 800000, z: 800000 }, { x: 100000, z: 800000 }] },
];

function pointInPolygon(px: number, pz: number, polygon: Array<{ x: number; z: number }>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, zi = polygon[i].z;
    const xj = polygon[j].x, zj = polygon[j].z;
    if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export interface WaterWarning {
  blocked: boolean;
  waterName: string;
  suggestion: string;
}

export function detectWaterObstruction(
  from: { x: number; z: number },
  to: { x: number; z: number },
): WaterWarning | null {
  const midX = (from.x + to.x) / 2;
  const midZ = (from.z + to.z) / 2;

  for (const water of WATER_BODIES) {
    if (pointInPolygon(midX, midZ, water.path) || pointInPolygon(from.x, from.z, water.path) || pointInPolygon(to.x, to.z, water.path)) {
      return {
        blocked: true,
        waterName: water.name,
        suggestion: `路径穿越${water.name}水域，需要乘船或绕路`,
      };
    }
  }
  return null;
}

export interface TravelInterrupt {
  from: { x: number; z: number };
  to: { x: number; z: number };
  totalHours: number;
  elapsedHours: number;
  reason: string;
}

let _pendingInterrupt: TravelInterrupt | null = null;

export function setTravelInterrupt(interrupt: TravelInterrupt | null): void {
  _pendingInterrupt = interrupt;
}

export function getTravelInterrupt(): TravelInterrupt | null {
  return _pendingInterrupt;
}

export function getRemainingTravelTime(): number {
  if (!_pendingInterrupt) return 0;
  return Math.max(0, _pendingInterrupt.totalHours - _pendingInterrupt.elapsedHours);
}
