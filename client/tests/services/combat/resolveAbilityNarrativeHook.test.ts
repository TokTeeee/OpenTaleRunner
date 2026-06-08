/**
 * 故事/叙事 hooks 测试 — v0.6.2 Task 18
 *
 * 验证:
 * 1. ABILITY_USED 事件被 emit (供 LLM / 叙事系统监听)
 * 2. payload 包含 abilityId, userId, targetId, school, element, success
 * 3. 事件在 resolveAbility 成功路径触发 (不触发 on error/insufficient resources)
 * 4. 伤害 / 治疗 / buff 三种效果都触发
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createActionResolver } from '../../../src/services/combat/ActionResolver';
import { useCombatStore } from '../../../src/stores/combatStore';
import { eventBus } from '../../../src/services/event/EventBus';
import { EVENTS } from '../../../src/services/event/events';
import { ZERO_RESISTANCES } from '../../../src/types/character';
import type { Combatant, CombatState } from '../../../src/services/combat/types';

const baseAttacker: Combatant = {
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

const baseEnemy: Combatant = {
  id: 'e1', side: 'enemy', name: 'Goblin',
  attributes: { STR: 6, DEX: 12, CON: 8, INT: 6, WIS: 8, CHA: 6 },
  hp: 20, maxHp: 20,
  ap: 4, maxAp: 4,
  isDead: false, isFleeing: false,
  conditions: [],
  equipped: { weapon: null, armor: null, accessory: null },
  elementalResistances: { ...ZERO_RESISTANCES },
};

const baseAlly: Combatant = {
  id: 'a1', side: 'ally', name: 'Cleric',
  attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 16, CHA: 12 },
  hp: 25, maxHp: 25,
  ap: 6, maxAp: 6,
  mp: 20, maxMp: 20,
  isDead: false, isFleeing: false,
  conditions: [],
  equipped: { weapon: null, armor: null, accessory: null },
  elementalResistances: { ...ZERO_RESISTANCES },
};

const baseState = (): Partial<CombatState> & { combatants: Record<string, Combatant> } => ({
  id: 'test', phase: 'active', round: 1, turn: 1, queue: [],
  combatants: { p1: { ...baseAttacker }, e1: { ...baseEnemy }, a1: { ...baseAlly } },
  log: [], startedAt: Date.now(),
});

beforeEach(() => {
  useCombatStore.setState({
    combatants: (baseState() as any).combatants,
    log: [],
    round: 1, turn: 1,
  } as any);
});

afterEach(() => {
  // 清理: 清空所有 listener
  eventBus.clear();
});

describe('resolveAbility 叙事 hook (ABILITY_USED 事件)', () => {
  it('释放伤害能力 (火球) 触发 ABILITY_USED 事件, payload 含 abilityId/userId/targetId/school/element/success=true', () => {
    const received: any[] = [];
    eventBus.on(EVENTS.ABILITY_USED, (payload) => received.push(payload));

    const resolver = createActionResolver({ roll: () => 15, qte: () => ({ accuracy: 1, modifier: 0, type: 'none' }) });
    const state = useCombatStore.getState() as any;
    resolver.resolve({ kind: 'ability', userId: 'p1', abilityId: 'spell_fire_bolt', targetId: 'e1' }, state);

    expect(received.length).toBe(1);
    expect(received[0]).toMatchObject({
      abilityId: 'spell_fire_bolt',
      userId: 'p1',
      targetId: 'e1',
      school: 'magic',
      element: 'fire',
      success: true,
    });
  });

  it('治疗能力 (圣疗术) 触发 ABILITY_USED, success=true', () => {
    const received: any[] = [];
    eventBus.on(EVENTS.ABILITY_USED, (payload) => received.push(payload));

    const resolver = createActionResolver({ roll: () => 10, qte: () => ({ accuracy: 1, modifier: 0, type: 'none' }) });
    const state = useCombatStore.getState() as any;
    resolver.resolve({ kind: 'ability', userId: 'p1', abilityId: 'prayer_holy_heal', targetId: 'a1' }, state);

    expect(received.length).toBe(1);
    expect(received[0]).toMatchObject({
      abilityId: 'prayer_holy_heal',
      userId: 'p1',
      targetId: 'a1',
      school: 'prayer',
      element: 'holy',
      success: true,
    });
  });

  it('buff 能力 (祝福) 触发 ABILITY_USED', () => {
    const received: any[] = [];
    eventBus.on(EVENTS.ABILITY_USED, (payload) => received.push(payload));

    const resolver = createActionResolver({ roll: () => 10, qte: () => ({ accuracy: 1, modifier: 0, type: 'none' }) });
    const state = useCombatStore.getState() as any;
    resolver.resolve({ kind: 'ability', userId: 'p1', abilityId: 'prayer_blessing', targetId: 'a1' }, state);

    expect(received.length).toBe(1);
    expect(received[0]).toMatchObject({
      abilityId: 'prayer_blessing',
      school: 'prayer',
      success: true,
    });
  });

  it('未命中时 (高闪避 d20=1) success=false, 仍 emit ABILITY_USED', () => {
    const received: any[] = [];
    eventBus.on(EVENTS.ABILITY_USED, (payload) => received.push(payload));

    // d20=1, 命中几乎肯定失败
    const resolver = createActionResolver({ roll: () => 1, qte: () => ({ accuracy: 1, modifier: 0, type: 'none' }) });
    const state = useCombatStore.getState() as any;
    resolver.resolve({ kind: 'ability', userId: 'p1', abilityId: 'spell_fire_bolt', targetId: 'e1' }, state);

    expect(received.length).toBe(1);
    expect(received[0]).toMatchObject({
      abilityId: 'spell_fire_bolt',
      success: false,  // 未命中
    });
  });

  it('AP 不足抛错时不 emit ABILITY_USED', () => {
    const received: any[] = [];
    eventBus.on(EVENTS.ABILITY_USED, (payload) => received.push(payload));

    // 把 p1 AP 扣到 0
    useCombatStore.setState((s) => ({
      combatants: { ...s.combatants, p1: { ...s.combatants.p1, ap: 0 } },
    }) as any);

    const resolver = createActionResolver({ roll: () => 10, qte: () => ({ accuracy: 1, modifier: 0, type: 'none' }) });
    const state = useCombatStore.getState() as any;
    expect(() => resolver.resolve({ kind: 'ability', userId: 'p1', abilityId: 'spell_fire_bolt', targetId: 'e1' }, state)).toThrow(/AP/);
    expect(received.length).toBe(0);
  });

  it('未知 abilityId 不 emit ABILITY_USED', () => {
    const received: any[] = [];
    eventBus.on(EVENTS.ABILITY_USED, (payload) => received.push(payload));

    const resolver = createActionResolver({ roll: () => 10, qte: () => ({ accuracy: 1, modifier: 0, type: 'none' }) });
    const state = useCombatStore.getState() as any;
    resolver.resolve({ kind: 'ability', userId: 'p1', abilityId: 'spell_nonexistent', targetId: 'e1' }, state);
    expect(received.length).toBe(0);
  });

  it('多个 listener 都能收到 ABILITY_USED (fan-out)', () => {
    const a: any[] = [];
    const b: any[] = [];
    eventBus.on(EVENTS.ABILITY_USED, (p) => a.push(p));
    eventBus.on(EVENTS.ABILITY_USED, (p) => b.push(p));

    const resolver = createActionResolver({ roll: () => 10, qte: () => ({ accuracy: 1, modifier: 0, type: 'none' }) });
    const state = useCombatStore.getState() as any;
    resolver.resolve({ kind: 'ability', userId: 'p1', abilityId: 'spell_fire_bolt', targetId: 'e1' }, state);
    expect(a.length).toBe(1);
    expect(b.length).toBe(1);
  });
});
