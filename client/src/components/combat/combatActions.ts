/**
 * v0.4 战斗系统 — 战斗动作常量 + 类型
 *
 * 与 ActionMenu 解耦, 满足 react-refresh/only-export-components 规则
 */

export type ActionKind = 'attack' | 'skill' | 'item' | 'defend' | 'flee' | 'wait';

/** 6 类动作 AP 成本 (与 ActionMenu 同步; 防御/逃跑在 types.ts) */
export const ACTION_COSTS: Record<ActionKind, number> = {
  attack: 2,
  skill: 4,
  item: 0,
  defend: 1, // 与 DEFEND_AP_COST 同步
  flee: 0,
  wait: 0,
};

/** 5 类动作显示规范 (label + glyph) */
export interface ActionSpec {
  kind: ActionKind;
  label: string;
  glyph: string;
  cost: number;
  description: string;
  /** 打开独立 modal (物品 -> 'backpack') 而非进入 target 选模式 */
  opensModal?: 'backpack';
}

export const ACTION_SPECS: ActionSpec[] = [
  { kind: 'attack', label: '攻击', glyph: '⚔', cost: 2, description: '近战/远程攻击' },
  { kind: 'skill', label: '技能', glyph: '✦', cost: 4, description: '消耗 MP 施放技能' },
  { kind: 'item', label: '物品', glyph: '⚱', cost: 0, description: '从背包中使用', opensModal: 'backpack' },
  { kind: 'defend', label: '防御', glyph: '⛨', cost: 1, description: '+AC, 本回合伤害 -50%' },
  { kind: 'wait', label: '休息', glyph: '⏸', cost: 0, description: '跳过本回合，下回合恢复1点AP' },
  { kind: 'flee', label: '逃跑', glyph: '⤳', cost: 0, description: '尝试脱离战斗' },
];
