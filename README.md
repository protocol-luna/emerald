# Emerald

Centralized brain for Protocol Luna bots.

Bots (Jade, Pixieglow) connect via WebSocket and send raw platform events. Emerald evaluates triggers, manages state, and issues commands — the bots are pure adapters.

```
Discord → Jade (adapter) ──┐
                            ├── WebSocket :3126 ──→ Emerald (brain) ──→ Sapphire → Krystal
Matrix  → Pixieglow (adapter) ┘
```

## Features

Everything that used to be duplicated in each bot:

- **Trigger evaluation** — mention, name, keyword, DM, follow-up, random
- **Cooldowns** — anti-spam per channel
- **Sleep schedules** — timezone-aware time windows (active / slow / short / sleep)
- **Topic fatigue** — sliding window, delay multiplier, ignore bonus
- **Burst** — multi-fragment message planning
- **Hesitation** — "uh..." / "um..." prefix decisions
- **Forget** — random message drop
- **Reactions** — emoji picker with per-trigger chance
- **Session limits** — message count per channel with pause/resume
- **Delay computation** — message length, inactivity warmup, sleep, fatigue
- **Spontaneous timer** — periodic unprompted message evaluation
- **Typo & letter swap** — AZERTY/QWERTY keyboard adjacency

## Protocol

Bots send events, Emerald sends commands — all JSON over WebSocket.

```
Bot ──{ type: "message", id, channel, user, text, isDM }──→ Emerald
Bot ──{ type: "ready", client, userId, username }──────────→ Emerald
Bot ──{ type: "bot_message", channel, text, timestamp }───→ Emerald

Emerald ──{ type: "respond", channel, delay, react, hesitationWord, burstPlan, sessionId }──→ Bot
Emerald ──{ type: "typing", channel, duration }──→ Bot
Emerald ──{ type: "set_presence", status, text }──→ Bot
Emerald ──{ type: "spontaneous", channel, sessionId }──→ Bot
```

## Setup

```bash
git clone https://github.com/protocol-luna/emerald
cd emerald
npm install
cp config.example.yml config.yml
# edit config.yml
npm run build && npm start
```

## Configuration

All behavior is configured in `config.yml` (see `config.example.yml`). Hot-reloadable values are cached; restart required for `port`.

## Related

- [sapphire](https://github.com/protocol-luna/sapphire) — LLM gateway (classification, sessions, few-shot, emotion)
- [krystal](https://github.com/protocol-luna/krystal) — LLM inference server (llama.cpp)
- [jade](https://github.com/protocol-luna/jade) — Discord adapter (thin Emerald client)
- [pixieglow](https://github.com/protocol-luna/pixieglow) — Matrix adapter (thin Emerald client)

## License

MIT
