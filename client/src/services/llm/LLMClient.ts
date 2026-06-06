import type { LLMConfig, LLMOptions, ChatMessage } from '../../types/llm';
import { createLLMProvider, type LLMProvider } from './providers/OpenAIProvider';
import { logger } from '../../utils/logger';
import { DEFAULT_DEEPSEEK_CHAT_ENDPOINT, DEFAULT_LLM_PROVIDER, getLLMProviderDefaults } from '../../utils/providerCatalog';

export class LLMClient {
  private provider: LLMProvider;
  private config: LLMConfig;
  private maxRetries = 3;
  private retryDelay = 2000;
  private timeoutMs = 120000;

  constructor(config: LLMConfig) {
    const provider = config?.provider || DEFAULT_LLM_PROVIDER;
    const defaults = getLLMProviderDefaults(provider);
    this.config = {
      provider,
      apiKey: config?.apiKey || '',
      endpoint: config?.endpoint || defaults.endpoint || DEFAULT_DEEPSEEK_CHAT_ENDPOINT,
      // 审计 P2 修复: 移除硬编码的 DEFAULT_DEEPSEEK_LLM_MODEL 兜底. provider 无默认时 model 为空, 由调用方校验后再调用.
      model: config?.model || defaults.model || '',
      temperature: config?.temperature ?? 0.8,
      maxTokens: config?.maxTokens ?? 4096,
    };
    this.provider = createLLMProvider(this.config.provider, this.config.apiKey, this.config.endpoint, this.config.model);
  }

  updateConfig(config: LLMConfig): void {
    this.config = { ...this.config, ...config };
    this.provider = createLLMProvider(this.config.provider, this.config.apiKey, this.config.endpoint, this.config.model);
  }

  async chat(systemPrompt: string, userPrompt: string): Promise<string> {
    const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];
    if (userPrompt) messages.push({ role: 'user', content: userPrompt });
    const options: LLMOptions = { temperature: this.config.temperature, maxTokens: this.config.maxTokens, model: this.config.model };
    logger.info('LLM', `chat start — model:${options.model} promptLen:${systemPrompt.length}`);
    const t0 = Date.now();
    try {
      const result = await this.withTimeout(() => this.retry(() => this.provider.chat(messages, options)));
      logger.info('LLM', `chat done — ${Date.now() - t0}ms resultLen:${result.length}`);
      return result;
    } catch (e) {
      logger.error('LLM', `chat failed after ${Date.now() - t0}ms: ${(e as Error).message}`);
      throw e;
    }
  }

  async *streamChat(systemPrompt: string, userPrompt: string): AsyncGenerator<string> {
    const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];
    if (userPrompt) messages.push({ role: 'user', content: userPrompt });
    const options: LLMOptions = { temperature: this.config.temperature, maxTokens: this.config.maxTokens, model: this.config.model };
    yield* this.retryGen(() => this.provider.chatStream(messages, options));
  }

  abort(): void { this.provider.abort(); }

  private async retry<T>(fn: () => Promise<T>): Promise<T> {
    for (let i = 1; i <= this.maxRetries; i++) {
      try { return await fn(); }
      catch (err) { if (i === this.maxRetries) throw err; await new Promise(r => setTimeout(r, this.retryDelay * i)); }
    }
    throw new Error('Max retries');
  }

  private async withTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`LLM timeout (${this.timeoutMs / 1000}s)`)), this.timeoutMs)),
    ]);
  }

  private async *retryGen<T>(fn: () => AsyncGenerator<T>): AsyncGenerator<T> {
    for (let i = 1; i <= this.maxRetries; i++) {
      try { yield* fn(); return; }
      catch (err) { if (i === this.maxRetries) throw err; await new Promise(r => setTimeout(r, this.retryDelay * i)); }
    }
  }
}
