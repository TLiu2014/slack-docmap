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

The server persists per-user preferences (`UserPref`) and **generated report
graphs** (`Graph`) in a local database. Local dev uses SQLite (zero-config,
file at `server/prisma/dev.db`); production can switch the datasource
`provider` in `server/prisma/schema.prisma` to `postgresql` without any code
changes (the schema is compatible with both).

Storing `Graph` in Prisma means Slack DM links keep working across server
restarts and redeploys — before this, the in-memory `Map` reset on every reload
and any shared `?id=<uuid>` URL 404'd afterward.

```bash
# Create the SQLite db and generate the Prisma client (uses DATABASE_URL from server/.env)
pnpm --filter @slack-docmap/server run db:push
```

`server/.env` must define (see `server/.env.example`):

- `DATABASE_URL` — defaults to `file:./dev.db` (resolved next to the Prisma schema).

#### Inspecting the database (Prisma Studio)

```bash
pnpm --filter @slack-docmap/server run db:studio
```

This launches **Prisma Studio**, a local web GUI (opens `http://localhost:5555`)
for browsing and editing the rows in whatever database `DATABASE_URL` points at —
here the local SQLite file, showing the `UserPref` and `Graph` tables. It's
how you'd inspect cached report graphs or reset a user's `/docmap` preferences.

- **It is a developer/admin tool, not part of the app.** Nothing in DocMap serves
  it; it only runs when you run that command, and it binds to `localhost`.
- **Local dev:** great for poking at data. Since it points at your SQLite file, it
  only sees local data.
- **Production:** technically you *can* point it at a production PostgreSQL
  (`DATABASE_URL=postgres://… pnpm --filter @slack-docmap/server exec prisma studio`),
  but treat it like direct DB access: run it from a trusted machine over a secure
  tunnel, **never expose port 5555 publicly**, and prefer read-only credentials.
  It should not be deployed or left running in production.

#### Production: swap to PostgreSQL

The schema is dual-target; the switch is a config change, not a rewrite. When
moving off local SQLite:

1. In `server/prisma/schema.prisma`, change the `datasource db` block:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. Point `DATABASE_URL` at your PostgreSQL instance (Cloud SQL, Neon, Supabase, RDS, …). Example:
   ```
   DATABASE_URL=postgresql://user:pass@host:5432/docmap?schema=public
   ```
3. Run `pnpm --filter @slack-docmap/server exec prisma migrate deploy` (or `db push` for a first bootstrap) against the new DB.
4. Redeploy. `Graph`, `Workspace`, and `UserPref` all persist as before — no
   caller-side changes because store.ts talks to Prisma, not directly to SQLite.

PostgreSQL considerations:
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
   - `im:history` (needed for the DM welcome message)
5. Add **User Token Scopes**. Which scopes you need depends on which branch
   you're running:
   - **`main` (default — classic `search.messages`, works in Developer Program sandboxes):**
     - `search:read` — required
   - **`rts-api` branch (Real-Time Search — `assistant.search.context`, requires an RTS-eligible workspace):**
     - `search:read.public` — public channels (required)
     - `search:read.private` — private channels (optional)
     - `search:read.im` — DMs (optional)
     - `search:read.mpim` — multi-party DMs (optional)

   > **Why two sets of scopes?** DocMap was built and verified against the
   > Real-Time Search API on a personal workspace, but Developer Program
   > sandboxes don't enable the "Agents & AI Apps" tier that endpoint
   > requires — every RTS call from the sandbox returns
   > `feature_not_enabled`. `main` uses `search.messages` (classic scope,
   > works everywhere); the `rts-api` branch preserves the RTS
   > implementation for any RTS-eligible workspace. Reinstall the app after
   > changing scopes.
6. **Install to Workspace** (or click *Reinstall to Workspace* if you're
   updating an existing install to add the new scopes). Copy:
   - **Bot User OAuth Token** (`xoxb-...`) → `SLACK_BOT_TOKEN`
   - **User OAuth Token** (`xoxp-...`) → `SLACK_USER_TOKEN`

   > **Note:** Reinstall does **not** rotate your access tokens — the
   > `xoxb-…` and `xoxp-…` strings stay the same. What changes are the
   > **scopes attached** to those tokens. If your `.env` already has the
   > tokens, you don't need to update them; just verify the new scopes took
   > effect (see the block right after this list).

##### Verify the search scopes actually took effect

Because the token string doesn't change on reinstall, it's easy to think the
new scopes landed when they didn't (e.g. Reinstall clicked before saving the
scope changes). Three ways to confirm:

**A. Inspect the token's granted scopes via `auth.test`**

