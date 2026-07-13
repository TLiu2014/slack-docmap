# DocMap — Slack Hackathon submission

This file is submission-only. Everything about how to run DocMap locally,
deploy it, or set up a Slack sandbox lives in [DEVELOPMENT.md](./DEVELOPMENT.md);
this file just captures the extra steps unique to the Devpost submission.

## Track

**New Slack Agent** — DocMap automates a workflow (finding and mapping shared
documents inside Slack) using Slack's Real-Time Search + an LLM. Sandbox
deployment is allowed (no Marketplace / production-workspace requirement).

## Required technology

DocMap satisfies **two** of the three required technologies:

- **Real-Time Search (RTS) API** — DocMap's message-fetch layer (`server/src/slack.ts`)
  calls Slack's `assistant.search.context` endpoint. The legacy `search.messages`
  path has been retired. RTS is what makes the *"who shared what and when"*
  extraction possible without hand-crawling channel history.
- **MCP server integration** — alongside the Slack slash command, DocMap ships an
  MCP server (`server/src/mcp/server.ts`) that exposes `analyze` and `get_graph`
  tools to any MCP-capable AI host (Claude Desktop, Cursor, Claude Code, other
  agents). Both surfaces call the same headless pipeline — so a graph generated
  in Slack is retrievable by id from an MCP client and vice versa.

See [DEVELOPMENT.md → Path C — MCP surface](./DEVELOPMENT.md#path-c--mcp-surface-claude-desktop-cursor-and-other-mcp-hosts)
for MCP host setup, [DEVELOPMENT.md → Path B](./DEVELOPMENT.md#path-b--full-slack-integration-via-socket-mode)
for the RTS scopes to request when installing the Slack app, and
[architecture.md](./architecture.md) for the shared-pipeline diagram.

## Sandbox for judges

The submission requires giving access to `slackhack@salesforce.com` and
`testing@devpost.com`. Follow [DEVELOPMENT.md → Slack Developer Sandbox](./DEVELOPMENT.md#slack-developer-sandbox)
to provision + install + seed the sandbox, then:

1. From the sandbox admin: **Members → Invite members**.
2. Add `slackhack@salesforce.com` and `testing@devpost.com` — as **guests**
   (that's what the 2-guest sandbox quota is for; they can't touch admin).
3. Add both to `#platform-guild` so the demo channel is visible on first
   sign-in.
4. Verify: from either judge email you can sign in, see `#platform-guild`,
   see the pinned message, and run `/docmap quick`.

**Fallback if provisioning stalls**: at submission time, if sandbox
provisioning is blocked (card verification stuck, quota hit, etc.), invite
the two judge emails directly to a Developer Program workspace and add a
note in the Devpost submission — *"On a Developer Program workspace; happy
to migrate to a formal sandbox on request."* Only use as a last resort; the
rules ask for a sandbox specifically.

## Devpost submission fields

- **Sandbox URL:** `https://<name>-sandbox.slack.com` (or your fallback
  workspace URL).
- **How to test:** *"Sign in → open `#platform-guild` → run `/docmap quick`.
  Report is DM'd to you by @DocMap. Click **Open interactive map** for the
  React Flow diagram."*
- **Architecture diagram:** attach the exported PNG/SVG rendered from
  [architecture.md](./architecture.md).
- **Video (~3 min):** suggested flow —
  1. `/docmap quick` in `#platform-guild`, walk through the DM'd report + the
     interactive map opened in a browser.
  2. Switch to Claude Desktop / Cursor showing DocMap listed as an MCP
     server. Ask *"Map the docs shared in C0123ABC in the last 30 days"* and
     show the tool call → JSON response → clickable viewer URL.
  3. One slide with the architecture diagram showing both surfaces feeding
     the same pipeline.

## Contact

For access-related issues during judging: `tianwei.liu@workday.com`.
