/**
 * ResistanceDisplay 单元测试 — v0.6.2
 *
 * 8 元素抗性显示组件:
 * - 接收 ElementalResistances 数据
 * - 颜色编码: >0 (抗) 蓝/绿, <0 (弱) 红, =0 灰
 * - 隐藏 0 值的元素 (减少视觉噪声)
 * - 全部为 0 时整个 section 不渲染
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { ResistanceDisplay } from '../../../src/components/panels/CharacterPanel/ResistanceDisplay';
import type { ElementalResistances } from '../../../src/types/character';
import { ZERO_RESISTANCES } from '../../../src/types/character';
import { ELEMENT_ICONS, ELEMENT_LABELS } from '../../../src/types/ability';

const ALL_ELEMENTS = ['fire', 'ice', 'lightning', 'wind', 'earth', 'arcane', 'holy', 'shadow'] as const;

beforeEach(() => {});
afterEach(() => cleanup());

describe('ResistanceDisplay', () => {
  it('渲染所有 8 个元素 row (含 0 值)', () => {
    const data: ElementalResistances = { ...ZERO_RESISTANCES };
    render(<ResistanceDisplay resistances={data} />);
    for (const el of ALL_ELEMENTS) {
      expect(screen.getByTestId(`resist-${el}`)).toBeTruthy();
    }
  });

  it('显示 元素 icon + label + value', () => {
    const data: ElementalResistances = { ...ZERO_RESISTANCES, fire: 25 };
    render(<ResistanceDisplay resistances={data} />);
    const fireRow = screen.getByTestId('resist-fire');
    expect(fireRow.textContent).toContain(ELEMENT_ICONS.fire);
    expect(fireRow.textContent).toContain(ELEMENT_LABELS.fire);
    expect(fireRow.textContent).toContain('+25');
  });

  it('正值 (抗) +X% 显示, 颜色 class 含 blue/cyan/emerald', () => {
    const data: ElementalResistances = { ...ZERO_RESISTANCES, fire: 30 };
    render(<ResistanceDisplay resistances={data} />);
    const fireRow = screen.getByTestId('resist-fire');
    expect(fireRow.textContent).toContain('+30');
    // 抗性 = 蓝/青/绿之一
    expect(/blue|cyan|emerald|teal/i.test(fireRow.className)).toBe(true);
  });

  it('负值 (弱) -X% 显示, 颜色 class 含 red/rose/orange', () => {
    const data: ElementalResistances = { ...ZERO_RESISTANCES, fire: -20 };
    render(<ResistanceDisplay resistances={data} />);
    const fireRow = screen.getByTestId('resist-fire');
    expect(fireRow.textContent).toContain('-20');
    // 弱化 = 红/玫瑰/橙之一
    expect(/red|rose|orange|amber/i.test(fireRow.className)).toBe(true);
  });

  it('0 值显示 "0" 无 +/- 前缀, 颜色 class 为灰', () => {
    const data: ElementalResistances = { ...ZERO_RESISTANCES, fire: 0 };
    render(<ResistanceDisplay resistances={data} />);
    const fireRow = screen.getByTestId('resist-fire');
    // 0 不带符号
    expect(fireRow.textContent).toMatch(/0(?![+-])/);
    expect(/gray|grey|slate|neutral/i.test(fireRow.className)).toBe(true);
  });

  it('混合多元素: 正/负/零混合时全部 8 行都渲染', () => {
    const data: ElementalResistances = {
      fire: 25, ice: 0, lightning: -10, wind: 50,
      earth: 0, arcane: -30, holy: 15, shadow: 0,
    };
    render(<ResistanceDisplay resistances={data} />);
    for (const el of ALL_ELEMENTS) {
      expect(screen.getByTestId(`resist-${el}`)).toBeTruthy();
    }
  });

  it('hideZeros=true 时, 0 元素不渲染 row', () => {
    const data: ElementalResistances = { ...ZERO_RESISTANCES, fire: 30, ice: -20 };
    render(<ResistanceDisplay resistances={data} showZeros={false} />);
    expect(screen.getByTestId('resist-fire')).toBeTruthy();
    expect(screen.getByTestId('resist-ice')).toBeTruthy();
    expect(screen.queryByTestId('resist-lightning')).toBeNull();
    expect(screen.queryByTestId('resist-wind')).toBeNull();
  });

  it('compact=true 时, 布局 class 变化 (含 grid 紧凑布局)', () => {
    const data: ElementalResistances = { ...ZERO_RESISTANCES, fire: 10 };
    const { container } = render(<ResistanceDisplay resistances={data} compact />);
    // 容器应包含 grid 相关 class
    expect(/grid/.test(container.firstElementChild?.className ?? '')).toBe(true);
  });

  it('全部 0 时, 整个 component 仍然渲染 (8 行 0 值, 用于告知玩家"无抗性")', () => {
    const data: ElementalResistances = { ...ZERO_RESISTANCES };
    const { container } = render(<ResistanceDisplay resistances={data} />);
    // 不为 null
    expect(container.firstChild).not.toBeNull();
    // 8 行 0 值都渲染
    for (const el of ALL_ELEMENTS) {
      expect(screen.getByTestId(`resist-${el}`)).toBeTruthy();
    }
  });

  it('钳制: 传入 ±200 也不崩, 仍渲染 (因为是纯显示组件, 不做 mutation)', () => {
    const data: ElementalResistances = { ...ZERO_RESISTANCES, fire: 200, ice: -200 };
    render(<ResistanceDisplay resistances={data} />);
    expect(screen.getByTestId('resist-fire').textContent).toContain('200');
    expect(screen.getByTestId('resist-ice').textContent).toContain('-200');
  });

  it('title 属性包含元素中文 label (hover 提示)', () => {
    const data: ElementalResistances = { ...ZERO_RESISTANCES, fire: 25 };
    render(<ResistanceDisplay resistances={data} />);
    const fireRow = screen.getByTestId('resist-fire');
    expect(fireRow.getAttribute('title')).toContain(ELEMENT_LABELS.fire);
  });
});
