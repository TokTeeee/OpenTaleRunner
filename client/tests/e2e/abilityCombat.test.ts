/**
 * v0.6.2 — 战斗 e2e 测试
 *
 * 端到端验证法师释放火球术 (spell_fire_olt) 命中造成伤害,
 * 覆盖完整链路: 角色装入 → 学会火球 → 战斗初始化 → 释放 ability →
 * 伤害写入 combatStore → ABILITY_USED 事件触发.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createActionResolver } from '../../src/services/combat/ActionResolver';
import { useCombatStore } from '../../src/stores/combatStore';
import { useCharacterStore } from '../../src/stores/characterStore';
import { resetAllStores } from '../../src/utils/resetStores';
import { ZERO_RESISTANCES, type Character } from '../../src/types/character';
import type { Combatant } from '../../src/services/combat/types';
import { makeConstRoll } from '../../src/services/combat/dice';
import { eventBus } from '../../src/services/event/EventBus';
import { EVENTS } from '../../src/services/event/events';
import type { Element } from '../../src/types/ability';

function makeMageCharacter(): Character {
  return {
    characterId: 'mage-1',
    playerId: 'player-1',
    name: 'Lyra',
    race: 'elf',
    background: 'mage apprentice',
    appearance: 'robed',
    attributes: { STR: 8, DEX: 12, CON: 10, INT: 16, WIS: 12, CHA: 10 },
    skills: [],
    classId: 'mage',
    classSkills: [],
    hp: 30,
    maxHp: 30,
    mp: 20,
    maxMp: 20,
    vital: { hunger: 50, thirst: 50, fatigue: 50, hygiene: 50, morale: 50, wound: 0, temperature: 37, encumbrance: 0 },
    conditions: [],
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    elementalResistances: { ...ZERO_RESISTANCES },
    learnedAbilities: [],
    defaultLearnedAbilities: [],
    recentHistory: [],
    inventory: {
      backpack: [],
      equipped: { weapon: null, armor: null, accessory: null },
      currency: { gold: 0, silver: 0, copper: 0 },
    },
    joinedRegion: 'plains',
    joinedWorldDay: 1,
    currentLocalDay: 1,
    lastActionTime: '',
    level: 5,
    exp: 0,
    expToNext: 100,
    unspentAttributePoints: 0,
  } as Character;
}

function makeMageCombatant(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: 'p1',
    side: 'player',
    name: 'Lyra',
    attributes: { STR: 8, DEX: 12, CON: 10, INT: 16, WIS: 12, CHA: 10 },
    hp: 30,
    maxHp: 30,
    mp: 20,
    maxMp: 20,
    ap: 6,
    maxAp: 6,
    conditions: [],
    isDead: false,
    isFleeing: false,
    equipped: { weapon: null, armor: null, accessory: null },
    elementalResistances: { ...ZERO_RESISTANCES },
    ...overrides,
  };
}

function makeEnemyCombatant(id: string, overrides: Partial<Combatant> = {}): Combatant {
  return {
    id,
    side: 'enemy',
    name: 'Goblin',
    attributes: { STR: 6, DEX: 12, CON: 8, INT: 6, WIS: 8, CHA: 6 },
    hp: 20,
    maxHp: 20,
    ap: 4,
    maxAp: 4,
    conditions: [],
    isDead: false,
    isFleeing: false,
    equipped: { weapon: null, armor: null, accessory: null },
    elementalResistances: { ...ZERO_RESISTANCES },
    ...overrides,
  };
}

describe('v0.6.2 ability combat e2e', () => {
  beforeEach(() => {
    resetAllStores();
  });

  afterEach(() => {
    // 清理事件监听器, 避免跨测试污染
    eventBus.clear();
  });

  it('e2e 1: 法师 Lv.5 释放火球 (spell_fire_bolt) 命中造成伤害', () => {
    // ---- 1. 装入法师 + 学会火球 ----
    useCharacterStore.setState({
      character: makeMageCharacter(),
      isLoaded: true,
    });
    useCharacterStore.getState().learnAbility('spell_fire_bolt');

    const learned = useCharacterStore.getState().character?.learnedAbilities ?? [];
    expect(learned.some((la) => la.abilityId === 'spell_fire_bolt')).toBe(true);

    // ---- 2. 战斗初始化: 玩家 mage + 1 个 goblin ----
    useCombatStore.setState({
      id: 'test-combat-1',
      phase: 'active',
      round: 1,
      turn: 1,
      queue: ['p1', 'e1'],
      combatants: {
        p1: makeMageCombatant(),
        e1: makeEnemyCombatant('e1'),
      },
      log: [],
      startedAt: Date.now(),
    });

    // ---- 3. 释放火球 (QTE noop) ----
    // 序列: d20=20 (命中), d6=5 (伤害) → INT 16 → INT_mod = (16-10)/2 = 3
    // 火球: damage = (1d6+INT_mod) * (1 - resistance/200)
    // 伤害 = (5 + 3) = 8 (无抗)
    const resolver = createActionResolver({
      roll: makeConstRoll([20, 5]),
      qte: () => ({ accuracy: 1, modifier: 0, type: 'magic' as const }),
    });

    const e1Before = useCombatStore.getState().combatants.e1.hp;
    expect(e1Before).toBe(20);

    const result = resolver.resolve(
      { kind: 'ability', userId: 'p1', abilityId: 'spell_fire_bolt', targetId: 'e1' },
      useCombatStore.getState(),
    );

    // ---- 4. 验证: 敌人 HP 减少 ----
    const e1After = useCombatStore.getState().combatants.e1.hp;
    expect(e1After).toBeLessThan(e1Before);
    expect(e1After).toBeGreaterThanOrEqual(0);

    // 验证战斗日志: 应有命中 + 伤害条目
    const msgs = result.log.map((l) => l.message);
    expect(msgs.some((m) => m.includes('命中!') || m.includes('命中'))).toBe(true);

    // ---- 5. 验证: 玩家消耗了资源 (AP 减 1, MP 减 3) ----
    const p1 = useCombatStore.getState().combatants.p1;
    expect(p1.ap).toBe(5); // 6 - 1
    expect(p1.mp).toBe(17); // 20 - 3
  });

  it('e2e 2: 法师对火弱化目标 (fire resistance -50) 释放火球, 伤害增加', () => {
    useCharacterStore.setState({ character: makeMageCharacter(), isLoaded: true });
    useCharacterStore.getState().learnAbility('spell_fire_bolt');

    // 敌人有 -50 火抗 (被弱化)
    const enemy = makeEnemyCombatant('e1', {
      elementalResistances: { ...ZERO_RESISTANCES, fire: -50 },
    });

    useCombatStore.setState({
      id: 'test-combat-2',
      phase: 'active',
      round: 1,
      turn: 1,
      queue: ['p1', 'e1'],
      combatants: { p1: makeMageCombatant(), e1: enemy },
      log: [],
      startedAt: Date.now(),
    });

    const resolver = createActionResolver({
      roll: makeConstRoll([20, 5]),
      qte: () => ({ accuracy: 1, modifier: 0, type: 'magic' as const }),
    });

    const e1Before = useCombatStore.getState().combatants.e1.hp;
    resolver.resolve(
      { kind: 'ability', userId: 'p1', abilityId: 'spell_fire_bolt', targetId: 'e1' },
      useCombatStore.getState(),
    );
    const dmgWeak = e1Before - useCombatStore.getState().combatants.e1.hp;

    // 重置 + 对比: 对无抗目标释放同样火球
    resetAllStores();
    useCharacterStore.setState({ character: makeMageCharacter(), isLoaded: true });
    useCharacterStore.getState().learnAbility('spell_fire_bolt');

    useCombatStore.setState({
      id: 'test-combat-3',
      phase: 'active',
      round: 1,
      turn: 1,
      queue: ['p1', 'e2'],
      combatants: {
        p1: makeMageCombatant(),
        e2: makeEnemyCombatant('e2', {
          elementalResistances: { ...ZERO_RESISTANCES },
        }),
      },
      log: [],
      startedAt: Date.now(),
    });

    resolver.resolve(
      { kind: 'ability', userId: 'p1', abilityId: 'spell_fire_bolt', targetId: 'e2' },
      useCombatStore.getState(),
    );
    const dmgNormal = e1Before - useCombatStore.getState().combatants.e2.hp;

    // -50 火抗 (即被弱化 50%) → 伤害 * 1.25
    expect(dmgWeak).toBeGreaterThan(dmgNormal);
  });

  it('e2e 3: 释放火球触发 ABILITY_USED 事件 (含完整 payload)', () => {
    useCharacterStore.setState({ character: makeMageCharacter(), isLoaded: true });
    useCharacterStore.getState().learnAbility('spell_fire_bolt');

    useCombatStore.setState({
      id: 'test-combat-4',
      phase: 'active',
      round: 1,
      turn: 1,
      queue: ['p1', 'e1'],
      combatants: { p1: makeMageCombatant(), e1: makeEnemyCombatant('e1') },
      log: [],
      startedAt: Date.now(),
    });

    const received: Array<{ abilityId: string; userId: string; targetId?: string; school: string; element?: Element; success: boolean; damage?: number }> = [];
    eventBus.on(EVENTS.ABILITY_USED, (payload) => {
      received.push(payload as typeof received[number]);
    });

    const resolver = createActionResolver({
      roll: makeConstRoll([20, 5]),
      qte: () => ({ accuracy: 1, modifier: 0, type: 'magic' as const }),
    });

    resolver.resolve(
      { kind: 'ability', userId: 'p1', abilityId: 'spell_fire_bolt', targetId: 'e1' },
      useCombatStore.getState(),
    );

    // 验证事件 payload
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      abilityId: 'spell_fire_bolt',
      userId: 'p1',
      targetId: 'e1',
      school: 'magic',
      element: 'fire',
      success: true,
    });
    expect(received[0].damage).toBeGreaterThan(0);
  });

  it('e2e 4: 多个 listener fan-out: ABILITY_USED 事件被所有订阅者收到', () => {
    useCharacterStore.setState({ character: makeMageCharacter(), isLoaded: true });
    useCharacterStore.getState().learnAbility('spell_fire_bolt');

    useCombatStore.setState({
      id: 'test-combat-5',
      phase: 'active',
      round: 1,
      turn: 1,
      queue: ['p1', 'e1'],
      combatants: { p1: makeMageCombatant(), e1: makeEnemyCombatant('e1') },
      log: [],
      startedAt: Date.now(),
    });

    const a: number[] = [];
    const b: number[] = [];
    eventBus.on(EVENTS.ABILITY_USED, (payload: unknown) => {
      a.push((payload as { damage?: number }).damage ?? 0);
    });
    eventBus.on(EVENTS.ABILITY_USED, (payload: unknown) => {
      b.push((payload as { damage?: number }).damage ?? 0);
    });

    const resolver = createActionResolver({
      roll: makeConstRoll([20, 5]),
      qte: () => ({ accuracy: 1, modifier: 0, type: 'magic' as const }),
    });

    resolver.resolve(
      { kind: 'ability', userId: 'p1', abilityId: 'spell_fire_bolt', targetId: 'e1' },
      useCombatStore.getState(),
    );

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0]).toBe(b[0]);
  });
});
