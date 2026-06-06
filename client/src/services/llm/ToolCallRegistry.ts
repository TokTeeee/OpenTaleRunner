/**
 * v0.4 战斗系统补齐 — ToolCall handler 注册表
 *
 * 全局单例. 业务模块 (战斗、剧情投票、世界事件等) 在初始化时 register() 自己的 handler,
 * PM Engine 解析到 toolcall 后通过 dispatch() 串行调用.
 *
 * 约束:
 * - handler 抛错被隔离, 不会中断后续 toolcall
 * - 不识别的 toolcall 走 warn + 跳过
 * - 同一 name 后注册覆盖前注册 (v0.4 战斗会重写 LLMAdapter 的内置 handler)
 */

import { logger } from '../../utils/logger';
import type { ToolCall, ToolCallHandler, ToolCallDispatchResult } from './ToolCall';

interface RegisteredEntry<TArgs, TContext, TResult> {
  name: string;
  handler: ToolCallHandler<TArgs, TContext, TResult>;
  description: string;
}

class ToolCallRegistry {
  private entries = new Map<string, RegisteredEntry<unknown, unknown, unknown>>();

  /** 注册 handler. 同名覆盖. */
  register<TArgs = unknown, TContext = unknown, TResult = unknown>(
    name: string,
    handler: ToolCallHandler<TArgs, TContext, TResult>,
    options: { description?: string } = {},
  ): () => void {
    this.entries.set(name, {
      name,
      handler: handler as ToolCallHandler<unknown, unknown, unknown>,
      description: options.description ?? '',
    });
    return () => this.unregister(name);
  }

  /** 注销 handler */
  unregister(name: string): boolean {
    return this.entries.delete(name);
  }

  /** 检查 handler 是否存在 */
  has(name: string): boolean {
    return this.entries.has(name);
  }

  /** 列出已注册 handler 名称 (调试用) */
  list(): string[] {
    return Array.from(this.entries.keys());
  }

  /**
   * 串行 dispatch 一组 toolcall.
   * - 任一 handler 抛错被隔离 (记 ok=false), 不中断后续
   * - 任一 handler 同步抛错不阻断异步链路
   */
  async dispatch(
    toolCalls: ToolCall[],
    context?: unknown,
  ): Promise<ToolCallDispatchResult[]> {
    const results: ToolCallDispatchResult[] = [];
    for (const tc of toolCalls) {
      const entry = this.entries.get(tc.name);
      if (!entry) {
        logger.warn('ToolCallRegistry', `unregistered toolcall "${tc.name}", skipped`);
        results.push({ toolCall: tc, ok: false, error: `unregistered toolcall: ${tc.name}` });
        continue;
      }
      try {
        const result = await entry.handler(tc.arguments, context);
        results.push({ toolCall: tc, ok: true, result });
        logger.info('ToolCallRegistry', `dispatch "${tc.name}" ok`);
      } catch (e) {
        const errMsg = (e as Error).message ?? String(e);
        logger.error('ToolCallRegistry', `dispatch "${tc.name}" failed: ${errMsg}`);
        results.push({ toolCall: tc, ok: false, error: errMsg });
      }
    }
    return results;
  }

  /** 清空 (热重置, 测试用) */
  clear(): void {
    this.entries.clear();
  }
}

/** 全局单例 */
export const toolCallRegistry = new ToolCallRegistry();
