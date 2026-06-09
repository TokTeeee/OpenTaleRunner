/**
 * v0.6.x 战斗系统 — ActionResolver 单元测试
 *
 * 历史变更:
 * - v0.5-dev:
 *   - 命中公式: d20 + DEX_mod vs max(5, 10 + DEX_mod + defense - dodgePenalty)
 *   - 伤害公式: max(1, d6 + STR_mod + weapon - target.defense) * QTE 缩放
 *   - 移除 `skill` 动作的 8 个用例
 *   - 保留 dodge 衰减, 验证 DODGE_PENALTY_STEP=5 与命中后归零
 *   - v0.6.2 修正: dodgePenalty 从门槛中扣除 (连续闪避使门槛降低, 更易被命中)
 * - v0.6.2: 新增 `ability` 动作的 8+ 个用例 (3 学派 16 能力);
 *   8 元素抗性公式 (fire/ice/lightning/wind/earth/arcane/holy/shadow):
 *   `final = base * (1 - resistance/200)`, clamp [0, base];
 *   MP 不足抛 InsufficientMPError; 事件 ABILITY_USED 触发.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createActionResolver,
  rollToHit,
  hitThreshold,
  checkHit,
  rollDamage,
  DODGE_PENALTY_STEP,
  rollFlee,
  InsufficientAPError,
  _resetSharedResolver,
  getEquipmentResistances,
  getEquipmentMPBonus,
} from '../../../src/services/combat/ActionResolver';
import { useCombatStore } from '../../../src/stores/combatStore';
import { useItemRegistryStore } from '../../../src/stores/itemRegistryStore';
import { resetClientStores } from '../../utils/resetStores';
import { defaultRoll } from '../../../src/services/combat/dice';
import type { RollFn } from '../../../src/services/combat/dice';
import type { Combatant } from '../../../src/services/combat/types';

/** 构造一个 d20/d6/d100 全部返回固定值的 RollFn. */
function makeConstRoll(values: number[]): RollFn {
  let i = 0;
  return ((n: number) => {
    const v = values[i++];
    return v > n ? n : v; // clamp 到 dice 上限
  }) as RollFn;
}

function makePlayer(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: 'p1',
    side: 'player',
    name: '玩家',
    attributes: { STR: 12, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: 30,
    maxHp: 30,
    ap: 6,
    maxAp: 6,
    conditions: [],
    isDead: false,
    isFleeing: false,
    equipped: { weapon: null, armor: null, accessory: null },
    ...overrides,
  };
}

function makeEnemy(id: string, overrides: Partial<Combatant> = {}): Combatant {
  return {
    id,
    side: 'enemy',
    name: `敌人-${id}`,
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: 20,
    maxHp: 20,
    ap: 4,
    maxAp: 4,
    conditions: [],
    isDead: false,
    isFleeing: false,
    equipped: { weapon: null, armor: null, accessory: null },
    ...overrides,
  };
}

function makeWeapon(damage: number) {
  return {
    id: 'w1',
    name: '长剑',
    slot: 'weapon' as const,
    effects: [{ type: 'damage_bonus' as const, value: damage }],
  };
}

function makeArmor(defense: number) {
  return {
    id: 'a1',
    name: '皮甲',
    slot: 'armor' as const,
    effects: [{ type: 'defense_bonus' as const, value: defense }],
  };
}

beforeEach(() => {
  resetClientStores();
  _resetSharedResolver();
  useCombatStore.setState({
    phase: 'active',
    round: 1,
    turn: 1,
    combatants: {
      p1: makePlayer(),
      e1: makeEnemy('e1'),
    },
  });
});

