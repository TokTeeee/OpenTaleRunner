import type { Message } from '../../types/game';
import type { LLMConfig } from '../../types/llm';
import { LLMClient } from '../llm/LLMClient';
import { estimateTokens } from './TokenBudget';

const COMPRESS_SYSTEM_PROMPT = `将以下游戏对话历史压缩为结构化的冒险日志。只保留：
1. 玩家做了什么（行动）
2. 结果是什么（成功/失败/部分成功）
3. 获得了什么（物品/信息/关系变化）
4. 位置变化

不要保留GM的文学描写和氛围描述。按时间顺序输出，格式：

世界日{N} · {区域}：
  ▶ {玩家行动} → {结果} [{后果}]`;

export class HistoryCompressor {
  compress(messages: Message[], maxTokens: number = 400): string {
    if (!messages || messages.length === 0) return '';

    let timeline = '【近期事件时间线】\n';
    let currentDay = -1;
    let tokenCount = 0;

    for (const msg of messages) {
      if (msg.type === 'divider') continue;

      const day = this.extractWorldDay(msg);
      const summary = this.summarizeMessage(msg, 60);

      const lineTokens = estimateTokens(summary);
      if (tokenCount + lineTokens > maxTokens) break;

      if (day !== currentDay) {
        timeline += `\n世界日${day}：\n`;
        currentDay = day;
      }

      if (msg.type === 'player' || msg.type === 'pm') {
        timeline += `  ${summary}\n`;
      }
      tokenCount += lineTokens;
    }

    return timeline;
  }

  async compressWithLLM(
    messages: Message[],
    llmConfig: LLMConfig,
  ): Promise<string> {
    const client = new LLMClient(llmConfig);

    const raw = messages
      .filter(m => m.type === 'player' || m.type === 'pm')
      .slice(-16)
      .map(m => `${m.type === 'player' ? '玩家' : 'GM'}: ${m.content.slice(0, 200)}`)
      .join('\n');

    const userPrompt = `【对话历史】\n${raw}\n\n请将以上对话历史压缩为结构化冒险日志：`;

    try {
      const result = await client.chat(
        COMPRESS_SYSTEM_PROMPT + '\n\n' + userPrompt,
        '',
      );
      return result;
    } catch {
      // Fallback to mode A on LLM failure
      return this.compress(messages, 500);
    }
  }

  private extractWorldDay(msg: Message): number {
    const match = msg.content.match(/世界日(\d+)/ );
    if (match) return parseInt(match[1], 10);
    return 0;
  }

  private summarizeMessage(msg: Message, maxLen: number): string {
    if (msg.type === 'player') return `▶ ${this.removeFlourish(msg.content).slice(0, maxLen)}`;
    if (msg.type === 'pm') return `  ◈ ${this.removeFlourish(msg.content).slice(0, maxLen)}`;
    return msg.content.slice(0, maxLen);
  }

  private removeFlourish(text: string): string {
    const sentences = text.split(/[。！？.!?]/ );
    const actionable = sentences.filter(s =>
      /[进入走前往后说问打拿给买卖吃喝用穿爬跳跃跑逃攻击砍刺射]/ .test(s),
    );
    if (actionable.length > 0) return actionable.join('；');
    return sentences[0] || text.slice(0, 60);
  }
}
