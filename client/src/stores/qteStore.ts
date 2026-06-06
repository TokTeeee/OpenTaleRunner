/**
 * v0.4 战斗系统 — QTE Store
 *
 * 状态管理 QTE 弹层:
 * - 攻击 QTE: rounds 个回合, 每回合一指针扫过横条, 点中命中窗口算 hit
 * - 魔法 QTE: 倒计时内输入咒语, 字符数 / 时间算 score
 *
 * UI 组件 (QTETimingBar / QTETypingBox) 订阅此 store, 玩家完成后调 resolve()
 * CombatView 内的 useQTERunner hook 用这个 store 协调
 */

import { create } from 'zustand';
import {
  startAttackQTE,
  startMagicQTE,
  recordHit,
  finishQTE,
  cancelQTE,
  finalizeQTE,
  createIdleQTEState,
  type QTEResult,
  type QTERunState,
} from '../services/combat/QTELayer';
import type { Combatant } from '../services/combat/types';

export type { QTEResult };

export interface QTEStoreState {
  state: QTERunState;
  /** promise resolver: 完成时调 resolve(result) 兑现给 runAttack/runMagic caller */
  resolver: ((result: QTEResult) => void) | null;
  /** 当前 QTE 上下文 (用于 UI 渲染) */
  context: {
    playerId: string;
    targetId: string | null;
    /** 魔法: 咒语 */
    spell: string;
  };

  /** 开始攻击 QTE; 返回 Promise<QTEResult> */
  runAttack: (params: { agilityDelta: number; playerId: string; targetId: string }) => Promise<QTEResult>;
  /** 开始魔法 QTE */
  runMagic: (params: { spell: string; caster: Combatant; playerId: string; targetId: string | null }) => Promise<QTEResult>;

  /** 攻击: 记录一次命中 (点中窗口) */
  hit: () => void;
  /** 魔法: 记录一次正确字符 */
  typeChar: () => void;
  /** 玩家主动完成 (攻击全部 rounds 完成 / 魔法完成或超时) */
  finish: () => void;
  /** 取消 (ESC / UI 关闭) */
  cancel: () => void;
  /** 重置 */
  reset: () => void;
}

const initialState: QTERunState = createIdleQTEState();

export const useQTEStore = create<QTEStoreState>((set, get) => ({
  state: initialState,
  resolver: null,
  context: { playerId: '', targetId: null, spell: '' },

  runAttack: ({ agilityDelta, playerId, targetId }) =>
    new Promise<QTEResult>((resolve) => {
      const s = startAttackQTE(agilityDelta);
      set({
        state: s,
        resolver: resolve,
        context: { playerId, targetId, spell: '' },
      });
    }),

  runMagic: ({ spell, caster, playerId, targetId }) =>
    new Promise<QTEResult>((resolve) => {
      const s = startMagicQTE(spell, caster);
      set({
        state: s,
        resolver: resolve,
        context: { playerId, targetId, spell },
      });
    }),

  hit: () => {
    const s = get().state;
    if (s.phase !== 'pending') return;
    set({ state: recordHit(s) });
  },

  typeChar: () => {
    const s = get().state;
    if (s.phase !== 'pending') return;
    set({ state: recordHit(s) });
  },

  finish: () => {
    const { state, resolver } = get();
    if (state.phase !== 'pending') return;
    const finished = finishQTE(state);
    const result = finalizeQTE(finished);
    set({ state: { ...finished, phase: 'done' }, resolver: null });
    resolver?.(result);
  },

  cancel: () => {
    const { state, resolver } = get();
    if (state.phase !== 'pending') {
      set({ resolver: null });
      return;
    }
    const cancelled = cancelQTE(state);
    const result = finalizeQTE(cancelled);
    set({ state: cancelled, resolver: null });
    resolver?.(result);
  },

  reset: () => set({ state: initialState, resolver: null, context: { playerId: '', targetId: null, spell: '' } }),
}));
