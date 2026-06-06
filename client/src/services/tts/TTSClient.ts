import { useSettingsStore } from '../../stores/settingsStore';
import { base64AudioToBlob, buildMimoTTSRequest, DEFAULT_MIMO_CHAT_ENDPOINT, DEFAULT_MIMO_TTS_MODEL, extractChatAudioBase64, shouldUseMimoChatAPI } from '../../utils/mimo';
import { DEFAULT_OPENAI_TTS_ENDPOINT, DEFAULT_OPENAI_TTS_MODEL, getTTSProviderDefaults, type TTSProviderType } from '../../utils/providerCatalog';

export class TTSClient {
  private provider: TTSProviderType;
  private usesMimoChatAPI: boolean;
  private config: { apiKey: string; endpoint: string; model: string; voice: string; speed: number };
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;

  constructor(config?: { voice?: string; speed?: number; provider?: string }) {
    const state = useSettingsStore.getState();
    const settings = state.tts;
    this.provider = settings.provider;
    const defaults = getTTSProviderDefaults(settings.provider);
    this.usesMimoChatAPI = shouldUseMimoChatAPI(settings.provider, settings.endpoint, settings.model);
    const allowVoiceOverride = Boolean(config?.voice) && (!config?.provider || config.provider === settings.provider);
    this.config = {
      apiKey: settings.apiKey || state.llm.apiKey,
      endpoint: this.usesMimoChatAPI ? (settings.endpoint || defaults.endpoint || DEFAULT_MIMO_CHAT_ENDPOINT) : (settings.endpoint || defaults.endpoint || DEFAULT_OPENAI_TTS_ENDPOINT),
      model: this.usesMimoChatAPI ? (settings.model || defaults.model || DEFAULT_MIMO_TTS_MODEL) : (settings.model || defaults.model || DEFAULT_OPENAI_TTS_MODEL),
      voice: allowVoiceOverride ? (config?.voice || settings.voice || defaults.voice || 'onyx') : (settings.voice || defaults.voice || 'onyx'),
      speed: config?.speed || settings.speed || 1.0,
    };
  }

  async speak(text: string): Promise<void> {
    if (!text.trim()) return;
    if (this.provider === 'edge') {
      await this.speakWithBrowser(text);
      return;
    }
    const buffer = await this.fetchTTS(text);
    if (buffer) await this.play(buffer);
  }

  async speakStream(text: string): Promise<void> {
    if (!text.trim()) return;
    if (this.provider === 'edge' || this.usesMimoChatAPI) {
      await this.speak(text);
      return;
    }
    const sentences = text.split(/(?<=[。！？.!?])/);
    for (const sentence of sentences) {
      if (!sentence.trim()) continue;
      const buffer = await this.fetchTTS(sentence.trim());
      if (buffer) await this.playSync(buffer);
    }
  }

  private async speakWithBrowser(text: string): Promise<void> {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      return;
    }

    const synth = window.speechSynthesis;
    synth.cancel();

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = this.pickBrowserVoice(synth.getVoices());
      if (voice) utterance.voice = voice;
      utterance.rate = Math.min(Math.max(this.config.speed || 1, 0.5), 2);
      utterance.onend = () => {
        if (this.currentUtterance === utterance) this.currentUtterance = null;
        resolve();
      };
      utterance.onerror = () => {
        if (this.currentUtterance === utterance) this.currentUtterance = null;
        resolve();
      };
      this.currentUtterance = utterance;
      synth.speak(utterance);
    });
  }

  private pickBrowserVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
    if (!voices.length) return null;

    const desiredVoice = this.config.voice.trim().toLowerCase();
    if (desiredVoice) {
      const exactVoice = voices.find((voice) => voice.name.toLowerCase() === desiredVoice);
      if (exactVoice) return exactVoice;

      const partialVoice = voices.find((voice) => voice.name.toLowerCase().includes(desiredVoice));
      if (partialVoice) return partialVoice;
    }

    return voices.find((voice) => voice.lang.toLowerCase().startsWith('zh')) ?? voices[0] ?? null;
  }

  async generateAudioBlob(text: string): Promise<Blob | null> {
    if (!text.trim() || this.provider === 'edge') return null;

    try {
      if (this.usesMimoChatAPI) {
        const resp = await fetch(this.config.endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(buildMimoTTSRequest(text, {
            model: this.config.model,
            voice: this.config.voice,
            format: 'wav',
          })),
        });
        if (!resp.ok) return null;

        const data = await resp.json();
        const audioBase64 = extractChatAudioBase64(data);
        if (!audioBase64) return null;

        return base64AudioToBlob(audioBase64, 'wav');
      }

      const resp = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          input: text,
          voice: this.config.voice,
          speed: this.config.speed,
        }),
      });
      if (!resp.ok) return null;

      const audioBlob = await resp.blob();
      return audioBlob.size ? audioBlob : null;
    } catch {
      return null;
    }
  }

  private async fetchTTS(text: string): Promise<AudioBuffer | null> {
    const audioBlob = await this.generateAudioBlob(text);
    if (!audioBlob) return null;

    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      return this.decodeAudio(arrayBuffer);
    } catch {
      return null;
    }
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
  }

  private async decodeAudio(arrayBuffer: ArrayBuffer): Promise<AudioBuffer | null> {
    try {
      return await this.getAudioContext().decodeAudioData(arrayBuffer);
    } catch {
      return null;
    }
  }

  private play(buffer: AudioBuffer): void {
    const ctx = this.getAudioContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    this.currentSource = source;
    source.start();
  }

  private playSync(buffer: AudioBuffer): Promise<void> {
    return new Promise((resolve) => {
      const ctx = this.getAudioContext();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      this.currentSource = source;
      source.onended = () => resolve();
      source.start();
    });
  }

  stop(): void {
    try {
      this.currentSource?.stop();
    } catch { /* ignore */ }
    this.currentSource = null;

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.currentUtterance = null;
  }
}

export class TTSQueue {
  private client: TTSClient;
  private queue: Array<{
    text: string;
    onStart: () => void;
    onEnd: () => void;
  }> = [];
  private playing = false;

  constructor(client: TTSClient) {
    this.client = client;
  }

  enqueue(text: string, onStart: () => void = () => {}, onEnd: () => void = () => {}): void {
    this.queue.push({ text, onStart, onEnd });
    if (!this.playing) this.playNext();
  }

  private async playNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.playing = false;
      return;
    }
    this.playing = true;
    const { text, onStart, onEnd } = this.queue.shift()!;
    onStart();
    try {
      await this.client.speak(text);
    } catch {
      /* swallow to keep the queue alive */
    }
    onEnd();
    this.playNext();
  }

  clear(): void {
    this.queue = [];
    this.client.stop();
    this.playing = false;
  }

  get isPlaying(): boolean {
    return this.playing;
  }
}
