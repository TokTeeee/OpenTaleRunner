/**
 * v0.4 战斗系统 — CombatantCard
 *
 * 单个战斗实体的卡片视图:
 * - 立绘占位 (无 portrait 用首字符, 配 arcane 圆环)
 * - HP 条 (clamp 0-1, 阈值染色 emerald / amber / rose)
 * - AP 点数 (圆形符文格, 5-6 枚)
 * - Buff/Debuff 图标 (conditions 数组, hover 提示)
 * - 选中态 (金色高亮 + 旋转符文)
 *
 * 美学: 深色仪式场 — 墨蓝底 + 暗金边 + 敌我双色调 (敌 = 玫瑰金, 我 = 翠金)
 */

import { motion } from 'framer-motion';
import type { Combatant, BuffInstance } from '../../services/combat/types';
import { isAlive } from '../../services/combat/types';
import { ELEMENT_ICONS, ELEMENT_LABELS } from '../../types/ability';
import type { Element } from '../../types/ability';

interface CombatantCardProps {
  combatant: Combatant;
  isSelected?: boolean;
  isCurrentActor?: boolean;
  /** 目标选择模式: 允许点击 */
  isTargetable?: boolean;
  onClick?: () => void;
  /** 立绘 fallback 文本 (缺 portrait 时) */
  side: 'player' | 'ally' | 'enemy';
  /** 紧凑模式 (挤布局时减小 padding/字号) */
  compact?: boolean;
}

/** HP 颜色档位 (基于百分比) */
function hpBarColor(pct: number): string {
  if (pct > 0.6) return 'from-emerald-500 to-emerald-400';
  if (pct > 0.3) return 'from-amber-500 to-amber-400';
  return 'from-rose-600 to-rose-500';
}

/** MP 颜色档位 (基于百分比) */
function mpBarColor(pct: number): string {
  if (pct > 0.5) return 'from-blue-500 to-blue-400';
  if (pct > 0.2) return 'from-indigo-500 to-indigo-400';
  return 'from-violet-600 to-violet-500';
}

/** 侧边色调 — 敌 = 玫瑰金, 我方 = 翠金 */
const SIDE_ACCENT: Record<'player' | 'ally' | 'enemy', { ring: string; glow: string; tint: string }> = {
  player: {
    ring: 'ring-emerald-400/40 hover:ring-emerald-400/70',
    glow: 'shadow-[0_0_24px_rgba(16,185,129,0.25)]',
    tint: 'from-emerald-500/15 via-emerald-500/5 to-transparent',
  },
  ally: {
    ring: 'ring-cyan-400/40 hover:ring-cyan-400/70',
    glow: 'shadow-[0_0_24px_rgba(6,182,212,0.25)]',
    tint: 'from-cyan-500/15 via-cyan-500/5 to-transparent',
  },
  enemy: {
    ring: 'ring-rose-500/40 hover:ring-rose-500/70',
    glow: 'shadow-[0_0_24px_rgba(244,63,94,0.2)]',
    tint: 'from-rose-500/15 via-rose-500/5 to-transparent',
  },
};

/** 单个 buff 图标 */
function BuffIcon({ buff }: { buff: BuffInstance }) {
  const tooltip = `${buff.ref}${buff.stacks > 1 ? ` ×${buff.stacks}` : ''}${
    buff.remainingTurns >= 0 ? ` (${buff.remainingTurns}t)` : ' (∞)'
  }`;
  return (
    <div
      title={tooltip}
      className="w-5 h-5 rounded-full bg-ink-800/90 border border-gold-500/40
                 flex items-center justify-center text-[9px] font-display text-gold-300
                 shadow-[inset_0_0_0_1px_rgba(212,184,132,0.15)]"
    >
      {buff.ref[0]?.toUpperCase() ?? '?'}
    </div>
  );
}