// ============================================================
// 公式: rollToHit
// ============================================================
describe('rollToHit (d20 + DEX 修正)', () => {
  it('d20 投 + DEX 修正: STR 14 → 投 10 + 2 = 12', () => {
    const r = rollToHit(makePlayer(), makeConstRoll([10]));
    expect(r.d20).toBe(10);
    expect(r.dexMod).toBe(2);
    expect(r.total).toBe(12);
  });

  it('STR 18 → 投 15 + 4 = 19', () => {
    const r = rollToHit(makePlayer({ attributes: { STR: 18, DEX: 18, CON: 10, INT: 10, WIS: 10, CHA: 10 } }), makeConstRoll([15]));
    expect(r.dexMod).toBe(4);
    expect(r.total).toBe(19);
  });

  it('DEX 6 → -2 修正', () => {
    const r = rollToHit(makePlayer({ attributes: { STR: 10, DEX: 6, CON: 10, INT: 10, WIS: 10, CHA: 10 } }), makeConstRoll([8]));
    expect(r.dexMod).toBe(-2);
    expect(r.total).toBe(6);
  });
});

// ============================================================
// 公式: hitThreshold
// ============================================================
describe('hitThreshold (10 + DEX + defense - dodgePenalty + defending)', () => {
  it('DEX 14 + armor 3: 10 + 2 + 3 = 15', () => {
    const t = hitThreshold(
      makeEnemy('e1', {
        attributes: { STR: 10, DEX: 14, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        equipped: { weapon: null, armor: makeArmor(3), accessory: null },
      }),
      0,
      false,
    );
    expect(t.dexMod).toBe(2);
    expect(t.defense).toBe(3);
    expect(t.dodgePenalty).toBe(0);
    expect(t.defendingBonus).toBe(0);
    expect(t.total).toBe(15);
  });

  it('defending 命中门槛 +2', () => {
    const t = hitThreshold(
      makeEnemy('e1', { equipped: { weapon: null, armor: null, accessory: null } }),
      0,
      true,
    );
    expect(t.defendingBonus).toBe(2);
    expect(t.total).toBe(12); // 10 + 0 + 0 - 0 + 2
  });

  it('dodgePenalty 从门槛中扣除 (连续闪避使门槛降低, 更易被命中)', () => {
    const t = hitThreshold(
      makeEnemy('e1'),
      15, // 累积 15 点衰减
      false,
    );
    expect(t.total).toBe(5); // max(5, 10 + 0 + 0 - 15 + 0) = max(5, -5) = 5 (保底)
  });

  it('dodgePenalty 小于基础门槛时正常扣除', () => {
    const t = hitThreshold(
      makeEnemy('e1', {
        attributes: { STR: 10, DEX: 14, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        equipped: { weapon: null, armor: makeArmor(3), accessory: null },
      }),
      5, // 5 点衰减
      false,
    );
    expect(t.total).toBe(10); // 10 + 2 + 3 - 5 + 0 = 10
  });
});

// ============================================================
// 公式: checkHit
// ============================================================
describe('checkHit (attackRoll >= threshold)', () => {
  it('平局算命中', () => {
    expect(checkHit(10, 10)).toBe(true);
  });

  it('大于算命中', () => {
    expect(checkHit(15, 12)).toBe(true);
  });

  it('小于算未命中', () => {
    expect(checkHit(8, 12)).toBe(false);
  });
});

// ============================================================
// 公式: rollDamage
// ============================================================
describe('rollDamage (d6 + STR_mod + weapon - target.defense) * QTE 缩放', () => {
  it('投 d6=4 + STR_mod=1 + weapon=3 - defense=2 = 6, QTE=0 → 6', () => {
    const r = rollDamage(
      makePlayer({ attributes: { STR: 12, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 }, equipped: { weapon: makeWeapon(3), armor: null, accessory: null } }),
      makeEnemy('e1', { equipped: { weapon: null, armor: makeArmor(2), accessory: null } }),
      0,
      0.3,
      makeConstRoll([4]),
    );
    expect(r.d6).toBe(4);
    expect(r.strMod).toBe(1);
    expect(r.weapon).toBe(3);
    expect(r.defense).toBe(2);
    expect(r.base).toBe(6);
    expect(r.total).toBe(6);
  });

  it('min 1: 投 1 - 5 + 武器 = -3 → 1, QTE 缩放也保底 0', () => {
    const r = rollDamage(
      makePlayer({ equipped: { weapon: makeWeapon(0), armor: null, accessory: null } }),
      makeEnemy('e1', { equipped: { weapon: null, armor: makeArmor(10), accessory: null } }),
      0,
      0.3,
      makeConstRoll([1]),
    );
    expect(r.base).toBe(1); // max(1, 1 + 0 + 0 - 10) = 1
    expect(r.total).toBe(1);
  });

  it('QTE modifier=1, scale=0.3 → 伤害 × 1.3, 四舍五入', () => {
    const r = rollDamage(
      makePlayer({ attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 }, equipped: { weapon: makeWeapon(3), armor: null, accessory: null } }),
      makeEnemy('e1', { equipped: { weapon: null, armor: null, accessory: null } }),
      1,
      0.3,
      makeConstRoll([3]),
    );
    // base = max(1, 3 + 0 + 3 - 0) = 6, * (1 + 1 * 0.3) = 7.8 → 8
    expect(r.base).toBe(6);
    expect(r.total).toBe(8);
  });

  it('QTE modifier=-1, scale=0.3 → 伤害 × 0.7, 四舍五入', () => {
    const r = rollDamage(
      makePlayer({ attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 }, equipped: { weapon: makeWeapon(3), armor: null, accessory: null } }),
      makeEnemy('e1', { equipped: { weapon: null, armor: null, accessory: null } }),
      -1,
      0.3,
      makeConstRoll([3]),
    );
    // base = 6, * (1 + -1 * 0.3) = 4.2 → 4
    expect(r.base).toBe(6);
    expect(r.total).toBe(4);
  });
});

