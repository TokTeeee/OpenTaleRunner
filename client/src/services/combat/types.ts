/**
 * v0.4 战斗系统 — 核心类型定义
 *
 * 设计原则:
 * - 与 v0.3 character/Attributes/Inventory 类型复用, 不重复定义
 * - CombatState 是单一来源, 由 zustand combatStore 持有
 * - CombatAction 是判别联合 (discriminated union), FSM 守卫编译期可查
 * - BuffInstance.remainingTurns = -1 表示无限期 (向后兼容 v0.3 永久 condition)
 *
 * 详见 spec: docs/superpowers/specs/2026-06-04-v04-combat-system-design.md §5
 */

import type { Attributes, Inventory, AttributeName, ElementalResistances } from '../../types/character';
import type { ItemEffect } from '../../types/item';

// ============================================================
// §5.1 Combatant — 战斗实体
// ============================================================

export type CombatantSide = 'player' | 'ally' | 'enemy';

export type MobBehavior = 'aggressive' | 'defensive' | 'cunning' | 'random';

export interface MobData {
  /** LLM 自由创建时为 null, 模板怪物指向 ConditionsRegistry / mob_templates 表 */
  templateRef?: string;
  level: number;
  lootTableRef?: string;
  behavior: MobBehavior;
}

export interface Combatant {
  id: string;
  /** 玩家用 characterId, 怪物用 mob_<uuid> */
  side: CombatantSide;
  name: string;
  /** 立绘 URL; 缺失时 UI 用首字符占位 */
  portrait?: string;

  // 核心 6 维属性, 怪物按 v0.3 schema 自由建
  attributes: Attributes;

  // 战斗资源
  hp: number;
  maxHp: number;
  /** MP 可选, 法师/牧师才有 */
  mp?: number;
  maxMp?: number;
  /** AP 行动点; 战旗风格, 每回合开始重置为 maxAp */
  ap: number;
  maxAp: number;

  // 状态
  conditions: BuffInstance[];
  isDead: boolean;
  isFleeing: boolean;

  // 装备 — 复用 v0.3 Inventory 类型
  equipped: Inventory['equipped'];

  // v0.6.2: 8 元素抗性 (-100~100, 0=无抗, >0=抗, <0=弱)
  elementalResistances: ElementalResistances;

  // 怪物专属
  mobData?: MobData;
}

// ============================================================
// §5.2 BuffInstance — v0.3 condition 的回合制升级
// ============================================================

export type BuffStackRule = 'stack' | 'replace' | 'refresh' | 'ignore';

export interface BuffTickResult {
  hpDelta?: number;
  mpDelta?: number;
  log?: string;
}

export interface BuffInstance {
  /** 对应 ConditionsRegistry 的 key (e.g. "中毒", "流血", "wounded_1") */
  ref: string;
  /** 叠加层数, 默认 1 */
  stacks: number;
  /** 剩余回合数, -1 表示无限期 (向后兼容 v0.3 永久 condition) */
  remainingTurns: number;
  /** 施加者 (combatant.id | item.id | "system") */
  source: string;
  appliedAtTurn: number;
  /** 6 维属性加减 (被 effectiveDEX / 命中公式消费) */
  modifiers: Partial<Attributes>;
  /** 复杂效果 (DOT/HOT) 走 onTick 回调 */
  onTick?: (c: Combatant) => BuffTickResult;
  /** 叠加规则, 默认 'replace' (新 buff 覆盖旧的同 ref) */
  stackRule?: BuffStackRule;
}

// ============================================================
// §5.3 CombatAction — 6 种动作判别联合
// ============================================================
//
// 历史变更:
// - v0.5-dev: 移除 `skill` 动作 (SkillRegistry 尚未配套, 暂时隐藏).
//   5 种动作: attack / item / defend / wait / flee.
//   AP: 攻击 2 / 防御 1 / 物品 0 / 逃跑 0 / 休息 0.
// - v0.6.2: 新增 `ability` 动作 (魔法/祷告/战技, 3 学派 16 能力);
//   6 种动作: attack / item / defend / wait / flee / ability.
//   ability 同时消耗 AP (2) 和 MP (ability.mpCost), MP 不足抛 InsufficientMPError.
//   targetId 必填 (self/ally 仍要传), target 类型路由在 CombatView.onAbilitySelect 处理.

export type CombatActionKind = 'attack' | 'item' | 'flee' | 'defend' | 'wait' | 'ability';

export interface ActionCost {
  ap: number;
  mp?: number;
}

export type CombatAction =
  | { kind: 'attack'; attackerId: string; targetId: string }
  | { kind: 'item'; userId: string; itemId: string; targetId?: string }
  | { kind: 'flee'; userId: string }
  /** 防御: 提升目标闪避门槛 (累计闪避惩罚), 消耗 1 AP */
  | { kind: 'defend'; userId: string; cost: ActionCost }
  /** 跳过本回合, 恢复 1 AP (受 maxAp clamp) */
  | { kind: 'wait'; userId: string }
  // v0.6.2: 释放 ability (魔法/祷告/战技). userId=施法者, abilityId, targetId 可选 (self/ally 仍要传)
  | { kind: 'ability'; userId: string; abilityId: string; targetId?: string };

// ============================================================
// §5.4 InitiativeEntry & CombatState
// ============================================================

export type InitiativeRollAt = 'start' | 'turn';

export interface InitiativeEntry {
  combatantId: string;
  /** d20 + effectiveDEX 修正, 排序时降序 */
  initiative: number;
  /** 'start' = 战斗开始时投; 'turn' = buff 影响后重投 */
  rolledAt: InitiativeRollAt;
}

