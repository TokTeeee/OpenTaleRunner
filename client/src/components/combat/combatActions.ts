/**
 * v0.5-dev 战斗系统 — 战斗动作常量 + 类型
 *
 * 与 ActionMenu 解耦, 满足 react-refresh/only-export-components 规则.
 *
 * v0.5-dev 变更:
 * - 移除 `skill` 动作 (SkillRegistry 尚未配套, 暂时隐藏).
 * - 5 种动作: attack / item / defend / wait / flee.
 * - AP 消耗以 ActionResolver.ACTION_COSTS 为基准, 此处仅作 UI 显示.
 */

export type ActionKind = 'attack' | 'item' | 'defend' | 'wait' | 'flee' | 'ability';

/** 6 类动作 AP 成本 (与 ActionResolver.ACTION_COSTS 同步). */
export const ACTION_COSTS: Record<ActionKind, number> = {
  attack: 2,
  item: 0,
  defend: 1, // 与 DEFEND_AP_COST 同步
  flee: 0,
  wait: 0,
  ability: 2,
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
  { kind: 'item', label: '物品', glyph: '⚱', cost: 0, description: '从背包中使用', opensModal: 'backpack' },
  { kind: 'defend', label: '防御', glyph: '⛨', cost: 1, description: '+命中门槛, 连续闪避的惩罚随防御重置' },
  { kind: 'wait', label: '休息', glyph: '⏸', cost: 0, description: '跳过本回合, 恢复1点AP (受 maxAp 限制)' },
  { kind: 'flee', label: '逃跑', glyph: '⤳', cost: 0, description: '尝试脱离战斗' },
  { kind: 'ability', label: '技能', glyph: '✨', cost: 2, description: '释放已学习的魔法/祷告/战技' },
];
