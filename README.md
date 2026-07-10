# slack-docmap

A Slack slash-command app that scans channel history for shared documents, asks an LLM (Gemini / OpenAI / Claude) to extract a structured graph of who shared what and how docs relate, then renders the result as a Markdown summary + interactive React Flow canvas.

## Quick start

```bash
pnpm install
cp server/.env.example server/.env   # then fill in the keys you have
pnpm dev                              # starts server (:3000) and UI (:5173)
```

See **[DEVELOPMENT.md](./DEVELOPMENT.md)** for the full local-testing guide (mock data path + full Slack path).

## Two ways to invoke the bot

| Command | Behavior |
| --- | --- |
| `/docmap` | Returns an ephemeral form: pick channels (`multi_channels_select`) + start date (`datepicker`) + **Generate Interactive Map** button. |
| `/docmap quick` | Bypasses the form. Defaults to the current channel and the last 7 days. Posts loading status straight into the channel. |
| `/docmap 30d` | Same as `/docmap quick` but with a custom timeframe. Treated as quick when run with `quick`. |

Both paths funnel into one pipeline:

1. `chat.postMessage` — `⏳ Fetching messages from Slack...`
2. `search.messages` against the selected channels.
3. If 0 results → `🚫 No document links found in this timeframe.` and halt.
4. Otherwise → cap at 100 messages → `🧠 Analyzing document connections with AI...`
5. LLM returns the graph → cached in-memory under a UUID → final message links to `http://localhost:5173/?id=<uuid>`.

## Switching LLM providers

Set `ACTIVE_LLM` in `server/.env` to one of:

```dotenv
ACTIVE_LLM=gemini   # default — needs GEMINI_API_KEY
ACTIVE_LLM=openai   # needs OPENAI_API_KEY
ACTIVE_LLM=claude   # needs ANTHROPIC_API_KEY
```

Each adapter lives in [`server/src/llm/`](./server/src/llm) and implements the shared `ILLMProvider` interface.

## ngrok tunneling (HTTP-mode Slack apps)

Socket Mode (the default in this repo) does **not** need ngrok — Bolt opens an outbound WebSocket. If you instead want to register an HTTP-mode Slack app (e.g. for a teammate to test against your laptop, or to match a production manifest), the workflow is:

```bash
# In terminal 1
pnpm dev:server

# In terminal 2
pnpm --filter @slack-docmap/server run tunnel
# → ngrok prints a public URL like https://abcd-1234.ngrok-free.app
```

Then in your Slack App config:

1. **Slash Commands → /docmap → Request URL** → `https://<ngrok-host>/slack/events`
2. **Interactivity & Shortcuts → Request URL** → `https://<ngrok-host>/slack/events`
3. **Event Subscriptions → Request URL** (if used) → `https://<ngrok-host>/slack/events`

> **Note:** the current server only exposes the Bolt HTTP receiver when `SLACK_APP_TOKEN` is **not** set. If you want HTTP mode end-to-end, comment out `SLACK_APP_TOKEN` in `.env`, set `SLACK_SIGNING_SECRET`, and swap the receiver in `server/src/index.ts`. Socket Mode is recommended for local dev.

## Docker

A production-optimized image lives at `server/Dockerfile` and a Compose file at the repo root.

```bash
# Build + run the server container; reads server/.env for secrets
docker compose up --build
```

The compose service exposes port `3000`. Set `UI_BASE_URL=http://host.docker.internal:5173` (or your deployed UI host) when running the server in Docker against a UI elsewhere.

## Layout

```
slack-docmap/
├── server/                # Bolt + Express + LLM adapters
│   ├── src/
│   │   ├── llm/          # ILLMProvider + Gemini/OpenAI/Claude adapters + factory
│   │   ├── blocks.ts     # Block Kit components (form, loading, result)
│   │   ├── pipeline.ts   # Shared loading-UX pipeline
│   │   ├── slack.ts      # search.messages wrapper
│   │   ├── store.ts      # In-memory graph cache
│   │   └── index.ts      # Entry: HTTP API + Slack listeners
│   ├── Dockerfile
│   └── fixtures/         # mock-graph.json for UI dev
├── ui/                    # Vite + React + Tailwind + Radix + React Flow
└── docker-compose.yml
```
