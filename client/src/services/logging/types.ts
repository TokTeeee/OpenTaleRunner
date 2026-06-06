export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export const LogCategory = {
  GM: 'GM',
  HTTP: 'HTTP',
  TOOL: 'TOOL',
  PM: 'PM',
  STORE: 'STORE',
  TTS: 'TTS',
  IMAGE: 'IMAGE',
  GAME: 'GAME',
  MULTI: 'MULTI',
  SYNC: 'SYNC',
  SYSTEM: 'SYSTEM',
  ERROR: 'ERROR',
} as const;

export type LogCategory = (typeof LogCategory)[keyof typeof LogCategory];

export interface LogEntry {
  id?: number;
  timestamp: number;
  level: LogLevel;
  category: LogCategory;
  tag: string;
  message: string;
  data?: unknown;
}

export interface LoggerConfig {
  enabled: boolean;
  level: LogLevel;
  categories: LogCategory[];
  persistToIndexedDB: boolean;
  maxStorageMB: number;
}

export const DEFAULT_LOGGER_CONFIG: LoggerConfig = {
  enabled: false,
  level: LogLevel.INFO,
  categories: [LogCategory.SYSTEM, LogCategory.ERROR],
  persistToIndexedDB: false,
  maxStorageMB: 10,
};

export const ALL_CATEGORIES: LogCategory[] = [
  LogCategory.GM,
  LogCategory.HTTP,
  LogCategory.TOOL,
  LogCategory.PM,
  LogCategory.STORE,
  LogCategory.TTS,
  LogCategory.IMAGE,
  LogCategory.GAME,
  LogCategory.MULTI,
  LogCategory.SYNC,
  LogCategory.SYSTEM,
  LogCategory.ERROR,
];
