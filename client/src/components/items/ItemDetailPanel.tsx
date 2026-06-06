/**
 * 物品详情面板 — 选中后展示完整信息
 * (标题/品质/描述/属性加成/其他词条/历史)
 *
 * 复用 QUALITY_COLORS / CATEGORY_ICONS 常量. 历史 details 折叠保留.
 * 注: T4 ItemEffectList 抽出来后, 本组件的 attribute_mods/otherEffects 段会改用 <ItemEffectList mode="grouped">.
 */
import type { Item } from '../../types/item';
import { QUALITY_COLORS, CATEGORY_ICONS } from '../../types/item';

export interface ItemDetailPanelProps {
  item: Item;
  onClose?: () => void;
}

export function ItemDetailPanel({ item, onClose }: ItemDetailPanelProps) {
  const quality = item.quality || '普通';
  const category = item.category || 'consumable';
  const effects = item.effects || [];
  const attributeMods = effects.filter((e) => e.type === 'attribute_mod');
  const otherEffects = effects.filter((e) => e.type !== 'attribute_mod');

  return (
    <div
      data-testid="item-detail-panel"
      data-item-name={item.name}
      className="border-t border-gray-700 p-3 space-y-2 max-h-[40vh] overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className={`text-sm font-bold ${QUALITY_COLORS[quality]}`}>
            {CATEGORY_ICONS[category]} {item.name}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            {item.category || '物品'} · {quality}
            {item.quantity ? ` · ×${item.quantity}` : ''}
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-sm shrink-0"
            data-testid="item-detail-close"
          >
            ✕
          </button>
        )}
      </div>
      {item.description && (
        <div className="text-[11px] text-gray-400 leading-relaxed">{item.description}</div>
      )}
      {attributeMods.length > 0 && (
        <div className="rounded-lg bg-indigo-500/[0.06] border border-indigo-500/15 p-2 space-y-1">
          <div className="text-[10px] text-indigo-300 uppercase tracking-wider">⚡ 属性加成</div>
          {attributeMods.flatMap((e) => {
            if (typeof e.value !== 'object' || e.value == null) return [];
            const mods = e.value as Record<string, unknown>;
            return Object.entries(mods)
              .filter(([, v]) => typeof v === 'number')
              .map(([target, v], i) => {
                const value = v as number;
                const positive = value >= 0;
                return (
                  <div
                    key={`${e.id}-${target}-${i}`}
                    className="flex items-center justify-between text-[11px]"
                  >
                    <span className="text-gray-400">{target}</span>
                    <span
                      className={`font-mono font-bold ${positive ? 'text-emerald-400' : 'text-rose-400'}`}
                    >
                      {positive ? '+' : ''}
                      {value}
                    </span>
                  </div>
                );
              });
          })}
        </div>
      )}
      {otherEffects.length > 0 && (
        <div className="rounded-lg bg-amber-500/[0.04] border border-amber-500/10 p-2 space-y-1">
          <div className="text-[10px] text-amber-300 uppercase tracking-wider">📜 其他词条</div>
          {otherEffects.map((e, i) => (
            <div key={i} className="text-[11px] text-gray-300">
              {e.description}
            </div>
          ))}
        </div>
      )}
      {item.history && item.history.length > 0 && (
        <details className="text-[10px] text-gray-500">
          <summary className="cursor-pointer hover:text-gray-300">
            📜 物品历史 ({item.history.length})
          </summary>
          <ul className="mt-1 space-y-0.5 pl-3">
            {item.history.map((h, i) => (
              <li key={i}>
                • [{h.event}] {h.description}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
