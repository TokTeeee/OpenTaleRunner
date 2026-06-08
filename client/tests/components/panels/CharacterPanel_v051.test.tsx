/**
 * CharacterPanel v0.5.14 — 头部职业 + 属性压缩 + 折叠次要 + Modal 触发
 */
import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CharacterPanel } from '../../../src/components/panels/CharacterPanel';
import { useCharacterStore } from '../../../src/stores/characterStore';
import { resetClientStores } from '../../utils/resetStores';
import type { Character, ElementalResistances } from '../../../src/types/character';
import { ZERO_RESISTANCES } from '../../../src/types/character';

function makeBaseChar(overrides: Partial<Character> = {}): Character {
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
    classId: null,
    classSkills: [],
    // v0.6.2
    elementalResistances: { ...ZERO_RESISTANCES } as ElementalResistances,
    learnedAbilities: [],
    defaultLearnedAbilities: [],
    ...overrides,
  } as Character;
}

beforeEach(() => {
  resetClientStores();
});

describe('CharacterPanel v0.5.14 — 头部职业 (classId 非空)', () => {
  it('显示 "种族：人类，职业：战士 ▼" 可点击', () => {
    useCharacterStore.setState({
      character: makeBaseChar({ classId: 'warrior' }),
      isLoaded: true,
    });
    render(<CharacterPanel />);
    const btn = screen.getByTestId('panel-class-button');
    expect(btn).toBeTruthy();
    // 按钮只含职业名 + ▼
    expect(btn.textContent).toContain('战士');
    expect(btn.textContent).toContain('▼');
    // 按钮外的副标题容器含种族 + 职业
    const sub = btn.parentElement;
    expect(sub?.textContent).toContain('人类');
    expect(sub?.textContent).toContain('战士');
  });
});

describe('CharacterPanel v0.5.14 — 头部职业 (无职业)', () => {
  it('无职业时显示 "无职业" 灰色不可点击', () => {
    useCharacterStore.setState({
      character: makeBaseChar({ classId: null }),
      isLoaded: true,
    });
    render(<CharacterPanel />);
    const noClass = screen.getByTestId('panel-class-none');
    expect(noClass.textContent).toContain('无职业');
    expect(noClass).not.toHaveAttribute('data-clickable');
  });
});

describe('CharacterPanel v0.5.14 — Modal 触发', () => {
  it('点击职业按钮打开 ClassSkillTreeModal', () => {
    useCharacterStore.setState({
      character: makeBaseChar({ classId: 'warrior' }),
      isLoaded: true,
    });
    render(<CharacterPanel />);
    fireEvent.click(screen.getByTestId('panel-class-button'));
    expect(screen.getByTestId('class-skill-tree-modal')).toBeTruthy();
  });
});

describe('CharacterPanel v0.5.14 — 属性区压缩', () => {
  it('AttributeRadar svg 是 140×100 (v0.5.14 优化)', () => {
    useCharacterStore.setState({
      character: makeBaseChar(),
      isLoaded: true,
    });
    const { container } = render(<CharacterPanel />);
    const radar = container.querySelector('[data-testid="attribute-radar"]');
    expect(radar).toBeTruthy();
    const svg = radar!.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('140');
    expect(svg?.getAttribute('height')).toBe('100');
  });

  it('属性文字用 grid-cols-2 chip 形式', () => {
    useCharacterStore.setState({
      character: makeBaseChar(),
      isLoaded: true,
    });
    const { container } = render(<CharacterPanel />);
    const attrGrid = container.querySelector('[data-testid="attribute-grid"]');
    expect(attrGrid).toBeTruthy();
    expect(attrGrid!.className).toContain('grid-cols-2');
  });
});

describe('CharacterPanel v0.5.14 — 折叠次要内容', () => {
  it('声望 section 渲染为 <details data-testid="panel-reputation-details">', () => {
    useCharacterStore.setState({
      character: makeBaseChar(),
      isLoaded: true,
    });
    const { container } = render(<CharacterPanel />);
    expect(container.querySelector('[data-testid="panel-reputation-details"]')).toBeTruthy();
  });

  it('装备 section 渲染为 <details data-testid="panel-equipment-details">', () => {
    useCharacterStore.setState({
      character: makeBaseChar(),
      isLoaded: true,
    });
    const { container } = render(<CharacterPanel />);
    expect(container.querySelector('[data-testid="panel-equipment-details"]')).toBeTruthy();
  });

  it('货币 section 渲染为 <details data-testid="panel-currency-details">', () => {
    useCharacterStore.setState({
      character: makeBaseChar(),
      isLoaded: true,
    });
    const { container } = render(<CharacterPanel />);
    expect(container.querySelector('[data-testid="panel-currency-details"]')).toBeTruthy();
  });

  it('背包 section 渲染为 <details data-testid="panel-backpack-details">', () => {
    const item: any = { id: 'i1', name: '药草', type: 'consumable' };
    useCharacterStore.setState({
      character: makeBaseChar({
        inventory: {
          equipped: { weapon: null, armor: null, accessory: null },
          backpack: [item],
          currency: { gold: 0, silver: 0, copper: 0 },
        },
      }),
      isLoaded: true,
    });
    const { container } = render(<CharacterPanel />);
    expect(container.querySelector('[data-testid="panel-backpack-details"]')).toBeTruthy();
  });
});
