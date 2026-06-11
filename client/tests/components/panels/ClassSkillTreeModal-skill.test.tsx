/**
 * ClassSkillTreeModal v0.6.4b — 技能 TAB 测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClassSkillTreeModal } from '../../../src/components/panels/CharacterPanel/ClassSkillTreeModal';
import { useCharacterStore } from '../../../src/stores/characterStore';
import { resetClientStores } from '../../utils/resetStores';
import type { Character, ElementalResistances } from '../../../src/types/character';
import { ZERO_RESISTANCES } from '../../../src/types/character';

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    characterId: 'c1',
    playerId: 'p1',
    name: '阿尔',
    race: '人类',
    background: '',
    appearance: '',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 14, WIS: 12, CHA: 10 },
    skills: [],
    inventory: {
      equipped: { weapon: null, armor: null, accessory: null },
      backpack: [],
      currency: { gold: 0, silver: 0, copper: 0 },
    },
    hp: 20, maxHp: 20, mp: 10, maxMp: 10,
    vital: { hunger: 0, thirst: 0, fatigue: 0, hygiene: 0, morale: 0, wound: 0, temperature: 37, encumbrance: 0 },
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    conditions: [],
    joinedRegion: 'r', joinedWorldDay: 1, currentLocalDay: 1,
    lastActionTime: '', recentHistory: [],
    level: 3, exp: 0, expToNext: 100, unspentAttributePoints: 0, unspentSkillPoints: 2,
    classId: 'mage', classSkills: [],
    elementalResistances: { ...ZERO_RESISTANCES } as ElementalResistances,
    learnedAbilities: [],
    defaultLearnedAbilities: [],
    ...overrides,
  } as Character;
}

beforeEach(() => {
  resetClientStores();
});

describe('ClassSkillTreeModal v0.6.4b — 技能 TAB', () => {
  it('默认显示天赋 TAB 和技能 TAB 按钮', () => {
    useCharacterStore.setState({ character: makeChar(), isLoaded: true });
    render(
      <ClassSkillTreeModal
        classId="mage"
        isOpen={true}
        onClose={() => {}}
        learnedNodes={[]}
        currentLevel={3}
        learnedAbilities={[]}
        unspentSkillPoints={2}
      />,
    );
    expect(screen.getByTestId('tab-talent')).toBeTruthy();
    expect(screen.getByTestId('tab-skill')).toBeTruthy();
  });

  it('点击技能 TAB 显示可学 Ability 列表', () => {
    useCharacterStore.setState({ character: makeChar(), isLoaded: true });
    render(
      <ClassSkillTreeModal
        classId="mage"
        isOpen={true}
        onClose={() => {}}
        learnedNodes={[]}
        currentLevel={3}
        learnedAbilities={[]}
        unspentSkillPoints={2}
      />,
    );
    fireEvent.click(screen.getByTestId('tab-skill'));
    // 法师应可看到火球术
    expect(screen.getByTestId('skill-item-spell_fire_bolt')).toBeTruthy();
  });

  it('已学 Ability 显示已学标记', () => {
    useCharacterStore.setState({ character: makeChar(), isLoaded: true });
    render(
      <ClassSkillTreeModal
        classId="mage"
        isOpen={true}
        onClose={() => {}}
        learnedNodes={[]}
        currentLevel={3}
        learnedAbilities={['spell_fire_bolt']}
        unspentSkillPoints={2}
      />,
    );
    fireEvent.click(screen.getByTestId('tab-skill'));
    const item = screen.getByTestId('skill-item-spell_fire_bolt');
    expect(item.textContent).toContain('已学');
  });

  it('点击学习按钮消耗技能点', () => {
    useCharacterStore.setState({ character: makeChar({ unspentSkillPoints: 2 }), isLoaded: true });
    render(
      <ClassSkillTreeModal
        classId="mage"
        isOpen={true}
        onClose={() => {}}
        learnedNodes={[]}
        currentLevel={3}
        learnedAbilities={[]}
        unspentSkillPoints={2}
      />,
    );
    fireEvent.click(screen.getByTestId('tab-skill'));
    fireEvent.click(screen.getByTestId('skill-learn-spell_fire_bolt'));
    const s = useCharacterStore.getState().character!;
    expect(s.learnedAbilities.some((la) => la.abilityId === 'spell_fire_bolt')).toBe(true);
    expect(s.unspentSkillPoints).toBe(1);
  });

  it('技能点为 0 时学习按钮 disabled', () => {
    useCharacterStore.setState({ character: makeChar({ unspentSkillPoints: 0 }), isLoaded: true });
    render(
      <ClassSkillTreeModal
        classId="mage"
        isOpen={true}
        onClose={() => {}}
        learnedNodes={[]}
        currentLevel={3}
        learnedAbilities={[]}
        unspentSkillPoints={0}
      />,
    );
    fireEvent.click(screen.getByTestId('tab-skill'));
    expect(screen.getByTestId('skill-learn-spell_fire_bolt')).toBeDisabled();
  });
});
