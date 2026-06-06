import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NoopResolver, createCombatEngine, checkEndCondition, type ActionResolver } from '../../../src/services/combat/CombatEngine';
import { useCombatStore, INITIAL_COMBAT_STATE } from '../../../src/stores/combatStore';
import { makeConstRoll, makeSeededRoll } from '../../../src/services/combat/dice';
import type { Combatant } from '../../../src/services/combat/types';
import { resetClientStores } from '../../utils/resetStores';

function makePlayer(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: 'p1',
    side: 'player',
    name: '玩家',
    attributes: { STR: 10, DEX: 12, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: 24, maxHp: 24,
    ap: 6, maxAp: 6,
    conditions: [],
    isDead: false,
    isFleeing: false,
    equipped: { weapon: null, armor: null, accessory: null },
    ...overrides,
  };
}

function makeEnemy(id: string, overrides: Partial<Combatant> = {}): Combatant {
  return {
    id,
    side: 'enemy',
    name: `敌人 ${id}`,
    attributes: { STR: 8, DEX: 10, CON: 10, INT: 6, WIS: 8, CHA: 6 },
    hp: 12, maxHp: 12,
    ap: 4, maxAp: 4,
    conditions: [],
    isDead: false,
    isFleeing: false,
    equipped: { weapon: null, armor: null, accessory: null },
    mobData: { level: 1, behavior: 'aggressive' },
    ...overrides,
  };
}

describe('CombatEngine: start + initialize FSM', () => {
  beforeEach(() => {
    resetClientStores();
    useCombatStore.setState({ ...INITIAL_COMBAT_STATE, active: false });
  });
  afterEach(() => resetClientStores());

  it('start: idle → active, 写入 combatants + 投 ACT 队列', () => {
    const engine = createCombatEngine({ roll: makeConstRoll([15, 10, 8]) });
    const player = makePlayer();
    const enemies = [makeEnemy('e1'), makeEnemy('e2')];
    engine.start('c1', player, [], enemies, '遭遇战');
    const s = useCombatStore.getState();
    expect(s.phase).toBe('active');
    expect(s.id).toBe('c1');
    expect(s.active).toBe(true);
    expect(s.round).toBe(1);
    expect(s.turn).toBe(1);
    expect(s.queue).toHaveLength(3);
    expect(s.queue.map((q) => q.combatantId)).toContain('p1');
    expect(s.queue.map((q) => q.combatantId)).toContain('e1');
    expect(s.queue.map((q) => q.combatantId)).toContain('e2');
  });

  it('start: ACT 队列按 initiative 降序', () => {
    const engine = createCombatEngine({ roll: makeConstRoll([5, 18, 12]) });
    // p1 DEX=12 (+1), e1 DEX=10 (+0), e2 DEX=10 (+0)
    // d20: p1=5+1=6, e1=18+0=18, e2=12+0=12
    // 顺序: e1 > e2 > p1
    engine.start('c1', makePlayer(), [], [makeEnemy('e1'), makeEnemy('e2')]);
    const ids = useCombatStore.getState().queue.map((q) => q.combatantId);
    expect(ids[0]).toBe('e1');
    expect(ids[1]).toBe('e2');
    expect(ids[2]).toBe('p1');
  });

  it('start: 写入开场叙事到 log', () => {
    const engine = createCombatEngine({ roll: makeConstRoll([10, 10]) });
    engine.start('c1', makePlayer(), [], [makeEnemy('e1')], '三只哥布林从树丛后跃出');
    const log = useCombatStore.getState().log;
    expect(log[0].message).toBe('三只哥布林从树丛后跃出');
    expect(log[0].kind).toBe('start');
  });
});

