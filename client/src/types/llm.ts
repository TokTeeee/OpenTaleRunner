export type LLMProviderType = 'openai' | 'deepseek' | 'mimo' | 'anthropic' | 'ollama' | 'custom';

export interface LLMOptions {
  temperature: number;
  maxTokens: number;
  model: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface PromptInput {
  systemPrompt: string;
  userPrompt: string;
  messages?: ChatMessage[];
}

export interface LLMConfig {
  provider: LLMProviderType;
  apiKey: string;
  endpoint: string;
  model: string;
  temperature: number;
  maxTokens: number;
}
