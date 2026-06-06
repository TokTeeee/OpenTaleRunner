/**
 * v0.4 战斗系统 — CombatLog
 *
 * 战斗日志 (右侧或底部): 滚动追加 CombatLogEntry
 * - 按 kind 着色: start (gold) / action (ink) / turnStart/turnEnd (ink) / end (gold) / system (cyan)
 * - 最多保留最近 50 条 (CombatStore 自身限 100, 这里再 limit display)
 * - 自动滚到底
 *
 * 美学: 羊皮纸卷轴 — 深墨底 + 金色顶线 + 等宽字体小条目
 */

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCombatStore } from '../../stores/combatStore';
import type { CombatLogEntry } from '../../services/combat/types';

const KIND_STYLE: Record<CombatLogEntry['kind'], { color: string; label: string; glyph: string }> = {
  start: { color: 'text-gold-300', label: '始', glyph: '◈' },
  turnStart: { color: 'text-emerald-300/80', label: '轮', glyph: '▸' },
  action: { color: 'text-ink-200', label: '行', glyph: '·' },
  turnEnd: { color: 'text-ink-500', label: '结', glyph: '◂' },
  end: { color: 'text-gold-300', label: '末', glyph: '◉' },
  system: { color: 'text-cyan-300/80', label: '系', glyph: '※' },
};

const DISPLAY_LIMIT = 50;

interface CombatLogProps {
  className?: string;
}

export function CombatLog({ className = '' }: CombatLogProps) {
  const log = useCombatStore((s) => s.log);
  const round = useCombatStore((s) => s.round);
  const containerRef = useRef<HTMLDivElement>(null);

  // 自动滚到底 (新事件追加时)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [log.length]);

  const display = log.slice(-DISPLAY_LIMIT);

  return (
    <div
      data-testid="combat-log"
      data-round={round}
      data-entries={display.length}
      className={`relative flex flex-col bg-ink-900/70 backdrop-blur-sm rounded-xl
                  border border-ink-700/60 overflow-hidden ${className}`}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-1.5
                      border-b border-ink-700/40 bg-ink-950/40">
        <span className="text-[10px] font-display tracking-[0.3em] text-gold-400/80 uppercase">
          ᛟ 战斗日志
        </span>
        <span className="text-[10px] font-mono text-ink-500">
          {display.length}/{DISPLAY_LIMIT}
        </span>
      </div>

      {/* 列表 */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5 min-h-0"
        style={{ maxHeight: '100%' }}
      >
        {display.length === 0 ? (
          <div className="text-center text-ink-500 text-[11px] italic py-6">
            （暂无事件）
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {display.map((entry, i) => {
              const style = KIND_STYLE[entry.kind] ?? KIND_STYLE.action;
              return (
                <motion.div
                  key={`${entry.timestamp}-${i}`}
                  data-testid="combat-log-entry"
                  data-kind={entry.kind}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-baseline gap-1.5 text-[11px] leading-snug"
                >
                  <span className={`shrink-0 w-3 text-center font-display ${style.color}`}>
                    {style.glyph}
                  </span>
                  <span className={`shrink-0 text-[9px] font-mono ${style.color} opacity-60`}>
                    R{entry.round}T{entry.turn}
                  </span>
                  <span className={`flex-1 ${style.color}`}>{entry.message}</span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
