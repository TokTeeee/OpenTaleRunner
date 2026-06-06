/**
 * 装备对比浮窗 — side-by-side 渲染当前装备 vs hover 物品
 *
 * controlled 组件: candidate 不为空即显示, 父组件负责置 null 关闭.
 * 详细见 spec: docs/superpowers/specs/2026-06-04-item-compare-ui-design.md §3.3
 */
import { useEffect, useState } from 'react';
import type { Item } from '../../types/item';
import { QUALITY_COLORS, CATEGORY_ICONS } from '../../types/item';
import {
  computeDeltas,
  summarizeEffects,
} from '../../data/itemComparison';
import { gray, bg, accent, radius, alpha, shadow } from '../../styles/tokens';
import { ItemEffectList } from '../items/ItemEffectList';

export interface ItemCompareTooltipProps {
  current: Item | null;
  candidate: Item;
  anchor: { x: number; y: number };
  containerBounds: DOMRect;
}

const TOOLTIP_WIDTH = 360;
const TOOLTIP_HEIGHT_ESTIMATE = 480;
const GAP = 8;

export function ItemCompareTooltip({
  current,
  candidate,
  anchor,
  containerBounds,
}: ItemCompareTooltipProps) {
  const [position, setPosition] = useState<'right' | 'left' | 'top'>('right');

  // 碰撞检测: 默认右侧, 超右改左侧, 超下改上
  // 这是布局计算副作用 (同步 React 状态到外部布局), setState 在 effect 中是合理模式
  useEffect(() => {
    const overflowRight = anchor.x + TOOLTIP_WIDTH + GAP > containerBounds.right;
    const overflowBottom = anchor.y + TOOLTIP_HEIGHT_ESTIMATE + GAP > containerBounds.bottom;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 碰撞检测布局计算, 同步到 position state
    if (overflowRight) setPosition('left');
    else if (overflowBottom) setPosition('top');
    else setPosition('right');
  }, [anchor.x, anchor.y, containerBounds.right, containerBounds.bottom]);

  const style: React.CSSProperties = (() => {
    if (position === 'right') return { left: anchor.x + GAP, top: anchor.y };
    if (position === 'left') return { right: containerBounds.right - anchor.x + GAP, top: anchor.y };
    return { left: anchor.x, bottom: containerBounds.bottom - anchor.y + GAP };
  })();

  const empty = { name: '', effects: [] };
  const safeCurrent = current ?? empty;
  const deltas = computeDeltas(safeCurrent, candidate);
  const effects = summarizeEffects(safeCurrent, candidate);
  const candidateQuality = candidate.quality || '普通';
  const candidateIcon = CATEGORY_ICONS[candidate.category || 'consumable'];

  return (
    <div
      data-testid="item-compare-tooltip"
      data-position={position}
      style={{
        ...style,
        position: 'fixed',
        zIndex: 60,
        width: TOOLTIP_WIDTH,
        maxHeight: '60vh',
        overflowY: 'auto',
        background: bg.slate800,
        border: `2px solid ${accent.indigo[500]}`,
        borderRadius: radius.md,
        padding: 12,
        color: gray[200],
        fontSize: 12,
        boxShadow: shadow.popover,
      }}
    >
      {/* Header: 标题 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: gray[400] }}>对比</span>
        {current && <span style={{ color: gray[400] }}>· {current.name}</span>}
        {current && <span style={{ color: gray[400] }}>→</span>}
        <span style={{ color: QUALITY_COLORS[candidateQuality] }} data-testid="item-compare-candidate-name">
          {candidateIcon} {candidate.name}
        </span>
      </div>

      {/* 描述 */}
      {candidate.description && (
        <div style={{ fontSize: 11, color: gray[400], fontStyle: 'italic', marginBottom: 8 }}>
          {candidate.description}
        </div>
      )}

      {/* 属性对比 (仅 current 非空) */}
      {current && (
        <div
          data-testid="item-compare-deltas"
          style={{
            background: alpha.indigo500A08,
            border: `1px solid ${alpha.indigo500A20}`,
            borderRadius: radius.sm,
            padding: 6,
            marginBottom: 8,
          }}
        >
          <div style={{ fontSize: 10, color: accent.indigo[300], textTransform: 'uppercase', letterSpacing: 0.5 }}>
            ⚡ 属性对比
          </div>
          {deltas.map((d) => (
            <div
              key={d.attr}
              data-testid={`item-compare-delta-${d.attr}`}
              style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4 }}
            >
              <span style={{ color: gray[400] }}>{d.attr}</span>
              <span>
                <span style={{ color: gray[500], fontFamily: 'monospace' }}>
                  {d.currentValue >= 0 ? `+${d.currentValue}` : d.currentValue}
                </span>
                <span style={{ color: gray[400], margin: '0 4px' }}>→</span>
                <span
                  data-delta={d.delta > 0 ? 'positive' : d.delta < 0 ? 'negative' : 'equal'}
                  style={{
                    color: d.delta > 0 ? accent.emerald[500] : d.delta < 0 ? accent.rose[400] : gray[400],
                    fontFamily: 'monospace',
                    fontWeight: 'bold',
                  }}
                >
                  {d.candidateValue >= 0 ? `+${d.candidateValue}` : d.candidateValue}
                  {d.delta !== 0 && (d.delta > 0 ? ' ↑' : ' ↓')}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 当前装备名 (测试可达, 隐藏显示) */}
      {current && (
        <span data-testid="item-compare-current-name" style={{ display: 'none' }}>
          {current.name}
        </span>
      )}

      {/* 词条对比 (仅 current 非空且有 added/removed) */}
      {current && (effects.added.length > 0 || effects.removed.length > 0) && (
        <div
          style={{
            background: alpha.amber500A06,
            border: `1px solid ${alpha.amber500A15}`,
            borderRadius: radius.sm,
            padding: 6,
            marginBottom: 8,
          }}
        >
          <div style={{ fontSize: 10, color: accent.amber[300], textTransform: 'uppercase', letterSpacing: 0.5 }}>
            📜 词条
          </div>
          <ItemEffectList added={effects.added} removed={effects.removed} mode="diff" />
        </div>
      )}

      {/* 耐久 */}
      {candidate.durability !== undefined && candidate.maxDurability !== undefined && (
        <div style={{ marginTop: 8, fontSize: 10 }}>
          <div style={{ color: accent.amber[500], marginBottom: 3 }}>
            耐久 {candidate.durability} / {candidate.maxDurability}
          </div>
          <div style={{ background: bg.gray800, height: 4, borderRadius: 2, overflow: 'hidden' }}>
            <div
              style={{
                background: accent.amber[500],
                height: '100%',
                width: `${(candidate.durability / candidate.maxDurability) * 100}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
