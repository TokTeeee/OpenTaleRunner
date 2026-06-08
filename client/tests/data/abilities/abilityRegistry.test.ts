// client/tests/data/abilities/abilityRegistry.test.ts
// v0.6.2 Task 6: ABILITY_REGISTRY 合并 (替代 v0.6.1 双 registry)
import { describe, it, expect } from 'vitest';
import {
  ABILITY_REGISTRY, getAbility, listAbilitiesBySchool, listAbilitiesByElement, listAllAbilities,
} from '../../../src/data/abilities';

describe('ABILITY_REGISTRY', () => {
  it('包含 16 个能力', () => {
    expect(Object.keys(ABILITY_REGISTRY)).toHaveLength(16);
  });

  it('getAbility 命中已注册 id', () => {
    expect(getAbility('spell_fire_bolt')?.name).toBe('火球术');
    expect(getAbility('prayer_holy_heal')?.name).toBe('圣光治疗');
    expect(getAbility('art_warrior_smash')?.name).toBe('重击');
  });

  it('getAbility 未知 id 返 null', () => {
    expect(getAbility('unknown')).toBeNull();
  });

  it('listAbilitiesBySchool 过滤 (magic 6 / prayer 6 / battle_art 4)', () => {
    expect(listAbilitiesBySchool('magic')).toHaveLength(6);
    expect(listAbilitiesBySchool('prayer')).toHaveLength(6);
    expect(listAbilitiesBySchool('battle_art')).toHaveLength(4);
  });

  it('listAbilitiesByElement 过滤', () => {
    expect(listAbilitiesByElement('fire')).toHaveLength(1);
    expect(listAbilitiesByElement('holy')).toHaveLength(4); // holyHeal/holyLight/blessing/prayerOfFortitude
    expect(listAbilitiesByElement('shadow')).toHaveLength(2);
  });

  it('listAllAbilities 含全部 16 个', () => {
    expect(listAllAbilities()).toHaveLength(16);
  });

  it('包含的 id 唯一', () => {
    const ids = listAllAbilities().map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
