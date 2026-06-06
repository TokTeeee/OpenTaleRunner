import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createActionResolver,
  InsufficientAPError,
  InsufficientMPError,
  UnknownItemError,
  ACTION_COSTS,
  getWeaponDamage,
  getArmorDefense,
  getAttributeMods,
  getEquipmentAttributeMods,
  effectiveAttribute,
  computeAC,
  rollToHit,
  rollDodge,
  rollDamage,
  checkDodge,
  fleeChance,
  rollFlee,
  noopQTEProvider,
  type QTEProvider,
} from '../../../src/services/combat/ActionResolver';
import { useCombatStore, INITIAL_COMBAT_STATE } from '../../../src/stores/combatStore';
import { useSettingsStore } from '../../../src/stores/settingsStore';
import { useItemRegistryStore } from '../../../src/stores/itemRegistryStore';
import { makeConstRoll, makeSeededRoll } from '../../../src/services/combat/dice';
import type { Combatant, Item } from '../../../src/types/character';
import type { ItemEffect } from '../../../src/types/item';
import { resetClientStores } from '../../utils/resetStores';

function makePlayer(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: 'p1',
    side: 'player',
    name: '玩家',
    attributes: { STR: 10, DEX: 12, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: 24, maxHp: 24,
    ap: 6, maxAp: 6,
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
    name: `敌人 ${id}`,
    attributes: { STR: 8, DEX: 10, CON: 10, INT: 6, WIS: 8, CHA: 6 },
    hp: 12, maxHp: 12,
    ap: 4, maxAp: 4,
    conditions: [],
    isDead: false,
    isFleeing: false,
    equipped: { weapon: null, armor: null, accessory: null },
    ...overrides,
  };
}

function makeWeapon(damage: number): Item {
  return {
    id: 'w1', name: '匕首', slot: 'weapon', rarity: 'common', tags: ['weapon'], description: '', value: 0,
    effects: [{ type: 'damage_bonus', value: damage, description: '+damage' }] as ItemEffect[],
  };
}

function makeArmor(defense: number): Item {
  return {
    id: 'a1', name: '皮甲', slot: 'armor', rarity: 'common', tags: ['armor'], description: '', value: 0,
    effects: [{ type: 'defense_bonus', value: defense, description: '+def' }] as ItemEffect[],
  };
}

function makeAccessory(attrs: Partial<Record<'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA', number>>): Item {
  return {
    id: 'acc1', name: '戒指', slot: 'accessory', rarity: 'common', tags: ['accessory'], description: '', value: 0,
    effects: [{ type: 'attribute_mod', value: attrs, description: '+attr' }] as ItemEffect[],
  };
}

describe('ActionResolver: 装备效果提取', () => {
  it('getWeaponDamage: 找到 damage_bonus 数值', () => {
    expect(getWeaponDamage(makeWeapon(4))).toBe(4);
    expect(getWeaponDamage(makeWeapon(8))).toBe(8);
  });

  it('getWeaponDamage: 无 weapon 返回 0', () => {
    expect(getWeaponDamage(null)).toBe(0);
    expect(getWeaponDamage(undefined)).toBe(0);
    expect(getWeaponDamage({})).toBe(0);
  });

  it('getWeaponDamage: 没有 damage_bonus 返回 0', () => {
    const item: Item = { id: 'x', name: 'x', slot: 'weapon', rarity: 'common', tags: [], description: '', value: 0, effects: [] };
    expect(getWeaponDamage(item)).toBe(0);
  });

  it('getArmorDefense: 同 getWeaponDamage', () => {
    expect(getArmorDefense(makeArmor(2))).toBe(2);
    expect(getArmorDefense(null)).toBe(0);
  });

  it('getAttributeMods: 解析 attribute_mod 记录', () => {
    const m = getAttributeMods(makeAccessory({ STR: 2, DEX: 1 }));
    expect(m.STR).toBe(2);
    expect(m.DEX).toBe(1);
    expect(m.CON).toBe(0);
  });

  it('getAttributeMods: 无效 value 时返回 0 全集', () => {
    const item: Item = { id: 'x', name: 'x', slot: 'accessory', rarity: 'common', tags: [], description: '', value: 0, effects: [{ type: 'attribute_mod', value: 'invalid' as unknown as number, description: '' }] };
    expect(getAttributeMods(item).STR).toBe(0);
  });

  it('getEquipmentAttributeMods: 3 槽聚合', () => {
    const equipped = {
      weapon: makeWeapon(4),
      armor: makeArmor(2),
      accessory: makeAccessory({ STR: 1, DEX: 2 }),
    } as unknown as Combatant['equipped'];
    const m = getEquipmentAttributeMods(equipped);
    expect(m.STR).toBe(1);
    expect(m.DEX).toBe(2);
  });
});

