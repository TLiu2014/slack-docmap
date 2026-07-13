import { Link } from 'react-router-dom';

// Placeholder Slack install URL — swap for the real OAuth/install link.
const ADD_TO_SLACK_URL = 'https://slack.com/oauth/v2/authorize';
// GitHub repository — used in the top-nav icon and the footer.
export const GITHUB_REPO_URL = 'https://github.com/TLiu2014/slack-docmap';
// Devpost page for the Slack Agent Builder Challenge.
export const HACKATHON_URL = 'https://slackhack.devpost.com/';
// Placeholder demo-video URL — swap for the real link once the video is up.
export const DEMO_VIDEO_URL = '#demo-video';

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
          <a
            href={GITHUB_REPO_URL}
            aria-label="DocMap on GitHub"
            target="_blank"
            rel="noreferrer"
            className="ml-1 rounded-md p-1.5 text-ink-700 transition hover:bg-ink-100 hover:text-ink-900"
          >
            <GitHubIcon className="h-5 w-5" />
          </a>
          <Link
            to="/docs"
            className="rounded-md px-3 py-1.5 font-medium text-ink-700 transition hover:text-ink-900"
          >
            Docs
          </Link>
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

function SiteFooter() {
  return (
    <footer className="border-t border-ink-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-ink-400 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <img src="/docmap-icon.svg" alt="" className="h-5 w-5" />
          <span>
            DocMap — Slack document intelligence, built for the{' '}
            <a
              href={HACKATHON_URL}
              target="_blank"
              rel="noreferrer"
              className="text-ink-700 underline decoration-ink-200 underline-offset-2 hover:text-accent hover:decoration-accent"
            >
              Slack Agent Builder Challenge
            </a>
            .
          </span>
        </div>
        <div className="flex items-center gap-5">
          <Link to="/docs" className="hover:text-ink-700">
            Docs
          </Link>
          <a
            href={GITHUB_REPO_URL}
            className="inline-flex items-center gap-1.5 hover:text-ink-700"
            target="_blank"
            rel="noreferrer"
          >
            <GitHubIcon className="h-4 w-4" />
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}

export function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.79-.25.79-.55v-1.93c-3.2.7-3.87-1.54-3.87-1.54-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.11-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.51-1.47.11-3.07 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.6.23 2.78.11 3.07.74.8 1.19 1.83 1.19 3.08 0 4.41-2.69 5.39-5.25 5.67.41.35.78 1.04.78 2.1v3.11c0 .3.21.66.79.55A11.52 11.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"
      />
    </svg>
  );
}

export { ADD_TO_SLACK_URL };
