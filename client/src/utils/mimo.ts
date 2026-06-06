import type { ChatMessage, LLMOptions } from '../types/llm';

export const DEFAULT_MIMO_CHAT_ENDPOINT = 'https://api.xiaomimimo.com/v1/chat/completions';
export const DEFAULT_MIMO_LLM_MODEL = 'mimo-v2.5';
export const DEFAULT_MIMO_TTS_MODEL = 'mimo-v2.5-tts';
export const DEFAULT_MIMO_STT_MODEL = 'mimo-v2.5';

type ChatCompletionMessage = {
  content?: string;
  reasoning_content?: string;
  final_text_preview?: string;
  audio?: { data?: string } | null;
};

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function extractChatCompletionMessage(payload: unknown): ChatCompletionMessage | null {
  return (payload as { choices?: Array<{ message?: ChatCompletionMessage }> })?.choices?.[0]?.message ?? null;
}

function getTranscriptionPrompt(language: string): string {
  if (language.toLowerCase().startsWith('zh')) {
    return '请逐字转写这段音频中的语音内容，只返回识别文本，不要添加解释、说话人标签或额外格式。';
  }

  return 'Transcribe the spoken audio verbatim. Return only the transcript text with no explanation, speaker labels, or extra formatting.';
}

export function isMimoProvider(provider?: string): boolean {
  return provider === 'mimo';
}

export function isMimoEndpoint(endpoint?: string): boolean {
  return typeof endpoint === 'string' && /api\.xiaomimimo\.com/i.test(endpoint);
}

export function isMimoModel(model?: string): boolean {
  return typeof model === 'string' && model.trim().toLowerCase().startsWith('mimo-');
}

export function shouldUseMimoChatAPI(provider?: string, endpoint?: string, model?: string): boolean {
  return isMimoProvider(provider) || isMimoEndpoint(endpoint) || isMimoModel(model);
}

export function buildMimoLLMRequest(messages: ChatMessage[], options: LLMOptions, extra?: { stream?: boolean }) {
  return {
    model: options.model || DEFAULT_MIMO_LLM_MODEL,
    messages,
    temperature: options.temperature,
    max_completion_tokens: options.maxTokens,
    stream: extra?.stream ?? false,
    thinking: { type: 'disabled' as const },
  };
}

export function buildMimoTTSRequest(text: string, config: { model?: string; voice?: string; stylePrompt?: string; format?: 'wav' | 'mp3' | 'pcm' | 'pcm16' }) {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  if (config.stylePrompt?.trim()) {
    messages.push({ role: 'user', content: config.stylePrompt.trim() });
  }

  messages.push({ role: 'assistant', content: text });

  return {
    model: config.model || DEFAULT_MIMO_TTS_MODEL,
    messages,
    audio: {
      format: config.format || 'wav',
      voice: config.voice || 'mimo_default',
    },
  };
}

export async function buildMimoTranscriptionRequest(audioBlob: Blob, config: { model?: string; language?: string }) {
  const audioDataUrl = await blobToDataURL(audioBlob);

  return {
    model: config.model || DEFAULT_MIMO_STT_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'input_audio',
            input_audio: {
              data: audioDataUrl,
            },
          },
          {
            type: 'text',
            text: getTranscriptionPrompt(config.language || 'zh-CN'),
          },
        ],
      },
    ],
    max_completion_tokens: 512,
    thinking: { type: 'disabled' as const },
  };
}

export function extractChatResponseText(payload: unknown, options?: { allowReasoningFallback?: boolean }): string {
  const message = extractChatCompletionMessage(payload);
  const content = normalizeText(message?.content);
  const finalPreview = normalizeText(message?.final_text_preview);

  if (content) return content;
  if (finalPreview) return finalPreview;
  if (options?.allowReasoningFallback) return normalizeText(message?.reasoning_content);
  return '';
}

export function extractChatAudioBase64(payload: unknown): string {
  const message = extractChatCompletionMessage(payload);
  return normalizeText(message?.audio && typeof message.audio === 'object' ? message.audio.data : '');
}

export function base64AudioToBlob(base64Audio: string, format: 'wav' | 'mp3' | 'pcm' | 'pcm16' = 'wav'): Blob {
  const normalizedBase64 = base64Audio.replace(/^data:.*;base64,/, '');
  const binary = atob(normalizedBase64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const mimeType = format === 'mp3'
    ? 'audio/mpeg'
    : format === 'pcm' || format === 'pcm16'
      ? 'audio/L16'
      : 'audio/wav';

  return new Blob([bytes], { type: mimeType });
}

export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob as data URL'));
    reader.readAsDataURL(blob);
  });
}