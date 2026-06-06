import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TTSClient } from '../../../src/services/tts/TTSClient';
import { useSettingsStore } from '../../../src/stores/settingsStore';
import { resetClientStores } from '../../utils/resetStores';

describe('TTSClient', () => {
  beforeEach(() => {
    resetClientStores();
    useSettingsStore.setState((state) => ({
      llm: { ...state.llm, apiKey: 'llm-key' },
      tts: {
        ...state.tts,
        provider: 'openai',
        apiKey: 'tts-key',
        endpoint: 'https://tts.test/v1/audio/speech',
        model: 'gpt-4o-mini-tts',
        voice: 'alloy',
        speed: 1,
      },
    }));
  });

  afterEach(() => {
    resetClientStores();
  });

  it('applies npc voice overrides when the override provider matches the active tts provider', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['audio'], { type: 'audio/mpeg' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new TTSClient({ voice: 'nova', speed: 1.25, provider: 'openai' });
    await client.generateAudioBlob('测试台词');

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.voice).toBe('nova');
    expect(body.speed).toBe(1.25);
  });

  it('ignores npc voice overrides from other providers and falls back to the configured voice', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['audio'], { type: 'audio/mpeg' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new TTSClient({ voice: 'nova', speed: 1.25, provider: 'mimo' });
    await client.generateAudioBlob('测试台词');

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.voice).toBe('alloy');
    expect(body.speed).toBe(1.25);
  });
});