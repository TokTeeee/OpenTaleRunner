/**
 * v0.5.4 — EventBus → PATCH /exp subscriber (client side)
 *
 * 把战斗/叙事的 EXP 事件聚合成单次服务端授权请求, 镜像 server/services/exp_formula.py.
 *
 * 事件 → EXP 累加:
 *   COMBAT_HIT          +1
 *   COMBAT_KILL         +5
 *   COMBAT_END.victory  +30
 *   COMBAT_END.defeat   +10
 *   COMBAT_END.fled     +0  (no-op)
 *   NARRATIVE_SUBMIT    +2
 *
 * 设计:
 *  - debounce (默认 800ms) 合并一波事件
 *  - 服务端权威: amount 累加后单次 PATCH, server 算最终 level/exp/expToNext/unspentAttributePoints
 *  - 失败 (非 2xx) 不写 store, 下次事件再合并
 *  - 难度暂固定 'normal' (v0.5.4 范围), 后续可加 currentDifficulty 全局
 */
import { eventBus } from '../event/EventBus';
import { EVENTS } from '../event/events';
import { useCharacterStore } from '../../stores/characterStore';
import { getBaseUrl, getAuthToken } from '../sync/HttpClient';

export const EXP_AMOUNTS = {
  COMBAT_HIT: 1,
  COMBAT_KILL: 5,
  COMBAT_END: {
    victory: 30,
    defeat: 10,
    fled: 0,
  } as const,
  NARRATIVE_SUBMIT: 2,
} as const;

export interface SubscribeOptions {
  /** debounce 窗口 ms (默认 800). 同一窗口内事件合并为单次 PATCH */
  debounceMs?: number;
  /** 难度乘数 (默认 'normal'). v0.5.4 固定 normal, 接口预留后续 currentDifficulty */
  difficulty?: 'easy' | 'normal' | 'hard' | 'deadly';
}

export function subscribeCharacterExpEvents(opts: SubscribeOptions = {}): () => void {
  const debounceMs = opts.debounceMs ?? 800;
  const difficulty = opts.difficulty ?? 'normal';
  let pending = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    const amount = pending;
    pending = 0;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (amount <= 0) return;

    const character = useCharacterStore.getState().character;
    if (!character?.characterId) return;

    const url = `${getBaseUrl()}/api/v1/characters/${character.characterId}/exp`;
    const token = getAuthToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    void (async () => {
      try {
        const res = await fetch(url, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ amount, difficulty }),
        });
        if (!res.ok) return; // 失败: 静默丢弃, 下次合并重试
        const text = await res.text();
        if (!text) return;
        const patch = JSON.parse(text) as {
          level: number;
          exp: number;
          expToNext: number;
          unspentAttributePoints: number;
        };
        useCharacterStore.getState().applyServerExpGrant(patch);
      } catch {
        /* 网络错误: 静默 */
      }
    })();
  };

  const schedule = (delta: number) => {
    if (delta <= 0) return;
    pending += delta;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  };

  const offHit = eventBus.on(EVENTS.COMBAT_HIT, () => schedule(EXP_AMOUNTS.COMBAT_HIT));
  const offKill = eventBus.on(EVENTS.COMBAT_KILL, () => schedule(EXP_AMOUNTS.COMBAT_KILL));
  const offEnd = eventBus.on(EVENTS.COMBAT_END, (payload) => {
    const outcome = (payload as { outcome?: 'victory' | 'defeat' | 'fled' } | undefined)?.outcome;
    if (!outcome) return;
    schedule(EXP_AMOUNTS.COMBAT_END[outcome]);
  });
  const offSub = eventBus.on(EVENTS.NARRATIVE_SUBMIT, () =>
    schedule(EXP_AMOUNTS.NARRATIVE_SUBMIT),
  );

  return () => {
    offHit();
    offKill();
    offEnd();
    offSub();
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
