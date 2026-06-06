/**
 * v0.4 战斗系统 — QTETypingBox RTL 测试
 *
 * 覆盖:
 * - idle / attack 状态不渲染
 * - pending magic 状态渲染咒语字符 + 倒计时条
 * - 键入正确字符 -> 标 emerald
 * - 键入错误字符 -> 标 rose line-through
 * - Backspace 退格
 * - Enter 提前结束 -> finish
 * - ESC -> cancel
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QTETypingBox } from '../../../src/components/combat/QTETypingBox';
import { useQTEStore } from '../../../src/stores/qteStore';
import { resetClientStores } from '../../utils/resetStores';
import type { QTERunState } from '../../../src/services/combat/QTELayer';

function seedMagicQTE(spell: string, baseMs = 5000, hits = 0): QTERunState {
  return {
    phase: 'pending',
    type: 'magic',
    payload: spell,
    hits,
    total: spell.length,
    startedAt: 0,
    baseMs,
  };
}

beforeEach(() => {
  resetClientStores();
});

afterEach(() => {
  cleanup();
});

describe('QTETypingBox: 渲染路由', () => {
  it('idle 状态不渲染', () => {
    useQTEStore.setState({ state: { phase: 'idle', type: null, payload: null, hits: 0, total: 0, startedAt: 0, baseMs: 0 } });
    const { container } = render(<QTETypingBox />);
    expect(container.firstChild).toBeNull();
  });

  it('pending attack 状态不渲染 (QTETimingBar 负责)', () => {
    useQTEStore.setState({
      state: { phase: 'pending', type: 'attack', payload: 3, hits: 0, total: 3, startedAt: 0, baseMs: 0 },
      context: { playerId: 'p-1', targetId: 'e-1', spell: '' },
      resolver: null,
    });
    const { container } = render(<QTETypingBox />);
    expect(container.firstChild).toBeNull();
  });

  it('pending magic 状态渲染咒语字符 + 倒计时条', () => {
    useQTEStore.setState({
      state: seedMagicQTE('fireball'),
      context: { playerId: 'p-1', targetId: 'e-1', spell: 'fireball' },
      resolver: null,
    });
    render(<QTETypingBox />);
    const box = screen.getByTestId('qte-typing-box');
    expect(box).toBeInTheDocument();
    expect(box).toHaveAttribute('data-spell', 'fireball');
    expect(box).toHaveAttribute('data-total', '8');
    expect(screen.getByTestId('qte-typing-box-spell')).toBeInTheDocument();
    expect(screen.getByTestId('qte-typing-box-timer')).toBeInTheDocument();
    // 8 个字符位置 (fireball 是 8 字符)
    for (let i = 0; i < 8; i++) {
      expect(screen.getByTestId(`qte-spell-char-${i}`)).toBeInTheDocument();
    }
  });
});

describe('QTETypingBox: 字符输入', () => {
  it('键入正确字符 -> 标 emerald, hits 增加', () => {
    const typeCharSpy = vi.fn();
    useQTEStore.setState({
      state: seedMagicQTE('ab'),
      context: { playerId: 'p-1', targetId: 'e-1', spell: 'ab' },
      resolver: null,
      typeChar: typeCharSpy,
    });
    render(<QTETypingBox />);
    fireEvent.keyDown(window, { key: 'a' });
    const box = screen.getByTestId('qte-typing-box');
    expect(box).toHaveAttribute('data-typed', 'a');
    expect(typeCharSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('qte-spell-char-0')).toHaveAttribute('data-state', 'correct');
  });

  it('键入错误字符 -> 标 rose line-through, 不调 typeChar', () => {
    const typeCharSpy = vi.fn();
    useQTEStore.setState({
      state: seedMagicQTE('ab'),
      context: { playerId: 'p-1', targetId: 'e-1', spell: 'ab' },
      resolver: null,
      typeChar: typeCharSpy,
    });
    render(<QTETypingBox />);
    fireEvent.keyDown(window, { key: 'x' });
    const box = screen.getByTestId('qte-typing-box');
    expect(box).toHaveAttribute('data-typed', 'x');
    expect(typeCharSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('qte-spell-char-0')).toHaveAttribute('data-state', 'wrong');
  });

  it('Backspace 退格', () => {
    useQTEStore.setState({
      state: seedMagicQTE('ab'),
      context: { playerId: 'p-1', targetId: 'e-1', spell: 'ab' },
      resolver: null,
    });
    render(<QTETypingBox />);
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'b' });
    expect(screen.getByTestId('qte-typing-box')).toHaveAttribute('data-typed', 'ab');
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(screen.getByTestId('qte-typing-box')).toHaveAttribute('data-typed', 'a');
  });
});

describe('QTETypingBox: 完成 / 取消', () => {
  it('Enter 调 finish', () => {
    const finishSpy = vi.fn();
    useQTEStore.setState({
      state: seedMagicQTE('ab'),
      context: { playerId: 'p-1', targetId: 'e-1', spell: 'ab' },
      resolver: null,
      finish: finishSpy,
    });
    render(<QTETypingBox />);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(finishSpy).toHaveBeenCalledTimes(1);
  });

  it('点 submit 按钮也调 finish', () => {
    const finishSpy = vi.fn();
    useQTEStore.setState({
      state: seedMagicQTE('ab'),
      context: { playerId: 'p-1', targetId: 'e-1', spell: 'ab' },
      resolver: null,
      finish: finishSpy,
    });
    render(<QTETypingBox />);
    fireEvent.click(screen.getByTestId('qte-typing-box-submit'));
    expect(finishSpy).toHaveBeenCalledTimes(1);
  });

  it('ESC 调 cancel', () => {
    const cancelSpy = vi.fn();
    useQTEStore.setState({
      state: seedMagicQTE('ab'),
      context: { playerId: 'p-1', targetId: 'e-1', spell: 'ab' },
      resolver: null,
      cancel: cancelSpy,
    });
    render(<QTETypingBox />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });
});
