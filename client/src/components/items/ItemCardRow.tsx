/**
 * 物品行 (背包列表用) — 图标 + 品质色名称 + 数量 + 词条 preview
 *
 * 复用 QUALITY_COLORS / CATEGORY_ICONS 常量, 0 视觉变化版本.
 * 父组件负责 selected/click/hover 行为 (P2 useItemSelect/useItemHover 范围).
 */
import type { Item } from '../../types/item';
import { QUALITY_COLORS, CATEGORY_ICONS } from '../../types/item';

export interface ItemCardRowProps {
  item: Item;
  selected?: boolean;
  onClick?: () => void;
  onMouseEnter?: (e: React.MouseEvent<HTMLElement>) => void;
  onMouseLeave?: () => void;
}

export function ItemCardRow({
  item,
  selected = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: ItemCardRowProps) {
  const quality = item.quality || '普通';
  const category = item.category || 'consumable';
  const icon = CATEGORY_ICONS[category];
  const effects = item.effects || [];
  const previewEffects = effects.slice(0, 3);
  const moreCount = effects.length - 3;

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      data-testid="item-card-row"
      data-selected={selected}
      data-item-name={item.name}
      className={`w-full text-left p-2 rounded-lg transition-colors ${
        selected
          ? 'bg-indigo-900/30 border border-indigo-500/30'
          : 'bg-gray-800/30 border border-transparent hover:bg-gray-800/50'
      }`}
    >
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px]">{icon}</span>
          <span className={`text-xs ${QUALITY_COLORS[quality]}`}>{item.name}</span>
        </div>
        <span className="text-[10px] text-gray-500">×{item.quantity || 1}</span>
      </div>
      {item.description && (
        <div className="text-[10px] text-gray-600 mt-0.5 ml-5 truncate">{item.description}</div>
      )}
      {effects.length > 0 && (
        <div className="ml-5 mt-0.5 flex gap-1 flex-wrap">
          {previewEffects.map((e, j) => (
            <span
              key={j}
              className="text-[9px] bg-gray-700/50 text-gray-400 px-1.5 py-0.5 rounded"
            >
              {e.description}
            </span>
          ))}
          {moreCount > 0 && <span className="text-[9px] text-gray-500">+{moreCount}</span>}
        </div>
      )}
    </button>
  );
}
