export function parseTimeElapsed(input: string): number {
  if (!input) return 0;
  const lower = input.toLowerCase();
  let total = 0;
  // 支持多段: "2小时15分钟" / "1天3小时" / "30秒"
  const dayMatch = lower.match(/(\d+(?:\.\d+)?)\s*(天|day|d)/);
  const hourMatch = lower.match(/(\d+(?:\.\d+)?)\s*(小时|hour|h|hr)/);
  const minMatch = lower.match(/(\d+(?:\.\d+)?)\s*(分钟|分|min|m)/);
  const secMatch = lower.match(/(\d+(?:\.\d+)?)\s*(秒|second|sec|s)/);
  if (dayMatch) total += parseFloat(dayMatch[1]) * 24;
  if (hourMatch) total += parseFloat(hourMatch[1]);
  if (minMatch) total += parseFloat(minMatch[1]) / 60;
  if (secMatch) total += parseFloat(secMatch[1]) / 3600;
  if (total === 0) {
    // 纯数字 + 时间量词, 兜底
    const anyMatch = lower.match(/(\d+(?:\.\d+)?)/);
    if (anyMatch) total = parseFloat(anyMatch[1]) / 60; // 默认当分钟
  }
  return Math.max(0, Math.min(total, 24 * 30));
}

/**
 * 解析绝对时间设定: "20:00" / "20:30:15" / "第3天 20:00" / "20:00 第3天" / "08:00"
 * 返回 { day?: number; clock: number; } day 缺省表示沿用当前 day
 */
export interface AbsoluteTimeTarget { day?: number; clock: number; }

export function parseAbsoluteTime(input: string, currentDay: number, currentClock: number): AbsoluteTimeTarget | null {
  if (!input) return null;
  const trimmed = input.trim();
  // 1) 提取日期: "第3天" / "第 3 天" / "day 3" / "3rd day" / 开头数字+天
  let day: number | undefined;
  const dayMatch = trimmed.match(/第\s*(\d+)\s*天/) || trimmed.match(/(\d+)\s*(?:rd|st|nd|th)?\s*day/i);
  if (dayMatch) {
    day = parseInt(dayMatch[1], 10);
    if (!Number.isFinite(day) || day < 1) day = undefined;
  }
  // 2) 提取 HH:MM 或 HH:MM:SS
  const clockMatch = trimmed.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  let clock: number;
  if (clockMatch) {
    const h = parseInt(clockMatch[1], 10);
    const m = parseInt(clockMatch[2], 10);
    if (!Number.isFinite(h) || h < 0 || h > 23 || m < 0 || m > 59) return null;
    clock = h + m / 60;
  } else {
    // 纯数字兜底: 视为小时
    const anyMatch = trimmed.match(/(\d{1,2})/);
    if (!anyMatch) return null;
    const h = parseInt(anyMatch[1], 10);
    if (h < 0 || h > 23) return null;
    clock = h;
  }
  // 3) day 缺省时, 跟当前 day 比, 如果 clock < currentClock 则跨天+1
  if (day == null) {
    day = currentDay;
    if (clock + 1e-6 < currentClock) day += 1;
  }
  return { day, clock };
}
