/** 钩子处理器签名：接收数据，返回（可能修改后的）数据 */
export type HookHandler<T = unknown> = (data: T, context: HookContext) => T;

export interface HookContext {
  namespace: string;
  source: 'gm' | 'derived';
  snapshot: GameSnapshot;
  abort: () => void;
}

export interface HookEntry<T = unknown> {
  id: string;
  handler: HookHandler<T>;
  priority: number;
  description: string;
  enabled: boolean;
}

/** 触发器提取后的标准事件格式 */
export interface TriggerPayload {
  namespace: string;
  data: Record<string, unknown>;
  source: 'gm' | 'derived';
}

import type { VitalStats, Attributes } from './character';

export interface GameSnapshot {
  currentDay: number;
  gameClock: number;
  timeOfDay: string;
  terrain: string;
  weather: string;
  currentRegion: string;
  character: {
    hp: number;
    maxHp: number;
    vital: VitalStats;
    conditions: string[];
    attributes: Attributes;
    equipped: { weapon: string; armor: string; accessory: string };
  };
  party: {
    members: Array<{ name: string; hp: number; maxHp: number; conditions: string[] }>;
    size: number;
  };
}