Slack returns granted scopes in the `x-oauth-scopes` response header:

```bash
curl -s -D - -o /dev/null -X POST https://slack.com/api/auth.test \
  -H "Authorization: Bearer $SLACK_USER_TOKEN" | grep -i x-oauth-scopes
```

Expected on `main`: the header lists `search:read`. Expected on the
`rts-api` branch: `search:read.public` (and any other `search:read.*`
scopes you enabled). If not present, go back to **OAuth & Permissions**,
confirm the scopes are saved, click **Reinstall to Workspace**, authorize.

**B. Call the search endpoint directly**

Pick the block that matches your branch. Substitute a real channel id from
your workspace (right-click a channel in Slack → **View channel details** →
the id appears at the bottom, format `C01234ABCD`).

*`main` (classic `search.messages`):*

```bash
curl -s -X POST https://slack.com/api/search.messages \
  -H "Authorization: Bearer $SLACK_USER_TOKEN" \
  --data-urlencode 'query=in:<#C01234ABCD> has:link' \
  --data-urlencode 'count=5' | python3 -m json.tool
```

Outcomes:
- `{ "ok": true, "messages": { "matches": [...] } }` → wired correctly.
- `{ "ok": false, "error": "missing_scope", "needed": "search:read" }` → scope not attached; redo steps 5–6.
- `{ "ok": false, "error": "not_allowed_token_type" }` → you passed a bot token (`xoxb-…`); search runs on the user token.

*`rts-api` branch (Real-Time Search — `assistant.search.context`):*

```bash
curl -s -X POST https://slack.com/api/assistant.search.context \
  -H "Authorization: Bearer $SLACK_USER_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "query": "has:link",
    "context_channel_id": "C01234ABCD",
    "content_types": ["messages"],
    "disable_semantic_search": true,
    "limit": 5
  }' | python3 -m json.tool
```

Outcomes:
- `{ "ok": true, "results": { "messages": [...] } }` → RTS is wired correctly.
- `{ "ok": false, "error": "missing_scope", "needed": "search:read.public" }` → scopes not attached; redo step 5–6 above.
- `{ "ok": false, "error": "not_allowed_token_type" }` → you passed a bot token (`xoxb-…`); RTS runs on the user token.
- `{ "ok": false, "error": "channel_not_found" }` → wrong channel id, or user isn't a member. Pick one you can see in Slack.
- `{ "ok": false, "error": "feature_not_enabled" }` → the workspace / app tier doesn't have the RTS API turned on. This is expected on Developer Program sandboxes — switch back to `main` (which uses `search.messages`) for sandbox testing.

**C. Run `/docmap quick` and watch the server logs**

```bash
pnpm dev:server
# in Slack: /docmap quick in a channel with linked messages
```

Look for:
- `✨ Analyzing document connections... (N messages)` in the DM → search
  returned data and the pipeline continued to the LLM.
- `🚫 No document links found in this timeframe.` → search returned zero rows.
  Could be a legitimately empty channel, or a scope/id problem hidden as
  "empty results."
- `[slack] search.messages failed for <channel>: <error>` (or
  `[slack] assistant.search.context failed …` on the `rts-api` branch) on
  the server console → the call was rejected. The error string tells you
  which scope or argument is off.
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

**Tip:** You can also DM the bot — slash commands work in DMs too, and the `channel_id` will be the DM channel. The history fetch will be empty since the search endpoint needs a real channel, but it's useful for verifying the pipeline plumbing without spamming a public channel.

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

The search endpoint DocMap uses (`search.messages` on `main`,
`assistant.search.context` on the `rts-api` branch) is a user-scope API —
DocMap calls it with the user token. If `SLACK_USER_TOKEN` is missing (or
lacks the right `search:read` / `search:read.*` scopes for the branch),
the history fetch returns an empty list and the LLM produces a near-empty
graph. The slash command still works end-to-end; you just won't see real
content. Use Path A's mock data to validate the UI in that case.

## Useful endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness check |
| `GET` | `/api/graph/:id` | Fetch a stored graph (UI uses this) |
| `POST` | `/api/dev/graph` | Seed the store with arbitrary JSON, returns `{id, url}` |

## Path C — MCP surface (Claude Desktop, Cursor, and other MCP hosts)

DocMap ships a second entry point that speaks the **Model Context Protocol**
so any MCP-capable AI host can invoke the same analysis pipeline. The Slack
slash command and the MCP surface share the exact same backend — LLM factory,
Slack search, Prisma store — so a graph produced from either surface is
retrievable from the other via its `graphId`.

### Tools exposed

