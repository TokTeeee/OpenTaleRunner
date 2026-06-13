import type { JudgeParams, DiceResult, SceneContext } from '../../types/game';
import type { Character } from '../../types/character';
import { rollDiceSecure, calculateDiceResult } from '../../utils/dice';
import { useGameStore } from '../../stores/gameStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { usePartyStore } from '../../stores/partyStore';
import { systemHooks } from '../hooks/SystemHooks';
import { buildSnapshot } from '../hooks/GameSnapshot';
import { resolveConditionEffects } from './ConditionsRegistry';

interface EffectResult {
  directBonus: number;
  elementalBonus: Record<string, number>;
  elementalResist: Record<string, number>;
  skillBonus: number;
  hasLightSource: boolean;
  totalEquipmentBonus: number;
}

function applyEffect(eff: { type?: string; value?: number | string | Record<string, unknown>; description?: string }, result: EffectResult): void {
  const type = eff.type;
  if (!type) return;

  switch (type) {
    case 'damage_bonus':
    case 'defense_bonus':
      if (typeof eff.value === 'number') result.directBonus += eff.value;
      break;
    case 'attribute_mod': {
      const val = eff.value as Record<string, number> | undefined;
      if (val?.STR) result.directBonus += val.STR;
      if (val?.DEX) result.directBonus += val.DEX;
      break;
    }
    case 'elemental_damage': {
      const v = eff.value as Record<string, unknown>;
      if (v?.element) {
        const el = v.element as string;
        result.elementalBonus[el] = (result.elementalBonus[el] || 0) + ((v.amount as number) || 1);
      }
      break;
    }
    case 'elemental_resist': {
      const v = eff.value as Record<string, unknown>;
      if (v?.element) {
        const el = v.element as string;
        result.elementalResist[el] = (result.elementalResist[el] || 0) + ((v.amount as number) || 1);
      }
      break;
    }
    case 'skill_bonus':
      if (typeof eff.value === 'number') result.skillBonus += eff.value;
      break;
    case 'light_source':
      result.hasLightSource = true;
      break;
    case 'hp_max_bonus':
    case 'hp_restore':
    case 'vital_restore':
    case 'special':
      break;
  }
}

function getEquipmentEffectResult(character: Character): EffectResult {
  const result: EffectResult = {
    directBonus: 0,
    elementalBonus: {},
    elementalResist: {},
    skillBonus: 0,
    hasLightSource: false,
    totalEquipmentBonus: 0,
  };

  const items = [
    character.inventory.equipped.weapon,
    character.inventory.equipped.armor,
    character.inventory.equipped.accessory,
  ];

  for (const item of items) {
    if (!item) continue;
    const itemWithBonus = item as typeof item & { bonus?: number };
    if (typeof itemWithBonus.bonus === 'number') {
      result.directBonus += itemWithBonus.bonus;
    }
    for (const eff of (item.effects || [])) {
      applyEffect(eff, result);
    }
  }

  result.totalEquipmentBonus = result.directBonus + result.skillBonus;
  return result;
}

function checkLightSource(character: Character): boolean {
  for (const item of [character.inventory.equipped.weapon, character.inventory.equipped.armor, character.inventory.equipped.accessory]) {
    if (item?.effects?.some(e => e.type === 'light_source')) return true;
  }
  for (const item of (character.inventory.backpack || [])) {
    if (item.effects?.some(e => e.type === 'light_source')) return true;
  }
  return false;
}

function getNightPenalty(sceneContext?: SceneContext, character?: Character): number {
  const game = useGameStore.getState();
  const clock = game.gameClock;
  const terrain = sceneContext?.terrain || game.terrain;

  if (/地下|矿坑|洞|墓|废墟/.test(terrain)) return 3;

  if (clock >= 20 || clock < 5) {
    let penalty = 2;
    if (character && !checkLightSource(character)) penalty += 2;
    return penalty;
  }

  if (clock < 6 || clock >= 19) return 1;

  return 0;
}

export class JudgmentSystem {
  evaluate(
    params: JudgeParams,
    character: Character,
    sceneContext?: SceneContext,
  ): DiceResult {
    const attrKey = params.relevantAttribute as keyof Character['attributes'] | null;
    const attributeValue = attrKey ? character.attributes[attrKey] : 10;

    const skillLevel = params.relevantSkill
      ? (character.skills.find((s) => s.name === params.relevantSkill)?.level ?? 0)
      : 0;

    const effectResult = getEquipmentEffectResult(character);

    const condEff = resolveConditionEffects(character.conditions || []);
    const conditionsPenalty = condEff.dicePenalty;

    const nightPenalty = getNightPenalty(sceneContext, character);

    const partyBonus = usePartyStore.getState().getCombatBonus();
    const totalPartyBonus = partyBonus.totalDamageBonus + partyBonus.totalDefenseBonus + partyBonus.totalSkillBonus;

    // Hook system: allow external modules to inject modifiers (H2.2)
    let hookBonus = 0;
    let hookPenalty = 0;
    const hookEnabled = useSettingsStore.getState().experimental.enableSystemHooks;
    if (hookEnabled) {
      const snap = buildSnapshot();
      const hookResult = systemHooks.apply('combat.beforeRoll', {
        diceParams: {
          attributeValue,
          skillLevel,
          equipmentBonus: effectResult.totalEquipmentBonus,
          conditionsPenalty,
          nightPenalty,
        },
        actionType: params.relevantAttribute || 'unknown',
        hookBonus: 0,
        hookPenalty: 0,
      }, {
        namespace: 'combat.beforeRoll',
        source: 'gm',
        snapshot: snap,
        abort: () => {},
      });
      if (hookResult && typeof hookResult === 'object') {
        const hr = hookResult as { hookBonus?: number; hookPenalty?: number };
        hookBonus = hr.hookBonus || 0;
        hookPenalty = hr.hookPenalty || 0;
      }
    }

    const diceValues = rollDiceSecure(6, 2);

    return calculateDiceResult(
      diceValues,
      attributeValue,
      skillLevel,
      effectResult.totalEquipmentBonus + hookBonus + totalPartyBonus,
      useGameStore.getState().sceneModifier,
      params.difficultyLC,
      conditionsPenalty + hookPenalty,
      nightPenalty,
      partyBonus.memberActions,
    );
  }
}

export { getEquipmentEffectResult, getNightPenalty, checkLightSource };
export type { EffectResult };

