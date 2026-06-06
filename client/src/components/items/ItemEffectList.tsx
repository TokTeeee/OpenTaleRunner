import type { ItemEffect } from '../../types/item';

export type EffectListMode = 'grouped' | 'flat' | 'diff';

export interface ItemEffectListProps {
  effects?: ItemEffect[];
  added?: ItemEffect[];
  removed?: ItemEffect[];
  mode: EffectListMode;
  maxItems?: number;
  emptyMessage?: string;
}

/**
 * 词条列表渲染 (3 种 mode):
 * - grouped: 拆 attribute_mod 展开为 STR/DEX 等 + 其他, 两个分组 (ItemDetailPanel 用)
 * - flat: 简单列出 description, 单色 (通用)
 * - diff: 绿显 added + 灰划 removed (ItemCompareTooltip 用)
 */
export function ItemEffectList({
  effects,
  added,
  removed,
  mode,
  maxItems,
  emptyMessage,
}: ItemEffectListProps) {
  if (mode === 'grouped') {
    return <GroupedEffects effects={effects ?? []} />;
  }
  if (mode === 'flat') {
    return <FlatEffects effects={effects ?? []} maxItems={maxItems} emptyMessage={emptyMessage} />;
  }
  // mode === 'diff'
  return <DiffEffects added={added ?? []} removed={removed ?? []} />;
}

function GroupedEffects({ effects }: { effects: ItemEffect[] }) {
  const attributeMods = effects.filter((e) => e.type === 'attribute_mod');
  const otherEffects = effects.filter((e) => e.type !== 'attribute_mod');
  return (
    <>
      {attributeMods.length > 0 && (
        <div
          data-testid="item-effect-grouped-attribute"
          className="rounded-lg bg-indigo-500/[0.06] border border-indigo-500/15 p-2 space-y-1"
        >
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
                    data-testid="item-effect-attribute-row"
                    data-attr={target}
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
        <div
          data-testid="item-effect-grouped-other"
          className="rounded-lg bg-amber-500/[0.04] border border-amber-500/10 p-2 space-y-1"
        >
          <div className="text-[10px] text-amber-300 uppercase tracking-wider">📜 其他词条</div>
          {otherEffects.map((e, i) => (
            <div key={i} data-testid="item-effect-other-row" className="text-[11px] text-gray-300">
              {e.description}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function FlatEffects({
  effects,
  maxItems,
  emptyMessage,
}: {
  effects: ItemEffect[];
  maxItems?: number;
  emptyMessage?: string;
}) {
  if (effects.length === 0) {
    return emptyMessage ? (
      <div data-testid="item-effect-empty" className="text-[11px] text-gray-500">
        {emptyMessage}
      </div>
    ) : null;
  }
  const sliced = maxItems !== undefined ? effects.slice(0, maxItems) : effects;
  const moreCount = effects.length - sliced.length;
  return (
    <div data-testid="item-effect-flat" className="space-y-1">
      {sliced.map((e, i) => (
        <div key={i} data-testid="item-effect-flat-row" className="text-[11px] text-gray-300">
          {e.description}
        </div>
      ))}
      {moreCount > 0 && (
        <div data-testid="item-effect-flat-more" className="text-[10px] text-gray-500">
          +{moreCount}
        </div>
      )}
    </div>
  );
}

function DiffEffects({ added, removed }: { added: ItemEffect[]; removed: ItemEffect[] }) {
  if (added.length === 0 && removed.length === 0) return null;
  return (
    <div data-testid="item-effect-diff" className="space-y-0.5">
      {added.map((e, i) => (
        <div
          key={`added-${i}`}
          data-testid="item-effect-diff-added"
          data-effect-id={e.id}
          className="text-[11px] text-emerald-500"
        >
          + 新增: {e.description}
        </div>
      ))}
      {removed.map((e, i) => (
        <div
          key={`removed-${i}`}
          data-testid="item-effect-diff-removed"
          data-effect-id={e.id}
          className="text-[11px] text-gray-500 line-through"
        >
          - 移除: {e.description}
        </div>
      ))}
    </div>
  );
}
