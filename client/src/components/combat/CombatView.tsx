/**
 * v0.4 战斗系统 — CombatView 顶层
 *
 * FSM 路由:
 *   idle          -> 渲染 null (narrative 区域可见)
 *   initializing  -> 渲染仪式开场 (loading)
 *   active        -> 渲染 CombatField + ActionMenu + CombatLog + QTE overlay
 *   resolving     -> 渲染结算中 (等待 endCombat handler 调 settle)
 *   settled       -> 渲染 SettlementModal (结果)
 *
 * 状态机:
 * - selectedAction: 当前在选目标的动作 (attack / ability)
 * - selectedTargetId: 选中的目标
 * - onAction: 选 -> 进入 target 选模式 (attack) 或打开 skillPicker (ability)
 *   - defend / flee 不需目标, 直接 executeAction
 *   - item 走背包 modal (ActionMenu 已拦截)
 *   - ability 打开 SkillPickerPopover -> 选 ability -> 进入 target 选模式
 * - 点目标 -> 拼装 CombatAction 调 useQTERunner.executeAction()
 * - QTE 开启时: useQTERunner 等 QTE 完成 -> 走 ActionResolver
 * - QTE 关闭时: useQTERunner 直接走 ActionResolver (modifier=0)
 *
 * 设计: 全屏覆盖 narrative 区域, 由 useCombatStore.active 派生, 不感知具体 phase
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCombatStore } from '../../stores/combatStore';
import { useCharacterStore } from '../../stores/characterStore';
import { useGameStore } from '../../stores/gameStore';
import { useUIStore } from '../../stores/uiStore';
import { useQTEStore } from '../../stores/qteStore';
import { CombatField } from './CombatField';
import { ActionMenu, type ActionKind } from './ActionMenu';
import { CombatLog } from './CombatLog';
import { FloatingDamage } from './FloatingDamage';
import { QTETimingBar } from './QTETimingBar';
import { QTETypingBox } from './QTETypingBox';
import { SkillPickerPopover } from './SkillPickerPopover';
import { useQTERunner } from '../../hooks/useQTERunner';
import { logger } from '../../utils/logger';
import { ACTION_COSTS } from './combatActions';
import { getSharedResolver } from '../../services/combat/ActionResolver';
import { eventBus } from '../../services/event/EventBus';
import { EVENTS } from '../../services/event/events';
import { getAbility } from '../../data/abilities';
import type { CombatAction, CombatOutcome, BalanceRating, Combatant } from '../../services/combat/types';

type SelectedAction = ActionKind | null;

// 简单的敌人 AI：选择最近的玩家单位攻击，或者在AP不足时休息
function enemyAI(actor: Combatant, combatants: Record<string, Combatant>): CombatAction | null {
  if (actor.side !== 'enemy' || actor.isDead) return null;
  
  // 攻击需要 2 AP，不足时休息
  if (actor.ap < 2) {
    return {
      kind: 'wait',
      userId: actor.id,
    };
  }
  
  // 找到最近的玩家/盟友目标
  const targets = Object.values(combatants).filter(
    (c) => (c.side === 'player' || c.side === 'ally') && !c.isDead
  );
  
  if (targets.length === 0) return null;
  
  // 简单选择：优先选HP最低的玩家
  const target = targets.reduce((min, c) => c.hp < min.hp ? c : min, targets[0]!);
  
  return {
    kind: 'attack',
    attackerId: actor.id,
    targetId: target.id,
  };
}

export function CombatView() {
  const phase = useCombatStore((s) => s.phase);
  const active = useCombatStore((s) => s.active);
  const combatants = useCombatStore((s) => s.combatants);
  const queue = useCombatStore((s) => s.queue);
  const turn = useCombatStore((s) => s.turn);
  const round = useCombatStore((s) => s.round);
  const outcome = useCombatStore((s) => s.outcome);
  const narrativeClosing = useCombatStore((s) => s.narrativeClosing);
  const balanceRating = useCombatStore((s) => s.balanceRating);
  const balanceReport = useCombatStore((s) => s.balanceReport);
  const reset = useCombatStore((s) => s.reset);
  const combatantsForReset = useCombatStore((s) => s.combatants);
  const updateHP = useCharacterStore((s) => s.updateHP);
  const updateMP = useCharacterStore((s) => s.updateMP);
  const showToast = useUIStore((s) => s.showToast);
  const advanceTurn = useCombatStore((s) => s.advanceTurn);
  const advanceRound = useCombatStore((s) => s.advanceRound);
  const beginResolving = useCombatStore((s) => s.beginResolving);
  const appendLog = useCombatStore((s) => s.appendLog);
  const tickBuffs = useCombatStore((s) => s.tickBuffs);
  const character = useCharacterStore((s) => s.character);
  const addMessage = useGameStore((s) => s.addMessage);
  const qteState = useQTEStore((s) => s.state);
  const { executeAction } = useQTERunner();

  // 玩家 ID (从 character 派生; 战斗开始时 combatant.id == character.characterId / 'player')
  const playerId = useMemo(() => {
    for (const c of Object.values(combatants)) {
      if (c.side === 'player') return c.id;
    }
    return character?.characterId ?? 'player';
  }, [combatants, character]);

  // 当前行动者是否是玩家
  const isPlayerTurn = useMemo(() => {
    if (phase !== 'active' || queue.length === 0) return false;
    const currentActorId = queue[turn - 1]?.combatantId ?? null;
    if (!currentActorId) return false;
    const currentActor = combatants[currentActorId];
    return currentActor?.side === 'player' || currentActor?.side === 'ally';
  }, [phase, queue, turn, combatants]);

  const [selectedAction, setSelectedAction] = useState<SelectedAction>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  // v0.6.2 — skill picker 状态
  const [skillPickerOpen, setSkillPickerOpen] = useState(false);
  const [selectedAbilityId, setSelectedAbilityId] = useState<string | null>(null);
  const [isProcessingEnemyTurn, setIsProcessingEnemyTurn] = useState(false);
  // 持久化 resolver 实例，保持跨回合的 dodgePenalty 状态
  const resolverRef = useRef(getSharedResolver());
  // 注: selectedAction / selectedTargetId 由 onAction (重置 target) / onTargetSelect / onCancelTarget
  // 显式重置. 不在 useEffect 里 reset 避免 cascading render 警告.
  // (phase 切到 idle 时组件返回 null, 残留状态不可见, 不影响下次开局 — 因为 onAction 会覆盖)

  // 敌人自动行动
  useEffect(() => {
    if (phase !== 'active' || isPlayerTurn || isProcessingEnemyTurn || queue.length === 0) return;

    const currentActorId = queue[turn - 1]?.combatantId ?? null;
    if (!currentActorId) return;
    const currentActor = combatants[currentActorId];
    if (!currentActor || currentActor.side !== 'enemy' || currentActor.isDead) {
      // 跳过死亡或非敌人的行动者
      if (turn < queue.length) {
        advanceTurn();
      } else {
        advanceRound();
      }
      return;
    }

    // 敌人 AI 行动
    // 注: setIsProcessingEnemyTurn(true) 移入 setTimeout 回调,
    // 既避开 react-hooks/set-state-in-effect lint (effect body 不应同步 setState),
    // 又便于在 cleanup 中 clearTimeout 防止组件卸载后 setState / 推进回合.
    const enemyTimer = setTimeout(async () => {
      setIsProcessingEnemyTurn(true);
      try {
        const action = enemyAI(currentActor, combatants);
        if (action) {
          const resolver = resolverRef.current;
          const state = useCombatStore.getState();
          const result = resolver.resolve(action, state);
          
          // 应用日志
          for (const entry of result.log) {
            appendLog(entry);
          }
          
          // 应用 buff ticks
          const tickResults = tickBuffs();
          for (const tick of tickResults) {
            if (tick.log) {
              appendLog({
                kind: 'turnEnd',
                round,
                turn,
                message: tick.log,
              });
            }
          }
          
          // 检查战斗结束条件
          const newState = useCombatStore.getState();
          const enemies = Object.values(newState.combatants).filter((c) => c.side === 'enemy');
          const players = Object.values(newState.combatants).filter((c) => c.side === 'player');
          const allEnemiesDead = enemies.every((e) => e.isDead || e.hp <= 0);
          const allPlayersDead = players.every((p) => p.isDead || p.hp <= 0);
          
          // 检查逃跑成功
          const hasFledUnit = Object.values(newState.combatants).some((c) => c.isFleeing);
          
          if (allEnemiesDead) {
            beginResolving('victory');
            addMessage({
              id: `combat-end-${Date.now()}`,
              type: 'system',
              content: '战斗胜利！',
              timestamp: Date.now(),
            });
          } else if (allPlayersDead) {
            eventBus.emit(EVENTS.COMBAT_END, { outcome: 'defeat' });
            beginResolving('defeat');
          } else if (hasFledUnit) {
            eventBus.emit(EVENTS.COMBAT_END, { outcome: 'fled' });
            beginResolving('fled');
            addMessage({
              id: `combat-end-${Date.now()}`,
              type: 'system',
              content: '队伍成功逃脱！',
              timestamp: Date.now(),
            });
          } else if (newState.turn < newState.queue.length) {
            advanceTurn();
          } else {
            advanceRound();
          }
        }
      } catch (e) {
        logger.error('CombatView', `Enemy turn processing error: ${(e as Error).message}`);
      } finally {
        setIsProcessingEnemyTurn(false);
      }
    }, 800); // 给一点延迟，让 UI 有时间反应

    return () => clearTimeout(enemyTimer);
  }, [phase, turn, queue, combatants, isPlayerTurn, isProcessingEnemyTurn, round, advanceTurn, advanceRound, beginResolving, appendLog, tickBuffs, addMessage]);

  // 所有 hooks 必须在条件 return 之前 (Rules of Hooks)
  const onAction = useCallback((kind: ActionKind) => {
    // defend / flee / wait 不需目标, 立即执行
    if (kind === 'defend' || kind === 'flee' || kind === 'wait') {
      const action: CombatAction =
        kind === 'defend'
          ? { kind: 'defend', userId: playerId, cost: { ap: ACTION_COSTS.defend } }
          : kind === 'wait'
          ? { kind: 'wait', userId: playerId }
          : { kind: 'flee', userId: playerId };
      logger.info('CombatView', `直接执行 ${kind}`);
      void executeAction(action);
      return;
    }
    // ability: 打开 skill picker 选 ability
    if (kind === 'ability') {
      setSkillPickerOpen(true);
      setSelectedAction(null);
      setSelectedTargetId(null);
      logger.info('CombatView', '打开技能选择弹层');
      return;
    }
    // attack -> 进入 target 选模式
    setSelectedAction(kind);
    setSelectedTargetId(null);
    logger.info('CombatView', `进入目标选择模式: ${kind}`);
  }, [playerId, executeAction]);

  // v0.6.2 — 玩家在 SkillPickerPopover 选了 ability
  const onAbilitySelect = useCallback((abilityId: string) => {
    setSkillPickerOpen(false);
    setSelectedAbilityId(abilityId);
    // 检查 ability 的 target 类型, 决定是否需要 target 选模式
    const ability = getAbility(abilityId);
    if (!ability) {
      logger.warn('CombatView', `未找到 ability: ${abilityId}`);
      setSelectedAbilityId(null);
      return;
    }
    // 'self' / 'all_enemies' / 'all_allies' 不需单选目标, 直接执行
    if (ability.target === 'self' || ability.target === 'all_enemies' || ability.target === 'all_allies') {
      const action: CombatAction = {
        kind: 'ability',
        userId: playerId,
        abilityId,
        targetId: ability.target === 'self' ? playerId : undefined,
      };
      logger.info('CombatView', `直接执行 ability (无目标): ${abilityId}`);
      setSelectedAbilityId(null);
      void executeAction(action);
      return;
    }
    // 'enemy' / 'ally' -> 进入 target 选模式
    setSelectedAction('ability');
    setSelectedTargetId(null);
    logger.info('CombatView', `选择 ability, 进入目标选择模式: ${abilityId}`);
  }, [playerId, executeAction]);

  // v0.6.2 — 关闭 skill picker (用户点 backdrop / close)
  const onSkillPickerClose = useCallback(() => {
    setSkillPickerOpen(false);
  }, []);

  const onTargetSelect = useCallback(
    (targetId: string) => {
      if (!selectedAction) return;

      const actionKind = selectedAction;
      const abilityId = selectedAbilityId;
      const target = combatants[targetId];

      // 验证目标有效性: attack 只能选敌人, ability 按 target 类型路由
      if (actionKind === 'attack') {
        if (!target || target.side !== 'enemy' || target.isDead) {
          const name = target?.name ?? targetId;
          logger.warn('CombatView', `攻击目标无效: ${name}, 请重新选择`);
          showToast(`目标无效: ${name} 不可攻击`, 'warn');
          return; // 拒绝, 保持 target 选模式
        }
      } else if (actionKind === 'ability' && abilityId) {
        const ability = getAbility(abilityId);
        if (ability) {
          const expectedSide = ability.target === 'ally' || ability.target === 'self' ? 'player' : 'enemy';
          if (!target || target.side !== expectedSide || target.isDead) {
            if (ability.target !== 'all_enemies' && ability.target !== 'all_allies') {
              const name = target?.name ?? targetId;
              logger.warn('CombatView', `能力目标无效: ${name} (需要 ${expectedSide} 侧存活目标), 请重新选择`);
              showToast(`目标无效: ${name} 不可作为${ability.school === 'prayer' ? '治疗' : '攻击'}目标`, 'warn');
              return; // 拒绝, 保持 target 选模式
            }
          }
        }
      }

      // 验证通过, 复位 UI 选状态
      setSelectedAction(null);
      setSelectedTargetId(null);
      setSelectedAbilityId(null);

      // 拼装 CombatAction
      let action: CombatAction;
      if (actionKind === 'attack') {
        action = { kind: 'attack', attackerId: playerId, targetId };
      } else if (actionKind === 'ability' && abilityId) {
        action = { kind: 'ability', userId: playerId, abilityId, targetId };
      } else {
        logger.warn('CombatView', `未处理 action kind: ${actionKind}`);
        return;
      }

      logger.info(
        'CombatView',
        `执行 ${actionKind}${abilityId ? `(${abilityId})` : ''} -> ${target?.name ?? targetId}`,
      );
      void executeAction(action);
    },
    [selectedAction, selectedAbilityId, playerId, combatants, executeAction, showToast],
  );

  const onCancelTarget = useCallback(() => {
    setSelectedAction(null);
    setSelectedTargetId(null);
    setSelectedAbilityId(null);
  }, []);

  // idle: 不渲染 (narrative 区域照常)
  if (phase === 'idle' || !active) return null;

  // initializing: 仪式开场
  if (phase === 'initializing') {
    return <InitializingScene />;
  }

  // settled: 结算 modal (不退出, 玩家点确认后 reset)
  if (phase === 'settled') {
    return (
      <SettlementModal
        outcome={outcome ?? 'victory'}
        narrativeClosing={narrativeClosing}
        balanceRating={balanceRating}
        powerRatio={balanceReport?.powerRatio}
        onDismiss={() => {
          // 战斗结算: 同步玩家 HP/MP 到角色栏
          const playerCombatant = Object.values(combatantsForReset).find((c) => c.side === 'player');
          if (playerCombatant && character) {
            updateHP(playerCombatant.hp);
            if (playerCombatant.mp != null && character.maxMp > 0) {
              updateMP(playerCombatant.mp);
            }
          }
          reset();
          // 写一条玩家确认的 message (让 narrative 区看到战斗结束)
          addMessage({
            id: `combat-dismissed-${Date.now()}`,
            type: 'system',
            content: narrativeClosing ? `▶ ${narrativeClosing}` : '战斗结束, 继续旅途',
            timestamp: Date.now(),
          });
        }}
      />
    );
  }

  // resolving: 结算中 (转圈)
  if (phase === 'resolving') {
    return <ResolvingScene />;
  }

  return (
    <motion.div
      data-testid="combat-view"
      data-phase={phase}
      data-selected-action={selectedAction ?? ''}
      data-qte-phase={qteState.phase}
      data-qte-type={qteState.type ?? ''}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 z-30 flex flex-col
                 bg-gradient-to-b from-ink-950/95 via-ink-900/95 to-ink-950/95
                 backdrop-blur-md p-3 gap-2"
    >
      {/* 顶栏: 难度 + 退出 hint */}
      <TopBar balanceRating={balanceRating} powerRatio={balanceReport?.powerRatio} />

      {/* 主区: 场地 (左/中) + 日志 (右) */}
      <div className="flex-1 flex gap-2 min-h-0">
        <div className="flex-[3] flex flex-col gap-2 min-w-0">
          <CombatField
            selectedTargetId={selectedTargetId}
            onTargetSelect={onTargetSelect}
            targetMode={selectedAction !== null}
          />
          {/* 选目标时浮出 "取消" */}
          <AnimatePresence>
            {selectedAction && (
              <motion.button
                type="button"
                onClick={onCancelTarget}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="self-center px-4 py-1 text-xs font-display tracking-widest
                           text-rose-300/80 hover:text-rose-200
                           border border-rose-500/30 hover:border-rose-400/60
                           rounded-full bg-ink-900/60 backdrop-blur-sm"
              >
                取消 {selectedAction} · 选择目标
              </motion.button>
            )}
          </AnimatePresence>
          <ActionMenu playerId={playerId} onAction={onAction} />
        </div>
        <div className="flex-1 min-w-[200px] max-w-[320px]">
          <CombatLog className="h-full" />
        </div>
      </div>

      {/* 飘字层 (占位) */}
      <FloatingDamage events={[]} />

      {/* QTE 弹层 (attack: 时序条; magic: 咒语输入) - 内部按 qteState.phase / type 路由. 用 key 强制 reset 内部 state */}
      <QTETimingBar key={`attack-${qteState.startedAt}`} />
      <QTETypingBox key={`magic-${qteState.startedAt}`} />

      {/* v0.6.2 — skill picker 弹层 (玩家点 "技能" 按钮后) */}
      {skillPickerOpen && (
        <SkillPickerPopover onSelect={onAbilitySelect} onClose={onSkillPickerClose} playerId={playerId} />
      )}
    </motion.div>
  );
}

