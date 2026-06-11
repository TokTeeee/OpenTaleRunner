/**
 * v0.5.8 — subscribeCharacterExpEvents 失败链路 e2e
 *
 * 覆盖 spec §2.3 A-1 item:
 *   - PATCH /exp 失败 (非 2xx) 时不写 store
 *   - 失败后 emit 新事件, debounce 后能触发新的 PATCH
 *   - 新的 PATCH 成功时, applyServerExpGrant 正常写入
 *
 * **不** 覆盖 (留 v0.6 spec):
 *   - 真 retry 队列: 当前 flush() 在 fetch 前把 pending 清零,
 *     失败时 amount 直接丢弃, 不回填。要测 retry 队列合并
 *     需先改 subscribeCharacterEvents.ts:49-87 行为, 不在本 PR 范围。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eventBus } from '../../src/services/event/EventBus';
import { EVENTS } from '../../src/services/event/events';
import { useCharacterStore } from '../../src/stores/characterStore';
import { useCombatStore } from '../../src/stores/combatStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { subscribeCharacterExpEvents } from '../../src/services/level/subscribeCharacterEvents';
import type { Character } from '../../src/types/character';
import { resetClientStores } from '../utils/resetStores';

function makeChar(level: number): Character {
  return {
    characterId: 'c1',
    playerId: 'p1',
    name: 'Test',
    race: '人类',
    background: '',
    appearance: '',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    skills: [],
    inventory: { items: [], equipped: { weapon: null, armor: null, accessory: null }, currency: { gold: 0, silver: 0, copper: 0 } },
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
    classId: null,
    classSkills: [],
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

describe('v0.5.8 — EXP PATCH failure path', () => {
  it('PATCH /exp 失败时不写 store, 后续事件仍能触发新 PATCH', async () => {
    // ---------------------------------------------------------------------
    // Step 2: 准备 mock server — 第一次返 503, 第二次返 200
    // ---------------------------------------------------------------------
    let fetchCalls = 0;
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      fetchCalls += 1;
      if (url.endsWith('/exp') && init.method === 'PATCH') {
        if (fetchCalls === 1) {
          return new Response('{"error":"rate_limited"}', {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        // 第二次: 成功
        return new Response(
          JSON.stringify({ level: 2, exp: 0, expToNext: 283, unspentAttributePoints: 0 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`unexpected fetch call: ${init.method} ${url}`);
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock as unknown as typeof fetch);

    // ---------------------------------------------------------------------
    // Step 0: 角色 L1 写入 store
    // ---------------------------------------------------------------------
    useCharacterStore.setState({ character: makeChar(1), isLoaded: true });
    expect(useCharacterStore.getState().character!.level).toBe(1);

    // ---------------------------------------------------------------------
    // Step 1: 注册 EXP 订阅者 (debounce 150ms 加速)
    // ---------------------------------------------------------------------
    const unsub = subscribeCharacterExpEvents({ debounceMs: 150 });

    // ---------------------------------------------------------------------
    // Step 3: emit COMBAT_KILL (5 exp) — 期望 PATCH /exp 失败
    // ---------------------------------------------------------------------
    eventBus.emit(EVENTS.COMBAT_KILL, { killerId: 'p1', victimId: 'e1' });

    // ---------------------------------------------------------------------
    // Step 4: 等 debounce 窗口 + 一次 microtask flush
    // ---------------------------------------------------------------------
    await new Promise((r) => setTimeout(r, 250));

    // ---------------------------------------------------------------------
    // Step 5: 验 fetch 被叫 1 次, 第 1 次 PATCH /exp 返 503
    // ---------------------------------------------------------------------
    expect(fetchCalls).toBe(1);
    const [url1, init1] = (fetchMock.mock.calls[0] as [string, RequestInit]);
    expect(url1).toBe('http://api.test/api/v1/characters/c1/exp');
    expect(init1.method).toBe('PATCH');
    expect(JSON.parse(init1.body as string)).toEqual({ amount: 5, difficulty: 'normal' });

    // ---------------------------------------------------------------------
    // Step 6: 验失败不写 store (level 仍 1, 失败 amount 被丢弃)
    // ---------------------------------------------------------------------
    const c1 = useCharacterStore.getState().character!;
    expect(c1.level).toBe(1);
    expect(c1.exp).toBe(0);

    // ---------------------------------------------------------------------
    // Step 7: emit COMBAT_HIT ×3 (3 exp) — 期望新 PATCH /exp 成功
    // ---------------------------------------------------------------------
    for (let i = 0; i < 3; i += 1) {
      eventBus.emit(EVENTS.COMBAT_HIT, { attackerId: 'p1', targetId: 'e1', damage: 7, isCrit: false });
    }

    // ---------------------------------------------------------------------
    // Step 8: 等 debounce 窗口
    // ---------------------------------------------------------------------
    await new Promise((r) => setTimeout(r, 250));

    // ---------------------------------------------------------------------
    // Step 9: 验 fetch 被叫 2 次, 第二次 PATCH /exp 返 200, body amount=3
    // ---------------------------------------------------------------------
    expect(fetchCalls).toBe(2);
    const [url2, init2] = (fetchMock.mock.calls[1] as [string, RequestInit]);
    expect(url2).toBe('http://api.test/api/v1/characters/c1/exp');
    expect(init2.method).toBe('PATCH');
    expect(JSON.parse(init2.body as string)).toEqual({ amount: 3, difficulty: 'normal' });

    // ---------------------------------------------------------------------
    // Step 10: 验 applyServerExpGrant 写入 (level === 2)
    // ---------------------------------------------------------------------
    const c2 = useCharacterStore.getState().character!;
    expect(c2.level).toBe(2);
    expect(c2.exp).toBe(0);
    expect(c2.expToNext).toBe(283);

    // ---------------------------------------------------------------------
    // Step 11: cleanup
    // ---------------------------------------------------------------------
    unsub();
  });
});
