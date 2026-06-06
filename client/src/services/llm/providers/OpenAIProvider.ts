import type { LLMProviderType, LLMOptions, ChatMessage } from '../../../types/llm';
import { buildMimoLLMRequest, DEFAULT_MIMO_CHAT_ENDPOINT, extractChatResponseText, shouldUseMimoChatAPI } from '../../../utils/mimo';

export interface LLMProvider {
  chat(messages: ChatMessage[], options: LLMOptions): Promise<string>;
  chatStream(messages: ChatMessage[], options: LLMOptions): AsyncGenerator<string>;
  abort(): void;
}

class OpenAIProvider implements LLMProvider {
  private controller: AbortController | null = null;
  private apiKey: string;
  private endpoint: string;

  constructor(apiKey: string, endpoint: string) {
    this.apiKey = apiKey;
    this.endpoint = endpoint || 'https://api.openai.com/v1/chat/completions';
  }

  async chat(messages: ChatMessage[], options: LLMOptions): Promise<string> {
    this.controller = new AbortController();

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model || 'gpt-4o-mini',
        messages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
      }),
      signal: this.controller.signal,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const msg = data.choices[0]?.message;
    return msg?.content || msg?.reasoning_content || '';
  }

  async *chatStream(messages: ChatMessage[], options: LLMOptions): AsyncGenerator<string> {
    this.controller = new AbortController();

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model || 'gpt-4o-mini',
        messages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        stream: true,
      }),
      signal: this.controller.signal,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${err}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          const content = delta?.content || delta?.reasoning_content;
          if (content) yield content;
        } catch {
          // skip malformed lines
        }
      }
    }
  }

  abort(): void {
    this.controller?.abort();
  }
}

class CustomProvider implements LLMProvider {
  private controller: AbortController | null = null;
  private apiKey: string;
  private endpoint: string;

  constructor(apiKey: string, endpoint: string) {
    this.apiKey = apiKey;
    this.endpoint = endpoint;
  }

  async chat(messages: ChatMessage[], options: LLMOptions): Promise<string> {
    this.controller = new AbortController();
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
      }),
      signal: this.controller.signal,
    });

    if (!response.ok) {
      throw new Error(`LLM API error ${response.status}`);
    }

    const data = await response.json();
    const msg = data.choices?.[0]?.message;
    return msg?.content || msg?.reasoning_content || data.message?.content || '';
  }

  async *chatStream(messages: ChatMessage[], options: LLMOptions): AsyncGenerator<string> {
    this.controller = new AbortController();
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        stream: true,
      }),
      signal: this.controller.signal,
    });

    if (!response.ok) throw new Error(`LLM API error ${response.status}`);

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          const content = delta?.content || delta?.reasoning_content;
          if (content) yield content;
        } catch { /* skip */ }
      }
    }
  }

  abort(): void { this.controller?.abort(); }
}

class MimoProvider implements LLMProvider {
  private controller: AbortController | null = null;
  private apiKey: string;
  private endpoint: string;

  constructor(apiKey: string, endpoint: string) {
    this.apiKey = apiKey;
    this.endpoint = endpoint || DEFAULT_MIMO_CHAT_ENDPOINT;
  }

  async chat(messages: ChatMessage[], options: LLMOptions): Promise<string> {
    this.controller = new AbortController();

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(buildMimoLLMRequest(messages, options)),
      signal: this.controller.signal,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`MiMo API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    return extractChatResponseText(data);
  }

  async *chatStream(messages: ChatMessage[], options: LLMOptions): AsyncGenerator<string> {
    this.controller = new AbortController();

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(buildMimoLLMRequest(messages, options, { stream: true })),
      signal: this.controller.signal,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`MiMo API error ${response.status}: ${err}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // skip malformed lines
        }
      }
    }
  }

  abort(): void {
    this.controller?.abort();
  }
}

export function createLLMProvider(
  type: LLMProviderType,
  apiKey: string,
  endpoint: string,
  model: string,
): LLMProvider {
  if (shouldUseMimoChatAPI(type, endpoint, model)) {
    return new MimoProvider(apiKey, endpoint);
  }

  switch (type) {
    case 'openai':
    case 'deepseek':
      return new OpenAIProvider(apiKey, endpoint);
    default:
      return new CustomProvider(apiKey, endpoint);
  }
}
