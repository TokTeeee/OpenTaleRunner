/**
 * v0.6.x 战斗系统 — useQTERunner
 *
 * 协调 QTE 弹层 + ActionResolver 的 hook.
 *
 * 历史变更:
 * - v0.5-dev: 移除 skill 走魔法 QTE 的路径 (skill 动作已隐藏), 仅 attack 触发 QTE 弹层.
 * - v0.6.2: ability 动作不触发 QTE 弹层 (走确定性解析, 由 AbilityResolver 决定
 *   damage/heal/effect 副作用); 走 ActionResolver.resolveAbility 路径, 命中/伤害
 *   公式与 attack 一致, 但补 8 元素抗性. MP 不足抛 InsufficientMPError.
 *
 * 流程 (v0.6.x):
 * 1. CombatView 点 onAction(attack|ability) + 选目标 -> executeAction(action)
 * 2. 检查 qte.enabled (仅 attack 路径):
 *    - 关: 走 ActionResolver.resolve(), modifier=0
 *    - 开: 调 QTEStore.runAttack 展示 overlay, 玩家完成
 *      -> 拿 result -> 走 ActionResolver.resolveWithQTE()
 * 3. ability 路径: 走 ActionResolver.resolveAbility(), 不开 QTE,
 *    命中/伤害走 8 元素抗性公式, 扣 MP, emit ABILITY_USED
 * 4. 调 applyResult() 把 log + hp/ap/mp 同步到 store
 * 5. 检查战斗结束 -> 通知 LLM endCombat
 *
 * 设计: 单实例, CombatView mount 时初始化
 */

import { useCallback } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { useQTEStore } from '../stores/qteStore';
import { useCombatStore } from '../stores/combatStore';
import { getSharedResolver, type QTEResult } from '../services/combat/ActionResolver';
import { QTE_NOOP, computeAttackRounds } from '../services/combat/QTELayer';
import { getAbility } from '../data/abilities';
import { useCharacterStore } from '../stores/characterStore';
import { useGameStore } from '../stores/gameStore';
import { logger } from '../utils/logger';
import type { CombatAction } from '../services/combat/types';

/** 测试用: 重置单例 */
export { _resetSharedResolver as _resetQTERunnerResolver } from '../services/combat/ActionResolver';

type CombatStoreState = ReturnType<typeof useCombatStore.getState>;
type GetAgilityDelta = (action: CombatAction, state: CombatStoreState) => number;

interface UseQTERunnerOptions {
  /** 攻击 QTE 的 agilityDelta (player.DEX - target.DEX, 0 兜底) */
  getAgilityDelta?: GetAgilityDelta;
}

const DEFAULT_GET_AGILITY: GetAgilityDelta = (action, state) => {
  // 默认: 攻击者 DEX - 第一个敌方 DEX (简化)
  if (action.kind !== 'attack') return 0;
  const attackerId = action.attackerId;
  const attacker = state.combatants[attackerId];
  if (!attacker) return 0;
  const enemies = Object.values(state.combatants).filter((c) => c.side === 'enemy');
  if (enemies.length === 0) return 0;
  const avgEnemyDEX = enemies.reduce((sum, e) => sum + e.attributes.DEX, 0) / enemies.length;
  return Math.max(0, attacker.attributes.DEX - avgEnemyDEX);
};

