/**
 * v0.4 战斗系统 — CombatField
 *
 * 战斗主场景 (中央舞台):
 * - 上半: 敌队 (3 列 grid, 玫瑰色调)
 * - 中部: ACT 队列条
 * - 下半: 我方 (1-2 列 grid, 翠金/青金色调)
 *
 * 美学: 仪式场 — 深墨蓝底 + 中央浮现的金色魔法阵网格 + 敌我双侧
 */

import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { useCombatStore } from '../../stores/combatStore';
import { CombatantCard } from './CombatantCard';
import { ACTQueueBar } from './ACTQueueBar';
import { partitionBySide } from './combatUtils';
import { isAlive } from '../../services/combat/types';

interface CombatFieldProps {
  /** 当前选中的目标 ID (用于高亮) */
  selectedTargetId?: string | null;
  /** 点击目标时的回调 */
  onTargetSelect?: (combatantId: string) => void;
  /** 是否允许点选目标 (ActionMenu 在 attack/ability 时打开 target 选模式) */
  targetMode?: boolean;
}

export function CombatField({ selectedTargetId, onTargetSelect, targetMode = false }: CombatFieldProps) {
  const combatants = useCombatStore((s) => s.combatants);
  const queue = useCombatStore((s) => s.queue);
  const turn = useCombatStore((s) => s.turn);
  const round = useCombatStore((s) => s.round);

  const { enemies, allies } = useMemo(() => partitionBySide(combatants), [combatants]);
  const currentActorId = queue[turn - 1]?.combatantId ?? null;

  return (
    <div
      data-testid="combat-field"
      data-round={round}
      data-turn={turn}
      className="relative flex-1 flex flex-col items-stretch justify-between
                 bg-ink-950/60 rounded-2xl overflow-hidden
                 border border-ink-700/40
                 p-4 gap-3 min-h-0"
    >
      {/* 背景魔法阵 */}
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 arcane-grid opacity-30" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                        w-72 h-72 rounded-full border border-gold-500/10
                        shadow-[inset_0_0_64px_rgba(212,184,132,0.04)]" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                        w-48 h-48 rounded-full border border-gold-500/15" />
      </div>

      {/* 上方: 敌队 (3 列) */}
      <div className="relative z-10">
        <SideLabel label="敌方" tone="rose" />
        <div className="grid grid-cols-3 gap-2 mt-2">
          {enemies.length === 0 && (
            <div className="col-span-3 text-center text-ink-500 text-xs py-6 italic">
              （无敌人）
            </div>
          )}
          {enemies.map((c) => (
            <CombatantCard
              key={c.id}
              combatant={c}
              side="enemy"
              isCurrentActor={c.id === currentActorId && isAlive(c)}
              isSelected={selectedTargetId === c.id}
              isTargetable={targetMode && isAlive(c)}
              onClick={() => onTargetSelect?.(c.id)}
            />
          ))}
        </div>
      </div>

      {/* 中部: ACT 队列 */}
      <div className="relative z-10 flex items-center justify-center py-2">
        <ACTQueueBar queue={queue} combatants={combatants} currentTurn={turn} round={round} />
      </div>

      {/* 下方: 我方 (1-2 列) */}
      <div className="relative z-10">
        <SideLabel label="我方" tone="emerald" />
        <div className="grid grid-cols-2 gap-2 mt-2 max-w-2xl mx-auto">
          {allies.length === 0 && (
            <div className="col-span-2 text-center text-ink-500 text-xs py-6 italic">
              （无队友）
            </div>
          )}
          {allies.map((c) => (
            <CombatantCard
              key={c.id}
              combatant={c}
              side={c.side === 'player' ? 'player' : 'ally'}
              isCurrentActor={c.id === currentActorId && isAlive(c)}
              isSelected={selectedTargetId === c.id}
              isTargetable={targetMode && isAlive(c)}
              onClick={() => onTargetSelect?.(c.id)}
              compact
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SideLabel({ label, tone }: { label: string; tone: 'rose' | 'emerald' }) {
  return (
    <motion.div
      className="flex items-center gap-2"
      initial={{ opacity: 0, x: tone === 'rose' ? 8 : -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
    >
      <span className={`text-[10px] font-display tracking-[0.3em] uppercase ${tone === 'rose' ? 'text-rose-400/80' : 'text-emerald-400/80'}`}>
        {tone === 'rose' ? '◢' : '◣'}
      </span>
      <span className={`text-xs font-display tracking-widest ${tone === 'rose' ? 'text-rose-300' : 'text-emerald-300'}`}>
        {label}
      </span>
      <div className={`flex-1 h-px ${tone === 'rose' ? 'bg-gradient-to-r from-rose-500/30 to-transparent' : 'bg-gradient-to-l from-emerald-500/30 to-transparent'}`} />
    </motion.div>
  );
}
