import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCharacterStore } from '../../src/stores/characterStore';
import { applySkills } from '../../src/services/consequence/applySkills';
import { resetClientStores } from '../utils/resetStores';
import type { Character, Skill } from '../../src/types/character';

function makeChar(skills: Skill[] = []): Character {
  return {
    characterId: 'char1',
    playerId: 'char1',
    name: 'Test',
    race: '人类',
    background: '',
    appearance: '',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    skills,
    inventory: { equipped: { weapon: null, armor: null, accessory: null }, backpack: [], currency: { gold: 0, silver: 0, copper: 0 } },
    hp: 100, maxHp: 100,
    vital: { hunger: 0, thirst: 0, fatigue: 0, hygiene: 0, morale: 0 },
    reputation: { factions: {}, lastUpdated: 0 },
    conditions: [],
    joinedRegion: 'test',
    joinedWorldDay: 1,
    currentLocalDay: 1,
    lastActionTime: new Date().toISOString(),
  } as unknown as Character;
}

describe('applySkills (v0.5.13 业务域 3)', () => {
  beforeEach(() => {
    resetClientStores();
  });

  it('modifies existing skill level via levelChange', () => {
    useCharacterStore.setState({
      character: makeChar([{ id: 'sword', name: '剑术', level: 1, maxLevel: 10, type: 'acquired', relatedAttribute: 'STR', description: '', experience: 0, expToNext: 3 }]),
    });
    applySkills({ skillsModified: [{ skillId: 'sword', levelChange: 2 }] });
    const skill = useCharacterStore.getState().character?.skills.find(s => s.id === 'sword');
    expect(skill?.level).toBe(3);
  });

  it('renames skill via newName', () => {
    useCharacterStore.setState({
      character: makeChar([{ id: 'sword', name: '剑术', level: 1, maxLevel: 10, type: 'acquired', relatedAttribute: 'STR', description: '', experience: 0, expToNext: 3 }]),
    });
    applySkills({ skillsModified: [{ skillId: 'sword', newName: '剑术精通' }] });
    expect(useCharacterStore.getState().character?.skills[0].name).toBe('剑术精通');
  });

  it('skips entries with no skillId', () => {
    useCharacterStore.setState({ character: makeChar() });
    expect(() => applySkills({ skillsModified: [{ newName: 'X' } as never] })).not.toThrow();
  });

  it('handles empty (no-op)', () => {
    useCharacterStore.setState({ character: makeChar() });
    expect(() => applySkills({ skillsModified: [] })).not.toThrow();
  });

  it('isolates errors via try/catch', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    useCharacterStore.setState({ character: makeChar() });
    applySkills({ skillsModified: null as never });
    expect(useCharacterStore.getState().character?.skills).toEqual([]);
    warnSpy.mockRestore();
  });
});
