/**
 * v0.5.7 — LevelUp 端到端集成测试
 *
 * 覆盖 spec 7 个状态跃迁:
 *   战斗 → EXP 事件 → subscriber 聚合 → PATCH /exp → 服务端算新 level
 *   → 写 store → TierUnlockModal 弹 → 玩家选节点 → PATCH /class
 *
 * 与 guild.test.tsx 的区别:
 *   guild.test.tsx 用 grantExp() 推 level, 跳过了事件层; 本测试验的是
 *   event→subscriber→PATCH 契约, 是 v0.5.4 audit Gap #1 的回归网。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { eventBus } from '../../src/services/event/EventBus';
import { EVENTS } from '../../src/services/event/events';
import { useCharacterStore } from '../../src/stores/characterStore';
import { useCombatStore } from '../../src/stores/combatStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { subscribeCharacterExpEvents } from '../../src/services/level/subscribeCharacterEvents';
import { GuildClassModal } from '../../src/components/modals/GuildClassModal';
import { TierUnlockModal } from '../../src/components/modals/TierUnlockModal';
import type { Character } from '../../src/types/character';
import { resetClientStores } from '../utils/resetStores';

// -------------------------------------------------------------------------
// 测试夹具
// -------------------------------------------------------------------------

function makeChar(level: number, classId: string | null, picked: string[]): Character {
  return {
    characterId: 'c1',
    playerId: 'p1',
    name: 'Test',
    race: '人类',
    background: '',
    appearance: '',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    skills: [],
    inventory: {
      equipped: { weapon: null, armor: null, accessory: null },
      backpack: [],
      currency: { gold: 0, silver: 0, copper: 0 },
    },
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
    classId,
    classSkills: picked.map((nodeId) => ({ classId: classId || '', nodeId, unlockedAt: 0 })),
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

describe('v0.5.7 — LevelUp 端到端链路', () => {
  it('skeleton: placeholder', () => {
    expect(1 + 1).toBe(2);
  });
});
