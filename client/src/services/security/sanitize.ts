/**
 * 输入安全工具 — XSS 过滤 + Prompt 注入防护
 */
import DOMPurify from 'dompurify';

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'br', 'p', 'ul', 'ol', 'li', 'span'],
    ALLOWED_ATTR: ['class'],
  });
}

const PROMPT_INJECTION_PATTERNS: Array<[RegExp, string]> = [
  [/^###\s/gm, '# # # '],
  [/^---$/gm, '- - -'],
  [/```json/gi, '` ` ` json'],
  [/```/g, '` ` `'],
  [/{[\s\n]*"action_type"/gi, '{ " action_type "'],
  [/<system>/gi, '&lt;system&gt;'],
  [/<\/system>/gi, '&lt;/system&gt;'],
  [/<instruction>/gi, '&lt;instruction&gt;'],
  [/<\/instruction>/gi, '&lt;/instruction&gt;'],
  // 审计 P5 修复: User/Assistant 角色伪装防护 (之前漏了)
  [/<user>/gi, '&lt;user&gt;'],
  [/<\/user>/gi, '&lt;/user&gt;'],
  [/<assistant>/gi, '&lt;assistant&gt;'],
  [/<\/assistant>/gi, '&lt;/assistant&gt;'],
  [/<human>/gi, '&lt;human&gt;'],
  [/<\/human>/gi, '&lt;/human&gt;'],
  [/<ai>/gi, '&lt;ai&gt;'],
  [/<\/ai>/gi, '&lt;/ai&gt;'],
  [/ignore previous instructions/gi, '[instruction redacted]'],
  [/ignore all previous/gi, '[instruction redacted]'],
];

export function sanitizePromptInput(text: string): string {
  let result = text;
  for (const [pattern, replacement] of PROMPT_INJECTION_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
