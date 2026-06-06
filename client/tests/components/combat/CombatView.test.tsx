/**
 * v0.4 战斗系统 — CombatView 测试
 *
 * 覆盖 5 phase:
 * - idle          -> 渲染 null
 * - initializing  -> 仪式开场
 * - active        -> CombatField + ActionMenu + CombatLog
 * - resolving     -> 结算中
 * - settled       -> SettlementModal
 *
 * + ActionMenu 5 按钮 disabled/enabled 状态
 * + 选目标交互
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CombatView } from '../../../src/components/combat/CombatView';
import { useCombatStore, INITIAL_COMBAT_STATE } from '../../../src/stores/combatStore';
import { useCharacterStore } from '../../../src/stores/characterStore';
import { useGameStore } from '../../../src/stores/gameStore';
import { useQTEStore } from '../../../src/stores/qteStore';
import { resetClientStores } from '../../utils/resetStores';
import type { Combatant } from '../../../src/services/combat/types';

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

function seedCharacter(): void {
  useCharacterStore.getState().setCharacter({
    characterId: 'char-1',
    playerId: 'p-1',
    name: '测试玩家',
    race: '人类',
    background: '测试',
    appearance: '测试',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    skills: [],
    inventory: { equipped: { weapon: null, armor: null, accessory: null }, backpack: [], currency: { gold: 100, silver: 0, copper: 0 } },
    hp: 24, maxHp: 24,
    vital: { hunger: 0, thirst: 0, fatigue: 0, hygiene: 0, morale: 0, wound: 0, temperature: 37, encumbrance: 0 },
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    conditions: [],
    joinedRegion: 'test',
    joinedWorldDay: 1,
    currentLocalDay: 1,
    lastActionTime: '',
  } as never);
}

function seedCombat(phase: 'initializing' | 'active' | 'resolving' | 'settled', opts?: {
  outcome?: 'victory' | 'defeat';
  rating?: 'trivial' | 'normal' | 'hard' | 'deadly';
}): void {
  const player = makeCombatant({ id: 'p-1', side: 'player' });
  const enemy = makeCombatant({ id: 'e-1', side: 'enemy' });
  useCombatStore.setState({
    ...INITIAL_COMBAT_STATE,
    id: 'test-1',
    phase,
    round: 1,
    turn: 1,
    queue: [
      { combatantId: 'p-1', initiative: 12, rolledAt: 'start' },
      { combatantId: 'e-1', initiative: 8, rolledAt: 'start' },
    ],
    combatants: { 'p-1': player, 'e-1': enemy },
    log: [
      { kind: 'start', round: 0, turn: 0, message: '战斗开始', timestamp: Date.now() },
      { kind: 'turnStart', round: 1, turn: 1, message: '玩家回合', timestamp: Date.now() },
    ],
    startedAt: Date.now(),
    active: true,
    isPlayerTurn: true,
    outcome: opts?.outcome,
    balanceRating: opts?.rating ?? 'normal',
    balanceReport: opts?.rating
      ? {
          rating: opts.rating,
          powerRatio: 0.81,
          playerPower: 100,
          enemyPower: 81,
          failurePenalty: { damageTaken: 'minor', goldLostPercent: 0.1, conditions: ['wounded_1'], survives: true },
        }
      : undefined,
  });
}

beforeEach(() => {
  resetClientStores();
  seedCharacter();
  useGameStore.setState(useGameStore.getInitialState(), true);
});

afterEach(() => {
  cleanup();
});

describe('CombatView: FSM 路由 (5 phase)', () => {
  it('idle 阶段渲染 null', () => {
    useCombatStore.setState({ ...INITIAL_COMBAT_STATE, phase: 'idle', active: false });
    const { container } = render(<CombatView />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('combat-view')).toBeNull();
  });

  it('initializing 阶段渲染仪式开场', () => {
    seedCombat('initializing');
    render(<CombatView />);
    expect(screen.getByTestId('combat-initializing')).toBeInTheDocument();
    expect(screen.getByText('召唤仪式')).toBeInTheDocument();
  });

  it('active 阶段渲染 CombatField + ActionMenu + CombatLog', () => {
    seedCombat('active');
    render(<CombatView />);
    expect(screen.getByTestId('combat-view')).toHaveAttribute('data-phase', 'active');
    expect(screen.getByTestId('combat-field')).toBeInTheDocument();
    expect(screen.getByTestId('action-menu')).toBeInTheDocument();
    expect(screen.getByTestId('combat-log')).toBeInTheDocument();
    // 5 个动作按钮
    expect(screen.getByTestId('action-attack')).toBeInTheDocument();
    expect(screen.getByTestId('action-skill')).toBeInTheDocument();
    expect(screen.getByTestId('action-item')).toBeInTheDocument();
    expect(screen.getByTestId('action-defend')).toBeInTheDocument();
    expect(screen.getByTestId('action-flee')).toBeInTheDocument();
  });

  it('resolving 阶段渲染结算中', () => {
    seedCombat('resolving');
    render(<CombatView />);
    expect(screen.getByTestId('combat-resolving')).toBeInTheDocument();
    expect(screen.getByText('结算中')).toBeInTheDocument();
  });

  it('settled 阶段渲染 SettlementModal', () => {
    seedCombat('settled', { outcome: 'victory', rating: 'normal' });
    render(<CombatView />);
    const modal = screen.getByTestId('combat-settlement');
    expect(modal).toBeInTheDocument();
    expect(modal).toHaveAttribute('data-outcome', 'victory');
    expect(screen.getByText('胜利')).toBeInTheDocument();
    expect(screen.getByText('继续旅途')).toBeInTheDocument();
  });

  it('settled defeat 显示失败 + deadly 难度', () => {
    seedCombat('settled', { outcome: 'defeat', rating: 'deadly' });
    render(<CombatView />);
    const modal = screen.getByTestId('combat-settlement');
    expect(modal).toHaveAttribute('data-outcome', 'defeat');
    expect(screen.getByText('失败')).toBeInTheDocument();
    expect(screen.getByText('致命')).toBeInTheDocument();
  });
});

describe('CombatView: ActionMenu AP 状态', () => {
  it('玩家 AP=6: 5 按钮全可点 (attack 2AP / skill 4AP / item 0AP / defend 1AP / flee 0AP)', () => {
    seedCombat('active');
    render(<CombatView />);
    // 玩家 AP=6 全部按钮 enabled (attack 2 / skill 4 / item 0 / defend 1 / flee 0)
    expect(screen.getByTestId('action-attack')).not.toBeDisabled();
    expect(screen.getByTestId('action-skill')).not.toBeDisabled();
    expect(screen.getByTestId('action-item')).not.toBeDisabled();
    expect(screen.getByTestId('action-defend')).not.toBeDisabled();
    expect(screen.getByTestId('action-flee')).not.toBeDisabled();
  });

  it('玩家 AP=1: attack(2) disabled, skill(4) disabled, item/defend/flee 可点', () => {
    seedCombat('active');
    useCombatStore.setState((s) => ({
      combatants: {
        ...s.combatants,
        'p-1': { ...s.combatants['p-1'], ap: 1 },
      },
    }));
    render(<CombatView />);
    expect(screen.getByTestId('action-attack')).toBeDisabled();
    expect(screen.getByTestId('action-skill')).toBeDisabled();
    expect(screen.getByTestId('action-item')).not.toBeDisabled();
    expect(screen.getByTestId('action-defend')).not.toBeDisabled();
    expect(screen.getByTestId('action-flee')).not.toBeDisabled();
  });

  it('玩家 AP=2: attack(2) 可用, skill(4) disabled, item/defend/flee 可点', () => {
    seedCombat('active');
    useCombatStore.setState((s) => ({
      combatants: {
        ...s.combatants,
        'p-1': { ...s.combatants['p-1'], ap: 2 },
      },
    }));
    render(<CombatView />);
    expect(screen.getByTestId('action-attack')).not.toBeDisabled();
    expect(screen.getByTestId('action-skill')).toBeDisabled();
    expect(screen.getByTestId('action-item')).not.toBeDisabled();
    expect(screen.getByTestId('action-defend')).not.toBeDisabled();
    expect(screen.getByTestId('action-flee')).not.toBeDisabled();
  });

  it('不是玩家回合: 全按钮 disabled', () => {
    seedCombat('active');
    useCombatStore.setState(() => ({
      queue: [
        { combatantId: 'e-1', initiative: 12, rolledAt: 'start' },
        { combatantId: 'p-1', initiative: 8, rolledAt: 'start' },
      ],
    }));
    render(<CombatView />);
    expect(screen.getByTestId('action-attack')).toBeDisabled();
    expect(screen.getByTestId('action-flee')).toBeDisabled();
  });
});

describe('CombatView: 目标选择交互', () => {
  it('点 attack 按钮后, CombatantCard 进入 target 模式 (可点)', () => {
    seedCombat('active');
    render(<CombatView />);
    fireEvent.click(screen.getByTestId('action-attack'));
    // 选中后, 字段 data-selected-action 应该有值
    expect(screen.getByTestId('combat-view')).toHaveAttribute('data-selected-action', 'attack');
    // 取消按钮出现
    expect(screen.getByText(/取消 attack/)).toBeInTheDocument();
  });

  it('点取消按钮恢复非 target 模式', () => {
    seedCombat('active');
    render(<CombatView />);
    fireEvent.click(screen.getByTestId('action-attack'));
    fireEvent.click(screen.getByText(/取消 attack/));
    expect(screen.getByTestId('combat-view')).toHaveAttribute('data-selected-action', '');
  });

  it('点敌人卡片 (target 模式) 复位选状态 (Phase 6 接入 ActionResolver)', () => {
    seedCombat('active');
    render(<CombatView />);
    fireEvent.click(screen.getByTestId('action-attack'));
    expect(screen.getByTestId('combat-view')).toHaveAttribute('data-selected-action', 'attack');
    fireEvent.click(screen.getByTestId('combatant-card-e-1'));
    // 复位
    expect(screen.getByTestId('combat-view')).toHaveAttribute('data-selected-action', '');
  });
});

describe('CombatView: CombatField 敌我分布', () => {
  it('CombatantCard 按 side 渲染: 敌 = enemy 侧, 玩家 = player 侧', () => {
    seedCombat('active');
    render(<CombatView />);
    const pCard = screen.getByTestId('combatant-card-p-1');
    const eCard = screen.getByTestId('combatant-card-e-1');
    expect(pCard).toHaveAttribute('data-side', 'player');
    expect(eCard).toHaveAttribute('data-side', 'enemy');
  });

  it('当前行动者 (turn=1) 的卡片有 data-current-actor=true', () => {
    seedCombat('active');
    render(<CombatView />);
    // queue: p-1 (ini 12) 在前, e-1 (ini 8) 在后; turn=1 -> p-1 是当前
    const pCard = screen.getByTestId('combatant-card-p-1');
    expect(pCard).toHaveAttribute('data-current-actor', 'true');
    expect(screen.getByTestId('combatant-card-e-1')).toHaveAttribute('data-current-actor', 'false');
  });

  it('CombatLog 显示初始 log 2 条', () => {
    seedCombat('active');
    render(<CombatView />);
    const log = screen.getByTestId('combat-log');
    expect(log).toHaveAttribute('data-entries', '2');
    expect(screen.getAllByTestId('combat-log-entry')).toHaveLength(2);
  });
});

describe('CombatView: TopBar 难度显示', () => {
  it('active 阶段顶栏显示难度 + 战力比', () => {
    seedCombat('active', { rating: 'hard' });
    useCombatStore.setState((s) => ({
      balanceReport: s.balanceReport
        ? { ...s.balanceReport, rating: 'hard', powerRatio: 1.45 }
        : undefined,
    }));
    render(<CombatView />);
    const top = screen.getByTestId('combat-topbar');
    expect(top).toHaveAttribute('data-rating', 'hard');
    expect(top).toHaveAttribute('data-power-ratio', '1.45');
    expect(screen.getByText('困难')).toBeInTheDocument();
  });
});

describe('CombatView: Phase 6 executeAction 接入', () => {
  it('点 defend -> 立即调 executeAction (不需 target 选), data-qte-phase=idle', async () => {
    seedCombat('active');
    render(<CombatView />);
    // 点 defend 之前 qte phase 应为 idle
    expect(screen.getByTestId('combat-view')).toHaveAttribute('data-qte-phase', 'idle');
    fireEvent.click(screen.getByTestId('action-defend'));
    // defend 不需 target 选, 立即执行. UI 仍为 idle (QTE 关闭)
    // AP 应该被扣 (ACTION_COSTS.defend.ap = 1, advanceTurn 给下一个 combatant +1)
    const player = useCombatStore.getState().combatants['p-1'];
    expect(player.ap).toBe(5);
    // 仍未进 target 模式
    expect(screen.getByTestId('combat-view')).toHaveAttribute('data-selected-action', '');
  });

  it('点 flee -> 立即调 executeAction, 不需 target', () => {
    seedCombat('active');
    render(<CombatView />);
    fireEvent.click(screen.getByTestId('action-flee'));
    const player = useCombatStore.getState().combatants['p-1'];
    // flee AP cost = 0 -> 6-0=6
    expect(player.ap).toBe(6);
    expect(screen.getByTestId('combat-view')).toHaveAttribute('data-selected-action', '');
  });

  it('点 attack + 选敌人 -> QTE 关闭时调 resolver.resolve() + 调 advanceTurn', async () => {
    seedCombat('active');
    // QTE 默认 disabled
    render(<CombatView />);
    fireEvent.click(screen.getByTestId('action-attack'));
    expect(screen.getByTestId('combat-view')).toHaveAttribute('data-selected-action', 'attack');
    fireEvent.click(screen.getByTestId('combatant-card-e-1'));
    // turn 从 1 推进到 2
    expect(useCombatStore.getState().turn).toBe(2);
  });

  it('点 item -> 仍走 openModal (ActionMenu 拦截)', () => {
    seedCombat('active');
    render(<CombatView />);
    fireEvent.click(screen.getByTestId('action-item'));
    // item 走背包 modal, 不走 executeAction. 验证 data-selected-action 仍为空
    expect(screen.getByTestId('combat-view')).toHaveAttribute('data-selected-action', '');
  });
});

describe('CombatView: QTE 弹层渲染', () => {
  it('qteState.idle 时不渲染 QTE 弹层', () => {
    seedCombat('active');
    render(<CombatView />);
    expect(screen.queryByTestId('qte-timing-bar')).toBeNull();
    expect(screen.queryByTestId('qte-typing-box')).toBeNull();
  });

  it('qteState.pending attack 时渲染 QTETimingBar (但不渲染 TypingBox)', () => {
    seedCombat('active');
    useQTEStore.setState({
      state: { phase: 'pending', type: 'attack', payload: 3, hits: 0, total: 3, startedAt: 0, baseMs: 0 },
      context: { playerId: 'p-1', targetId: 'e-1', spell: '' },
      resolver: null,
    });
    render(<CombatView />);
    expect(screen.getByTestId('qte-timing-bar')).toBeInTheDocument();
    expect(screen.queryByTestId('qte-typing-box')).toBeNull();
    expect(screen.getByTestId('combat-view')).toHaveAttribute('data-qte-phase', 'pending');
    expect(screen.getByTestId('combat-view')).toHaveAttribute('data-qte-type', 'attack');
  });

  it('qteState.pending magic 时渲染 QTETypingBox (但不渲染 TimingBar)', () => {
    seedCombat('active');
    useQTEStore.setState({
      state: { phase: 'pending', type: 'magic', payload: 'fireball', hits: 0, total: 8, startedAt: 0, baseMs: 5000 },
      context: { playerId: 'p-1', targetId: 'e-1', spell: 'fireball' },
      resolver: null,
    });
    render(<CombatView />);
    expect(screen.getByTestId('qte-typing-box')).toBeInTheDocument();
    expect(screen.queryByTestId('qte-timing-bar')).toBeNull();
  });
});