describe('ActionResolver: 6 维公式 - effectiveAttribute', () => {
  it('基线 = attributes + 0', () => {
    const c = makePlayer();
    expect(effectiveAttribute(c, 'STR')).toBe(10);
    expect(effectiveAttribute(c, 'DEX')).toBe(12);
  });

  it('加 buff modifier', () => {
    const c = makePlayer({
      conditions: [{ ref: 'STR_up', stacks: 1, remainingTurns: 3, source: 'item', appliedAtTurn: 1, modifiers: { STR: 3 } }],
    });
    expect(effectiveAttribute(c, 'STR')).toBe(13);
  });

  it('buff modifier 可负 (减益)', () => {
    const c = makePlayer({
      conditions: [{ ref: 'wounded', stacks: 1, remainingTurns: 3, source: 'a', appliedAtTurn: 1, modifiers: { STR: -2 } }],
    });
    expect(effectiveAttribute(c, 'STR')).toBe(8);
  });

  it('加 equipment modifier', () => {
    const c = makePlayer({
      equipped: {
        weapon: null,
        armor: null,
        accessory: makeAccessory({ DEX: 2 }),
      } as unknown as Combatant['equipped'],
    });
    expect(effectiveAttribute(c, 'DEX')).toBe(14);
  });

  it('buff + equipment 同时生效', () => {
    const c = makePlayer({
      conditions: [{ ref: 'STR_up', stacks: 1, remainingTurns: 3, source: 'a', appliedAtTurn: 1, modifiers: { STR: 2 } }],
      equipped: {
        weapon: null,
        armor: null,
        accessory: makeAccessory({ STR: 1 }),
      } as unknown as Combatant['equipped'],
    });
    expect(effectiveAttribute(c, 'STR')).toBe(13); // 10 + 2 + 1
  });
});