export function CombatantCard({
  combatant,
  isSelected = false,
  isCurrentActor = false,
  isTargetable = false,
  onClick,
  side,
  compact = false,
}: CombatantCardProps) {
  const hpPct = Math.max(0, Math.min(1, combatant.hp / combatant.maxHp));
  const mpPct = combatant.maxMp ? Math.max(0, Math.min(1, (combatant.mp ?? 0) / combatant.maxMp)) : 0;
  const accent = SIDE_ACCENT[side];
  const initial = combatant.name[0] ?? '?';

  return (
    <motion.button
      type="button"
      onClick={isTargetable ? onClick : undefined}
      disabled={!isTargetable || combatant.isDead}
      data-testid={`combatant-card-${combatant.id}`}
      data-side={side}
      data-selected={isSelected}
      data-current-actor={isCurrentActor}
      data-dead={combatant.isDead}
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{
        opacity: combatant.isDead ? 0.35 : 1,
        y: 0,
        scale: isSelected ? 1.04 : 1,
        filter: combatant.isDead ? 'grayscale(80%)' : 'grayscale(0%)',
      }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={isTargetable && !combatant.isDead ? { y: -2 } : undefined}
      whileTap={isTargetable && !combatant.isDead ? { scale: 0.98 } : undefined}
      className={`
        group relative w-full overflow-hidden rounded-2xl
        bg-gradient-to-br ${accent.tint}
        bg-ink-900/80 backdrop-blur-sm
        border ${isSelected ? 'border-gold-400/70' : 'border-ink-700/60'}
        ring-1 ${accent.ring}
        ${accent.glow}
        transition-all duration-300
        text-left
        ${compact ? 'p-2' : 'p-3'}
        ${isTargetable && !combatant.isDead ? 'cursor-pointer' : 'cursor-default'}
      `}
    >
      {/* 当前行动者高亮 — 金色旋转环 */}
      {isCurrentActor && isAlive(combatant) && (
        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            background: 'conic-gradient(from 0deg, transparent 0%, rgba(212,184,132,0.3) 25%, transparent 50%, rgba(212,184,132,0.3) 75%, transparent 100%)',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        />
      )}

      {/* 头部: 头像 + 名字 + AP 徽章 */}
      <div className="relative flex items-center gap-2">
        {/* 立绘占位 — 圆环 + 首字符 */}
        <div className={`
          relative shrink-0 rounded-full
          bg-gradient-to-br from-ink-800 to-ink-950
          border ${isSelected ? 'border-gold-400/80' : 'border-ink-700/80'}
          ${compact ? 'w-9 h-9' : 'w-12 h-12'}
          flex items-center justify-center
          font-display font-bold text-gold-300
          shadow-[inset_0_0_0_1px_rgba(212,184,132,0.15)]
        `}>
          {combatant.portrait ? (
            <img src={combatant.portrait} alt={combatant.name} className="w-full h-full rounded-full object-cover" />
          ) : (
            <span className={compact ? 'text-base' : 'text-xl'}>{initial}</span>
          )}
          {/* 死亡遮罩 */}
          {combatant.isDead && (
            <div className="absolute inset-0 rounded-full bg-ink-950/60 flex items-center justify-center text-rose-400 text-xs">
              ☠
            </div>
          )}
        </div>

        {/* 名字 + 角色 ID */}
        <div className="flex-1 min-w-0">
          <div className={`font-display tracking-wide text-ink-100 truncate ${compact ? 'text-xs' : 'text-sm'}`}>
            {combatant.name}
          </div>
          {combatant.mobData && (
            <div className="text-[10px] text-ink-400 font-mono">
              Lv.{combatant.mobData.level} · {combatant.mobData.behavior}
            </div>
          )}
        </div>

        {/* AP 徽章 - 右上角突出显示 */}
        <div className="shrink-0 px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-400/60">
          <div className="flex items-baseline gap-0.5">
            <span className="text-[10px] font-display tracking-widest text-amber-200/80">AP</span>
            <span className="text-lg font-bold font-mono text-amber-200">{combatant.ap}</span>
            <span className="text-[11px] font-mono text-amber-400/50">/{combatant.maxAp}</span>
          </div>
        </div>
      </div>

      {/* HP 条 */}
      <div className="relative mt-2">
        <div className="flex justify-between items-baseline text-[10px] mb-0.5">
          <span className="text-rose-300/80 font-display tracking-widest">HP</span>
          <span className="text-ink-300 font-mono">
            {combatant.hp}<span className="text-ink-500">/{combatant.maxHp}</span>
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-ink-950/80 overflow-hidden border border-ink-700/60">
          <motion.div
            className={`h-full rounded-full bg-gradient-to-r ${hpBarColor(hpPct)}`}
            initial={{ width: 0 }}
            animate={{ width: `${hpPct * 100}%` }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          />
        </div>
      </div>

      {/* MP 条 (仅 maxMp > 0 时显示) */}
      {combatant.maxMp != null && combatant.maxMp > 0 && (
        <div className="relative mt-1">
          <div className="flex justify-between items-baseline text-[10px] mb-0.5">
            <span className="text-blue-300/80 font-display tracking-widest">MP</span>
            <span className="text-ink-300 font-mono">
              {combatant.mp ?? 0}<span className="text-ink-500">/{combatant.maxMp}</span>
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-ink-950/80 overflow-hidden border border-ink-700/60">
            <motion.div
              className={`h-full rounded-full bg-gradient-to-r ${mpBarColor(mpPct)}`}
              initial={{ width: 0 }}
              animate={{ width: `${mpPct * 100}%` }}
              transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
            />
          </div>
        </div>
      )}

      {/* 退出战斗标记 */}
      <div className="flex items-center justify-between mt-1.5">
        {combatant.isFleeing && (
          <span className="text-[9px] text-ink-400 font-display tracking-widest">逃</span>
        )}
      </div>

      {/* v0.6.2 — 元素抗性 chips (only non-zero values, compact 2-col grid) */}
      {combatant.elementalResistances && (
        <div
          className="mt-1.5 grid grid-cols-4 gap-x-1 gap-y-0.5"
          data-testid="combatant-resistances"
        >
          {(['fire', 'ice', 'lightning', 'wind', 'earth', 'arcane', 'holy', 'shadow'] as Element[]).map((el) => {
            const v = combatant.elementalResistances[el];
            if (v === 0) return null;
            const isResist = v > 0;
            return (
              <span
                key={el}
                data-testid={`combatant-resist-${el}`}
                data-value={v}
                title={`${ELEMENT_LABELS[el]} ${isResist ? '抗' : '弱'} ${isResist ? '+' : ''}${v}%`}
                className={`text-[9px] font-mono flex items-center gap-0.5 ${
                  isResist ? 'text-cyan-300' : 'text-rose-300'
                }`}
              >
                <span aria-hidden>{ELEMENT_ICONS[el]}</span>
                <span>{isResist ? '+' : ''}{v}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Buff/Debuff 图标 (最多显示 6 个, 溢出 +N) */}
      {combatant.conditions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {combatant.conditions.slice(0, 6).map((b, i) => (
            <BuffIcon key={`${b.ref}-${i}`} buff={b} />
          ))}
          {combatant.conditions.length > 6 && (
            <div className="w-5 h-5 rounded-full bg-ink-800/90 border border-ink-700 flex items-center justify-center text-[9px] font-mono text-ink-400">
              +{combatant.conditions.length - 6}
            </div>
          )}
        </div>
      )}

      {/* 选中态指示: 顶部金色滑线 */}
      {isSelected && (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-400 to-transparent"
        />
      )}
    </motion.button>
  );
}
