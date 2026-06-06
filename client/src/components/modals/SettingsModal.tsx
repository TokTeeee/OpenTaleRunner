import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { sendToSTTAPI } from '../../hooks/useVoiceInput';
import { ImageClient } from '../../services/image/ImageClient';
import { APIClient } from '../../services/sync/APIClient';
import { TTSClient } from '../../services/tts/TTSClient';
import { useSettingsStore } from '../../stores/settingsStore';
import { useUIStore } from '../../stores/uiStore';
import { DEFAULT_MIMO_LLM_MODEL, extractChatResponseText, shouldUseMimoChatAPI } from '../../utils/mimo';
import {
  IMAGE_PROVIDER_OPTIONS,
  LLM_PROVIDER_OPTIONS,
  STT_PROVIDER_OPTIONS,
  TTS_PROVIDER_OPTIONS,
  type ConfigurableLLMProvider,
  type ImageProviderType,
  type STTProviderType,
  type TTSProviderType,
  getImageProviderDefaults,
  getLLMProviderDefaults,
  getSTTProviderDefaults,
  getTTSProviderDefaults,
} from '../../utils/providerCatalog';

type TestStatus = 'idle' | 'testing' | 'success' | 'fail';
type TestState = { status: TestStatus; message: string };
type SettingsTab = 'llm' | 'tts' | 'stt' | 'image' | 'server' | 'game';
type BrowserSpeechRecognitionResult = {
  isFinal: boolean;
  0: { transcript: string };
};

type BrowserSpeechRecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<BrowserSpeechRecognitionResult>;
};

type BrowserSpeechRecognitionErrorEvent = {
  error?: string;
};

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition;

const IDLE_TEST_STATE: TestState = { status: 'idle', message: '' };

const TABS: { key: SettingsTab; label: string }[] = [
  { key: 'llm', label: 'AI Agent' },
  { key: 'tts', label: '语音合成' },
  { key: 'stt', label: '语音识别' },
  { key: 'image', label: '图片生成' },
  { key: 'server', label: '服务器' },
  { key: 'game', label: '游戏' },
];

const IMAGE_SIZE_PRESETS = [
  { value: '1024x1024', label: '1024×1024 (方形)' },
  { value: '1792x1024', label: '1792×1024 (宽屏)' },
  { value: '1024x1792', label: '1024×1792 (竖屏)' },
  { value: '1920x1920', label: '1920×1920 (高清方形)' },
];

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 120);
  return '未知错误';
}

async function getResponseError(response: Response): Promise<string> {
  const text = (await response.text()).replace(/\s+/g, ' ').trim();
  return text ? `${response.status} ${text.slice(0, 120)}` : `HTTP ${response.status}`;
}