describe('CombatEngine: effectiveDEX 与 initiative 计算', () => {
  it('effectiveDEX: 基线只算 attributes.DEX', () => {
    const engine = createCombatEngine();
    const c = makePlayer({ attributes: { ...makePlayer().attributes, DEX: 14 } });
    expect(engine.effectiveDEX(c)).toBe(14);
  });

  it('effectiveDEX: 包含 buff DEX modifier', () => {
    const engine = createCombatEngine();
    const c = makePlayer({
      attributes: { ...makePlayer().attributes, DEX: 12 },
      conditions: [{ ref: 'DEX_up', stacks: 1, remainingTurns: 3, source: 'item', appliedAtTurn: 1, modifiers: { DEX: 3 } }],
    });
    expect(engine.effectiveDEX(c)).toBe(15);
  });

  it('effectiveDEX: 负 modifier 也能减', () => {
    const engine = createCombatEngine();
    const c = makePlayer({
      attributes: { ...makePlayer().attributes, DEX: 12 },
      conditions: [{ ref: 'wounded', stacks: 1, remainingTurns: 3, source: 'a', appliedAtTurn: 1, modifiers: { DEX: -2 } }],
    });
    expect(engine.effectiveDEX(c)).toBe(10);
  });

  it('rollInitiative: d20 + effectiveDEX 修正', () => {
    const engine = createCombatEngine({ roll: makeConstRoll([15]) });
    const c = makePlayer({ attributes: { ...makePlayer().attributes, DEX: 14 } });
    // DEX 14 → mod 2 → total = 15 + 2 = 17
    const entries = engine.rollInitiative([c]);
    expect(entries[0].initiative).toBe(17);
    expect(entries[0].rolledAt).toBe('start');
  });

  it('rollInitiative: tie 时按 id 字典序稳定排序', () => {
    const engine = createCombatEngine({ roll: makeConstRoll([10, 10, 10]) });
    // 三个相同 DEX, 相同 d20, 顺序按 id
    const a = makePlayer({ id: 'a', attributes: { ...makePlayer().attributes, DEX: 10 } });
    const b = makeEnemy('b', { attributes: { ...makeEnemy('b').attributes, DEX: 10 } });
    const c = makeEnemy('c', { attributes: { ...makeEnemy('c').attributes, DEX: 10 } });
    const entries = engine.rollInitiative([a, b, c]);
    expect(entries.map((e) => e.combatantId)).toEqual(['a', 'b', 'c']);
  });
});

describe('CombatEngine: checkEndCondition 5 种结束条件', () => {
  it('continue: 都活着', () => {
    const result = checkEndCondition({
      p1: makePlayer(),
      e1: makeEnemy('e1'),
    }, 'p1');
    expect(result.condition).toBe('continue');
  });

  it('all_enemies_dead → victory', () => {
    const result = checkEndCondition({
      p1: makePlayer(),
      e1: { ...makeEnemy('e1'), isDead: true, hp: 0 },
      e2: { ...makeEnemy('e2'), isDead: true, hp: 0 },
    }, 'p1');
    expect(result.condition).toBe('all_enemies_dead');
    expect(result.outcome).toBe('victory');
  });

  it('player_dead (hp=0) → defeat', () => {
    const result = checkEndCondition({
      p1: { ...makePlayer(), hp: 0 },
      e1: makeEnemy('e1'),
    }, 'p1');
    expect(result.condition).toBe('player_dead');
    expect(result.outcome).toBe('defeat');
  });

  it('player_dead (isDead flag) → defeat', () => {
    const result = checkEndCondition({
      p1: { ...makePlayer(), isDead: true, hp: 5 },
      e1: makeEnemy('e1'),
    }, 'p1');
    expect(result.condition).toBe('player_dead');
    expect(result.outcome).toBe('defeat');
  });

  it('player_fleeing → fled', () => {
    const result = checkEndCondition({
      p1: { ...makePlayer(), isFleeing: true },
      e1: makeEnemy('e1'),
    }, 'p1');
    expect(result.condition).toBe('fled');
    expect(result.outcome).toBe('fled');
  });

  it('敌人存活 + 玩家存活 + 未逃跑 → continue', () => {
    const result = checkEndCondition({
      p1: makePlayer(),
      e1: { ...makeEnemy('e1'), hp: 5 },
      e2: makeEnemy('e2'),
    }, 'p1');
    expect(result.condition).toBe('continue');
  });
});

