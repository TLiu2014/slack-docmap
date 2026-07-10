import { MarketingLayout } from './MarketingLayout';

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
    desc: 'Fetch a generated DocMap graph by id (used by the viewer).',
    resp: '{ summaryReport, users[], docs[], edges[] }',
  },
  {
    method: 'POST',
    path: '/api/dev/graph',
    desc: 'Dev-only: seed the in-memory store with arbitrary graph JSON.',
    params: 'body: DocmapGraph',
    resp: '{ id, url }',
  },
  {
    method: 'GET',
    path: '/api/workspace/:teamId',
    desc: 'Workspace tier + usage. Returns which BYOK keys are set, never the raw keys.',
    resp: '{ slackTeamId, tier, usageCount, freeLimit, hasOpenAIKey, hasAnthropicKey, hasGeminiKey, hasQwenKey }',
  },
  {
    method: 'POST',
    path: '/api/workspace/:teamId/checkout',
    desc: 'Mock Stripe Checkout — sets the workspace tier.',
    params: 'body: { tier: "FREE" | "PRO" | "ENTERPRISE" }',
    resp: 'WorkspacePublic',
  },
  {
    method: 'POST',
    path: '/api/workspace/settings',
    desc: 'Save BYOK provider keys (Enterprise only). Stored AES-256-GCM encrypted at rest.',
    params: 'body: { slackTeamId, openAIKey?, anthropicKey?, geminiKey?, qwenKey? }',
    resp: 'WorkspacePublic',
  },
];

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'getting-started', label: 'Getting started' },
  { id: 'commands', label: 'Slash commands' },
  { id: 'api', label: 'API reference' },
  { id: 'plans', label: 'Plans & BYOK' },
];

export function Docs() {
  return (
    <MarketingLayout>
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-12 lg:grid-cols-[200px_minmax(0,1fr)]">
        <Toc />
        <div className="min-w-0 space-y-14">
          <Overview />
          <Architecture />
          <GettingStarted />
          <Commands />
          <ApiReference />
          <Plans />
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

function Overview() {
  return (
    <Section id="overview" title="Overview">
      <p>
        DocMap is a Slack slash-command app. It scans a channel&apos;s history for shared document
        links, asks an LLM to extract a structured graph of who shared what and how documents
        relate, and renders the result as a Markdown summary plus an interactive React Flow canvas.
      </p>
      <p>
        The product has three surfaces: the <strong>Slack command</strong> (<code>/docmap</code>),
        the <strong>web viewer</strong> for generated maps, and this <strong>admin/marketing
        site</strong> (landing, docs, and the billing dashboard).
      </p>
    </Section>
  );
}

function Architecture() {
  return (
    <Section id="architecture" title="Architecture">
      <p>
        A pnpm monorepo with two packages: <code>server/</code> (Slack Bolt + Express + LLM adapters
        + Prisma) and <code>ui/</code> (Vite + React + Tailwind + Radix + React Flow).
      </p>

      <div className="rounded-xl border border-ink-200 bg-white p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <DiagramBox title="Slack" lines={['/docmap command', 'Block Kit messages']} />
          <DiagramBox
            title="server/"
            accent
            lines={['Bolt (Socket Mode)', 'Express /api', 'LLM factory (BYOK)', 'Prisma → SQLite/PG']}
          />
          <DiagramBox title="ui/" lines={['Landing + Docs', 'Graph viewer', 'Admin dashboard']} />
        </div>
        <p className="mt-4 text-xs text-ink-400">
          Flow: <code>/docmap</code> → billing gate → fetch messages → LLM factory resolves the
          provider (Enterprise BYOK key if present) → graph cached under a UUID → channel link opens
          the viewer.
        </p>
      </div>

      <p>
        Workspace state (tier, monthly usage, encrypted BYOK keys) lives in the database. Generated
        graphs are kept in an in-memory store with a 6-hour TTL.
      </p>
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

function GettingStarted() {
  return (
    <Section id="getting-started" title="Getting started">
      <p>Run both packages locally (server on :3000, UI on :5173):</p>
      <CodeBlock>{`pnpm install
cp server/.env.example server/.env

# create the local SQLite database
pnpm --filter @slack-docmap/server run db:push

pnpm dev`}</CodeBlock>
      <p>
        For the full Slack integration (Socket Mode — no ngrok required) and step-by-step testing of
        the free-tier quota and BYOK, see <code>DEVELOPMENT.md</code> and <code>LOCAL_DEV.md</code>{' '}
        in the repo.
      </p>
    </Section>
  );
}

function Commands() {
  const rows = [
    ['/docmap', 'Opens an ephemeral form: pick channels + start date, then Generate.'],
    ['/docmap quick', 'Skips the form — current channel, last 7 days.'],
    ['/docmap 30d', 'Custom timeframe.'],
  ];
  return (
    <Section id="commands" title="Slash commands">
      <div className="overflow-hidden rounded-lg border border-ink-200">
        <table className="w-full text-left text-sm">
          <tbody className="divide-y divide-ink-100">
            {rows.map(([cmd, desc]) => (
              <tr key={cmd} className="bg-white">
                <td className="w-44 px-4 py-3 font-mono text-ink-900">{cmd}</td>
                <td className="px-4 py-3 text-ink-700">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Every invocation passes through the billing gate, which enforces the Free tier&apos;s
        monthly quota before any work begins.
      </p>
    </Section>
  );
}

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
    </Section>
  );
}

function MethodBadge({ method }: { method: 'GET' | 'POST' }) {
  const cls = method === 'GET' ? 'bg-emerald-50 text-emerald-700' : 'bg-accent-soft text-accent';
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-bold tracking-wide ${cls}`}>{method}</span>
  );
}

function Plans() {
  return (
    <Section id="plans" title="Plans & BYOK">
      <ul className="space-y-2">
        <li>
          <strong>Free</strong> — 5 maps per calendar month, single channel. The quota resets
          monthly; the 6th attempt returns an upgrade prompt in Slack.
        </li>
        <li>
          <strong>Pro</strong> — unlimited maps and multi-channel analysis. Upgrade via the mock
          Stripe checkout on the billing dashboard.
        </li>
        <li>
          <strong>Enterprise</strong> — bring your own LLM keys (OpenAI / Anthropic / Gemini / Qwen).
          Keys are encrypted at rest and used in place of the platform&apos;s shared credentials.
        </li>
      </ul>
      <p>
        Manage your plan and keys on the{' '}
        <a className="text-accent underline underline-offset-2" href="/billing">
          billing dashboard
        </a>
        .
      </p>
    </Section>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-ink-200 bg-ink-900 p-4 text-xs leading-relaxed text-ink-50">
      <code>{children}</code>
    </pre>
  );
}
