## 1. Overview

Three media subsystems: TTS (text-to-speech output), Image (image generation), and STT (speech-to-text input). Each subsystem supports 3+ providers, with configuration centrally managed in `settingsStore` and sensitive fields encrypted for persistence via CryptoService.

## 2. TTS Voice Output

### 2.1 TTSClient API

Constructor `new TTSClient(config?)` reads configuration from `settingsStore.tts` and supports optional voice/speed/provider overrides (for NPC use).

| Method | Description |
|---|---|
| `speak(text)` | Play full text asynchronously. Edge uses browser SpeechSynthesis; others use fetchTTS → decodeAudio → play |
| `speakStream(text)` | Split text by CJK punctuation (`。！？.!?`) then `fetchTTS` + `playSync` per sentence for sentence-by-sentence playback |
| `generateAudioBlob(text)` | Return raw audio Blob without playing |
| `stop()` | Stop current playback (AudioBufferSource + SpeechSynthesis) |

Internal flow: `generateAudioBlob` → `fetchTTS` (call API for binary) → `decodeAudio` (Web Audio API decoding) → `play` (async) / `playSync` (wait for sentence completion).

### 2.2 TTSQueue

FIFO playback queue, serial per-item playback:

- `enqueue(text, onStart?, onEnd?)` — Enqueue; auto-start playback if idle
- `playNext()` — Dequeue and play head; swallow exceptions to keep queue alive
- `clear()` — Clear queue and stop current playback
- `isPlaying` — Read-only playback state

### 2.3 Three Providers

| Provider | Implementation | Notes |
|---|---|---|
| **Edge** | `window.speechSynthesis` (Web Speech API) | Free, no API key required, auto-selects Chinese voice |
| **OpenAI** | POST `/v1/audio/speech`, returns audio blob | Supports voice/speed parameters |
| **MiMo** | Unified chat endpoint; `response_format: wav` in request; base64-decode audio from response | Uses `buildMimoTTSRequest` + `extractChatAudioBase64` |
| **Custom** | OpenAI-compatible path with custom endpoint | Same format as OpenAI TTS |

In Edge mode, `speakStream` degrades to whole-text playback (no sentence splitting) because the browser API does not support per-sentence callbacks.

### 2.4 NPC Voice Pool

`NPCVoiceManager.ts` — `assignVoiceToNPC(npcId)` deterministically assigns voices using DJB2 hashing.

Voice pool: 15 presets, cycling through 6 OpenAI voices (onyx / echo / fable / nova / shimmer / alloy), speed range 0.85–1.15, pitch range 0.8–1.15. Returns `NPCVoiceParams { voice_id, speed, pitch, provider: 'openai' }`.

The config switch `npcIndependentVoice` controls whether independent NPC voices are enabled.

### 2.5 Configuration

`TTSConfig { provider, apiKey, endpoint, model, voice, speed }`

| Config Item | Default |
|---|---|
| `provider` | `'openai'` |
| `endpoint` | OpenAI TTS endpoint |
| `model` | `'tts-1'` |
| `voice` | `'onyx'` |
| `speed` | `1.0` |
| `ttsEnabled` | `false` |
| `npcIndependentVoice` | `false` |

Provider defaults are fetched from `providerCatalog.getTTSProviderDefaults()` table.

## 3. Image Generation

### 3.1 ImageClient API

Constructor `new ImageClient()` reads configuration from `settingsStore.imageGen`. Falls back to `llm.apiKey` when API key is missing.

| Method | Description |
|---|---|
| `generate(prompt, cacheKey)` | Generate image, return data URL. Checks IndexedDB cache first; returns cached hit directly; otherwise calls API and writes to cache |

### 3.2 Three Providers

| Provider | Implementation |
|---|---|
| **OpenAI** | POST DALL-E API, `response_format: b64_json`, extract from `data[0].b64_json` |
| **Stable Diffusion** | POST endpoint, `response_format: url`; on return, fetch URL for image blob → base64 |
| **Custom** | OpenAI-compatible path; try `b64_json` first, fallback to URL mode |

