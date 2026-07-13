# DocMap

**Live:** [`http://136.112.234.125:3000`](http://136.112.234.125:3000) · **Demo:** [3-min walkthrough on YouTube](https://youtu.be/P37qhtkRfv8) · **Repo:** [github.com/TLiu2014/slack-docmap](https://github.com/TLiu2014/slack-docmap)

A Slack app that scans channel history for shared document links, asks an LLM (Gemini / OpenAI / Claude / Qwen) to extract a structured graph of who shared what and how docs relate, then renders the result as a Markdown summary + interactive React Flow canvas.

DocMap has two triggers backed by one shared pipeline:

- **Slack** — `/docmap` slash command, App Home settings, DM entry point.
- **MCP** — an MCP server (`docmap.analyze`, `docmap.get_graph`) that any MCP-capable AI host (Claude Desktop, Cursor, Claude Code) can call from a chat context.

See **[architecture.md](./architecture.md)** for the full diagram.

## Quick start (local dev)

```bash
pnpm install
cp server/.env.example server/.env   # then fill in the keys you have
pnpm dev                              # starts server (:3000) and UI (:5173)
```

The current build uses an **in-memory graph store** on both local dev and the deployed instance — no database setup step. Restarting the server clears any graphs generated so far. A persistent-store toggle for local dev is on the roadmap; a Prisma/SQLite schema still lives in `server/prisma/schema.prisma` for when we wire it back in.

See **[DEVELOPMENT.md](./DEVELOPMENT.md)** for the full local-testing guide (mock-data path, Slack Socket Mode path, MCP path, and sandbox provisioning). For the hackathon-submission checklist see **[HACKATHON.md](./HACKATHON.md)**.

## Deployment (GCP)

DocMap ships as a single container (server + built UI in one image) on a GCE `e2-micro` VM in the always-free tier. Graphs are stored in-memory in the deployed instance — no database — so container restarts wipe prior graphs. See **[deployment.md](./deployment.md)** for the full build → push → run playbook.

## Slack surface — how to invoke

| Command | Behavior |
| --- | --- |
| `/docmap` | Returns an ephemeral form: pick channels (`multi_channels_select`) + start date (`datepicker`) + **Generate Interactive Map** button. |
| `/docmap quick` | Bypasses the form. Defaults to the current channel and the last 7 days. |
| `/docmap settings` | Reopens the config form even if the user has toggled the "skip form" preference. |

Both paths funnel into one pipeline:

1. Post a loading message via `chat.postMessage` and DM the invoker (never in-channel).
2. Query Slack (`search.messages` on `main`, `assistant.search.context` on the `rts-api` branch) against the selected channels + timeframe.
3. If 0 results → update to `🚫 No document links found in this timeframe.` and halt.
4. Otherwise → cap at 100 messages → update to `✨ Analyzing document connections…`.
5. LLM returns the graph → stored under a UUID in the in-memory graph store → final message links to the viewer URL for that id.

## MCP surface — how to invoke

Add DocMap to any MCP host and call the `analyze` tool with a channel id + timeframe. Full config snippet + tool signatures live in [DEVELOPMENT.md → Path C](./DEVELOPMENT.md#path-c--mcp-surface-claude-desktop-cursor-and-other-mcp-hosts).

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

The production image is a single multi-stage build at repo root: `Dockerfile` compiles the server + Vite UI and produces one `node:22-alpine` runtime image that serves both from the same origin. `docker-compose.yml` is for local Docker; `docker-compose.prod.yml` is what the GCE VM runs.

```bash
# Local build (for iteration or smoke test):
docker build --platform linux/amd64 -t slack-docmap:latest .

# Push to Artifact Registry + deploy: see deployment.md
```

## Layout

```
slack-docmap/
├── server/                # Bolt + Express + LLM adapters
│   ├── src/
│   │   ├── llm/          # ILLMProvider + Gemini/OpenAI/Claude/Qwen adapters + factory
│   │   ├── mcp/          # MCP server (docmap.analyze, docmap.get_graph)
│   │   ├── blocks.ts     # Block Kit components (form, loading, result)
│   │   ├── pipeline.ts   # Shared loading-UX pipeline
│   │   ├── slack.ts      # search.messages wrapper
│   │   ├── store.ts      # In-memory graph store (Map<uuid, graph>)
│   │   ├── db.ts         # In-memory UserPref store + Workspace stubs
│   │   └── index.ts      # Entry: HTTP API + Slack listeners + UI static serve
│   ├── prisma/           # Local SQLite schema
│   └── fixtures/         # mock-graph.json for UI dev
├── ui/                    # Vite + React + Tailwind + React Flow
├── Dockerfile             # Multi-stage: UI + server → one runtime image
├── docker-compose.yml     # Local (with build context)
├── docker-compose.prod.yml # VM deploy (image-only, no build)
└── deployment.md
```

---

## Slack API surface (RTS + fallback)

DocMap was built and verified against Slack's **Real-Time Search API** (`assistant.search.context`) on a personal workspace. Slack Developer Program sandboxes don't enable the tier that endpoint requires (`feature_not_enabled`), so `main` uses the classic `search.messages` endpoint for compatibility with the hackathon sandbox. The full RTS implementation lives on the [`rts-api`](https://github.com/TLiu2014/slack-docmap/tree/rts-api) branch and can be re-activated on any RTS-eligible workspace with no other code changes.
