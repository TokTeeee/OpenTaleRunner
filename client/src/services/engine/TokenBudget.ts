export type AllocationMode = 'full' | 'slim' | 'defer_to_query';

export interface TokenBudgetConfig {
  modelContextWindow: number;
  responseReserve: number;
  maxInputTokens: number;
  safetyMargin: number;
}

export function makeBudgetConfig(
  modelContextWindow: number = 8192,
  responseReserve: number = 1024,
  safetyMargin: number = 0.9,
): TokenBudgetConfig {
  return {
    modelContextWindow,
    responseReserve,
    safetyMargin,
    maxInputTokens: Math.floor((modelContextWindow - responseReserve) * safetyMargin),
  };
}

export interface PromptComponent {
  id: string;
  priority: number;
  fullTokens: number;
  slimTokens: number;
  queryHints?: string[];
  relevanceScore: number;
  buildFull: () => string;
  buildSlim: (maxTokens: number) => string;
}

export interface ComponentAllocation {
  mode: AllocationMode;
  tokens: number;
  content: string;
  queryHints?: string[];
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  let count = 0;
  for (const ch of text) {
    count += /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch) ? 1 : 0.25;
  }
  return Math.ceil(count);
}

/**
 * 根据 token 使用比例判定预算等级。
 * 语义：
 *  - abundant: 使用率低(<40%), 上下文空间充足
 *  - moderate: 使用率中等(40%~70%), 适度紧张
 *  - tight:    使用率高(>70%), 空间告急
 */
export function determineBudgetLevel(allocated: number, maxTokens: number): 'abundant' | 'moderate' | 'tight' {
  if (maxTokens <= 0) return 'tight';
  const ratio = allocated / maxTokens;
  if (ratio > 0.7) return 'tight';
  if (ratio > 0.4) return 'moderate';
  return 'abundant';
}

export const COMPONENT_PRIORITIES: Record<string, number> = {
  gm_identity:        0,
  narrative_guide:    0,
  player_action:      0,
  dice_result:        0,
  task_instruction:   0,
  json_schema:        0,
  current_region:     0,
  character_hp_vital: 1,
  equipped_summary:   1,
  current_location:   1,
  recent_context_3:   1,
  weather_light:      1,
  character_attrs:    2,
  character_skills:   2,
  character_history:  2,
  backpack_key:       2,
  known_npcs_top5:    2,
  ghost_npcs_top3:    2,
  world_lore_full:    3,
  milestones:         3,
  chronicle_dynamic:  3,
  recent_context_all: 3,
  backpack_full:      3,
  region_events:      3,
  faction_details:    3,
};

export const COMPONENT_QUERY_HINTS: Record<string, string[]> = {
  backpack_full:     ['inventory_search(keyword) — 搜索背包中的物品'],
  backpack_key:      ['inventory_search(keyword) — 搜索背包中重要物品的详细信息'],
  known_npcs_top5:   ['npc_lookup(name, region?) — 查找已知 NPC 详情'],
  ghost_npcs_top3:   ['npc_lookup(name, region?) — 查找附近冒险者'],
  faction_details:   ['world_lore(topic) — 查询区域派系信息'],
  region_events:     ['recent_events(count?) — 查询近期区域事件'],
  character_state:   ['character_state(aspects?) — 查询角色 HP/体力/属性'],
  character_skills:  ['skill_check(keyword) — 查询角色技能详情'],
  world_chronicle:   ['recent_events(count?) — 查询世界编年史'],
  milestones:         ['world_lore(topic) — 查询世界主线进展'],
  world_lore_full:    ['world_lore(topic) — 查询世界观特定主题'],
  character_history:  ['recent_events(count?) — 查询角色近期经历'],
};

export class TokenBudget {
  private components: PromptComponent[] = [];
  private config: TokenBudgetConfig;

  constructor(config?: Partial<TokenBudgetConfig>) {
    this.config = makeBudgetConfig(
      config?.modelContextWindow,
      config?.responseReserve,
      config?.safetyMargin,
    );
  }

  register(component: PromptComponent): void {
    this.components.push(component);
  }

  registerBatch(components: PromptComponent[]): void {
    this.components.push(...components);
  }

  allocate(): Map<string, ComponentAllocation> {
    const allocation = new Map<string, ComponentAllocation>();
    const maxInputTokens = this.config.maxInputTokens;
    let remaining = maxInputTokens;

    const sorted = [...this.components].sort((a, b) => a.priority - b.priority);

    for (const comp of sorted.filter(c => c.priority === 0)) {
      const content = comp.buildFull();
      const tokens = estimateTokens(content);
      allocation.set(comp.id, { mode: 'full', tokens, content, queryHints: comp.queryHints });
      remaining -= tokens;
    }

    for (let priority = 1; priority <= 3; priority++) {
      const tier = sorted.filter(c => c.priority === priority);
      tier.sort((a, b) => (b.relevanceScore / Math.max(b.fullTokens, 1)) - (a.relevanceScore / Math.max(a.fullTokens, 1)));

      for (const comp of tier) {
        if (remaining <= 0) {
          allocation.set(comp.id, {
            mode: 'defer_to_query', tokens: 0, content: '',
            queryHints: comp.queryHints,
          });
          continue;
        }

        const fullContent = comp.buildFull();
        const fullTokens = estimateTokens(fullContent);

        if (remaining >= fullTokens) {
          allocation.set(comp.id, { mode: 'full', tokens: fullTokens, content: fullContent, queryHints: comp.queryHints });
          remaining -= fullTokens;
        } else if (comp.priority <= 2 && remaining >= comp.slimTokens) {
          const slimContent = comp.buildSlim(remaining);
          const slimTokens = estimateTokens(slimContent);
          allocation.set(comp.id, { mode: 'slim', tokens: slimTokens, content: slimContent, queryHints: comp.queryHints });
          remaining -= slimTokens;
        } else {
          allocation.set(comp.id, {
            mode: 'defer_to_query', tokens: 0, content: '',
            queryHints: comp.queryHints,
          });
        }
      }
    }

    return allocation;
  }

  hasDeferredQueries(allocation: Map<string, ComponentAllocation>): boolean {
    for (const alloc of allocation.values()) {
      if (alloc.mode === 'defer_to_query') return true;
    }
    return false;
  }

  buildQueryHintText(allocation: Map<string, ComponentAllocation>): string {
    const hints: string[] = [];
    for (const alloc of allocation.values()) {
      if (alloc.mode === 'defer_to_query' && alloc.queryHints) {
        hints.push(...alloc.queryHints);
      }
    }
    if (hints.length === 0) return '';
    return '\n【可查询的额外数据 — 以下信息未在上下文中提供，如需请主动查询】\n'
      + [...new Set(hints)].map(h => `- ${h}`).join('\n') + '\n';
  }

  getBudgetLevel(allocation: Map<string, ComponentAllocation>): 'abundant' | 'moderate' | 'tight' {
    let usedTokens = 0;
    for (const alloc of allocation.values()) {
      usedTokens += alloc.tokens;
    }
    return determineBudgetLevel(usedTokens, this.config.maxInputTokens);
  }

  getMaxInputTokens(): number {
    return this.config.maxInputTokens;
  }

  clear(): void {
    this.components = [];
  }
}
