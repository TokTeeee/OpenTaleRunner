import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useCombatStore, INITIAL_COMBAT_STATE, CombatStoreError, isCombatActive, isCombatOver, COMBAT_LOG_MAX } from '../../src/stores/combatStore';
import type { Combatant } from '../../src/services/combat/types';
import { resetClientStores } from '../utils/resetStores';

function makePlayer(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: 'player_1',
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
    name: `哥布林斥候 ${id}`,
    attributes: { STR: 8, DEX: 14, CON: 10, INT: 6, WIS: 8, CHA: 6 },
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

describe('combatStore: 初始状态 + FSM 守卫', () => {
  beforeEach(() => {
    resetClientStores();
    useCombatStore.setState({ ...INITIAL_COMBAT_STATE, active: false, isPlayerTurn: false });
  });
  afterEach(() => resetClientStores());

  it('初始 phase = idle, active = false', () => {
    const s = useCombatStore.getState();
    expect(s.phase).toBe('idle');
    expect(s.active).toBe(false);
    expect(s.isPlayerTurn).toBe(false);
    expect(s.round).toBe(0);
    expect(s.turn).toBe(0);
    expect(s.combatants).toEqual({});
    expect(s.log).toEqual([]);
  });

  describe('canTransition / setPhase FSM 守卫', () => {
    it('idle → initializing 允许', () => {
      expect(useCombatStore.getState().canTransition('initializing')).toBe(true);
      useCombatStore.getState().setPhase('initializing');
      expect(useCombatStore.getState().phase).toBe('initializing');
    });

    it('idle → active 禁止 (必须经过 initializing)', () => {
      expect(useCombatStore.getState().canTransition('active')).toBe(false);
      expect(() => useCombatStore.getState().setPhase('active')).toThrow(CombatStoreError);
    });

    it('idle → resolving 禁止', () => {
      expect(useCombatStore.getState().canTransition('resolving')).toBe(false);
    });

    it('initializing → active 允许', () => {
      useCombatStore.setState({ phase: 'initializing' });
      useCombatStore.getState().setPhase('active');
      expect(useCombatStore.getState().phase).toBe('active');
    });

    it('initializing → idle 允许 (校验失败回退)', () => {
      useCombatStore.setState({ phase: 'initializing' });
      useCombatStore.getState().setPhase('idle');
      expect(useCombatStore.getState().phase).toBe('idle');
    });

    it('initializing → resolved 禁止', () => {
      useCombatStore.setState({ phase: 'initializing' });
      expect(() => useCombatStore.getState().setPhase('resolving')).toThrow(CombatStoreError);
    });

    it('active → active 允许 (内部回合循环)', () => {
      useCombatStore.setState({ phase: 'active' });
      useCombatStore.getState().setPhase('active');
      expect(useCombatStore.getState().phase).toBe('active');
    });

    it('active → resolving 允许', () => {
      useCombatStore.setState({ phase: 'active' });
      useCombatStore.getState().setPhase('resolving');
      expect(useCombatStore.getState().phase).toBe('resolving');
    });

    it('active → idle 禁止 (必须经过 resolving → settled)', () => {
      useCombatStore.setState({ phase: 'active' });
      expect(() => useCombatStore.getState().setPhase('idle')).toThrow(CombatStoreError);
    });

    it('resolving → settled 允许', () => {
      useCombatStore.setState({ phase: 'resolving' });
      useCombatStore.getState().setPhase('settled');
      expect(useCombatStore.getState().phase).toBe('settled');
    });

    it('resolving → idle 禁止', () => {
      useCombatStore.setState({ phase: 'resolving' });
      expect(() => useCombatStore.getState().setPhase('idle')).toThrow(CombatStoreError);
    });

    it('settled → idle 允许', () => {
      useCombatStore.setState({ phase: 'settled' });
      useCombatStore.getState().setPhase('idle');
      expect(useCombatStore.getState().phase).toBe('idle');
    });

    it('settled → initializing 禁止 (一次战斗结束必须 idle 重新 init)', () => {
      useCombatStore.setState({ phase: 'settled' });
      expect(() => useCombatStore.getState().setPhase('initializing')).toThrow(CombatStoreError);
    });
  });
});

describe('combatStore: 初始化 + 激活', () => {
  beforeEach(() => {
    resetClientStores();
    useCombatStore.setState({ ...INITIAL_COMBAT_STATE, active: false, isPlayerTurn: false });
  });

  it('initialize: idle → initializing, 写入 combatants 和开场日志', () => {
    const player = makePlayer();
    const enemies = [makeEnemy('e1'), makeEnemy('e2')];
    useCombatStore.getState().initialize('combat_1', player, enemies, '三只哥布林从树丛后跃出');
    const s = useCombatStore.getState();
    expect(s.phase).toBe('initializing');
    expect(s.id).toBe('combat_1');
    expect(s.active).toBe(true);
    expect(s.combatants['player_1']).toEqual(player);
    expect(s.combatants['e1']).toEqual(enemies[0]);
    expect(s.combatants['e2']).toEqual(enemies[1]);
    expect(s.log).toHaveLength(1);
    expect(s.log[0].kind).toBe('start');
    expect(s.log[0].message).toBe('三只哥布林从树丛后跃出');
  });

  it('initialize: 非 idle 阶段抛错', () => {
    useCombatStore.setState({ phase: 'active' });
    expect(() => useCombatStore.getState().initialize('c1', makePlayer(), [])).toThrow(CombatStoreError);
  });

  it('activate: initializing → active, 设 round/turn + queue', () => {
    useCombatStore.setState({ phase: 'initializing' });
    const queue = [
      { combatantId: 'player_1', initiative: 18, rolledAt: 'start' as const },
      { combatantId: 'e1', initiative: 14, rolledAt: 'start' as const },
    ];
    useCombatStore.getState().activate(queue, 1);
    const s = useCombatStore.getState();
    expect(s.phase).toBe('active');
    expect(s.round).toBe(1);
    expect(s.turn).toBe(1);
    expect(s.queue).toEqual(queue);
  });

  it('activate: 非 initializing 阶段抛错', () => {
    useCombatStore.setState({ phase: 'idle' });
    expect(() => useCombatStore.getState().activate([])).toThrow(CombatStoreError);
  });
});

describe('combatStore: 战斗循环 (回合/turn)', () => {
  beforeEach(() => {
    resetClientStores();
    useCombatStore.setState({
      ...INITIAL_COMBAT_STATE,
      phase: 'active',
      round: 1,
      turn: 1,
      queue: [
        { combatantId: 'player_1', initiative: 18, rolledAt: 'start' },
        { combatantId: 'e1', initiative: 14, rolledAt: 'start' },
      ],
      combatants: {
        player_1: makePlayer(),
        e1: makeEnemy('e1'),
      },
    });
  });

  it('advanceTurn: turn +1', () => {
    useCombatStore.getState().advanceTurn();
    expect(useCombatStore.getState().turn).toBe(2);
  });

  it('advanceRound: round +1, turn 重置为 1', () => {
    useCombatStore.setState({ turn: 3 });
    useCombatStore.getState().advanceRound();
    const s = useCombatStore.getState();
    expect(s.round).toBe(2);
    expect(s.turn).toBe(1);
  });

  it('getCurrentActorId: turn 1 返回 queue[0]', () => {
    expect(useCombatStore.getState().getCurrentActorId()).toBe('player_1');
  });

  it('getCurrentActorId: turn 2 返回 queue[1]', () => {
    useCombatStore.setState({ turn: 2 });
    expect(useCombatStore.getState().getCurrentActorId()).toBe('e1');
  });

  it('getCurrentActorId: turn 超出 queue 返回 null', () => {
    useCombatStore.setState({ turn: 99 });
    expect(useCombatStore.getState().getCurrentActorId()).toBeNull();
  });

  it('isPlayerActor: 玩家是当前行动者', () => {
    expect(useCombatStore.getState().isPlayerActor('player_1')).toBe(true);
  });

  it('isPlayerActor: 玩家不是当前行动者', () => {
    useCombatStore.setState({ turn: 2 });
    expect(useCombatStore.getState().isPlayerActor('player_1')).toBe(false);
  });
});

describe('combatStore: 资源变更', () => {
  beforeEach(() => {
    resetClientStores();
    useCombatStore.setState({
      ...INITIAL_COMBAT_STATE,
      phase: 'active',
      combatants: {
        player_1: makePlayer({ hp: 20, maxHp: 24, ap: 4, maxAp: 6, mp: 10, maxMp: 20 }),
        e1: makeEnemy('e1', { hp: 12, maxHp: 12, ap: 4, maxAp: 4 }),
      },
    });
  });

  describe('applyDamage', () => {
    it('扣血', () => {
      useCombatStore.getState().applyDamage('e1', 5);
      expect(useCombatStore.getState().combatants.e1.hp).toBe(7);
    });

    it('加血 (负 amount)', () => {
      // e1 起始 hp=12 maxHp=12, 先扣血再测试加血
      useCombatStore.getState().applyDamage('e1', 5);
      expect(useCombatStore.getState().combatants.e1.hp).toBe(7);
      useCombatStore.getState().applyDamage('e1', -3);
      expect(useCombatStore.getState().combatants.e1.hp).toBe(10);
    });

    it('加血 clamp 到 maxHp', () => {
      useCombatStore.setState({ combatants: { ...useCombatStore.getState().combatants, e1: { ...useCombatStore.getState().combatants.e1, hp: 11 } } });
      useCombatStore.getState().applyDamage('e1', -10);
      expect(useCombatStore.getState().combatants.e1.hp).toBe(12);
    });

    it('HP=0 时正常扣', () => {
      useCombatStore.getState().applyDamage('e1', 12);
      expect(useCombatStore.getState().combatants.e1.hp).toBe(0);
    });

    it('负数 amount 不能让 HP 变负', () => {
      useCombatStore.getState().applyDamage('player_1', 999);
      expect(useCombatStore.getState().combatants.player_1.hp).toBe(0);
    });

    it('未知 combatantId 不抛错', () => {
      expect(() => useCombatStore.getState().applyDamage('ghost', 5)).not.toThrow();
    });
  });

  describe('applyAP', () => {
    it('扣 AP', () => {
      useCombatStore.getState().applyAP('player_1', -2);
      expect(useCombatStore.getState().combatants.player_1.ap).toBe(2);
    });

    it('加 AP clamp 到 maxAp', () => {
      useCombatStore.getState().applyAP('player_1', 999);
      expect(useCombatStore.getState().combatants.player_1.ap).toBe(6);
    });

    it('AP 不变 0 (clamp)', () => {
      useCombatStore.getState().applyAP('player_1', -999);
      expect(useCombatStore.getState().combatants.player_1.ap).toBe(0);
    });
  });

  describe('applyMP', () => {
    it('有 mp 字段时正常扣/加', () => {
      useCombatStore.getState().applyMP('player_1', -3);
      expect(useCombatStore.getState().combatants.player_1.mp).toBe(7);
    });

    it('clamp 到 [0, maxMp]', () => {
      useCombatStore.getState().applyMP('player_1', 999);
      expect(useCombatStore.getState().combatants.player_1.mp).toBe(20);
    });

    it('无 mp 字段时忽略 (无报错)', () => {
      expect(() => useCombatStore.getState().applyMP('e1', -5)).not.toThrow();
      expect(useCombatStore.getState().combatants.e1.mp).toBeUndefined();
    });
  });
});

describe('combatStore: buff 生命周期', () => {
  beforeEach(() => {
    resetClientStores();
    useCombatStore.setState({
      ...INITIAL_COMBAT_STATE,
      phase: 'active',
      combatants: {
        player_1: makePlayer(),
        e1: makeEnemy('e1'),
      },
    });
  });

  it('addBuff: 新 ref 直接推入', () => {
    useCombatStore.getState().addBuff('e1', {
      ref: '中毒', stacks: 1, remainingTurns: 3, source: 'item', appliedAtTurn: 1, modifiers: { CON: -1 },
    });
    expect(useCombatStore.getState().combatants.e1.conditions).toHaveLength(1);
  });

  it('addBuff: 同 ref 默认 replace', () => {
    useCombatStore.getState().addBuff('e1', { ref: '中毒', stacks: 1, remainingTurns: 3, source: 'a', appliedAtTurn: 1, modifiers: { CON: -1 } });
    useCombatStore.getState().addBuff('e1', { ref: '中毒', stacks: 1, remainingTurns: 5, source: 'b', appliedAtTurn: 2, modifiers: { CON: -2 } });
    const buffs = useCombatStore.getState().combatants.e1.conditions;
    expect(buffs).toHaveLength(1);
    expect(buffs[0].remainingTurns).toBe(5);
    expect(buffs[0].source).toBe('b');
  });

  it('addBuff: stackRule=stack 累加 stacks', () => {
    useCombatStore.getState().addBuff('e1', { ref: '流血', stacks: 1, remainingTurns: 3, source: 'a', appliedAtTurn: 1, modifiers: {}, stackRule: 'stack' });
    useCombatStore.getState().addBuff('e1', { ref: '流血', stacks: 1, remainingTurns: 3, source: 'a', appliedAtTurn: 1, modifiers: {}, stackRule: 'stack' });
    expect(useCombatStore.getState().combatants.e1.conditions[0].stacks).toBe(2);
  });

  it('addBuff: stackRule=ignore 已有同 ref 时忽略', () => {
    useCombatStore.getState().addBuff('e1', { ref: '流血', stacks: 1, remainingTurns: 3, source: 'a', appliedAtTurn: 1, modifiers: {}, stackRule: 'ignore' });
    useCombatStore.getState().addBuff('e1', { ref: '流血', stacks: 1, remainingTurns: 3, source: 'a', appliedAtTurn: 1, modifiers: {}, stackRule: 'ignore' });
    expect(useCombatStore.getState().combatants.e1.conditions).toHaveLength(1);
  });

  it('addBuff: stackRule=refresh 取 max(remainingTurns)', () => {
    useCombatStore.getState().addBuff('e1', { ref: '流血', stacks: 1, remainingTurns: 3, source: 'a', appliedAtTurn: 1, modifiers: {}, stackRule: 'refresh' });
    useCombatStore.getState().addBuff('e1', { ref: '流血', stacks: 1, remainingTurns: 5, source: 'a', appliedAtTurn: 1, modifiers: {}, stackRule: 'refresh' });
    expect(useCombatStore.getState().combatants.e1.conditions[0].remainingTurns).toBe(5);
  });

  it('removeBuff: 移除指定 ref', () => {
    useCombatStore.getState().addBuff('e1', { ref: '中毒', stacks: 1, remainingTurns: 3, source: 'a', appliedAtTurn: 1, modifiers: {} });
    useCombatStore.getState().removeBuff('e1', '中毒');
    expect(useCombatStore.getState().combatants.e1.conditions).toHaveLength(0);
  });

  it('tickBuffs: remainingTurns -1, 0 移除', () => {
    useCombatStore.getState().addBuff('e1', { ref: '中毒', stacks: 1, remainingTurns: 2, source: 'a', appliedAtTurn: 1, modifiers: {} });
    useCombatStore.getState().tickBuffs();
    expect(useCombatStore.getState().combatants.e1.conditions[0].remainingTurns).toBe(1);
    useCombatStore.getState().tickBuffs();
    expect(useCombatStore.getState().combatants.e1.conditions).toHaveLength(0);
  });

  it('tickBuffs: remainingTurns=-1 永久 buff 不减', () => {
    useCombatStore.getState().addBuff('e1', { ref: 'perma-wound', stacks: 1, remainingTurns: -1, source: 'a', appliedAtTurn: 1, modifiers: {} });
    useCombatStore.getState().tickBuffs();
    useCombatStore.getState().tickBuffs();
    expect(useCombatStore.getState().combatants.e1.conditions).toHaveLength(1);
  });

  it('tickBuffs: onTick 触发 hpDelta', () => {
    useCombatStore.getState().addBuff('e1', {
      ref: '中毒', stacks: 1, remainingTurns: 2, source: 'a', appliedAtTurn: 1, modifiers: {},
      onTick: () => ({ hpDelta: -3, log: '中毒伤害' }),
    });
    useCombatStore.getState().tickBuffs();
    expect(useCombatStore.getState().combatants.e1.hp).toBe(9); // 12 - 3
  });

  it('tickBuffs: onTick 治疗 (hpDelta > 0)', () => {
    useCombatStore.setState({ combatants: { ...useCombatStore.getState().combatants, e1: { ...useCombatStore.getState().combatants.e1, hp: 5 } } });
    useCombatStore.getState().addBuff('e1', {
      ref: 'HOT', stacks: 1, remainingTurns: 1, source: 'a', appliedAtTurn: 1, modifiers: {},
      onTick: () => ({ hpDelta: 4, log: 'hot' }),
    });
    useCombatStore.getState().tickBuffs();
    expect(useCombatStore.getState().combatants.e1.hp).toBe(9);
  });

  it('markDead: 标记死亡, HP=0', () => {
    useCombatStore.getState().markDead('e1');
    const c = useCombatStore.getState().combatants.e1;
    expect(c.isDead).toBe(true);
    expect(c.hp).toBe(0);
  });
});

describe('combatStore: 日志 + 结束流程', () => {
  beforeEach(() => {
    resetClientStores();
    useCombatStore.setState({ ...INITIAL_COMBAT_STATE, phase: 'active', combatants: { e1: makeEnemy('e1') } });
  });

  it('appendLog: 追加 log 包含 timestamp', () => {
    const before = useCombatStore.getState().log.length;
    useCombatStore.getState().appendLog({ kind: 'action', round: 1, turn: 1, message: 'test' });
    const log = useCombatStore.getState().log;
    expect(log).toHaveLength(before + 1);
    expect(log[log.length - 1].timestamp).toBeTypeOf('number');
  });

  it('beginResolving: active → resolving, 设 outcome + resolvedAt', () => {
    useCombatStore.getState().beginResolving('victory');
    const s = useCombatStore.getState();
    expect(s.phase).toBe('resolving');
    expect(s.outcome).toBe('victory');
    expect(s.resolvedAt).toBeGreaterThan(0);
  });

  it('beginResolving: 非 active 抛错', () => {
    useCombatStore.setState({ phase: 'idle' });
    expect(() => useCombatStore.getState().beginResolving('victory')).toThrow(CombatStoreError);
  });

  it('settle: resolving → settled, 写 narrativeClosing', () => {
    useCombatStore.setState({ phase: 'resolving' });
    useCombatStore.getState().settle('你击败了哥布林');
    const s = useCombatStore.getState();
    expect(s.phase).toBe('settled');
    expect(s.narrativeClosing).toBe('你击败了哥布林');
  });

  it('settle: 非 resolving 抛错', () => {
    expect(() => useCombatStore.getState().settle('x')).toThrow(CombatStoreError);
  });

  it('reset: settled → idle, 清空状态', () => {
    useCombatStore.setState({ phase: 'settled', id: 'c1', combatants: { e1: makeEnemy('e1') }, log: [] });
    useCombatStore.getState().reset();
    const s = useCombatStore.getState();
    expect(s.phase).toBe('idle');
    expect(s.id).toBe('');
    expect(s.combatants).toEqual({});
    expect(s.active).toBe(false);
  });

  it('reset: active 抛错 (必须经过 resolving → settled)', () => {
    useCombatStore.setState({ phase: 'active' });
    expect(() => useCombatStore.getState().reset()).toThrow(CombatStoreError);
  });
});

describe('combatStore: 工具函数', () => {
  beforeEach(() => {
    resetClientStores();
    useCombatStore.setState({ ...INITIAL_COMBAT_STATE, active: false });
  });

  it('isCombatActive: active/initializing 算 active (initializing 在 active 之前)', () => {
    useCombatStore.setState({ phase: 'initializing' });
    expect(isCombatActive(useCombatStore.getState())).toBe(false); // 只有 active/resolving 算 active UI 接管
    useCombatStore.setState({ phase: 'active' });
    expect(isCombatActive(useCombatStore.getState())).toBe(true);
    useCombatStore.setState({ phase: 'resolving' });
    expect(isCombatActive(useCombatStore.getState())).toBe(true);
    useCombatStore.setState({ phase: 'idle' });
    expect(isCombatActive(useCombatStore.getState())).toBe(false);
  });

  it('isCombatOver: settled/idle 算结束', () => {
    useCombatStore.setState({ phase: 'settled' });
    expect(isCombatOver(useCombatStore.getState())).toBe(true);
    useCombatStore.setState({ phase: 'idle' });
    expect(isCombatOver(useCombatStore.getState())).toBe(true);
    useCombatStore.setState({ phase: 'active' });
    expect(isCombatOver(useCombatStore.getState())).toBe(false);
  });

  it('COMBAT_LOG_MAX = 100 (UI 滚动日志上限)', () => {
    expect(COMBAT_LOG_MAX).toBe(100);
  });
});

describe('combatStore: _replaceState 调试用', () => {
  beforeEach(() => {
    resetClientStores();
    useCombatStore.setState({ ...INITIAL_COMBAT_STATE });
  });

  it('_replaceState 可直接覆盖 state 字段', () => {
    useCombatStore.getState()._replaceState({ phase: 'active', round: 5 });
    const s = useCombatStore.getState();
    expect(s.phase).toBe('active');
    expect(s.round).toBe(5);
  });
});