// ============================================================
// 顶栏
// ============================================================

const RATING_GLYPH: Record<BalanceRating, { label: string; color: string }> = {
  trivial: { label: '简单', color: 'text-emerald-300' },
  normal: { label: '普通', color: 'text-ink-200' },
  hard: { label: '困难', color: 'text-amber-300' },
  deadly: { label: '致命', color: 'text-rose-300' },
};

function TopBar({
  balanceRating,
  powerRatio,
}: {
  balanceRating?: BalanceRating;
  powerRatio?: number;
}) {
  if (!balanceRating) {
    return (
      <div
        data-testid="combat-topbar"
        className="flex items-center justify-between px-3 py-1
                   bg-ink-900/60 rounded-lg border border-ink-700/40"
      >
        <span className="text-[10px] font-display tracking-widest text-ink-500">战斗进行中</span>
      </div>
    );
  }
  const info = RATING_GLYPH[balanceRating];
  return (
    <div
      data-testid="combat-topbar"
      data-rating={balanceRating}
      data-power-ratio={powerRatio?.toFixed(2) ?? ''}
      className="flex items-center justify-between px-3 py-1
                 bg-ink-900/70 backdrop-blur-sm rounded-lg border border-gold-500/15"
    >
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-display tracking-widest text-gold-400">难度</span>
        <span className={`text-sm font-display tracking-widest ${info.color}`}>
          {info.label}
        </span>
        {powerRatio != null && (
          <span className="text-[10px] font-mono text-ink-400">
            战力比 {powerRatio.toFixed(2)}
          </span>
        )}
      </div>
      <span className="text-[9px] font-mono text-ink-500">v0.4 combat system</span>
    </div>
  );
}

