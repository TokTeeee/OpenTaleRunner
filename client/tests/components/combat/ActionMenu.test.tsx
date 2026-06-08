// client/tests/components/combat/ActionMenu.test.tsx
// v0.6.2 Task 14: ActionMenu 6 按钮 (attack/item/defend/wait/flee/ability)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ActionMenu } from '../../../src/components/combat/ActionMenu';
import { useCombatStore } from '../../../src/stores/combatStore';
import { useUIStore } from '../../../src/stores/uiStore';
import { useCharacterStore } from '../../../src/stores/characterStore';
import { ZERO_RESISTANCES } from '../../../src/types/character';
import type { Combatant } from '../../../src/services/combat/types';

const basePlayer: Combatant = {
  id: 'p1', side: 'player', name: 'Hero',
  attributes: { STR: 14, DEX: 14, CON: 12, INT: 16, WIS: 14, CHA: 10 },
  hp: 30, maxHp: 30,
  ap: 6, maxAp: 6,
  mp: 20, maxMp: 20,
  isDead: false, isFleeing: false,
  conditions: [],
  equipped: { weapon: null, armor: null, accessory: null },
  elementalResistances: { ...ZERO_RESISTANCES },
};

const baseState = () => ({
  id: 'test', phase: 'active' as const, round: 1, turn: 1,
  queue: [{ combatantId: 'p1', initiative: 20, rolledAt: 'start' as const }],
  combatants: { p1: basePlayer },
  log: [], startedAt: Date.now(),
});

beforeEach(() => {
  useCombatStore.setState(baseState() as any);
  useUIStore.setState({ openModal: vi.fn() } as any);
  useCharacterStore.setState({ character: { name: '测试勇者' } } as any);
});

describe('ActionMenu', () => {
  it('渲染 6 按钮 (含 ability)', () => {
    render(<ActionMenu playerId="p1" onAction={() => {}} />);
    expect(screen.getByTestId('action-attack')).toBeInTheDocument();
    expect(screen.getByTestId('action-item')).toBeInTheDocument();
    expect(screen.getByTestId('action-defend')).toBeInTheDocument();
    expect(screen.getByTestId('action-wait')).toBeInTheDocument();
    expect(screen.getByTestId('action-flee')).toBeInTheDocument();
    expect(screen.getByTestId('action-ability')).toBeInTheDocument();
  });

  it('玩家回合时 ability 按钮 enabled', () => {
    render(<ActionMenu playerId="p1" onAction={() => {}} />);
    const btn = screen.getByTestId('action-ability');
    expect(btn.getAttribute('data-disabled')).toBe('false');
  });

  it('非玩家回合时菜单仍渲染但 ability 按钮 disabled', () => {
    useCombatStore.setState({ ...baseState(), turn: 99 } as any);
    render(<ActionMenu playerId="p1" onAction={() => {}} />);
    expect(screen.getByTestId('action-menu')).toBeInTheDocument();
    expect(screen.getByTestId('action-ability').getAttribute('data-disabled')).toBe('true');
  });

  it('点 ability 触发 onAction("ability")', () => {
    const onAction = vi.fn();
    render(<ActionMenu playerId="p1" onAction={onAction} />);
    screen.getByTestId('action-ability').click();
    expect(onAction).toHaveBeenCalledWith('ability');
  });
});