| Tool | Purpose | Input |
| --- | --- | --- |
| `analyze` | Runs the full pipeline against a set of Slack channels and returns the graph + a viewer URL. | `channelIds: string[]`, `days: number` |
| `get_graph` | Fetches a previously-generated graph by id. | `graphId: string` |

### Local run (dev / stdio)

```bash
pnpm --filter @slack-docmap/server run mcp
```

This launches `server/src/mcp/server.ts` under `tsx`, speaking JSON-RPC over
stdio. In practice you don't run it manually — you configure your MCP host to
spawn it. For Claude Desktop, edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```jsonc
{
  "mcpServers": {
    "docmap": {
      "command": "node",
      "args": ["/absolute/path/to/slack-docmap/server/dist/mcp/server.js"],
      "env": {
        "DATABASE_URL": "file:/absolute/path/to/slack-docmap/server/prisma/dev.db",
        "SLACK_USER_TOKEN": "xoxp-...",
        "ACTIVE_LLM": "gemini",
        "GEMINI_API_KEY": "...",
        "UI_BASE_URL": "http://localhost:5173"
      }
    }
  }
}
```

Notes:
- Point `DATABASE_URL` at the same SQLite file the HTTP/Slack server uses so
  both surfaces read/write the same graphs.
- `SLACK_USER_TOKEN` needs the `search:read.*` scopes (same as Path B).
- One LLM provider key is enough — same `ACTIVE_LLM` semantics as everywhere else.

For `tsx`-based dev spawning, swap `command`/`args` for:
```json
"command": "pnpm",
"args": ["--filter", "@slack-docmap/server", "run", "mcp"]
```

### Test flow in Claude Desktop

1. Add the config above, restart Claude Desktop.
2. Confirm DocMap tools appear in the tools indicator.
3. Ask *"Use the docmap tool to analyze channels `C0123ABC` for the last 14 days."* (paste a real channel id from your workspace).
4. Claude will call `analyze`, get back the JSON summary + `viewerUrl`, and
   respond conversationally. Click the URL to open the React Flow viewer.

## Slack Developer Sandbox

Slack Developer Sandboxes are throwaway Enterprise-org workspaces you can
provision from the Slack Developer Program. They're useful whenever you need
a clean workspace to test an app install, share a preview with a teammate or
reviewer, or run a demo without touching a real production workspace.

### Provision the sandbox

You'll need a Slack Developer Program account with a payment method on file
(identity verification only — no charge for sandbox use).

1. Sign in at <https://api.slack.com> and open the sandbox dashboard: <https://api.slack.com/developer-program/sandbox>.
2. Click **Provision sandbox**. Pick a name (e.g. `docmap-preview`) — this
   becomes the workspace subdomain `<name>-sandbox.slack.com`.
3. Confirm the payment card on the identity-verification prompt.
4. Wait ~1–2 minutes for provisioning. You'll receive a sign-in email; the
   dashboard also shows the new workspace URL.

**Quotas to keep in mind:** up to 2 active sandboxes at once (10 provisioned
per 30-day window), 3 workspaces per sandbox, 8 users + 2 guests per workspace,
and a 6-month lifespan before auto-archive.

### Install DocMap into the sandbox

Slack apps are per-workspace: your dev install does **not** carry over.

1. Open your DocMap app at <https://api.slack.com/apps> → **Install App** →
   pick the sandbox workspace and authorize.
2. Copy the new **Bot User OAuth Token** (`xoxb-…`) and the new **User OAuth
   Token** (`xoxp-…`) — they're workspace-scoped and differ from your dev
   workspace's tokens.
3. Update `server/.env` — or keep two `.env` files and switch between them
   depending on which workspace you're testing against.
4. If you use Socket Mode, the `SLACK_APP_TOKEN` (`xapp-…`) is app-level, not
   workspace-level, so it stays the same. Make sure Socket Mode is **enabled**
   on the app config.
5. Restart `pnpm dev:server` so the new tokens take effect.

#### Getting tokens when you don't have a public OAuth callback

For local dev the Redirect URL is usually a placeholder like
`https://example.com/slack/oauth/callback` — there's no backend at that
address to exchange the authorization code for tokens. Once you click Allow,
Slack redirects the browser to that URL with `?code=<code>&state=` in the
query string; the browser sees a 404 but **Slack has already minted a valid
one-time authorization code** (visible in the URL bar). Exchange it manually:

```bash
curl -s -X POST https://slack.com/api/oauth.v2.access \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "code=THE_CODE_FROM_URL" \
  -d "redirect_uri=https://example.com/slack/oauth/callback" \
  | python3 -m json.tool
```