// ============================================================
// InitializingScene — 仪式开场
// ============================================================

function InitializingScene() {
  return (
    <div
      data-testid="combat-initializing"
      className="absolute inset-0 z-30 flex items-center justify-center
                 bg-ink-950/95 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="text-center space-y-4"
      >
        <motion.div
          className="text-6xl text-gold-400 font-display"
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        >
          ᛟ
        </motion.div>
        <div className="text-gold-300/80 font-display tracking-[0.4em] text-sm">
          召唤仪式
        </div>
        <div className="text-ink-500 text-[10px] font-mono tracking-widest">
          战斗阵型部署中
        </div>
      </motion.div>
    </div>
  );
}

// ============================================================
// ResolvingScene — 结算中
// ============================================================

function ResolvingScene() {
  return (
    <div
      data-testid="combat-resolving"
      className="absolute inset-0 z-30 flex items-center justify-center
                 bg-ink-950/95 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center space-y-3"
      >
        <motion.div
          className="w-12 h-12 mx-auto rounded-full border-2 border-gold-500/30 border-t-gold-400"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        />
        <div className="text-gold-300/80 font-display tracking-[0.3em] text-sm">
          结算中
        </div>
      </motion.div>
    </div>
  );
}

// ============================================================
// SettlementModal — 战斗结果
// ============================================================

