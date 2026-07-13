import { GITHUB_REPO_URL, MarketingLayout } from './MarketingLayout';

interface Endpoint {
  method: 'GET' | 'POST';
  path: string;
  desc: string;
  params?: string;
  resp: string;
}

const ENDPOINTS: Endpoint[] = [
  {
    method: 'GET',
    path: '/health',
    desc: 'Liveness probe.',
    resp: '{ "ok": true }',
  },
  {
    method: 'GET',
    path: '/api/graph/:id',
    desc: 'Fetch a stored DocMap graph by id — the viewer URL you got from the DM or MCP tool.',
    resp: '{ summaryReport, users[], docs[], edges[] }',
  },
  {
    method: 'POST',
    path: '/api/dev/graph',
    desc: 'Dev-only: seed the store with arbitrary graph JSON. Returns the new id + viewer URL.',
    params: 'body: DocmapGraph',
    resp: '{ id, url }',
  },
];

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'commands', label: 'Slash commands' },
  { id: 'report', label: 'Interactive report & 3 views' },
  { id: 'mcp', label: 'MCP surface' },
  { id: 'api', label: 'API reference' },
];

export function Docs() {
  return (
    <MarketingLayout>
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-12 lg:grid-cols-[200px_minmax(0,1fr)]">
        <Toc />
        <div className="min-w-0 space-y-14">
          <Overview />
          <Architecture />
          <Commands />
          <ReportSection />
          <McpSurface />
          <ApiReference />
        </div>
      </div>
    </MarketingLayout>
  );
}

function Toc() {
  return (
    <aside className="hidden lg:block">
      <nav className="sticky top-20 space-y-1 text-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
          On this page
        </p>
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="block rounded-md px-2 py-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-900"
          >
            {s.label}
          </a>
        ))}
      </nav>
    </aside>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-ink-700">{children}</div>
    </section>
  );
}

// ---------- Overview ----------

function Overview() {
  return (
    <Section id="overview" title="Overview">
      <p>
        DocMap scans a Slack channel&apos;s recent history for shared document links, asks an LLM to
        extract a structured graph of who shared what and how documents relate, and hands you back
        an interactive map plus an executive summary.
      </p>
      <p>
        There are two ways to trigger it, both backed by the same pipeline:
      </p>
      <ul className="ml-5 list-disc space-y-1">
        <li>
          <strong>Slack</strong> — run <code>/docmap</code> in any channel, or DM the DocMap bot.
        </li>
        <li>
          <strong>MCP</strong> — add DocMap to an MCP-capable AI host (Claude Desktop, Cursor,
          Claude Code, …) and ask its assistant to run the analysis for you.
        </li>
      </ul>
      <p>
        Either surface hands you a viewer URL that opens the interactive graph in your browser.
      </p>
    </Section>
  );
}

// ---------- Architecture ----------

