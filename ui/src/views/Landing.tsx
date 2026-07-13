import { Link } from 'react-router-dom';

import {
  ADD_TO_SLACK_URL,
  DEMO_VIDEO_URL,
  HACKATHON_URL,
  MarketingLayout,
} from './MarketingLayout';

export function Landing() {
  return (
    <MarketingLayout>
      <Hero />
      <Features />
      <HowItWorks />
      <CTA />
    </MarketingLayout>
  );
}

// ---------- Hero ----------

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 0%, rgba(79,70,229,0.12) 0%, rgba(79,70,229,0) 70%)',
        }}
        aria-hidden
      />
      <div className="mx-auto max-w-3xl px-6 pb-16 pt-20 text-center">
        <a
          href={HACKATHON_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-medium text-ink-700 transition hover:bg-ink-50"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Built for the Slack Agent Builder
          Challenge
        </a>
        <h1 className="mt-5 text-5xl font-semibold tracking-tight text-ink-900 sm:text-6xl">
          <span className="text-accent">DocMap</span>: organize every document
          shared in Slack
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-ink-700">
          DocMap scans Slack channels for shared documents, extracts a structured graph of who
          shared what and how they connect, and hands you an interactive map — from a{' '}
          <code className="rounded bg-ink-100 px-1.5 py-0.5 text-sm">/docmap</code> command or from
          any MCP-capable AI host.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href={ADD_TO_SLACK_URL}
            className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            Add to Slack
          </a>
          <a
            href={DEMO_VIDEO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-ink-200 bg-white px-5 py-2.5 text-sm font-medium text-ink-700 transition hover:bg-ink-100"
          >
            <PlayIcon className="h-4 w-4 text-accent" />
            Watch 3-min demo
          </a>
          <Link
            to="/docs"
            className="rounded-md border border-ink-200 bg-white px-5 py-2.5 text-sm font-medium text-ink-700 transition hover:bg-ink-100"
          >
            Read the docs
          </Link>
        </div>
        <div className="mt-12">
          <CommandPreview />
        </div>
      </div>
    </section>
  );
}

