/**
 * framer-motion 动效变体 (Motion Variants) — 与 tokens.ts 同步。
 * 所有 framer-motion 动效都从这里引用，避免散落定义。
 */

import type { Variants, Transition } from 'framer-motion';
import { duration, easing } from './tokens';

export const transitions: Record<string, Transition> = {
  quill: { duration: duration.medium, ease: easing.quill },
  page: { duration: duration.base, ease: easing.page },
  arcane: { duration: duration.medium, ease: easing.arcane },
  fast: { duration: duration.fast, ease: easing.out },
  base: { duration: duration.base, ease: easing.out },
  slow: { duration: duration.slow, ease: easing.inOut },
  epic: { duration: duration.epic, ease: easing.inOut },
};

// ─── 基础 ───
export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: duration.base, ease: easing.out } },
  exit: { opacity: 0, transition: { duration: duration.fast, ease: easing.out } },
};

export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: duration.medium, ease: easing.quill } },
  exit: { opacity: 0, y: -4, transition: { duration: duration.fast, ease: easing.out } },
};

export const fadeInScale: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: { duration: duration.base, ease: easing.page } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: duration.fast, ease: easing.out } },
};

// ─── 模态 ───
export const modalEnter: Variants = {
  initial: { opacity: 0, scale: 0.96, filter: 'blur(8px)' },
  animate: {
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)',
    transition: { duration: duration.medium, ease: easing.page },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    filter: 'blur(4px)',
    transition: { duration: duration.fast, ease: easing.out },
  },
};

export const backdropFade: Variants = {
  initial: { opacity: 0, backdropFilter: 'blur(0px)' },
  animate: { opacity: 1, backdropFilter: 'blur(16px)', transition: { duration: duration.base } },
  exit: { opacity: 0, backdropFilter: 'blur(0px)', transition: { duration: duration.fast } },
};

// ─── 侧栏 / 列表 ───
export const slideInRight: Variants = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0, transition: transitions.base },
  exit: { opacity: 0, x: 8, transition: { duration: duration.fast } },
};

export const slideInLeft: Variants = {
  initial: { opacity: 0, x: -16 },
  animate: { opacity: 1, x: 0, transition: transitions.base },
  exit: { opacity: 0, x: -8, transition: { duration: duration.fast } },
};

export const listStagger: Variants = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.06, delayChildren: 0.08 },
  },
};

export const listItem: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: transitions.base },
};

// ─── 墨水扩散 / 叙事 ───
export const inkDiffuse: Variants = {
  initial: { clipPath: 'circle(0% at 50% 50%)', opacity: 0 },
  animate: {
    clipPath: 'circle(150% at 50% 50%)',
    opacity: 1,
    transition: { duration: duration.medium, ease: easing.quill },
  },
};

export const inkDrip: Variants = {
  initial: { scaleY: 0, transformOrigin: 'top' },
  animate: { scaleY: 1, transition: { duration: duration.medium, ease: easing.out } },
};

// ─── 骰子 ───
export const diceBurst: Variants = {
  initial: { scale: 1, opacity: 1 },
  animate: {
    scale: [1, 1.04, 0.98, 1],
    transition: { duration: duration.slow + 0.4, times: [0, 0.3, 0.7, 1] },
  },
};

export const diceNumber: Variants = {
  initial: { scale: 0.5, opacity: 0 },
  animate: {
    scale: [0.5, 1.2, 1],
    opacity: 1,
    transition: { duration: duration.medium, times: [0, 0.6, 1], ease: easing.arcane },
  },
};

// ─── 章节 ───
export const chapterTransition: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1, transition: { duration: duration.slow, ease: easing.page } },
  exit: { opacity: 0, scale: 1.05, transition: { duration: duration.medium } },
};

// ─── 按钮 ───
export const buttonHover = {
  scale: 1.02,
  transition: { duration: duration.fast, ease: easing.out },
};

export const buttonTap = {
  scale: 0.98,
  transition: { duration: 0.08, ease: easing.out },
};

