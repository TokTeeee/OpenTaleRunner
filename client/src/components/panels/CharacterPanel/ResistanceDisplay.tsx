/**
 * v0.6.2 — 8 元素抗性显示组件
 *
 * 用法:
 * - <ResistanceDisplay resistances={character.elementalResistances} /> — 默认: 8 行都显示, 0 值也显示
 * - <ResistanceDisplay resistances={...} showZeros={false} /> — 隐藏 0 值 (用于战斗内紧凑显示)
 * - <ResistanceDisplay resistances={...} compact /> — 紧凑 grid 布局 (2 列)
 *
 * 颜色规则:
 * - value > 0: 抗性 — 蓝色调
 * - value < 0: 弱化 — 红色调
 * - value === 0: 中性 — 灰色
 *
 * 展示顺序: 火 → 冰 → 雷 → 风 → 土 → 奥术 → 神圣 → 暗影
 */
import type { ElementalResistances } from '../../../types/character';
import { ELEMENT_LABELS, ELEMENT_ICONS } from '../../../types/ability';

const ELEMENTS = ['fire', 'ice', 'lightning', 'wind', 'earth', 'arcane', 'holy', 'shadow'] as const;

/** 单个元素的颜色 class */
function valueColorClass(value: number): string {
  if (value > 0) return 'text-cyan-300';   // 抗性
  if (value < 0) return 'text-rose-300';   // 弱化
  return 'text-gray-600';                  // 中性
}

/** 单个元素 row */
function ResistRow({ element, value }: { element: typeof ELEMENTS[number]; value: number }) {
  const sign = value > 0 ? '+' : '';
  const display = `${sign}${value}`;
  const color = valueColorClass(value);
  const title = `${ELEMENT_LABELS[element]} 抗性 ${display}%`;
  return (
    <div
      data-testid={`resist-${element}`}
      data-element={element}
      data-value={value}
      title={title}
      className={`flex items-center gap-1 text-[10px] ${color}`}
    >
      <span className="w-4 text-center text-sm" aria-hidden>{ELEMENT_ICONS[element]}</span>
      <span className="text-gray-500 w-6">{ELEMENT_LABELS[element]}</span>
      <span className="ml-auto font-mono font-semibold">{display}%</span>
    </div>
  );
}

export interface ResistanceDisplayProps {
  /** 抗性数据 */
  resistances: ElementalResistances;
  /** 是否显示 0 值元素 (默认 true — 角色面板需要给玩家"无抗性"的反馈) */
  showZeros?: boolean;
  /** 紧凑模式 — 2 列 grid (用于战斗内或空间受限场景) */
  compact?: boolean;
}

export function ResistanceDisplay({ resistances, showZeros = true, compact = false }: ResistanceDisplayProps) {
  const rows = ELEMENTS.map((el) => ({
    element: el,
    value: resistances[el] ?? 0,
  }));

  // compact: 2 列 grid
  if (compact) {
    return (
      <div
        data-testid="resistance-display"
        data-compact="true"
        className="grid grid-cols-2 gap-x-2 gap-y-0.5"
      >
        {rows.map(({ element, value }) =>
          showZeros || value !== 0 ? (
            <ResistRow key={element} element={element} value={value} />
          ) : null
        )}
      </div>
    );
  }

  // 默认: 1 列 (角色面板用, 每行清晰)
  return (
    <div data-testid="resistance-display" className="space-y-0.5">
      {rows.map(({ element, value }) =>
        showZeros || value !== 0 ? (
          <ResistRow key={element} element={element} value={value} />
        ) : null
      )}
    </div>
  );
}