describe('CombatEngine: processTurn 战斗循环', () => {
  beforeEach(() => {
    resetClientStores();
    useCombatStore.setState({ ...INITIAL_COMBAT_STATE, active: false });
  });
  afterEach(() => resetClientStores());

  it('processTurn: 非 active 抛错', async () => {
    const engine = createCombatEngine();
    useCombatStore.setState({ phase: 'idle' });
    await expect(engine.processTurn({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, 'p1')).rejects.toThrow();
  });

  it('processTurn: 调 resolver, 写 log, 推进 turn', async () => {
    const resolver: ActionResolver = {
      resolve: (_action) => ({
        log: [{ kind: 'action', round: 1, turn: 1, message: 'test action', timestamp: 0 }],
        buffTicks: [],
        ended: false,
      }),
    };
    const engine = createCombatEngine({ roll: makeConstRoll([10, 5]), resolver });
    engine.start('c1', makePlayer(), [], [makeEnemy('e1')]);
    // queue: [p1, e1] (假设 d20 同等, p1 DEX 高)
    const initialTurn = useCombatStore.getState().turn;
    await engine.processTurn({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, 'p1');
    const s = useCombatStore.getState();
    // turn 推进
    expect(s.turn).toBe(initialTurn + 1);
    // log 包含 resolver 返回的项
    expect(s.log.some((l) => l.message === 'test action')).toBe(true);
  });

  it('processTurn: 队列结束时进入下一回合', async () => {
    const resolver: ActionResolver = {
      resolve: () => ({ log: [], buffTicks: [], ended: false }),
    };
    const engine = createCombatEngine({ roll: makeConstRoll([10, 5]), resolver });
    engine.start('c1', makePlayer(), [], [makeEnemy('e1')]);
    // 假设 queue 是 [p1, e1]
    expect(useCombatStore.getState().turn).toBe(1);
    await engine.processTurn({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, 'p1');
    expect(useCombatStore.getState().turn).toBe(2);
    await engine.processTurn({ kind: 'attack', attackerId: 'e1', targetId: 'p1' }, 'p1');
    // turn 超出 queue → advanceRound
    const s = useCombatStore.getState();
    expect(s.round).toBe(2);
    expect(s.turn).toBe(1);
  });

  it('processTurn: 触发 victory 时自动 beginResolving', async () => {
    const resolver: ActionResolver = {
      resolve: (action) => {
        // 玩家攻击 e1 → e1 死亡
        if (action.kind === 'attack' && action.targetId === 'e1') {
          useCombatStore.getState().markDead('e1');
        }
        return { log: [], buffTicks: [], ended: false };
      },
    };
    const engine = createCombatEngine({ roll: makeConstRoll([10, 5]), resolver });
    engine.start('c1', makePlayer(), [], [makeEnemy('e1')]);
    await engine.processTurn({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, 'p1');
    const s = useCombatStore.getState();
    expect(s.phase).toBe('resolving');
    expect(s.outcome).toBe('victory');
  });

  it('processTurn: 触发 defeat 时自动 beginResolving', async () => {
    const resolver: ActionResolver = {
      resolve: (action) => {
        if (action.kind === 'attack' && action.targetId === 'p1') {
          useCombatStore.getState().markDead('p1');
        }
        return { log: [], buffTicks: [], ended: false };
      },
    };
    const engine = createCombatEngine({ roll: makeConstRoll([10, 5]), resolver });
    engine.start('c1', makePlayer(), [], [makeEnemy('e1')]);
    // 强制让 p1 行动 (假设 queue 把 p1 放第一)
    await engine.processTurn({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, 'p1');
    // 现在轮到 e1
    await engine.processTurn({ kind: 'attack', attackerId: 'e1', targetId: 'p1' }, 'p1');
    const s = useCombatStore.getState();
    expect(s.phase).toBe('resolving');
    expect(s.outcome).toBe('defeat');
  });

  it('processTurn: 写结束 log (kind=end)', async () => {
    const resolver: ActionResolver = {
      resolve: (action) => {
        if (action.kind === 'attack' && action.targetId === 'e1') {
          useCombatStore.getState().markDead('e1');
        }
        return { log: [], buffTicks: [], ended: false };
      },
    };
    const engine = createCombatEngine({ roll: makeConstRoll([10, 5]), resolver });
    engine.start('c1', makePlayer(), [], [makeEnemy('e1')]);
    await engine.processTurn({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, 'p1');
    const endLog = useCombatStore.getState().log.filter((l) => l.kind === 'end');
    expect(endLog.length).toBeGreaterThan(0);
    expect(endLog[0].message).toContain('victory');
  });
});

describe('CombatEngine: settle + reset 收尾流程', () => {
  beforeEach(() => {
    resetClientStores();
    useCombatStore.setState({ ...INITIAL_COMBAT_STATE, active: false });
  });
  afterEach(() => resetClientStores());

  it('settle: resolving → settled, 写 narrativeClosing', () => {
    const engine = createCombatEngine();
    useCombatStore.setState({ phase: 'resolving' });
    engine.settle('你击败了哥布林');
    const s = useCombatStore.getState();
    expect(s.phase).toBe('settled');
    expect(s.narrativeClosing).toBe('你击败了哥布林');
  });

  it('settle: 非 resolving 抛错', () => {
    const engine = createCombatEngine();
    useCombatStore.setState({ phase: 'active' });
    expect(() => engine.settle('x')).toThrow();
  });

  it('reset: settled → idle, 清空', () => {
    const engine = createCombatEngine();
    useCombatStore.setState({ phase: 'settled', id: 'c1' });
    engine.reset();
    const s = useCombatStore.getState();
    expect(s.phase).toBe('idle');
    expect(s.id).toBe('');
  });

  it('reset: active 抛错 (必须经过 settled)', () => {
    const engine = createCombatEngine();
    useCombatStore.setState({ phase: 'active' });
    expect(() => engine.reset()).toThrow();
  });
});

describe('CombatEngine: 完整流程端到端 (用 NoopResolver + 模拟杀敌)', () => {
  beforeEach(() => {
    resetClientStores();
    useCombatStore.setState({ ...INITIAL_COMBAT_STATE, active: false });
  });
  afterEach(() => resetClientStores());

  it('一场战斗: start → 2 回合 → victory → settle → reset', async () => {
    const resolver: ActionResolver = {
      resolve: (action) => {
        if (action.kind === 'attack') {
          const target = useCombatStore.getState().combatants[action.targetId];
          if (target) {
            useCombatStore.getState().applyDamage(action.targetId, target.hp);
          }
        }
        return { log: [{ kind: 'action', round: 0, turn: 0, message: 'attack', timestamp: 0 }], buffTicks: [], ended: false };
      },
    };
    const engine = createCombatEngine({ roll: makeConstRoll([10, 5]), resolver });
    engine.start('c1', makePlayer(), [], [makeEnemy('e1')]);
    expect(useCombatStore.getState().phase).toBe('active');

    // 玩家攻击 e1 → e1 死
    await engine.processTurn({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, 'p1');
    // resolver 在 turn 1 (p1 行动) 时杀掉 e1, processTurn 结束后应进 resolving
    expect(useCombatStore.getState().phase).toBe('resolving');
    expect(useCombatStore.getState().outcome).toBe('victory');

    engine.settle('胜利');
    expect(useCombatStore.getState().phase).toBe('settled');
    expect(useCombatStore.getState().narrativeClosing).toBe('胜利');

    engine.reset();
    expect(useCombatStore.getState().phase).toBe('idle');
    expect(useCombatStore.getState().active).toBe(false);
  });

  it('种子化随机抹子 跨测试可重现', () => {
    const r1 = makeSeededRoll(42);
    const r2 = makeSeededRoll(42);
    expect(r1(20)).toBe(r2(20));
    expect(r1(20)).toBe(r2(20));
  });

  it('NoopResolver 不会修改状态', async () => {
    const engine = createCombatEngine({ roll: makeConstRoll([10, 5]), resolver: NoopResolver });
    engine.start('c1', makePlayer(), [], [makeEnemy('e1')]);
    const hpBefore = useCombatStore.getState().combatants.e1.hp;
    await engine.processTurn({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, 'p1');
    expect(useCombatStore.getState().combatants.e1.hp).toBe(hpBefore);
  });
});

describe('CombatEngine: 集成 setResolver / setRoll 运行时替换', () => {
  it('setResolver 在战斗中途替换为新 resolver', async () => {
    resetClientStores();
    useCombatStore.setState({ ...INITIAL_COMBAT_STATE, active: false });

    const calls: string[] = [];
    const r1: ActionResolver = { resolve: () => { calls.push('r1'); return { log: [], buffTicks: [], ended: false }; } };
    const r2: ActionResolver = { resolve: () => { calls.push('r2'); return { log: [], buffTicks: [], ended: false }; } };

    const engine = createCombatEngine({ roll: makeConstRoll([10, 5]), resolver: r1 });
    engine.start('c1', makePlayer(), [], [makeEnemy('e1')]);
    await engine.processTurn({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, 'p1');
    expect(calls).toEqual(['r1']);

    engine.setResolver(r2);
    // 强制让 e1 行动 (这里 queue 已推到 e1, 不必改 player.hp)
    await engine.processTurn({ kind: 'attack', attackerId: 'e1', targetId: 'p1' }, 'p1');
    expect(calls).toEqual(['r1', 'r2']);
  });
});
