/**
 * v0.6.2 — resetAllStores 测试
 * 验证全 store 重置 (含 v0.6.2 字段: elementalResistances / learnedAbilities /
 * defaultLearnedAbilities / mp / maxMp — 这些字段在 Character 内部, character
 * 重置为 null 时随之消失).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { resetAllStores } from '../../src/utils/resetStores';
import { useCharacterStore } from '../../src/stores/characterStore';
import { useCombatStore, INITIAL_COMBAT_STATE } from '../../src/stores/combatStore';
import { useGameStore } from '../../src/stores/gameStore';
import type { Character } from '../../src/types/character';

function makePopulatedCharacter(): Character {
  return {
    characterId: 'hero-1',
    playerId: 'player-1',
    name: 'Hero',
    race: 'human',
    background: 'soldier',
    appearance: 'tall',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    skills: [],
    classId: 'mage',
    classSkills: [],
    hp: 30,
    maxHp: 30,
    mp: 20,
    maxMp: 20,
    vital: { hunger: 80, thirst: 80, fatigue: 80, hygiene: 80, morale: 80, wound: 0, temperature: 37, encumbrance: 0 },
    conditions: [],
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    elementalResistances: {
      fire: 50, ice: -25, lightning: 0, wind: 100,
      earth: 0, arcane: 0, holy: 0, shadow: 0,
    },
    learnedAbilities: [
      { abilityId: 'spell_fire_bolt', school: 'magic', learnedAt: 1000 },
      { abilityId: 'skill_warrior_smash', school: 'battle_art', learnedAt: 2000 },
    ],
    defaultLearnedAbilities: ['spell_fire_bolt'],
    recentHistory: [],
    inventory: {
      backpack: [],
      equipped: { weapon: null, armor: null, accessory: null },
      currency: { gold: 0, silver: 0, copper: 0 },
    },
    joinedRegion: 'plains',
    joinedWorldDay: 1,
    currentLocalDay: 1,
    lastActionTime: '',
    level: 5,
    exp: 0,
    expToNext: 100,
    unspentAttributePoints: 0,
  } as Character;
}

describe('resetAllStores (v0.6.2)', () => {
  beforeEach(() => {
    // 装入一个有 v0.6.2 字段填充的 character
    useCharacterStore.setState({ character: makePopulatedCharacter(), isLoaded: true });
  });

  it('character 含 v0.6.2 字段时, 重置后 character 变 null (v0.6.2 字段随之消失)', () => {
    // 前提: 装入的 character 含非零 v0.6.2 字段
    const before = useCharacterStore.getState().character!;
    expect(before.elementalResistances.fire).toBe(50);
    expect(before.learnedAbilities).toHaveLength(2);
    expect(before.defaultLearnedAbilities).toEqual(['spell_fire_bolt']);
    expect(before.mp).toBe(20);
    expect(before.maxMp).toBe(20);

    resetAllStores();

    // 完整 reset 路径: character 应为 null (即 getInitialState 行为)
    expect(useCharacterStore.getState().character).toBeNull();
    expect(useCharacterStore.getState().isLoaded).toBe(false);
  });

  it('character 为 null 时也能调用 (不抛错)', () => {
    useCharacterStore.setState({ character: null, isLoaded: false });

    expect(() => resetAllStores()).not.toThrow();
    expect(useCharacterStore.getState().character).toBeNull();
    expect(useCharacterStore.getState().isLoaded).toBe(false);
  });

  it('重置后 combatStore 回到 idle 状态', () => {
    useCombatStore.setState({ ...INITIAL_COMBAT_STATE, phase: 'active', active: true });
    resetAllStores();

    const combat = useCombatStore.getState();
    expect(combat.phase).toBe('idle');
    expect(combat.active).toBe(false);
  });

  it('重置后 gameStore 也回到初始状态 (验证通用 store 路径)', () => {
    // 污染 gameStore
    useGameStore.setState({ currentDay: 999, gameClock: 999 } as never);

    resetAllStores();

    const gs = useGameStore.getState();
    expect(gs.currentDay).toBe(useGameStore.getInitialState().currentDay);
    expect(gs.gameClock).toBe(useGameStore.getInitialState().gameClock);
  });

  it('re-export 兼容: resetClientStores 仍能调用 (来自 tests/utils/resetStores.ts)', async () => {
    // 确保旧的 test utility 仍可用
    const { resetClientStores } = await import('../../tests/utils/resetStores');
    expect(() => resetClientStores()).not.toThrow();
    expect(useCharacterStore.getState().character).toBeNull();
  });
});
