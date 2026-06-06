/**
 * EpisodicSummarizer — PR-3
 *
 * 每轮 PM 响应后调用, 把本轮 narrative + consequences 转换为 1-3 条
 * MemoryRecord 输入, 然后写入 MemoryManager.
 *
 * 设计: 不直接调 LLM, 而是构造"摘要 prompt"让 PM 引擎下一次请求时回填.
 * 这是为了避免在已经繁忙的 PM 流中再插一个 LLM 调用.
 * PR-4 会改为: 在 PM 请求时一并调 LLM 抽取本轮要点.
 */
import type { ConsequenceData } from '../../types/game';
import type { MemoryRecordInput, MemoryScope } from '../../types/memory';
import { MemoryManager } from './MemoryManager';

export interface EpisodeInput {
  worldDay: number;
  region?: string;
  playerAction: string;
  narrative: string;
  consequences?: ConsequenceData;
  npcsInvolved?: string[];
  itemsChanged?: string[];
  locationChanged?: boolean;
}

const SUMMARIZER_PROMPT = `你是一个长期记忆压缩助手. 给定本轮游戏回合的 narrative 和 consequences, 输出 1-3 条"GM 应该长期记住"的事实.
每条 ≤ 80 字, 客观陈述 (谁做了什么/发生了什么/关系如何变化/物品去向).
对 NPC 用名称, 对物品用名称, 标注重要性 (0..1).
格式 (严格 JSON 数组, 不要任何额外文字):
[
  {"scope": "npc|item|event|player|location|lore", "entityId": "<实体id或名称>", "content": "一句话事实", "importance": 0.0}
]`;

/**
 * 构造本轮摘要 prompt 块, 注入到 PM 引擎的下一次 prompt 中
 * 让 LLM 在生成 narrative 的同时一并输出"本轮要点".
 */
export function buildSummarizerPromptSection(episode: EpisodeInput): string {
  return `## 🧠 长期记忆采集 (请在 narrative 之后用 SUMMARIES 块输出本轮要点)

[SUMMARIES]
${SUMMARIZER_PROMPT}

本轮信息:
- 玩家行动: ${episode.playerAction}
- 区域: ${episode.region || '未知'}
- 第 ${episode.worldDay} 天
- narrative: ${episode.narrative.substring(0, 800)}
${episode.npcsInvolved?.length ? `- 涉及 NPC: ${episode.npcsInvolved.join(', ')}` : ''}
${episode.itemsChanged?.length ? `- 物品变化: ${episode.itemsChanged.join(', ')}` : ''}
${episode.locationChanged ? '- 场景变更' : ''}
[/SUMMARIES]`;
}

/**
 * 解析 LLM 在 narrative 后输出的 SUMMARIES 块.
 * 容错: 找不到块/JSON 解析失败 → 返回空数组 (不抛异常, 不阻塞主流程).
 */
export function parseSummaries(narrativeWithSummaries: string): MemoryRecordInput[] {
  const match = narrativeWithSummaries.match(/\[SUMMARIES\]([\s\S]*?)\[\/SUMMARIES\]/);
  if (!match) return [];
  const body = match[1].trim();
  // 去除 prompt 模板 (只保留 LLM 实际输出)
  const jsonStart = body.indexOf('[');
  const jsonEnd = body.lastIndexOf(']');
  if (jsonStart < 0 || jsonEnd < 0) return [];
  const jsonStr = body.substring(jsonStart, jsonEnd + 1);
  try {
    const parsed = JSON.parse(jsonStr) as Array<{
      scope: string;
      entityId: string;
      content: string;
      importance: number;
    }>;
    const now = Date.now();
    return parsed
      .filter((p) => p && typeof p.content === 'string' && p.content.length > 0)
      .map((p) => ({
        scope: (validScope(p.scope)),
        entityId: p.entityId || 'unknown',
        content: p.content.trim(),
        metadata: {
          worldDay: 0,  // 由调用方覆盖
          timestamp: now,
          importance: clamp01(p.importance ?? 0.5),
        },
      }));
  } catch {
    return [];
  }
}

function validScope(s: string): MemoryScope {
  const valid: MemoryScope[] = ['npc', 'item', 'event', 'player', 'location', 'lore'];
  return (valid as string[]).includes(s) ? (s as MemoryScope) : 'event';
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * 兜底: 不调 LLM, 直接从 EpisodeInput 抽取最显眼的 1 条事实.
 * 用于"摘要器失效但仍要写入一些记忆"的场景.
 */
export function fallbackSummary(episode: EpisodeInput): MemoryRecordInput[] {
  const facts: MemoryRecordInput[] = [];
  const now = Date.now();
  if (episode.npcsInvolved?.length) {
    facts.push({
      scope: 'npc',
      entityId: episode.npcsInvolved[0],
      content: `玩家在 ${episode.region || '某地'} 与 ${episode.npcsInvolved[0]} 互动`,
      metadata: { worldDay: episode.worldDay, region: episode.region, timestamp: now, importance: 0.4 },
    });
  }
  if (episode.itemsChanged?.length) {
    facts.push({
      scope: 'item',
      entityId: episode.itemsChanged[0],
      content: `物品 ${episode.itemsChanged[0]} 发生变化`,
      metadata: { worldDay: episode.worldDay, region: episode.region, timestamp: now, importance: 0.5 },
    });
  }
  if (facts.length === 0 && episode.narrative) {
    facts.push({
      scope: 'event',
      entityId: episode.region || 'world',
      content: episode.narrative.substring(0, 80),
      metadata: { worldDay: episode.worldDay, region: episode.region, timestamp: now, importance: 0.3 },
    });
  }
  return facts;
}

/**
 * 写入 memory 的便捷方法
 */
export async function commitEpisode(episode: EpisodeInput, summariesFromLLM?: string): Promise<number> {
  const inputs = summariesFromLLM
    ? parseSummaries(summariesFromLLM)
    : fallbackSummary(episode);
  if (inputs.length === 0) return 0;
  const stamped = inputs.map((i) => ({
    ...i,
    metadata: { ...i.metadata, worldDay: episode.worldDay, region: episode.region },
  }));
  await MemoryManager.add(stamped);
  return stamped.length;
}
