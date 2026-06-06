import { describe, expect, it, beforeEach } from 'vitest';
import { useCharacterStore } from '../../src/stores/characterStore';
import { applyConsequences } from '../../src/services/consequence/applyConsequences';
import { resetClientStores } from '../utils/resetStores';
import type { Character } from '../../src/types/character';

function makeChar(): Character {
  return {
    characterId: 'c1', playerId: 'p1', name: 'Alice', race: 'human', background: '', appearance: '',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    skills: [],
    inventory: {
      equipped: { weapon: null, armor: null, accessory: null },
      backpack: [],
      currency: { gold: 0, silver: 0, copper: 0 },
    },
    hp: 30, maxHp: 30,
    vital: { hunger: 0, thirst: 0, fatigue: 0, hygiene: 0, morale: 0, wound: 0, temperature: 0, encumbrance: 0 },
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    conditions: [],
    joinedRegion: 'r1', joinedWorldDay: 1, currentLocalDay: 1, lastActionTime: '',
    recentHistory: [],
  };
}

describe('characterStore — v0.5.1 updateAttributes 钳制 [1, 20] + charisma 路由', () => {
  beforeEach(() => {
    resetClientStores();
    useCharacterStore.setState({ character: makeChar(), isLoaded: true });
  });

  describe('updateAttributes [1, 20] 钳制 (v0.5.1 放宽)', () => {
    it('超过 20 时钳制为 20', () => {
      useCharacterStore.getState().updateAttributes({ STR: 25 });
      const attrs = useCharacterStore.getState().character!.attributes;
      expect(attrs.STR).toBe(20);
    });

    it('低于 1 时钳制为 1', () => {
      useCharacterStore.getState().updateAttributes({ DEX: 0 });
      const attrs = useCharacterStore.getState().character!.attributes;
      expect(attrs.DEX).toBe(1);
    });

    it('null/undefined 值不更新字段', () => {
      useCharacterStore.getState().updateAttributes({ CON: undefined as any, INT: null as any });
      const attrs = useCharacterStore.getState().character!.attributes;
      expect(attrs.CON).toBe(10);
      expect(attrs.INT).toBe(10);
    });

    it('不传字段时其他属性保持原值', () => {
      useCharacterStore.getState().updateAttributes({ WIS: 15 });
      const attrs = useCharacterStore.getState().character!.attributes;
      expect(attrs.WIS).toBe(15);
      expect(attrs.CHA).toBe(10);
    });
  });

  describe('applyConsequences charisma 路由到 CHA', () => {
    it('reputationChange.charisma 应累加到 attributes.CHA', () => {
      applyConsequences({ reputationChange: { charisma: 2 } });
      const attrs = useCharacterStore.getState().character!.attributes;
      expect(attrs.CHA).toBe(12);
    });

    it('多次累加, 钳制到 18', () => {
      applyConsequences({ reputationChange: { charisma: 5 } });
      applyConsequences({ reputationChange: { charisma: 5 } });
      const attrs = useCharacterStore.getState().character!.attributes;
      expect(attrs.CHA).toBe(18);
    });

    it('goodness/violence/lawfulness 仍走 reputation', () => {
      applyConsequences({ reputationChange: { goodness: 10, violence: 5, lawfulness: -3 } });
      const rep = useCharacterStore.getState().character!.reputation;
      expect(rep.goodness).toBe(10);
      expect(rep.violence).toBe(5);
      expect(rep.lawfulness).toBe(-3);
    });

    it('未知字段落到 regional', () => {
      applyConsequences({ reputationChange: { 'faction_elves': 5 } });
      const rep = useCharacterStore.getState().character!.reputation;
      expect(rep.regional.faction_elves).toBe(5);
    });
  });
});
