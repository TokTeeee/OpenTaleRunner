// client/src/data/abilities/index.ts
// v0.6.2: ABILITY_REGISTRY 合并 (替代 v0.6.1 spellRegistry + prayerRegistry)
// 16 个初始能力: 6 魔法 + 6 祷告 + 4 战技
import type { Ability, AbilitySchool, Element } from '../../types/ability';

import { fireBolt } from './abilities/fireBolt';
import { iceLance } from './abilities/iceLance';
import { lightningSpark } from './abilities/lightningSpark';
import { windGust } from './abilities/windGust';
import { earthStone } from './abilities/earthStone';
import { arcaneMissile } from './abilities/arcaneMissile';

import { holyHeal } from './abilities/holyHeal';
import { holyLight } from './abilities/holyLight';
import { blessing } from './abilities/blessing';
import { shadowCurse } from './abilities/shadowCurse';
import { shadowBlast } from './abilities/shadowBlast';
import { prayerOfFortitude } from './abilities/prayerOfFortitude';

import { warriorSmash } from './abilities/warriorSmash';
import { thiefRicochet } from './abilities/thiefRicochet';
import { mageArcaneWard } from './abilities/mageArcaneWard';
import { paladinBlessedStrike } from './abilities/paladinBlessedStrike';

export const ABILITY_REGISTRY: Record<string, Ability> = {
  // 6 魔法
  spell_fire_bolt: fireBolt,
  spell_ice_lance: iceLance,
  spell_lightning_spark: lightningSpark,
  spell_wind_gust: windGust,
  spell_earth_stone: earthStone,
  spell_arcane_missile: arcaneMissile,
  // 6 祷告
  prayer_holy_heal: holyHeal,
  prayer_holy_light: holyLight,
  prayer_blessing: blessing,
  prayer_shadow_curse: shadowCurse,
  prayer_shadow_blast: shadowBlast,
  prayer_fortitude: prayerOfFortitude,
  // 4 战技
  art_warrior_smash: warriorSmash,
  art_thief_ricochet: thiefRicochet,
  art_mage_arcane_ward: mageArcaneWard,
  art_paladin_blessed_strike: paladinBlessedStrike,
};

export function getAbility(id: string): Ability | null {
  return ABILITY_REGISTRY[id] ?? null;
}

export function listAbilitiesBySchool(school: AbilitySchool): Ability[] {
  return Object.values(ABILITY_REGISTRY).filter(a => a.school === school);
}

export function listAbilitiesByElement(element: Element): Ability[] {
  return Object.values(ABILITY_REGISTRY).filter(a => a.element === element);
}

export function listAllAbilities(): Ability[] {
  return Object.values(ABILITY_REGISTRY);
}

export function getLearnedAbilities(
  character: { learnedAbilities: { abilityId: string }[] }
): Ability[] {
  return character.learnedAbilities
    .map(la => getAbility(la.abilityId))
    .filter((a): a is Ability => a !== null);
}
