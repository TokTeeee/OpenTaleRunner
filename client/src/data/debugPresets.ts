/**
 * 调试模式预设战斗数据 (4 档难度 + 1 能力测试, 各 1 个)
 *
 * 开发测试用. 不动 characterStore, 全部走 toolcall dispatch.
 * 详细见 spec: docs/superpowers/specs/2026-06-04-combat-debug-design.md
 *
 * v0.6.2: 新增 debug_ability 战斗 — mage + fireBolt 预学, MP 足够 (20/20)
 */
import type { Combatant } from '../services/combat/types';
import type { Item } from '../types/item';
import { ZERO_RESISTANCES } from '../types/character';
import type { LearnedAbility } from '../types/character';

// ============================================================
// 类型
// ============================================================

export type DebugDifficulty = 'trivial' | 'normal' | 'hard' | 'deadly' | 'ability';

export interface DebugPlayerOptions {
  /** v0.6.2 — 预学习的 ability 列表 (空 = 默认战士, 有 = 法师/祭司变体) */
  learnedAbilities?: LearnedAbility[];
  /** v0.6.2 — MP 最大值 (默认 0 = 战士) */
  maxMp?: number;
}

export interface DebugBattle {
  readonly id: 'debug_trivial' | 'debug_normal' | 'debug_hard' | 'debug_deadly' | 'debug_ability';
  readonly difficulty: DebugDifficulty;
  readonly title: string;
  readonly description: string;
  readonly enemies: readonly Combatant[];
  readonly expectedOutcome: string;
  /** v0.6.2 — 战斗玩家配置 (默认 = 测试勇者) */
  readonly playerOptions?: DebugPlayerOptions;
}

// ============================================================
// 调试玩家 (合成, 不动 characterStore)
// ============================================================

export function createDebugPlayer(options: DebugPlayerOptions = {}): Combatant {
  const maxMp = options.maxMp ?? 0;
  const learnedAbilities: LearnedAbility[] = options.learnedAbilities ?? [];
  return {
    id: 'debug_player',
    name: learnedAbilities.length > 0 ? '测试法师' : '测试勇者',
    side: 'player',
    attributes: learnedAbilities.length > 0
      ? { STR: 10, DEX: 14, CON: 12, INT: 16, WIS: 15, CHA: 13 }  // 法师: INT 16
      : { STR: 14, DEX: 16, CON: 12, INT: 10, WIS: 15, CHA: 13 },  // 战士: STR 14
    hp: 30, maxHp: 30,
    ap: 6, maxAp: 6,
    mp: maxMp, maxMp,
    conditions: [],
    isDead: false,
    isFleeing: false,
    equipped: {
      weapon: { id: 'w1', name: '铁剑', slot: 'weapon', rarity: 'common', tags: [], description: '', value: 0,
        effects: [{ id: 'e1', type: 'damage_bonus', value: 4, description: '+4 攻击' }] } as Item,
      armor: { id: 'a1', name: '皮甲', slot: 'armor', rarity: 'common', tags: [], description: '', value: 0,
        effects: [{ id: 'e1', type: 'defense_bonus', value: 1, description: '+1 防御' }] } as Item,
      accessory: null,
    },
    elementalResistances: { ...ZERO_RESISTANCES },
    // v0.6.2 字段 (战斗 Combatant 形态, 不走 characterStore, 所以 learnedAbilities 留作占位 — 实际由 createDebugBattleMage 在战斗初始化时通过 startCombat 注入)
    ...(learnedAbilities.length > 0
      ? {}
      : {}),
  };
}

// ============================================================
// 怪物工厂
// ============================================================

function uniqueId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function baseEnemy(id: string, name: string, hp: number, attrs: Combatant['attributes']): Combatant {
  return {
    id, name, side: 'enemy',
    attributes: attrs,
    hp, maxHp: hp,
    ap: 4, maxAp: 4,
    conditions: [],
    isDead: false,
    isFleeing: false,
    equipped: { weapon: null, armor: null, accessory: null },
    elementalResistances: { ...ZERO_RESISTANCES },
  };
}

export function goblinScout(): Combatant {
  return baseEnemy(uniqueId('goblin_scout'), '哥布林斥候', 8, { STR: 6, DEX: 12, CON: 8, INT: 6, WIS: 8, CHA: 6 });
}

export function goblinWarrior(): Combatant {
  const w = baseEnemy(uniqueId('goblin_warrior'), '哥布林战士', 25, { STR: 14, DEX: 10, CON: 12, INT: 8, WIS: 8, CHA: 6 });
  return {
    ...w,
    equipped: {
      ...w.equipped,
      weapon: { id: uniqueId('gw'), name: '狼牙棒', slot: 'weapon', rarity: 'common', tags: [], description: '', value: 0,
        effects: [{ id: uniqueId('e'), type: 'damage_bonus', value: 5, description: '+5 攻击' }] } as Item,
    },
  };
}

export function trollChief(): Combatant {
  const t = baseEnemy(uniqueId('troll_chief'), '巨魔首领', 60, { STR: 18, DEX: 10, CON: 16, INT: 8, WIS: 10, CHA: 8 });
  return {
    ...t,
    equipped: {
      ...t.equipped,
      weapon: { id: uniqueId('tc'), name: '战斧', slot: 'weapon', rarity: 'uncommon', tags: [], description: '', value: 0,
        effects: [{ id: uniqueId('e'), type: 'damage_bonus', value: 8, description: '+8 攻击' }] } as Item,
    },
  };
}

// ============================================================
// 4 张预设战斗卡
// ============================================================

export const DEBUG_BATTLES: readonly DebugBattle[] = [
  {
    id: 'debug_trivial',
    difficulty: 'trivial',
    title: '路边小怪',
    description: '单体弱敌, 测 6 维公式与攻击基础流程',
    enemies: [goblinScout()],
    expectedOutcome: '1 回合秒杀, 0 惩罚',
  },
  {
    id: 'debug_normal',
    difficulty: 'normal',
    title: '哥布林伏击',
    description: '3 只斥候, 测多敌 ACT 队列与群战逻辑',
    enemies: [goblinScout(), goblinScout(), goblinScout()],
    expectedOutcome: '3-5 回合, 玩家受反击',
  },
  {
    id: 'debug_hard',
    difficulty: 'hard',
    title: '哥布林精英队',
    description: '战士 + 斥候, 测防御动作与物品使用',
    enemies: [goblinWarrior(), goblinScout()],
    expectedOutcome: '5-8 回合, 测 defend + 药水',
  },
  {
    id: 'debug_deadly',
    difficulty: 'deadly',
    title: '巨魔首领',
    description: '高 HP 强攻 Boss, 测 deadly 档失败惩罚',
    enemies: [trollChief()],
    expectedOutcome: '玩家 HP=0, 触发 survives=true + perma-wound',
  },
  {
    id: 'debug_ability',
    difficulty: 'ability',
    title: '🔥 法师火球 (v0.6.2)',
    description: '测试法师: INT 16, MP 20/20, 预学 fireBolt (1d10+INT 火焰伤害), 单只弱敌',
    enemies: [goblinScout()],
    expectedOutcome: 'ActionMenu 显示"能力"按钮 → SkillPicker → 火球 → QTE 命中 → 哥布林 HP -10~20 火焰伤害',
    playerOptions: {
      maxMp: 20,
      learnedAbilities: [
        { abilityId: 'spell_fire_bolt', school: 'magic', learnedAt: 1 },
      ],
    },
  },
] as const;
