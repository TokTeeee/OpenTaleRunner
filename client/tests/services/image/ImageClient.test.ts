import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageClient } from '../../../src/services/image/ImageClient';
import { useSettingsStore } from '../../../src/stores/settingsStore';
import { resetClientStores } from '../../utils/resetStores';

function disableIndexedDBCache(): void {
  (globalThis as unknown as { indexedDB: undefined }).indexedDB = undefined;
}

describe('ImageClient — 请求构造 + 缓存 smoke (B3.4)', () => {
  beforeEach(() => {
    resetClientStores();
    disableIndexedDBCache();
    useSettingsStore.setState((state) => ({
      ...state,
      llm: { ...state.llm, apiKey: 'llm-fallback' },
      imageGen: {
        provider: 'openai',
        apiKey: 'img-key',
        endpoint: 'https://image.test/v1/images/generations',
        model: 'dall-e-3',
        size: '1024x1024',
        quality: 'standard',
      },
    }));
  });

  afterEach(() => {
    resetClientStores();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('初始化使用 settingsStore.imageGen 配置', () => {
    const client = new ImageClient();
    expect(client).toBeInstanceOf(ImageClient);
  });

  it('构造 OpenAI 风格的请求体：含 model/prompt/n/size/quality/response_format', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ b64_json: 'QUJDRA==' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new ImageClient();
    const result = await client.generate('a dark forest at night', 'cache-key-1');

    expect(result).toBe('data:image/png;base64,QUJDRA==');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://image.test/v1/images/generations');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer img-key');
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('dall-e-3');
    expect(body.prompt).toBe('a dark forest at night');
    expect(body.n).toBe(1);
    expect(body.size).toBe('1024x1024');
    expect(body.quality).toBe('standard');
    expect(body.response_format).toBe('b64_json');
  });

  it('dall-e-3 之外不发送 quality 字段', async () => {
    useSettingsStore.setState((state) => ({
      ...state,
      imageGen: { ...state.imageGen, model: 'dall-e-2' },
    }));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ b64_json: 'QUJDRA==' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new ImageClient();
    await client.generate('mountains', 'cache-key-2');

    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.model).toBe('dall-e-2');
    expect(body.quality).toBeUndefined();
  });

  it('当 imageGen.apiKey 缺失时回退到 llm.apiKey', async () => {
    useSettingsStore.setState((state) => ({
      ...state,
      llm: { ...state.llm, apiKey: 'llm-fallback' },
      imageGen: { ...state.imageGen, apiKey: '' },
    }));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ b64_json: 'QUJDRA==' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new ImageClient();
    await client.generate('river', 'cache-key-3');

    const headers = (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer llm-fallback');
  });

  it('HTTP 4xx/5xx 时返回 null 而不抛错', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);

    const client = new ImageClient();
    const result = await client.generate('castle', 'cache-key-4');
    expect(result).toBeNull();
  });

  it('fetch 抛错时返回 null 而不抛错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const client = new ImageClient();
    const result = await client.generate('ship', 'cache-key-5');
    expect(result).toBeNull();
  });

  it('空响应体或 b64_json 缺失时返回 null', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{}] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new ImageClient();
    const result = await client.generate('cave', 'cache-key-6');
    expect(result).toBeNull();
  });
});
