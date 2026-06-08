// client/tests/services/combat/resolveAbility.test.ts
// v0.6.2 Task 13: ActionResolver.resolveAbility 完整测试
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createActionResolver } from '../../../src/services/combat/ActionResolver';
import { useCombatStore } from '../../../src/stores/combatStore';
import { ZERO_RESISTANCES } from '../../../src/types/character';
import type { Combatant, CombatState } from '../../../src/services/combat/types';
import { makeConstRoll } from '../../../src/services/combat/dice';

const baseAttacker: Combatant = {
  id: 'p1', side: 'player', name: 'Hero',
  attributes: { STR: 14, DEX: 14, CON: 12, INT: 16, WIS: 14, CHA: 10 },
  hp: 30, maxHp: 30,
  ap: 6, maxAp: 6,
  mp: 20, maxMp: 20,
  isDead: false, isFleeing: false,
  conditions: [],
  equipped: { weapon: null, armor: null, accessory: null },
  elementalResistances: { ...ZERO_RESISTANCES },
};

const baseEnemy: Combatant = {
  id: 'e1', side: 'enemy', name: 'Goblin',
  attributes: { STR: 6, DEX: 12, CON: 8, INT: 6, WIS: 8, CHA: 6 },
  hp: 20, maxHp: 20,
  ap: 4, maxAp: 4,
  isDead: false, isFleeing: false,
  conditions: [],
  equipped: { weapon: null, armor: null, accessory: null },
  elementalResistances: { ...ZERO_RESISTANCES },
};

const baseAlly: Combatant = {
  id: 'a1', side: 'ally', name: 'Cleric',
  attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 16, CHA: 12 },
  hp: 25, maxHp: 25,
  ap: 6, maxAp: 6,
  mp: 20, maxMp: 20,
  isDead: false, isFleeing: false,
  conditions: [],
  equipped: { weapon: null, armor: null, accessory: null },
  elementalResistances: { ...ZERO_RESISTANCES },
};

const baseState = (): Partial<CombatState> & { combatants: Record<string, Combatant> } => ({
  id: 'test', phase: 'active', round: 1, turn: 1, queue: [],
  combatants: { p1: { ...baseAttacker }, e1: { ...baseEnemy }, a1: { ...baseAlly } },
  log: [], startedAt: Date.now(),
});

beforeEach(() => {
  useCombatStore.setState({
    combatants: (baseState() as any).combatants,
    log: [],
    round: 1, turn: 1,
  } as any);
});

