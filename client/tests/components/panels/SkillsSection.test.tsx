/**
 * SkillsSection 单元测试 — 3 种 chip 分类
 * v0.5.14
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { SkillsSection } from '../../../src/components/panels/CharacterPanel/SkillsSection';
import { useCharacterStore } from '../../../src/stores/characterStore';

function makeChar(overrides: Partial<any> = {}) {
  return {
    name: 'A',
    race: '人类',
    classId: null,
    classSkills: [],
    skills: [],
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: 10,
    maxHp: 10,
    level: 1,
    inventory: { equipped: { weapon: null, armor: null }, currency: { gold: 0, silver: 0, copper: 0 }, backpack: [] },
    conditions: [],
    ...overrides,
  };
}

beforeEach(() => {
  useCharacterStore.setState({ character: null } as any);
});
afterEach(() => cleanup());

describe('SkillsSection', () => {
  it('classId 为空时, 只显示 origin chip (出身技能)', () => {
    useCharacterStore.setState({
      character: makeChar({
        skills: [{ id: 's1', name: '基础战斗', level: 1 }],
      }) as any,
    });
    render(<SkillsSection />);
    expect(screen.getByTestId('skill-chip-origin-s1')).toBeTruthy();
    expect(screen.queryByTestId(/skill-chip-classlearned-/)).toBeNull();
    expect(screen.queryByTestId(/skill-chip-classavailable-/)).toBeNull();
  });

  it('classId=warrior + classSkills=[warrior_t1_1], 显示 1 绿 chip', () => {
    useCharacterStore.setState({
      character: makeChar({
        classId: 'warrior',
        classSkills: [{ classId: 'warrior', nodeId: 'warrior_t1_1', unlockedAt: 1 }],
      }) as any,
    });
    render(<SkillsSection />);
    expect(screen.getByTestId('skill-chip-classlearned-warrior_t1_1')).toBeTruthy();
  });

  it('classId=warrior + 0 已学, 显示 12 黄 chip (T1-T4 全 12 节点都可学, ClassNode 无 unlockedByLevel)', () => {
    useCharacterStore.setState({
      character: makeChar({
        classId: 'warrior',
        classSkills: [],
        level: 1,
      }) as any,
    });
    render(<SkillsSection />);
    const available = screen.getAllByTestId(/^skill-chip-classavailable-/);
    expect(available.length).toBe(12);  // 所有 12 节点都可学
  });

  it('classId=warrior + 1 已学, 显示 11 黄 chip (12-1)', () => {
    useCharacterStore.setState({
      character: makeChar({
        classId: 'warrior',
        classSkills: [{ classId: 'warrior', nodeId: 'warrior_t1_1', unlockedAt: 1 }],
        level: 1,
      }) as any,
    });
    render(<SkillsSection />);
    const available = screen.getAllByTestId(/^skill-chip-classavailable-/);
    expect(available.length).toBe(11);  // 12 - 1 learned
  });

  it('chip 文本: origin 显示 name Lv.X, class 显示 T{tier}·{slot} name', () => {
    useCharacterStore.setState({
      character: makeChar({
        skills: [{ id: 's1', name: '野外生存', level: 2 }],
        classId: 'warrior',
        classSkills: [{ classId: 'warrior', nodeId: 'warrior_t1_1', unlockedAt: 1 }],
      }) as any,
    });
    render(<SkillsSection />);
    const originChip = screen.getByTestId('skill-chip-origin-s1');
    expect(originChip.textContent).toContain('野外生存');
    expect(originChip.textContent).toContain('Lv.2');
    const classChip = screen.getByTestId('skill-chip-classlearned-warrior_t1_1');
    expect(classChip.textContent).toContain('T1');
  });

  it('无任何技能时, 整个 section 不渲染 (返回 null)', () => {
    useCharacterStore.setState({
      character: makeChar({ skills: [], classId: null }) as any,
    });
    const { container } = render(<SkillsSection />);
    expect(container.firstChild).toBeNull();
  });
});
