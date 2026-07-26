# Emerald

Emerald is the brain and decision-making service for the Luna Protocol ecosystem. It sits between platform adapters (bots) and the Sapphire LLM gateway, handling behavior evaluation, Sapphire communication, response processing, and connection management.

> **Architecture**: `Platform → Bot → WebSocket → Emerald → Sapphire (HTTP) → Krystal (llama.cpp)`

## How It Works

1. Bots connect to Emerald via WebSocket on port 3126
2. Bots forward user messages as `MessageEvent`s (optionally with `debug: true`)
3. Emerald evaluates behavior rules (burst, typo, sleep, mannerisms, voice chance)
4. Emerald strips bot mentions (`@Kalupso`, `<@userId>`) from the text
5. Emerald calls Sapphire's `/v1/respond` via **streaming** (`askStream`) — the response arrives token by token
6. **On the first token**, Emerald sends a `TypingCommand` to the bot — the typing indicator appears immediately
7. Remaining tokens are buffered; when complete, Sapphire returns final metadata (text, label, emotion, debug stats)
8. Emerald processes the response (applies typo/swap behavior, maps snake_case debug stats to camelCase)
9. Emerald sends a `RespondCommand` back to the bot with `responseText`, optional `voice` flag, and optional `debugStats`
10. The bot sends the response text to the platform (optionally as a voice message if `voice: true`)
11. If the stream output was degenerate, Sapphire discards it — no respond command is sent, typing expires naturally

## Components

### Core

- **`src/server.ts`** — WebSocket server that handles bot connections, message events, and sends commands
- **`src/brain.ts`** — Central decision engine: evaluates behavior rules, calls Sapphire via streaming, applies typo/swap, routes decisions
- **`src/sapphire-client.ts`** — HTTP client for communicating with Sapphire (`ask` for non-streaming, `askStream` for SSE streaming)
- **`src/protocol.ts`** — Type definitions for WebSocket messages (events & commands) including `debug`, `responseText`, `voice`, `BehaviorDebug`
- **`src/config.ts`** — Configuration management (YAML-based)

### Behavior

- **`src/behavior/sleep.ts`** — Sleep schedule behavior
- **`src/behavior/mannerisms.ts`** — Mannerism pattern injection (hesitation, burst, reactions)
- **`src/behavior/burst.ts`** — Burst message behavior
- **`src/behavior/typo.ts`** — Typo/letter-swap behavior and rate limiting

### State

- **`src/state/state.ts`** — State management (activity tracking, session limits)
- **`src/state/trigger.ts`** — Trigger evaluation (mentions, DMs, names, keywords, random)
- **`src/state/topic-fatigue.ts`** — Topic fatigue tracking

## Features

### Streaming + First-Token Typing

Instead of waiting for the full LLM response, Emerald streams from Sapphire's SSE endpoint. The first token triggers an immediate `TypingCommand` to the bot — the user sees "typing..." before the model has finished generating.

### Centralized Behavior Config

All behavior decisions live in Emerald's `config.yml`:
- Typo chance & layout (azerty/qwerty)
- Letter swap chance
- Burst chance & delays
- Hesitation chance & word list
- Sleep schedules & timezone
- Topic fatigue thresholds
- **Voice message chance** (decides when to set `voice: true` on the respond command)
- Forget chance

### Debug Mode

When `debug: true` is set on a `MessageEvent`, Sapphire returns token counts, timing, emotion state (valence/arousal), and classification confidence. Emerald forwards these as `debugStats` in the respond command. The bot appends formatted `-# ` lines.

### Mention Stripping

Bot mentions (`@Kalupso`, `<@userId>`) are stripped from the text before sending to Sapphire, preventing the model from echoing its own name.

## Protocol

### Events (Bot → Emerald)

- `MessageEvent` — `{ type: "message", id, client, channel, user, text, timestamp, isDM, mentions?, debug? }`
- `ReadyEvent` — `{ type: "ready", client, userId, username }`
- `BotMessageEvent` — `{ type: "bot_message", client, channel, text, timestamp }`
- `PresenceEvent` — `{ type: "presence", client, status }`

### Commands (Emerald → Bot)

- `RespondCommand` — `{ type: "respond", id, channel, text, responseText, delay, replyTo, replyStyle, hesitationWord?, burstPlan?, typoCorrection?, react?, voice?, sessionId?, debugStats? }`
- `TypingCommand` — `{ type: "typing", id, channel, duration }`
- `SetPresenceCommand` — `{ type: "set_presence", id, status, text?, activityType? }`
- `SpontaneousCommand` — `{ type: "spontaneous", id, channel, sessionId }`
- `ForgotCommand` — `{ type: "forgot", id, channel }`

### DebugStats

```typescript
{
  promptTokens: number;
  completionTokens: number;
  timeMs: number;
  tokensPerSecond: number;
  emotionStateValence: number;
  emotionStateArousal: number;
  classificationLabel: string;
  classificationConfidence: number;
  messageValence: number;
  messageArousal: number;
  behavior?: {
    typoChance, typoApplied,
    swapChance, swapApplied,
    burstChance, burstApplied,
    hesitationChance, hesitationApplied,
    voiceChance, voiceApplied,
    forgetChance,
    sleepMode: string | null;
    fatigueMultiplier: number;
  };
}
```

## Configuration

Copy `config.example.yml` to `config.yml`. All behavior parameters are documented in the example file.

```yaml
port: 3126
sapphire_host: "127.0.0.1"
sapphire_port: 3123
sapphire_bot_username: "User"
names: ["Luna", "Pixie"]
random_chance: 0.015
# ... see config.example.yml for full options
```

## Running

```bash
# Install
npm install

# Build (esbuild → self-cli.cjs)
npm run build

# Development
npm run dev

# Production (PM2)
npm run start
```
