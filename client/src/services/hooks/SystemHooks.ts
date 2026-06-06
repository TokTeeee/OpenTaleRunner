/** 游戏钩子系统 — 解耦联动基础设施。各系统暴露钩子命名空间，规则通过钩子订阅。 */
import type { HookHandler, HookEntry, HookContext } from '../../types/hooks';

type ErrorCallback = (namespace: string, id: string, err: unknown) => void;

class SystemHooks {
  private hooks = new Map<string, HookEntry<unknown>[]>();
  private _onError: ErrorCallback | null = null;

  /** 设置全局错误回调 */
  onError(fn: ErrorCallback): void {
    this._onError = fn;
  }

  /**
   * 注册钩子。返回取消注册的函数。
   * 如果命名空间不存在则自动创建。
   */
  add<T>(namespace: string, handler: HookHandler<T>, options: {
    id: string;
    priority?: number;
    description?: string;
  }): () => void {
    const entry: HookEntry<T> = {
      id: options.id,
      handler,
      priority: options.priority ?? 10,
      description: options.description ?? '',
      enabled: true,
    };

    if (!this.hooks.has(namespace)) {
      this.hooks.set(namespace, []);
    }
    this.hooks.get(namespace)!.push(entry as HookEntry<unknown>);
    this.hooks.get(namespace)!.sort((a, b) => b.priority - a.priority);

    return () => this.remove(namespace, options.id);
  }

  /**
   * 移除钩子
   */
  remove(namespace: string, id: string): void {
    const list = this.hooks.get(namespace);
    if (!list) return;
    const idx = list.findIndex(e => e.id === id);
    if (idx >= 0) list.splice(idx, 1);
  }

  /**
   * 热替换：原地替换 handler，保留优先级和状态。不存在则新增。
   */
  replace<T>(namespace: string, handler: HookHandler<T>, options: {
    id: string;
    priority?: number;
    description?: string;
  }): void {
    const list = this.hooks.get(namespace);
    if (list) {
      const idx = list.findIndex(e => e.id === options.id);
      if (idx >= 0) {
        list[idx] = {
          ...list[idx],
          handler: handler as HookHandler<unknown>,
          priority: options.priority ?? list[idx].priority,
          description: options.description ?? list[idx].description,
        };
        list.sort((a, b) => b.priority - a.priority);
        return;
      }
    }
    this.add(namespace, handler, options);
  }

  /**
   * 启用/禁用钩子（不删除，可重新启用）
   */
  setEnabled(namespace: string, id: string, enabled: boolean): void {
    const list = this.hooks.get(namespace);
    if (!list) return;
    const entry = list.find(e => e.id === id);
    if (entry) entry.enabled = enabled;
  }

  /**
   * 应用钩子链：按优先级依次执行，每个钩子接收上一个的输出。
   * 任何 handler 异常被隔离捕获，不中断后续钩子。
   */
  apply<T>(namespace: string, data: T, context: HookContext): T {
    const list = this.hooks.get(namespace);
    if (!list || list.length === 0) return data;

    let aborted = false;
    const ctx: HookContext = {
      ...context,
      namespace,
      abort: () => { aborted = true; },
    };

    let current = data;
    for (const entry of list) {
      if (!entry.enabled) continue;
      if (aborted) break;
      try {
        current = entry.handler(current, ctx) as T;
      } catch (err) {
        if (this._onError) {
          this._onError(namespace, entry.id, err);
        }
      }
    }

    return current;
  }

  /**
   * 检查命名空间是否存在
   */
  has(namespace: string): boolean {
    return this.hooks.has(namespace);
  }

  /**
   * 列出某个命名空间的所有钩子
   */
  list(namespace: string): HookEntry[] {
    return [...(this.hooks.get(namespace) || [])] as HookEntry[];
  }

  /**
   * 列出所有已注册的命名空间
   */
  getNamespaces(): string[] {
    return Array.from(this.hooks.keys());
  }

  /**
   * 获取完整钩子注册表快照（调试用）
   */
  dump(): Record<string, Array<{ id: string; priority: number; enabled: boolean; desc: string }>> {
    const result: Record<string, Array<{ id: string; priority: number; enabled: boolean; desc: string }>> = {};
    for (const [ns, entries] of this.hooks) {
      result[ns] = entries.map(e => ({
        id: e.id, priority: e.priority, enabled: e.enabled, desc: e.description,
      }));
    }
    return result;
  }

  /**
   * 清空所有钩子（热重置）
   */
  reset(): void {
    this.hooks.clear();
  }
}

/** 全局单例 */
export const systemHooks = new SystemHooks();
