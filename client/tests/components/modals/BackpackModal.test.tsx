/**
 * 装备对比浮窗 — BackpackModal hover 集成测试
 *
 * 覆盖:
 * - hover 可装备物品 → 触发浮窗 (100ms 延迟后)
 * - mouseleave → 浮窗消失
 * - hover 不可装备物品 (药水) → 不弹浮窗
 * - hover 装备物品: 浮窗有 current 槽位装备 → 显示 side-by-side 对比
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackpackModal } from '../../../src/components/modals/BackpackModal';
import { useCharacterStore } from '../../../src/stores/characterStore';
import { resetClientStores } from '../../utils/resetStores';
import type { Item } from '../../../src/types/item';

vi.mock('../../../src/hooks/usePMEngine', () => ({
  usePMEngine: () => ({ submitCustom: vi.fn() }),
}));

function seedCharacter(
  backpack: Item[],
  equipped: { weapon: Item | null; armor: Item | null; accessory: Item | null },
): void {
  useCharacterStore.getState().setCharacter({
    characterId: 'c1',
    playerId: 'p1',
    name: 'Test',
    race: '人类',
    background: '',
    appearance: '',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    skills: [],
    inventory: { equipped, backpack, currency: { gold: 0, silver: 0, copper: 0 } },
    hp: 20,
    maxHp: 20,
    vital: { hunger: 0, thirst: 0, fatigue: 0, hygiene: 0, morale: 0, wound: 0, temperature: 0, encumbrance: 0 },
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    conditions: [],
    joinedRegion: 'r',
    joinedWorldDay: 1,
    currentLocalDay: 1,
    lastActionTime: '',
    recentHistory: [],
  });
}

function makeWeapon(overrides: Partial<Item> = {}): Item {
  return { name: '铁剑', category: 'weapon', effects: [], ...overrides };
}

function makePotion(overrides: Partial<Item> = {}): Item {
  return { name: '治疗药水', category: 'consumable', effects: [], quantity: 1, ...overrides };
}

/** 找到包含指定文字的 button 元素 (因为 mouseenter 不会冒泡, 必须 fire 在 button 上) */
function findItemButton(name: string): HTMLElement {
  const span = screen.getByText(name);
  const btn = span.closest('button');
  if (!btn) throw new Error(`No button found containing text: ${name}`);
  return btn as HTMLElement;
}

describe('BackpackModal hover 集成', () => {
  beforeEach(() => resetClientStores());
  afterEach(() => cleanup());

  it('hover 可装备物品 → 触发浮窗', async () => {
    const user = userEvent.setup();
    seedCharacter([makeWeapon()], { weapon: null, armor: null, accessory: null });
    render(<BackpackModal onClose={() => {}} />);
    await user.hover(findItemButton('铁剑'));
    // 100ms 延迟, waitFor 等 React 重新渲染
    await waitFor(() => {
      expect(screen.getByTestId('item-compare-tooltip')).toBeInTheDocument();
    }, { timeout: 500 });
  });

  it('mouseleave → 浮窗消失', async () => {
    const user = userEvent.setup();
    seedCharacter([makeWeapon()], { weapon: null, armor: null, accessory: null });
    render(<BackpackModal onClose={() => {}} />);
    const item = findItemButton('铁剑');
    await user.hover(item);
    await waitFor(() => {
      expect(screen.getByTestId('item-compare-tooltip')).toBeInTheDocument();
    }, { timeout: 500 });
    await user.unhover(item);
    expect(screen.queryByTestId('item-compare-tooltip')).toBeNull();
  });

  it('hover 不可装备物品 (药水) → 不弹浮窗', async () => {
    const user = userEvent.setup();
    seedCharacter([makePotion()], { weapon: null, armor: null, accessory: null });
    render(<BackpackModal onClose={() => {}} />);
    await user.hover(findItemButton('治疗药水'));
    // 等 150ms 确认 100ms 延迟过去后仍不弹
    await new Promise((r) => setTimeout(r, 150));
    expect(screen.queryByTestId('item-compare-tooltip')).toBeNull();
  });

  it('hover 装备物品: 浮窗有 current 槽位装备 → 显示 side-by-side 对比', async () => {
    const user = userEvent.setup();
    const current = makeWeapon({
      name: '短剑',
      effects: [{ id: 'e1', type: 'attribute_mod', value: { STR: 0 }, description: '属性' }],
    });
    const candidate = makeWeapon({
      name: '铁剑',
      effects: [{ id: 'e2', type: 'attribute_mod', value: { STR: 2 }, description: '属性' }],
    });
    seedCharacter([candidate], { weapon: current, armor: null, accessory: null });
    render(<BackpackModal onClose={() => {}} />);
    await user.hover(findItemButton('铁剑'));
    await waitFor(() => {
      expect(screen.getByTestId('item-compare-current-name')).toHaveTextContent('短剑');
      expect(screen.getByTestId('item-compare-candidate-name')).toHaveTextContent('铁剑');
      expect(screen.getByTestId('item-compare-deltas')).toBeInTheDocument();
    }, { timeout: 500 });
  });
});
