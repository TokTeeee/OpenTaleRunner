/**
 * v0.4 战斗系统 — ACTQueueBar
 *
 * ACT 队列可视化 (Initiative 时序):
 * - 横向 5 槽, 每槽代表一个 combatant
 * - 当前行动者: 金色脉冲环 + 上箭头
 * - 已行动: 半透明
 * - 死亡: 暗灰 + 骷髅符
 *
 * 美学: 仪式圆阵 — 5 个符文环按 initiative 排序排成一条水平时间线
 */

import { motion } from 'framer-motion';
import type { InitiativeEntry, Combatant } from '../../services/combat/types';

interface ACTQueueBarProps {
  queue: InitiativeEntry[];
  combatants: Record<string, Combatant>;
  currentTurn: number;
  round: number;
}

export function ACTQueueBar({ queue, combatants, currentTurn, round }: ACTQueueBarProps) {
  if (queue.length === 0) return null;

  return (
    <div
      data-testid="act-queue-bar"
      data-round={round}
      className="relative flex flex-col items-center justify-center gap-2 px-4 py-3
                 bg-ink-900/60 backdrop-blur-sm rounded-xl
                 border border-gold-500/15
                 shadow-[inset_0_1px_0_rgba(212,184,132,0.06)]"
    >
      {/* Round 标 */}
      <div className="px-2 py-0.5 bg-ink-950 border border-gold-500/30 rounded-full">
        <span className="text-[10px] font-display tracking-widest text-gold-400">
          ᛟ ROUND {round} ᛟ
        </span>
      </div>

      {/* 队列槽 */}
      <div className="flex items-center gap-1.5">
        {queue.map((entry, idx) => {
          const c = combatants[entry.combatantId];
          if (!c) return null;
          const isCurrent = idx + 1 === currentTurn;
          const hasActed = idx + 1 < currentTurn;
          const isEnemy = c.side === 'enemy';

          return (
            <motion.div
              key={entry.combatantId}
              data-testid={`act-slot-${entry.combatantId}`}
              data-current={isCurrent}
              data-acted={hasActed}
              data-dead={c.isDead}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: hasActed ? 0.35 : 1, scale: 1 }}
              transition={{ delay: idx * 0.04, duration: 0.3 }}
              className="relative"
            >
              {/* 当前行动者箭头 */}
              {isCurrent && !c.isDead && (
                <motion.div
                  aria-hidden
                  className="absolute -top-3 left-1/2 -translate-x-1/2 text-gold-400 text-xs"
                  animate={{ y: [0, -2, 0] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  ▲
                </motion.div>
              )}

              {/* 槽位圆 */}
              <div
                className={`
                  relative w-9 h-9 rounded-full flex items-center justify-center
                  font-display text-xs
                  border-2
                  ${
                    isCurrent && !c.isDead
                      ? 'border-gold-400 bg-gold-500/20 text-gold-200 shadow-[0_0_16px_rgba(212,184,132,0.5)]'
                      : c.isDead
                        ? 'border-ink-700 bg-ink-950 text-ink-600'
                        : hasActed
                          ? 'border-ink-600 bg-ink-800/60 text-ink-500'
                          : isEnemy
                            ? 'border-rose-500/40 bg-rose-950/40 text-rose-200'
                            : 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200'
                  }
                `}
              >
                {c.isDead ? '☠' : (c.name[0] ?? '?')}
              </div>

              {/* Initiative 小字 (d20 滚出) */}
              <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[8px] font-mono text-ink-500">
                {entry.initiative}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
