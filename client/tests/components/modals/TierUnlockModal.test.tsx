/**
 * v0.5.3 — TierUnlockModal
 *
 * 覆盖:
 * - character=null: 返回 null
 * - 战斗中: 返回 null
 * - classId=null: 返回 null
 * - level=1 + T1 picked: 返回 null (T2 没解锁)
 * - level=5 + T1 picked: 显示 modal, 3 T2 选项
 * - level=10 + T1+T2 picked: 显示 modal, 3 T3 选项
 * - level=15 + T1+T2+T3 picked: 显示 modal, 3 T4 选项
 * - level=20: 返回 null (max level)
 * - 点 T2 node → setClass (append new skill) + modal 关闭
 */
import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TierUnlockModal } from '../../../src/components/modals/TierUnlockModal';
import { useCharacterStore } from '../../../src/stores/characterStore';
import { useCombatStore } from '../../../src/stores/combatStore';
import type { Character } from '../../../src/types/character';
import { resetClientStores } from '../../utils/resetStores';

function makeChar(level: number, classId: string | null, picked: string[]): Character {
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
    level,
    exp: 0,
    expToNext: 100,
    unspentAttributePoints: 0,
    unspentSkillPoints: 0,
    classId,
    classSkills: picked.map((nodeId) => ({ classId: classId || '', nodeId, unlockedAt: 0 })),
  };
}

beforeEach(() => {
  resetClientStores();
  // 默认: 非战斗
  useCombatStore.setState({ phase: 'idle', isPlayerTurn: false, active: false } as any);
});

describe('TierUnlockModal', () => {
  it('character=null: 返回 null', () => {
    useCharacterStore.setState({ character: null, isLoaded: true });
    const { container } = render(<TierUnlockModal />);
    expect(container.firstChild).toBeNull();
  });

  it('战斗中 (active): 返回 null', () => {
    useCharacterStore.setState({ character: makeChar(5, 'warrior', ['warrior_t1_1']), isLoaded: true });
    useCombatStore.setState({ phase: 'active', isPlayerTurn: false, active: true } as any);
    const { container } = render(<TierUnlockModal />);
    expect(container.firstChild).toBeNull();
  });

  it('classId=null: 返回 null (玩家还没选职业)', () => {
    useCharacterStore.setState({ character: makeChar(5, null, []), isLoaded: true });
    const { container } = render(<TierUnlockModal />);
    expect(container.firstChild).toBeNull();
  });

  it('level=1 + T1 picked: 返回 null (T2 没解锁)', () => {
    useCharacterStore.setState({ character: makeChar(1, 'warrior', ['warrior_t1_1']), isLoaded: true });
    const { container } = render(<TierUnlockModal />);
    expect(container.firstChild).toBeNull();
  });

  it('level=5 + T1 picked: 显示 modal, 3 T2 选项', () => {
    useCharacterStore.setState({ character: makeChar(5, 'warrior', ['warrior_t1_1']), isLoaded: true });
    render(<TierUnlockModal />);
    expect(screen.getByTestId('tier-unlock-modal')).toBeTruthy();
    expect(screen.getByTestId('tier-node-warrior_t2_1')).toBeTruthy();
    expect(screen.getByTestId('tier-node-warrior_t2_2')).toBeTruthy();
    expect(screen.getByTestId('tier-node-warrior_t2_3')).toBeTruthy();
  });

  it('level=10 + T1+T2 picked: 显示 modal, 3 T3 选项', () => {
    useCharacterStore.setState({ character: makeChar(10, 'warrior', ['warrior_t1_1', 'warrior_t2_1']), isLoaded: true });
    render(<TierUnlockModal />);
    expect(screen.getByTestId('tier-unlock-modal')).toBeTruthy();
    expect(screen.getByTestId('tier-node-warrior_t3_1')).toBeTruthy();
    expect(screen.getByTestId('tier-node-warrior_t3_2')).toBeTruthy();
    expect(screen.getByTestId('tier-node-warrior_t3_3')).toBeTruthy();
  });

  it('level=15 + T1+T2+T3 picked: 显示 modal, 3 T4 选项', () => {
    useCharacterStore.setState({
      character: makeChar(15, 'warrior', ['warrior_t1_1', 'warrior_t2_1', 'warrior_t3_1']),
      isLoaded: true,
    });
    render(<TierUnlockModal />);
    expect(screen.getByTestId('tier-unlock-modal')).toBeTruthy();
    expect(screen.getByTestId('tier-node-warrior_t4_1')).toBeTruthy();
  });

  it('level=20 + 12 nodes: 返回 null (全部 4 tier 已满)', () => {
    const allWarrior = [
      'warrior_t1_1', 'warrior_t1_2', 'warrior_t1_3',
      'warrior_t2_1', 'warrior_t2_2', 'warrior_t2_3',
      'warrior_t3_1', 'warrior_t3_2', 'warrior_t3_3',
      'warrior_t4_1', 'warrior_t4_2', 'warrior_t4_3',
    ];
    useCharacterStore.setState({ character: makeChar(20, 'warrior', allWarrior), isLoaded: true });
    const { container } = render(<TierUnlockModal />);
    expect(container.firstChild).toBeNull();
  });

  it('点 T2 node → setClass (append) + modal 关闭', () => {
    useCharacterStore.setState({ character: makeChar(5, 'warrior', ['warrior_t1_1']), isLoaded: true });
    render(<TierUnlockModal />);
    fireEvent.click(screen.getByTestId('tier-node-warrior_t2_1'));
    const c = useCharacterStore.getState().character!;
    expect(c.classSkills).toEqual([
      { classId: 'warrior', nodeId: 'warrior_t1_1', unlockedAt: 0 },
      { classId: 'warrior', nodeId: 'warrior_t2_1', unlockedAt: expect.any(Number) },
    ]);
    // modal 自动消失 (重渲染时, 已有 T2 节点 → pendingTierChoice 返回 null)
    expect(screen.queryByTestId('tier-unlock-modal')).toBeNull();
  });
});
