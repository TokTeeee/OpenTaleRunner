# Security System

> Aeslan's security design covers client-side key protection, prompt injection defense, XSS output filtering, server-side authentication & authorization, and rate limiting.

---

## 1. Introduction

The security system is split into two layers: client and server. The client protects user-configured AI API Keys from being exposed as plaintext in browser storage, defends LLM-bound user input against injection attacks, and applies XSS filtering to LLM-returned text. The server secures the API via JWT authentication, token blacklisting, rate limiting, and a CORS allowlist.

---

## 2. Design

### 2.1 API Key Encrypted Storage

**Threat Model**: Browser DevTools, malicious extensions, and physical disk access can read plaintext keys from `localStorage`.

**Implementation**: `services/crypto/CryptoService.ts`

| Step | Algorithm / Mechanism |
|---|---|
| Encryption | AES-256-GCM (Web Crypto API) |
| Key Derivation | PBKDF2, 100,000 iterations, SHA-256 |
| Derivation Material | Device-unique seed (`aeslan-device-seed`) + application salt (`aeslan-crypto-v1`) |
| Device Seed | 32-byte random value, generated on first use, stored in `localStorage` |
| Ciphertext Format | `$AESLAN1$<base64(12-byte random IV + ciphertext)>` |
| IV | Fresh 12-byte random IV per encryption |

**Encrypted Fields** (handled automatically by the Zustand persist pipeline):

```
llm.apiKey
autoPlayLLM.apiKey
stt.apiKey
tts.apiKey
imageGen.apiKey
token (auth)
```

**Persistence Flow**: `createSecureStorage()` returns a Zustand persist-compatible storage adapter. On `setItem()`, all sensitive fields are encrypted before writing to `localStorage`; on `getItem()`, they are decrypted. Non-sensitive fields pass through unchanged.

**Limitations**: Browser-only protection; no hardware security module; cannot defend against in-process memory reads.

### 2.2 Prompt Injection Defense

`sanitizePromptInput(text: string): string` applies 10 regex-based replacements to user input before every LLM call:

| Attack Vector | Mitigation |
|---|---|
| Markdown header injection (`###`) | → `# # #` |
| Separator injection (`---`) | → `- - -` |
| Code block closing (` ```json ``` `) | → ` ` ` ` json ` ` ` ` ` |
| JSON injection (`{"action_type":`) | → `{ " action_type "` |
| System tag (`<system>`) | → `&lt;system&gt;` |
| Instruction tag | → `&lt;instruction&gt;` |
| Instruction override (`ignore previous instructions`) | → `[instruction redacted]` |
| Global override (`ignore all previous`) | → `[instruction redacted]` |
| User/Assistant role spoofing | → `&lt;user&gt;` |
| Generic injection marker escaping | Reserved-word escaping |

Call site: within `useActionSubmit`, `sanitizePromptInput(action)` is passed as `playerAction` into the PM engine.

### 2.3 XSS Output Filtering

`sanitizeHtml(dirty: string): string` uses DOMPurify to filter LLM-returned HTML:

| Category | Policy |
|---|---|
| Allowlisted Tags | `b`, `i`, `em`, `strong`, `br`, `p`, `ul`, `ol`, `li`, `span` |
| Allowlisted Attributes | `class` |
| Everything Else | Stripped |

React's auto-escaping (text inserted via `{}` in JSX is escaped by default) is the primary defense line; DOMPurify serves as a second line for `dangerouslySetInnerHTML` scenarios.

### 2.4 Server-Side JWT Authentication

| Parameter | Value |
|---|---|
| Algorithm | HS256 |
| Payload | `{ sub: player_id, iat, exp, jti }` |
| Default TTL | 72 hours (`SERVICE_JWT_EXPIRE_HOURS`) |
| Secret | `SERVICE_JWT_SECRET` (required; use `openssl rand -hex 32` in production) |

**Token Refresh**: `POST /api/v1/auth/refresh` — uses a currently valid token to obtain a new one. The old token is added to the blacklist.

**Token Logout**: `POST /api/v1/auth/logout` — SHA-256 hashes the token and adds it to the in-memory blacklist.

**Blacklist**: In-memory `dict[hash, expiry]`, protected by `threading.Lock`. A background loop purges expired entries every 600s. Not persisted (cleared on service restart).

**Freshness Check**: `require_fresh_token()` — a dependency injection that requires the token's `iat` to be within 300s (for sensitive operations such as deleting a character or disbanding a room).

### 2.5 Rate Limiting

| Parameter | Default | Environment Variable |
|---|---|---|
| Limit | 60 requests / window | `SERVICE_RATE_LIMIT` |
| Window | 60 seconds | `SERVICE_RATE_WINDOW` |
| Granularity | Per IP | — |
| Over-limit Response | HTTP 429 | — |

Implemented as a FastAPI middleware `RateLimiter` (`server/middleware.py`), using a simplified token-bucket algorithm (timestamps + counts), protected by `threading.Lock`.

### 2.6 CORS

Configurable allowlist via `SERVICE_CORS_ORIGINS` (comma-separated), defaults to `http://localhost:5173,http://localhost:3000`. The Dashboard (port 8081) uses `allow_origins=["*"]` (public read-only).

### 2.7 Related Systems

| System | Relationship |
|---|---|
| [Architecture & Configuration](Architecture-and-Configuration.md) | Full security configuration item listing |
| [API Reference](API-Reference.md) | Auth-related endpoints |
| [Client Architecture](Client-Architecture.md) | CryptoService integration point |

---

## 3. Roadmap

We aim to support user-defined master passwords as the root encryption key, replacing the current device-seed-based derivation scheme and giving users full sovereignty over their own data. An audit log system will be introduced in parallel, recording security events such as login, logout, token refresh, and rate-limit exceedance to provide a solid data foundation for security auditing and anomaly detection.

Further exploration includes WebAuthn/Passkeys and other hardware-backed authentication capabilities, elevating login security to a level that eliminates memorized passwords. Sensitive-operation protection workflows will be hardened — requiring mandatory fresh-token verification and user double-confirmation before critical actions such as deleting a character or disbanding a room, eliminating CSRF and replay attack risks.

The long-term vision is to provide optional end-to-end encryption for character data and chronicle entries, ensuring that even the server cannot read the player's core game data, achieving true data sovereignty and a zero-trust architecture.
