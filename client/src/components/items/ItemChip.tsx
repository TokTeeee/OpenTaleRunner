/**
 * 物品极简 chip — 装备槽 (variant="equipped") + CharacterPanel (variant="minimal")
 *
 * 复用 QUALITY_COLORS / CATEGORY_ICONS 常量. 父组件负责 click/disabled 行为.
 */
import type { Item } from '../../types/item';
import { QUALITY_COLORS } from '../../types/item';

export interface ItemChipProps {
  item: Item | null;
  variant?: 'equipped' | 'minimal';
  slot?: 'weapon' | 'armor' | 'accessory';
  slotLabel?: string;
  selected?: boolean;
  onClick?: () => void;
}

const DEFAULT_SLOT_LABELS = {
  weapon: '⚔武器',
  armor: '🛡防具',
  accessory: '💍饰品',
} as const;

export function ItemChip({
  item,
  variant = 'equipped',
  slot,
  slotLabel,
  selected = false,
  onClick,
}: ItemChipProps) {
  if (variant === 'equipped') {
    const label = slotLabel ?? (slot ? DEFAULT_SLOT_LABELS[slot] : '');
    const baseClass = item
      ? 'bg-gray-800/60 border-gray-700/50 hover:bg-gray-800 hover:border-amber-500/30 cursor-pointer'
      : 'bg-gray-800/30 border-gray-700/30 opacity-50 cursor-not-allowed';
    const stateClass = selected ? 'bg-amber-900/30 border-amber-500/40' : baseClass;
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!item}
        data-testid="item-chip-equipped"
        data-slot={slot}
        data-has-item={!!item}
        data-selected={selected}
        className={`text-left rounded-lg p-2 border transition-all w-full ${stateClass}`}
      >
        <div className="text-gray-500">{label}</div>
        <div
          className={`truncate mt-0.5 ${
            item ? QUALITY_COLORS[item.quality || '普通'] : 'text-gray-600'
          }`}
        >
          {item?.name || '无'}
        </div>
        {item && <div className="text-[9px] text-amber-400/60 mt-0.5">点击查看/卸下</div>}
      </button>
    );
  }

  // variant === 'minimal' (CharacterPanel chip 风格: 小尺寸 + bg + border + 数量)
  const baseChipClass = 'text-[9px] px-1.5 py-0.5 rounded-md bg-white/[.03] border border-white/[.05]';
  const titleText = item
    ? item.description || item.effects?.map((e) => e.description).join('、') || ''
    : '';
  return (
    <span
      data-testid="item-chip-minimal"
      data-item-name={item?.name}
      title={titleText}
      className={`${baseChipClass} text-gray-500`}
    >
      {item?.name}
      {item && item.quantity && item.quantity > 1 ? ` x${item.quantity}` : ''}
    </span>
  );
}
