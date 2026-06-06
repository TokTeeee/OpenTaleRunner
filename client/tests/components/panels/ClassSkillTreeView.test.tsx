/**
 * ClassSkillTreeView — 在 CharacterPanel 内显示职业技能树
 *
 * 覆盖:
 * - classId=null: 返回 null
 * - classId=invalid: 返回 null
 * - warrior + t1_1 picked: 该节点 .picked, 其他 .dimmed
 * - warrior 空 picked: 12 个节点全渲染 (4 tier × 3 slot)
 * - data-testid="class-skill-tree" 容器存在
 */
import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ClassSkillTreeView } from '../../../src/components/panels/CharacterPanel/ClassSkillTreeView';
import { useCharacterStore } from '../../../src/stores/characterStore';
import type { Character } from '../../../src/types/character';
import { resetClientStores } from '../../utils/resetStores';

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

describe('ClassSkillTreeView', () => {
  it('classId=null: 返回 null (不渲染)', () => {
    useCharacterStore.setState({ character: makeChar(null, []), isLoaded: true });
    const { container } = render(<ClassSkillTreeView />);
    expect(container.firstChild).toBeNull();
  });

  it('classId=invalid: 返回 null', () => {
    useCharacterStore.setState({ character: makeChar('invalid_class', []), isLoaded: true });
    const { container } = render(<ClassSkillTreeView />);
    expect(container.firstChild).toBeNull();
  });

  it('warrior + t1_1 picked: 该节点 .picked, 其他 .dimmed', () => {
    useCharacterStore.setState({
      character: makeChar('warrior', ['warrior_t1_1']),
      isLoaded: true,
    });
    render(<ClassSkillTreeView />);

    const pickedNode = screen.getByTestId('node-warrior_t1_1');
    const dimmedNode = screen.getByTestId('node-warrior_t1_2');
    expect(pickedNode.className).toMatch(/picked/);
    expect(dimmedNode.className).toMatch(/dimmed/);
  });

  it('warrior 空 picked: 12 节点全渲染 (4 tier × 3 slot)', () => {
    useCharacterStore.setState({ character: makeChar('warrior', []), isLoaded: true });
    render(<ClassSkillTreeView />);
    for (const tier of [1, 2, 3, 4]) {
      for (const slot of [1, 2, 3]) {
        expect(screen.getByTestId(`node-warrior_t${tier}_${slot}`)).toBeTruthy();
      }
    }
  });

  it('容器 data-testid="class-skill-tree" 存在', () => {
    useCharacterStore.setState({ character: makeChar('warrior', []), isLoaded: true });
    render(<ClassSkillTreeView />);
    expect(screen.getByTestId('class-skill-tree')).toBeTruthy();
  });

  it('thief + 多个 picked: 多节点 .picked', () => {
    useCharacterStore.setState({
      character: makeChar('thief', ['thief_t1_1', 'thief_t2_1', 'thief_t3_1']),
      isLoaded: true,
    });
    render(<ClassSkillTreeView />);
    expect(screen.getByTestId('node-thief_t1_1').className).toMatch(/picked/);
    expect(screen.getByTestId('node-thief_t2_1').className).toMatch(/picked/);
    expect(screen.getByTestId('node-thief_t3_1').className).toMatch(/picked/);
    expect(screen.getByTestId('node-thief_t1_2').className).toMatch(/dimmed/);
  });
});
