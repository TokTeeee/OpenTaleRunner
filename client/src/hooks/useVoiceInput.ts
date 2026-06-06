import { useState, useRef, useCallback, useEffect } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { buildMimoTranscriptionRequest, DEFAULT_MIMO_CHAT_ENDPOINT, extractChatResponseText, shouldUseMimoChatAPI } from '../utils/mimo';
import { DEFAULT_OPENAI_STT_ENDPOINT, DEFAULT_OPENAI_STT_MODEL, getSTTProviderDefaults, type STTProviderType } from '../utils/providerCatalog';

type BrowserSpeechRecognitionResult = {
  isFinal: boolean;
  0: { transcript: string };
};

type BrowserSpeechRecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<BrowserSpeechRecognitionResult>;
};

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  abort: () => void;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition;

export function useVoiceInput() {
  const isSupported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const mountedRef = useRef(true);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* ignore */ }
        recognitionRef.current = null;
      }
    };
  }, []);

  const getRecognition = useCallback(() => {
    if (!isSupported) return null;
    if (recognitionRef.current) return recognitionRef.current;

    const SpeechRecognitionClass = (window as unknown as Record<string, BrowserSpeechRecognitionCtor>).SpeechRecognition
      || (window as unknown as Record<string, BrowserSpeechRecognitionCtor>).webkitSpeechRecognition;
    if (!SpeechRecognitionClass) return null;

    const settings = useSettingsStore.getState();
    const rec = new SpeechRecognitionClass();
    rec.lang = settings.stt.language || 'zh-CN';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event: BrowserSpeechRecognitionEvent) => {
      if (!mountedRef.current) return;
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript;
      }
      if (final) setTranscript(final);
    };

    rec.onerror = () => {
      if (mountedRef.current) setIsListening(false);
    };

    rec.onend = () => {
      if (mountedRef.current) setIsListening(false);
    };

    recognitionRef.current = rec;
    return rec;
  }, [isSupported]);

  const start = useCallback(async () => {
    const settings = useSettingsStore.getState();

    if (settings.stt.provider === 'browser' || !settings.stt.apiKey) {
      const rec = getRecognition();
      if (!rec) return;
      setTranscript('');
      setIsListening(true);
      try { rec.start(); } catch { /* already started */ }
      return;
    }

    // Custom API fallback
    try {
      setIsListening(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (!mountedRef.current) return;
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        try {
          const text = await sendToSTTAPI(blob, settings.stt);
          if (text && mountedRef.current) setTranscript(text);
        } catch {
          /* ignore */
        } finally {
          if (mountedRef.current) setIsListening(false);
        }
      };

      recorder.start();
    } catch {
      if (mountedRef.current) setIsListening(false);
    }
  }, [getRecognition]);

  const stop = useCallback(() => {
    const rec = recognitionRef.current;
    const mr = mediaRecorderRef.current;
    if (rec) {
      try { rec.abort(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    if (mr && mr.state === 'recording') {
      mr.stop();
      mediaRecorderRef.current = null;
    }
    setIsListening(false);
  }, []);

  return { isListening, transcript, isSupported, start, stop };
}

function normalizeSTTLanguage(language: string): string {
  return language.toLowerCase().startsWith('zh') ? 'zh' : language;
}

export async function sendToSTTAPI(audioBlob: Blob, config: { provider: STTProviderType; apiKey: string; endpoint: string; model: string; language: string }): Promise<string> {
  const defaults = getSTTProviderDefaults(config.provider);

  if (shouldUseMimoChatAPI(config.provider, config.endpoint, config.model)) {
    const resp = await fetch(config.endpoint || defaults.endpoint || DEFAULT_MIMO_CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(await buildMimoTranscriptionRequest(audioBlob, {
        model: config.model || defaults.model,
        language: normalizeSTTLanguage(config.language || 'zh'),
      })),
    });

    if (!resp.ok) {
      const text = (await resp.text()).replace(/\s+/g, ' ').trim();
      throw new Error(text ? `${resp.status} ${text.slice(0, 120)}` : `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    return extractChatResponseText(data, { allowReasoningFallback: true });
  }

  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('model', config.model || defaults.model || DEFAULT_OPENAI_STT_MODEL);
  formData.append('language', normalizeSTTLanguage(config.language || 'zh'));

  const resp = await fetch(config.endpoint || defaults.endpoint || DEFAULT_OPENAI_STT_ENDPOINT, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${config.apiKey}` },
    body: formData,
  });

  if (!resp.ok) {
    const text = (await resp.text()).replace(/\s+/g, ' ').trim();
    throw new Error(text ? `${resp.status} ${text.slice(0, 120)}` : `HTTP ${resp.status}`);
  }

  const data = await resp.json();
  return data.text || '';
}