const OUTCOME_LABEL: Record<CombatOutcome, { label: string; color: string; glyph: string }> = {
  victory: { label: '胜利', color: 'text-gold-300', glyph: '✦' },
  defeat: { label: '失败', color: 'text-rose-300', glyph: '✕' },
  fled: { label: '逃脱', color: 'text-cyan-300', glyph: '⤳' },
  disrupted: { label: '中断', color: 'text-amber-300', glyph: '◌' },
  interrupted: { label: '打断', color: 'text-ink-300', glyph: '∥' },
};

function SettlementModal({
  outcome,
  narrativeClosing,
  balanceRating,
  powerRatio,
  onDismiss,
}: {
  outcome: CombatOutcome;
  narrativeClosing?: string;
  balanceRating?: BalanceRating;
  powerRatio?: number;
  onDismiss: () => void;
}) {
  const info = OUTCOME_LABEL[outcome] ?? OUTCOME_LABEL.victory;
  return (
    <motion.div
      data-testid="combat-settlement"
      data-outcome={outcome}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="absolute inset-0 z-30 flex items-center justify-center
                 bg-ink-950/90 backdrop-blur-md p-6"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="relative max-w-md w-full
                   bg-gradient-to-br from-ink-900/95 to-ink-950/95
                   border border-gold-500/30 rounded-2xl
                   shadow-[0_0_64px_rgba(212,184,132,0.15)]
                   p-6 text-center space-y-4"
      >
        {/* 顶金线 */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-400 to-transparent" />

        <div className={`text-5xl font-display ${info.color}`}>{info.glyph}</div>
        <div className={`text-2xl font-display tracking-widest ${info.color}`}>
          {info.label}
        </div>

        {balanceRating && (
          <div className="flex items-center justify-center gap-2 text-[11px] font-display">
            <span className="text-ink-500 tracking-widest">难度</span>
            <span className="text-gold-300">{RATING_GLYPH[balanceRating].label}</span>
            {powerRatio != null && (
              <span className="text-ink-500 font-mono">({powerRatio.toFixed(2)})</span>
            )}
          </div>
        )}

        {narrativeClosing && (
          <div className="text-ink-200 text-sm leading-relaxed italic font-narrative
                          border-t border-b border-gold-500/15 py-3 px-2
                          bg-ink-950/40 rounded-md">
            {narrativeClosing}
          </div>
        )}

        <motion.button
          type="button"
          onClick={onDismiss}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="mt-2 px-6 py-2 rounded-full
                     bg-gradient-to-r from-gold-600 to-gold-500
                     hover:from-gold-500 hover:to-gold-400
                     text-ink-950 font-display font-medium tracking-widest text-sm
                     shadow-[0_0_24px_rgba(212,184,132,0.3)]
                     transition-all duration-200"
        >
          继续旅途
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