- `client_id` and `client_secret` live at
  **api.slack.com/apps/<APP_ID> → Basic Information → App Credentials**.
- `redirect_uri` **must exactly match** what you set in **OAuth & Permissions
  → Redirect URLs**, or Slack rejects the exchange with `bad_redirect_uri`.
- The code is single-use and expires in ~10 minutes. Move quickly.

The response is:

```json
{
  "ok": true,
  "access_token": "xoxb-…",             // → SLACK_BOT_TOKEN
  "bot_user_id": "U…",
  "team": { "id": "T…", "name": "…" },
  "authed_user": {
    "id": "U…",
    "access_token": "xoxp-…"            // → SLACK_USER_TOKEN
  }
}
```

Paste `access_token` (`xoxb-…`) into `SLACK_BOT_TOKEN` and
`authed_user.access_token` (`xoxp-…`) into `SLACK_USER_TOKEN` in `server/.env`.
`SLACK_APP_TOKEN` (the `xapp-…` for Socket Mode) lives on **Basic Information
→ App-Level Tokens** and is app-level, not workspace-level — it stays the
same across installs.

#### Token lifetime — one-time exchange, no refresh

Once tokens are in `.env`, they're long-lived. You only need to redo the
Allow → curl → paste flow when:

- You **add new scopes** to the app config (existing tokens don't retro-cover them).
- A workspace admin **uninstalls** DocMap from the sandbox.
- You **revoke tokens** on api.slack.com/apps/<APP_ID>/oauth.
- You **rotate the client secret**.

Note that reinstalling the app **does not rotate the tokens** — the `xoxb-…`
and `xoxp-…` strings stay identical; what changes are the scopes attached.
The only way to obtain fresh tokens is to run the OAuth flow and exchange
the fresh code.

#### Common install gotchas

- **OAuth flow installs on the wrong workspace.** Slack routes the install
  to whichever workspace your browser session is currently signed into. Sign
  into `https://<sandbox-name>-sandbox.slack.com` *before* clicking Install,
  or use an explicit `team=T…` param on the OAuth authorize URL to force a
  specific workspace.

- **`scope_not_allowed_on_enterprise`.** The install is going org-wide but
  one of the requested scopes (usually a `search:read.*` variant) isn't
  installable at the org level. Two fixes:
  - App config → **Manage Distribution** → turn off *"Enable org-wide app installations"*.
  - Or use the explicit team-scoped URL:
    ```
    https://slack.com/oauth/v2/authorize?client_id=<CLIENT_ID>&scope=<bot scopes>&user_scope=<user scopes>&team=T<WORKSPACE_ID>
    ```

- **`invalid_arguments` on `views.publish` / `invalid user_id`.** The bot
  token is from a different workspace than the App Home event source. Run
  `auth.test` on both tokens; the `team_id` needs to match the workspace
  where you're testing.

- **`feature_not_enabled` on `assistant.search.context`.** The Real-Time
  Search API isn't turned on for your app tier / workspace. Developer
  Program sandboxes generally don't grant it. `main` uses the classic
  `search.messages` for this reason; the `rts-api` branch preserves the RTS
  implementation for the day it becomes available.

- **`invalid_json` from Slack API curls.** Almost always a smart-quotes
  problem — copy-pasting the curl from a rich text editor (Notes, Slack
  messages) converts `"` into `"` / `"`, which JSON doesn't accept. Type
  the payload in a plain terminal or a code editor.

- **`missing_charset` warning in curl responses.** Harmless — a header hint,
  not an error. `ok: true` is what matters.

- **Sandbox provisioned without full features.** If you only completed the
  identity-verification step to provision the sandbox, some Enterprise
  features (including certain scopes) are unavailable. Use a Slack event
  code (issued to Developer Program members at Slack events) to unlock the
  full feature set on the sandbox. Reprovision, reinstall, re-exchange
  the code.

### Seed a demo channel

Give viewers something to run `/docmap` against on arrival.

1. Create a channel (example used throughout: `#docmap-demo`).
2. `/invite @DocMap`.
3. Open [`samples/slack-seed-messages.md`](./samples/slack-seed-messages.md)
   and paste each line of the code block as its own Slack message (one link
   per message — that file explains why).
4. Wait ~30s for Slack's search index to catch up.
5. Pin a message: *"Try `/docmap quick` — it DMs the map back to you."*

### Invite others

Add regular members (up to 8) or guests (up to 2) via **Sandbox admin →
Members → Invite members**. Direct email invites are traceable; anonymous
invite links work but skip the audit trail.

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
