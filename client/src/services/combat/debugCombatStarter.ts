/**
 * 调试战斗启动器 — 直接 dispatch startCombat toolcall, 跳过 LLM
 *
 * 0 改动核心引擎. 全部走公开 API. 不写 characterStore.
 * 详细见 spec: docs/superpowers/specs/2026-06-04-combat-debug-design.md
 */
import { toolCallRegistry } from '../llm/ToolCallRegistry';
import { useCombatStore, INITIAL_COMBAT_STATE } from '../../stores/combatStore';
import { useGameStore } from '../../stores/gameStore';
import { useCharacterStore } from '../../stores/characterStore';
import { registerCombatTools } from './combatTools';
import type { Combatant } from './types';
import type { DebugBattle } from '../../data/debugPresets';
import { createDebugPlayer as createDebugPlayerFactory } from '../../data/debugPresets';

export function createDebugPlayer(): Combatant {
  return createDebugPlayerFactory();
}

export async function startDebugBattle(preset: DebugBattle): Promise<void> {
  // 0. 确保战斗工具已注册
  registerCombatTools();

  // 1. 干净启动 — 强制重置 (避免上轮战斗残留)
  useCombatStore.setState({ ...INITIAL_COMBAT_STATE, phase: 'idle' });
  useGameStore.getState().setDebugMode(true);
  useGameStore.getState().setPhase('playing');

  // 1b. v0.6.2 — 若 preset 声明了 playerOptions (含 learnedAbilities), 同步写入 characterStore
  //     这样 ActionMenu 的"能力"按钮才能找到对应的 ability 列表
  if (preset.playerOptions?.learnedAbilities && preset.playerOptions.learnedAbilities.length > 0) {
    const currentChar = useCharacterStore.getState().character;
    if (currentChar) {
      useCharacterStore.getState().setCharacter({
        ...currentChar,
        learnedAbilities: [...preset.playerOptions.learnedAbilities],
        defaultLearnedAbilities: preset.playerOptions.learnedAbilities.map((la) => la.abilityId),
        maxMp: preset.playerOptions.maxMp ?? currentChar.maxMp,
        mp: preset.playerOptions.maxMp ?? currentChar.mp,
      });
    }
  }

  // 2. 直接 dispatch startCombat, 跳过 LLM
  const results = await toolCallRegistry.dispatch([{
    name: 'startCombat',
    arguments: {
      combatId: preset.id,
      player: createDebugPlayerFactory(preset.playerOptions),
      party: [],
      enemies: [...preset.enemies],
      recommendedDifficulty: preset.difficulty,
      narrativeOpening: `[调试] ${preset.title} — ${preset.description}`,
    },
  }]);
  const dispatchResult = results[0]!;

  // 3. dispatch 失败: handler 抛错或未注册
  if (!dispatchResult.ok) {
    useCombatStore.setState({ ...INITIAL_COMBAT_STATE, phase: 'idle' });
    useGameStore.getState().setPhase('title');
    throw new Error(
      `startCombat dispatch failed: ${dispatchResult.error ?? 'unknown error'}`,
    );
  }

  // 4. dispatch ok, 但 handler 自身可能返回 { ok: false, reason } (validate / phase 守卫失败)
  const handlerResult = dispatchResult.result as { ok: boolean; reason?: string } | undefined;
  if (handlerResult && handlerResult.ok === false) {
    useCombatStore.setState({ ...INITIAL_COMBAT_STATE, phase: 'idle' });
    useGameStore.getState().setPhase('title');
    throw new Error(
      `startCombat handler failed: ${handlerResult.reason ?? 'unknown reason'}`,
    );
  }
}
