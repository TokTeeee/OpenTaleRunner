/**
 * 审计 P5 修复: 敏感信息过滤层
 *
 * 在日志写入 / LLM 输入 / Debug dump 之前调用, 截断 API Key、Token、密码等敏感字段.
 * 实现见 安全系统.md 2.7 与 日志系统.md "相关系统" 节.
 */
const REDACTED = '[REDACTED]';

/**
 * 字段名 → 值的过滤模式.
 * 匹配 "field": "value" 或 'field': 'value', 整个匹配替换为 "field": "[REDACTED]".
 */
const FIELD_PATTERNS: RegExp[] = [
  // "apiKey": "value"  (value 任意 8+ 字符)
  /(['"]?api[Kk]ey['"]?\s*:\s*)(['"])([^'"]{8,})(['"])/g,
  /(['"]?api[Kk]ey['"]?\s*:\s*)([^,'"\s}]+)/g,
  // "password": "value"
  /(['"]?password['"]?\s*:\s*)(['"])([^'"]{4,})(['"])/g,
  /(['"]?password['"]?\s*:\s*)([^,'"\s}]+)/g,
  // "token": "value"
  /(['"]?token['"]?\s*:\s*)(['"])([^'"]{16,})(['"])/g,
  /(['"]?token['"]?\s*:\s*)([^,'"\s}]+)/g,
  // "secret": "value"
  /(['"]?secret['"]?\s*:\s*)(['"])([^'"]{8,})(['"])/g,
  /(['"]?secret['"]?\s*:\s*)([^,'"\s}]+)/g,
];

/**
 * 值整体替换模式: 命中后整段替换为 [REDACTED].
 */
const WHOLE_VALUE_PATTERNS: RegExp[] = [
  // OpenAI / Groq / Google API Key
  /\b(sk-|gsk-|AIza)[A-Za-z0-9_-]{16,}\b/g,
  // 通用 Bearer Token
  /\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi,
  // JWT (3 段 base64, 每段 ≥ 8)
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  // 应用内部种子标识
  /\baeslan-[a-z0-9-]{8,}\b/gi,
];

/**
 * 过滤字符串中的敏感信息.
 *
 * @example
 *   redactSecrets('sk-abc1234567890xyz')             // '[REDACTED]'
 *   redactSecrets('apiKey: "sk-abc123def"')          // 'apiKey: "[REDACTED]"'
 *   redactSecrets('Bearer eyJabc.def.ghi')           // 'Bearer [REDACTED]'
 */
export function redactSecrets(input: string): string {
  if (!input) return input;
  let result = input;

  // 第一遍: 字段名:值形式, 保留字段名
  for (const pattern of FIELD_PATTERNS) {
    result = result.replace(pattern, (match, prefix, quote1, value, quote2) => {
      if (quote1 && quote2) {
        return `${prefix}${quote1}${REDACTED}${quote2}`;
      }
      // 无引号值: 整段替换
      return `${prefix}${REDACTED}`;
    });
  }

  // 第二遍: 整段值形式, 整体替换
  for (const pattern of WHOLE_VALUE_PATTERNS) {
    result = result.replace(pattern, (match) => {
      if (/^Bearer/i.test(match)) return 'Bearer [REDACTED]';
      return REDACTED;
    });
  }

  return result;
}

/**
 * 深度过滤对象中所有字符串字段. 用于日志 data / dump 整体脱敏.
 *
 * - 字段名命中 apikey/password/token/secret/seed 时, 整字段值替换为 [REDACTED]
 * - 字符串值: 调用 redactSecrets
 * - 数组/对象: 递归处理
 */
export function redactObject<T>(input: T): T {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') {
    return redactSecrets(input) as T;
  }
  if (Array.isArray(input)) {
    return input.map(item => redactObject(item)) as T;
  }
  if (typeof input === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (/apikey|password|^token$|secret|seed/i.test(key)) {
        result[key] = REDACTED;
      } else {
        result[key] = redactObject(value);
      }
    }
    return result as T;
  }
  return input;
}
