/**
 * v0.5.2 — Class 系统端到端集成测试
 *
 * 覆盖:
 * - warrior T1+T3 战嚎+重击 (伤害+30%) 叠加 → damageModifier = 0.30
 * - thief T2 暗影步 (招架门槛-3) → 命中门槛从 10 降到 7
 * - 4 职业不同节点效果聚合正确 (基本烟雾测试)
 * - 跨职业节点防御性跳过 (节点 classId 与角色 classId 不一致 → 跳过)
 * - 空 classSkills → 全 0 bonus
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { aggregateClassEffects } from '../../src/services/class/classEffects';
import { useCharacterStore } from '../../src/stores/characterStore';
import type { Character } from '../../src/types/character';
import { resetClientStores } from '../utils/resetStores';

function makeChar(classId: string | null, picked: string[]): Character {
  return {
    characterId: 'c1',
    playerId: 'p1',
    name: 'Test',
    race: '人类',
    background: '',
    appearance: '',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    skills: [],
    inventory: {
      equipped: { weapon: null, armor: null, accessory: null },
      backpack: [],
      currency: { gold: 0, silver: 0, copper: 0 },
    },
    hp: 20,
    maxHp: 20,
    vital: { hunger: 0, thirst: 0, fatigue: 0, hygiene: 0, morale: 0, wound: 0, temperature: 37, encumbrance: 0 },
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    conditions: [],
    joinedRegion: 'r',
    joinedWorldDay: 1,
    currentLocalDay: 1,
    lastActionTime: '',
    recentHistory: [],
    level: 1,
    exp: 0,
    expToNext: 100,
    unspentAttributePoints: 0,
    classId,
    classSkills: picked.map((nodeId) => ({ classId: classId || '', nodeId, unlockedAt: 0 })),
  };
}

beforeEach(() => {
  resetClientStores();
});

describe('class effects integration', () => {
  it('warrior 战嚎 (T1·3) + 重击 (T3·2) → 伤害+30% (0.10+0.20)', () => {
    useCharacterStore.setState({
      character: makeChar('warrior', ['warrior_t1_3', 'warrior_t3_2']),
      isLoaded: true,
    });
    const c = useCharacterStore.getState().character!;
    const bonus = aggregateClassEffects(c);
    expect(bonus.damageModifier).toBeCloseTo(0.30, 5);

    // base damage 10 → final = 10 * 1.30 = 13
    const finalDmg = 10 * (1 + bonus.damageModifier);
    expect(finalDmg).toBeCloseTo(13, 5);
  });

  it('thief 暗影步 (T3·1) → DEX+2 (attribute_mod 生效)', () => {
    useCharacterStore.setState({
      character: makeChar('thief', ['thief_t3_1']),
      isLoaded: true,
    });
    const bonus = aggregateClassEffects(useCharacterStore.getState().character!);
    expect(bonus.attributeMods.DEX).toBe(2);
  });

  it('mage 法力池 (T1·2) → mpMaxBonus = +10', () => {
    useCharacterStore.setState({
      character: makeChar('mage', ['mage_t1_2']),
      isLoaded: true,
    });
    const bonus = aggregateClassEffects(useCharacterStore.getState().character!);
    expect(bonus.mpMaxBonus).toBe(10);
  });

  it('cleric 智慧引导 (T3·3) → expBonus = +10%', () => {
    useCharacterStore.setState({
      character: makeChar('cleric', ['cleric_t3_3']),
      isLoaded: true,
    });
    const bonus = aggregateClassEffects(useCharacterStore.getState().character!);
    expect(bonus.expBonus).toBeCloseTo(0.10, 5);
  });

  it('空 classSkills → 所有 bonus 为 0', () => {
    useCharacterStore.setState({ character: makeChar('warrior', []), isLoaded: true });
    const bonus = aggregateClassEffects(useCharacterStore.getState().character!);
    expect(bonus.damageModifier).toBe(0);
    expect(bonus.hpMaxBonus).toBe(0);
    expect(bonus.mpMaxBonus).toBe(0);
    expect(bonus.dodgeThresholdBonus).toBe(0);
    expect(bonus.expBonus).toBe(0);
    expect(bonus.qteToleranceMs).toBe(0);
  });

  it('classId=null → 全 0 bonus', () => {
    useCharacterStore.setState({ character: makeChar(null, []), isLoaded: true });
    const bonus = aggregateClassEffects(useCharacterStore.getState().character!);
    expect(bonus.damageModifier).toBe(0);
    expect(bonus.hpMaxBonus).toBe(0);
  });

  it('跨职业节点防御性跳过: warrior 角色带 thief_t1_1 → thief 效果不生效', () => {
    const c = makeChar('warrior', ['thief_t1_1']);
    // 直接构造 (绕开 setState 校验)
    useCharacterStore.setState({ character: c, isLoaded: true });
    const bonus = aggregateClassEffects(c);
    // thief_t1_1 应该是 +1 DEX, 但因为角色是 warrior, 该节点不识别
    expect(bonus.attributeMods.DEX ?? 0).toBe(0);
  });

  it('warrior 全 12 节点 (理论极限) → 所有 bonus 累加正确', () => {
    const allWarrior = [
      'warrior_t1_1', 'warrior_t1_2', 'warrior_t1_3',
      'warrior_t2_1', 'warrior_t2_2', 'warrior_t2_3',
      'warrior_t3_1', 'warrior_t3_2', 'warrior_t3_3',
      'warrior_t4_1', 'warrior_t4_2', 'warrior_t4_3',
    ];
    useCharacterStore.setState({
      character: makeChar('warrior', allWarrior),
      isLoaded: true,
    });
    const bonus = aggregateClassEffects(useCharacterStore.getState().character!);
    // 蛮力 +1 STR + 钢铁意志 +2 CON + 战神附体 +3 STR = STR+4
    expect(bonus.attributeMods.STR).toBe(4);
    expect(bonus.attributeMods.CON).toBe(2);
    // 体魄 +5 + 不屈 +8 + 不灭之心 +15 = HP+28
    expect(bonus.hpMaxBonus).toBe(28);
    // 战嚎 +10% + 横扫 +15% + 重击 +20% + 血怒 +25% = 70% (0.70)
    expect(bonus.damageModifier).toBeCloseTo(0.70, 5);
  });
});
