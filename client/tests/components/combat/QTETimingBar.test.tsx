/**
 * v0.4 战斗系统 — QTETimingBar RTL 测试
 *
 * 覆盖:
 * - idle 状态不渲染
 * - pending 状态渲染横条 + 命中窗口 + 指针
 * - 点击 track -> 命中窗口内算 hit, 外不算
 * - ESC 键 -> cancel
 * - rounds 全部完成自动 finish
 * - 注入 testNow 控时间
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { QTETimingBar } from '../../../src/components/combat/QTETimingBar';
import { useQTEStore } from '../../../src/stores/qteStore';
import { resetClientStores } from '../../utils/resetStores';
import { startAttackQTE, type QTERunState } from '../../../src/services/combat/QTELayer';

function seedAttackQTE(rounds: number, hits = 0, playerId = 'p-1', targetId = 'e-1'): QTERunState {
  // 用 startAttackQTE 创建一个 pending 状态, 但用确定性 rounds
  // rounds=0 -> agilityDelta=0 -> 1 round; rounds>0 -> 直接用 (绕过 computeAttackRounds)
  // 这里采用计算公式, agilityDelta = rounds * 4
  const s = startAttackQTE(rounds * 4);
  return { ...s, hits, payload: rounds, context: { playerId, targetId, spell: '' } } as QTERunState;
}

beforeEach(() => {
  resetClientStores();
});

afterEach(() => {
  cleanup();
});

describe('QTETimingBar: 渲染路由', () => {
  it('idle 状态不渲染', () => {
    useQTEStore.setState({ state: { phase: 'idle', type: null, payload: null, hits: 0, total: 0, startedAt: 0, baseMs: 0 } });
    const { container } = render(<QTETimingBar />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('qte-timing-bar')).toBeNull();
  });

  it('pending attack 状态渲染横条 + 命中窗口 + 指针', () => {
    useQTEStore.setState({ state: seedAttackQTE(3), context: { playerId: 'p-1', targetId: 'e-1', spell: '' }, resolver: null });
    render(<QTETimingBar />);
    const bar = screen.getByTestId('qte-timing-bar');
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveAttribute('data-rounds', '3');
    expect(bar).toHaveAttribute('data-context-player', 'p-1');
    expect(bar).toHaveAttribute('data-context-target', 'e-1');
    expect(screen.getByTestId('qte-timing-bar-track')).toBeInTheDocument();
    expect(screen.getByTestId('qte-timing-bar-pointer')).toBeInTheDocument();
    // 3 个 hit pip
    expect(screen.getByTestId('qte-hit-pip-0')).toBeInTheDocument();
    expect(screen.getByTestId('qte-hit-pip-1')).toBeInTheDocument();
    expect(screen.getByTestId('qte-hit-pip-2')).toBeInTheDocument();
  });

  it('pending magic 状态不渲染 (QTETypingBox 负责)', () => {
    useQTEStore.setState({
      state: { phase: 'pending', type: 'magic', payload: 'fireball', hits: 0, total: 8, startedAt: 0, baseMs: 5000 },
      context: { playerId: 'p-1', targetId: 'e-1', spell: 'fireball' },
      resolver: null,
    });
    const { container } = render(<QTETimingBar />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('qte-timing-bar')).toBeNull();
  });
});

describe('QTETimingBar: 命中交互', () => {
  it('点击 track (pointer 在窗口外) -> 不算 hit, 推进 round', async () => {
    useQTEStore.setState({ state: seedAttackQTE(3), context: { playerId: 'p-1', targetId: 'e-1', spell: '' }, resolver: null });
    // testNow 注入: 第 1 次返 0 (start), 第 2 次返 200ms (pointer=0.1 在窗口 [0.4, 0.6] 外)
    let calls = 0;
    const testNow = vi.fn(() => (++calls === 1 ? 0 : 200));
    render(<QTETimingBar testNow={testNow} />);
    // 推进一帧 rAF, 让 pointer 从 0 更新到 (200-0)/2000 = 0.1
    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    fireEvent.click(screen.getByTestId('qte-timing-bar-track'));
    // 命中 0/3, 进入 round 2 (0-indexed = 1)
    const bar = screen.getByTestId('qte-timing-bar');
    expect(bar).toHaveAttribute('data-hits', '0');
    expect(bar).toHaveAttribute('data-round', '1');
  });

  it('点击 track (pointer 在窗口内) -> 算 hit, 推进 round', async () => {
    useQTEStore.setState({ state: seedAttackQTE(3, 0), context: { playerId: 'p-1', targetId: 'e-1', spell: '' }, resolver: null });
    // 第 1 次返 0 (start), 第 2 次返 1000ms (pointer=0.5 正中窗口)
    let calls = 0;
    const testNow = vi.fn(() => (++calls === 1 ? 0 : 1000));
    render(<QTETimingBar testNow={testNow} />);
    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    fireEvent.click(screen.getByTestId('qte-timing-bar-track'));
    const bar = screen.getByTestId('qte-timing-bar');
    expect(bar).toHaveAttribute('data-hits', '1');
    expect(bar).toHaveAttribute('data-round', '1');
  });

  it('空格键也算 hit', async () => {
    useQTEStore.setState({ state: seedAttackQTE(2, 0), context: { playerId: 'p-1', targetId: 'e-1', spell: '' }, resolver: null });
    let calls = 0;
    const testNow = vi.fn(() => (++calls === 1 ? 0 : 1000));
    render(<QTETimingBar testNow={testNow} />);
    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.getByTestId('qte-timing-bar')).toHaveAttribute('data-hits', '1');
  });

  it('ESC 键调 cancel (mock resolver)', () => {
    const cancelSpy = vi.fn();
    useQTEStore.setState({
      state: seedAttackQTE(3),
      context: { playerId: 'p-1', targetId: 'e-1', spell: '' },
      resolver: null,
      cancel: cancelSpy,
    });
    render(<QTETimingBar />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });
});

describe('QTETimingBar: rounds 推进', () => {
  it('全部 rounds 命中 -> 自动 finish (调 store.finish)', async () => {
    const finishSpy = vi.fn();
    useQTEStore.setState({
      // rounds=1: 1 次点击即完成 -> finish
      state: seedAttackQTE(1, 0),
      context: { playerId: 'p-1', targetId: 'e-1', spell: '' },
      resolver: null,
      finish: finishSpy,
    });
    let calls = 0;
    const testNow = vi.fn(() => (++calls === 1 ? 0 : 1000));
    render(<QTETimingBar testNow={testNow} />);
    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    fireEvent.click(screen.getByTestId('qte-timing-bar-track'));
    expect(finishSpy).toHaveBeenCalledTimes(1);
  });

  it('5 个 hit pip 渲染当 rounds=5', () => {
    useQTEStore.setState({
      state: seedAttackQTE(5, 2),
      context: { playerId: 'p-1', targetId: 'e-1', spell: '' },
      resolver: null,
    });
    render(<QTETimingBar />);
    for (let i = 0; i < 5; i++) {
      expect(screen.getByTestId(`qte-hit-pip-${i}`)).toBeInTheDocument();
    }
    const bar = screen.getByTestId('qte-timing-bar');
    expect(bar).toHaveAttribute('data-accuracy', '0.40'); // 2/5 = 0.40
  });
});
