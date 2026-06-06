/**
 * v0.4 战斗系统 — QTETimingBar
 *
 * 攻击 QTE 弹层: 横条 + 移动指针, 玩家在命中窗口点击/按空格算 hit.
 * rounds 次扫完自动 finish, ESC 取消 (miss).
 *
 * 机制:
 * - 指针从左到右匀速扫过整条 (2s/round, 5 rounds = 10s 上限)
 * - 命中窗口 [0.4, 0.6] 居中 20% 区间, 命中 -> 顶部金条
 * - rounds 全部命中 -> finish; 中途可 ESC 取消
 *
 * 美学: 奥术瞄准镜 — 深色磨砂条 + 移动金色指针 + 命中区间高亮
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useQTEStore } from '../../stores/qteStore';

interface QTETimingBarProps {
  /** 单 round 扫描时长 (ms), 默认 2000 */
  roundMs?: number;
  /** 命中窗口比例 (相对总长), 默认 [0.4, 0.6] (中间 20%) */
  hitWindow?: [number, number];
  /** 测试用: 注入 start 时间 */
  testNow?: () => number;
}

const DEFAULT_ROUND_MS = 2000;
const DEFAULT_WINDOW: [number, number] = [0.4, 0.6];

export function QTETimingBar({
  roundMs = DEFAULT_ROUND_MS,
  hitWindow = DEFAULT_WINDOW,
  testNow,
}: QTETimingBarProps) {
  const state = useQTEStore((s) => s.state);
  const hit = useQTEStore((s) => s.hit);
  const finish = useQTEStore((s) => s.finish);
  const cancel = useQTEStore((s) => s.cancel);
  const context = useQTEStore((s) => s.context);

  const rounds = state.type === 'attack' && typeof state.payload === 'number' ? state.payload : 1;
  const [round, setRound] = useState(0); // 当前 round 0..rounds-1
  const [pointer, setPointer] = useState(0); // 0..1 指针位置
  const roundStartRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  // 用 ref 持 latest state 闭包, 让 tryHit useCallback 依赖稳定 (hitWindow, testNow 是稳定 const)
  const latestRef = useRef({ state, pointer, round, rounds, hit, finish, testNow });
  latestRef.current = { state, pointer, round, rounds, hit, finish, testNow };

  // 触发 hit: 读 latestRef 拿到最新 state, 函数身份稳定
  const tryHit = useCallback(() => {
    const { state: s, pointer: p, round: r, rounds: rs, hit: h, finish: f, testNow: tn } = latestRef.current;
    if (s.phase !== 'pending') return;
    if (p >= hitWindow[0] && p <= hitWindow[1]) {
      h();
    }
    // 不论命中与否, 当前 round 立即结束 -> 进入下一 round
    const nextRound = r + 1;
    if (nextRound >= rs) {
      f();
    } else {
      setRound(nextRound);
      roundStartRef.current = tn ? tn() : Date.now();
      setPointer(0);
    }
  }, [hitWindow, setRound, setPointer]);

  // ESC 取消 / 空格 / Enter 触发. 包含 pointer/round 在 deps 避免 keydown handler 拿到旧 tryHit
  useEffect(() => {
    if (state.phase !== 'pending') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        tryHit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.phase, pointer, round, tryHit, cancel]);

  // 启动扫描循环
  useEffect(() => {
    if (state.phase !== 'pending' || state.type !== 'attack') return;
    roundStartRef.current = testNow ? testNow() : Date.now();
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const now = testNow ? testNow() : Date.now();
      const t = (now - roundStartRef.current) / roundMs;
      if (t >= 1) {
        // 当前 round 结束 (未点中 -> miss)
        const nextRound = round + 1;
        if (nextRound >= rounds) {
          // 全部 round 完成 -> finish
          finish();
          return;
        }
        setRound(nextRound);
        roundStartRef.current = now;
        setPointer(0);
      } else {
        setPointer(t);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      alive = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, round, rounds]);

  if (state.phase !== 'pending' || state.type !== 'attack') return null;

  const hits = state.hits;
  const accuracy = rounds > 0 ? hits / rounds : 0;

  return (
    <div
      data-testid="qte-timing-bar"
      data-rounds={rounds}
      data-round={round}
      data-hits={hits}
      data-accuracy={accuracy.toFixed(2)}
      data-pointer={pointer.toFixed(2)}
      data-context-player={context.playerId}
      data-context-target={context.targetId ?? ''}
      className="fixed inset-0 z-40 flex items-center justify-center
                 bg-ink-950/80 backdrop-blur-sm"
      role="dialog"
      aria-label="QTE 攻击"
    >
      <div className="w-[480px] max-w-[90vw] p-6 rounded-2xl
                      bg-gradient-to-br from-ink-900/95 to-ink-950/95
                      border border-gold-500/30
                      shadow-[0_0_64px_rgba(212,184,132,0.15)]">
        {/* 标题 */}
        <div className="text-center mb-4">
          <div className="text-xs font-display tracking-[0.3em] text-gold-400/80 uppercase">
            ᛟ 攻击 QTE ᛟ
          </div>
          <div className="mt-1 text-[10px] text-ink-500 font-mono">
            Round {round + 1}/{rounds} · 命中 {hits}/{rounds} · ESC 取消
          </div>
        </div>

        {/* 横条 */}
        <button
          type="button"
          onClick={tryHit}
          data-testid="qte-timing-bar-track"
          className="relative w-full h-14 rounded-lg overflow-hidden
                     bg-ink-950 border border-ink-700
                     cursor-crosshair focus:outline-none
                     focus:ring-2 focus:ring-gold-400/50"
        >
          {/* 命中窗口 (金色高亮) */}
          <div
            aria-hidden
            className="absolute inset-y-0 bg-gold-500/20 border-x border-gold-400/50"
            style={{
              left: `${hitWindow[0] * 100}%`,
              width: `${(hitWindow[1] - hitWindow[0]) * 100}%`,
            }}
          />
          {/* 移动指针 */}
          <motion.div
            aria-hidden
            data-testid="qte-timing-bar-pointer"
            className="absolute inset-y-0 w-1 bg-gold-300
                       shadow-[0_0_12px_rgba(212,184,132,0.7)]"
            style={{ left: `calc(${pointer * 100}% - 2px)` }}
          />
          {/* 顶部命中累积指示 */}
          <div className="absolute top-0 inset-x-0 h-1 flex">
            {Array.from({ length: rounds }, (_, i) => (
              <div
                key={i}
                data-testid={`qte-hit-pip-${i}`}
                className={`flex-1 ${i < hits ? 'bg-gold-400' : 'bg-ink-800'}`}
              />
            ))}
          </div>
        </button>

        {/* 操作 hint */}
        <div className="mt-3 text-center text-[10px] text-ink-500 font-mono">
          点击 / 空格 触发 · 指针在金色区间内算 hit
        </div>
      </div>
    </div>
  );
}
