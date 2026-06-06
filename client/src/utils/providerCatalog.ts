import type { LLMProviderType } from '../types/llm';
import {
  DEFAULT_MIMO_CHAT_ENDPOINT,
  DEFAULT_MIMO_LLM_MODEL,
  DEFAULT_MIMO_STT_MODEL,
  DEFAULT_MIMO_TTS_MODEL,
} from './mimo';

export const DEFAULT_DEEPSEEK_CHAT_ENDPOINT = 'https://api.deepseek.com/chat/completions';
export const DEFAULT_DEEPSEEK_LLM_MODEL = 'deepseek-v4-pro';
export const DEFAULT_OPENAI_CHAT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
export const DEFAULT_OPENAI_LLM_MODEL = 'gpt-4o-mini';
export const DEFAULT_OPENAI_TTS_ENDPOINT = 'https://api.openai.com/v1/audio/speech';
export const DEFAULT_OPENAI_TTS_MODEL = 'tts-1';
export const DEFAULT_OPENAI_STT_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
export const DEFAULT_OPENAI_STT_MODEL = 'whisper-1';
export const DEFAULT_OPENAI_IMAGE_ENDPOINT = 'https://api.openai.com/v1/images/generations';
export const DEFAULT_OPENAI_IMAGE_MODEL = 'dall-e-3';

export type ConfigurableLLMProvider = Extract<LLMProviderType, 'deepseek' | 'openai' | 'mimo' | 'custom'>;
export type TTSProviderType = 'openai' | 'edge' | 'mimo' | 'custom';
// 审计 P5 修复: 移除 'deepseek' 死类型, UI 从未提供, 也无默认配置
export type STTProviderType = 'browser' | 'openai' | 'mimo' | 'custom';
export type ImageProviderType = 'openai' | 'sd' | 'custom';

type ProviderOption<T extends string> = {
  value: T;
  label: string;
};

type EndpointModelDefaults = {
  endpoint?: string;
  model?: string;
};

type TTSProviderDefaults = EndpointModelDefaults & {
  voice?: string;
};

export const DEFAULT_LLM_PROVIDER: ConfigurableLLMProvider = 'deepseek';

export const LLM_PROVIDER_OPTIONS: Array<ProviderOption<ConfigurableLLMProvider>> = [
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'mimo', label: 'Xiaomi MiMo' },
  { value: 'custom', label: '自定义 (OpenAI兼容)' },
];

export const TTS_PROVIDER_OPTIONS: Array<ProviderOption<TTSProviderType>> = [
  { value: 'openai', label: 'OpenAI TTS' },
  { value: 'mimo', label: 'Xiaomi MiMo TTS' },
  { value: 'edge', label: 'Microsoft Edge (免费)' },
  { value: 'custom', label: '自定义 (兼容接口)' },
];

// 审计 P5 修复: 简化为 STTProviderType (已移除 deepseek 死类型)
export const STT_PROVIDER_OPTIONS: Array<ProviderOption<STTProviderType>> = [
  { value: 'browser', label: '浏览器内置 (免费)' },
  { value: 'openai', label: 'OpenAI Whisper' },
  { value: 'mimo', label: 'Xiaomi MiMo 音频理解' },
  { value: 'custom', label: '自定义 (兼容接口)' },
];

export const IMAGE_PROVIDER_OPTIONS: Array<ProviderOption<ImageProviderType>> = [
  { value: 'openai', label: 'OpenAI DALL-E' },
  { value: 'sd', label: 'Stable Diffusion' },
  { value: 'custom', label: '自定义 (兼容接口)' },
];

export function getLLMProviderDefaults(provider?: LLMProviderType): EndpointModelDefaults {
  switch (provider) {
    case 'deepseek':
      return { endpoint: DEFAULT_DEEPSEEK_CHAT_ENDPOINT, model: DEFAULT_DEEPSEEK_LLM_MODEL };
    case 'openai':
      return { endpoint: DEFAULT_OPENAI_CHAT_ENDPOINT, model: DEFAULT_OPENAI_LLM_MODEL };
    case 'mimo':
      return { endpoint: DEFAULT_MIMO_CHAT_ENDPOINT, model: DEFAULT_MIMO_LLM_MODEL };
    default:
      return {};
  }
}

export function getTTSProviderDefaults(provider?: TTSProviderType): TTSProviderDefaults {
  switch (provider) {
    case 'openai':
      return { endpoint: DEFAULT_OPENAI_TTS_ENDPOINT, model: DEFAULT_OPENAI_TTS_MODEL };
    case 'mimo':
      return { endpoint: DEFAULT_MIMO_CHAT_ENDPOINT, model: DEFAULT_MIMO_TTS_MODEL, voice: 'mimo_default' };
    default:
      return {};
  }
}

export function getSTTProviderDefaults(provider?: STTProviderType): EndpointModelDefaults {
  switch (provider) {
    case 'openai':
      return { endpoint: DEFAULT_OPENAI_STT_ENDPOINT, model: DEFAULT_OPENAI_STT_MODEL };
    case 'mimo':
      return { endpoint: DEFAULT_MIMO_CHAT_ENDPOINT, model: DEFAULT_MIMO_STT_MODEL };
    default:
      return {};
  }
}

export function getImageProviderDefaults(provider?: ImageProviderType): EndpointModelDefaults {
  switch (provider) {
    case 'openai':
      return { endpoint: DEFAULT_OPENAI_IMAGE_ENDPOINT, model: DEFAULT_OPENAI_IMAGE_MODEL };
    default:
      return {};
  }
}