export type CombatPhase = 'idle' | 'initializing' | 'active' | 'resolving' | 'settled';

export type CombatOutcome = 'victory' | 'defeat' | 'fled' | 'disrupted' | 'interrupted';

export type BalanceRating = 'trivial' | 'normal' | 'hard' | 'deadly';

export interface CombatLogEntry {
  /** 'start' | 'turnStart' | 'action' | 'turnEnd' | 'end' | 'system' */
  kind: 'start' | 'turnStart' | 'action' | 'turnEnd' | 'end' | 'system';
  round: number;
  turn: number;
  /** 人类可读事件描述, 写 CombatLog UI */
  message: string;
  /** 可选结构化数据 (e.g. { from, to, amount } 给伤害事件) */
  data?: Record<string, unknown>;
  timestamp: number;
}

export interface CombatState {
  /** 战斗唯一 id (与 toolcall 对应) */
  id: string;
  phase: CombatPhase;
  round: number;
  /** 本回合内的 1-indexed 顺序, 配合 queue 推进 */
  turn: number;
  /** ACT 队列, 按 initiative 降序 */
  queue: InitiativeEntry[];
  combatants: Record<string, Combatant>;
  log: CombatLogEntry[];
  startedAt: number;
  resolvedAt?: number;
  outcome?: CombatOutcome;
  balanceRating?: BalanceRating;
  /** 完整 BalanceReport (rating + powerRatio + failurePenalty + suggestedNerfs) */
  balanceReport?: BalanceReport;
  /** LLM 在 startCombat 给的开场叙事 (写 CombatJournal) */
  narrativeOpening?: string;
  /** LLM 在 endCombat 给的收尾叙事 */
  narrativeClosing?: string;
}

// ============================================================
// §5.5 BalanceReport + FailurePenalty — 难度评估
// ============================================================

export type FailureSeverity = 'none' | 'minor' | 'major' | 'death-narrative';

export interface FailurePenalty {
  damageTaken: FailureSeverity;
  /** 0 / 0.1 / 0.3 / 0.5 (扣金百分比) */
  goldLostPercent: number;
  /** 战斗失败时附加的 condition refs (ConditionsRegistry keys) */
  conditions: string[];
  /** deadly 档必活: HP=0 不真死, 进入濒死剧情 */
  survives: boolean;
}

export interface BalanceReport {
  rating: BalanceRating;
  /** 敌队战力 / (玩家+队伍) 战力; > 2 视为 deadly */
  powerRatio: number;
  /** 玩家+队伍 power 估算 */
  playerPower: number;
  /** 敌队 power 估算 */
  enemyPower: number;
  /** 难度与 LLM hint 不一致时的建议调整 (e.g. ['-20% HP']) */
  suggestedNerfs?: string[];
  failurePenalty: FailurePenalty;
}

// ============================================================
// §5.6 战斗结果 / 事件载荷
// ============================================================

export interface TurnResult {
  /** 本回合触发的 CombatLogEntry */
  log: CombatLogEntry[];
  /** 本回合命中的 buff onTick 结果 */
  buffTicks: Array<{ combatantId: string; ref: string; tick: BuffTickResult }>;
  /** 战斗是否结束; 若结束, 给出 outcome 供 CombatEngine 决定下一步 */
  ended: boolean;
  outcome?: CombatOutcome;
}

export interface CombatActionResult {
  /** 是否成功执行 (e.g. 攻击命中且造成伤害) */
  success: boolean;
  /** 造成伤害 (负数=治疗) */
  damage?: number;
  /** 触发的事件消息 */
  messages: string[];
  /** 新增的 buff (e.g. 击退造成的 'wounded_1') */
  appliedBuffs?: BuffInstance[];
  /** 移除的 buff (e.g. 净化) */
  removedBuffs?: string[];
}

// ============================================================
// §5.7 物品 combatUse 上下文 (spec §8.1, v0.5 落地)
// ============================================================

export interface ItemCombatUseContext {
  user: Combatant;
  target: Combatant | null;
  action: CombatAction;
  state: CombatState;
  /** v0.4 暂未启用, 留作 v0.5 物品 hook 升级的接口位 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extra?: Record<string, any>;
}

export type ItemCombatUseFn = (ctx: ItemCombatUseContext) => CombatActionResult;

// ============================================================
// §5.8 工具: 常用类型守卫
// ============================================================

export function isPlayer(c: Combatant): boolean {
  return c.side === 'player';
}

export function isEnemy(c: Combatant): boolean {
  return c.side === 'enemy';
}

export function isAlive(c: Combatant): boolean {
  return !c.isDead && c.hp > 0;
}

/** 防御动作: 本回合内 defender 的命中门槛 +DEFEND_THRESHOLD_BONUS. */
export const DEFEND_THRESHOLD_BONUS = 2;

/** 防御动作消耗: 1 AP. */
export const DEFEND_AP_COST = 1;
/** 默认最大 AP (战旗风格) */
export const DEFAULT_MAX_AP = 6;
/** 怪物行为 default AP */
export const DEFAULT_MOB_MAX_AP = 4;

// 抑制 unused 警告 (AttributeName / ItemEffect 在 buff/item 路由时会被消费)
export type _Reserved = AttributeName | ItemEffect;

// Re-export Attributes for convenience (Phase 2 ActionResolver 6 维公式用)
export type { Attributes } from '../../types/character';
