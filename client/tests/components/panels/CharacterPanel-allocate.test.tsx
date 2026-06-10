/**
 * CharacterPanel v0.6.4 — 属性分配 UI 交互测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CharacterPanel } from '../../../src/components/panels/CharacterPanel';
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
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    skills: [],
    inventory: {
      equipped: { weapon: null, armor: null, accessory: null },
      backpack: [],
      currency: { gold: 0, silver: 0, copper: 0 },
    },
    hp: 20, maxHp: 20,
    mp: 10, maxMp: 10,
    vital: { hunger: 0, thirst: 0, fatigue: 0, hygiene: 0, morale: 0, wound: 0, temperature: 37, encumbrance: 0 },
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    conditions: [],
    joinedRegion: 'r', joinedWorldDay: 1, currentLocalDay: 1,
    lastActionTime: '', recentHistory: [],
    level: 1, exp: 0, expToNext: 100, unspentAttributePoints: 0,
    classId: null, classSkills: [],
    elementalResistances: { ...ZERO_RESISTANCES } as ElementalResistances,
    learnedAbilities: [],
    defaultLearnedAbilities: [],
    ...overrides,
  } as Character;
}

beforeEach(() => {
  resetClientStores();
});

describe('CharacterPanel v0.6.4 — 属性分配', () => {
  it('unspentAttributePoints=0 时不显示 +1 按钮', () => {
    useCharacterStore.setState({
      character: makeChar({ unspentAttributePoints: 0 }),
      isLoaded: true,
    });
    render(<CharacterPanel />);
    expect(screen.queryByTestId('attr-plus-STR')).toBeNull();
  });

  it('unspentAttributePoints>0 时显示 +1 按钮', () => {
    useCharacterStore.setState({
      character: makeChar({ unspentAttributePoints: 2 }),
      isLoaded: true,
    });
    render(<CharacterPanel />);
    expect(screen.getByTestId('attr-plus-STR')).toBeTruthy();
  });

  it('点击 +1 后属性值变黄高亮, 显示 -1 按钮', () => {
    useCharacterStore.setState({
      character: makeChar({ unspentAttributePoints: 2 }),
      isLoaded: true,
    });
    render(<CharacterPanel />);
    fireEvent.click(screen.getByTestId('attr-plus-STR'));
    // -1 按钮出现
    expect(screen.getByTestId('attr-minus-STR')).toBeTruthy();
  });

  it('点击 -1 撤回分配', () => {
    useCharacterStore.setState({
      character: makeChar({ unspentAttributePoints: 2 }),
      isLoaded: true,
    });
    render(<CharacterPanel />);
    fireEvent.click(screen.getByTestId('attr-plus-STR'));
    expect(screen.getByTestId('attr-minus-STR')).toBeTruthy();
    fireEvent.click(screen.getByTestId('attr-minus-STR'));
    // -1 按钮消失 (pending 清零)
    expect(screen.queryByTestId('attr-minus-STR')).toBeNull();
  });

  it('剩余点数为 0 时 +1 按钮 disabled', () => {
    useCharacterStore.setState({
      character: makeChar({ unspentAttributePoints: 1 }),
      isLoaded: true,
    });
    render(<CharacterPanel />);
    fireEvent.click(screen.getByTestId('attr-plus-STR'));
    // 用完 1 点, 其他 +1 应 disabled
    expect(screen.getByTestId('attr-plus-DEX')).toBeDisabled();
  });

  it('确认分配后 store 更新, 按钮消失', () => {
    useCharacterStore.setState({
      character: makeChar({ unspentAttributePoints: 1 }),
      isLoaded: true,
    });
    render(<CharacterPanel />);
    fireEvent.click(screen.getByTestId('attr-plus-STR'));
    fireEvent.click(screen.getByTestId('attr-confirm'));
    // store 更新
    const s = useCharacterStore.getState().character!;
    expect(s.attributes.STR).toBe(11);
    expect(s.unspentAttributePoints).toBe(0);
    // +1 按钮消失 (unspentPoints=0)
    expect(screen.queryByTestId('attr-plus-STR')).toBeNull();
  });

  it('重置按钮清空预览', () => {
    useCharacterStore.setState({
      character: makeChar({ unspentAttributePoints: 2 }),
      isLoaded: true,
    });
    render(<CharacterPanel />);
    fireEvent.click(screen.getByTestId('attr-plus-STR'));
    fireEvent.click(screen.getByTestId('attr-plus-INT'));
    fireEvent.click(screen.getByTestId('attr-reset'));
    // 确认按钮消失 (pendingTotal=0)
    expect(screen.queryByTestId('attr-confirm')).toBeNull();
    // 属性值恢复原值
    const s = useCharacterStore.getState().character!;
    expect(s.attributes.STR).toBe(10);
    expect(s.attributes.INT).toBe(10);
  });

  it('LevelBar 提示文字: unspentPoints>0 时显示待分配提示', () => {
    useCharacterStore.setState({
      character: makeChar({ unspentAttributePoints: 3 }),
      isLoaded: true,
    });
    render(<CharacterPanel />);
    expect(screen.getByText(/3 个属性点待分配/)).toBeTruthy();
  });
});