function Architecture() {
  return (
    <Section id="architecture" title="Architecture">
      <p>
        At a glance: clients trigger DocMap on either surface, the server&apos;s shared core runs
        the analysis and persists the graph, and the React UI reads persisted graphs by id.
      </p>

      <div className="rounded-xl border border-ink-200 bg-white p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <DiagramBox
            title="Clients"
            lines={['/docmap in Slack', 'MCP host (Claude Desktop, …)']}
          />
          <DiagramBox
            title="DocMap app"
            accent
            lines={[
              'server/ — Bolt · MCP · HTTP',
              'shared core (headless pipeline)',
              'ui/ — React Flow viewer',
            ]}
          />
          <DiagramBox
            title="External / storage"
            lines={[
              'Slack Real-Time Search',
              'LLM (Gemini/OpenAI/Claude/Qwen)',
              'Prisma DB (SQLite / PostgreSQL)',
            ]}
          />
        </div>
        <p className="mt-4 text-xs text-ink-400">
          Flow: Slack slash cmd OR MCP tool call → shared core → Slack Real-Time Search + LLM →
          graph persisted under a UUID → each surface hands back a viewer URL.
        </p>
      </div>
      
      <figure className="rounded-xl border border-dashed border-ink-200 bg-white p-4">
        <img
          src="/architecture.png"
          alt="Full DocMap architecture diagram (rendered from architecture.md)"
          className="w-full"
          onError={(e) => {
            // If architecture.png hasn't been generated yet, keep the caption
            // visible so the reader knows it's a planned inclusion.
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
        <figcaption className="mt-2 text-center text-[11px] text-ink-400">
          Rendered from{' '}
          <a
            href={`${GITHUB_REPO_URL}/blob/main/architecture.md`}
            className="text-accent underline underline-offset-2"
            target="_blank"
            rel="noreferrer"
          >
            architecture.md
          </a>
          . Export via <code>pnpm dlx @mermaid-js/mermaid-cli -i architecture.md -o architecture.svg</code>.
        </figcaption>
      </figure>
    </Section>
  );
}

function DiagramBox({
  title,
  lines,
  accent,
}: {
  title: string;
  lines: string[];
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        accent ? 'border-accent bg-accent-soft' : 'border-ink-200 bg-ink-50'
      }`}
    >
      <div className="text-sm font-semibold text-ink-900">{title}</div>
      <ul className="mt-1.5 space-y-0.5 text-xs text-ink-700">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Slash commands ----------

function Commands() {
  const rows: Array<[string, string]> = [
    [
      '/docmap',
      'Opens an ephemeral form: pick channels (multi-select), pick a timeframe, then Generate.',
    ],
    ['/docmap quick', 'Skips the form — current channel, last 7 days.'],
    ['/docmap 30d', 'Quick mode with a custom look-back window (any Nd from 1d to 365d).'],
    [
      '/docmap settings',
      'Force-reopens the config form even if you have "skip the form" turned on in App Home.',
    ],
  ];
  return (
    <Section id="commands" title="Slash commands">
      <div className="overflow-hidden rounded-lg border border-ink-200">
        <table className="w-full text-left text-sm">
          <tbody className="divide-y divide-ink-100">
            {rows.map(([cmd, desc]) => (
              <tr key={cmd} className="bg-white">
                <td className="w-48 px-4 py-3 font-mono text-ink-900">{cmd}</td>
                <td className="px-4 py-3 text-ink-700">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Results always come back as a DM from the DocMap bot — nothing gets posted into the source
        channel unless you explicitly share the viewer URL.
      </p>
      <p>
        Per-user defaults (timeframe, skip-form, auto-save) live in the DocMap App Home tab; run{' '}
        <code>/docmap settings</code> from anywhere to jump back to it.
      </p>
    </Section>
  );
}

// ---------- Report & 3 views ----------

function ReportSection() {
  return (
    <Section id="report" title="The report & 3 views">
      <p>
        Every DocMap invocation produces a shareable graph identified by a UUID. Opening the viewer
        URL renders three things:
      </p>
      <ul className="ml-5 list-disc space-y-1">
        <li>
          <strong>Executive summary</strong> — a markdown-formatted overview generated by the LLM
          (an intro paragraph plus a <em>Highlights</em> section with the most active docs and
          contributors).
        </li>
        <li>
          <strong>Top documents</strong> — a flat list of every document DocMap extracted, with a
          direct link, its detected type (Google Docs, GitHub, Figma, …), and the source channel.
        </li>
        <li>
          <strong>Interactive map</strong> — a React Flow canvas you can drag, zoom, and pan; the
          same graph rendered from three different angles (below).
        </li>
      </ul>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ViewCard
          title="God view"
          purpose="See everything at once."
          detail="Every user, document, and channel node plus every edge the LLM emitted. Best when you want to spot hubs — the docs multiple people reference, or the contributors touching many docs."
          screenshot="/screenshots/god-view.png"
        />
        <ViewCard
          title="Doc view"
          purpose="Cluster by document."
          detail="Documents and channels only, with doc↔doc edges (references, related-to, …). Docs shared in the same channel cluster naturally. Best when you're looking for related docs on a topic."
          screenshot="/screenshots/doc-view.png"
        />
        <ViewCard
          title="User view"
          purpose="One card per contributor."
          detail="One card per person, listing every doc they authored or mentioned. Best when you want to know who's the go-to person for a subject."
          screenshot="/screenshots/user-view.png"
        />
      </div>

      <p>
        The same viewer also has a <strong>Share</strong> button (copy the link — Slack unfurls it
        into a preview when pasted) and a <strong>Print</strong> button that assembles the summary,
        the doc table, and all three views into a printable page.
      </p>
    </Section>
  );
}

function ViewCard({
  title,
  purpose,
  detail,
  screenshot,
}: {
  title: string;
  purpose: string;
  detail: string;
  screenshot?: string;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-ink-200 bg-white">
      {/* Screenshot slot. Hides itself gracefully if the file hasn't been
          added yet — keeps the layout stable during doc iteration. */}
      {screenshot && (
        <img
          src={screenshot}
          alt={`${title} — DocMap interactive map`}
          className="aspect-[16/10] w-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
      <div className="p-4">
        <div className="text-sm font-semibold text-ink-900">{title}</div>
        <div className="mt-1 text-xs font-medium text-accent">{purpose}</div>
        <p className="mt-2 text-xs leading-relaxed text-ink-700">{detail}</p>
      </div>
    </div>
  );
}

// ---------- MCP surface ----------

function McpSurface() {
  const tools = [
    {
      name: 'analyze',
      title: 'docmap.analyze',
      desc: 'Runs the full pipeline against a set of Slack channels and returns the graph plus a viewer URL.',
      input: '{ channelIds: string[], days: number }',
      output: '{ graphId, viewerUrl, summary, summaryReport, docs, users, edges }',
    },
    {
      name: 'get_graph',
      title: 'docmap.get_graph',
      desc: 'Fetches a previously-generated graph by id. A graph made from Slack is retrievable via MCP and vice versa.',
      input: '{ graphId: string }',
      output: '{ graphId, viewerUrl, channelCount, days, graph }',
    },
  ];
  return (
    <Section id="mcp" title="MCP surface">
      <p>
        DocMap ships an MCP server so any MCP-capable AI host can call it as a tool — no Slack
        client needed. Both surfaces share the same headless pipeline, so a graph created in Slack
        is retrievable by id from MCP and vice versa.
      </p>

      <div className="rounded-lg border border-ink-200 bg-white p-4">
        <div className="text-sm font-semibold text-ink-900">What it feels like</div>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-700">
          Inside your AI host, DocMap shows up alongside the other tools. Ask something like{' '}
          <em>&ldquo;Map the docs shared in #platform-guild over the last 30 days,&rdquo;</em> and
          the assistant calls <code>docmap.analyze</code>, gets a structured response, and replies
          conversationally with a link to the viewer.
        </p>
      </div>

      <p>
        <strong>Wiring it up</strong> — DocMap&apos;s MCP server speaks JSON-RPC over stdio, the
        standard transport for local MCP integrations. In your MCP host&apos;s config, point at the
        built server entry point. For Claude Desktop, that&apos;s{' '}
        <code>~/Library/Application Support/Claude/claude_desktop_config.json</code>:
      </p>
      <CodeBlock>{`{
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
}`}</CodeBlock>
      <p>
        Point <code>DATABASE_URL</code> at the same Prisma database the Slack server reads, so both
        surfaces see the same graphs. Once configured, restart your MCP host and DocMap&apos;s tools
        appear in the tool inventory.
      </p>

      <div className="space-y-3">
        <div className="text-sm font-semibold text-ink-900">Tools exposed</div>
        {tools.map((t) => (
          <div key={t.name} className="rounded-lg border border-ink-200 bg-white p-4">
            <code className="text-sm font-semibold text-accent">{t.title}</code>
            <p className="mt-2 text-sm text-ink-700">{t.desc}</p>
            <dl className="mt-2 space-y-1 text-xs text-ink-400">
              <div className="flex gap-2">
                <dt className="font-semibold">Input</dt>
                <dd className="font-mono">{t.input}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-semibold">Output</dt>
                <dd className="font-mono">{t.output}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ---------- API reference ----------

function ApiReference() {
  return (
    <Section id="api" title="API reference">
      <p>
        The server exposes a small JSON API under <code>/api</code>. The UI proxies these in dev.
      </p>
      <div className="space-y-3">
        {ENDPOINTS.map((e) => (
          <div key={e.method + e.path} className="rounded-lg border border-ink-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <MethodBadge method={e.method} />
              <code className="text-sm font-medium text-ink-900">{e.path}</code>
            </div>
            <p className="mt-2 text-sm text-ink-700">{e.desc}</p>
            <dl className="mt-2 space-y-1 text-xs text-ink-400">
              {e.params && (
                <div className="flex gap-2">
                  <dt className="font-semibold">Params</dt>
                  <dd className="font-mono">{e.params}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="font-semibold">Returns</dt>
                <dd className="font-mono">{e.resp}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      <p>
        Contributing or self-hosting? <code>DEVELOPMENT.md</code> in the repo has the full setup
        (install, database, Slack sandbox, LLM providers) and{' '}
        <code>HACKATHON.md</code> covers the submission-specific bits.
      </p>
    </Section>
  );
}

function MethodBadge({ method }: { method: 'GET' | 'POST' }) {
  const cls = method === 'GET' ? 'bg-emerald-50 text-emerald-700' : 'bg-accent-soft text-accent';
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-bold tracking-wide ${cls}`}>{method}</span>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-ink-200 bg-ink-900 p-4 text-xs leading-relaxed text-ink-50">
      <code>{children}</code>
    </pre>
  );
}
