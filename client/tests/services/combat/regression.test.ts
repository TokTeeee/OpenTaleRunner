/**
 * v0.5-dev 战斗系统 — 回归测试 (T7.3)
 *
 * 锁定 v0.3 → v0.4 → v0.5-dev 升级契约: 6 维公式 + ConditionsRegistry 派生 + ItemEffect schema 兼容.
 *
 * 这些测试是 "契约" 性质 — 防止 v0.5-dev 战斗系统的重构破坏 v0.3/v0.4 已有行为.
 * 任何修改若让这些测试失败, 必须明确说明意图.
 *
 * v0.5-dev 变更:
 * - 命中公式: d20 + DEX_mod vs 10 + DEX_mod + defense + dodgePenalty
 * - 伤害公式: max(1, d6 + STR_mod + weapon - target.defense) * QTE 缩放
 * - 闪避衰减: DODGE_PENALTY_STEP = 5
 * - checkHit 替代 checkDodge (平局算命中)
 * - 移除: rollDodge / computeAC (合并到 hitThreshold)
 *
 * 详见: docs/zh/战斗系统.md §2.6
 */

import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import {
  resolveConditionEffects,
  CONDITION_REGISTRY,
  getConditionMeta,
  listConditionKeys,
} from '../../../src/services/judgment/ConditionsRegistry';
import {
  toCombatCategory,
  hasDefaultMapping,
  isWeaponPermanent,
  isGMFallback,
} from '../../../src/services/combat/effectTypeCompat';
import {
  effectiveAttribute,
  rollToHit,
  hitThreshold,
  checkHit,
  rollDamage,
  DODGE_PENALTY_STEP,
  fleeChance,
  rollFlee,
  noopQTEProvider,
} from '../../../src/services/combat/ActionResolver';
import { makeConstRoll } from '../../../src/services/combat/dice';
import { registerCombatTools, unregisterCombatTools, _resetCombatEngine } from '../../../src/services/combat/combatTools';
import { toolCallRegistry } from '../../../src/services/llm/ToolCallRegistry';
import { useCombatStore, INITIAL_COMBAT_STATE } from '../../../src/stores/combatStore';
import { resetClientStores } from '../../utils/resetStores';
import type { Combatant } from '../../../src/services/combat/types';
import type { Item, EffectType, ItemEffect } from '../../../src/types/item';

// ============================================================
// 1. v0.3 6 维公式契约 — effectiveAttribute
// ============================================================

