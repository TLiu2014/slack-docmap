import { Link, NavLink } from 'react-router-dom';

// Placeholder Slack install URL — swap for your real OAuth/install link.
const ADD_TO_SLACK_URL = 'https://slack.com/oauth/v2/authorize';

export function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-ink-50">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-ink-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/docmap-icon.svg" alt="DocMap" className="h-7 w-7" />
          <span className="text-base font-semibold tracking-tight text-ink-900">DocMap</span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          <HeaderLink to="/">Product</HeaderLink>
          <HeaderLink to="/docs">Docs</HeaderLink>
          <a
            href={ADD_TO_SLACK_URL}
            className="ml-2 rounded-md bg-accent px-3.5 py-1.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            Add to Slack
          </a>
        </nav>
      </div>
    </header>
  );
}

function HeaderLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `rounded-md px-3 py-1.5 font-medium transition ${
          isActive ? 'text-ink-900' : 'text-ink-400 hover:text-ink-700'
        }`
      }
    >
      {children}
    </NavLink>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-ink-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-ink-400 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <img src="/docmap-icon.svg" alt="" className="h-5 w-5" />
          <span>DocMap — Slack document intelligence</span>
        </div>
        <div className="flex items-center gap-5">
          <Link to="/docs" className="hover:text-ink-700">
            Docs
          </Link>
          <Link to="/billing" className="hover:text-ink-700">
            Billing
          </Link>
          <a
            href="https://github.com"
            className="hover:text-ink-700"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}

export { ADD_TO_SLACK_URL };
