# pi-minimal

> Minimal Pi agent setup. One command. No bloat.

```
npx github:scoutos-labs/pi-minimal
```

Installs the [Pi coding agent](https://shittycodingagent.ai/) with exactly two extensions:

| Extension | What it does |
|-----------|-------------|
| `pi-memory-md` | Persist facts, goals, and context across sessions as Markdown |
| `pi-autoresearch` | Autonomous research + experiment loop: try → benchmark → keep → repeat |

Nothing else. No subagents, no themes, no UI widgets, no frameworks.

A welcome note is written to `~/.pi/agent/notes/pi-minimal-welcome.md` on first install explaining how to use each extension.

---

## Usage

```bash
# Interactive install (recommended first time)
npx github:scoutos-labs/pi-minimal

# Non-interactive / CI
npx github:scoutos-labs/pi-minimal --yes

# Install into current project only
npx github:scoutos-labs/pi-minimal --local

# Check what's installed
npx github:scoutos-labs/pi-minimal status

# Diagnose problems
npx github:scoutos-labs/pi-minimal doctor

# Update everything
npx github:scoutos-labs/pi-minimal update
```

---

## Multi-provider

Pi supports all major LLM providers out of the box. Set any of these env vars before running `pi`:

| Env var | Provider | Example model |
|---------|----------|---------------|
| `ANTHROPIC_API_KEY` | Anthropic (Claude) | `claude-3-5-sonnet-20241022` |
| `OPENAI_API_KEY` | OpenAI | `gpt-4o` |
| `GROQ_API_KEY` | Groq (fast + cheap) | `llama-3.3-70b-versatile` |
| `CEREBRAS_API_KEY` | Cerebras (fastest) | `llama3.1-70b` |
| `OPENROUTER_API_KEY` | OpenRouter | `openai/gpt-4o` |
| `GOOGLE_API_KEY` | Google (Gemini) | `gemini-2.0-flash` |
| `MISTRAL_API_KEY` | Mistral | `mistral-large-latest` |

Or run `pi` and type `/login` to sign in with a Claude Pro/Max, ChatGPT Plus/Pro, Copilot, or Gemini subscription.

---

## Requirements

- Node.js >= 20
- npm
- git (for the autoresearch package)

---

## Why not LazyPi?

[LazyPi](https://github.com/robzolkos/lazypi) is great but installs 20+ packages including themes, UI widgets, and frameworks. pi-minimal is for agents and developers who want just enough — memory so Pi remembers context between sessions, and autoresearch for autonomous deep-dives — nothing else.

---

## License

MIT — [scoutos-labs](https://github.com/scoutos-labs)
