/**
 * v0.4 战斗系统补齐 — toolcall 块解析器
 *
 * 从 LLM 输出中识别并提取 <tool_call>{...}</tool_call> 块.
 * 设计原则:
 * - 严格匹配 <tool_call>/</tool_call> 标签 (双下划线)
 * - JSON 块内允许嵌套大括号 (递归匹配)
 * - 损坏块 (非 JSON 或缺 name 字段) 走 warn + 跳过, 不抛错
 * - 提取后剩余文本仍可走 v0.3 parseNarrativeResponse
 */

import { logger } from '../../utils/logger';
import type { ToolCall, ParsedToolCallOutput } from './ToolCall';

const TOOL_CALL_OPEN = '<tool_call>';
const TOOL_CALL_CLOSE = '</tool_call>';

/**
 * 提取所有 <tool_call>{...}</tool_call> 块, 返回剩余 narrative + 结构化 toolcall 数组.
 */
export function parseToolCalls(raw: string): ParsedToolCallOutput {
  const toolCalls: ToolCall[] = [];
  const warnings: string[] = [];
  let narrative = raw;

  // 反复扫描, 每次取第一个匹配
  let cursor = 0;
  let safety = 0;
  const MAX_ITER = 50; // 防御性: 防止无限循环
  while (cursor < narrative.length && safety < MAX_ITER) {
    safety++;
    const startIdx = narrative.indexOf(TOOL_CALL_OPEN, cursor);
    if (startIdx < 0) break;
    const endTagIdx = narrative.indexOf(TOOL_CALL_CLOSE, startIdx);
    if (endTagIdx < 0) {
      warnings.push(`toolcall block opened at ${startIdx} but never closed`);
      break;
    }
    // 取标签之间的内容
    const content = narrative.slice(startIdx + TOOL_CALL_OPEN.length, endTagIdx).trim();

    // 找到 content 中第一个 { 的位置和匹配的 } 位置 (递归匹配)
    const jsonSlice = extractBalancedJson(content);
    if (!jsonSlice) {
      warnings.push(`toolcall block content is not valid JSON: ${content.slice(0, 80)}...`);
      cursor = endTagIdx + TOOL_CALL_CLOSE.length;
      continue;
    }

    try {
      const parsed = JSON.parse(jsonSlice);
      if (typeof parsed === 'object' && parsed !== null && typeof parsed.name === 'string') {
        const args = (parsed.arguments && typeof parsed.arguments === 'object' && parsed.arguments !== null)
          ? parsed.arguments as Record<string, unknown>
          : {};
        toolCalls.push({ name: parsed.name, arguments: args });
      } else {
        warnings.push(`toolcall parsed object missing 'name' field: ${jsonSlice.slice(0, 80)}...`);
      }
    } catch (e) {
      warnings.push(`toolcall JSON.parse failed: ${(e as Error).message}`);
    }

    // 从 narrative 中移除该 toolcall 块
    narrative = narrative.slice(0, startIdx) + narrative.slice(endTagIdx + TOOL_CALL_CLOSE.length);
    // 不递增 cursor, 因为删了一段文本, 索引要从 startIdx 重新开始
  }

  if (warnings.length > 0) {
    for (const w of warnings) {
      logger.warn('ToolCallParser', w);
    }
  }

  return { narrative: narrative.trim(), toolCalls, parseWarnings: warnings };
}

/**
 * 从 str 中提取第一个 { 开头的 balanced JSON 切片.
 * 允许嵌套; 遇到不在字符串内的 { 深度 +1, } 深度 -1; 深度归 0 时切出.
 * 如果找不到平衡切片, 返回 null.
 */
function extractBalancedJson(str: string): string | null {
  const start = str.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < str.length; i++) {
    const ch = str[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (inString) {
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return str.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * 安全地追加 narrative + toolcall 段, 用于 PMEngine 构造 narrative 响应.
 * 如果 toolcall 列表为空, 直接返回 narrative.
 */
export function buildOutputText(narrative: string, toolCalls: ToolCall[]): string {
  if (toolCalls.length === 0) return narrative;
  const blocks = toolCalls.map((tc) => `${TOOL_CALL_OPEN}${JSON.stringify(tc)}${TOOL_CALL_CLOSE}`).join('\n');
  return `${narrative}\n${blocks}`;
}
