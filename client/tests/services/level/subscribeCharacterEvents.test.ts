/**
 * v0.5.4 — subscribeCharacterEvents 单元测试
 *
 * 验证 4 个 emit 源 (COMBAT_HIT / COMBAT_KILL / COMBAT_END / NARRATIVE_SUBMIT)
 * 在 debounce 窗口内被聚合成单次 PATCH /api/v1/characters/{id}/exp 请求,
 * 服务端返回结果被 apply 到 characterStore.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eventBus } from '../../../src/services/event/EventBus';
import { EVENTS } from '../../../src/services/event/events';
import { useCharacterStore } from '../../../src/stores/characterStore';
import { useAuthStore } from '../../../src/stores/authStore';
import { useSettingsStore } from '../../../src/stores/settingsStore';
import {
  subscribeCharacterExpEvents,
  EXP_AMOUNTS,
} from '../../../src/services/level/subscribeCharacterEvents';

function makeStore() {
  useCharacterStore.setState({
    character: {
      characterId: 'c1',
      name: 'Tester',
      level: 1,
      exp: 0,
      expToNext: 100,
      unspentAttributePoints: 0,
      classId: null,
      classSkills: [],
      currentLocalDay: 1,
      joinedRegion: '',
      hp: 10,
      maxHp: 10,
      vital: {} as never,
      conditions: [],
      attributes: {} as never,
      equipped: {} as never,
      reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
      recentHistory: [],
      lastActionTime: '',
      inventory: {} as never,
      skills: [],
    } as never,
    isLoaded: true,
  });
}

describe('v0.5.4 — subscribeCharacterExpEvents', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    makeStore();
    useAuthStore.setState({ token: 'tk' });
    useSettingsStore.setState({ server: { endpoint: 'http://api.test' } } as never);

    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    eventBus.clear(); // 防止 listener 跨测试泄漏
    vi.restoreAllMocks();
  });

  it('exposes expected EXP_AMOUNTS table', () => {
    expect(EXP_AMOUNTS.COMBAT_HIT).toBe(1);
    expect(EXP_AMOUNTS.COMBAT_KILL).toBe(5);
    expect(EXP_AMOUNTS.COMBAT_END.victory).toBe(30);
    expect(EXP_AMOUNTS.COMBAT_END.defeat).toBe(10);
    expect(EXP_AMOUNTS.COMBAT_END.fled).toBe(0);
    expect(EXP_AMOUNTS.NARRATIVE_SUBMIT).toBe(2);
  });

  it('single COMBAT_HIT debounces to 1 PATCH with amount=1', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ level: 1, exp: 1, expToNext: 100, unspentAttributePoints: 0 }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const unsub = subscribeCharacterExpEvents({ debounceMs: 50 });
    eventBus.emit(EVENTS.COMBAT_HIT, { attackerId: 'p', targetId: 'm', damage: 7, isCrit: false });
    await new Promise((r) => setTimeout(r, 120));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/api/v1/characters/c1/exp');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ amount: 1, difficulty: 'normal' });
    unsub();
  });

  it('3x COMBAT_HIT within window merges into 1 PATCH with amount=3', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ level: 1, exp: 3, expToNext: 100, unspentAttributePoints: 0 }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const unsub = subscribeCharacterExpEvents({ debounceMs: 50 });
    eventBus.emit(EVENTS.COMBAT_HIT, { attackerId: 'p', targetId: 'm', damage: 5, isCrit: false });
    eventBus.emit(EVENTS.COMBAT_HIT, { attackerId: 'p', targetId: 'm', damage: 6, isCrit: false });
    eventBus.emit(EVENTS.COMBAT_HIT, { attackerId: 'p', targetId: 'm', damage: 7, isCrit: true });
    await new Promise((r) => setTimeout(r, 120));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ amount: 3, difficulty: 'normal' });
    unsub();
  });

  it('HIT + KILL + END(victory) sums to 1+5+30=36 in one PATCH', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ level: 1, exp: 36, expToNext: 100, unspentAttributePoints: 0 }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const unsub = subscribeCharacterExpEvents({ debounceMs: 50 });
    eventBus.emit(EVENTS.COMBAT_HIT, { attackerId: 'p', targetId: 'm', damage: 5, isCrit: false });
    eventBus.emit(EVENTS.COMBAT_KILL, { killerId: 'p', targetId: 'm', targetName: 'Goblin' });
    eventBus.emit(EVENTS.COMBAT_END, { outcome: 'victory' });
    await new Promise((r) => setTimeout(r, 120));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ amount: 36, difficulty: 'normal' });
    unsub();
  });

  it('only COMBAT_END.fled yields amount=0 → no PATCH sent (no-op)', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const unsub = subscribeCharacterExpEvents({ debounceMs: 50 });
    eventBus.emit(EVENTS.COMBAT_END, { outcome: 'fled' });
    await new Promise((r) => setTimeout(r, 120));

    expect(fetchMock).not.toHaveBeenCalled();
    unsub();
  });

  it('NARRATIVE_SUBMIT → amount=2 in single PATCH', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ level: 1, exp: 2, expToNext: 100, unspentAttributePoints: 0 }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const unsub = subscribeCharacterExpEvents({ debounceMs: 50 });
    eventBus.emit(EVENTS.NARRATIVE_SUBMIT, { characterId: 'c1', action: 'attack' });
    await new Promise((r) => setTimeout(r, 120));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ amount: 2, difficulty: 'normal' });
    unsub();
  });

  it('server response is applied via applyServerExpGrant', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ level: 2, exp: 50, expToNext: 283, unspentAttributePoints: 1 }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const unsub = subscribeCharacterExpEvents({ debounceMs: 50 });
    eventBus.emit(EVENTS.COMBAT_HIT, { attackerId: 'p', targetId: 'm', damage: 5, isCrit: false });
    await new Promise((r) => setTimeout(r, 120));

    const c = useCharacterStore.getState().character!;
    expect(c.level).toBe(2);
    expect(c.exp).toBe(50);
    expect(c.expToNext).toBe(283);
    expect(c.unspentAttributePoints).toBe(1);
    unsub();
  });

  it('PATCH failure (non-2xx) does not mutate store', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'oops',
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const unsub = subscribeCharacterExpEvents({ debounceMs: 50 });
    eventBus.emit(EVENTS.COMBAT_HIT, { attackerId: 'p', targetId: 'm', damage: 5, isCrit: false });
    await new Promise((r) => setTimeout(r, 120));

    const c = useCharacterStore.getState().character!;
    expect(c.level).toBe(1);
    expect(c.exp).toBe(0);
    expect(c.unspentAttributePoints).toBe(0);
    unsub();
  });

  it('unsub stops further subscriptions', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const unsub = subscribeCharacterExpEvents({ debounceMs: 50 });
    unsub();
    eventBus.emit(EVENTS.COMBAT_HIT, { attackerId: 'p', targetId: 'm', damage: 5, isCrit: false });
    await new Promise((r) => setTimeout(r, 120));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no character loaded → events absorbed but no PATCH sent', async () => {
    useCharacterStore.setState({ character: null, isLoaded: false });
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const unsub = subscribeCharacterExpEvents({ debounceMs: 50 });
    eventBus.emit(EVENTS.COMBAT_HIT, { attackerId: 'p', targetId: 'm', damage: 5, isCrit: false });
    await new Promise((r) => setTimeout(r, 120));

    expect(fetchMock).not.toHaveBeenCalled();
    unsub();
  });
});
