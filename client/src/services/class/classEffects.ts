import type { Character, Attributes } from '../../types/character';
import { getClass } from '../../data/classes';
import type { ClassNodeEffect, ClassNode } from '../../types/class';

export interface ClassBonus {
  attributeMods: Partial<Attributes>;
  hpMaxBonus: number;
  mpMaxBonus: number;
  dodgeThresholdBonus: number;
  damageModifier: number;
  expBonus: number;
  qteToleranceMs: number;
}

export const EMPTY_CLASS_BONUS: ClassBonus = {
  attributeMods: {}, hpMaxBonus: 0, mpMaxBonus: 0,
  dodgeThresholdBonus: 0, damageModifier: 0, expBonus: 0, qteToleranceMs: 0,
};

function applyEffect(bonus: ClassBonus, eff: ClassNodeEffect): void {
  switch (eff.type) {
    case 'attribute_mod':
      bonus.attributeMods[eff.attribute] = (bonus.attributeMods[eff.attribute] ?? 0) + eff.bonus;
      break;
    case 'hp_max_bonus':         bonus.hpMaxBonus += eff.bonus; break;
    case 'mp_max_bonus':         bonus.mpMaxBonus += eff.bonus; break;
    case 'dodge_threshold_bonus':bonus.dodgeThresholdBonus += eff.bonus; break;
    case 'damage_modifier':      bonus.damageModifier += eff.bonus; break;
    case 'exp_bonus':            bonus.expBonus += eff.bonus; break;
    case 'qte_tolerance':        bonus.qteToleranceMs += eff.bonus; break;
  }
}

export function aggregateClassEffects(character: Character): ClassBonus {
  if (!character.classId) return { ...EMPTY_CLASS_BONUS, attributeMods: {} };
  const def = getClass(character.classId);
  if (!def) return { ...EMPTY_CLASS_BONUS, attributeMods: {} };
  const bonus: ClassBonus = {
    attributeMods: {}, hpMaxBonus: 0, mpMaxBonus: 0,
    dodgeThresholdBonus: 0, damageModifier: 0, expBonus: 0, qteToleranceMs: 0,
  };
  for (const node of character.classSkills) {
    const def2 = def.nodes.find((n: ClassNode) => n.id === node.nodeId);
    if (!def2) continue;
    applyEffect(bonus, def2.effect);
  }
  return bonus;
}

/** 属性贡献来源分解 */
export interface AttributeBreakdown {
  base: number;
  equipment: number;
  classTalent: number;
  total: number;
}

/** 计算角色某属性的完整分解 (base + equipment + classTalent) */
export function computeAttributeBreakdowns(character: Character): Record<keyof Attributes, AttributeBreakdown> {
  const attrs = character.attributes;
  // 装备 attribute_mod
  const equipMods: Partial<Attributes> = {};
  const slots = [character.inventory.equipped.weapon, character.inventory.equipped.armor, character.inventory.equipped.accessory];
  for (const item of slots) {
    if (!item?.effects) continue;
    for (const eff of item.effects) {
      if (eff.type === 'attribute_mod' && typeof eff.value === 'object' && eff.value !== null) {
        const v = eff.value as Record<string, unknown>;
        for (const k of Object.keys(attrs) as (keyof Attributes)[]) {
          if (typeof v[k] === 'number') {
            equipMods[k] = (equipMods[k] ?? 0) + v[k];
          }
        }
      }
    }
  }
  // 职业天赋 attribute_mod
  const classBonus = aggregateClassEffects(character);
  const classMods = classBonus.attributeMods;

  const result = {} as Record<keyof Attributes, AttributeBreakdown>;
  for (const k of Object.keys(attrs) as (keyof Attributes)[]) {
    const base = attrs[k];
    const eq = equipMods[k] ?? 0;
    const cl = classMods[k] ?? 0;
    result[k] = { base, equipment: eq, classTalent: cl, total: base + eq + cl };
  }
  return result;
}
