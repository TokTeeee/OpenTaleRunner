// client/tests/components/combat/SkillPickerPopover.test.tsx
// v0.6.2 Task 15: SkillPickerPopover 3-tab portal (魔法/祷告/战技)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SkillPickerPopover } from '../../../src/components/combat/SkillPickerPopover';
import { useCharacterStore } from '../../../src/stores/characterStore';
import { ZERO_RESISTANCES } from '../../../src/types/character';

const baseCharacter = (overrides = {}) => ({
  characterId: 'c1',
  name: 'Hero',
  classId: 'mage' as const,
  level: 5,
  attributes: { STR: 10, DEX: 10, CON: 10, INT: 16, WIS: 14, CHA: 10 },
  elementalResistances: { ...ZERO_RESISTANCES },
  learnedAbilities: [
    { abilityId: 'spell_fire_bolt', school: 'magic' as const, learnedAt: 0 },
    { abilityId: 'spell_ice_lance', school: 'magic' as const, learnedAt: 0 },
    { abilityId: 'prayer_holy_heal', school: 'prayer' as const, learnedAt: 0 },
    { abilityId: 'art_warrior_smash', school: 'battle_art' as const, learnedAt: 0 },
  ],
  defaultLearnedAbilities: [],
  ...overrides,
});

beforeEach(() => {
  useCharacterStore.setState({ character: baseCharacter() } as any);
});

describe('SkillPickerPopover', () => {
  it('渲染 3 个 tab (魔法/祷告/战技)', () => {
    render(<SkillPickerPopover onSelect={() => {}} onClose={() => {}} />);
    expect(screen.getByTestId('tab-magic')).toBeInTheDocument();
    expect(screen.getByTestId('tab-prayer')).toBeInTheDocument();
    expect(screen.getByTestId('tab-battle_art')).toBeInTheDocument();
  });

  it('默认显示 magic tab 的能力', () => {
    render(<SkillPickerPopover onSelect={() => {}} onClose={() => {}} />);
    expect(screen.getByTestId('ability-card-spell_fire_bolt')).toBeInTheDocument();
    expect(screen.getByTestId('ability-card-spell_ice_lance')).toBeInTheDocument();
  });

  it('切到 prayer tab 显示祷告', () => {
    render(<SkillPickerPopover onSelect={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('tab-prayer'));
    expect(screen.getByTestId('ability-card-prayer_holy_heal')).toBeInTheDocument();
    expect(screen.queryByTestId('ability-card-spell_fire_bolt')).toBeNull();
  });

  it('切到 battle_art tab 显示战技', () => {
    render(<SkillPickerPopover onSelect={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('tab-battle_art'));
    expect(screen.getByTestId('ability-card-art_warrior_smash')).toBeInTheDocument();
  });

  it('点 ability card 触发 onSelect(id)', () => {
    const onSelect = vi.fn();
    render(<SkillPickerPopover onSelect={onSelect} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('ability-card-spell_fire_bolt'));
    expect(onSelect).toHaveBeenCalledWith('spell_fire_bolt');
  });

  it('点 backdrop 触发 onClose', () => {
    const onClose = vi.fn();
    render(<SkillPickerPopover onSelect={() => {}} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('skill-picker-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  it('未学习的能力不出现在列表', () => {
    useCharacterStore.setState({ character: baseCharacter({
      learnedAbilities: [{ abilityId: 'spell_fire_bolt', school: 'magic' as const, learnedAt: 0 }],
    }) } as any);
    render(<SkillPickerPopover onSelect={() => {}} onClose={() => {}} />);
    expect(screen.getByTestId('ability-card-spell_fire_bolt')).toBeInTheDocument();
    expect(screen.queryByTestId('ability-card-spell_ice_lance')).toBeNull();
  });
});
