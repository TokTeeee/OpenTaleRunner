import { describe, expect, it, beforeEach, vi } from 'vitest';
import { toolCallRegistry } from '../../../src/services/llm/ToolCallRegistry';

describe('ToolCallRegistry: handler 注册与 dispatch', () => {
  beforeEach(() => {
    toolCallRegistry.clear();
  });

  it('register 后 has() 返回 true', () => {
    const handler = vi.fn();
    toolCallRegistry.register('test1', handler);
    expect(toolCallRegistry.has('test1')).toBe(true);
  });

  it('unregister 删除 handler', () => {
    toolCallRegistry.register('test2', vi.fn());
    expect(toolCallRegistry.has('test2')).toBe(true);
    toolCallRegistry.unregister('test2');
    expect(toolCallRegistry.has('test2')).toBe(false);
  });

  it('同名 register 覆盖前一个', () => {
    const h1 = vi.fn().mockReturnValue('first');
    const h2 = vi.fn().mockReturnValue('second');
    toolCallRegistry.register('test3', h1);
    toolCallRegistry.register('test3', h2);
    expect(toolCallRegistry.list().filter(n => n === 'test3')).toHaveLength(1);
  });

  it('dispatch 调用 handler 传入 arguments + context', async () => {
    const handler = vi.fn().mockReturnValue('result');
    toolCallRegistry.register('test4', handler, { description: 'test handler' });
    const ctx = { character: 'c1' };
    const results = await toolCallRegistry.dispatch([{ name: 'test4', arguments: { x: 1 } }], ctx);
    expect(handler).toHaveBeenCalledWith({ x: 1 }, ctx);
    expect(results[0]).toMatchObject({ ok: true, result: 'result' });
  });

  it('未注册的 toolcall 走 ok=false + error, 不抛错', async () => {
    const results = await toolCallRegistry.dispatch([{ name: 'unknown', arguments: {} }]);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    expect(results[0].error).toContain('unregistered');
  });

  it('handler 抛错被隔离, 后续 toolcall 仍执行', async () => {
    const throwing = vi.fn().mockImplementation(() => { throw new Error('boom'); });
    const ok = vi.fn().mockReturnValue('ok');
    toolCallRegistry.register('throws', throwing);
    toolCallRegistry.register('ok', ok);
    const results = await toolCallRegistry.dispatch([
      { name: 'throws', arguments: {} },
      { name: 'ok', arguments: {} },
    ]);
    expect(results[0].ok).toBe(false);
    expect(results[0].error).toBe('boom');
    expect(results[1].ok).toBe(true);
    expect(results[1].result).toBe('ok');
  });

  it('async handler 正确 await', async () => {
    const asyncHandler = vi.fn().mockResolvedValue('async-result');
    toolCallRegistry.register('async', asyncHandler);
    const results = await toolCallRegistry.dispatch([{ name: 'async', arguments: {} }]);
    expect(results[0].result).toBe('async-result');
  });

  it('register 返回的取消函数 unregister 该 handler', () => {
    const unregister = toolCallRegistry.register('test5', vi.fn());
    expect(toolCallRegistry.has('test5')).toBe(true);
    unregister();
    expect(toolCallRegistry.has('test5')).toBe(false);
  });

  it('list 返回所有已注册 handler 名称', () => {
    toolCallRegistry.register('a', vi.fn());
    toolCallRegistry.register('b', vi.fn());
    toolCallRegistry.register('c', vi.fn());
    const list = toolCallRegistry.list();
    expect(list).toContain('a');
    expect(list).toContain('b');
    expect(list).toContain('c');
  });
});
