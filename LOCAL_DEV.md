# Local Dev & Test Guide (Phase 3: Monetization)

How to run DocMap locally and exercise the Phase 3 features: the free-tier quota,
the mock Stripe upgrade, and Enterprise BYOK keys.

## TL;DR — your questions

- **Which UI?** Two surfaces:
  - **Web app** (`http://localhost:5173`) — the Admin Dashboard at **`/billing`**
    (tier, mock Stripe upgrade, Enterprise BYOK form) and the graph viewer
    (`/?id=<uuid>`).
  - **Slack** — only needed to run the real `/docmap` command and see the free-tier
    upgrade message in-channel. Most of Phase 3 can be tested from the web + `curl`
    **without Slack**.
- **Do I need Docker?** **No.** Local dev uses **SQLite** (a plain file — no DB
  server). Docker/Postgres is only for production-style runs.

---

## 0. Prerequisites

- Node ≥ 20, pnpm ≥ 11
- For the `/docmap` command (Path B): a Slack workspace where you can **install a
  custom app** (admin or "approved apps" access), plus an LLM key
  (Gemini/OpenAI/Claude) so the analysis step produces a real graph
- For web-only testing (Path A): nothing beyond Node/pnpm

## 1. One-time setup

```bash
pnpm install
cp server/.env.example server/.env
```

Edit `server/.env` and make sure these are set (the rest can stay empty for
web-only testing):

```dotenv
# Database (SQLite — no server needed)
DATABASE_URL="file:./dev.db"

# Encrypts BYOK keys at rest. Any long random string; keep it stable.
ENCRYPTION_KEY=some-long-random-dev-string

PORT=3000
UI_BASE_URL=http://localhost:5173
```

Create the local database (one time, and again whenever the schema changes):

```bash
pnpm --filter @slack-docmap/server run db:push
```

This creates `server/prisma/dev.db`. Inspect it anytime with:

```bash
pnpm --filter @slack-docmap/server run db:studio   # opens Prisma Studio in the browser
```

## 2. Run it

```bash
pnpm dev        # starts server on :3000 and the web UI on :5173 (parallel)
```

Or in two terminals: `pnpm dev:server` and `pnpm dev:ui`.

Expected server logs:

```
[http] listening on :3000
[slack] SLACK_BOT_TOKEN and/or SLACK_APP_TOKEN missing — slash command disabled.   # fine for web-only
```

---

## Path A — Test Phase 3 from the web only (no Slack)

This is the fastest way to verify the monetization architecture.

### A1. Open the Admin Dashboard

Go to **<http://localhost:5173/billing>**.

- It loads a dev workspace (`T_DEV_WORKSPACE`) and auto-creates it on the FREE tier.
- To use a specific team id: `http://localhost:5173/billing?team=T012345`.

### A2. Billing tab — mock Stripe upgrade

1. You start on **FREE** with a usage meter.
2. Click **Upgrade to Pro (Stripe)** → tier flips to **PRO** (this is the mock
   checkout; no real Stripe call).
3. Click **Simulate Enterprise activation** → tier flips to **ENTERPRISE**
   (Enterprise is normally sales-assisted; this button exists for local testing).
4. **Downgrade to Free** resets it.

### A3. Enterprise Settings tab — BYOK keys

- On FREE/PRO the tab is **locked** with an explanatory message.
- On **ENTERPRISE**, the BYOK form unlocks. Enter any string into the OpenAI /
  Anthropic / Gemini / Qwen fields and click **Save keys**.
- The field labels flip to **● Configured**. Raw keys are never sent back to the
  browser — only "is it set" booleans.

### A4. Verify it end-to-end with curl (optional)

```bash
B=http://localhost:3000

# Auto-create + read a FREE workspace
curl -s $B/api/workspace/TTEST | python3 -m json.tool

# Saving keys on FREE is rejected (403)
curl -s -o /dev/null -w "%{http_code}\n" -X POST $B/api/workspace/settings \
  -H 'content-type: application/json' \
  -d '{"slackTeamId":"TTEST","geminiKey":"AIza-demo"}'        # -> 403

# Mock Stripe checkout -> ENTERPRISE
curl -s -X POST $B/api/workspace/TTEST/checkout \
  -H 'content-type: application/json' -d '{"tier":"ENTERPRISE"}' | python3 -m json.tool

# Now BYOK save is allowed
curl -s -X POST $B/api/workspace/settings \
  -H 'content-type: application/json' \
  -d '{"slackTeamId":"TTEST","geminiKey":"AIza-demo"}' | python3 -m json.tool
```

### A5. Confirm keys are encrypted at rest

