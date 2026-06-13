/**
 * 持久化设置中心。
 * 汇总 LLM、自动游玩、服务器、语音、图片生成和实验开关等可跨会话保留的配置，
 * 为上层 hook 和 service 提供统一的运行时配置读取入口。
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LLMProviderType } from '../types/llm';
import type { MapImageGenConfig, MapImageSize } from '../types/map';
import { createSecureStorage } from '../services/crypto/CryptoService';
import {
  DEFAULT_DEEPSEEK_CHAT_ENDPOINT,
  DEFAULT_LLM_PROVIDER,
  DEFAULT_OPENAI_IMAGE_ENDPOINT,
  DEFAULT_OPENAI_IMAGE_MODEL,
  DEFAULT_OPENAI_TTS_ENDPOINT,
  DEFAULT_OPENAI_TTS_MODEL,
  type ImageProviderType,
  type STTProviderType,
  type TTSProviderType,
  getLLMProviderDefaults,
} from '../utils/providerCatalog';

interface LLMConfig {
  provider: LLMProviderType; apiKey: string; endpoint: string;
  model: string; temperature: number; maxTokens: number;
}
interface ServerConfig { endpoint: string; autoSyncInterval: number; syncOnExit: boolean; }

interface STTConfig {
  provider: STTProviderType;
  apiKey: string;
  endpoint: string;
  model: string;
  language: string;
}

interface TTSConfig {
  provider: TTSProviderType;
  apiKey: string;
  endpoint: string;
  model: string;
  voice: string;
  speed: number;
}

interface ImageGenConfig {
  provider: ImageProviderType;
  apiKey: string;
  endpoint: string;
  model: string;
  size: string;
  quality: string;
}

interface PromptBudgetSettings {
  enabled: boolean;
  maxInputTokens: number;
  safetyMargin: number;
  responseReserve: number;
}

interface ExperimentalFeatures {
  enableTokenBudget: boolean;
  enableStructuredLocation: boolean;
  enableContextMerge: boolean;
  enableHistoryCompression: boolean;
  enablePromptOverrides: boolean;
  enableSystemHooks: boolean;
}

// v0.4 战斗系统 QTE 可选层配置.
// 默认 QTE 关闭; 战斗系统检测到 enabled=false 时, runAttackQTE / runMagicQTE 立即返回 modifier=0.
export interface QTEConfig {
  enabled: boolean;
  attackMaxRounds: number;     // 攻击 QTE 轮数上限 (1-5)
  magicBaseMs: number;         // 魔法 QTE 基础时长 (ms), INT 每点 -200ms, 下限 3000ms
  damageScale: number;         // 伤害 modifier 缩放系数 (0.3 = ±30%)
}
export const DEFAULT_QTE_CONFIG: QTEConfig = {
  enabled: false,
  attackMaxRounds: 5,
  magicBaseMs: 5000,
  damageScale: 0.3,
};

interface DebugSettings {
  enabled: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  categories: string[];
  persistToIndexedDB: boolean;
}

interface SettingsState {
  _cryptoVersion: number;
  llm: LLMConfig;
  autoPlayLLM: LLMConfig;
  autoPlayUseSeparateConfig: boolean;
  server: ServerConfig;
  diceType: string;
  language: string;
  enableStreaming: boolean;
  fontSize: string;
  theme: string;
  promptBudget: PromptBudgetSettings;
  experimental: ExperimentalFeatures;
  stt: STTConfig;
  tts: TTSConfig;
  ttsEnabled: boolean;
  npcIndependentVoice: boolean;
  imageGen: ImageGenConfig;
  imageGenEnabled: boolean;
  mapImageGen: MapImageGenConfig;
  setMapImageGenConfig: (c: Partial<MapImageGenConfig>) => void;
  debug: DebugSettings;
  setLLMConfig: (c: Partial<LLMConfig>) => void;
  setAutoPlayLLMConfig: (c: Partial<LLMConfig>) => void;
  setAutoPlayUseSeparateConfig: (v: boolean) => void;
  setServerConfig: (c: Partial<ServerConfig>) => void;
  setDiceType: (t: string) => void;
  setLanguage: (l: string) => void;
  setStreaming: (e: boolean) => void;
  setFontSize: (s: string) => void;
  setTheme: (t: string) => void;
  setPromptBudget: (c: Partial<PromptBudgetSettings>) => void;
  setExperimental: (c: Partial<ExperimentalFeatures>) => void;
  setSTTConfig: (c: Partial<STTConfig>) => void;
  setTTSConfig: (c: Partial<TTSConfig>) => void;
  setTTSEnabled: (v: boolean) => void;
  setNPCIndependentVoice: (v: boolean) => void;
  setImageGenConfig: (c: Partial<ImageGenConfig>) => void;
  setImageGenEnabled: (v: boolean) => void;
  setDebugConfig: (c: Partial<DebugSettings>) => void;
  getLLMContext: () => LLMConfig | null;
  getAutoPlayLLMContext: () => LLMConfig | null;
  // ============================================================
  // PR-3: 记忆层设置
  // ============================================================
  memory: {
    backend: 'local' | 'mem0';
    decayStrategy: 'none' | 'gentle' | 'forgetting_curve' | 'aggressive';
    maxRecords: number;
    tauDays: number;
    retentionDays: number;
    importanceFloor: number;
  };
  setMemoryDecayStrategy: (s: 'none' | 'gentle' | 'forgetting_curve' | 'aggressive') => void;
  setMemoryBackend: (b: 'local' | 'mem0') => void;
  // v0.4 战斗系统 QTE
  qte: QTEConfig;
  setQTEConfig: (c: Partial<QTEConfig>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      _cryptoVersion: 0,
      // 审计 P2 修复: 移除硬编码 LLM 模型默认值. 新用户 model 字段留空, 真正默认由 getLLMProviderDefaults() 按 provider 决定;
      // 旧用户已持久化的 model 字段值不会被覆盖. 选用 'custom' provider 且无默认时, model 为空, UI 应提示用户填写.
      llm: { provider: DEFAULT_LLM_PROVIDER, apiKey: '', endpoint: DEFAULT_DEEPSEEK_CHAT_ENDPOINT, model: '', temperature: 0.8, maxTokens: 4096 },
      autoPlayLLM: { provider: DEFAULT_LLM_PROVIDER, apiKey: '', endpoint: DEFAULT_DEEPSEEK_CHAT_ENDPOINT, model: '', temperature: 0.7, maxTokens: 1024 },
      autoPlayUseSeparateConfig: false,
      server: { endpoint: 'http://localhost:8000', autoSyncInterval: 15, syncOnExit: true },
      diceType: '2d6', language: 'zh-CN', enableStreaming: true, fontSize: 'medium', theme: 'dark',
      promptBudget: { enabled: true, maxInputTokens: 0, safetyMargin: 0.9, responseReserve: 1024 },
      experimental: {
        enableTokenBudget: false,
        enableStructuredLocation: false,
        enableContextMerge: false,
        enableHistoryCompression: false,
        enablePromptOverrides: false,
        enableSystemHooks: false,
      },
      setLLMConfig: (c) => set((s) => ({ llm: { ...s.llm, ...c } })),
      setAutoPlayLLMConfig: (c) => set((s) => ({ autoPlayLLM: { ...s.autoPlayLLM, ...c } })),
      setAutoPlayUseSeparateConfig: (v) => set({ autoPlayUseSeparateConfig: v }),
      setServerConfig: (c) => set((s) => ({ server: { ...s.server, ...c } })),
      setDiceType: (t) => set({ diceType: t }),
      setLanguage: (l) => set({ language: l }),
      setStreaming: (e) => set({ enableStreaming: e }),
      setFontSize: (s) => set({ fontSize: s }),
      setTheme: (t) => set({ theme: t }),
      setPromptBudget: (c) => set((s) => ({ promptBudget: { ...s.promptBudget, ...c } })),
      setExperimental: (c) => set((s) => ({ experimental: { ...s.experimental, ...c } })),
      // PR-3: 记忆层默认配置 (默认 'none' 永不遗忘, 推荐单机/小世界)
      memory: {
        backend: 'local',
        decayStrategy: 'none',
        maxRecords: 5000,
        tauDays: 30,
        retentionDays: 90,
        importanceFloor: 0.2,
      },
      setMemoryDecayStrategy: (s) => set((st) => ({ memory: { ...st.memory, decayStrategy: s } })),
      setMemoryBackend: (b) => set((st) => ({ memory: { ...st.memory, backend: b } })),
      // v0.4 战斗系统 QTE
      qte: { ...DEFAULT_QTE_CONFIG },
      setQTEConfig: (c) => set((s) => ({ qte: { ...s.qte, ...c } })),
      stt: { provider: 'browser', apiKey: '', endpoint: '', model: 'whisper-1', language: 'zh-CN' },
      tts: { provider: 'openai', apiKey: '', endpoint: DEFAULT_OPENAI_TTS_ENDPOINT, model: DEFAULT_OPENAI_TTS_MODEL, voice: 'onyx', speed: 1.0 },
      ttsEnabled: false,
      npcIndependentVoice: false,
      setSTTConfig: (c) => set((s) => ({ stt: { ...s.stt, ...c } })),
      setTTSConfig: (c) => set((s) => ({ tts: { ...s.tts, ...c } })),
      setTTSEnabled: (v) => set({ ttsEnabled: v }),
      setNPCIndependentVoice: (v) => set({ npcIndependentVoice: v }),
      imageGen: { provider: 'openai', apiKey: '', endpoint: DEFAULT_OPENAI_IMAGE_ENDPOINT, model: DEFAULT_OPENAI_IMAGE_MODEL, size: '1024x1024', quality: 'standard' },
      imageGenEnabled: false,
      mapImageGen: { apiEndpoint: '', apiKey: '', imageSize: '512x512' as MapImageSize },
      setMapImageGenConfig: (c) => set((s) => ({ mapImageGen: { ...s.mapImageGen, ...c } })),
      debug: { enabled: false, logLevel: 'info', categories: ['SYSTEM', 'ERROR'], persistToIndexedDB: false },
      setImageGenConfig: (c) => set((s) => ({ imageGen: { ...s.imageGen, ...c } })),
      setImageGenEnabled: (v) => set({ imageGenEnabled: v }),
      setDebugConfig: (c) => set((s) => ({ debug: { ...s.debug, ...c } })),
      getLLMContext: () => {
        const { llm } = get();
        if (!llm || !llm.apiKey) return null;
        const defaults = getLLMProviderDefaults(llm.provider);
        return {
          provider: llm.provider,
          apiKey: llm.apiKey,
          endpoint: llm.endpoint || defaults.endpoint || DEFAULT_DEEPSEEK_CHAT_ENDPOINT,
          // 审计 P2 修复: 移除硬编码的 DEFAULT_DEEPSEEK_LLM_MODEL 兜底. 缺省时由 UI 提示用户填写.
          model: llm.model || defaults.model || '',
          temperature: llm.temperature ?? 0.8,
          maxTokens: llm.maxTokens ?? 4096,
        };
      },
      getAutoPlayLLMContext: () => {
        const { autoPlayLLM, llm, autoPlayUseSeparateConfig } = get();
        const cfg = autoPlayUseSeparateConfig ? autoPlayLLM : llm;
        if (!cfg || !cfg.apiKey) {
          if (!autoPlayUseSeparateConfig) return get().getLLMContext();
          return null;
        }
        const defaults = getLLMProviderDefaults(cfg.provider);
        return {
          provider: cfg.provider,
          apiKey: cfg.apiKey,
          endpoint: cfg.endpoint || defaults.endpoint || DEFAULT_DEEPSEEK_CHAT_ENDPOINT,
          // 审计 P2 修复: 同上, 移除硬编码兜底
          model: cfg.model || defaults.model || '',
          temperature: cfg.temperature ?? 0.7,
          maxTokens: cfg.maxTokens ?? 1024,
        };
      },
    }),
    {
      name: 'aeslan-settings',
      storage: createSecureStorage(),
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error || !state) return;
          const s = state as SettingsState;
          if (s._cryptoVersion < 2) {
            setTimeout(() => {
              useSettingsStore.setState({ _cryptoVersion: 2 });
            }, 50);
          }
        };
      },
      partialize: (s) => ({
        _cryptoVersion: s._cryptoVersion,
        llm: s.llm,
        autoPlayLLM: s.autoPlayLLM,
        autoPlayUseSeparateConfig: s.autoPlayUseSeparateConfig,
        server: s.server,
        diceType: s.diceType,
        language: s.language,
        enableStreaming: s.enableStreaming,
        fontSize: s.fontSize,
        theme: s.theme,
        promptBudget: s.promptBudget,
        experimental: s.experimental,
        stt: s.stt,
        tts: s.tts,
        ttsEnabled: s.ttsEnabled,
        npcIndependentVoice: s.npcIndependentVoice,
        imageGen: s.imageGen,
        imageGenEnabled: s.imageGenEnabled,
        mapImageGen: s.mapImageGen,
        debug: s.debug,
        // v0.4 战斗系统 QTE 持久化
        qte: s.qte,
      }),
    },
  ),
);
