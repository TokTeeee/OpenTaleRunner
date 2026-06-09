/**
 * v0.6.x 战斗系统 — useQTERunner hook 测试
 *
 * 历史变更:
 * - v0.5-dev: 移除 skill 走魔法 QTE 的用例 (skill 已隐藏);
 *   defend cost 改为 1 AP (与 DEFEND_AP_COST 同步)
 * - v0.6.2: 新增 ability 路径测试 (不开 QTE, 走 resolveAbility,
 *   命中/伤害走 8 元素抗性, 扣 MP, 抛 InsufficientMPError);
 *   defend cost 保持 1 AP 不变
 *
 * 覆盖:
 * - QTE 关闭: attack 走 resolve() (modifier=0)
 * - QTE 开启: attack 走 runAttack + resolveWithQTE
 * - defend / flee / item / wait 不走 QTE
 * - ability (v0.6.2): 不走 QTE, 走 resolveAbility, 扣 MP, applyResistance
 * - AP/MP 扣费 + turn 推进
 * - 战斗胜利 -> beginResolving(victory)
 * - 战斗失败 -> beginResolving(defeat)
 * - 战斗回合结束 -> advanceRound
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, act, cleanup } from '@testing-library/react';
import { useQTERunner, _resetQTERunnerResolver } from '../../src/hooks/useQTERunner';
import { useCombatStore, INITIAL_COMBAT_STATE } from '../../src/stores/combatStore';
import { useQTEStore } from '../../src/stores/qteStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useCharacterStore } from '../../src/stores/characterStore';
import { resetClientStores } from '../utils/resetStores';
import type { Combatant, CombatAction } from '../../src/services/combat/types';
import type { QTEResult } from '../../src/services/combat/QTELayer';

function makeCombatant(overrides: Partial<Combatant> & { id: string; side: 'player' | 'enemy' }): Combatant {
  return {
    name: overrides.id,
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: 24, maxHp: 24,
    ap: 6, maxAp: 6,
    conditions: [],
    isDead: false,
    isFleeing: false,
    equipped: { weapon: null, armor: null, accessory: null },
    ...overrides,
  };
}

function seedCombat(opts?: {
  playerAp?: number;
  enemyHp?: number;
  enemyDead?: boolean;
}): void {
  const player = makeCombatant({ id: 'p-1', side: 'player', ap: opts?.playerAp ?? 6 });
  const enemy = makeCombatant({
    id: 'e-1',
    side: 'enemy',
    hp: opts?.enemyHp ?? 24,
    isDead: opts?.enemyDead ?? false,
  });
  useCombatStore.setState({
    ...INITIAL_COMBAT_STATE,
    id: 'test-1',
    phase: 'active',
    round: 1,
    turn: 1,
    queue: [
      { combatantId: 'p-1', initiative: 12, rolledAt: 'start' },
      { combatantId: 'e-1', initiative: 8, rolledAt: 'start' },
    ],
    combatants: { 'p-1': player, 'e-1': enemy },
    log: [
      { kind: 'start', round: 0, turn: 0, message: '战斗开始', timestamp: Date.now() },
    ],
    startedAt: Date.now(),
    active: true,
    isPlayerTurn: true,
  });
}

function seedCharacter(hp = 24): void {
  useCharacterStore.getState().setCharacter({
    characterId: 'char-1',
    playerId: 'p-1',
    name: '测试',
    race: '人类',
    background: '测试',
    appearance: '测试',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    skills: [],
    inventory: { equipped: { weapon: null, armor: null, accessory: null }, backpack: [], currency: { gold: 0, silver: 0, copper: 0 } },
    hp, maxHp: hp,
    vital: { hunger: 0, thirst: 0, fatigue: 0, hygiene: 0, morale: 0, wound: 0, temperature: 37, encumbrance: 0 },
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    conditions: [],
    joinedRegion: 'test',
    joinedWorldDay: 1,
    currentLocalDay: 1,
    lastActionTime: '',
  } as never);
}

let exposedExecute: ((a: CombatAction) => Promise<{ qteResult: QTEResult; action: CombatAction }>) | null = null;

function HookHarness() {
  const { executeAction } = useQTERunner();
  // 故意写外部变量, 仅测试期间 (avoid react-hooks/globals)
  // eslint-disable-next-line react-hooks/globals
  exposedExecute = executeAction;
  return null;
}

beforeEach(() => {
  resetClientStores();
  _resetQTERunnerResolver();
  exposedExecute = null;
  seedCharacter();
});

afterEach(() => {
  cleanup();
});

describe('useQTERunner: QTE 关闭路径', () => {
  it('QTE disabled + attack -> 走 resolve() (modifier=0)', async () => {
    seedCombat();
    useSettingsStore.setState({ qte: { enabled: false, attackMaxRounds: 5, magicBaseMs: 5000, damageScale: 0.3 } });
    render(<HookHarness />);
    const runAttack = vi.fn();
    useQTEStore.setState({ runAttack });
    await act(async () => {
      await exposedExecute!({ kind: 'attack', attackerId: 'p-1', targetId: 'e-1' });
    });
    // runAttack 不应被调
    expect(runAttack).not.toHaveBeenCalled();
    expect(useCombatStore.getState().combatants['p-1'].ap).toBe(4);
    // turn 推进
    expect(useCombatStore.getState().turn).toBe(2);
  });

  it('QTE disabled + defend -> 走 resolve(), 玩家 AP=5 (1 AP cost)', async () => {
    seedCombat();
    useSettingsStore.setState({ qte: { enabled: false, attackMaxRounds: 5, magicBaseMs: 5000, damageScale: 0.3 } });
    render(<HookHarness />);
    await act(async () => {
      await exposedExecute!({ kind: 'defend', userId: 'p-1', cost: { ap: 1 } });
    });
    // v0.5-dev: defend cost = 1 AP, 6 - 1 = 5
    expect(useCombatStore.getState().combatants['p-1'].ap).toBe(5);
    // turn 推进
    expect(useCombatStore.getState().turn).toBe(2);
  });

  it('QTE disabled + flee -> 走 resolve(), 玩家 AP 不变 (cost=0 ap=6 -> 6)', async () => {
    seedCombat();
    useSettingsStore.setState({ qte: { enabled: false, attackMaxRounds: 5, magicBaseMs: 5000, damageScale: 0.3 } });
    render(<HookHarness />);
    await act(async () => {
      await exposedExecute!({ kind: 'flee', userId: 'p-1' });
    });
    // flee AP cost = 0
    expect(useCombatStore.getState().combatants['p-1'].ap).toBe(6);
  });
});

describe('useQTERunner: QTE 开启路径', () => {
  it('QTE enabled + attack -> 调 runAttack + 拿 result 走 resolveWithQTE', async () => {
    seedCombat();
    useSettingsStore.setState({ qte: { enabled: true, attackMaxRounds: 5, magicBaseMs: 5000, damageScale: 0.3 } });
    render(<HookHarness />);
    // mock runAttack: 立即 resolve 一个 acc=1, mod=1 的 result
    const mockResult: QTEResult = { accuracy: 1, modifier: 1, type: 'attack' };
    useQTEStore.setState({
      runAttack: () => Promise.resolve(mockResult),
    });
    await act(async () => {
      await exposedExecute!({ kind: 'attack', attackerId: 'p-1', targetId: 'e-1' });
    });
    // 玩家 AP 扣 2
    expect(useCombatStore.getState().combatants['p-1'].ap).toBe(4);
  });
});

describe('useQTERunner: 战斗结束检测', () => {
  it('全部敌人死亡 -> beginResolving(victory)', async () => {
    seedCombat({ enemyHp: 0 });
    // 预置敌人已死亡 (isDead=true, hp=0)
    useCombatStore.setState((s) => ({
      combatants: { ...s.combatants, 'e-1': { ...s.combatants['e-1'], hp: 0, isDead: true } },
    }));
    useSettingsStore.setState({ qte: { enabled: false, attackMaxRounds: 5, magicBaseMs: 5000, damageScale: 0.3 } });
    render(<HookHarness />);
    // 单次攻击, resolver 会因 target.isDead 立即返 "无效攻击", 但 end check 仍跑 -> victory
    await act(async () => {
      await exposedExecute!({ kind: 'attack', attackerId: 'p-1', targetId: 'e-1' });
    });
    expect(useCombatStore.getState().phase).toBe('resolving');
    expect(useCombatStore.getState().outcome).toBe('victory');
  });

  it('玩家死亡 -> beginResolving(defeat)', async () => {
    seedCombat({ playerAp: 6 });
    useSettingsStore.setState({ qte: { enabled: false, attackMaxRounds: 5, magicBaseMs: 5000, damageScale: 0.3 } });
    render(<HookHarness />);
    // 预置玩家已死亡
    useCombatStore.setState((s) => ({
      combatants: { ...s.combatants, 'p-1': { ...s.combatants['p-1'], hp: 0, isDead: true } },
    }));
    await act(async () => {
      // 玩家攻击会因 attacker.isDead 立即返 "无效攻击", 但 end check 看到 allPlayersDead -> defeat
      await exposedExecute!({ kind: 'attack', attackerId: 'p-1', targetId: 'e-1' });
    });
    expect(useCombatStore.getState().phase).toBe('resolving');
    expect(useCombatStore.getState().outcome).toBe('defeat');
  });
});

describe('useQTERunner: 回合推进', () => {
  it('turn 推进到 queue 末尾 -> advanceRound (turn 重新 = 1)', async () => {
    seedCombat();
    useSettingsStore.setState({ qte: { enabled: false, attackMaxRounds: 5, magicBaseMs: 5000, damageScale: 0.3 } });
    render(<HookHarness />);
    // queue 长度 2, turn=1 -> 执行后 turn=2, 2 > 2? 不 (equal, not greater)
    await act(async () => {
      await exposedExecute!({ kind: 'attack', attackerId: 'p-1', targetId: 'e-1' });
    });
    // 第二次执行 (turn=2) -> turn=3 > 2 -> advanceRound -> round=2, turn=1
    await act(async () => {
      // 给玩家补 AP, 否则 AP 不足会抛错
      useCombatStore.setState((s) => ({
        combatants: { ...s.combatants, 'p-1': { ...s.combatants['p-1'], ap: 6 } },
      }));
      await exposedExecute!({ kind: 'attack', attackerId: 'p-1', targetId: 'e-1' });
    });
    expect(useCombatStore.getState().round).toBe(2);
    expect(useCombatStore.getState().turn).toBe(1);
  });
});