```bash
python3 - <<'PY'
import sqlite3
c = sqlite3.connect('server/prisma/dev.db')
print(c.execute("SELECT tier, customGeminiKey FROM Workspace WHERE slackTeamId='TTEST'").fetchone())
PY
# customGeminiKey should look like  v1:<iv>:<tag>:<ciphertext>  — never the plaintext.
```

---

## Path B — Test `/docmap` end-to-end in real Slack

This runs the actual command: scan a channel for shared docs → LLM builds a graph
→ results post back into Slack with a link to the interactive map. Uses **Socket
Mode**, so **no ngrok / public URL is required**.

You need an LLM key for this path (set `ACTIVE_LLM` + that provider's key in
`server/.env`), otherwise the graph will be empty.

### B1. Create the Slack app (one time)

1. Go to <https://api.slack.com/apps> → **Create New App** → **From scratch**.
   Name it `DocMap`, pick a workspace you can install to.
2. **Socket Mode** → toggle **Enable Socket Mode** ON. When prompted, generate an
   **App-Level Token** with the `connections:write` scope → copy the `xapp-…`
   token. This is `SLACK_APP_TOKEN`.
3. **Slash Commands** → **Create New Command**:
   - Command: `/docmap`
   - Request URL: anything (e.g. `https://example.com/slack`) — Socket Mode ignores it.
   - Short description: `Map docs shared in this channel`
   - Usage hint: `[Nd] [quick]`
4. **Interactivity & Shortcuts** → toggle **Interactivity** ON (needed for the
   channel/date form + buttons). Request URL can again be any placeholder.

### B2. Permissions (scopes) you need

Under **OAuth & Permissions**, add these scopes, then **Install to Workspace**.

| Token | Scope | Why |
| --- | --- | --- |
| Bot | `commands` | Receive the `/docmap` slash command |
| Bot | `chat:write` | Post the loading + result messages |
| Bot | `channels:read` | Resolve public channel names |
| Bot | `groups:read` | (Optional) resolve private channel names |
| **User** | `search:read` | **Required** — `search.messages` runs on the *user* token |
| App-level | `connections:write` | Socket Mode connection (from step B1.2) |

After installing, copy from **OAuth & Permissions**:

- **Bot User OAuth Token** (`xoxb-…`) → `SLACK_BOT_TOKEN`
- **User OAuth Token** (`xoxp-…`) → `SLACK_USER_TOKEN`

> Why a user token? Slack's `search.messages` API is user-scoped — a bot token
> can't call it. Without `SLACK_USER_TOKEN` the history fetch returns empty and
> you'll get a near-empty graph.

### B3. Configure `server/.env` and run

```dotenv
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_USER_TOKEN=xoxp-...

# Pick a provider you have a key for:
ACTIVE_LLM=gemini            # gemini | openai | claude
GEMINI_API_KEY=...
```

```bash
pnpm dev
```

Expected logs now include:

```
[http] listening on :3000
[slack] socket mode connected
```

### B4. Seed a channel with sample docs

`/docmap` only finds messages that contain document links. Use the ready-made
test data in **[`samples/slack-seed-messages.md`](./samples/slack-seed-messages.md)**:

1. Create/pick a channel, e.g. `#platform-guild`.
2. Invite the bot: `/invite @DocMap`.
3. Copy each line from the sample file and post it as **its own message** (each
   linked message must carry its link). The links are real and public, so you can
   click any of them to confirm what the map should contain.
4. Wait ~10–30s for Slack to index the messages.

### B5. Run the command

**Quick mode** (current channel, last 7 days, no form):

```
/docmap quick
```

**Interactive mode** (multi-channel + date picker):

```
/docmap
```

→ pick one or more channels (select the ones you seeded), pick a start date that's
**on or before** when you posted the samples, then click **Generate Interactive
Map**.

You can also pass a timeframe, e.g. `/docmap 30d`.

### B6. Read the results

In the channel you'll see a message update through these states:

1. `⏳ Fetching messages from Slack…`
2. `🧠 Analyzing document connections with AI… (N messages)`
3. `✅ DocMap ready — N docs, M contributors across K channel(s)` with an **Open
   Document Map** button.

Click **Open Document Map** → opens `http://localhost:5173/?id=<uuid>` with two tabs:

- **Summary Report** — a Markdown executive summary plus a "Top documents" list.
- **Visual Map** — an interactive React Flow graph of users ↔ docs ↔ relationships.

> If you see `🚫 No document links found in this timeframe.`, the search returned
> nothing — see Troubleshooting at the bottom (indexing delay, date range, missing
> `search:read`, or bot not in the channel).

### B7. How DocMap organizes the docs

The LLM turns the raw messages into a structured graph:

