/**
 * v0.4 战斗系统 — FloatingDamage
 *
 * 飘字层: 渲染 combatStore 中 floatDamage 队列的数字,
 * 1.5s 上升 + 渐隐, 数字颜色按伤害类型 (伤害=rose, 治疗=emerald, 格挡=ink)
 *
 * 注: 飘字触发需 CombatEngine 在 applyDamage/applyHeal 时 push 到 store.
 * v0.4 Phase 5 暂未落 (CombatEngine 还在 Phase 1, 没有触发飘字),
 * 组件保留接口位供 Phase 6 接入.
 */

import { motion, AnimatePresence } from 'framer-motion';

export interface FloatDamageEvent {
  id: string;
  combatantId: string;
  amount: number;
  type: 'damage' | 'heal' | 'block' | 'crit';
  createdAt: number;
}

interface FloatingDamageProps {
  events: FloatDamageEvent[];
  /** 单条飘字存活时长 (ms) */
  duration?: number;
}

const TYPE_STYLE: Record<FloatDamageEvent['type'], { color: string; prefix: string; size: string }> = {
  damage: { color: 'text-rose-400', prefix: '-', size: 'text-2xl' },
  heal: { color: 'text-emerald-400', prefix: '+', size: 'text-xl' },
  block: { color: 'text-ink-300', prefix: '⛨', size: 'text-lg' },
  crit: { color: 'text-amber-300', prefix: '!', size: 'text-3xl' },
};

export function FloatingDamage({ events, duration = 1500 }: FloatingDamageProps) {
  return (
    <div
      data-testid="floating-damage"
      className="pointer-events-none fixed inset-0 z-50"
      aria-hidden
    >
      <AnimatePresence>
        {events.map((ev) => {
          const style = TYPE_STYLE[ev.type];
          return (
            <motion.div
              key={ev.id}
              data-testid="floating-damage-event"
              data-type={ev.type}
              data-amount={ev.amount}
              initial={{ opacity: 0, y: 0, scale: 0.6 }}
              animate={{ opacity: [0, 1, 1, 0], y: -80, scale: [0.6, 1.2, 1, 1] }}
              exit={{ opacity: 0 }}
              transition={{ duration: duration / 1000, ease: [0.4, 0, 0.2, 1] }}
              className={`absolute left-1/2 top-1/2 -translate-x-1/2
                          font-display font-bold ${style.color} ${style.size}
                          drop-shadow-[0_0_8px_rgba(0,0,0,0.8)]`}
            >
              {style.prefix}{Math.abs(ev.amount)}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