// ─── 工具 ───
export const containerStagger = (delay = 0.08, gap = 0.06): Variants => ({
  initial: {},
  animate: { transition: { staggerChildren: gap, delayChildren: delay } },
});

export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

// ─── PR B 补充: 骰子命中 / 大成功 / 粒子 ───

/** 1px 水平震屏,给大成功/大失败 (200ms) */
export const screenShake: Variants = {
  initial: { x: 0 },
  animate: {
    x: [0, -1, 1, -1, 1, 0],
    transition: { duration: 0.2, times: [0, 0.2, 0.4, 0.6, 0.8, 1], ease: easing.out },
  },
};

/** 边框金色闪烁 3 次 (1.2s) */
export const goldFlicker: Variants = {
  initial: { boxShadow: '0 0 0 0 rgba(212,184,132,0)' },
  animate: {
    boxShadow: [
      '0 0 0 0 rgba(212,184,132,0)',
      '0 0 0 2px rgba(212,184,132,0.8), 0 0 24px rgba(212,184,132,0.5)',
      '0 0 0 0 rgba(212,184,132,0)',
      '0 0 0 2px rgba(212,184,132,0.8), 0 0 24px rgba(212,184,132,0.5)',
      '0 0 0 0 rgba(212,184,132,0)',
      '0 0 0 2px rgba(212,184,132,0.6), 0 0 16px rgba(212,184,132,0.4)',
      '0 0 0 0 rgba(212,184,132,0)',
    ],
    transition: { duration: 1.2, times: [0, 0.15, 0.3, 0.5, 0.65, 0.8, 1] },
  },
};

/** 玫瑰色色散光晕 (大失败 0.6s) */
export const roseScatter: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: [0, 0.8, 0],
    transition: { duration: 0.6, times: [0, 0.4, 1] },
  },
};

/** 周边 8 颗粒子向四周飞散 (1.2s) */
export const particleScatter = (angle: number, distance: number): Variants => ({
  initial: { x: 0, y: 0, opacity: 1, scale: 1 },
  animate: {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    opacity: 0,
    scale: 0.4,
    transition: { duration: 1.2, ease: easing.out, times: [0, 1] },
  },
});

/** 墨水聚拢 (从四周向中心) — PM 思考浮层 */
export const inkConverge: Variants = {
  initial: (origin: { x: number; y: number }) => ({
    x: origin.x,
    y: origin.y,
    opacity: 0,
    scale: 0.4,
  }),
  animate: {
    x: 0,
    y: 0,
    opacity: [0, 0.7, 0.5, 0.6, 0.4],
    scale: 1,
    transition: { duration: 1.6, ease: easing.quill, times: [0, 0.4, 0.6, 0.8, 1] },
  },
};

/** 墨水滴答 (中心文字浮现) */
export const inkPulse: Variants = {
  initial: { opacity: 0, scale: 0.9 },
  animate: {
    opacity: [0, 1, 0.6, 1],
    scale: [0.9, 1.05, 1, 1],
    transition: { duration: 1.6, ease: easing.quill, times: [0, 0.3, 0.6, 1] },
  },
};

/** 气泡墨水扩散变体 (叙事区使用) */
export const bubbleInk: Variants = {
  initial: { clipPath: 'circle(0% at 50% 50%)', opacity: 0 },
  animate: {
    clipPath: 'circle(150% at 50% 50%)',
    opacity: 1,
    transition: { duration: 0.6, ease: easing.quill },
  },
};

/** 章节分隔卷轴 (横向揭示) */
export const dividerReveal: Variants = {
  initial: { scaleX: 0, opacity: 0 },
  animate: {
    scaleX: 1,
    opacity: 1,
    transition: { duration: 0.6, ease: easing.quill },
  },
};

/** 决策按钮 hover 顶部金色滑线 (扩展 buttonHover) */
export const goldSlide: Variants = {
  initial: { scaleX: 0, opacity: 0 },
  animate: { scaleX: 1, opacity: 1, transition: { duration: 0.3, ease: easing.out } },
};
