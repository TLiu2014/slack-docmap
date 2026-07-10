# Local development

This doc covers how to run and test DocMap locally. The project is a Slack slash-command app, but you do **not** need a Slack workspace to develop the UI — there's a mock-data path.

## Quickest UI-dev path: the built-in demo graph

The server auto-seeds `server/fixtures/mock-graph.json` into the `Graph` table on every boot under the reserved id **`demo`**. So once `pnpm dev` is running, the sample report is always available at:

```
http://localhost:5173/?id=demo
```

Refresh after editing `server/fixtures/mock-graph.json` and restarting the server to see the new fixture. No Slack, no LLM, no seeding call required — just open the URL.

## Prereqs

- Node ≥ 20
- pnpm ≥ 11
- (Optional) A Slack workspace where you can install a custom app
- (Optional) A Gemini API key

## Install

```bash
pnpm install
cp server/.env.example server/.env
```

### Database (Prisma + SQLite)

The server persists everything it needs — workspace/billing state (`Workspace`),
per-user preferences (`UserPref`), and **generated report graphs** (`Graph`) —
in a local database. Local dev uses SQLite (zero-config, file at
`server/prisma/dev.db`); production can switch the datasource `provider` in
`server/prisma/schema.prisma` to `postgresql` without any code changes (the
schema is compatible with both).

Storing `Graph` in Prisma means Slack DM links keep working across server
restarts and redeploys — before this, the in-memory `Map` reset on every reload
and any shared `?id=<uuid>` URL 404'd afterward.

```bash
# Create the SQLite db and generate the Prisma client (uses DATABASE_URL from server/.env)
pnpm --filter @slack-docmap/server run db:push
```

`server/.env` must define (see `server/.env.example`):

- `DATABASE_URL` — defaults to `file:./dev.db` (resolved next to the Prisma schema).
- `ENCRYPTION_KEY` — used to encrypt stored BYOK provider keys at rest. Keep it
  stable; rotating it invalidates previously-saved keys. Required in production.

#### Inspecting the database (Prisma Studio)

```bash
pnpm --filter @slack-docmap/server run db:studio
```

This launches **Prisma Studio**, a local web GUI (opens `http://localhost:5555`)
for browsing and editing the rows in whatever database `DATABASE_URL` points at —
here the local SQLite file, showing the `Workspace`, `UserPref`, and `Graph`
tables. It's how you'd inspect quotas/tiers, saved BYOK key presence, cached
report graphs, or reset a user's `/docmap` preferences.

- **It is a developer/admin tool, not part of the app.** Nothing in DocMap serves
  it; it only runs when you run that command, and it binds to `localhost`.
- **Local dev:** great for poking at data. Since it points at your SQLite file, it
  only sees local data.
- **Production:** technically you *can* point it at a production Postgres
  (`DATABASE_URL=postgres://… pnpm --filter @slack-docmap/server exec prisma studio`),
  but treat it like direct DB access: run it from a trusted machine over a secure
  tunnel, **never expose port 5555 publicly**, and prefer read-only credentials.
  It should not be deployed or left running in production.

#### Production: swap to Postgres

The schema is dual-target; the switch is a config change, not a rewrite. When
moving off local SQLite:

1. In `server/prisma/schema.prisma`, change the `datasource db` block:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. Point `DATABASE_URL` at your Postgres instance (Cloud SQL, Neon, Supabase, RDS, …). Example:
   ```
   DATABASE_URL=postgresql://user:pass@host:5432/docmap?schema=public
   ```
3. Run `pnpm --filter @slack-docmap/server exec prisma migrate deploy` (or `db push` for a first bootstrap) against the new DB.
4. Redeploy. `Graph`, `Workspace`, and `UserPref` all persist as before — no
   caller-side changes because store.ts talks to Prisma, not directly to SQLite.

Postgres considerations:
- The `Graph.graphJson` column stays as `String` on both engines. If you want
  native JSON querying in prod, promote it to `Json` at the schema level once
  you've switched.
- Add a periodic sweep to delete old `Graph` rows if you don't want to keep
  every report forever — nothing does this automatically today.

## Two ways to run

