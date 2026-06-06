/**
 * 设计令牌 (Design Tokens) — 与 client/src/index.css 的 @theme 块同步。
 * JS 端使用：framer-motion 变体、SVG fill、JS 计算颜色。
 * 注：所有 hex 必须与 CSS 变量值完全一致。
 */

export const ink = {
  950: '#08080f',
  900: '#0d0d1f',
  850: '#10102a',
  800: '#14142a',
  700: '#1c1c38',
  600: '#2a2a4a',
  500: '#3b3b6d',
  400: '#5a5a8a',
  300: '#8a8ab0',
  200: '#c8c8d4',
  100: '#e8e8f0',
  50: '#f4f4fa',
} as const;

export const gold = {
  700: '#8a6a3a',
  600: '#b8924e',
  500: '#d4b884',
  400: '#e8d4a8',
  300: '#f4e8c8',
} as const;

export const accent = {
  indigo: { 700: '#4338ca', 500: '#6366f1', 400: '#818cf8', 300: '#a5b4fc', 200: '#c7d2fe' },
  purple: { 500: '#a855f7', 400: '#c084fc' },
  emerald: { 700: '#047857', 500: '#10b981', 400: '#34d399', 300: '#6ee7b7' },
  cyan: { 500: '#06b6d4', 400: '#22d3ee' },
  amber: { 700: '#b45309', 600: '#d97706', 500: '#f59e0b', 400: '#fbbf24', 300: '#fcd34d' },
  rose: { 500: '#f43f5e', 400: '#fb7185' },
} as const;

export const glass = {
  weak: 'rgba(18,18,30,0.4)',
  base: 'rgba(18,18,30,0.6)',
  strong: 'rgba(14,14,24,0.75)',
  gold: 'rgba(212,184,132,0.05)',
} as const;

// ============================================================
// v0.4-ui P0: gray 谱 (中性灰, 与 tailwind gray-* 同步, 视觉零变化)
// 用途: 次要文字 / 边框 / 描边 / placeholder
// ============================================================
export const gray = {
  50:  '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db',
  400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151',
  800: '#1f2937', 900: '#111827', 950: '#030712',
} as const;

// ============================================================
// v0.4-ui P0: bg 谱 (面板/容器背景, 与 tailwind slate/gray 同步)
// 用途: 浮窗/弹层背景, 进度条 track, 模态深层
// ============================================================
export const bg = {
  slate800: '#1e293b', // slate-800
  gray800:  '#1f2937', // gray-800
  slate900: '#0f172a', // slate-900
  gray700:  '#374151', // gray-700
  canvas:        '#1a1a2e', // WorldMap canvas 背景 (紫调深)
  canvasLabel:   '#1a1510', // WorldMap 文字标签底色
  white:         '#ffffff', // 纯白 (描边/player ring)
  bubblePM:        '#10211f', // NarrativeArea PM 气泡 (深绿调)
  bubbleDecision:  '#1a1a30', // NarrativeArea 决策气泡 (紫调)
  bubbleSystem:    '#11111f', // NarrativeArea 系统消息气泡
} as const;

// ============================================================
// v0.4-ui P0: alpha 变体 (8 位 hex 末 2 位 = alpha)
// 用途: 状态色背景/边框的半透明版本 (替代原 rgba())
// 名称: {baseColor}A{approxAlpha*255 hex}
// ============================================================
export const alpha = {
  indigo500A08: '#6366f114', // 0x14 ≈ 0.08
  indigo500A20: '#6366f133', // 0x33 ≈ 0.20
  indigo500A60: '#6366f199', // 0x99 ≈ 0.60
  indigo500A00: '#6366f100', // 透明
  amber500A06:  '#f59e0b0f', // 0x0f ≈ 0.06
  amber500A15:  '#f59e0b26', // 0x26 ≈ 0.15
  emerald500A50: '#10b98180', // 0x80 ≈ 0.50
  emerald500A00: '#10b98100', // 透明
  blackA30:  '#0000004d', // 0x4d ≈ 0.30
  whiteA03:  '#ffffff08', // 0x08 ≈ 0.03
  whiteA40:  '#ffffff66', // 0x66 ≈ 0.40
} as const;

export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  '2xl': 16,
  '3xl': 24,
  full: 9999,
} as const;

export const shadow = {
  // 浮窗/弹层: 轻量单层阴影, 配合 slate800 背景使用 (ItemCompareTooltip 等)
  popover: '0 4px 12px rgba(0,0,0,0.4)',
  parchment:
    'inset 0 1px 0 rgba(212,184,132,0.08), inset 0 -1px 0 rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.4)',
  'glow-gold':
    '0 0 0 1px rgba(212,184,132,0.2), 0 0 16px rgba(212,184,132,0.15), 0 0 32px rgba(212,184,132,0.08)',
  'glow-indigo':
    '0 0 0 1px rgba(99,102,241,0.3), 0 0 24px rgba(99,102,241,0.4), 0 0 48px rgba(99,102,241,0.2)',
  'glow-rose':
    '0 0 0 1px rgba(244,63,94,0.3), 0 0 24px rgba(244,63,94,0.4), 0 0 48px rgba(244,63,94,0.2)',
  'glow-emerald':
    '0 0 0 1px rgba(16,185,129,0.3), 0 0 24px rgba(16,185,129,0.4), 0 0 48px rgba(16,185,129,0.2)',
} as const;

export const duration = {
  instant: 0.1,
  fast: 0.15,
  base: 0.22,
  medium: 0.4,
  slow: 0.8,
  epic: 1.6,
} as const;

export const easing = {
  quill: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
  page: [0.4, 0, 0.2, 1] as [number, number, number, number],
  arcane: [0.68, -0.55, 0.27, 1.55] as [number, number, number, number],
  out: [0, 0, 0.2, 1] as [number, number, number, number],
  in: [0.4, 0, 1, 1] as [number, number, number, number],
  inOut: [0.4, 0, 0.2, 1] as [number, number, number, number],
} as const;
