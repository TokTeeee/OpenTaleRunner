import { LogLevel, LogCategory, ALL_CATEGORIES, DEFAULT_LOGGER_CONFIG } from './types';
import { writeBatch, purgeOldest, dumpAll, clearAll } from './LogIndexedDB';
import type { LogEntry, LoggerConfig } from './types';
import { redactSecrets, redactObject } from '../security/redactSecrets';

const LEVEL_LABELS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: '#7f8c8d',
  [LogLevel.INFO]: '#2ecc71',
  [LogLevel.WARN]: '#f39c12',
  [LogLevel.ERROR]: '#e74c3c',
};

class ClientLogger {
  private buffer: LogEntry[] = [];
  private config: LoggerConfig = { ...DEFAULT_LOGGER_CONFIG };
  private readonly MAX_BUFFER = 200;

  isEnabled(): boolean {
    return this.config.enabled;
  }

  setConfig(partial: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  getConfig(): Readonly<LoggerConfig> {
    return this.config;
  }

  private shouldLog(level: LogLevel, category: LogCategory): boolean {
    if (!this.config.enabled) return false;
    if (level < this.config.level) return false;
    if (!this.config.categories.includes(category) && category !== LogCategory.ERROR) return false;
    return true;
  }

  private createEntry(level: LogLevel, category: LogCategory, tag: string, message: string, data?: unknown): LogEntry {
    return {
      timestamp: Date.now(),
      level,
      category,
      tag,
      message: redactSecrets(message),
      data: redactObject(data),
    };
  }

  private emit(entry: LogEntry): void {
    const label = LEVEL_LABELS[entry.level];
    const color = LEVEL_COLORS[entry.level];
    const prefix = `[${label}][${entry.category}][${entry.tag}]`;

    const consoleMethod = entry.level >= LogLevel.ERROR ? 'error'
      : entry.level >= LogLevel.WARN ? 'warn'
      : entry.level >= LogLevel.INFO ? 'info'
      : 'debug';

    if (entry.data !== undefined) {
      console[consoleMethod as 'error'](
        `%c${prefix} %c${entry.message}`,
        `color:${color};font-weight:bold`,
        '',
        entry.data,
      );
    } else {
      console[consoleMethod as 'error'](
        `%c${prefix} %c${entry.message}`,
        `color:${color};font-weight:bold`,
        '',
      );
    }

    this.buffer.push(entry);
    if (this.buffer.length > this.MAX_BUFFER) {
      this.buffer = this.buffer.slice(-this.MAX_BUFFER);
    }

    if (this.config.persistToIndexedDB) {
      writeBatch([entry]).then(() => {
        purgeOldest(this.config).catch(() => {});
      }).catch(() => {});
    }
  }

  debug(category: LogCategory, tag: string, message: string, data?: unknown): void {
    if (!this.shouldLog(LogLevel.DEBUG, category)) return;
    this.emit(this.createEntry(LogLevel.DEBUG, category, tag, message, data));
  }

  info(category: LogCategory, tag: string, message: string, data?: unknown): void {
    if (!this.shouldLog(LogLevel.INFO, category)) return;
    this.emit(this.createEntry(LogLevel.INFO, category, tag, message, data));
  }

  warn(category: LogCategory, tag: string, message: string, data?: unknown): void {
    if (!this.shouldLog(LogLevel.WARN, category)) return;
    this.emit(this.createEntry(LogLevel.WARN, category, tag, message, data));
  }

  error(category: LogCategory, tag: string, message: string, data?: unknown): void {
    this.emit(this.createEntry(LogLevel.ERROR, category, tag, message, data));
  }

  getBuffer(): LogEntry[] {
    return [...this.buffer];
  }

  async dump(): Promise<LogEntry[]> {
    if (this.config.persistToIndexedDB) {
      const stored = await dumpAll();
      return [...stored, ...this.buffer];
    }
    return this.getBuffer();
  }

  async clear(): Promise<void> {
    this.buffer = [];
    await clearAll();
  }

  async export(format: 'json' | 'csv' = 'json'): Promise<string> {
    const all = await this.dump();
    if (format === 'csv') {
      const header = 'timestamp,level,category,tag,message';
      const rows = all.map((e) =>
        `${e.timestamp},${LEVEL_LABELS[e.level]},${e.category},${e.tag},"${e.message.replace(/"/g, '""')}"`,
      );
      return [header, ...rows].join('\n');
    }
    return JSON.stringify(all, null, 2);
  }
}

export const clientLogger = new ClientLogger();

if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__aeslanDebug = (enabled?: boolean) => {
    const current = clientLogger.getConfig();
    if (enabled === undefined) {
      clientLogger.setConfig({ enabled: !current.enabled });
    } else {
      clientLogger.setConfig({
        enabled,
        level: enabled ? LogLevel.DEBUG : LogLevel.INFO,
        categories: enabled ? ALL_CATEGORIES : [LogCategory.SYSTEM, LogCategory.ERROR],
        persistToIndexedDB: enabled,
      });
    }
    const updated = clientLogger.getConfig();
    console.log(
      `%c[Aeslan Logs] %c${updated.enabled ? 'ON' : 'OFF'} %clevel=${LEVEL_LABELS[updated.level]} persist=${updated.persistToIndexedDB}`,
      'font-weight:bold',
      updated.enabled ? 'color:#2ecc71' : 'color:#e74c3c',
      '',
    );
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__aeslanExportLogs = async (format: 'json' | 'csv' = 'json') => {
    const content = await clientLogger.export(format);
    const ext = format === 'csv' ? 'csv' : 'json';
    const mime = format === 'csv' ? 'text/csv' : 'application/json';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aeslan-logs-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    console.log(`%c[Aeslan Logs] %cExported ${content.length} bytes as ${a.download}`, 'font-weight:bold', '');
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__aeslanClearLogs = async () => {
    await clientLogger.clear();
    console.log('%c[Aeslan Logs] %cCleared all logs', 'font-weight:bold', '');
  };

  clientLogger.info(LogCategory.SYSTEM, 'init', 'ClientLogger ready. Use __aeslanDebug(true) to enable debug mode.');
}
