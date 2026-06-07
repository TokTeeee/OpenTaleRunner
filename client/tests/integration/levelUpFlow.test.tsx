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

// TODO: 测试内容将在 Task 2-3 补全

describe('v0.5.7 — LevelUp 端到端链路', () => {
  it('skeleton: placeholder', () => {
    expect(1 + 1).toBe(2);
  });
});