### Path A — UI only, with mock data (no Slack, no Gemini)

Fastest way to iterate on the React Flow views and summary report.

1. Start both packages:
   ```bash
   pnpm dev
   ```
   (or run `pnpm dev:server` and `pnpm dev:ui` in two terminals.)
   The server logs `[http] listening on :3000` and a warning that Slack creds are missing — expected.

2. Seed the in-memory store with the sample graph:
   ```bash
   curl -s -X POST http://localhost:3000/api/dev/graph \
     -H 'content-type: application/json' \
     --data-binary @server/fixtures/mock-graph.json
   ```
   Response: `{ "id": "<uuid>", "url": "http://localhost:5173/?id=<uuid>" }`

3. Open the `url` from the response. You should see the Summary Report tab populated, and the Visual Map tab with God / Doc / User sub-toggles working against the mock data.

You can edit `server/fixtures/mock-graph.json` to test different shapes (empty edges, lots of docs, missing users, etc.).

### Path B — Full Slack integration via Socket Mode

Socket Mode means **no ngrok needed** — Bolt opens a WebSocket to Slack and receives events directly. Required for testing the `/docmap` slash command.

#### One-time: create the Slack app

1. Go to <https://api.slack.com/apps> → **Create New App** → **From scratch**. Name it `DocMap` and pick a workspace you can install to.
2. **Socket Mode** → toggle **Enable Socket Mode** on. Generate an **App-Level Token** with the `connections:write` scope. Copy the `xapp-...` token — this is `SLACK_APP_TOKEN`.
3. **Slash Commands** → **Create New Command**:
   - Command: `/docmap`
   - Short Description: `Map docs shared in this channel`
   - Usage hint: **leave blank** — `/docmap` takes no arguments; it opens a form (or,
     if you've enabled "skip the form", analyzes the current channel immediately).
     If you previously set a hint like `[Nd]`, clear it and **Save**.
   - Request URL: leave blank / any value — Socket Mode ignores it.

   > If you change the command or its settings, Slack sometimes needs you to
   > **Reinstall to Workspace** for it to take effect.
4. **OAuth & Permissions** → add **Bot Token Scopes**:
   - `commands` (required for slash commands)
   - `chat:write`
   - `channels:read` (to resolve channel names)
5. (Optional, recommended) Add **User Token Scopes**:
   - `search:read` (required if you want `search.messages` to return real history)
6. **Install to Workspace**. Copy:
   - **Bot User OAuth Token** (`xoxb-...`) → `SLACK_BOT_TOKEN`
   - **User OAuth Token** (`xoxp-...`) → `SLACK_USER_TOKEN`
7. **App icon** — **Basic Information** → **Display Information** → **App icon** →
   upload **`assets/brand/docmap-icon-app-512.png`** (Slack requires PNG/JPG ≥ 512×512).
   Save. The new icon appears in the app directory, the `@DocMap` bot avatar, and
   slash-command results (it can take a few minutes / an app reinstall to propagate).

   > **Why the app icon has no rounded corners.** Slack masks app icons with its own
   > rounded-corner shape. If you upload an icon that *already* has rounded corners
   > (like `docmap-icon-512.png`, used for the web favicon), the transparent area
   > outside the corners renders **white** on Slack's light UI. The fix is a
   > **full-bleed square** where the background fills the whole canvas —
   > `docmap-icon-app-512.png` is exactly that. So: don't switch to a white
   > background, and don't upload the rounded/transparent version — upload the
   > full-bleed square one.
8. **App Home** (settings tab) — **App Home** (or **Features → App Home**):
   - Toggle **Home Tab** on.
   - Under **Show Tabs**, you can leave the Messages tab on or off.
   - **Event Subscriptions** → **Enable Events** (Socket Mode needs no Request URL)
     → **Subscribe to bot events** → add **`app_home_opened`** → **Save Changes**.
   - **Reinstall to Workspace** if Slack prompts you. Opening the DocMap app's
     **Home** tab now shows a settings screen (default timeframe + "skip the form").

#### Configure `server/.env`

```dotenv
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_USER_TOKEN=xoxp-...

# Pick one LLM provider. Only the keys for ACTIVE_LLM need to be set.
ACTIVE_LLM=gemini             # gemini | openai | claude | qwen
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.0-flash-exp
# OPENAI_API_KEY=...
# OPENAI_MODEL=gpt-4o
# ANTHROPIC_API_KEY=...
# CLAUDE_MODEL=claude-sonnet-4-6
# QWEN_API_KEY=...            # Alibaba DashScope, OpenAI-compatible
# QWEN_MODEL=qwen-plus

PORT=3000
UI_BASE_URL=http://localhost:5173

# Dev-only: bypass the FREE-tier "5 maps/month" quota. Omit/false in production.
DISABLE_BILLING_LIMIT=true
```

To switch model providers at runtime, change `ACTIVE_LLM` and restart `pnpm dev`. The factory in `server/src/llm/index.ts` instantiates the right adapter on boot.

#### Run

```bash
pnpm dev
```

Expected logs:
```
[http] listening on :3000
[slack] socket mode connected
```

#### Test in Slack

You can trigger `/docmap` from **any Slack client** as long as `pnpm dev` is running on your laptop:

- **Slack desktop app** (Mac/Windows/Linux)
- **Slack web** — <https://app.slack.com> in any browser
- **Slack mobile** (the link button in the response opens `http://localhost:5173/...` which won't resolve on a phone, but the slash command itself works)

How this works: Socket Mode means your dev server holds an outbound WebSocket to Slack. The Slack client never connects to `localhost` — it sends the slash command to Slack's servers, which push it down your WebSocket. So no firewall config, no ngrok, no public URL is needed regardless of which client you type the command in.

1. In any channel where the bot is invited (`/invite @DocMap`), run one of:
   ```
   /docmap              # → opens the interactive form (no arguments needed)
   /docmap quick        # → Quick Mode: current channel, last 7 days, no form
   /docmap settings     # → always reopens the form to change your defaults
   ```
2. **Interactive Mode** posts an ephemeral form with:
   - **Channels to analyze** — the current channel is pre-selected (public channels only).
   - **Timeframe** — a dropdown of presets (1 / 7 / 14 / 30 / 90 days) instead of a datepicker.
   - **Preferences** — a checkbox, *"Skip this form next time — analyze the current
     channel immediately"*. Your timeframe choice and this toggle are remembered per user.
   Then click **Generate Interactive Map**.
3. **Skip-the-form / immediate mode** — once you've checked that box, running `/docmap`
   in any channel starts the analysis right away on that channel using your saved
   timeframe. Run `/docmap settings` any time to bring the form back and change it.
4. **Quick Mode** (`/docmap quick`) always skips the form: current channel, last 7 days.
5. The loading progression is DMed to you privately and updates in place:
   - `⏳ Fetching messages from Slack…`
   - `🚫 No document links found in this timeframe.` (and halts) **or**
   - `🧠 Analyzing document connections with AI…`
   - `✅ DocMap ready` — followed by the **report right inside Slack**: a
     **Documents** list (each linked, with type + channel) and a **Contributors**
     list. You do **not** need to open a browser to read the results.
   - An **Open interactive map** button also links to `http://localhost:5173/?id=<uuid>`
     for the full React Flow graph (see note below on the interactive view).

**Manage your defaults:** open the **DocMap app → Home tab** for a settings screen,
or run `/docmap settings`. Both let you set the default timeframe and toggle
"skip the form / analyze immediately".

**Tip:** You can also DM the bot — slash commands work in DMs too, and the `channel_id` will be the DM channel. The history fetch will be empty since `search.messages` needs a real channel, but it's useful for verifying the pipeline plumbing without spamming a public channel.

#### In-Slack report vs. the interactive map (do I need another server?)

- **The report (docs + contributors) renders directly in Slack** as Block Kit —
  no browser, and **no extra server** required beyond `pnpm dev`.
- **The interactive map** (React Flow diagram) is a web app; Slack can't embed a
  live React app in a message. The **Open interactive map** button points at
  `UI_BASE_URL` (default `http://localhost:5173`), which is the **Vite UI dev
  server**. `pnpm dev` already starts *both* the API server and the UI server
  concurrently, so you don't start a second server — just keep `pnpm dev` running
  and the link will open. If you only want to run the UI, use `pnpm dev:ui`.
- On a phone (or any device that can't reach your laptop's `localhost`), the
  button won't resolve, but the in-Slack report still works. For a real shareable
  link, deploy the UI and set `UI_BASE_URL` to the public URL.

#### Handy commands

```bash
# Start everything (API + UI) for Slack testing:
pnpm dev                 # API on :3000, UI on :5173, Socket Mode connects

pnpm dev:server          # only the API / Slack app
pnpm dev:ui              # only the React UI

# Reset YOUR /docmap preferences (default timeframe + skip-the-form toggle):
#  • Easiest: open the DocMap app → Home tab, or run `/docmap settings`, and change them.
#  • Wipe them from the DB with Prisma Studio (see below) — delete your row in the
#    `UserPref` table — or reset every user's prefs:
pnpm --filter @slack-docmap/server exec -- \
  prisma db execute --schema prisma/schema.prisma --stdin <<'SQL'
DELETE FROM "UserPref";
SQL
```

#### Without `SLACK_USER_TOKEN`

`search.messages` is a user-scope API — the bot token can't call it. If `SLACK_USER_TOKEN` is missing, the history fetch returns an empty list and Gemini will produce a near-empty graph. The slash command still works end-to-end; you just won't see real content. Use Path A's mock data to validate the UI in that case.

## Useful endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness check |
| `GET` | `/api/graph/:id` | Fetch a stored graph (UI uses this) |
| `POST` | `/api/dev/graph` | Seed the store with arbitrary JSON, returns `{id, url}` |
| `GET` | `/api/workspace/:teamId` | Workspace tier/usage + which BYOK keys are set (never returns raw keys) |
| `POST` | `/api/workspace/:teamId/checkout` | Mock Stripe Checkout — sets `tier` (`{ "tier": "PRO" }`) |
| `POST` | `/api/workspace/settings` | Save encrypted BYOK keys (Enterprise tier only) |

## Monetization (Phase 3)

- **Free tier quota:** `/docmap` is gated by `checkSubscriptionLimit`. FREE
  workspaces get 5 maps per calendar month; the 6th attempt returns an ephemeral
  upgrade prompt with a Stripe button linking to `UI_BASE_URL/billing`. PRO and
  ENTERPRISE are unlimited.
- **Disabling the quota (dev):** set **`DISABLE_BILLING_LIMIT=true`** in
  `server/.env` to bypass the FREE-tier limit entirely — every workspace gets
  unlimited maps (usage is still counted for analytics). Leave it unset/`false` in
  production to enforce billing. Restart `pnpm dev` after changing it.
- **Admin dashboard:** open `http://localhost:5173/billing` (optionally
  `?team=T0123ABCD`; defaults to a dev workspace id). The **Billing** tab mocks a
  Stripe upgrade to PRO and includes a button to simulate Enterprise activation;
  the **Enterprise Settings** tab (Enterprise only) saves per-provider BYOK keys.
- **Enterprise BYOK:** when an ENTERPRISE workspace has stored a key for the
  active provider, the LLM factory decrypts and uses *their* key instead of the
  server's env key.

## Troubleshooting

- **`/docmap` does nothing in Slack** → check server logs for `[slack] socket mode connected`. If missing, your `SLACK_APP_TOKEN` is wrong or Socket Mode is disabled in the app config.
- **Slash command times out** → Gemini call exceeded ~3s. The "Analyzing…" ack still goes through; the follow-up `respond()` may fail if it took >30 min. Tighten the prompt or cut `messages.slice(0, 300)` in `server/src/gemini.ts`.
- **UI shows `Graph not found (404)`** → the in-memory store has a 6-hour TTL and clears on server restart. Re-run the slash command or re-seed via `/api/dev/graph`.
- **Vite proxy errors** → the UI proxies `/api/*` to `http://localhost:3000`. Make sure the server is running first.

## Typecheck and build

```bash
pnpm typecheck      # both packages
pnpm build          # both packages
```