- **docs** — every unique URL found, each given a `type` (`gdoc`, `gsheet`,
  `gslides`, `figma`, `notion`, `github`, `jira`, `confluence`, `pdf`, or `link`),
  a title, and the channel it appeared in. The same URL shared in multiple
  channels is de-duplicated into one node.
- **users** — each person who shared a doc or was named near one.
- **edges** — relationships such as `authored`, `shared`, `referenced`,
  `responded-to`, and `related-to` (e.g. a design doc *references* the PRD).
- **summaryReport** — a written overview + "Highlights" of the most-referenced
  docs and most active contributors.

The pipeline caps input at 100 messages and is deliberately conservative — it
omits relationships it isn't confident about, so exact shape varies per run.

### B8. Test the free-tier quota

The 5-maps/month limit is enforced at the start of every `/docmap`. On a FREE
workspace, run it **6 times** — the first 5 generate maps; the **6th** returns an
ephemeral message:

> ⚠️ You have reached the limit of 5 free maps this month for this workspace.
> Upgrade to Pro for unlimited maps and multi-channel support!  **[ Upgrade on Stripe ]**

The **Upgrade on Stripe** button opens `http://localhost:5173/billing`, where you
can mock-upgrade to PRO and then run `/docmap` again with no limit.

> Note: each `/docmap` invocation (quick **or** opening the interactive form) counts
> one credit, per the billing gate that wraps the command.

### B9. Test Enterprise BYOK through Slack

1. Set your workspace to ENTERPRISE (via `/billing` → Simulate Enterprise, using
   `?team=<your real Slack team id>`).
2. Save a provider key for whatever `ACTIVE_LLM` is set to.
3. Run `/docmap` — the server log prints e.g. `[llm] using Enterprise BYOK Gemini key`,
   confirming it used the workspace's key instead of the server env key.

---

## Resetting state

```bash
# Wipe all workspace rows (fresh start)
python3 - <<'PY'
import sqlite3; c=sqlite3.connect('server/prisma/dev.db'); c.execute("DELETE FROM Workspace"); c.commit(); print("cleared")
PY

# Or nuke and recreate the whole db
rm server/prisma/dev.db && pnpm --filter @slack-docmap/server run db:push
```

To reset just one workspace's monthly usage, set `usageCount = 0` in Prisma Studio.

---

## Quick reference

| Surface | URL / command | Purpose |
| --- | --- | --- |
| Admin dashboard | `http://localhost:5173/billing` | Tier, mock Stripe, BYOK keys |
| Graph viewer | `http://localhost:5173/?id=<uuid>` | Rendered DocMap |
| Workspace API | `GET /api/workspace/:teamId` | Tier/usage + which keys are set |
| Mock checkout | `POST /api/workspace/:teamId/checkout` | `{ "tier": "PRO" }` |
| Save BYOK | `POST /api/workspace/settings` | Enterprise only; encrypted at rest |
| Slack | `/docmap` or `/docmap quick` | Real command + quota enforcement |
| Test data | `samples/slack-seed-messages.md` | Copy-paste docs to seed channels |

## Troubleshooting

- **Admin page is blank / "Workspace unavailable"** → is the server running on
  `:3000`? The UI proxies `/api/*` there.
- **`Unable to open the database file`** → run `pnpm --filter @slack-docmap/server
  run db:push`, and confirm `DATABASE_URL="file:./dev.db"` in `server/.env`.
- **BYOK save returns 403** → the workspace isn't ENTERPRISE yet; activate it on the
  Billing tab first.
- **`/docmap` does nothing** → check for `[slack] socket mode connected`; if missing,
  your Slack tokens are wrong or Socket Mode is off.
- **`🚫 No document links found in this timeframe.`** → most common causes:
  - The messages aren't indexed yet — wait ~30s and retry.
  - Your start date is **after** the messages were posted — pick an earlier date.
  - `SLACK_USER_TOKEN` is missing or lacks `search:read` — `search.messages` needs
    the user token (re-install the app after adding the scope).
  - The bot isn't in the channel — `/invite @DocMap`.
  - The messages don't contain a recognizable link — make sure each seeded message
    actually has a URL (`has:link`).
- **Graph is empty / generic** → no `ACTIVE_LLM` key set, or the provider key is
  invalid. Check the server logs for the LLM error.
- **Results link won't open on a phone** → `http://localhost:5173/...` only resolves
  on the machine running `pnpm dev`; open it there.
- **Production note:** switch `provider` in `server/prisma/schema.prisma` to
  `postgresql`, point `DATABASE_URL` at Postgres, run `prisma migrate deploy`, and
  set a stable `ENCRYPTION_KEY`.