export function useQTERunner(opts: UseQTERunnerOptions = {}) {
  // 强制收窄: 兜底函数后必为 defined 函数. 用稳定 default 避免 useCallback 依赖抖动
  const getAgility: GetAgilityDelta = opts.getAgilityDelta ?? DEFAULT_GET_AGILITY;

  const executeAction = useCallback(
    async (action: CombatAction): Promise<{ qteResult: QTEResult; action: CombatAction }> => {
      const state = useCombatStore.getState();
      const qteEnabled = useSettingsStore.getState().qte.enabled;
      let qteResult: QTEResult = QTE_NOOP;

      // 1. 跑 QTE (开启 + 攻击)
      if (qteEnabled && action.kind === 'attack') {
        const store = useQTEStore.getState();
        const agilityDelta = getAgility(action, state);
        qteResult = await store.runAttack({
          agilityDelta,
          playerId: action.attackerId,
          targetId: action.targetId,
        });
        // 保留攻击的 agility 信息 (debug / log)
        void computeAttackRounds(agilityDelta);
        logger.info('QTERunner', `QTE result: ${qteResult.type} acc=${qteResult.accuracy.toFixed(2)} mod=${qteResult.modifier.toFixed(2)}`);
      }
      // v0.6.2: ability QTE 路由 — battle_art 走 timing, magic/prayer 走 typing
      else if (qteEnabled && action.kind === 'ability') {
        const ability = getAbility(action.abilityId);
        if (ability) {
          const store = useQTEStore.getState();
          const caster = state.combatants[action.userId];
          if (caster) {
            if (ability.school === 'battle_art') {
              // 战技走 timing bar (按 DEX 算 rounds)
              const agilityDelta = caster.attributes.DEX - 10;
              qteResult = await store.runAttack({
                agilityDelta, playerId: action.userId, targetId: action.targetId ?? '',
              });
            } else {
              // 魔法/祷告走 typing, spell 用 visualTag 或 name
              const spellText = ability.description.visualTag || ability.name;
              qteResult = await store.runMagic({
                spell: spellText, caster,
                playerId: action.userId, targetId: action.targetId ?? null,
              });
            }
            logger.info('QTERunner', `ability QTE (${ability.school}) result: ${qteResult.type} acc=${qteResult.accuracy.toFixed(2)} mod=${qteResult.modifier.toFixed(2)}`);
          }
        }
      }

      // 2. 走 ActionResolver
      const resolver = getSharedResolver();
      const freshState = useCombatStore.getState();
      const result = qteResult === QTE_NOOP
        ? resolver.resolve(action, freshState)
        : resolver.resolveWithQTE(action, freshState, qteResult);

      // 3. 同步 log / HP / AP 到 store
      const store = useCombatStore.getState();
      for (const entry of result.log) {
        store.appendLog(entry);
      }
      // 4. 检查角色 HP 同步到 characterStore (生命值互通)
      const player = freshState.combatants[freshState.queue[0]?.combatantId ?? ''] ?? null;
      const charStore = useCharacterStore.getState();
      if (player && charStore.character && player.side === 'player') {
        // 计算本次伤害 (从最新 log 中)
        const lastDamage = [...result.log].reverse().find(
          (e) => e.kind === 'action' && e.data && typeof e.data.damage === 'object' && e.data.damage,
        );
        if (lastDamage && lastDamage.data) {
          const dmg = (lastDamage.data.damage as { total: number }).total;
          if (dmg > 0) {
            const current = charStore.character.hp ?? 0;
            charStore.updateHP?.(current - dmg);
            logger.info('QTERunner', `玩家受 ${dmg} 伤害, 同步到 characterStore`);
          }
        }
        const lastHeal = [...result.log].reverse().find(
          (e) => e.kind === 'action' && e.data && typeof e.data.heal === 'number',
        );
        if (lastHeal && lastHeal.data) {
          const heal = lastHeal.data.heal as number;
          if (heal > 0) {
            const current = charStore.character.hp ?? 0;
            charStore.updateHP?.(current + heal);
          }
        }
      }

      // 5. 推进 turn: turnEnd -> 进入下一 combatant
      store.advanceTurn();

      // 6. 检查战斗结束 (全部敌人死亡 OR 玩家死亡)
      const newState = useCombatStore.getState();
      const enemies = Object.values(newState.combatants).filter((c) => c.side === 'enemy');
      const players = Object.values(newState.combatants).filter((c) => c.side === 'player');
      const allEnemiesDead = enemies.every((e) => e.isDead || e.hp <= 0);
      const allPlayersDead = players.every((p) => p.isDead || p.hp <= 0);

      if (allEnemiesDead) {
        store.beginResolving('victory');
        const durationRounds = newState.round;
        const finalState = {
          player: { hp: player?.hp ?? 0, maxHp: player?.maxHp ?? 0, conditions: [] as string[] },
          deadEnemies: enemies.length,
        };
        useGameStore.getState().addMessage({
          id: `combat-end-${Date.now()}`,
          type: 'system',
          content: '战斗结束, 等待 PM 收尾...',
          timestamp: Date.now(),
        });
        logger.info('QTERunner', `战斗胜利, LLM 应调 endCombat (duration ${durationRounds})`);
        void finalState;
      } else if (allPlayersDead) {
        store.beginResolving('defeat');
        logger.info('QTERunner', '战斗失败, 等待 PM endCombat 调 settle');
      } else if (newState.turn > newState.queue.length) {
        // round 结束
        store.advanceRound();
      }

      return { qteResult, action };
    },
    [getAgility],
  );

  return { executeAction };
}
