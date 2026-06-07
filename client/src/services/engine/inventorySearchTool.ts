/**
 * v0.5.12 — inventory_search GM tool
 *
 * 让 GM 在 LLM 调用时按关键词查询角色背包/装备槽。
 * 代替一次性 inject 完整背包 (backpack_full queryHint 的 on-demand 路径).
 *
 * - 幂等: 重复 register 安全
 * - 不抛错: 不合法 payload 返回 { ok: false, reason }
 * - 副作用: 只读 characterStore, 不写任何 store
 */

import { useCharacterStore } from '../../stores/characterStore';
import { toolCallRegistry } from '../llm/ToolCallRegistry';
import { inventorySearch, type InventorySearchResult } from './QueryResolver';

export interface InventorySearchToolArgs {
  keyword: string;
  characterId?: string;
}

export interface InventorySearchToolResult {
  ok: boolean;
  reason?: string;
  results?: InventorySearchResult[];
  count?: number;
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function validateArgs(args: unknown): { ok: true; data: InventorySearchToolArgs } | { ok: false; reason: string } {
  if (!args || typeof args !== 'object') return { ok: false, reason: 'args 必须是 object' };
  const a = args as Record<string, unknown>;
  if (!isString(a.keyword)) return { ok: false, reason: 'keyword 必填非空字符串' };
  if (a.characterId != null && !isString(a.characterId)) return { ok: false, reason: 'characterId 必须是 string' };
  return {
    ok: true,
    data: {
      keyword: a.keyword,
      characterId: a.characterId as string | undefined,
    },
  };
}

async function inventorySearchHandler(args: unknown): Promise<InventorySearchToolResult> {
  const v = validateArgs(args);
  if (!v.ok) return { ok: false, reason: v.reason };

  // characterId 默认当前角色
  let characterId = v.data.characterId;
  if (!characterId) {
    const char = useCharacterStore.getState().character;
    if (!char) return { ok: false, reason: '当前无角色 (characterId 缺省且 characterStore 为空)' };
    characterId = char.characterId;
  }

  const results = inventorySearch({ keyword: v.data.keyword, characterId });
  return { ok: true, results, count: results.length };
}

let _registered = false;

/** 注册 inventory_search handler 到 ToolCallRegistry. 幂等. */
export function registerInventorySearchTool(): () => void {
  if (_registered) {
    return unregisterInventorySearchTool;
  }
  toolCallRegistry.register('inventory_search', inventorySearchHandler, {
    description: '按关键词搜索角色背包/装备槽 (大小写不敏感, 空 keyword 返回全部)',
  });
  _registered = true;
  return unregisterInventorySearchTool;
}

/** 注销. */
export function unregisterInventorySearchTool(): void {
  toolCallRegistry.unregister('inventory_search');
  _registered = false;
}

/** 检查是否已注册 (调试用). */
export function isInventorySearchToolRegistered(): boolean {
  return _registered;
}
