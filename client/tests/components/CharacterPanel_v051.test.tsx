import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { CharacterPanel } from '../../src/components/panels/CharacterPanel';
import { useCharacterStore } from '../../src/stores/characterStore';
import { resetClientStores } from '../utils/resetStores';
import type { Character } from '../../src/types/character';
import { ZERO_RESISTANCES } from '../../src/types/character';

function makeChar(over: Partial<Character> = {}): Character {
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
    vital: { hunger: 50, thirst: 50, fatigue: 50, temperature: 37, morale: 50 },
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    conditions: [],
    joinedRegion: 'r1', joinedWorldDay: 1, currentLocalDay: 1, lastActionTime: '',
    recentHistory: [],
    level: 1, exp: 50, expToNext: 100, unspentAttributePoints: 0,
    unspentSkillPoints: 0,
    classId: null, classSkills: [],
    // v0.6.2
    elementalResistances: { ...ZERO_RESISTANCES } as ElementalResistances,
    learnedAbilities: [],
    defaultLearnedAbilities: [],
    ...over,
  };
}

describe('v0.5.1 — CharacterPanel LevelBar', () => {
  beforeEach(() => {
    resetClientStores();
  });

  it('renders current level', () => {
    useCharacterStore.setState({ character: makeChar({ level: 3 }), isLoaded: true });
    const { container } = render(<CharacterPanel />);
    expect(container.textContent).toMatch(/Lv\.3/);
  });

  it('renders exp / expToNext', () => {
    useCharacterStore.setState({ character: makeChar({ level: 1, exp: 50, expToNext: 100 }), isLoaded: true });
    const { container } = render(<CharacterPanel />);
    expect(container.textContent).toContain('50/100');
  });

  it('shows unspent point hint when > 0', () => {
    useCharacterStore.setState({ character: makeChar({ unspentAttributePoints: 2 }), isLoaded: true });
    const { container } = render(<CharacterPanel />);
    expect(container.textContent).toMatch(/2 个属性点待分配/);
  });

  it('hides unspent hint when 0', () => {
    useCharacterStore.setState({ character: makeChar({ unspentAttributePoints: 0 }), isLoaded: true });
    const { container } = render(<CharacterPanel />);
    expect(container.textContent).not.toMatch(/属性点待分配/);
  });

  it('shows MAX at level 20 with expToNext 0', () => {
    useCharacterStore.setState({ character: makeChar({ level: 20, exp: 0, expToNext: 0, unspentAttributePoints: 0 }), isLoaded: true });
    const { container } = render(<CharacterPanel />);
    expect(container.textContent).toContain('MAX');
  });
});
