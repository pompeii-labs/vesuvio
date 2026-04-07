# Vesuvio

Local AI agent daemon. One brain, multiple workstreams.

Vesuvio runs on your hardware — zero cloud dependencies, zero token costs. A persistent AI daemon that keeps state, remembers across sessions, and is accessible from any terminal on your network.

## What makes it different

- **Daemon-first** — `vesuviod` runs continuously. The CLI is a window into a running mind.
- **Workstreams** — not chat sessions. Named bodies of work with shared memory across all of them.
- **Local voice** — hands-free conversation via Kokoro TTS + Whisper STT. No cloud APIs.
- **Vector memory** — remembers facts, preferences, and context via semantic search.
- **Multi-device** — run the daemon on your rig, connect from any machine on the LAN.
- **Provider switching** — local models via Ollama, or remote models via OpenRouter. Switch at runtime.

## Quick start

```bash
# Install (downloads latest binary, adds to PATH)
curl -fsSL https://raw.githubusercontent.com/pompeii-labs/vesuvio/main/install.sh | bash

# Setup (interactive — detects services, configures everything)
vesuvio setup

# Start the daemon
vesuvio start -d

# Connect
vesuvio
```

To update:

```bash
vesuvio update          # install latest
vesuvio update --check  # check without installing
```

## Requirements

- [Bun](https://bun.sh) runtime
- [Ollama](https://ollama.com) with a model pulled (e.g. `ollama pull gemma4:26b`)
- [Lux](https://github.com/lux-db/lux) database (vectors, tables, pub/sub — required)

**Optional (for voice):**
- [Kokoro](https://github.com/remsky/kokoro-fastapi) TTS server
- [Faster Whisper](https://github.com/fedirz/faster-whisper-server) STT server

## CLI

```
vesuvio              # launch TUI
vesuvio start        # start daemon (foreground)
vesuvio start -d     # start daemon (background)
vesuvio stop         # stop daemon
vesuvio status       # show service health
vesuvio setup        # interactive config wizard
vesuvio logs         # tail daemon logs
vesuvio update       # update to latest version
vesuvio --host <ip>  # connect to remote daemon
```

## TUI commands

```
/work              browse and switch workstreams
/new <name>        create a new workstream
/rename <name>     rename current workstream
/model             show current model
/model <provider>  switch provider (ollama / openrouter)
/voice             toggle hands-free voice mode
/voices            pick a TTS voice
/say <text>        speak text
/help              show all commands
/clear             clear chat
/quit              exit
```

**Keyboard shortcuts:**
- `Ctrl+C` — clear input / interrupt agent / double-tap to exit
- `Ctrl+Y` — copy last response to clipboard
- `Escape` — interrupt agent
- `Page Up/Down` — scroll chat history

## Architecture

```
  Any terminal                        Your rig
  ┌──────────────┐              ┌─────────────────────────┐
  │  vesuvio     │──WebSocket──▶│  vesuviod (:7700)       │
  │  (TUI)       │   JSON-RPC   │                         │
  │              │◀─────────────│  Agent (Magma)           │
  └──────────────┘              │  ├── bash, files, search│
                                │  ├── web search, fetch  │
  ┌──────────────┐              │  ├── memory (vectors)   │
  │  vesuvio     │──WebSocket──▶│  └── workstream mgmt    │
  │  (2nd term)  │              │                         │
  └──────────────┘              │  Ollama (:11434)        │
                                │  Lux    (:6379)         │
                                │  Kokoro (:8880)         │
                                │  Whisper(:8001)         │
                                └─────────────────────────┘
```

- **One daemon, many clients** — connect from your laptop, desktop, phone (SSH), wherever.
- **One brain** — memory is global across all workstreams. Vesuvio remembers everything.
- **Workstreams** — each workstream has its own timeline. Switch between projects without losing context.

## Configuration

Config lives at `~/.vesuvio/config.json`. Created by `vesuvio setup` or manually:

```json
{
  "daemon": { "port": 7700 },
  "provider": "ollama",
  "ollama": { "host": "localhost", "port": 11434, "model": "gemma4:26b" },
  "lux": { "host": "localhost", "port": 6379 },
  "tts": { "host": "localhost", "port": 8880 },
  "stt": { "host": "localhost", "port": 8001 },
  "openrouter": { "apiKey": "sk-...", "model": "anthropic/claude-sonnet-4" },
  "tavily": { "apiKey": "tvly-..." }
}
```

Environment variables override config: `OPENROUTER_API_KEY`, `TAVILY_API_KEY`.

## Development

```bash
git clone https://github.com/pompeii-labs/vesuvio
cd vesuvio
bun install

# Start daemon in dev mode
bun run dev:daemon

# In another terminal, start TUI
bun run dev
```

## Stack

- **Runtime:** [Bun](https://bun.sh)
- **Agent:** [@pompeii-labs/magma](https://github.com/pompeii-labs/magma)
- **Database:** [Lux](https://github.com/lux-db/lux) (tables, vectors, pub/sub, streams)
- **LLM:** [Ollama](https://ollama.com) / [OpenRouter](https://openrouter.ai)
- **TTS:** [Kokoro](https://github.com/remsky/kokoro-fastapi)
- **STT:** [Faster Whisper](https://github.com/fedirz/faster-whisper-server)
- **Embeddings:** nomic-embed-text (via Ollama)
- **TUI:** [Ink](https://github.com/vadimdemedes/ink) (React for terminals)

## License

MIT — [Pompeii Labs](https://pompeiilabs.com)