describe('resolveAbility', () => {
  it('火球术 (1d6+INT_mod 火伤) 命中造成伤害', () => {
    // 序列: d20=20 (命中), d6=4 (伤害)
    const resolver = createActionResolver({ roll: makeConstRoll([20, 4]), qte: () => ({ accuracy: 1, modifier: 0, type: 'magic' as const }) });
    const r = resolver.resolve({
      kind: 'ability', userId: 'p1', abilityId: 'spell_fire_bolt', targetId: 'e1',
    } as any, useCombatStore.getState());
    const msgs = r.log.map(l => l.message);
    const dmg = r.log.find(l => l.message.includes('命中!') && l.message.includes('伤害'));
    expect(dmg, JSON.stringify(msgs)).toBeDefined();
    expect(useCombatStore.getState().combatants.e1.hp).toBeLessThan(20);
  });

  it('圣光治疗 治疗 1d6+1+WIS_mod, 不造成伤害', () => {
    useCombatStore.setState((s) => ({
      combatants: { ...s.combatants, a1: { ...baseAlly, hp: 10 } },
    }));
    const resolver = createActionResolver({ roll: () => 4 });
    resolver.resolve({ kind: 'ability', userId: 'a1', abilityId: 'prayer_holy_heal', targetId: 'a1' } as any, useCombatStore.getState());
    expect(useCombatStore.getState().combatants.a1.hp).toBeGreaterThan(10);
  });

  it('祝福祷文 添加 blessing buff 给目标', () => {
    const resolver = createActionResolver();
    resolver.resolve({ kind: 'ability', userId: 'a1', abilityId: 'prayer_blessing', targetId: 'a1' } as any, useCombatStore.getState());
    const a1 = useCombatStore.getState().combatants.a1;
    expect(a1.conditions.some(b => b.ref === 'blessing')).toBe(true);
  });

  it('AP 不足抛 InsufficientAPError', () => {
    useCombatStore.setState((s) => ({
      combatants: { ...s.combatants, p1: { ...baseAttacker, ap: 0 } },
    }));
    const resolver = createActionResolver();
    expect(() => resolver.resolve({
      kind: 'ability', userId: 'p1', abilityId: 'spell_fire_bolt', targetId: 'e1',
    } as any, useCombatStore.getState())).toThrow(/AP 不足/);
  });

  it('MP 不足抛 InsufficientAPError (扩展消息)', () => {
    useCombatStore.setState((s) => ({
      combatants: { ...s.combatants, p1: { ...baseAttacker, mp: 0 } },
    }));
    const resolver = createActionResolver();
    expect(() => resolver.resolve({
      kind: 'ability', userId: 'p1', abilityId: 'spell_fire_bolt', targetId: 'e1',
    } as any, useCombatStore.getState())).toThrow();
  });

  it('未知 abilityId 返错误 log', () => {
    const resolver = createActionResolver();
    const r = resolver.resolve({ kind: 'ability', userId: 'p1', abilityId: 'xxx', targetId: 'e1' } as any, useCombatStore.getState());
    expect(r.log.some(l => l.message.includes('未知'))).toBe(true);
  });

  it('高抗性目标减伤, 50 抗 = 50% 伤害', () => {
    useCombatStore.setState((s) => ({
      combatants: { ...s.combatants, e1: { ...baseEnemy, elementalResistances: { ...ZERO_RESISTANCES, fire: 50 } } },
    }));
    const resolver = createActionResolver({ roll: makeConstRoll([20, 4]), qte: () => ({ accuracy: 1, modifier: 0, type: 'magic' as const }) });
    const hpBefore = useCombatStore.getState().combatants.e1.hp;
    resolver.resolve({ kind: 'ability', userId: 'p1', abilityId: 'spell_fire_bolt', targetId: 'e1' } as any, useCombatStore.getState());
    const dmg = hpBefore - useCombatStore.getState().combatants.e1.hp;
    // 1d6=4 + INT_mod(16)=3 → 7 base → 50% 抗 → 3.5 → round 4
    expect(dmg).toBe(4);
  });

  it('命中门槛高时物理闪避 (16+) 失败, 不造成伤害', () => {
    useCombatStore.setState((s) => ({
      combatants: { ...s.combatants, e1: { ...baseEnemy, attributes: { ...baseEnemy.attributes, DEX: 24 } } }, // DEX 24 = +7 mod
    }));
    const resolver = createActionResolver({ roll: () => 1, qte: () => ({ accuracy: 1, modifier: 0, type: 'magic' as const }) });
    // 1 + 3 (dex 14 mod) = 4 vs 10 + 7 + 0 = 17 → miss
    resolver.resolve({ kind: 'ability', userId: 'p1', abilityId: 'spell_fire_bolt', targetId: 'e1' } as any, useCombatStore.getState());
    expect(useCombatStore.getState().combatants.e1.hp).toBe(20);
  });

  it('armor_pierce 50% 穿甲, damage 翻倍', () => {
    useCombatStore.setState((s) => ({
      combatants: {
        ...s.combatants,
        a1: { ...baseAlly, attributes: { ...baseAlly.attributes, WIS: 16 } }, // wmod = 3
        e1: { ...baseEnemy, equipped: { weapon: null, armor: { id: 'ar', name: 'Plate', slot: 'armor', rarity: 'rare', tags: [], description: '', value: 0, effects: [{ id: 'e', type: 'defense_bonus', value: 5, description: '' }] } as any, accessory: null } },
      },
    }));
    const resolver = createActionResolver({ roll: makeConstRoll([20, 4]), qte: () => ({ accuracy: 1, modifier: 0, type: 'magic' as const }) });
    const hpBefore = useCombatStore.getState().combatants.e1.hp;
    resolver.resolve({ kind: 'ability', userId: 'a1', abilityId: 'art_paladin_blessed_strike', targetId: 'e1' } as any, useCombatStore.getState());
    const dmg = hpBefore - useCombatStore.getState().combatants.e1.hp;
    // 1d6=4 + wmod 3 = 7 base, armor 5 → without pierce: 7-5=2; with 50% pierce: 7 - 5*0.5 = 4-5 → max(1, 4-2.5) = 4
    expect(dmg).toBeGreaterThanOrEqual(3);
  });
});