All providers return data URLs in `data:image/png;base64,...` format.

### 3.3 IndexedDB Cache

| Property | Value |
|---|---|
| Database name | `aeslan-images` |
| Version | `1` |
| Object Store | `generated` |
| Key type | String (cacheKey) |
| Operations | `getCache(key)` / `setCache(key, base64)` |

Check cache before calling API to avoid regenerating the same image. Write failures are silently ignored.

### 3.4 Configuration

`ImageGenConfig { provider, apiKey, endpoint, model, size, quality }`

| Config Item | Default |
|---|---|
| `provider` | `'openai'` |
| `model` | `'dall-e-3'` |
| `size` | `'1024x1024'` |
| `quality` | `'standard'` |
| `imageGenEnabled` | `false` |

`quality` is only effective for the `dall-e-3` model.

## 4. STT Voice Input

### 4.1 useVoiceInput Hook

`useVoiceInput()` returns `{ isListening, transcript, isSupported, start, stop }`.

| Return Value | Description |
|---|---|
| `isListening` | Whether currently listening |
| `transcript` | Recognized text (final result overwrites) |
| `isSupported` | Whether the browser supports SpeechRecognition API |
| `start()` | Start listening. Browser provider uses Web Speech API; other providers use MediaRecorder → record → send to STT API |
| `stop()` | Stop listening and clean up resources |

**Dual-path design**:
- **Browser path**: `SpeechRecognition` API, `lang = stt.language`, `interimResults = true`, `continuous = false`
- **Custom path**: `navigator.mediaDevices.getUserMedia({ audio: true })` → `MediaRecorder` (`audio/webm`) → on `stop`, `new Blob(chunks)` → `sendToSTTAPI()`

### 4.2 Four Providers

| Provider | Implementation |
|---|---|
| **Browser** | Web Speech API (`SpeechRecognition`), free, no API key required |
| **OpenAI** | Whisper API: `POST /v1/audio/transcriptions`, FormData upload `audio.webm` |
| **MiMo** | Unified chat endpoint; `buildMimoTranscriptionRequest` base64-encodes audio as a message; `extractChatResponseText` extracts text |
| **Custom** | OpenAI-compatible path (Whisper format) |

`normalizeSTTLanguage()` converts locale codes like `zh-CN` to `zh` for API use.

### 4.3 Language Configuration

- Default language: `zh-CN`
- Browser provider directly uses `stt.language` to set `rec.lang`
- API providers process through `normalizeSTTLanguage()` (`zh-*` → `zh`)

### 4.4 Configuration

`STTConfig { provider, apiKey, endpoint, model, language }`

| Config Item | Default |
|---|---|
| `provider` | `'browser'` |
| `model` | `'whisper-1'` |
| `language` | `'zh-CN'` |

## 5. Related Systems

- **Architecture & Configuration (Architecture-and-Configuration.md)**: Full media config table, encryption storage mechanism
- **Security System (Security-System.md)**: `tts.apiKey`, `imageGen.apiKey` encrypted via AES-256-GCM for persistence
- **NPC System**: `assignVoiceToNPC()` assigns NPC voice parameters

## 6. Roadmap

We aim to further optimize TTS streaming playback, achieving first-sentence playback on generation start to minimize perceived latency, making voice output as natural and fluid as human conversation.

We look forward to batch image generation with gallery-style browsing, allowing players to generate multiple scene illustrations at once and review all generated visuals in a unified visual space.

We aim to extend TTS capabilities to multilingual support, covering voice output in Japanese, English, Korean, and other major languages, so that players of different language backgrounds can immerse themselves in narration in their native tongue.

Looking further ahead, we envision exploring video and animation generation technologies, laying the foundation for richer media formats such as cutscenes and scene animations in the future.
