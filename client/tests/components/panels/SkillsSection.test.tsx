/**
 * SkillsSection 单元测试 — 2 种 chip 分类 (origin + classlearned)
 * v0.5.14 (v0.5.14-fix: 移除 classavailable 黄色 chip)
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
    unspentAttributePoints: 0,
    unspentSkillPoints: 0,
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

  it('v0.5.14-fix: classId=warrior + 0 已学, 不显示黄 chip (available 全部移除)', () => {
    useCharacterStore.setState({
      character: makeChar({
        classId: 'warrior',
        classSkills: [],
        level: 1,
      }) as any,
    });
    render(<SkillsSection />);
    // 可学未学节点不再显示
    expect(screen.queryByTestId(/^skill-chip-classavailable-/)).toBeNull();
  });

  it('v0.5.14-fix: classId=warrior + 1 已学, 只显示 1 绿 chip, 无黄 chip', () => {
    useCharacterStore.setState({
      character: makeChar({
        classId: 'warrior',
        classSkills: [{ classId: 'warrior', nodeId: 'warrior_t1_1', unlockedAt: 1 }],
        level: 1,
      }) as any,
    });
    render(<SkillsSection />);
    const green = screen.getAllByTestId(/^skill-chip-classlearned-/);
    expect(green.length).toBe(1);
    expect(screen.queryByTestId(/^skill-chip-classavailable-/)).toBeNull();
  });

  it('chip 文本: origin 显示 name Lv.X, classlearned 显示 T{tier}·{slot} name', () => {
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

  it('v0.5.14-fix: origin 蓝 + classlearned 绿 同时显示, 颜色 class 不同', () => {
    useCharacterStore.setState({
      character: makeChar({
        skills: [{ id: 's1', name: '野外生存', level: 2 }],
        classId: 'warrior',
        classSkills: [{ classId: 'warrior', nodeId: 'warrior_t1_1', unlockedAt: 1 }],
      }) as any,
    });
    render(<SkillsSection />);
    const originChip = screen.getByTestId('skill-chip-origin-s1');
    const classChip = screen.getByTestId('skill-chip-classlearned-warrior_t1_1');
    expect(originChip.className).toContain('indigo');
    expect(classChip.className).toContain('emerald');
  });

  it('无任何技能时, 整个 section 不渲染 (返回 null)', () => {
    useCharacterStore.setState({
      character: makeChar({ skills: [], classId: null }) as any,
    });
    const { container } = render(<SkillsSection />);
    expect(container.firstChild).toBeNull();
  });
});
