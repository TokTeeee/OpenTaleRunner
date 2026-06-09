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
import type { Combatant, BalanceRating } from './types';
import type { Character } from '../../types/character';
import type { ElementalResistances } from '../../types/character';
import { ZERO_RESISTANCES } from '../../types/character';
import { getEquipmentResistances, getEquipmentMPBonus } from './ActionResolver';
import type { DebugBattle } from '../../data/debugPresets';
import { createDebugPlayer as createDebugPlayerFactory } from '../../data/debugPresets';

export function createDebugPlayer(): Combatant {
  return createDebugPlayerFactory();
}

/**
 * 合成"调试法师"角色 — 仅在 characterStore 空时注入, 让 SkillPickerPopover 有 learnedAbilities 可读.
 * 不写入 characterStore 的 savedChars (避免污染"我的角色"列表).
 */
function makeDebugMageCharacter(preset: DebugBattle): Character {
  const learned = preset.playerOptions?.learnedAbilities ?? [];
  const maxMp = preset.playerOptions?.maxMp ?? 20;
  const equipped = { weapon: null, armor: null, accessory: null } as Character['inventory']['equipped'];
  const equipResists = getEquipmentResistances(equipped);
  const mpBonus = getEquipmentMPBonus(equipped);
  return {
    characterId: `debug_mage_${preset.id}_${Date.now()}`,
    playerId: 'debug_mage',
    name: '测试法师',
    race: '人类',
    background: '调试预设: 法师火球测试',
    appearance: '深色法袍, 手持木杖',
    attributes: { STR: 10, DEX: 14, CON: 12, INT: 16, WIS: 15, CHA: 13 },
    skills: [],
    inventory: {
      equipped,
      backpack: [],
      currency: { gold: 0, silver: 0, copper: 0 },
    },
    hp: 30, maxHp: 30,
    mp: maxMp + mpBonus, maxMp: maxMp + mpBonus,
    vital: { hunger: 0, thirst: 0, fatigue: 0, hygiene: 0, morale: 0, wound: 0, temperature: 0, encumbrance: 0 },
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    conditions: [],
    joinedRegion: 'debug',
    joinedWorldDay: 1,
    currentLocalDay: 1,
    lastActionTime: new Date().toISOString(),
    currentRegion: 'debug',
    currentSubRegion: 'debug_arena',
    currentLocation: '调试竞技场',
    currentCoordinates: { x: 0, y: 0, z: 0 },
    gameClock: 12,
    timeOfDay: '正午',
    recentHistory: [],
    level: 5,
    exp: 0,
    expToNext: 100,
    unspentAttributePoints: 0,
    classId: 'mage',
    classSkills: [],
    elementalResistances: {
      ...ZERO_RESISTANCES,
      ...Object.fromEntries(
        Object.entries(equipResists).map(([k, v]) => [k, (ZERO_RESISTANCES[k as keyof ElementalResistances] ?? 0) + v])
      ),
    } as ElementalResistances,
    learnedAbilities: [...learned],
    defaultLearnedAbilities: learned.map((la) => la.abilityId),
  };
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
  //     优先用真实角色 (有则 merge, 不污染 gold/conditions/hp), 无则注入合成"调试法师"
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
    } else {
      // 用户在 title 页面直接进 debug, characterStore 空, 注入合成角色供 SkillPicker 读
      useCharacterStore.getState().setCharacter(makeDebugMageCharacter(preset));
    }
  }

  // 2. 直接 dispatch startCombat, 跳过 LLM
  // debug_ability 是能力测试 marker, 评估时映射为 'normal' (避免 BalanceRating 类型不收 'ability')
  const dispatchDifficulty: BalanceRating = preset.difficulty === 'ability' ? 'normal' : preset.difficulty;
  const results = await toolCallRegistry.dispatch([{
    name: 'startCombat',
    arguments: {
      combatId: preset.id,
      player: createDebugPlayerFactory(preset.playerOptions),
      party: [],
      enemies: [...preset.enemies],
      recommendedDifficulty: dispatchDifficulty,
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
