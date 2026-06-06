import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TTSClient, TTSQueue } from '../../../src/services/tts/TTSClient';
import { useSettingsStore } from '../../../src/stores/settingsStore';
import { resetClientStores } from '../../utils/resetStores';

describe('TTSClient 初始化 + TTSQueue 行为 (B3.3)', () => {
  beforeEach(() => {
    resetClientStores();
  });

  afterEach(() => {
    resetClientStores();
    vi.clearAllMocks();
  });

  describe('TTSClient 初始化', () => {
    it('使用 settingsStore.tts 配置构造客户端', () => {
      const client = new TTSClient();
      expect(client).toBeInstanceOf(TTSClient);
    });

    it('空文本调用 speak() 不抛错且不发送请求', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const client = new TTSClient();
      await expect(client.speak('   ')).resolves.toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('edge provider 路由到 speakWithBrowser 而非 fetch', async () => {
      useSettingsStore.setState((state) => ({
        ...state,
        tts: { ...state.tts, provider: 'edge' },
      }));
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const client = new TTSClient();
      const speakWithBrowserSpy = vi
        .spyOn(client as unknown as { speakWithBrowser: () => Promise<void> }, 'speakWithBrowser')
        .mockResolvedValue(undefined);
      await client.speak('hello');
      expect(speakWithBrowserSpy).toHaveBeenCalledWith('hello');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('TTSQueue 行为', () => {
    function makeStubClient(): TTSClient {
      return {
        speak: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn(),
      } as unknown as TTSClient;
    }

    it('enqueue() 在播放空闲时立即触发 speak', async () => {
      const client = makeStubClient();
      const queue = new TTSQueue(client);

      const onStart = vi.fn();
      const onEnd = vi.fn();
      queue.enqueue('hello', onStart, onEnd);

      await new Promise((r) => setTimeout(r, 10));
      expect((client.speak as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('hello');
      expect(onStart).toHaveBeenCalled();
      expect(onEnd).toHaveBeenCalled();
      expect(queue.isPlaying).toBe(false);
    });

    it('多条入队时按 FIFO 顺序串行播放', async () => {
      const speakOrder: string[] = [];
      const client = {
        speak: vi.fn((text: string) => {
          speakOrder.push(text);
          return Promise.resolve();
        }),
        stop: vi.fn(),
      } as unknown as TTSClient;
      const queue = new TTSQueue(client);

      queue.enqueue('第一句');
      queue.enqueue('第二句');
      queue.enqueue('第三句');

      await new Promise((r) => setTimeout(r, 30));
      expect(speakOrder).toEqual(['第一句', '第二句', '第三句']);
      expect(queue.isPlaying).toBe(false);
    });

    it('clear() 清空队列并停止当前播放', async () => {
      let resolveSpeak: (() => void) | null = null;
      const client = {
        speak: vi.fn().mockImplementation(
          () => new Promise<void>((resolve) => { resolveSpeak = resolve; }),
        ),
        stop: vi.fn(),
      } as unknown as TTSClient;
      const queue = new TTSQueue(client);

      queue.enqueue('a');
      queue.enqueue('b');
      queue.enqueue('c');
      await new Promise((r) => setTimeout(r, 0));
      queue.clear();

      resolveSpeak!();
      await new Promise((r) => setTimeout(r, 20));

      const speakMock = client.speak as ReturnType<typeof vi.fn>;
      expect(speakMock.mock.calls.map((c) => c[0])).toEqual(['a']);
      expect((client.stop as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
      expect(queue.isPlaying).toBe(false);
    });

    it('speak 抛错时不会卡住队列 (后续条目继续播放)', async () => {
      const client = {
        speak: vi.fn().mockImplementation((text: string) => {
          if (text === 'first') return Promise.reject(new Error('speak fail'));
          return Promise.resolve();
        }),
        stop: vi.fn(),
      } as unknown as TTSClient;
      const queue = new TTSQueue(client);

      queue.enqueue('first');
      queue.enqueue('second');

      await new Promise((r) => setTimeout(r, 30));
      const calls = (client.speak as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
      expect(calls).toContain('first');
      expect(calls).toContain('second');
      expect(queue.isPlaying).toBe(false);
    });
  });
});