describe('ActionResolver: 6 维公式 - 命中 / 闪避 / 伤害', () => {
  describe('rollToHit', () => {
    it('总命中 = 2d6 + STR_mod + weapon/2', () => {
      const c = makePlayer({ equipped: { weapon: makeWeapon(4), armor: null, accessory: null } as unknown as Combatant['equipped'] });
      const r = rollToHit(c, makeConstRoll([5, 4]));
      // STR 10 → 0, weapon 4 → 2 → 5+4+0+2 = 11
      expect(r.total).toBe(11);
    });

    it('STR 14 → +2 修正', () => {
      const c = makePlayer({ attributes: { ...makePlayer().attributes, STR: 14 } });
      const r = rollToHit(c, makeConstRoll([3, 3]));
      // 3+3+2+0 = 8
      expect(r.total).toBe(8);
    });

    it('STR 8 → -1 修正', () => {
      const c = makePlayer({ attributes: { ...makePlayer().attributes, STR: 8 } });
      const r = rollToHit(c, makeConstRoll([3, 3]));
      // 3+3-1+0 = 5
      expect(r.total).toBe(5);
    });
  });

  describe('rollDodge', () => {
    it('总闪避 = 2d6 + DEX_mod + AC', () => {
      const c = makeEnemy('e1');
      // DEX 10 → 0, AC = 10 + 0 + 0 = 10
      const r = rollDodge(c, false, makeConstRoll([4, 5]));
      expect(r.total).toBe(19);
    });

    it('DEX 14 → +2 修正', () => {
      const c = makeEnemy('e1', { attributes: { ...makeEnemy('e1').attributes, DEX: 14 } });
      const r = rollDodge(c, false, makeConstRoll([3, 3]));
      // 3+3+2+10 = 18
      expect(r.total).toBe(18);
    });

    it('defending 时 AC +2', () => {
      const c = makeEnemy('e1');
      const r = rollDodge(c, true, makeConstRoll([3, 3]));
      // 3+3+0+12 = 18
      expect(r.total).toBe(18);
    });

    it('armor defense 计入 AC', () => {
      const c = makeEnemy('e1', { equipped: { weapon: null, armor: makeArmor(3), accessory: null } as unknown as Combatant['equipped'] });
      const r = rollDodge(c, false, makeConstRoll([3, 3]));
      // 3+3+0+(10+3) = 19
      expect(r.total).toBe(19);
    });
  });

  describe('checkDodge', () => {
    it('闪避 > 命中: true (闪避成功)', () => {
      expect(checkDodge(10, 12)).toBe(true);
    });
    it('闪避 < 命中: false (命中)', () => {
      expect(checkDodge(10, 8)).toBe(false);
    });
    it('闪避 == 命中: false (平局命中)', () => {
      expect(checkDodge(10, 10)).toBe(false);
    });
  });

  describe('rollDamage', () => {
    it('base = max(1, weapon + STR_mod), qte=0 → base', () => {
      const c = makePlayer({ equipped: { weapon: makeWeapon(4), armor: null, accessory: null } as unknown as Combatant['equipped'] });
      // STR 10 → 0, base = 4+0 = 4, qte=0
      expect(rollDamage(c, 0, 0.3, makeConstRoll([10]))).toBe(4);
    });

    it('qte=+1, scale=0.3 → base * 1.3', () => {
      const c = makePlayer({ equipped: { weapon: makeWeapon(4), armor: null, accessory: null } as unknown as Combatant['equipped'] });
      expect(rollDamage(c, 1, 0.3, makeConstRoll([10]))).toBe(5); // 4*1.3 = 5.2 → 5
    });

    it('qte=-1, scale=0.3 → base * 0.7', () => {
      const c = makePlayer({ equipped: { weapon: makeWeapon(4), armor: null, accessory: null } as unknown as Combatant['equipped'] });
      expect(rollDamage(c, -1, 0.3, makeConstRoll([10]))).toBe(3); // 4*0.7 = 2.8 → 3
    });

    it('STR 14 → +2 加成', () => {
      const c = makePlayer({ attributes: { ...makePlayer().attributes, STR: 14 } });
      // base = 0+2 = 2
      expect(rollDamage(c, 0, 0.3, makeConstRoll([10]))).toBe(2);
    });

    it('无武器 + 低 STR 时 base clamp 到 1', () => {
      const c = makePlayer({ attributes: { ...makePlayer().attributes, STR: 6 } });
      // 0 + (-2) = -2, clamp 到 1
      expect(rollDamage(c, 0, 0.3, makeConstRoll([10]))).toBe(1);
    });
  });

  describe('computeAC', () => {
    it('10 + DEX mod', () => {
      expect(computeAC(makePlayer(), false)).toBe(11); // DEX 12 → +1
    });
    it('defending 时 +2', () => {
      expect(computeAC(makePlayer(), true)).toBe(13);
    });
    it('armor 计入', () => {
      const c = makePlayer({ equipped: { weapon: null, armor: makeArmor(2), accessory: null } as unknown as Combatant['equipped'] });
      expect(computeAC(c, false)).toBe(13); // 10+1+2
    });
  });
});

