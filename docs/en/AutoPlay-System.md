# AutoPlay System

> AutoPlay lets AI make decisions on behalf of the player. Once an LLM is configured, the AI reads the scene, chooses actions, and submits judgments autonomously — reusing the same PM engine pipeline as manual play.

---

## 1. Overview

AutoPlay is an independent AI decision engine. It does not modify the PM engine — it merely replaces the human player's "choose action" step. The engine reads the current scene and character state, calls the LLM to make a decision, then submits the chosen action text to the `usePMEngine.submitAction()` pipeline.

This means AutoPlay and manual play go through the exact same judgment system, PM narrative generation, consequence application, and auto-saving — the only difference is who makes the decision.

---

## 2. Design

### 2.1 State Machine

```
┌──────┐  start()   ┌─────────┐  pause()   ┌────────┐
│ idle │ ─────────→ │ running │ ─────────→ │ paused │
└──────┘            └─────────┘            └────────┘
    ↑                    │                      │
    │   stop()           │ 3 errors             │ resume()
    │   totalRounds=0    │ auto-stop            │
    │  ┌─────────┐       ↓                      ↓
    └──│  error  │  ┌─────────┐           ┌─────────┐
       └─────────┘  │ (cont.) │           │ running │
                    └─────────┘           └─────────┘
```

| Method | Behavior |
|---|---|
| `start()` | Create LLM Client → set `isActive=true` → begin decision loop |
| `pause()` | Cancel timer → `isActive=false` → preserve engine state |
| `resume()` | Rebuild LLM Client → `isActive=true` → resume loop |
| `stop()` | Cancel timer → abort LLM requests (`AbortController`) → `isActive=false` |
| `step()` | Execute exactly one round → return to `idle` |

**Round control**: `totalRounds = -1` means infinite loop. Auto-stops when `currentRound >= totalRounds > 0`.

### 2.2 LLM Decision Loop

Each round, `processRound()` follows this flow:

```
1. Guard checks
   ├─ !isActive? → return
   ├─ No character data? → stop() + error
   ├─ PM is processing (isWaitingForPM)? → retry after delay
   └─ No available choices & not player's turn? → retry after delay

2. Build context (PlayerDecisionContext)
   {
     characterName, background, attributes, hp, maxHp,
     vital, recentActions[5], sceneDescription, choices[]
   }

3. Call LLM → callPlayerAI(ctx)
    System prompt: "You are an AI agent for a TRPG player..."
    Expected output: JSON { choice_index: -1, custom_action: "", reasoning: "", style: "" }

4. Parse decision → parsePlayerDecision(raw)
   ├─ Success → return PlayerDecision
   └─ Failure → fallback to choice 0

5. Execute decision
   ├─ choiceIndex >= 0 → choices[choiceIndex].text
   ├─ customAction non-empty → customAction
   └─ Otherwise → choices[0].text || "Continue exploring"

6. Submit → this.submitAction(action)
    Enter PM engine pipeline (judgment → narrative → consequences → save)

7. Schedule next round → setTimeout(processRound, intervalMs)
```

### 2.3 JSON Parsing & Fallback

`parsePlayerDecision(raw: string)` uses a multi-layer parsing strategy:

```
1. Code block extraction: /```(?:json)?\s*([\s\S]*?)```/  — strip markdown fences
2. Trailing comma cleanup: remove illegal commas before } or ]
3. Brace extraction: depth scan to find outermost { ... }
4. JSON.parse(): parse the cleaned text
5. Fallback: on failure return { choiceIndex: 0, customAction: '', reasoning: 'Parse failed', style: 'explore' }
```

### 2.4 Shared Pipeline

```
AutoPlayEngine              usePMEngine
     │                           │
     │  constructor(submitAction)│
     │←─────────────────────────│  Inject submitAction callback
     │                           │
     │  this.submitAction(text)  │
     │──────────────────────────→│  Enter PM engine pipeline
     │                           │  ├─ Judgment system (2d6)
     │                           │  ├─ PM narrative generation
     │                           │  ├─ Consequence application
     │                           │  └─ Auto-save
     │                           │
```

AutoPlay does not re-implement any game logic — it is purely a "decision layer".

### 2.5 Error Handling

| Condition | Behavior |
|---|---|
| Single LLM call fails | `consecutiveErrors++`, continue next round |
| 3 consecutive failures | `stop()` + `setErrorMessage("3 consecutive failures: ...")` |
| Successful round | `consecutiveErrors = 0` (reset counter) |
| Character data empty | `stop()` + error message |
| LLM returns unparseable output | Fallback to choice 0, log `[AutoPlay] Decision parse failed` |

### 2.6 Hook API

`useAutoPlay()` exposes to UI components:

```typescript
const {
  startAutoPlay,         // Start auto-play
  pauseAutoPlay,         // Pause
  stopAutoPlay,          // Full stop
  stepAutoPlay,          // Single step
  startActivityReporter, // Start activity reporting (keep device awake)
  stopActivityReporter,  // Stop activity reporting
} = useAutoPlay();
```

Cleanup: engine and activity reporter are automatically stopped on component unmount.

### 2.7 AutoPlayStore State

| Field | Type | Default | Description |
|---|---|---|---|
| `status` | `'idle'\|'running'\|'paused'\|'error'` | `'idle'` | Engine status |
| `currentRound` | `number` | 0 | Current round |
| `totalRounds` | `number` | -1 | Total rounds (-1 = infinite) |
| `lastAction` | `string` | '' | Last action executed |
| `lastReasoning` | `string` | '' | LLM's decision reasoning |
| `errorMessage` | `string` | '' | Error message (non-empty → status='error') |
| `intervalMs` | `number` | 3000 | Round interval (ms) |

### 2.8 LLM Configuration

| Config Path | Description |
|---|---|
| `settingsStore.autoPlayUseSeparateConfig = false` | Reuse main LLM config |
| `settingsStore.autoPlayUseSeparateConfig = true` | Use dedicated `autoPlayLLM` config |
| Independent config defaults | DeepSeek, temp=0.7, maxTokens=1024 |

AutoPlay uses a lower `maxTokens` (1024 vs. main LLM's 4096) to save cost — decisions only need short JSON.

### 2.9 Related Systems

| System | Relationship |
|---|---|
| [PM Engine](PM-Engine-and-Prompt-System.md) | AutoPlay submits actions into the same PM pipeline |
| [Judgment System](Judgment-System.md) | AutoPlay actions go through the same 2d6 judgment |
| [Character System](Character-System.md) | Reads character attributes/status to build decision context |

---

## 3. Roadmap

We aim to give AI diverse decision-making styles: adventurous types charge into the unknown, cautious types advance step by step, social types thrive on interpersonal dynamics — making each auto-play session exhibit a distinct character personality. In combat, AI will also possess dynamic tactical awareness, autonomously choosing to attack, defend, or retreat based on its own HP, enemy strength, and party composition, rather than mechanically repeating actions.

We look forward to AutoPlay learning from experience. The plan is to introduce learning-based decision mechanisms that dynamically adjust strategy weights based on historical action success rates, so that AI behavior increasingly aligns with the character's strengths and the player's preferences over time.

We aim to support batch-play mode, allowing players to set a round count and let AI take over, then review key events and decisions in summary form — saving time without losing narrative continuity.

Looking further ahead, we envision multiplayer cooperative AutoPlay, where AI players in a multiplayer room can coordinate actions and divide responsibilities, forming a genuine AI adventuring party.
