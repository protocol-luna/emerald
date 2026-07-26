# Emerald

Emerald is the brain and decision-making service for the Luna Protocol ecosystem. It sits between platform adapters (bots) and the Sapphire LLM gateway, handling behavior evaluation, Sapphire communication, response processing, and connection management.

> **Architecture**: `Platform → Bot → WebSocket → Emerald → Sapphire (HTTP) → Krystal (llama.cpp)`

## How It Works

1. Bots connect to Emerald via WebSocket on port 3126
2. Bots forward user messages as `MessageEvent`s (optionally with `debug: true`)
3. Emerald evaluates behavior rules (burst, typo, sleep, mannerisms)
4. For non-empty messages, Emerald calls the Sapphire `/v1/respond` HTTP API with the user's message and behavior context
5. When `debug` is set, Emerald passes `"debug": true` to Sapphire, which returns token counts, timing, emotion state, and classification confidence
6. Sapphire's response includes emotion-aware sampling parameters — temperature adjusted by arousal, repeat penalty by valence
7. Emerald processes the response (applies typo/swap behavior, maps snake_case debug stats to camelCase)
8. Emerald sends a `RespondCommand` back to the bot with `responseText` and optional `debugStats`
9. The bot sends the response text to the platform (appending debug stats lines for debug mode)

## Components

### Core

- **`src/server.ts`** — WebSocket server that handles bot connections, message events, and sends commands
- **`src/brain.ts`** — Central decision engine: evaluates behavior rules, calls Sapphire, applies typo/swap, routes decisions
- **`src/sapphire-client.ts`** — HTTP client for communicating with Sapphire (snake_case → camelCase mapping)
- **`src/protocol.ts`** — Type definitions for WebSocket messages (events & commands) including `debug`, `responseText`, `DebugStats`
- **`src/config.ts`** — Configuration management (YAML-based)

### Behavior

- **`src/behavior/sleep.ts`** — Sleep schedule behavior
- **`src/behavior/mannerisms.ts`** — Mannerism pattern injection
- **`src/behavior/burst.ts`** — Burst message behavior
- **`src/behavior/typo.ts`** — Typo/letter-swap behavior and rate limiting

### State

- **`src/state/state.ts`** — State management
- **`src/state/trigger.ts`** — Trigger handling
- **`src/state/topic-fatigue.ts`** — Topic fatigue tracking

## Configuration

Copy `config.example.yml` to `config.yml`:

```yaml
# Server
host: "0.0.0.0"
port: 3126

# Sapphire connection
sapphire_host: "localhost"
sapphire_port: 3123
sapphire_timeout: 10

# Bot username (shown in Emerald logs)
bot_username: "Luna"

# Behavior configuration
behavior:
  burst:
    enabled: true
    min_interval: 2.0
    max_interval: 6.0
    max_messages: 2
    cooldown: 60
    reply_chance: 0.3
  sleep:
    enabled: true
    start_hour: 0
    end_hour: 8
    timezone: "UTC"
  typo:
    enabled: true
    chance: 0.08
    swap_chance: 0.12
  mannerisms:
    enabled: true
    chance: 0.075
  ignore_prefixes:
    - "!"
```

## Protocol

### Events (Bot → Emerald)

- `MessageEvent` — `{ type: "message", channelId, userId, userName, content, debug?: boolean }`

### Commands (Emerald → Bot)

- `RespondCommand` — `{ type: "respond", channelId, responseText, debugStats?: DebugStats }`
- `TypingCommand` — `{ type: "typing", channelId }`

### DebugStats

```typescript
{
  promptTokens: number;
  completionTokens: number;
  timeMs: number;
  tokensPerSecond: number;
  emotionState: { valence: number; arousal: number };
  classificationConfidence: number;
}
```

## Running

```bash
# Install
npm install

# Development
npm run dev

# Production (PM2)
npm run start
```
