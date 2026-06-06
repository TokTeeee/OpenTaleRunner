// 客户端日志 — 内存缓冲区 + localStorage持久化 + 控制台
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry { ts: string; level: LogLevel; tag: string; msg: string; }

const LS_KEY = 'aeslan_logs';
const MAX = 500;

function loadBuffer(): LogEntry[] {
  try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}
function saveBuffer(buf: LogEntry[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(buf.slice(-MAX))); } catch { /* quota or disabled storage — drop silently */ }
}

const buffer: LogEntry[] = loadBuffer();

function log(level: LogLevel, tag: string, msg: string, ...args: unknown[]) {
  const full = args.length ? msg + ' ' + args.map(a => JSON.stringify(a)).join(' ') : msg;
  const entry: LogEntry = { ts: new Date().toISOString(), level, tag, msg: full };
  buffer.push(entry);
  saveBuffer(buffer);
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(`[${tag}]`, full);
}

export const logger = {
  debug: (tag: string, msg: string, ...args: unknown[]) => log('debug', tag, msg, ...args),
  info: (tag: string, msg: string, ...args: unknown[]) => log('info', tag, msg, ...args),
  warn: (tag: string, msg: string, ...args: unknown[]) => log('warn', tag, msg, ...args),
  error: (tag: string, msg: string, ...args: unknown[]) => log('error', tag, msg, ...args),
  getBuffer: () => [...buffer],
  dump: () => buffer.map(e => `[${e.ts.slice(11,19)}] ${e.level.toUpperCase()} [${e.tag}] ${e.msg}`).join('\n'),
  clear: () => { buffer.length = 0; saveBuffer([]); },
};

// Expose for DevTools
if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__aeslanLogs = logger;