// A stylized preview of the actual pipeline: user runs the slash command in a
// channel, DocMap DMs the invoker with progressive status updates + a final
// interactive-map card. Kept in sync with server/src/pipeline.ts.
function CommandPreview() {
  return (
    <div className="mx-auto max-w-xl overflow-hidden rounded-xl border border-ink-200 bg-white text-left shadow-sm">
      <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-[10px] font-bold text-white">
          D
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink-900">DocMap</div>
          <div className="truncate text-[11px] text-ink-400">Direct message</div>
        </div>
        <span className="rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-medium text-ink-700">
          APP
        </span>
      </div>

      <div className="space-y-3 px-4 py-4 text-sm">
        {/* Simulated slash command echo. Slack hides the command in the source
            channel, but showing it here makes the flow legible. */}
        <div className="flex items-center gap-2 text-[13px]">
          <span className="rounded-md bg-ink-100 px-1.5 py-0.5 font-mono text-[12px] text-ink-900">
            /docmap quick
          </span>
          <span className="text-ink-400">in #platform-guild</span>
        </div>

        <PreviewMessage stateLabel="⏳" text="Fetching messages from Slack…" muted />
        <PreviewMessage stateLabel="✨" text="Analyzing document connections… (34 messages)" muted />
        <PreviewMessage stateLabel="✅" text="DocMap ready — 10 docs, 3 contributors across 1 channel(s) in the last 7 day(s)." />

        {/* Doc/User view switcher styled to match the Block Kit radio_buttons. */}
        <div className="rounded-md border border-ink-100 bg-ink-50 p-3">
          <div className="flex items-center gap-4 text-[12px]">
            <span className="inline-flex items-center gap-1.5 font-medium text-accent">
              <span className="flex h-3 w-3 items-center justify-center rounded-full border-2 border-accent">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
              Doc view
            </span>
            <span className="inline-flex items-center gap-1.5 text-ink-400">
              <span className="h-3 w-3 rounded-full border-2 border-ink-200" />
              User view
            </span>
          </div>
          <ul className="mt-2 space-y-1 text-[12px] text-ink-700">
            <li>
              <span className="font-medium">Design Doc Template</span> · Google Docs · #platform-guild
            </li>
            <li>
              <span className="font-medium">Bolt JS Repository</span> · GitHub · #platform-guild
            </li>
            <li className="text-ink-400">…and 8 more</li>
          </ul>
        </div>

        <div className="pt-1">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm"
          >
            Open interactive map
            <ArrowUpRightIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewMessage({
  stateLabel,
  text,
  muted,
}: {
  stateLabel: string;
  text: string;
  muted?: boolean;
}) {
  return (
    <div className={`flex items-start gap-2 ${muted ? 'text-ink-400' : 'text-ink-900'}`}>
      <span className="mt-0.5 text-sm leading-none">{stateLabel}</span>
      <span className="text-[13px] leading-relaxed">{text}</span>
    </div>
  );
}

// ---------- Features ----------

const FEATURES: FeatureCard[] = [
  {
    title: 'Slack-native',
    body: 'Runs entirely from a slash command. Results DM back to you as a Block Kit report — no new app to learn.',
    icon: SlackIcon,
  },
  {
    title: 'Real-Time Search',
    body: "Powered by Slack's assistant.search.context. DocMap sees only what the invoker can see, in real time.",
    icon: SearchIcon,
  },
  {
    title: 'Also an MCP tool',
    body: 'Add DocMap to Claude Desktop, Cursor, or any MCP-capable AI host. Same pipeline; a JSON response + viewer link.',
    icon: PlugIcon,
  },
  {
    title: 'Interactive graph',
    body: 'Explore documents, contributors, and their connections on an interactive React Flow canvas.',
    icon: GraphIcon,
  },
];

interface FeatureCard {
  title: string;
  body: string;
  icon: (props: { className?: string }) => JSX.Element;
}

function Features() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <div
              key={f.title}
              className="rounded-xl border border-ink-200 bg-white p-5 transition hover:shadow-sm"
            >
              <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold text-ink-900">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-400">{f.body}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------- How it works ----------

const STEPS = [
  {
    n: 1,
    title: 'Trigger DocMap',
    body: 'Run /docmap in Slack, or call the analyze tool from an MCP host like Claude Desktop.',
  },
  {
    n: 2,
    title: 'We scan & analyze',
    body: 'DocMap searches link-bearing messages via Real-Time Search and sends them to your chosen LLM.',
  },
  {
    n: 3,
    title: 'Explore the map',
    body: 'Open the interactive graph and summary report from the viewer URL DocMap hands back.',
  },
];

function HowItWorks() {
  return (
    <section className="border-y border-ink-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-ink-900">
          How it works
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">
                {s.n}
              </div>
              <h3 className="mt-4 text-base font-semibold text-ink-900">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-400">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- CTA ----------

function CTA() {
  return (
    <section className="border-t border-ink-200 bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-ink-900">
          Map your team&apos;s knowledge in seconds
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-ink-700">
          Install DocMap and run <code className="rounded bg-ink-100 px-1.5 py-0.5">/docmap</code>{' '}
          in any channel — DocMap DMs an interactive map back to you in seconds.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <a
            href={ADD_TO_SLACK_URL}
            className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            Add to Slack
          </a>
          <Link
            to="/docs"
            className="rounded-md border border-ink-200 px-5 py-2.5 text-sm font-medium text-ink-700 transition hover:bg-ink-100"
          >
            Read the docs
          </Link>
        </div>
      </div>
    </section>
  );
}

// ---------- Inline icons ----------

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className={className}>
      <path d="M6.3 4.4c-.6-.36-1.3.07-1.3.77v9.66c0 .7.7 1.13 1.3.77l8.06-4.83a.9.9 0 0 0 0-1.54L6.3 4.4z" />
    </svg>
  );
}

function ArrowUpRightIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 14 14 6M7 6h7v7" />
    </svg>
  );
}

function SlackIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M5.1 15.05a2.55 2.55 0 1 1-2.55-2.55h2.55v2.55zm1.28 0a2.55 2.55 0 0 1 5.1 0v6.4a2.55 2.55 0 0 1-5.1 0v-6.4zM8.95 4.83a2.55 2.55 0 1 1 2.54-2.55v2.55H8.95zm0 1.29a2.55 2.55 0 0 1 0 5.1h-6.4a2.55 2.55 0 1 1 0-5.1h6.4zM18.9 8.68a2.55 2.55 0 1 1 2.55 2.55h-2.55V8.68zm-1.28 0a2.55 2.55 0 0 1-5.1 0v-6.4a2.55 2.55 0 1 1 5.1 0v6.4zM15.05 18.9a2.55 2.55 0 1 1-2.55 2.55v-2.55h2.55zm0-1.28a2.55 2.55 0 0 1 0-5.1h6.4a2.55 2.55 0 1 1 0 5.1h-6.4z" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden className={className}>
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path strokeLinecap="round" d="m17 17-4-4" />
      <path d="M8 8h.01M11 8h.01" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function PlugIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden className={className}>
      <path strokeLinecap="round" d="M9 2v4M15 2v4" />
      <rect x="7" y="6" width="10" height="7" rx="2" />
      <path strokeLinecap="round" d="M12 13v3a4 4 0 0 0 4 4h1" />
    </svg>
  );
}

function GraphIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden className={className}>
      <circle cx="5" cy="6" r="2" />
      <circle cx="19" cy="6" r="2" />
      <circle cx="12" cy="18" r="2" />
      <circle cx="5" cy="14" r="1.5" />
      <path strokeLinecap="round" d="m6.4 7.3 4.3 9.4M17.6 7.3l-4.3 9.4M5 8v4" />
    </svg>
  );
}