describe('ActionResolver: 逃跑公式', () => {
  it('fleeChance: 玩家 DEX = 敌人 DEX 平均 → 0.3', () => {
    const p = makePlayer({ attributes: { ...makePlayer().attributes, DEX: 10 } });
    const e = makeEnemy('e1', { attributes: { ...makeEnemy('e1').attributes, DEX: 10 } });
    expect(fleeChance(p, [e])).toBe(0.3);
  });

  it('fleeChance: 玩家 DEX 高 4 → +0.2', () => {
    const p = makePlayer({ attributes: { ...makePlayer().attributes, DEX: 14 } });
    const e = makeEnemy('e1', { attributes: { ...makeEnemy('e1').attributes, DEX: 10 } });
    expect(fleeChance(p, [e])).toBe(0.5);
  });

  it('fleeChance: clamp 到 [0.1, 0.9]', () => {
    const p = makePlayer({ attributes: { ...makePlayer().attributes, DEX: 1 } });
    const e = makeEnemy('e1', { attributes: { ...makeEnemy('e1').attributes, DEX: 20 } });
    // 0.3 + (1-20)/20 = 0.3 - 0.95 = -0.65 → 0.1
    expect(fleeChance(p, [e])).toBe(0.1);
  });

  it('fleeChance: 高 DEX 时也 clamp 到 0.9', () => {
    const p = makePlayer({ attributes: { ...makePlayer().attributes, DEX: 20 } });
    const e = makeEnemy('e1', { attributes: { ...makeEnemy('e1').attributes, DEX: 1 } });
    // 0.3 + 19/20 = 1.25 → 0.9
    expect(fleeChance(p, [e])).toBe(0.9);
  });

  it('fleeChance: 无敌人 → 0.9', () => {
    const p = makePlayer();
    expect(fleeChance(p, [])).toBe(0.9);
  });

  it('fleeChance: 多敌人取 DEX 平均', () => {
    const p = makePlayer({ attributes: { ...makePlayer().attributes, DEX: 14 } });
    const e1 = makeEnemy('e1', { attributes: { ...makeEnemy('e1').attributes, DEX: 8 } });
    const e2 = makeEnemy('e2', { attributes: { ...makeEnemy('e2').attributes, DEX: 12 } });
    // avg = 10, player 14, diff = 4, 0.3 + 0.2 = 0.5
    expect(fleeChance(p, [e1, e2])).toBe(0.5);
  });

  it('rollFlee: 1d100 <= chance 算成功', () => {
    const p = makePlayer({ attributes: { ...makePlayer().attributes, DEX: 14 } });
    const e = makeEnemy('e1', { attributes: { ...makeEnemy('e1').attributes, DEX: 10 } });
    // chance = 0.5, 投 30 <= 50 算成功
    const r = rollFlee(p, [e], makeConstRoll([30]));
    expect(r.chance).toBe(0.5);
    expect(r.d100).toBe(30);
    expect(r.success).toBe(true);
  });

  it('rollFlee: 1d100 > chance 算失败', () => {
    const p = makePlayer({ attributes: { ...makePlayer().attributes, DEX: 14 } });
    const e = makeEnemy('e1', { attributes: { ...makeEnemy('e1').attributes, DEX: 10 } });
    const r = rollFlee(p, [e], makeConstRoll([60]));
    expect(r.success).toBe(false);
  });
});

