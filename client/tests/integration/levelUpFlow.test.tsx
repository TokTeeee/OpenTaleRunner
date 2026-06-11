/**
 * v0.5.7 — LevelUp 端到端集成测试
 *
 * 覆盖 spec 7 个状态跃迁:
 *   战斗 → EXP 事件 → subscriber 聚合 → PATCH /exp → 服务端算新 level
 *   → 写 store → TierUnlockModal 弹 → 玩家选节点 → PATCH /class
 *
 * 与 guild.test.tsx 的区别:
 *   guild.test.tsx 用 grantExp() 推 level, 跳过了事件层; 本测试验的是
 *   event→subscriber→PATCH 契约, 是 v0.5.4 audit Gap #1 的回归网。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { eventBus } from '../../src/services/event/EventBus';
import { EVENTS } from '../../src/services/event/events';
import { useCharacterStore } from '../../src/stores/characterStore';
import { useCombatStore } from '../../src/stores/combatStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { subscribeCharacterExpEvents } from '../../src/services/level/subscribeCharacterEvents';
import { GuildClassModal } from '../../src/components/modals/GuildClassModal';
import { TierUnlockModal } from '../../src/components/modals/TierUnlockModal';
import type { Character } from '../../src/types/character';
import { resetClientStores } from '../utils/resetStores';

// -------------------------------------------------------------------------
// 测试夹具
// -------------------------------------------------------------------------

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
  useCombatStore.setState({ phase: 'idle', isPlayerTurn: false, active: false } as any);
  useAuthStore.setState({ token: 'tk' });
  useSettingsStore.setState({ server: { endpoint: 'http://api.test' } } as never);
});

afterEach(() => {
  eventBus.clear();
  vi.restoreAllMocks();
});

describe('v0.5.7 — LevelUp 端到端链路 (L1→L5+T2)', () => {
  it('战斗 → EXP 事件 → subscriber 聚合 → PATCH /exp → L5 → TierUnlockModal → 选 T2 → PATCH /class', async () => {
    // ---------------------------------------------------------------------
    // 准备 mock server: 路由 /exp 返 L5, 路由 /class 返 ok
    // ---------------------------------------------------------------------
    let expPatchCalls = 0;
    let classPatchCalls = 0;
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/exp') && init.method === 'PATCH') {
        expPatchCalls += 1;
        return new Response(
          JSON.stringify({ level: 5, exp: 0, expToNext: 600, unspentAttributePoints: 0 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/class') && init.method === 'PATCH') {
        classPatchCalls += 1;
        return new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error(`unexpected fetch call: ${init.method} ${url}`);
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock as unknown as typeof fetch);

    // ---------------------------------------------------------------------
    // Step 0: 角色 L1, 无职业, 无 classId
    // ---------------------------------------------------------------------
    act(() => {
      useCharacterStore.setState({ character: makeChar(1, null, []), isLoaded: true });
    });
    expect(useCharacterStore.getState().character!.classId).toBeNull();
    expect(useCharacterStore.getState().character!.level).toBe(1);

    // ---------------------------------------------------------------------
    // Step 1: 注册 EXP 订阅者 (debounce 200ms 加速)
    // ---------------------------------------------------------------------
    const unsub = subscribeCharacterExpEvents({ debounceMs: 200 });

    // ---------------------------------------------------------------------
    // Step 2: GuildClassModal 弹出, 选 warrior + T1 → setClass 写入
    // ---------------------------------------------------------------------
    const onCloseGuild = vi.fn();
    const { unmount: unmountGuild } = render(<GuildClassModal open={true} onClose={onCloseGuild} />);
    expect(screen.getByTestId('guild-class-modal')).toBeTruthy();
    fireEvent.click(screen.getByTestId('class-option-warrior'));
    fireEvent.click(screen.getByTestId('t1-node-warrior_t1_1'));
    const c1 = useCharacterStore.getState().character!;
    expect(c1.classId).toBe('warrior');
    expect(c1.classSkills).toHaveLength(1);
    expect(c1.classSkills[0].nodeId).toBe('warrior_t1_1');
    expect(onCloseGuild).toHaveBeenCalledTimes(1);
    // guild PATCH 已经发出 (GuildClassModal 内部 setClass 后异步 PATCH)
    await new Promise((r) => setTimeout(r, 30));
    expect(classPatchCalls).toBe(1);

    // ---------------------------------------------------------------------
    // Step 3: emit 战斗事件 12 次 (10 hit + 1 kill + 1 end.victory)
    //          期望: 45 exp 累加, debounce 200ms 后单次 PATCH /exp
    // ---------------------------------------------------------------------
    for (let i = 0; i < 10; i += 1) {
      eventBus.emit(EVENTS.COMBAT_HIT, { attackerId: 'p1', targetId: 'e1', damage: 7, isCrit: false });
    }
    eventBus.emit(EVENTS.COMBAT_KILL, { killerId: 'p1', victimId: 'e1' });
    eventBus.emit(EVENTS.COMBAT_END, { outcome: 'victory' });

    // ---------------------------------------------------------------------
    // Step 4: 等 debounce 窗口 (200ms) + 一次 microtask flush + fetch resolve
    //          留 100ms 余量避免 ci 卡顿 false negative
    // ---------------------------------------------------------------------
    await new Promise((r) => setTimeout(r, 300));

    // ---------------------------------------------------------------------
    // Step 5: 验 PATCH /exp 叫了一次, amount=45, difficulty=normal
    // ---------------------------------------------------------------------
    expect(expPatchCalls).toBe(1);
    // 找到那次 /exp PATCH (GuildClassModal 先发了一次 /class PATCH, 所以
    // mock.calls[0] 是 /class, 不是 /exp)
    const expCall = fetchMock.mock.calls.find(
      ([u, i]) => typeof u === 'string' && u.endsWith('/exp') && (i as RequestInit).method === 'PATCH',
    ) as [string, RequestInit] | undefined;
    expect(expCall).toBeDefined();
    const [expUrl, expInit] = expCall!;
    expect(expUrl).toBe('http://api.test/api/v1/characters/c1/exp');
    expect(expInit.method).toBe('PATCH');
    expect(JSON.parse(expInit.body as string)).toEqual({ amount: 45, difficulty: 'normal' });

    // ---------------------------------------------------------------------
    // Step 6: 验 applyServerExpGrant 写入 (character.level === 5)
    // ---------------------------------------------------------------------
    const c2 = useCharacterStore.getState().character!;
    expect(c2.level).toBe(5);
    expect(c2.exp).toBe(0);
    expect(c2.expToNext).toBe(600);

    // ---------------------------------------------------------------------
    // Step 7: 卸 GuildClassModal, 挂 TierUnlockModal
    // ---------------------------------------------------------------------
    unmountGuild();
    render(<TierUnlockModal />);
    expect(screen.getByTestId('tier-unlock-modal')).toBeTruthy();
    expect(screen.getByTestId('tier-node-warrior_t2_1')).toBeTruthy();
    expect(screen.getByTestId('tier-node-warrior_t2_2')).toBeTruthy();
    expect(screen.getByTestId('tier-node-warrior_t2_3')).toBeTruthy();

    // ---------------------------------------------------------------------
    // Step 8: 点 T2 节点 → setClass append + PATCH /class (累计 2 次)
    // ---------------------------------------------------------------------
    fireEvent.click(screen.getByTestId('tier-node-warrior_t2_1'));
    const c3 = useCharacterStore.getState().character!;
    expect(c3.classSkills).toHaveLength(2);
    expect(c3.classSkills[0].nodeId).toBe('warrior_t1_1');
    expect(c3.classSkills[1].nodeId).toBe('warrior_t2_1');
    // tier PATCH 异步发出 (TierUnlockModal.handlePick 内部)
    await new Promise((r) => setTimeout(r, 30));
    expect(classPatchCalls).toBe(2);

    // ---------------------------------------------------------------------
    // Step 9: 清理
    // ---------------------------------------------------------------------
    unsub();
  });
});