export function SettingsModal() {
  const settings = useSettingsStore();
  const closeModal = useUIStore((s) => s.closeModal);
  const [tab, setTab] = useState<SettingsTab>('llm');
  const [llmTest, setLLMTest] = useState<TestState>(IDLE_TEST_STATE);
  const [ttsTest, setTTSTest] = useState<TestState>(IDLE_TEST_STATE);
  const [sttTest, setSTTTest] = useState<TestState>(IDLE_TEST_STATE);
  const [imageTest, setImageTest] = useState<TestState>(IDLE_TEST_STATE);
  const [serverTest, setServerTest] = useState<TestState>(IDLE_TEST_STATE);
  const [ttsSampleText, setTTSSampleText] = useState('欢迎来到艾瑟兰，语音合成测试通过。');
  const [sttTranscript, setSTTTranscript] = useState('');
  const [sttCaptureState, setSTTCaptureState] = useState<'idle' | 'capturing' | 'processing'>('idle');
  const [imagePrompt, setImagePrompt] = useState('一幅描绘艾瑟兰边境森林与遗迹的高质量奇幻概念插画，电影感光影，细节丰富。');
  const [ttsPreviewUrl, setTTSPreviewUrl] = useState('');
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');

  const mountedRef = useRef(true);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sttChunksRef = useRef<Blob[]>([]);
  const ttsPreviewUrlRef = useRef('');

  const activeTTSApiKey = settings.tts.apiKey || settings.llm.apiKey;
  const activeImageApiKey = settings.imageGen.apiKey || settings.llm.apiKey;
  const isBrowserSpeechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  const isBrowserRecognitionSupported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  const imageSizeSelectValue = IMAGE_SIZE_PRESETS.some((option) => option.value === settings.imageGen.size) ? settings.imageGen.size : '__custom__';

  const replaceTTSPreviewUrl = (nextUrl: string) => {
    if (ttsPreviewUrlRef.current) {
      URL.revokeObjectURL(ttsPreviewUrlRef.current);
      ttsPreviewUrlRef.current = '';
    }
    if (nextUrl) ttsPreviewUrlRef.current = nextUrl;
    setTTSPreviewUrl(nextUrl);
  };

  const releaseSTTMedia = () => {
    if (!mediaStreamRef.current) return;
    mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  };

  const cleanupRecognition = (abort = false) => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      if (abort) recognition.abort();
      else recognition.stop();
    } catch {
      try { recognition.abort(); } catch { /* ignore */ }
    }
    recognitionRef.current = null;
  };

  const disposeRecorder = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state === 'recording') {
        try { recorder.stop(); } catch { /* ignore */ }
      }
      mediaRecorderRef.current = null;
    }
    sttChunksRef.current = [];
    releaseSTTMedia();
  };

  const resetTTSTest = () => {
    setTTSTest(IDLE_TEST_STATE);
    replaceTTSPreviewUrl('');
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const resetSTTTest = () => {
    setSTTTest(IDLE_TEST_STATE);
    setSTTTranscript('');
    setSTTCaptureState('idle');
    cleanupRecognition(true);
    disposeRecorder();
  };

  useEffect(() => () => {
    mountedRef.current = false;
    cleanupRecognition(true);
    disposeRecorder();
    replaceTTSPreviewUrl('');
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only teardown setup; tracked for v0.4
  }, []);

  const updateLLMConfig = (config: Partial<typeof settings.llm>) => {
    setLLMTest(IDLE_TEST_STATE);
    settings.setLLMConfig(config);
  };

  const updateLLMProvider = (provider: ConfigurableLLMProvider) => {
    updateLLMConfig({ provider, ...getLLMProviderDefaults(provider) });
  };

  const updateTTSConfig = (config: Partial<typeof settings.tts>) => {
    resetTTSTest();
    settings.setTTSConfig(config);
  };

  const updateTTSProvider = (provider: TTSProviderType) => {
    updateTTSConfig({ provider, ...getTTSProviderDefaults(provider) });
  };

  const updateSTTConfig = (config: Partial<typeof settings.stt>) => {
    resetSTTTest();
    settings.setSTTConfig(config);
  };

  const updateSTTProvider = (provider: STTProviderType) => {
    updateSTTConfig({ provider, ...getSTTProviderDefaults(provider) });
  };

  const updateImageConfig = (config: Partial<typeof settings.imageGen>) => {
    setImageTest(IDLE_TEST_STATE);
    setImagePreviewUrl('');
    settings.setImageGenConfig(config);
  };

  const updateImageProvider = (provider: ImageProviderType) => {
    updateImageConfig({ provider, ...getImageProviderDefaults(provider) });
  };

  const updateServerConfig = (config: Partial<typeof settings.server>) => {
    setServerTest(IDLE_TEST_STATE);
    settings.setServerConfig(config);
  };

  const renderTestResult = (test: TestState) => {
    if (!test.message) return null;

    const tone = test.status === 'success'
      ? 'bg-green-900/50 text-green-300 border border-green-800'
      : test.status === 'fail'
        ? 'bg-red-900/50 text-red-300 border border-red-800'
        : 'bg-gray-800 text-gray-400 border border-gray-700';

    return (
      <div className={`text-sm px-4 py-3 rounded-lg ${tone}`}>
        {test.status === 'testing' && <span className="inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mr-2 align-middle" />}
        {test.message}
      </div>
    );
  };

  const testLLMConnection = async () => {
    if (!settings.llm.apiKey) {
      setLLMTest({ status: 'fail', message: '请先填写 API Key' });
      return;
    }

    setLLMTest({ status: 'testing', message: '正在测试 AI Agent 连接...' });
    try {
      const useMimoChatAPI = shouldUseMimoChatAPI(settings.llm.provider, settings.llm.endpoint, settings.llm.model);
      const res = await fetch(settings.llm.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.llm.apiKey}` },
        body: JSON.stringify(useMimoChatAPI
          ? {
            model: settings.llm.model || DEFAULT_MIMO_LLM_MODEL,
            messages: [{ role: 'user', content: '请只回复 OK' }],
            max_completion_tokens: 16,
            thinking: { type: 'disabled' },
          }
          : { model: settings.llm.model, messages: [{ role: 'user', content: '回复"OK"' }], max_tokens: 10 }),
      });

      if (!res.ok) {
        setLLMTest({ status: 'fail', message: `AI Agent 测试失败: ${await getResponseError(res)}` });
        return;
      }

      const data = await res.json();
      const outputText = extractChatResponseText(data, { allowReasoningFallback: true });
      if (outputText) {
        setLLMTest({ status: 'success', message: `连接成功，AI Agent 已返回有效响应：${outputText.slice(0, 60)}` });
      } else {
        setLLMTest({ status: 'fail', message: '接口已连接，但返回内容结构异常。' });
      }
    } catch (error) {
      setLLMTest({ status: 'fail', message: `AI Agent 测试失败: ${getErrorMessage(error)}` });
    }
  };

  const testTTSConnection = async () => {
    if (!ttsSampleText.trim()) {
      setTTSTest({ status: 'fail', message: '请先填写测试文本。' });
      return;
    }

    resetTTSTest();

    if (settings.tts.provider === 'edge') {
      if (!isBrowserSpeechSupported) {
        setTTSTest({ status: 'fail', message: '当前浏览器不支持 Edge 语音朗读测试。' });
        return;
      }

      setTTSTest({ status: 'testing', message: '正在调用浏览器朗读测试文本...' });
      const tts = new TTSClient();
      void tts.speak(ttsSampleText);
      setTTSTest({ status: 'success', message: '浏览器已开始朗读测试文本，可直接听取结果。' });
      return;
    }

    if (!activeTTSApiKey) {
      setTTSTest({ status: 'fail', message: '请先填写 TTS API Key，或复用 AI Agent 的 Key。' });
      return;
    }

    setTTSTest({ status: 'testing', message: '正在请求测试语音...' });
    try {
      const tts = new TTSClient();
      const audioBlob = await tts.generateAudioBlob(ttsSampleText);
      if (!audioBlob || !audioBlob.size) {
        setTTSTest({ status: 'fail', message: '接口已连接，但没有返回可播放音频。' });
        return;
      }

      replaceTTSPreviewUrl(URL.createObjectURL(audioBlob));
      if (!mountedRef.current) return;
      setTTSTest({ status: 'success', message: `语音生成成功，已返回 ${(audioBlob.size / 1024).toFixed(1)} KB 的测试音频。` });
    } catch (error) {
      if (!mountedRef.current) return;
      setTTSTest({ status: 'fail', message: `语音合成测试失败: ${getErrorMessage(error)}` });
    }
  };

  const startSTTTest = async () => {
    resetSTTTest();

    if (settings.stt.provider === 'browser') {
      if (!isBrowserRecognitionSupported) {
        setSTTTest({ status: 'fail', message: '当前浏览器不支持内置语音识别。' });
        return;
      }

      const SpeechRecognitionClass = (window as unknown as Record<string, BrowserSpeechRecognitionCtor>).SpeechRecognition
        || (window as unknown as Record<string, BrowserSpeechRecognitionCtor>).webkitSpeechRecognition;
      if (!SpeechRecognitionClass) {
        setSTTTest({ status: 'fail', message: '浏览器未提供可用的语音识别实现。' });
        return;
      }

      let finalTranscript = '';
      const recognition = new SpeechRecognitionClass();
      recognition.lang = settings.stt.language || 'zh-CN';
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) transcript += event.results[i][0].transcript;
        }
        if (transcript.trim()) finalTranscript = transcript.trim();
      };

      recognition.onerror = (event) => {
        recognitionRef.current = null;
        if (!mountedRef.current) return;
        setSTTCaptureState('idle');
        setSTTTest({ status: 'fail', message: `浏览器语音识别失败: ${event.error || '请检查麦克风权限'}` });
      };

      recognition.onend = () => {
        recognitionRef.current = null;
        if (!mountedRef.current) return;
        setSTTCaptureState('idle');
        if (finalTranscript) {
          setSTTTranscript(finalTranscript);
          setSTTTest({ status: 'success', message: '浏览器语音识别成功，已返回转写文本。' });
        } else {
          setSTTTest({ status: 'fail', message: '没有识别到有效语音，请重试。' });
        }
      };

      recognitionRef.current = recognition;
      setSTTCaptureState('capturing');
      setSTTTest({ status: 'testing', message: '请说一句“艾瑟兰测试通过”，浏览器会直接返回识别结果。' });
      try {
        recognition.start();
      } catch {
        recognitionRef.current = null;
        setSTTCaptureState('idle');
        setSTTTest({ status: 'fail', message: '浏览器语音识别启动失败，请检查麦克风权限。' });
      }
      return;
    }

    if (!settings.stt.apiKey) {
      setSTTTest({ status: 'fail', message: '请先填写 STT API Key。' });
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setSTTTest({ status: 'fail', message: '当前浏览器不支持录音测试。' });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      sttChunksRef.current = [];

      const supportsWebm = typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('audio/webm');
      const recorder = supportsWebm ? new MediaRecorder(stream, { mimeType: 'audio/webm' }) : new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) sttChunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        mediaRecorderRef.current = null;
        releaseSTTMedia();
        if (!mountedRef.current) return;
        setSTTCaptureState('idle');
        setSTTTest({ status: 'fail', message: '录音失败，请检查麦克风权限后重试。' });
      };

      recorder.onstop = async () => {
        mediaRecorderRef.current = null;
        const audioBlob = new Blob(sttChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        sttChunksRef.current = [];
        releaseSTTMedia();

        if (!mountedRef.current) return;
        if (!audioBlob.size) {
          setSTTCaptureState('idle');
          setSTTTest({ status: 'fail', message: '未录到有效音频，请重试。' });
          return;
        }

        setSTTCaptureState('processing');
        setSTTTest({ status: 'testing', message: '正在上传录音并请求语音识别...' });
        try {
          const transcript = (await sendToSTTAPI(audioBlob, settings.stt)).trim();
          if (!mountedRef.current) return;

          if (transcript) {
            setSTTTranscript(transcript);
            setSTTTest({ status: 'success', message: '语音识别测试成功，已返回转写文本。' });
          } else {
            setSTTTest({ status: 'fail', message: '接口连接成功，但没有返回识别文本。' });
          }
        } catch (error) {
          if (!mountedRef.current) return;
          setSTTTest({ status: 'fail', message: `语音识别测试失败: ${getErrorMessage(error)}` });
        } finally {
          if (mountedRef.current) setSTTCaptureState('idle');
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setSTTCaptureState('capturing');
      setSTTTest({ status: 'testing', message: '录音中，请说一句“艾瑟兰测试通过”，然后点击“停止录音并识别”。' });
    } catch (error) {
      releaseSTTMedia();
      setSTTCaptureState('idle');
      setSTTTest({ status: 'fail', message: `无法访问麦克风: ${getErrorMessage(error)}` });
    }
  };

  const stopSTTTest = () => {
    if (settings.stt.provider === 'browser') {
      const recognition = recognitionRef.current;
      if (!recognition) return;
      try { recognition.stop(); } catch { try { recognition.abort(); } catch { /* ignore */ } }
      return;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    setSTTCaptureState('processing');
    setSTTTest({ status: 'testing', message: '正在结束录音并提交识别...' });
    recorder.stop();
  };

  const testImageConnection = async () => {
    if (!imagePrompt.trim()) {
      setImageTest({ status: 'fail', message: '请先填写测试提示词。' });
      return;
    }

    if (!activeImageApiKey) {
      setImageTest({ status: 'fail', message: '请先填写图片 API Key，或复用 AI Agent 的 Key。' });
      return;
    }

    setImagePreviewUrl('');
    setImageTest({ status: 'testing', message: '正在生成测试图片，这会发起一次真实图片请求...' });
    try {
      const client = new ImageClient();
      const image = await client.generate(
        imagePrompt,
        `settings-test:${settings.imageGen.provider}:${settings.imageGen.model}:${settings.imageGen.size}:${imagePrompt}`,
      );

      if (!image) {
        setImageTest({ status: 'fail', message: '接口已连接，但没有返回可展示的图片。' });
        return;
      }

      setImagePreviewUrl(image);
      setImageTest({ status: 'success', message: '图片生成成功，已加载预览，可直接查看结果。' });
    } catch (error) {
      setImageTest({ status: 'fail', message: `图片生成测试失败: ${getErrorMessage(error)}` });
    }
  };

  const testServerConnection = async () => {
    if (!settings.server.endpoint.trim()) {
      setServerTest({ status: 'fail', message: '请先填写服务器地址。' });
      return;
    }

    setServerTest({ status: 'testing', message: '正在检测服务器根路径和游戏关键接口...' });
    try {
      const baseUrl = settings.server.endpoint.replace(/\/$/, '');
      const startedAt = performance.now();
      const rootResponse = await fetch(`${baseUrl}/`);
      if (!rootResponse.ok) {
        setServerTest({ status: 'fail', message: `服务器连接失败: ${await getResponseError(rootResponse)}` });
        return;
      }

      const rootInfo = await rootResponse.json().catch(() => null);
      const api = new APIClient(baseUrl);
      const storybook = await api.getStorybook();
      const latency = Math.round(performance.now() - startedAt);
      const regionCount = Array.isArray(storybook.regions) ? storybook.regions.length : 0;
      const worldName = typeof storybook.world_name === 'string' ? storybook.world_name : '未知世界';

      setServerTest({
        status: 'success',
        message: `服务器连接成功，${latency} ms 内完成检测。${rootInfo?.service ? ` 服务：${rootInfo.service}。` : ''}故事书接口可读，世界：${worldName}${regionCount ? `，区域数：${regionCount}` : ''}。`,
      });
    } catch (error) {
      setServerTest({ status: 'fail', message: `服务器连接失败: ${getErrorMessage(error)}` });
    }
  };

  const field = (label: string, value: string, onChange: (v: string) => void, opts?: { placeholder?: string; type?: string }) => (
    <div>
      <label className="block text-sm text-gray-400 mb-2 font-medium">{label}</label>
      <input type={opts?.type || 'text'} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={opts?.placeholder || ''} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-gray-200 text-sm focus:border-indigo-500 focus:outline-none transition-colors" />
    </div>
  );

  const textareaField = (label: string, value: string, onChange: (v: string) => void, opts?: { placeholder?: string; rows?: number }) => (
    <div>
      <label className="block text-sm text-gray-400 mb-2 font-medium">{label}</label>
      <textarea rows={opts?.rows || 3} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={opts?.placeholder || ''} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-gray-200 text-sm focus:border-indigo-500 focus:outline-none transition-colors resize-y" />
    </div>
  );

  const toggle = (label: string, value: boolean, onChange: (v: boolean) => void) => (
    <div className="flex items-center justify-between p-4 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors">
      <span className="text-sm text-gray-400 font-medium">{label}</span>
      <button onClick={() => onChange(!value)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${value ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
        {value ? '✓ 开启' : '○ 关闭'}
      </button>
    </div>
  );

  return (
    <AnimatePresence>
      <motion.div
        key="settings-backdrop"
        className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
        style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        onClick={closeModal}
      >
        <motion.div
          key="settings-panel"
          className="bg-ink-900 border border-ink-700 rounded-3xl w-[85vw] max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-parchment"
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 4 }}
          transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-8 py-5 border-b border-ink-700/60 relative">
            <div className="flex items-center gap-4">
              <span className="text-2xl text-gold-500 font-display">⚙</span>
              <div>
                <h2 className="text-2xl font-display font-semibold text-ink-100 tracking-wider">
                  设置
                </h2>
                <p className="text-xs text-ink-500 mt-0.5 font-narrative italic">
                  Configuration · 调整你的世界
                </p>
              </div>
            </div>
            <button
              onClick={closeModal}
              className="w-9 h-9 rounded-full flex items-center justify-center
                         text-ink-400 hover:text-gold-400 hover:bg-ink-800
                         border border-transparent hover:border-gold-500/30
                         transition-all duration-200 text-lg"
              aria-label="关闭"
            >
              {'\u2715'}
            </button>
          </div>

          {/* Tabs */}
          <div className="flex px-6 gap-1 bg-ink-950/40 border-b border-ink-700/60 overflow-x-auto relative">
            {TABS.map((t) => {
              const isActive = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`relative px-5 py-3.5 text-sm font-medium whitespace-nowrap
                              transition-colors duration-200 font-sans tracking-wide
                              ${isActive ? 'text-gold-400' : 'text-ink-400 hover:text-ink-200'}`}
                >
                  {t.label}
                  {isActive && (
                    <motion.span
                      layoutId="settings-tab-underline"
                      className="absolute bottom-0 left-3 right-3 h-0.5 bg-gradient-to-r
                                 from-transparent via-gold-500 to-transparent"
                      style={{ boxShadow: '0 0 8px rgba(212,184,132,0.6)' }}
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-ink-900 noise-grain">

          {tab === 'llm' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-indigo-300 mb-2">AI Agent (GM) 配置</h3>
                <p className="text-sm text-gray-500 mb-5">此 API 用于驱动游戏主叙事（Game Master），建议使用支持长上下文的模型。</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2 font-medium">Provider</label>
                    <select value={settings.llm.provider} onChange={(e) => updateLLMProvider(e.target.value as ConfigurableLLMProvider)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-gray-200 text-sm focus:border-indigo-500 focus:outline-none transition-colors">
                      {LLM_PROVIDER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  {field('API Key', settings.llm.apiKey, (v) => updateLLMConfig({ apiKey: v }), { placeholder: 'sk-...', type: 'password' })}
                  {field('Endpoint', settings.llm.endpoint, (v) => updateLLMConfig({ endpoint: v }))}
                  {field('Model', settings.llm.model, (v) => updateLLMConfig({ model: v }))}
                  <div>
                    <button onClick={testLLMConnection} disabled={llmTest.status === 'testing' || !settings.llm.apiKey}
                      className="w-full px-6 py-3 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 bg-green-700 hover:bg-green-600 text-white">
                      {llmTest.status === 'testing' ? '⏳ 测试中...' : '🧪 测试连接'}
                    </button>
                    <div className="mt-3">{renderTestResult(llmTest)}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'tts' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-indigo-300 mb-2">语音合成 (TTS) 配置</h3>
                <p className="text-sm text-gray-500 mb-5">GM 旁白朗读 + NPC 配音。如 GM 的 LLM API 不支持语音，可在此单独配置。</p>
                <div className="space-y-4">
                  {toggle('启用 GM 朗读', settings.ttsEnabled, settings.setTTSEnabled)}
                  {toggle('NPC 独立配音', settings.npcIndependentVoice, settings.setNPCIndependentVoice)}
                  <div>
                    <label className="block text-sm text-gray-400 mb-2 font-medium">Provider</label>
                    <select value={settings.tts.provider} onChange={(e) => updateTTSProvider(e.target.value as TTSProviderType)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-gray-200 text-sm focus:border-indigo-500 focus:outline-none transition-colors">
                      {TTS_PROVIDER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  {field('API Key', settings.tts.apiKey, (v) => updateTTSConfig({ apiKey: v }), { placeholder: '留空使用 GM 的 Key', type: 'password' })}
                  <p className="text-xs text-gray-500 -mt-2">留空时会自动复用 AI Agent 的 Key。测试会真正请求一段短音频。</p>
                  {field('Endpoint', settings.tts.endpoint, (v) => updateTTSConfig({ endpoint: v }))}
                  {field('Model', settings.tts.model, (v) => updateTTSConfig({ model: v }))}
                  {field('默认音色', settings.tts.voice, (v) => updateTTSConfig({ voice: v }), { placeholder: 'onyx / nova / shimmer ...' })}
                  <div className="rounded-xl border border-gray-700 bg-gray-950/40 p-4 space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-200 mb-1">连通性测试</h4>
                      <p className="text-xs text-gray-500">OpenAI / 兼容接口会返回可播放音频；MiMo 会通过 chat/completions 返回 Base64 音频；Edge 会直接用浏览器朗读测试文本。</p>
                    </div>
                    {textareaField('测试文本', ttsSampleText, setTTSSampleText, { rows: 3, placeholder: '输入要生成语音的测试文本' })}
                    <div className="flex flex-wrap gap-3">
                      <button onClick={testTTSConnection}
                        disabled={ttsTest.status === 'testing' || !ttsSampleText.trim() || (settings.tts.provider !== 'edge' && !activeTTSApiKey)}
                        className="px-6 py-3 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 bg-green-700 hover:bg-green-600 text-white">
                        {ttsTest.status === 'testing' ? '⏳ 生成中...' : '🧪 生成测试语音'}
                      </button>
                      {settings.tts.provider === 'edge' && (
                        <button onClick={() => window.speechSynthesis.cancel()} className="px-6 py-3 rounded-lg text-sm font-semibold bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors">
                          停止朗读
                        </button>
                      )}
                    </div>
                    {renderTestResult(ttsTest)}
                    {ttsPreviewUrl && (
                      <audio controls autoPlay src={ttsPreviewUrl} className="w-full rounded-lg" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'stt' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-indigo-300 mb-2">语音识别 (STT) 配置</h3>
                <p className="text-sm text-gray-500 mb-5">语音输入转文字。浏览器内置识别免费，也可接入外部 API。</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2 font-medium">Provider</label>
                    <select value={settings.stt.provider} onChange={(e) => updateSTTProvider(e.target.value as STTProviderType)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-gray-200 text-sm focus:border-indigo-500 focus:outline-none transition-colors">
                      {STT_PROVIDER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  {settings.stt.provider !== 'browser' && (
                    <>
                      {field('API Key', settings.stt.apiKey, (v) => updateSTTConfig({ apiKey: v }), { type: 'password' })}
                      {field('Endpoint', settings.stt.endpoint, (v) => updateSTTConfig({ endpoint: v }))}
                      {field('Model', settings.stt.model, (v) => updateSTTConfig({ model: v }))}
                    </>
                  )}
                  <div>
                    <label className="block text-sm text-gray-400 mb-2 font-medium">识别语言</label>
                    <select value={settings.stt.language} onChange={(e) => updateSTTConfig({ language: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-gray-200 text-sm focus:border-indigo-500 focus:outline-none transition-colors">
                      <option value="zh-CN">中文（简体）</option>
                      <option value="en-US">English</option>
                      <option value="zh">中英混合</option>
                    </select>
                  </div>
                  <div className="rounded-xl border border-gray-700 bg-gray-950/40 p-4 space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-200 mb-1">连通性测试</h4>
                      <p className="text-xs text-gray-500">浏览器模式会直接调用内置识别；OpenAI / 兼容接口会走转写接口；MiMo 会把录音作为音频输入发送给 chat/completions 做逐字转写。</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button onClick={sttCaptureState === 'capturing' ? stopSTTTest : startSTTTest}
                        disabled={sttCaptureState === 'processing' || (settings.stt.provider !== 'browser' && !settings.stt.apiKey)}
                        className="px-6 py-3 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 bg-green-700 hover:bg-green-600 text-white">
                        {sttCaptureState === 'capturing'
                          ? (settings.stt.provider === 'browser' ? '停止识别' : '停止录音并识别')
                          : (settings.stt.provider === 'browser' ? '🧪 开始语音识别测试' : '🎙️ 开始录音测试')}
                      </button>
                      {sttCaptureState !== 'idle' && (
                        <button onClick={resetSTTTest} className="px-6 py-3 rounded-lg text-sm font-semibold bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors">
                          取消测试
                        </button>
                      )}
                    </div>
                    {renderTestResult(sttTest)}
                    {sttTranscript && (
                      <div className="rounded-lg border border-gray-700 bg-black/20 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-2">识别结果</div>
                        <p className="text-sm text-gray-200 leading-6">{sttTranscript}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'image' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-indigo-300 mb-2">图片生成 配置</h3>
                <p className="text-sm text-gray-500 mb-5">地形插画 + NPC 立绘。如 GM 的 LLM API 不支持画图，可在此单独配置。</p>
                <div className="space-y-4">
                  {toggle('启用插画生成', settings.imageGenEnabled, settings.setImageGenEnabled)}
                  <div>
                    <label className="block text-sm text-gray-400 mb-2 font-medium">Provider</label>
                    <select value={settings.imageGen.provider} onChange={(e) => updateImageProvider(e.target.value as ImageProviderType)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-gray-200 text-sm focus:border-indigo-500 focus:outline-none transition-colors">
                      {IMAGE_PROVIDER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  {field('API Key', settings.imageGen.apiKey, (v) => updateImageConfig({ apiKey: v }), { placeholder: '留空使用 GM 的 Key', type: 'password' })}
                  <p className="text-xs text-gray-500 -mt-2">留空时会自动复用 AI Agent 的 Key。测试会发起一次真实图片生成请求。</p>
                  {field('Endpoint', settings.imageGen.endpoint, (v) => updateImageConfig({ endpoint: v }))}
                  {field('Model', settings.imageGen.model, (v) => updateImageConfig({ model: v }))}
                  <div>
                    <label className="block text-sm text-gray-400 mb-2 font-medium">图片尺寸</label>
                    <select value={imageSizeSelectValue} onChange={(e) => {
                      if (e.target.value === '__custom__') return;
                      updateImageConfig({ size: e.target.value });
                    }}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-gray-200 text-sm focus:border-indigo-500 focus:outline-none transition-colors">
                      {IMAGE_SIZE_PRESETS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                      <option value="__custom__">自定义尺寸</option>
                    </select>
                  </div>
                  {field('自定义尺寸', settings.imageGen.size, (v) => updateImageConfig({ size: v }), { placeholder: '例如 1920x1920 / 1536x1024' })}
                  <p className="text-xs text-gray-500 -mt-2">支持直接输入任意 `宽x高`。部分图片服务只接受固定尺寸，实际以服务端支持范围为准。</p>
                  <div className="rounded-xl border border-gray-700 bg-gray-950/40 p-4 space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-200 mb-1">连通性测试</h4>
                      <p className="text-xs text-gray-500">会用当前配置生成一张示例图，验证接口是否真的返回图片数据。</p>
                    </div>
                    {textareaField('测试提示词', imagePrompt, setImagePrompt, { rows: 4, placeholder: '输入测试用图片提示词' })}
                    <button onClick={testImageConnection}
                      disabled={imageTest.status === 'testing' || !imagePrompt.trim() || !activeImageApiKey}
                      className="px-6 py-3 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 bg-green-700 hover:bg-green-600 text-white">
                      {imageTest.status === 'testing' ? '⏳ 生成中...' : '🧪 生成测试图片'}
                    </button>
                    {renderTestResult(imageTest)}
                    {imagePreviewUrl && (
                      <div className="space-y-3">
                        <img src={imagePreviewUrl} alt="测试生成图片" className="w-full max-w-xl rounded-xl border border-gray-700 object-cover" />
                        <a href={imagePreviewUrl} target="_blank" rel="noreferrer" className="inline-flex text-sm text-indigo-300 hover:text-indigo-200">
                          在新窗口打开预览
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'server' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-indigo-300 mb-2">服务器配置</h3>
                <div className="space-y-4">
                  {field('服务器地址', settings.server.endpoint, (v) => updateServerConfig({ endpoint: v }))}
                  <div className="rounded-xl border border-gray-700 bg-gray-950/40 p-4 space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-200 mb-1">连通性测试</h4>
                      <p className="text-xs text-gray-500">会检测根路径是否可达，并校验故事书接口是否能返回游戏运行所需数据。</p>
                    </div>
                    <button onClick={testServerConnection}
                      disabled={serverTest.status === 'testing' || !settings.server.endpoint.trim()}
                      className="px-6 py-3 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 bg-green-700 hover:bg-green-600 text-white">
                      {serverTest.status === 'testing' ? '⏳ 检测中...' : '🧪 测试服务器连接'}
                    </button>
                    {renderTestResult(serverTest)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'game' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-indigo-300 mb-2">游戏设置</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2 font-medium">游戏语言</label>
                    <select value={settings.language} onChange={(e) => settings.setLanguage(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-gray-200 text-sm focus:border-indigo-500 focus:outline-none transition-colors">
                      <option value="zh-CN">中文 (简体)</option>
                      <option value="en-US">English (US)</option>
                    </select>
                  </div>
                  {toggle('流式输出', settings.enableStreaming, settings.setStreaming)}
                  {toggle('GM 语音朗读', settings.ttsEnabled, settings.setTTSEnabled)}
                  {toggle('NPC 独立配音', settings.npcIndependentVoice, settings.setNPCIndependentVoice)}
                  {toggle('AI 插画绘制', settings.imageGenEnabled, settings.setImageGenEnabled)}
                </div>
              </div>

              {/* PR-4: GM 长期记忆层设置 */}
              <div className="border-t border-gray-700/60 pt-5">
                <h3 className="text-base font-semibold text-indigo-300 mb-1">🧠 GM 长期记忆层</h3>
                <p className="text-xs text-gray-500 mb-4">控制 GM 能否在多轮/多会话后回忆"过去发生过什么"。本期默认永不遗忘。</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2 font-medium">后端</label>
                    <select
                      value={settings.memory?.backend ?? 'local'}
                      onChange={(e) => settings.setMemoryBackend(e.target.value as 'local' | 'mem0')}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-gray-200 text-sm focus:border-indigo-500 focus:outline-none transition-colors">
                      <option value="local">本地 (IndexedDB / localStorage)</option>
                      <option value="mem0" disabled>Mem0 (云/自托管, 未启用)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2 font-medium">衰减策略</label>
                    <select
                      value={settings.memory?.decayStrategy ?? 'none'}
                      onChange={(e) => settings.setMemoryDecayStrategy(e.target.value as 'none' | 'gentle' | 'forgetting_curve' | 'aggressive')}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-gray-200 text-sm focus:border-indigo-500 focus:outline-none transition-colors">
                      <option value="none">无 (永不遗忘, 推荐)</option>
                      <option value="gentle">温和 (旧+低重要性 10% 随机遗忘)</option>
                      <option value="forgetting_curve">遗忘曲线 (艾宾浩斯 e^(-t/τ))</option>
                      <option value="aggressive">激进 (容量上限 + importance 升序淘汰)</option>
                    </select>
                    <p className="text-[11px] text-gray-500 mt-1">
                      跨策略保护: 24h 内 / importance≥0.9 / 当前场景活跃实体的近 5 条豁免。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

          {/* Footer */}
          <div className="border-t border-ink-700/60 px-8 py-5 flex justify-between items-center bg-ink-950/50">
            <div className="flex items-center gap-2 text-sm">
              {settings.llm.apiKey ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-breathe shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                  <span className="text-emerald-300/90 font-sans">GM API 已配置</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-breathe shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
                  <span className="text-amber-300/90 font-sans">请配置 AI Agent</span>
                </>
              )}
            </div>
            <button
              onClick={closeModal}
              className="group relative px-8 py-2.5 rounded-xl overflow-hidden
                         bg-gradient-to-r from-indigo-600 to-purple-600
                         hover:from-indigo-500 hover:to-purple-500
                         text-white font-medium transition-all duration-200
                         shadow-lg shadow-indigo-900/30
                         hover:shadow-[0_0_24px_rgba(99,102,241,0.4)]
                         hover:border-gold-400/40 border border-indigo-400/20
                         font-sans tracking-wide text-sm"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px
                           bg-gradient-to-r from-transparent via-gold-400/70 to-transparent
                           -translate-x-full group-hover:translate-x-full
                           transition-transform duration-700 ease-out"
              />
              确认关闭
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