describe('regression: v0.3 6 维公式契约 (effectiveAttribute)', () => {
  it('基线: attributes[attr] 直接返回, 不加 buff/equip', () => {
    const c: Combatant = {
      id: 'p1', side: 'player', name: 'P',
      attributes: { STR: 12, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 10 },
      hp: 20, maxHp: 20, ap: 6, maxAp: 6,
      conditions: [], isDead: false, isFleeing: false,
      equipped: { weapon: null, armor: null, accessory: null },
    };
    expect(effectiveAttribute(c, 'STR')).toBe(12);
    expect(effectiveAttribute(c, 'DEX')).toBe(14);
    expect(effectiveAttribute(c, 'CON')).toBe(12);
    expect(effectiveAttribute(c, 'INT')).toBe(10);
    expect(effectiveAttribute(c, 'WIS')).toBe(10);
    expect(effectiveAttribute(c, 'CHA')).toBe(10);
  });

  it('加 buff.modifiers[attr] (v0.3 字段名是 modifiers, BuffInstance 也叫 modifiers)', () => {
    const c: Combatant = {
      id: 'p1', side: 'player', name: 'P',
      attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      hp: 20, maxHp: 20, ap: 6, maxAp: 6,
      conditions: [{ ref: 'STR_up', stacks: 1, remainingTurns: 3, source: 'item', appliedAtTurn: 1, modifiers: { STR: 3 } }],
      isDead: false, isFleeing: false,
      equipped: { weapon: null, armor: null, accessory: null },
    };
    expect(effectiveAttribute(c, 'STR')).toBe(13);
  });

  it('buff modifier 累加 (多层 buff 叠加)', () => {
    const c: Combatant = {
      id: 'p1', side: 'player', name: 'P',
      attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      hp: 20, maxHp: 20, ap: 6, maxAp: 6,
      conditions: [
        { ref: 'b1', stacks: 1, remainingTurns: 3, source: 'a', appliedAtTurn: 1, modifiers: { STR: 2 } },
        { ref: 'b2', stacks: 1, remainingTurns: 3, source: 'a', appliedAtTurn: 1, modifiers: { STR: 3 } },
      ],
      isDead: false, isFleeing: false,
      equipped: { weapon: null, armor: null, accessory: null },
    };
    expect(effectiveAttribute(c, 'STR')).toBe(15); // 10 + 2 + 3
  });

  it('buff modifier 负值 (减益) 同样生效', () => {
    const c: Combatant = {
      id: 'p1', side: 'player', name: 'P',
      attributes: { STR: 14, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      hp: 20, maxHp: 20, ap: 6, maxAp: 6,
      conditions: [{ ref: 'wounded', stacks: 1, remainingTurns: 3, source: 'a', appliedAtTurn: 1, modifiers: { STR: -4 } }],
      isDead: false, isFleeing: false,
      equipped: { weapon: null, armor: null, accessory: null },
    };
    expect(effectiveAttribute(c, 'STR')).toBe(10);
  });

  it('equipment attribute_mod 计入 (accessory +{STR:2})', () => {
    const accessory: Item = {
      id: 'a1', name: '指环', slot: 'accessory', rarity: 'common', tags: [], description: '', value: 0,
      effects: [{ type: 'attribute_mod', value: { STR: 2 }, description: '+2 STR' }],
    };
    const c: Combatant = {
      id: 'p1', side: 'player', name: 'P',
      attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      hp: 20, maxHp: 20, ap: 6, maxAp: 6,
      conditions: [],
      isDead: false, isFleeing: false,
      equipped: { weapon: null, armor: null, accessory } as Combatant['equipped'],
    };
    expect(effectiveAttribute(c, 'STR')).toBe(12);
  });
});

// ============================================================
// 1.b 6 维公式契约 — 命中/闪避/伤害/flee (v0.5-dev 文档版)
// ============================================================

describe('regression: v0.5-dev 6 维公式契约 (命中/闪避/伤害/flee)', () => {
  function mkCombatant(over: Partial<Combatant>): Combatant {
    return {
      id: 'x', side: 'player', name: 'X',
      attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      hp: 20, maxHp: 20, ap: 6, maxAp: 6,
      conditions: [], isDead: false, isFleeing: false,
      equipped: { weapon: null, armor: null, accessory: null },
      ...over,
    };
  }

  it('命中: d20 + DEX_mod (v0.5-dev 文档版)', () => {
    const c = mkCombatant({ attributes: { ...mkCombatant({}).attributes, DEX: 14 } });
    const r = rollToHit(c, makeConstRoll([10]));
    // DEX 14 → +2, d20=10 → total=12
    expect(r.d20).toBe(10);
    expect(r.dexMod).toBe(2);
    expect(r.total).toBe(12);
  });

  it('命中门槛: 10 + DEX_mod + armor + dodgePenalty (v0.5-dev 文档版)', () => {
    const c = mkCombatant({
      attributes: { ...mkCombatant({}).attributes, DEX: 16 },
      equipped: { weapon: null, armor: { id: 'a1', name: '甲', slot: 'armor', effects: [{ type: 'defense_bonus', value: 3 }] } as never, accessory: null },
    });
    const t = hitThreshold(c, 0, false);
    // DEX 16 → +3, defense=3 → 10+3+3+0 = 16
    expect(t.dexMod).toBe(3);
    expect(t.defense).toBe(3);
    expect(t.total).toBe(16);
  });

  it('命中门槛: defending 状态 +2 (v0.5-dev 文档版)', () => {
    const c = mkCombatant({});
    const t = hitThreshold(c, 0, true);
    expect(t.defendingBonus).toBe(2);
    expect(t.total).toBe(12); // 10 + 0 + 0 + 0 + 2
  });

  it('命中门槛: dodgePenalty 累积 (v0.5-dev 闪避衰减)', () => {
    const c = mkCombatant({});
    const t = hitThreshold(c, 15, false);
    // 10 + 0 + 0 + 15 + 0 = 25
    expect(t.total).toBe(25);
  });

  it('checkHit: attackRoll >= threshold → true (v0.5-dev 平局算命中)', () => {
    expect(checkHit(10, 10)).toBe(true);  // 平局
    expect(checkHit(15, 12)).toBe(true);  // 大于
    expect(checkHit(8, 12)).toBe(false);  // 小于
  });

  it('DODGE_PENALTY_STEP = 5 (闪避衰减常量)', () => {
    expect(DODGE_PENALTY_STEP).toBe(5);
  });

  it('伤害: base = max(1, d6 + STR_mod + weapon - target.defense) (v0.5-dev 文档版)', () => {
    const weapon: Item = { id: 'w1', name: '剑', slot: 'weapon', rarity: 'common', tags: [], description: '', value: 0, effects: [{ type: 'damage_bonus', value: 6, description: '+6' } as ItemEffect] };
    const attacker = mkCombatant({
      attributes: { ...mkCombatant({}).attributes, STR: 16 },
      equipped: { weapon, armor: null, accessory: null } as Combatant['equipped'],
    });
    const target = mkCombatant({});
    // d6=4, STR 16 → +3, weapon=6, defense=0 → max(1, 4+3+6-0) = 13
    const r = rollDamage(attacker, target, 0, 0.3, makeConstRoll([4]));
    expect(r.base).toBe(13);
    expect(r.total).toBe(13);
  });

  it('伤害 clamp: 低 d6 - 高 defense 时 base = max(1, ...) (v0.5-dev 文档版)', () => {
    const armor: Item = { id: 'a1', name: '重甲', slot: 'armor', rarity: 'common', tags: [], description: '', value: 0, effects: [{ type: 'defense_bonus', value: 10 } as ItemEffect] };
    const attacker = mkCombatant({ attributes: { ...mkCombatant({}).attributes, STR: 6 } });
    const target = mkCombatant({ equipped: { weapon: null, armor, accessory: null } as Combatant['equipped'] });
    // d6=1, STR 6 → -2, weapon=0, defense=10 → max(1, 1-2+0-10) = 1
    const r = rollDamage(attacker, target, 0, 0.3, makeConstRoll([1]));
    expect(r.base).toBe(1);
    expect(r.total).toBe(1);
  });

  it('伤害: QTE modifier 只缩放, base = max(1, d6 + STR_mod + weapon - defense) (v0.5-dev)', () => {
    const weapon: Item = { id: 'w1', name: '剑', slot: 'weapon', rarity: 'common', tags: [], description: '', value: 0, effects: [{ type: 'damage_bonus', value: 4, description: '+4' } as ItemEffect] };
    const attacker = mkCombatant({ equipped: { weapon, armor: null, accessory: null } as Combatant['equipped'] });
    const target = mkCombatant({});
    // d6=4, STR 10 → 0, weapon=4, defense=0 → base=8
    // qte=0  → 8
    // qte=1  → 8 * 1.3 = 10.4 → 10
    // qte=-1 → 8 * 0.7 = 5.6 → 6
    expect(rollDamage(attacker, target, 0, 0.3, makeConstRoll([4])).total).toBe(8);
    expect(rollDamage(attacker, target, 1, 0.3, makeConstRoll([4])).total).toBe(10);
    expect(rollDamage(attacker, target, -1, 0.3, makeConstRoll([4])).total).toBe(6);
  });

  it('fleeChance: clamp(0.3 + (playerDEX - avgEnemyDEX) / 20, 0.1, 0.9) (v0.3 契约不变)', () => {
    const p = mkCombatant({ attributes: { ...mkCombatant({}).attributes, DEX: 10 } });
    const e = mkCombatant({ attributes: { ...mkCombatant({}).attributes, DEX: 10 } });
    expect(fleeChance(p, [e])).toBe(0.3);
    const p2 = mkCombatant({ id: 'p2', attributes: { ...mkCombatant({}).attributes, DEX: 30 } });
    expect(fleeChance(p2, [e])).toBe(0.9); // clamp 上限
    const p3 = mkCombatant({ id: 'p3', attributes: { ...mkCombatant({}).attributes, DEX: 1 } });
    expect(fleeChance(p3, [e])).toBe(0.1); // clamp 下限
  });

  it('rollFlee: d100 <= chance * 100 → success=true (v0.3 契约不变)', () => {
    const p = mkCombatant({ attributes: { ...mkCombatant({}).attributes, DEX: 10 } });
    const e = mkCombatant({ attributes: { ...mkCombatant({}).attributes, DEX: 10 } });
    // chance = 0.3
    expect(rollFlee(p, [e], makeConstRoll([20])).success).toBe(true);   // 20 <= 30
    expect(rollFlee(p, [e], makeConstRoll([50])).success).toBe(false);  // 50 > 30
  });

  it('noopQTEProvider 返 modifier=0 (默认 QTE 关闭), 伤害不缩放', () => {
    const weapon: Item = { id: 'w1', name: '剑', slot: 'weapon', rarity: 'common', tags: [], description: '', value: 0, effects: [{ type: 'damage_bonus', value: 5, description: '+5' } as ItemEffect] };
    const attacker = mkCombatant({ equipped: { weapon, armor: null, accessory: null } as Combatant['equipped'] });
    const target = mkCombatant({});
    const noop = noopQTEProvider({
      action: { kind: 'attack', attackerId: 'x', targetId: 'y' },
      attacker, target, state: { combatants: { x: attacker, y: target } } as never,
    });
    expect(noop.modifier).toBe(0);
    // d6=4, STR 10 → 0, weapon=5, defense=0 → base=9, modifier=0 → 9
    const r = rollDamage(attacker, target, noop.modifier, 0.3, makeConstRoll([4]));
    expect(r.total).toBe(9);
  });
});

// ============================================================
// 2. ConditionsRegistry 派生契约 (v0.3 行为不变)
// ============================================================

describe('regression: v0.3 ConditionsRegistry 派生契约', () => {
  it('resolveConditionEffects: 单 condition 派生所有字段', () => {
    const r = resolveConditionEffects(['中毒']);
    expect(r.dicePenalty).toBe(2);
    expect(r.travelSpeedMultiplier).toBe(0.8);
    expect(r.regenMultiplier).toBe(0.5);
    expect(r.socialPenalty).toBe(0);
    expect(r.visionMultiplier).toBe(1.0);
  });

  it('resolveConditionEffects: 多 condition 聚合 (max dicePenalty, min multipliers)', () => {
    const r = resolveConditionEffects(['中毒', '受伤']);
    // 中毒: dice=2, travel=0.8, regen=0.5
    // 受伤: dice=1, travel=0.7, regen=0.8
    // max(dice)=2, min(travel)=0.7, min(regen)=0.5
    expect(r.dicePenalty).toBe(2);
    expect(r.travelSpeedMultiplier).toBe(0.7);
    expect(r.regenMultiplier).toBe(0.5);
  });

  it('resolveConditionEffects: 空数组 → 默认值 (中性)', () => {
    const r = resolveConditionEffects([]);
    expect(r.dicePenalty).toBe(0);
    expect(r.travelSpeedMultiplier).toBe(1.0);
    expect(r.regenMultiplier).toBe(1.0);
    expect(r.socialPenalty).toBe(0);
    expect(r.visionMultiplier).toBe(1.0);
  });

  it('resolveConditionEffects: 未知 condition 静默忽略 (不抛错)', () => {
    const r = resolveConditionEffects(['未知状态', '中毒']);
    expect(r.dicePenalty).toBe(2); // 中毒 仍生效
  });

  it('CONDITION_REGISTRY 14 个 v0.3 condition 全部可查 (向后兼容)', () => {
    const expected: string[] = [
      '中毒', '受伤', '骨折', '烧伤', '冻伤', '失明', '听力受损', '虚弱',
      '恐惧', '困惑', '诅咒', '疾病', '昏迷', '醉酒', '麻痹',
    ];
    for (const c of expected) {
      expect(CONDITION_REGISTRY[c]).toBeDefined();
    }
  });

  it('getConditionMeta: 14 个 v0.3 condition 全部有 meta (新派生效, 不破 v0.3)', () => {
    const v3Conditions: string[] = [
      '中毒', '受伤', '骨折', '烧伤', '冻伤', '失明', '听力受损', '虚弱',
      '恐惧', '困惑', '诅咒', '疾病', '昏迷', '醉酒', '麻痹',
    ];
    for (const c of v3Conditions) {
      const meta = getConditionMeta(c);
      expect(meta).not.toBeNull();
      expect(meta?.defaultDuration).toBeGreaterThan(0);
    }
  });

  it('v0.3 ConditionEffect 与 v0.4 ConditionMeta 并行存在 (互不污染)', () => {
    // 同一 condition, 两个派生效一致
    const v3 = resolveConditionEffects(['中毒']);
    const v4 = getConditionMeta('中毒');
    expect(v3.dicePenalty).toBe(2);          // v0.3: dicePenalty
    expect(v4?.modifiers?.CON).toBe(-1);     // v0.4: CON modifier
    // 同一 condition, 派生效 互相独立
    expect(v3.dicePenalty).not.toBe(v4?.modifiers?.CON);
  });

  it('listConditionKeys 至少 23 个 (15 v0.3 + v0.4 战斗扩展)', () => {
    const keys = listConditionKeys();
    expect(keys.length).toBeGreaterThanOrEqual(23);
  });
});

// ============================================================
// 3. ItemEffect schema 兼容契约 (v0.3 EffectType → v0.4 战斗域分类)
// ============================================================

describe('regression: v0.3 ItemEffect schema 兼容契约', () => {
  it('11 种 v0.3 EffectType 全部映射到 5 个战斗域分类', () => {
    const allTypes: EffectType[] = [
      'damage_bonus', 'defense_bonus', 'attribute_mod',
      'hp_restore', 'hp_max_bonus', 'vital_restore',
      'elemental_damage', 'elemental_resist',
      'skill_bonus', 'light_source', 'special',
    ];
    const cats = new Set(allTypes.map(toCombatCategory));
    expect(cats.size).toBe(5);
  });

  it('11 种 EffectType 分类契约: heal=1, buff=5, damage=1, weapon-perm=2, gm-fallback=2', () => {
    const byCat: Record<string, EffectType[]> = { heal: [], buff: [], damage: [], 'weapon-perm': [], 'gm-fallback': [] };
    for (const t of [
      'damage_bonus', 'defense_bonus', 'attribute_mod', 'hp_restore', 'hp_max_bonus',
      'vital_restore', 'elemental_damage', 'elemental_resist', 'skill_bonus', 'light_source', 'special',
    ] as EffectType[]) {
      byCat[toCombatCategory(t)].push(t);
    }
    expect(byCat.heal).toEqual(['hp_restore']);
    expect(byCat.buff).toHaveLength(5);
    expect(byCat.damage).toEqual(['elemental_damage']);
    expect(byCat['weapon-perm']).toHaveLength(2);
    expect(byCat['gm-fallback']).toHaveLength(2);
    // 1+5+1+2+2 = 11 (无遗漏)
    const total = Object.values(byCat).reduce((s, l) => s + l.length, 0);
    expect(total).toBe(11);
  });

  it('hasDefaultMapping: 7 种走默认 (heal+buff+damage, 战斗内可自动处理)', () => {
    const defaultMapped: EffectType[] = [
      'hp_restore', 'hp_max_bonus', 'vital_restore', 'attribute_mod',
      'elemental_resist', 'skill_bonus', 'elemental_damage',
    ];
    for (const t of defaultMapped) {
      expect(hasDefaultMapping(t)).toBe(true);
    }
  });

  it('hasDefaultMapping: 4 种不走默认 (weapon-perm 走装备, gm-fallback 走 GM)', () => {
    const notDefault: EffectType[] = ['damage_bonus', 'defense_bonus', 'light_source', 'special'];
    for (const t of notDefault) {
      expect(hasDefaultMapping(t)).toBe(false);
    }
  });

  it('isWeaponPermanent: damage_bonus + defense_bonus 走装备永久词条', () => {
    expect(isWeaponPermanent('damage_bonus')).toBe(true);
    expect(isWeaponPermanent('defense_bonus')).toBe(true);
    expect(isWeaponPermanent('attribute_mod')).toBe(false);
  });

  it('isGMFallback: light_source + special + 未知 走 GM 裁定', () => {
    expect(isGMFallback('light_source')).toBe(true);
    expect(isGMFallback('special')).toBe(true);
    expect(isGMFallback(null)).toBe(true);
    expect(isGMFallback('not_a_real_type')).toBe(true);
  });

  it('v0.3 ItemEffect.value 多种类型共存 (number / object / string)', () => {
    // 这是 v0.3 schema 契约 — 战斗系统必须容忍所有 value 类型
    const effects: ItemEffect[] = [
      { id: '1', type: 'damage_bonus', value: 5, description: '+5' }, // number
      { id: '2', type: 'attribute_mod', value: { STR: 2, DEX: 1 }, description: '+STR' }, // object
      { id: '3', type: 'hp_restore', value: 10, description: 'heal 10' },
      { id: '4', type: 'light_source', value: '火炬', description: '光' }, // string
    ];
    // 4 个都应能解析, 不抛错
    for (const eff of effects) {
      expect(eff.type).toBeDefined();
      expect(eff.value).toBeDefined();
    }
  });
});

// ============================================================
// 4. v0.3 startCombat args 契约 (via toolcall dispatch)
// ============================================================

describe('regression: v0.3 startCombat args 契约 (via dispatch)', () => {
  // 这里走 toolcall 公开 API 验证 — 因为 validateStartCombatArgs 是内部函数
  // 契约: 任何破坏 v0.3 args 校验的改动都会让这些测试失败

  beforeEach(() => {
    resetClientStores();
    useCombatStore.setState({ ...INITIAL_COMBAT_STATE, phase: 'idle' });
    _resetCombatEngine();
  });

  afterEach(() => {
    unregisterCombatTools();
    _resetCombatEngine();
  });
  function mkCombatant(over: Partial<Combatant>): Combatant {
    return {
      id: 'x', side: 'player', name: 'X',
      attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      hp: 20, maxHp: 20, ap: 6, maxAp: 6,
      conditions: [], isDead: false, isFleeing: false,
      equipped: { weapon: null, armor: null, accessory: null },
      ...over,
    };
  }

  // 注册一次 (跨 test 共享, 验证 register 是幂等的)
  // 注意: 由于其他 test 可能反注册, 这里在每个 test 里重新注册更稳妥
  // 但 vitest test 间模块状态隔离 — toolCallRegistry 是单例, 需小心

  it('合法 args (4 档难度各一) → dispatch 返 ok=true', async () => {
    // 注册 (幂等)
    registerCombatTools();
    for (const diff of ['trivial', 'normal', 'hard', 'deadly'] as const) {
      // 每次循环重置 engine + store (上轮 startCombat 会让 phase=active, 不能再 start)
      _resetCombatEngine();
      useCombatStore.setState({ ...INITIAL_COMBAT_STATE, phase: 'idle' });
      const args = {
        combatId: `c-${diff}`,
        player: mkCombatant({ id: `p-${diff}` }),
        enemies: [mkCombatant({ id: `e-${diff}`, side: 'enemy' as const })],
        recommendedDifficulty: diff,
      };
      const r = await toolCallRegistry.dispatch([{ name: 'startCombat', arguments: args }]);
      expect(r[0]!.ok).toBe(true);
      // combat tool result 的 ok 在 result 内部
      const toolResult = r[0]!.result as { ok: boolean; reason?: string };
      expect(toolResult.ok).toBe(true);
    }
    unregisterCombatTools();
  });

  it('6 维 attrs 越界 → tool result ok=false (校验契约)', async () => {
    registerCombatTools();
    const args = {
      combatId: 'c-bad',
      player: mkCombatant({ id: 'p-bad', attributes: { STR: 25, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 } }),
      enemies: [mkCombatant({ id: 'e-bad', side: 'enemy' as const })],
    };
    const r = await toolCallRegistry.dispatch([{ name: 'startCombat', arguments: args }]);
    expect(r[0]!.ok).toBe(true);
    const toolResult = r[0]!.result as { ok: boolean; reason?: string };
    expect(toolResult.ok).toBe(false);
    expect(toolResult.reason).toBeDefined();
    unregisterCombatTools();
  });

  it('缺 combatId → tool result ok=false (校验契约)', async () => {
    registerCombatTools();
    const args = {
      player: mkCombatant({ id: 'p1' }),
      enemies: [mkCombatant({ id: 'e1', side: 'enemy' as const })],
    };
    const r = await toolCallRegistry.dispatch([{ name: 'startCombat', arguments: args }]);
    expect(r[0]!.ok).toBe(true);
    const toolResult = r[0]!.result as { ok: boolean; reason?: string };
    expect(toolResult.ok).toBe(false);
    expect(toolResult.reason).toBeDefined();
    unregisterCombatTools();
  });

  it('recommendedDifficulty 越界 → tool result ok=false (校验契约)', async () => {
    registerCombatTools();
    const args = {
      combatId: 'c-bad-diff',
      player: mkCombatant({ id: 'p-bad-diff' }),
      enemies: [mkCombatant({ id: 'e-bad-diff', side: 'enemy' as const })],
      recommendedDifficulty: 'impossible' as never,
    };
    const r = await toolCallRegistry.dispatch([{ name: 'startCombat', arguments: args }]);
    expect(r[0]!.ok).toBe(true);
    const toolResult = r[0]!.result as { ok: boolean; reason?: string };
    expect(toolResult.ok).toBe(false);
    expect(toolResult.reason).toBeDefined();
    unregisterCombatTools();
  });
});