describe('ActionResolver: 6 种动作 resolve', () => {
  beforeEach(() => {
    resetClientStores();
    // 重置 settingsStore.qte
    useSettingsStore.setState((s) => ({ qte: { ...s.qte, enabled: false } }));
    useCombatStore.setState({
      ...INITIAL_COMBAT_STATE,
      phase: 'active',
      round: 1,
      turn: 1,
      combatants: {
        p1: makePlayer(),
        e1: makeEnemy('e1'),
      },
    });
  });
  afterEach(() => resetClientStores());

  describe('attack', () => {
    it('命中 + 造成伤害 (2d6 高 + 1d6 闪避低)', () => {
      // 玩家无武器, toHit = 6+6+0+0 = 12; 敌人 DEX 12 → AC 11, dodge = 1+1+11 = 13 → 闪避成功
      useCombatStore.setState({
        combatants: {
          p1: makePlayer(),
          e1: makeEnemy('e1', { attributes: { ...makeEnemy('e1').attributes, DEX: 12 } }),
        },
      });
      const resolver = createActionResolver({ roll: makeConstRoll([6, 6, 1, 1]) });
      const result = resolver.resolve({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, useCombatStore.getState());
      expect(result.log.length).toBeGreaterThan(0);
      // 这次闪避成功
      const e1 = useCombatStore.getState().combatants.e1;
      expect(e1.hp).toBe(12); // 未受伤
    });

    it('命中 (toHit > dodge) → 伤害', () => {
      // 玩家高武器, 敌人无 armor + DEX 10, toHit=16 > dodge=12 → 命中, 伤害 8
      useCombatStore.setState({
        combatants: {
          p1: makePlayer({ equipped: { weapon: makeWeapon(8), armor: null, accessory: null } as unknown as Combatant['equipped'] }),
          e1: makeEnemy('e1', { equipped: { weapon: null, armor: makeArmor(0), accessory: null } as unknown as Combatant['equipped'] }),
        },
      });
      const resolver = createActionResolver({ roll: makeConstRoll([6, 6, 1, 1]) });
      const result = resolver.resolve({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, useCombatStore.getState());
      const e1 = useCombatStore.getState().combatants.e1;
      expect(e1.hp).toBe(4); // 12 - 8
      expect(result.log.some((l) => l.message.includes('命中'))).toBe(true);
    });

    it('未命中: AP 仍扣 (cost 2)', () => {
      useCombatStore.setState({
        combatants: {
          p1: makePlayer({ attributes: { ...makePlayer().attributes, STR: 6, DEX: 6 } }),
          e1: makeEnemy('e1', { attributes: { ...makeEnemy('e1').attributes, DEX: 18 } }),
        },
      });
      // 命中 6+6-2+0=10, 闪避 1+1+4+10=16 → 闪避成功
      const resolver = createActionResolver({ roll: makeConstRoll([6, 6, 1, 1]) });
      const apBefore = useCombatStore.getState().combatants.p1.ap;
      resolver.resolve({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, useCombatStore.getState());
      expect(useCombatStore.getState().combatants.p1.ap).toBe(apBefore - 2);
    });

    it('AP 不足抛 InsufficientAPError', () => {
      useCombatStore.setState({
        combatants: { p1: makePlayer({ ap: 1 }), e1: makeEnemy('e1') },
      });
      const resolver = createActionResolver({ roll: makeConstRoll([1, 1, 1, 1]) });
      expect(() => resolver.resolve({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, useCombatStore.getState())).toThrow(InsufficientAPError);
    });

    it('未知攻击者返回空 log, 不抛错', () => {
      const resolver = createActionResolver({ roll: makeConstRoll([1, 1, 1, 1]) });
      const result = resolver.resolve({ kind: 'attack', attackerId: 'ghost', targetId: 'e1' }, useCombatStore.getState());
      expect(result.log.some((l) => l.message.includes('未知'))).toBe(true);
    });

    it('攻击者已死亡返回无效 log', () => {
      useCombatStore.setState({
        combatants: {
          p1: { ...makePlayer(), isDead: true, hp: 0 },
          e1: makeEnemy('e1'),
        },
      });
      const resolver = createActionResolver({ roll: makeConstRoll([1, 1, 1, 1]) });
      const result = resolver.resolve({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, useCombatStore.getState());
      expect(result.log.some((l) => l.message.includes('无效'))).toBe(true);
    });
  });

  describe('skill', () => {
    it('正常施放扣 AP', () => {
      const resolver = createActionResolver({ roll: makeConstRoll([6, 6, 1, 1]) });
      useCombatStore.setState({
        combatants: {
          p1: makePlayer({ equipped: { weapon: makeWeapon(8), armor: null, accessory: null } as unknown as Combatant['equipped'] }),
          e1: makeEnemy('e1', { equipped: { weapon: null, armor: makeArmor(0), accessory: null } as unknown as Combatant['equipped'] }),
        },
      });
      const apBefore = useCombatStore.getState().combatants.p1.ap;
      resolver.resolve({ kind: 'skill', userId: 'p1', skillId: 'fireball', targetId: 'e1', cost: { ap: 1, mp: 0 } }, useCombatStore.getState());
      expect(useCombatStore.getState().combatants.p1.ap).toBe(apBefore - 1);
    });

    it('MP 不足抛 InsufficientMPError', () => {
      useCombatStore.setState({
        combatants: { p1: makePlayer({ mp: 0, maxMp: 20 }), e1: makeEnemy('e1') },
      });
      const resolver = createActionResolver({ roll: makeConstRoll([1, 1, 1, 1]) });
      expect(() => resolver.resolve({ kind: 'skill', userId: 'p1', skillId: 'fireball', targetId: 'e1', cost: { ap: 1, mp: 5 } }, useCombatStore.getState())).toThrow(InsufficientMPError);
    });
  });

  describe('item', () => {
    let potionId: string;
    beforeEach(() => {
      // register 自动生成 itemId (覆盖 input.itemId), 需读返回值取真实 id
      potionId = useItemRegistryStore.getState().register({
        name: '治疗药水',
        category: 'consumable',
        quality: '普通',
        effects: [{ id: 'e1', type: 'hp_restore', value: 5, description: '恢复 5 HP' }],
        value: 10,
        spawnInfo: { worldDay: 1, region: 'start', source: 'loot' },
        holder: { kind: 'character', refId: 'p1' },
      }).itemId;
    });

    it('使用 hp_restore 物品: target.hp += 5, 扣 0 AP', () => {
      useCombatStore.setState({
        combatants: {
          p1: makePlayer({ hp: 5, maxHp: 20 }),
          e1: makeEnemy('e1'),
        },
      });
      const resolver = createActionResolver({ roll: makeConstRoll([1, 1, 1, 1]) });
      const apBefore = useCombatStore.getState().combatants.p1.ap;
      const result = resolver.resolve({ kind: 'item', userId: 'p1', itemId: potionId, targetId: 'p1' }, useCombatStore.getState());
      expect(useCombatStore.getState().combatants.p1.ap).toBe(apBefore);
      // HP +5 (clamp 到 maxHp)
      expect(useCombatStore.getState().combatants.p1.hp).toBe(10);
      // log 含恢复
      expect(result.log.some((l) => l.message.includes('恢复 5'))).toBe(true);
    });

    it('未注册的 itemId 抛 UnknownItemError', () => {
      useCombatStore.setState({ combatants: { p1: makePlayer(), e1: makeEnemy('e1') } });
      const resolver = createActionResolver({ roll: makeConstRoll([1, 1]) });
      expect(() => resolver.resolve({ kind: 'item', userId: 'p1', itemId: 'unknown_xyz', targetId: 'p1' }, useCombatStore.getState())).toThrow(UnknownItemError);
    });
  });

  describe('flee', () => {
    it('逃跑成功: 标记 isFleeing=true', () => {
      // 玩家 DEX 14 vs 敌人 10, chance = 0.5, 投 30 成功
      useCombatStore.setState({
        combatants: {
          p1: makePlayer({ attributes: { ...makePlayer().attributes, DEX: 14 } }),
          e1: makeEnemy('e1', { attributes: { ...makeEnemy('e1').attributes, DEX: 10 } }),
        },
      });
      const resolver = createActionResolver({ roll: makeConstRoll([30]) });
      resolver.resolve({ kind: 'flee', userId: 'p1' }, useCombatStore.getState());
      expect(useCombatStore.getState().combatants.p1.isFleeing).toBe(true);
    });

    it('逃跑失败: isFleeing 保持 false', () => {
      useCombatStore.setState({
        combatants: {
          p1: makePlayer({ attributes: { ...makePlayer().attributes, DEX: 14 } }),
          e1: makeEnemy('e1', { attributes: { ...makeEnemy('e1').attributes, DEX: 10 } }),
        },
      });
      const resolver = createActionResolver({ roll: makeConstRoll([60]) });
      resolver.resolve({ kind: 'flee', userId: 'p1' }, useCombatStore.getState());
      expect(useCombatStore.getState().combatants.p1.isFleeing).toBe(false);
    });

    it('扣 0 AP', () => {
      const resolver = createActionResolver({ roll: makeConstRoll([30]) });
      const apBefore = useCombatStore.getState().combatants.p1.ap;
      resolver.resolve({ kind: 'flee', userId: 'p1' }, useCombatStore.getState());
      expect(useCombatStore.getState().combatants.p1.ap).toBe(apBefore);
    });
  });

  describe('defend', () => {
    it('扣 1 AP', () => {
      const resolver = createActionResolver({ roll: makeConstRoll([1, 1, 1, 1]) });
      const apBefore = useCombatStore.getState().combatants.p1.ap;
      resolver.resolve({ kind: 'defend', userId: 'p1' }, useCombatStore.getState());
      expect(useCombatStore.getState().combatants.p1.ap).toBe(apBefore - 1);
    });

    it('设 defending 标志 (影响下次 rollDodge)', () => {
      const resolver = createActionResolver({ roll: makeConstRoll([1, 1, 1, 1]) });
      resolver.resolve({ kind: 'defend', userId: 'p1' }, useCombatStore.getState());
      // 验证: 下次攻击玩家时, rollDodge 用 defending=true
      const r = rollDodge(useCombatStore.getState().combatants.p1, true, makeConstRoll([1, 1]));
      // DEX 12 + AC 10+1+2 = 13
      expect(r.ac).toBe(13);
    });

    it('AP 不足抛 InsufficientAPError', () => {
      useCombatStore.setState({ combatants: { p1: makePlayer({ ap: 0 }), e1: makeEnemy('e1') } });
      const resolver = createActionResolver({ roll: makeConstRoll([1, 1, 1, 1]) });
      expect(() => resolver.resolve({ kind: 'defend', userId: 'p1' }, useCombatStore.getState())).toThrow(InsufficientAPError);
    });
  });

  describe('wait', () => {
    it('不扣 AP', () => {
      const resolver = createActionResolver({ roll: makeConstRoll([1, 1, 1, 1]) });
      const apBefore = useCombatStore.getState().combatants.p1.ap;
      resolver.resolve({ kind: 'wait', userId: 'p1' }, useCombatStore.getState());
      expect(useCombatStore.getState().combatants.p1.ap).toBe(apBefore);
    });
  });
});

describe('ActionResolver: QTE 集成', () => {
  beforeEach(() => {
    resetClientStores();
    useSettingsStore.setState((s) => ({ qte: { ...s.qte, enabled: false } }));
    useCombatStore.setState({
      ...INITIAL_COMBAT_STATE,
      phase: 'active',
      combatants: {
        p1: makePlayer({ equipped: { weapon: makeWeapon(8), armor: null, accessory: null } as unknown as Combatant['equipped'] }),
        e1: makeEnemy('e1', { equipped: { weapon: null, armor: makeArmor(0), accessory: null } as unknown as Combatant['equipped'] }),
      },
    });
  });

  it('QTE 关闭 (默认): modifier=0, damage = base', () => {
    const resolver = createActionResolver({ roll: makeConstRoll([6, 6, 1, 1]) });
    const hpBefore = useCombatStore.getState().combatants.e1.hp;
    resolver.resolve({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, useCombatStore.getState());
    const dmg = hpBefore - useCombatStore.getState().combatants.e1.hp;
    expect(dmg).toBe(8); // base 8 (无 QTE modifier)
  });

  it('QTE 开启 + modifier=+1: damage × 1.3', () => {
    const qte: QTEProvider = () => ({ accuracy: 1, modifier: 1, type: 'attack' });
    const resolver = createActionResolver({ roll: makeConstRoll([6, 6, 1, 1]), qte });
    const hpBefore = useCombatStore.getState().combatants.e1.hp;
    resolver.resolve({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, useCombatStore.getState());
    const dmg = hpBefore - useCombatStore.getState().combatants.e1.hp;
    // 8 * 1.3 = 10.4 → 10
    expect(dmg).toBe(10);
  });

  it('QTE 开启 + modifier=-1: damage × 0.7', () => {
    const qte: QTEProvider = () => ({ accuracy: 0, modifier: -1, type: 'attack' });
    const resolver = createActionResolver({ roll: makeConstRoll([6, 6, 1, 1]), qte });
    const hpBefore = useCombatStore.getState().combatants.e1.hp;
    resolver.resolve({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, useCombatStore.getState());
    const dmg = hpBefore - useCombatStore.getState().combatants.e1.hp;
    // 8 * 0.7 = 5.6 → 6
    expect(dmg).toBe(6);
  });

  it('QTE 不影响命中判定 (只有伤害 modifier)', () => {
    // 即便 QTE modifier = -1, 命中投 6+6+0+4=16 vs 闪避 1+1+0+10=12, 仍命中
    const qte: QTEProvider = () => ({ accuracy: 0, modifier: -1, type: 'attack' });
    const resolver = createActionResolver({ roll: makeConstRoll([6, 6, 1, 1]), qte });
    resolver.resolve({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, useCombatStore.getState());
    expect(useCombatStore.getState().combatants.e1.hp).toBeLessThan(12);
  });

  it('noopQTEProvider: 返回 zero modifier', () => {
    const r = noopQTEProvider({ action: { kind: 'attack', attackerId: 'p1', targetId: 'e1' }, attacker: makePlayer(), target: makeEnemy('e1'), state: useCombatStore.getState() });
    expect(r.modifier).toBe(0);
    expect(r.accuracy).toBe(1);
    expect(r.type).toBe('none');
  });
});

describe('ActionResolver: ACTION_COSTS 配置', () => {
  it('attack 2 AP', () => expect(ACTION_COSTS.attack.ap).toBe(2));
  it('skill 1 AP (mp 由 action.cost 决定)', () => expect(ACTION_COSTS.skill.ap).toBe(1));
  it('item 0 AP', () => expect(ACTION_COSTS.item.ap).toBe(0));
  it('flee 0 AP', () => expect(ACTION_COSTS.flee.ap).toBe(0));
  it('defend 1 AP', () => expect(ACTION_COSTS.defend.ap).toBe(1));
  it('wait 0 AP', () => expect(ACTION_COSTS.wait.ap).toBe(0));
});

describe('ActionResolver: 防御标记 roundEnd 清', () => {
  it('clearDefendingFlags 清除所有 defending', () => {
    const resolver = createActionResolver({ roll: makeConstRoll([1, 1, 1, 1]) });
    useCombatStore.setState({
      ...INITIAL_COMBAT_STATE,
      phase: 'active',
      combatants: { p1: makePlayer(), e1: makeEnemy('e1') },
    });
    resolver.resolve({ kind: 'defend', userId: 'p1' }, useCombatStore.getState());
    // 现在 defending=true
    let r = rollDodge(useCombatStore.getState().combatants.p1, true, makeConstRoll([1, 1]));
    expect(r.ac).toBeGreaterThan(10);
    resolver.clearDefendingFlags();
    r = rollDodge(useCombatStore.getState().combatants.p1, false, makeConstRoll([1, 1]));
    expect(r.ac).toBe(11); // 不再 +2
  });
});

describe('ActionResolver: 种子化随机抹子跨调用可重现', () => {
  it('两个独立 resolver 用相同 seed 产生相同结果', () => {
    useCombatStore.setState({
      ...INITIAL_COMBAT_STATE,
      phase: 'active',
      combatants: {
        p1: makePlayer({ equipped: { weapon: makeWeapon(8), armor: null, accessory: null } as unknown as Combatant['equipped'] }),
        e1: makeEnemy('e1', { equipped: { weapon: null, armor: makeArmor(0), accessory: null } as unknown as Combatant['equipped'] }),
      },
    });
    const r1 = createActionResolver({ roll: makeSeededRoll(42) });
    const r2 = createActionResolver({ roll: makeSeededRoll(42) });
    r1.resolve({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, useCombatStore.getState());
    const hp1 = useCombatStore.getState().combatants.e1.hp;
    // reset
    useCombatStore.setState({ combatants: { ...useCombatStore.getState().combatants, e1: makeEnemy('e1', { equipped: { weapon: null, armor: makeArmor(0), accessory: null } as unknown as Combatant['equipped'] }) } });
    r2.resolve({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, useCombatStore.getState());
    const hp2 = useCombatStore.getState().combatants.e1.hp;
    expect(hp1).toBe(hp2);
  });
});
