/**
 * v0.5.3 — Guild + Tier Unlock 端到端集成测试
 *
 * 覆盖 spec §4.3.2 / §4.4 / §4.5 / §4.8 集成层:
 * - 公会流程: classId=null 进入 → modal 出现 → 选职业 → 关闭 → classId 写入
 * - 公会流程: 已有 classId 进入 → modal 不出现
 * - Tier 解锁: L1→L5 → TierUnlockModal 自动开 → 选节点 → classSkills 增长
 * - Tier 解锁: 战斗中 modal 隐藏, 战斗结束才出现
 * - Tier 解锁: L10 / L15 同样自动开, 直到 4 tier 选满
 * - 完整链路: 创建无职业 → 公会补 warrior T1 → 升 L5 → modal 弹 T2 → 选 T2 → 效果聚合生效
 *
 * 注: 这两个 modal 都是"派生显示"组件, 测试时手动挂载而不是依赖 App.tsx 路由.
 *     PATCH /class 异步请求在 unit test 中用 fetch mock 验证, 这里只验证 store 状态流.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { GuildClassModal } from '../../src/components/modals/GuildClassModal';
import { TierUnlockModal } from '../../src/components/modals/TierUnlockModal';
import { useCharacterStore } from '../../src/stores/characterStore';
import { useCombatStore } from '../../src/stores/combatStore';
import { aggregateClassEffects } from '../../src/services/class/classEffects';
import { grantExp } from '../../src/services/level/grantExp';
import { pendingTierChoice } from '../../src/services/class/classService';
import type { Character } from '../../src/types/character';
import { resetClientStores } from '../utils/resetStores';

function makeChar(
  level: number,
  classId: string | null,
  picked: string[],
): Character {
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
  useCombatStore.setState({ phase: 'idle', isPlayerTurn: false, active: false } as any);
  // 静默网络请求
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
});

describe('Guild 公会流程 (集成)', () => {
  it('classId=null 玩家进入公会: modal 出现, 4 职业选项', () => {
    useCharacterStore.setState({ character: makeChar(1, null, []), isLoaded: true });
    render(<GuildClassModal open={true} onClose={() => {}} />);
    expect(screen.getByTestId('guild-class-modal')).toBeTruthy();
    // 4 个职业 + 1 个返回 = 5 按钮
    expect(screen.getByTestId('class-option-warrior')).toBeTruthy();
    expect(screen.getByTestId('class-option-cleric')).toBeTruthy();
    expect(screen.getByTestId('class-option-mage')).toBeTruthy();
    expect(screen.getByTestId('class-option-thief')).toBeTruthy();
  });

  it('已有 classId 玩家进入公会: modal 不出现 (welcome back 对话)', () => {
    useCharacterStore.setState({
      character: makeChar(5, 'warrior', ['warrior_t1_1']),
      isLoaded: true,
    });
    const { container } = render(<GuildClassModal open={true} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('公会选职业 + T1 节点 → setClass 写入 + modal 关闭', () => {
    useCharacterStore.setState({ character: makeChar(1, null, []), isLoaded: true });
    const onClose = vi.fn();
    render(<GuildClassModal open={true} onClose={onClose} />);

    // 1) 选职业
    fireEvent.click(screen.getByTestId('class-option-thief'));
    // 2) 选 T1 节点
    fireEvent.click(screen.getByTestId('t1-node-thief_t1_1'));

    // 验证 store: classId + classSkills
    const c = useCharacterStore.getState().character!;
    expect(c.classId).toBe('thief');
    expect(c.classSkills).toEqual([
      { classId: 'thief', nodeId: 'thief_t1_1', unlockedAt: expect.any(Number) },
    ]);
    // 验证 modal 关闭
    expect(onClose).toHaveBeenCalled();
  });

  it('公会"暂不选择"不修改 classId, 仅关闭', () => {
    useCharacterStore.setState({ character: makeChar(1, null, []), isLoaded: true });
    const onClose = vi.fn();
    render(<GuildClassModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('class-option-cancel'));
    const c = useCharacterStore.getState().character!;
    expect(c.classId).toBeNull();
    expect(c.classSkills).toEqual([]);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Tier 解锁流程 (集成)', () => {
  it('L1 玩家 (T1 已选): modal 不出现 (T2 未解锁)', () => {
    useCharacterStore.setState({
      character: makeChar(1, 'warrior', ['warrior_t1_1']),
      isLoaded: true,
    });
    const { container } = render(<TierUnlockModal />);
    expect(container.firstChild).toBeNull();
  });

  it('L5 玩家 (T1 已选): modal 自动出现 + 3 T2 选项', () => {
    useCharacterStore.setState({
      character: makeChar(5, 'warrior', ['warrior_t1_1']),
      isLoaded: true,
    });
    render(<TierUnlockModal />);
    expect(screen.getByTestId('tier-unlock-modal')).toBeTruthy();
    expect(screen.getByTestId('tier-node-warrior_t2_1')).toBeTruthy();
    expect(screen.getByTestId('tier-node-warrior_t2_2')).toBeTruthy();
    expect(screen.getByTestId('tier-node-warrior_t2_3')).toBeTruthy();
  });

  it('L5 战斗中: modal 隐藏 (避免遮挡 QTE 提示)', () => {
    useCharacterStore.setState({
      character: makeChar(5, 'warrior', ['warrior_t1_1']),
      isLoaded: true,
    });
    useCombatStore.setState({ phase: 'active', isPlayerTurn: true, active: true } as any);
    const { container } = render(<TierUnlockModal />);
    expect(container.firstChild).toBeNull();
  });

  it('L5 战斗结束 (settled) 后: modal 出现', () => {
    useCharacterStore.setState({
      character: makeChar(5, 'warrior', ['warrior_t1_1']),
      isLoaded: true,
    });
    // 战斗结束: phase=settled
    useCombatStore.setState({ phase: 'settled', isPlayerTurn: false, active: false } as any);
    render(<TierUnlockModal />);
    expect(screen.getByTestId('tier-unlock-modal')).toBeTruthy();
  });

  it('点 T2 node → append + modal 自动消失', () => {
    useCharacterStore.setState({
      character: makeChar(5, 'warrior', ['warrior_t1_1']),
      isLoaded: true,
    });
    render(<TierUnlockModal />);
    fireEvent.click(screen.getByTestId('tier-node-warrior_t2_1'));

    const c = useCharacterStore.getState().character!;
    expect(c.classSkills).toHaveLength(2);
    expect(c.classSkills[1].nodeId).toBe('warrior_t2_1');
    // modal 自动消失 (重渲染时 pendingTierChoice 返回 null)
    expect(screen.queryByTestId('tier-unlock-modal')).toBeNull();
  });

  it('L10 玩家 (T1+T2 已选): 自动弹 T3 modal', () => {
    useCharacterStore.setState({
      character: makeChar(10, 'warrior', ['warrior_t1_1', 'warrior_t2_1']),
      isLoaded: true,
    });
    render(<TierUnlockModal />);
    expect(screen.getByTestId('tier-unlock-modal')).toBeTruthy();
    expect(screen.getByTestId('tier-node-warrior_t3_1')).toBeTruthy();
  });

  it('L15 玩家 (T1+T2+T3 已选): 自动弹 T4 modal', () => {
    useCharacterStore.setState({
      character: makeChar(15, 'warrior', ['warrior_t1_1', 'warrior_t2_1', 'warrior_t3_1']),
      isLoaded: true,
    });
    render(<TierUnlockModal />);
    expect(screen.getByTestId('tier-unlock-modal')).toBeTruthy();
    expect(screen.getByTestId('tier-node-warrior_t4_1')).toBeTruthy();
  });
});

describe('完整链路: 创建 → 公会 → 升级 → tier 解锁 → 效果聚合', () => {
  it('L1 无职业 → 公会选 thief T1 → 升 L5 → tier 弹 T2 → 选 T2 → 效果聚合生效', () => {
    // Step 1: 角色 L1 无职业
    useCharacterStore.setState({ character: makeChar(1, null, []), isLoaded: true });

    // Step 2: 进入公会 → 选 thief + T1
    const onCloseGuild = vi.fn();
    const { rerender } = render(<GuildClassModal open={true} onClose={onCloseGuild} />);
    fireEvent.click(screen.getByTestId('class-option-thief'));
    fireEvent.click(screen.getByTestId('t1-node-thief_t1_1'));
    expect(useCharacterStore.getState().character!.classId).toBe('thief');
    expect(useCharacterStore.getState().character!.classSkills).toHaveLength(1);
    expect(onCloseGuild).toHaveBeenCalled();

    // Step 3: 模拟升级 L1 → L5 (用 grantExp 推算)
    // expToNext(L) = round(100 * L^1.5): L1→100, L2→283, L3→520, L4→800
    const c1 = useCharacterStore.getState().character!;
    const expTo5 = 100 + 283 + 520 + 800;
    const granted = grantExp(
      { level: c1.level, exp: c1.exp, unspentAttributePoints: c1.unspentAttributePoints },
      expTo5,
    );
    expect(granted.level).toBe(5);

    // 写入新 level
    act(() => {
      useCharacterStore.setState({
        character: {
          ...c1,
          level: granted.level,
          exp: granted.exp,
          unspentAttributePoints: granted.unspentAttributePoints,
        },
      });
    });

    // Step 4: 验证 pendingTierChoice 返回 2
    const c2 = useCharacterStore.getState().character!;
    expect(pendingTierChoice(c2)).toBe(2);

    // Step 5: 关闭 guild modal (在 rerender 之前 unmount)
    rerender(<div />);

    // Step 6: 挂载 TierUnlockModal → 选 T2
    render(<TierUnlockModal />);
    expect(screen.getByTestId('tier-unlock-modal')).toBeTruthy();
    fireEvent.click(screen.getByTestId('tier-node-thief_t2_1'));

    // Step 7: 验证 classSkills 增长 + 效果聚合
    const c3 = useCharacterStore.getState().character!;
    expect(c3.classSkills).toHaveLength(2);
    const bonus = aggregateClassEffects(c3);
    // thief_t1_1 = 迅捷: DEX+1
    // thief_t2_1 = 灵巧: DEX+1 (累积 = 2)
    expect(bonus.attributeMods.DEX).toBe(2);
  });
});
