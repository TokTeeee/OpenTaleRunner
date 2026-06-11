/**
 * v0.5.3 — GuildClassModal 集成测试
 *
 * 覆盖:
 * - open=false: 返回 null
 * - character=null: 返回 null
 * - classId 已有: 返回 null (modal 隐藏)
 * - classId=null + open=true: 显示 5 选项 (4 classes + 返回)
 * - 选 "无职业" (返回) → classId=null, classSkills=[] (不变), modal 关闭
 * - 选 class 然后 T1 node → setClass(classId, [t1_node]) + onClose
 * - 选 class 后可返回主菜单
 *
 * 注: PATCH /class 是异步的, 测试只验证本地 store 变化. 网络层由 useActionSubmit / fetch 验证.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { GuildClassModal } from '../../../src/components/modals/GuildClassModal';
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
    unspentSkillPoints: 0,
    classId,
    classSkills: picked.map((nodeId) => ({ classId: classId || '', nodeId, unlockedAt: 0 })),
  };
}

beforeEach(() => {
  resetClientStores();
  useCharacterStore.setState({ character: makeChar(null, []), isLoaded: true });
});

describe('GuildClassModal', () => {
  it('open=false: 返回 null', () => {
    const { container } = render(<GuildClassModal open={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('character=null: 返回 null', () => {
    useCharacterStore.setState({ character: null, isLoaded: true });
    const { container } = render(<GuildClassModal open={true} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('classId 已有: 返回 null (modal 隐藏)', () => {
    useCharacterStore.setState({ character: makeChar('warrior', ['warrior_t1_1']), isLoaded: true });
    const { container } = render(<GuildClassModal open={true} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('classId=null + open=true: 显示 4 职业选项', () => {
    render(<GuildClassModal open={true} onClose={() => {}} />);
    expect(screen.getByTestId('guild-class-modal')).toBeTruthy();
    expect(screen.getByTestId('class-option-warrior')).toBeTruthy();
    expect(screen.getByTestId('class-option-cleric')).toBeTruthy();
    expect(screen.getByTestId('class-option-mage')).toBeTruthy();
    expect(screen.getByTestId('class-option-thief')).toBeTruthy();
  });

  it('点 "返回" 关闭 modal 但不修改 classId (classId 仍为 null)', () => {
    const onClose = vi.fn();
    render(<GuildClassModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('class-option-cancel'));
    expect(onClose).toHaveBeenCalled();
    const c = useCharacterStore.getState().character!;
    expect(c.classId).toBeNull();
    expect(c.classSkills).toEqual([]);
  });

  it('选 class 然后 T1 node → setClass + onClose', () => {
    const onClose = vi.fn();
    render(<GuildClassModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('class-option-warrior'));
    // 进入 T1 选择
    expect(screen.getByTestId('t1-node-warrior_t1_1')).toBeTruthy();
    fireEvent.click(screen.getByTestId('t1-node-warrior_t1_1'));
    const c = useCharacterStore.getState().character!;
    expect(c.classId).toBe('warrior');
    expect(c.classSkills).toEqual([
      { classId: 'warrior', nodeId: 'warrior_t1_1', unlockedAt: expect.any(Number) },
    ]);
    expect(onClose).toHaveBeenCalled();
  });

  it('选 class 后可点 "返回" 回到主菜单', () => {
    render(<GuildClassModal open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('class-option-mage'));
    expect(screen.getByTestId('t1-node-mage_t1_1')).toBeTruthy();
    // 返回主菜单
    fireEvent.click(screen.getByTestId('class-option-back'));
    expect(screen.getByTestId('class-option-warrior')).toBeTruthy();
    // classId 还没改
    const c = useCharacterStore.getState().character!;
    expect(c.classId).toBeNull();
  });
});
