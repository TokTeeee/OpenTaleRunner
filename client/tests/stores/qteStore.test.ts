/**
 * v0.4 战斗系统 — qteStore 测试
 *
 * 覆盖:
 * - initial state: idle, resolver null, context empty
 * - runAttack: 启动 attack QTE, set state + resolver + context
 * - runMagic: 启动 magic QTE, set state + resolver + context
 * - hit: 记录命中 (pending → still pending, hits++)
 * - typeChar: 同 hit (recordHit 共用)
 * - finish: 兑现 promise, phase=pending → done
 * - cancel: pending → cancelled, 兑现; idle → 仅清 resolver
 * - reset: 全清
 * - hit/typeChar/finish/cancel 在非 pending 状态幂等 (no-op)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useQTEStore } from '../../src/stores/qteStore';
import type { Combatant } from '../../src/services/combat/types';

function makeCaster(): Combatant {
  return {
    name: 'Gandalf',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 18, WIS: 14, CHA: 10 },
    hp: 24, maxHp: 24,
    ap: 6, maxAp: 6,
    conditions: [],
    isDead: false,
    isFleeing: false,
    equipped: { weapon: null, armor: null, accessory: null },
    id: 'p-1',
    side: 'player',
  };
}

beforeEach(() => {
  useQTEStore.getState().reset();
});

describe('qteStore: initial state', () => {
  it('初始: state=idle, resolver=null, context 默认', () => {
    const s = useQTEStore.getState();
    expect(s.state.phase).toBe('idle');
    expect(s.resolver).toBeNull();
    expect(s.context).toEqual({ playerId: '', targetId: null, spell: '' });
  });
});

describe('qteStore: runAttack', () => {
  it('启动 attack QTE: phase=pending, type=attack, payload=rounds, resolver 存在', () => {
    const promise = useQTEStore.getState().runAttack({ agilityDelta: 8, playerId: 'p-1', targetId: 'e-1' });
    const s = useQTEStore.getState();
    expect(s.state.phase).toBe('pending');
    expect(s.state.type).toBe('attack');
    expect(s.state.payload).toBe(2); // agilityDelta=8 / 4 = 2 rounds
    expect(s.resolver).not.toBeNull();
    expect(s.context).toEqual({ playerId: 'p-1', targetId: 'e-1', spell: '' });
    // 不 resolve, promise 仍 pending
    let resolved = false;
    void promise.then(() => { resolved = true; });
    // 同步检查
    expect(resolved).toBe(false);
  });

  it('runAttack 调 hit 增加 hits, finish 兑现 promise', async () => {
    const promise = useQTEStore.getState().runAttack({ agilityDelta: 4, playerId: 'p-1', targetId: 'e-1' });
    expect(useQTEStore.getState().state.payload).toBe(1); // 1 round
    useQTEStore.getState().hit();
    expect(useQTEStore.getState().state.hits).toBe(1);
    useQTEStore.getState().finish();
    const result = await promise;
    expect(result.accuracy).toBe(1);
    expect(result.modifier).toBe(1);
    expect(result.type).toBe('attack');
    // phase 变 done, resolver 清空
    expect(useQTEStore.getState().state.phase).toBe('done');
    expect(useQTEStore.getState().resolver).toBeNull();
  });
});

describe('qteStore: runMagic', () => {
  it('启动 magic QTE: phase=pending, type=magic, payload=spell, baseMs 由 INT 派生', () => {
    const promise = useQTEStore.getState().runMagic({ spell: 'fireball', caster: makeCaster(), playerId: 'p-1', targetId: 'e-1' });
    const s = useQTEStore.getState();
    expect(s.state.phase).toBe('pending');
    expect(s.state.type).toBe('magic');
    expect(s.state.payload).toBe('fireball');
    // INT=18 → baseMs = max(3000, 5000 - 18*200) = 3000
    expect(s.state.baseMs).toBe(3000);
    expect(s.state.total).toBe('fireball'.length);
    expect(s.context).toEqual({ playerId: 'p-1', targetId: 'e-1', spell: 'fireball' });
    void promise;
  });

  it('runMagic 调 typeChar 增 hits, finish 兑现', async () => {
    const promise = useQTEStore.getState().runMagic({ spell: 'ab', caster: makeCaster(), playerId: 'p-1', targetId: 'e-1' });
    useQTEStore.getState().typeChar();
    useQTEStore.getState().typeChar();
    expect(useQTEStore.getState().state.hits).toBe(2);
    useQTEStore.getState().finish();
    const result = await promise;
    expect(result.accuracy).toBe(1);
    expect(result.type).toBe('magic');
  });
});

describe('qteStore: hit / typeChar / finish / cancel 幂等性', () => {
  it('idle 状态 hit() 无效', () => {
    useQTEStore.getState().hit();
    expect(useQTEStore.getState().state.phase).toBe('idle');
  });

  it('idle 状态 typeChar() 无效', () => {
    useQTEStore.getState().typeChar();
    expect(useQTEStore.getState().state.phase).toBe('idle');
  });

  it('idle 状态 finish() 无效 (不调 resolver)', () => {
    useQTEStore.getState().finish();
    expect(useQTEStore.getState().state.phase).toBe('idle');
    expect(useQTEStore.getState().resolver).toBeNull();
  });

  it('cancel() 在 idle 状态仅清 resolver (无 resolver 也安全)', () => {
    useQTEStore.getState().cancel();
    expect(useQTEStore.getState().resolver).toBeNull();
  });

  it('pending 状态 finish() 后再 hit() 无效 (phase=done)', async () => {
    const promise = useQTEStore.getState().runAttack({ agilityDelta: 4, playerId: 'p-1', targetId: 'e-1' });
    useQTEStore.getState().finish();
    await promise;
    useQTEStore.getState().hit();
    // state 还是 done, hits 不会变
    expect(useQTEStore.getState().state.phase).toBe('done');
  });

  it('pending 状态 cancel() 兑现, phase=cancelled', async () => {
    const promise = useQTEStore.getState().runAttack({ agilityDelta: 8, playerId: 'p-1', targetId: 'e-1' });
    useQTEStore.getState().cancel();
    const result = await promise;
    expect(result.accuracy).toBe(0); // 0 hits
    expect(useQTEStore.getState().state.phase).toBe('cancelled');
  });
});

describe('qteStore: reset', () => {
  it('reset 恢复 initial state', async () => {
    const promise = useQTEStore.getState().runAttack({ agilityDelta: 4, playerId: 'p-1', targetId: 'e-1' });
    useQTEStore.getState().finish();
    await promise;
    useQTEStore.getState().reset();
    const s = useQTEStore.getState();
    expect(s.state.phase).toBe('idle');
    expect(s.resolver).toBeNull();
    expect(s.context).toEqual({ playerId: '', targetId: null, spell: '' });
  });
});
