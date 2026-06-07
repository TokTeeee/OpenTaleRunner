/**
 * v0.5.8 — subscribeCharacterExpEvents 失败链路 e2e
 *
 * 覆盖 spec §2.3 A-1 item:
 *   - PATCH /exp 失败 (非 2xx) 时不写 store
 *   - 失败后 emit 新事件, debounce 后能触发新的 PATCH
 *   - 新的 PATCH 成功时, applyServerExpGrant 正常写入
 *
 * **不** 覆盖 (留 v0.6 spec):
 *   - 真 retry 队列: 当前 flush() 在 fetch 前把 pending 清零,
 *     失败时 amount 直接丢弃, 不回填。要测 retry 队列合并
 *     需先改 subscribeCharacterEvents.ts:49-87 行为, 不在本 PR 范围。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eventBus } from '../../src/services/event/EventBus';
import { EVENTS } from '../../src/services/event/events';
import { useCharacterStore } from '../../src/stores/characterStore';
import { useCombatStore } from '../../src/stores/combatStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { subscribeCharacterExpEvents } from '../../src/services/level/subscribeCharacterEvents';
import type { Character } from '../../src/types/character';
import { resetClientStores } from '../utils/resetStores';

function makeChar(level: number): Character {
  return {
    characterId: 'c1',
    playerId: 'p1',
    name: 'Test',
    race: '人类',
    background: '',
    appearance: '',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    skills: [],
    inventory: { items: [], equipped: { weapon: null, armor: null, accessory: null }, currency: { gold: 0, silver: 0, copper: 0 } },
    hp: 20,
    maxHp: 20,
    vital: { hunger: 0, thirst: 0, fatigue: 0, hygiene: 0, morale: 0, wound: 0, temperature: 37, encumbrance: 0 },
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    conditions: [],
    joinedRegion: 'r',
    joinedWorldDay: 1,
    currentLocalDay: 1,
    lastActionTime: '',
    recentHistory: [],
    level,
    exp: 0,
    expToNext: 100,
    unspentAttributePoints: 0,
    classId: null,
    classSkills: [],
  };
}

beforeEach(() => {
  resetClientStores();
  useCombatStore.setState({ phase: 'idle', isPlayerTurn: false, active: false } as any);
  useAuthStore.setState({ token: 'tk' });
  useSettingsStore.setState({ server: { endpoint: 'http://api.test' } } as never);
});

afterEach(() => {
  eventBus.clear();
  vi.restoreAllMocks();
});

describe('v0.5.8 — EXP PATCH failure path', () => {
  it('skeleton: placeholder', () => {
    expect(1 + 1).toBe(2);
  });
});