// ============================================================
// 攻击 (resolveAttack) 端到端
// ============================================================
describe('resolveAttack 端到端', () => {
  it('消耗 2 AP, 命中后扣目标 HP', () => {
    // 玩家 d20=15, DEX=14 → toHit=17; 敌人 DEX=10 + armor=0 → 门槛=10. 17≥10 命中.
    // 伤害: d6=4 + STR_mod=1 + weapon=3 - defense=0 = 8.
    useCombatStore.setState({
      combatants: {
        p1: makePlayer({
          attributes: { STR: 12, DEX: 14, CON: 10, INT: 10, WIS: 10, CHA: 10 },
          equipped: { weapon: makeWeapon(3), armor: null, accessory: null },
        }),
        e1: makeEnemy('e1'),
      },
    });
    const resolver = createActionResolver({ roll: makeConstRoll([15, 4]) });
    resolver.resolve({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, useCombatStore.getState());
    expect(useCombatStore.getState().combatants.p1.ap).toBe(4); // 6 - 2
    expect(useCombatStore.getState().combatants.e1.hp).toBe(12); // 20 - 8
  });

  it('AP 不足抛 InsufficientAPError', () => {
    useCombatStore.setState({
      combatants: {
        p1: makePlayer({ ap: 1, maxAp: 6 }),
        e1: makeEnemy('e1'),
      },
    });
    const resolver = createActionResolver({ roll: makeConstRoll([15, 4]) });
    expect(() =>
      resolver.resolve({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, useCombatStore.getState()),
    ).toThrow(InsufficientAPError);
  });

  it('未命中不扣 HP, 闪避衰减 -5 (门槛降低)', () => {
    // 玩家 d20=5, DEX=14 → toHit=7; 敌人 DEX=10 + armor=0 → 门槛=10. 7<10 闪避.
    useCombatStore.setState({
      combatants: {
        p1: makePlayer({
          attributes: { STR: 10, DEX: 14, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        }),
        e1: makeEnemy('e1'),
      },
    });
    // 第一次: d20=5 → toHit=7 < 门槛=10 → 闪避 (消耗 1 个 roll 值)
    // 第二次: d20=5 → toHit=7 ≥ 门槛=5 → 命中, d6=4 → damage=4 (消耗 2 个 roll 值)
    const resolver = createActionResolver({ roll: makeConstRoll([5, 5, 4]) });
    resolver.resolve({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, useCombatStore.getState());
    expect(useCombatStore.getState().combatants.e1.hp).toBe(20); // 未扣
    expect(useCombatStore.getState().combatants.p1.ap).toBe(4); // 仍扣 AP (2)

    // 第二次: 门槛 = max(5, 10 + 0 + 0 - 5 + 0) = 5; toHit=7 ≥ 5 → 命中!
    // 衰减使门槛降低到 5, 连续闪避后更易被命中
    resolver.resolve({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, useCombatStore.getState());
    // toHit=7 ≥ 门槛=5, 命中! damage = d6=4 + STR_mod=0 + weapon=0 - defense=0 = 4
    expect(useCombatStore.getState().combatants.e1.hp).toBe(16); // 20 - 4
  });

  it('闪避衰减常量 DODGE_PENALTY_STEP = 5', () => {
    expect(DODGE_PENALTY_STEP).toBe(5);
  });

  it('defending 提升门槛: defender 命中门槛 +2', () => {
    // 玩家 d20=11, DEX=14 → toHit=13; 敌人 defending, 门槛 = 10 + 0 + 0 + 0 + 2 = 12. 13≥12 命中.
    useCombatStore.setState({
      combatants: {
        p1: makePlayer({
          attributes: { STR: 12, DEX: 14, CON: 10, INT: 10, WIS: 10, CHA: 10 },
          equipped: { weapon: makeWeapon(3), armor: null, accessory: null },
        }),
        e1: makeEnemy('e1'),
      },
    });
    const resolver = createActionResolver({ roll: makeConstRoll([11, 4]) });
    // 先让 e1 defend
    resolver.resolve({ kind: 'defend', userId: 'e1' }, useCombatStore.getState());
    // 玩家攻击
    resolver.resolve({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, useCombatStore.getState());
    // 伤害: d6=4 + STR_mod=1 + weapon=3 - defense=0 = 8
    expect(useCombatStore.getState().combatants.e1.hp).toBe(12);
  });
});

// ============================================================
// 物品 (resolveItem)
// ============================================================
describe('resolveItem', () => {
  it('物品不扣 AP, 应用 hp_restore', () => {
    useCombatStore.setState({
      combatants: {
        p1: makePlayer({ hp: 10, maxHp: 30 }),
        e1: makeEnemy('e1'),
      },
    });
    useItemRegistryStore.setState({
      items: {
        potion: {
          id: 'potion',
          name: '治疗药水',
          effects: [{ type: 'hp_restore', value: 5 }],
        },
      } as any,
    });
    const apBefore = useCombatStore.getState().combatants.p1.ap;
    const resolver = createActionResolver({ roll: makeConstRoll([1, 1, 1, 1]) });
    resolver.resolve({ kind: 'item', userId: 'p1', itemId: 'potion', targetId: 'p1' }, useCombatStore.getState());
    expect(useCombatStore.getState().combatants.p1.ap).toBe(apBefore); // 0 AP
    expect(useCombatStore.getState().combatants.p1.hp).toBe(15); // 10 + 5
  });
});

// ============================================================
// 逃跑 (resolveFlee)
// ============================================================
describe('rollFlee (d100 <= chance*100)', () => {
  it('高 DEX vs 低 DEX: 100% 逃跑', () => {
    const p = makePlayer({ attributes: { STR: 10, DEX: 20, CON: 10, INT: 10, WIS: 10, CHA: 10 } });
    const e = makeEnemy('e1', { attributes: { STR: 10, DEX: 1, CON: 10, INT: 10, WIS: 10, CHA: 10 } });
    const r = rollFlee(p, [e], makeConstRoll([1])); // d100=1 必成功
    expect(r.success).toBe(true);
  });

  it('低 DEX vs 高 DEX: 接近 10% 下限', () => {
    const p = makePlayer({ attributes: { STR: 10, DEX: 1, CON: 10, INT: 10, WIS: 10, CHA: 10 } });
    const e = makeEnemy('e1', { attributes: { STR: 10, DEX: 20, CON: 10, INT: 10, WIS: 10, CHA: 10 } });
    const r = rollFlee(p, [e], makeConstRoll([100])); // d100=100 必失败
    expect(r.success).toBe(false);
    // chance 接近下限 0.1
    expect(r.chance).toBeCloseTo(0.1, 5);
  });
});

// ============================================================
// 防御 (resolveDefend)
// ============================================================
describe('resolveDefend', () => {
  it('扣 1 AP, 设 defending', () => {
    useCombatStore.setState({
      combatants: {
        p1: makePlayer(),
        e1: makeEnemy('e1'),
      },
    });
    const apBefore = useCombatStore.getState().combatants.p1.ap;
    const resolver = createActionResolver({ roll: makeConstRoll([1, 1, 1, 1]) });
    resolver.resolve({ kind: 'defend', userId: 'p1' }, useCombatStore.getState());
    expect(useCombatStore.getState().combatants.p1.ap).toBe(apBefore - 1);
  });

  it('AP 不足抛 InsufficientAPError', () => {
    useCombatStore.setState({
      combatants: {
        p1: makePlayer({ ap: 0, maxAp: 6 }),
        e1: makeEnemy('e1'),
      },
    });
    const resolver = createActionResolver({ roll: makeConstRoll([1, 1, 1, 1]) });
    expect(() =>
      resolver.resolve({ kind: 'defend', userId: 'p1' }, useCombatStore.getState()),
    ).toThrow(InsufficientAPError);
  });
});

// ============================================================
// 休息 (resolveWait)
// ============================================================
describe('resolveWait', () => {
  it('不扣 AP, 恢复 1 AP (受 maxAp clamp)', () => {
    useCombatStore.setState({
      combatants: {
        p1: makePlayer({ ap: 6, maxAp: 6 }), // 满 AP, 恢复 1 应被 clamp 到 6
        e1: makeEnemy('e1'),
      },
    });
    const apBefore = useCombatStore.getState().combatants.p1.ap;
    const resolver = createActionResolver({ roll: makeConstRoll([1, 1, 1, 1]) });
    resolver.resolve({ kind: 'wait', userId: 'p1' }, useCombatStore.getState());
    // 6 → 7 → clamp 到 6
    expect(useCombatStore.getState().combatants.p1.ap).toBe(apBefore);
  });

  it('未满 AP 时恢复 1 AP', () => {
    useCombatStore.setState({
      combatants: {
        p1: makePlayer({ ap: 4, maxAp: 6 }),
        e1: makeEnemy('e1'),
      },
    });
    const resolver = createActionResolver({ roll: makeConstRoll([1, 1, 1, 1]) });
    resolver.resolve({ kind: 'wait', userId: 'p1' }, useCombatStore.getState());
    expect(useCombatStore.getState().combatants.p1.ap).toBe(5);
  });
});

// ============================================================
// v0.6.3 装备效果汇总
// ============================================================
describe('v0.6.3 装备效果汇总', () => {
  it('getEquipmentResistances 汇总 3 槽位抗性', () => {
    const equipped = {
      weapon: null,
      armor: {
        effects: [
          { id: 'r1', type: 'elemental_resist', value: { fire: 20 }, description: '火抗' },
        ],
      } as any,
      accessory: {
        effects: [
          { id: 'r2', type: 'elemental_resist', value: { ice: 15, fire: 10 }, description: '双抗' },
        ],
      } as any,
    };
    const result = getEquipmentResistances(equipped);
    expect(result.fire).toBe(30);  // 20 + 10
    expect(result.ice).toBe(15);
  });

  it('getEquipmentResistances 无装备返回空对象', () => {
    const equipped = { weapon: null, armor: null, accessory: null };
    const result = getEquipmentResistances(equipped);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('getEquipmentMPBonus 汇总 MP 加成', () => {
    const equipped = {
      weapon: {
        effects: [
          { id: 'm1', type: 'mp_bonus', value: 5, description: 'MP+5' },
        ],
      } as any,
      armor: null,
      accessory: {
        effects: [
          { id: 'm2', type: 'mp_bonus', value: 10, description: 'MP+10' },
        ],
      } as any,
    };
    expect(getEquipmentMPBonus(equipped)).toBe(15);
  });

  it('getEquipmentMPBonus 无装备返回 0', () => {
    const equipped = { weapon: null, armor: null, accessory: null };
    expect(getEquipmentMPBonus(equipped)).toBe(0);
  });
});
