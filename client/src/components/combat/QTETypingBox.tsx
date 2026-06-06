/**
 * v0.4 战斗系统 — QTETypingBox
 *
 * 魔法 QTE 弹层: 显示咒语 (无空格), 玩家在倒计时内键入.
 * - typingAccuracy = 已输入正确字符数 / 咒语长度
 * - timeBonus = clamp(1 - elapsedMs / baseMs, 0, 1)
 * - 完成 = 输入全部字符 或 倒计时归零
 * - ESC 取消 (miss)
 *
 * 美学: 咒语羊皮纸 — 米白卡纸 + 哥特字体咒语 + 倒计时红字
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useQTEStore } from '../../stores/qteStore';
import { computeTimeBonus } from '../../services/combat/QTELayer';

interface QTETypingBoxProps {
  /** 测试用: 注入 start 时间 */
  testNow?: () => number;
}

export function QTETypingBox({ testNow }: QTETypingBoxProps) {
  const state = useQTEStore((s) => s.state);
  const typeChar = useQTEStore((s) => s.typeChar);
  const finish = useQTEStore((s) => s.finish);
  const cancel = useQTEStore((s) => s.cancel);
  const context = useQTEStore((s) => s.context);

  const spell = state.type === 'magic' && typeof state.payload === 'string' ? state.payload : '';
  const baseMs = state.baseMs;
  const [typed, setTyped] = useState('');
  // 用 state.startedAt 作为倒计时起点 (qteStore.startMagicQTE 时设置). 组件在 key 变化时 remount, 自然用新值
  const startedAtRef = useRef<number>(state.startedAt);

  // 倒计时 tick
  useEffect(() => {
    if (state.phase !== 'pending' || state.type !== 'magic') return;
    const id = setInterval(() => {
      const now = testNow ? testNow() : Date.now();
      const elapsed = now - startedAtRef.current;
      if (elapsed >= baseMs) {
        // 时间到 -> finish
        finish();
      }
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, baseMs]);

  // 输入
  useEffect(() => {
    if (state.phase !== 'pending' || state.type !== 'magic') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        finish();
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        setTyped((t) => t.slice(0, -1));
        return;
      }
      if (e.key.length === 1 && /^[a-zA-Z\u4e00-\u9fa5]$/.test(e.key)) {
        e.preventDefault();
        const ch = e.key;
        setTyped((t) => {
          const next = t + ch;
          // 检查是否正确 (只统计与 spell 对齐的正确字符)
          const expected = spell[next.length - 1];
          if (ch === expected) {
            typeChar();
          }
          // 全部输入完成 -> 自动 finish
          if (next.length >= spell.length) {
            // 等下一个 tick 让 store 同步
            queueMicrotask(() => finish());
          }
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, spell]);

  // 计算指标
  const now = testNow ? testNow() : Date.now();
  const elapsedMs = state.phase === 'pending' ? now - startedAtRef.current : 0;
  const timeBonus = computeTimeBonus(elapsedMs, baseMs);
  const remainingMs = Math.max(0, baseMs - elapsedMs);
  const remainingPct = baseMs > 0 ? remainingMs / baseMs : 0;
  const typingAccuracy = spell.length > 0 ? state.hits / spell.length : 0;
  const onSubmit = useCallback(() => {
    finish();
  }, [finish]);

  if (state.phase !== 'pending' || state.type !== 'magic') return null;

  return (
    <div
      data-testid="qte-typing-box"
      data-spell={spell}
      data-base-ms={baseMs}
      data-typed={typed}
      data-hits={state.hits}
      data-total={state.total}
      data-typing-accuracy={typingAccuracy.toFixed(2)}
      data-time-bonus={timeBonus.toFixed(2)}
      data-remaining-ms={remainingMs}
      data-context-player={context.playerId}
      data-context-target={context.targetId ?? ''}
      className="fixed inset-0 z-40 flex items-center justify-center
                 bg-ink-950/80 backdrop-blur-sm"
      role="dialog"
      aria-label="QTE 魔法"
    >
      <div className="w-[520px] max-w-[90vw] p-6 rounded-2xl
                      bg-gradient-to-br from-amber-50/95 to-amber-100/95
                      border border-amber-700/50
                      shadow-[0_0_64px_rgba(212,184,132,0.3)]
                      text-ink-900">
        {/* 标题 */}
        <div className="text-center mb-3">
          <div className="text-[10px] font-display tracking-[0.3em] text-amber-800 uppercase">
            ᛟ 魔法 QTE ᛟ
          </div>
          <div className="mt-1 text-[10px] text-amber-700/80 font-mono">
            正确 {state.hits}/{state.total} · 准确率 {(typingAccuracy * 100).toFixed(0)}% · ESC 取消
          </div>
        </div>

        {/* 咒语显示 (无空格, 字符位置 0..N) */}
        <div
          data-testid="qte-typing-box-spell"
          className="font-display text-2xl tracking-[0.2em] text-center mb-4
                     bg-amber-100/60 border border-amber-700/30 rounded-md py-3
                     select-none"
        >
          {spell.split('').map((ch, i) => {
            const typedCh = typed[i];
            const correct = typedCh === ch;
            return (
              <span
                key={i}
                data-testid={`qte-spell-char-${i}`}
                data-state={
                  typedCh === undefined ? 'pending' : correct ? 'correct' : 'wrong'
                }
                className={
                  typedCh === undefined
                    ? 'text-ink-500'
                    : correct
                      ? 'text-emerald-700'
                      : 'text-rose-700 line-through'
                }
              >
                {ch}
              </span>
            );
          })}
        </div>

        {/* 已输入预览 */}
        <div className="font-mono text-sm text-ink-700 text-center mb-3 min-h-[1.5em]">
          {typed || <span className="text-ink-400 italic">键入咒语字符...</span>}
        </div>

        {/* 倒计时条 */}
        <div
          data-testid="qte-typing-box-timer"
          className="relative h-2 bg-ink-900/20 rounded-full overflow-hidden"
        >
          <motion.div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-500 to-rose-500"
            style={{ width: `${remainingPct * 100}%` }}
            transition={{ duration: 0.1, ease: 'linear' }}
          />
        </div>
        <div className="mt-1 text-center text-[10px] font-mono text-ink-700">
          ⏱ {(remainingMs / 1000).toFixed(1)}s
        </div>

        {/* 手动提交 */}
        <button
          type="button"
          onClick={onSubmit}
          data-testid="qte-typing-box-submit"
          className="mt-3 w-full py-1.5 rounded-md
                     bg-amber-700 hover:bg-amber-600
                     text-amber-50 font-display tracking-widest text-xs
                     transition-colors"
        >
          提前结束 (Enter)
        </button>
      </div>
    </div>
  );
}
