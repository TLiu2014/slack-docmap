import { Link } from 'react-router-dom';

import { ADD_TO_SLACK_URL, MarketingLayout } from './MarketingLayout';

export function Landing() {
  return (
    <MarketingLayout>
      <Hero />
      <Features />
      <HowItWorks />
      <Pricing />
      <CTA />
    </MarketingLayout>
  );
}

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
        <span className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-medium text-ink-700">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Slack-native · AI-powered
        </span>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
          Turn shared links into a living{' '}
          <span className="text-accent">document map</span>.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-ink-700">
          DocMap scans your Slack channels for shared documents, asks an LLM who shared what and how
          it all connects, then renders an interactive graph and executive summary — all from a
          single <code className="rounded bg-ink-100 px-1.5 py-0.5 text-sm">/docmap</code> command.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href={ADD_TO_SLACK_URL}
            className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            Add to Slack
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

function CommandPreview() {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-ink-200 bg-white p-4 text-left shadow-sm">
      <div className="flex items-center gap-2 border-b border-ink-100 pb-3">
        <div className="h-6 w-6 rounded bg-accent" aria-hidden />
        <span className="text-sm font-medium text-ink-900">#product-eng</span>
      </div>
      <div className="space-y-2 pt-3 font-mono text-sm">
        <div className="text-ink-700">
          <span className="text-ink-400">you ›</span> /docmap quick
        </div>
        <div className="text-ink-400">⏳ Fetching messages from Slack…</div>
        <div className="text-ink-400">🧠 Analyzing document connections with AI…</div>
        <div className="font-sans text-ink-900">
          ✅ <span className="font-medium">DocMap ready</span> — 12 docs, 7 contributors
        </div>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    title: 'Slack-native',
    body: 'Runs entirely from a slash command. No new app to learn — results post right back into the channel.',
  },
  {
    title: 'AI relationship mapping',
    body: 'Gemini, OpenAI, or Claude extract who authored, shared, and referenced each document.',
  },
  {
    title: 'Interactive graph',
    body: 'Explore docs and contributors on a React Flow canvas, or read the auto-generated summary.',
  },
  {
    title: 'Multi-channel',
    body: 'Analyze several channels at once over any time window — perfect for project retros.',
  },
];

function Features() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-ink-200 bg-white p-5 transition hover:shadow-sm"
          >
            <div className="mb-3 h-9 w-9 rounded-lg bg-accent-soft" aria-hidden />
            <h3 className="text-sm font-semibold text-ink-900">{f.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-400">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const STEPS = [
  { n: 1, title: 'Run /docmap', body: 'Pick channels and a date range, or use quick mode for the current channel.' },
  { n: 2, title: 'We scan & analyze', body: 'DocMap searches link-bearing messages and sends them to your chosen LLM.' },
  { n: 3, title: 'Explore the map', body: 'Open the interactive graph and summary report from a link in the channel.' },
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

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    cadence: '/mo',
    blurb: 'For trying DocMap out.',
    features: ['5 maps per month', 'Single channel', 'Summary + visual map'],
    cta: { label: 'Add to Slack', href: ADD_TO_SLACK_URL, primary: false },
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$29',
    cadence: '/mo',
    blurb: 'For active teams.',
    features: ['Unlimited maps', 'Multi-channel analysis', 'Priority processing'],
    cta: { label: 'Upgrade to Pro', to: '/billing', primary: true },
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    cadence: '',
    blurb: 'For security-conscious orgs.',
    features: ['Everything in Pro', 'Bring your own LLM keys (BYOK)', 'SSO & priority support'],
    cta: { label: 'Contact sales', href: 'mailto:sales@example.com', primary: false },
    highlight: false,
  },
];

function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-6 py-16">
      <h2 className="text-center text-2xl font-semibold tracking-tight text-ink-900">
        Simple, usage-based pricing
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-center text-sm text-ink-400">
        Start free. Upgrade for unlimited maps and multi-channel support, or go Enterprise to use
        your own model keys.
      </p>
      <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`flex flex-col rounded-xl border bg-white p-6 ${
              plan.highlight ? 'border-accent shadow-md ring-1 ring-accent' : 'border-ink-200'
            }`}
          >
            {plan.highlight && (
              <span className="mb-3 self-start rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">
                Most popular
              </span>
            )}
            <h3 className="text-lg font-semibold text-ink-900">{plan.name}</h3>
            <p className="mt-1 text-sm text-ink-400">{plan.blurb}</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-3xl font-semibold text-ink-900">{plan.price}</span>
              <span className="text-sm text-ink-400">{plan.cadence}</span>
            </div>
            <ul className="mt-5 flex-1 space-y-2.5 text-sm text-ink-700">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="mt-0.5 text-accent">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <PlanCta plan={plan} />
          </div>
        ))}
      </div>
    </section>
  );
}

function PlanCta({ plan }: { plan: (typeof PLANS)[number] }) {
  const cls = `mt-6 rounded-md px-4 py-2 text-center text-sm font-medium transition ${
    plan.cta.primary
      ? 'bg-accent text-white hover:opacity-90'
      : 'border border-ink-200 text-ink-700 hover:bg-ink-100'
  }`;
  if ('to' in plan.cta && plan.cta.to) {
    return (
      <Link to={plan.cta.to} className={cls}>
        {plan.cta.label}
      </Link>
    );
  }
  return (
    <a href={'href' in plan.cta ? plan.cta.href : '#'} className={cls}>
      {plan.cta.label}
    </a>
  );
}

function CTA() {
  return (
    <section className="border-t border-ink-200 bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-ink-900">
          Map your team&apos;s knowledge in seconds
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-ink-700">
          Install DocMap and run <code className="rounded bg-ink-100 px-1.5 py-0.5">/docmap</code>{' '}
          in any channel. Your first five maps are on us.
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
