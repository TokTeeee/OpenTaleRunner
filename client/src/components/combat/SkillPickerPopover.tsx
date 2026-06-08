/**
 * v0.6.2 战斗系统 — SkillPickerPopover
 *
 * 玩家点 "技能" 按钮后弹出的 portal 弹层:
 * - 3 tab: 魔法 / 祷告 / 战技 (按 AbilitySchool 切分)
 * - 列出玩家已学习的 ability (按 tab 过滤)
 * - 点 ability 卡片 -> onSelect(abilityId)
 * - 点 backdrop / X -> onClose
 * - createPortal 逃出父级 stacking context (跟 ClassSkillTreeModal 一致)
 */
import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useCharacterStore } from '../../stores/characterStore';
import { getLearnedAbilities } from '../../data/abilities';
import {
  type Ability,
  type AbilitySchool,
  SCHOOL_LABELS,
  SCHOOL_ICONS,
  ELEMENT_LABELS,
  ELEMENT_ICONS,
} from '../../types/ability';

interface SkillPickerPopoverProps {
  onSelect: (abilityId: string) => void;
  onClose: () => void;
}

const TABS: AbilitySchool[] = ['magic', 'prayer', 'battle_art'];

export function SkillPickerPopover({ onSelect, onClose }: SkillPickerPopoverProps) {
  const character = useCharacterStore((s) => s.character);
  const learned = useMemo<Ability[]>(
    () => (character ? getLearnedAbilities(character) : []),
    [character],
  );
  const [tab, setTab] = useState<AbilitySchool>('magic');

  const tabAbilities = useMemo(
    () => learned.filter(a => a.school === tab),
    [learned, tab],
  );

  return createPortal(
    <div
      data-testid="skill-picker-backdrop"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <div
        data-testid="skill-picker-popover"
        onClick={(e) => e.stopPropagation()}
        className="bg-ink-900 border border-gold-500/30 rounded-2xl
                   w-[480px] max-h-[80vh] flex flex-col
                   shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
      >
        {/* header */}
        <div className="flex items-center justify-between p-4 border-b border-ink-700/60">
          <h2 className="font-display text-lg text-gold-300">✨ 技能选择</h2>
          <button
            data-testid="skill-picker-close"
            onClick={onClose}
            className="text-ink-500 hover:text-ink-200 text-lg"
          >✕</button>
        </div>

        {/* tabs */}
        <div className="flex border-b border-ink-700/60">
          {TABS.map((s) => (
            <button
              key={s}
              data-testid={`tab-${s}`}
              data-active={tab === s}
              onClick={() => setTab(s)}
              className={`flex-1 py-2 text-sm font-display tracking-wider
                ${tab === s
                  ? 'text-gold-300 border-b-2 border-gold-400'
                  : 'text-ink-400 hover:text-ink-200'}`}
            >
              {SCHOOL_ICONS[s]} {SCHOOL_LABELS[s]}
            </button>
          ))}
        </div>

        {/* list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {tabAbilities.length === 0 && (
            <div className="text-center text-ink-500 py-8 text-sm">
              未学习任何 {SCHOOL_LABELS[tab]}
            </div>
          )}
          {tabAbilities.map((a) => (
            <button
              key={a.id}
              data-testid={`ability-card-${a.id}`}
              onClick={() => onSelect(a.id)}
              className="w-full text-left p-3 rounded-lg
                         bg-ink-800/60 hover:bg-ink-800
                         border border-ink-700/40 hover:border-gold-400/40
                         transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">
                  {a.element ? ELEMENT_ICONS[a.element] : '⚔️'}
                </span>
                <span className="font-display text-gold-200">{a.name}</span>
                {a.element && (
                  <span className="text-xs text-ink-400">
                    ({ELEMENT_LABELS[a.element]})
                  </span>
                )}
                <span className="ml-auto text-xs font-mono text-amber-400/80">
                  {a.cost.ap}AP{a.cost.mp > 0 ? ` / ${a.cost.mp}MP` : ''}
                </span>
              </div>
              <div className="text-xs text-ink-300">{a.description.shortEffect}</div>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
