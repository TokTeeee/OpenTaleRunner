/**
 * v0.5-dev 战斗系统 — ActionMenu
 *
 * 玩家在 ACT 队列轮到时操作 5 类动作:
 * - 攻击 (2 AP)
 * - 物品 (0 AP, 走 BackpackModal)
 * - 防御 (1 AP, +命中门槛)
 * - 休息 (0 AP, 恢复 1 AP)
 * - 逃跑 (0 AP, 走 FleeAction)
 *
 * 设计:
 * - 5 张符文卡横排, hover 时顶部金色滑线 + 1px 上浮
 * - 缺 AP 时 disabled (灰化 + 0.5 opacity)
 * - 触发 onAction 时上层 CombatView 切到 target 选模式
 *   (item 模式: 直接调 openModal('backpack'))
 * - 只有当 currentActor 是玩家时才启用
 *
 * 美学: 奥术符文卡 — 深色磨砂玻璃 + 边缘金线 + 居中符文字符
 */

import { motion } from 'framer-motion';
import { useCombatStore } from '../../stores/combatStore';
import { useUIStore } from '../../stores/uiStore';
import { useCharacterStore } from '../../stores/characterStore';
import { isAlive } from '../../services/combat/types';
import { logger } from '../../utils/logger';
import { ACTION_SPECS, type ActionKind, type ActionSpec } from './combatActions';

// re-export 方便上层 CombatView 直接从 ActionMenu 取 ActionKind 类型
export type { ActionKind };

interface ActionMenuProps {
  /** 玩家 ID (高亮当前轮到玩家) */
  playerId: string;
  /** 选了某动作后的回调, 上层负责切到目标选择 */
  onAction: (kind: ActionKind) => void;
}

const ACTIONS = ACTION_SPECS.map((s) => ({
  ...s,
  opensModal: s.kind === 'item' ? ('backpack' as const) : undefined,
}));

export function ActionMenu({ playerId, onAction }: ActionMenuProps) {
  const player = useCombatStore((s) => s.combatants[playerId]);
  const queue = useCombatStore((s) => s.queue);
  const turn = useCombatStore((s) => s.turn);
  const phase = useCombatStore((s) => s.phase);
  const currentActorId = queue[turn - 1]?.combatantId ?? null;
  const isPlayerTurn = currentActorId === playerId && isAlive(player);
  const openModal = useUIStore((s) => s.openModal);
  const character = useCharacterStore((s) => s.character);

  const handleClick = (spec: ActionSpec) => {
    if (!isPlayerTurn) return;
    if (spec.opensModal === 'backpack') {
      // 物品走背包 modal (复用 v0.3 BackpackModal)
      openModal('backpack');
      logger.info('ActionMenu', `${spec.kind} -> open backpack modal`);
      return;
    }
    logger.info('ActionMenu', `selected ${spec.kind} (cost ${spec.cost} AP)`);
    onAction(spec.kind);
  };

  // 玩家不存在或已死: 不渲染
  if (!player || player.isDead) return null;
  // phase 不在 active: 不渲染
  if (phase !== 'active') return null;

  return (
    <div
      data-testid="action-menu"
      data-player-turn={isPlayerTurn}
      data-player-ap={player.ap}
      className="relative flex items-stretch gap-2 px-3 py-2
                 bg-ink-900/70 backdrop-blur-sm rounded-xl
                 border border-gold-500/15
                 shadow-[inset_0_1px_0_rgba(212,184,132,0.06)]"
    >
      {/* 状态: 轮到玩家 / AP 不足提示 */}
      <div className="absolute -top-2 left-3 px-2 py-0.5
                      bg-ink-950 border border-gold-500/30 rounded-full">
        <span className="text-[10px] font-display tracking-widest text-gold-400">
          {isPlayerTurn ? '你的回合' : '等待中'}
        </span>
      </div>

      {ACTIONS.map((spec) => {
        const canAfford = player.ap >= spec.cost;
        const enabled = isPlayerTurn && canAfford;
        return (
          <motion.button
            key={spec.kind}
            type="button"
            onClick={() => handleClick(spec)}
            disabled={!enabled}
            data-testid={`action-${spec.kind}`}
            data-disabled={!enabled}
            title={spec.description}
            whileHover={enabled ? { y: -2 } : undefined}
            whileTap={enabled ? { scale: 0.97 } : undefined}
            transition={{ duration: 0.15 }}
            className={`
              group relative flex-1 min-w-0 overflow-hidden rounded-lg
              ${enabled
                ? 'bg-gradient-to-b from-ink-800/90 to-ink-900/90 border border-ink-700/60 hover:border-gold-400/50 cursor-pointer'
                : 'bg-ink-900/40 border border-ink-800/60 opacity-50 cursor-not-allowed'}
              transition-colors duration-200
              p-2 flex flex-col items-center gap-0.5
            `}
          >
            {/* hover 顶部金色滑线 */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px
                         bg-gradient-to-r from-transparent via-gold-400/80 to-transparent
                         -translate-x-full group-hover:translate-x-full
                         transition-transform duration-500 ease-out"
            />
            <span className={`text-lg font-display ${enabled ? 'text-gold-300' : 'text-ink-600'}`}>
              {spec.glyph}
            </span>
            <span className={`text-[11px] font-display tracking-wider ${enabled ? 'text-ink-100' : 'text-ink-500'}`}>
              {spec.label}
            </span>
            <span className={`text-[9px] font-mono ${enabled ? 'text-amber-400/70' : 'text-ink-600'}`}>
              {spec.cost}AP
            </span>
          </motion.button>
        );
      })}

      {/* 角色 hint (小字符 ID) */}
      {character && (
        <div className="absolute -bottom-4 right-3 text-[9px] font-mono text-ink-500 tracking-widest">
          {character.name}
        </div>
      )}
    </div>
  );
}
