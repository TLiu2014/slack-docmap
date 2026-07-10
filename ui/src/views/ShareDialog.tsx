import * as Dialog from '@radix-ui/react-dialog';
import { useMemo, useState } from 'react';

import { shareGraph, type ShareResult } from '../api';

interface ShareDialogProps {
  graphId: string;
}

type SendState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'sent'; results: ShareResult[] }
  | { status: 'error'; message: string };

// Rough validation for Slack IDs. Channels start with C/G, users with U/W, and
// group DMs with G. We accept a comma / newline / space-separated list.
const ID_PATTERN = /^[CGUW][A-Z0-9]{6,}$/;

function parseDestinations(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  );
}

export function ShareDialog({ graphId }: ShareDialogProps) {
  const [open, setOpen] = useState(false);
  const [rawDestinations, setRawDestinations] = useState('');
  const [note, setNote] = useState('');
  const [sharerId, setSharerId] = useState('');
  const [state, setState] = useState<SendState>({ status: 'idle' });
  const [copied, setCopied] = useState(false);

  const shareUrl = useMemo(() => {
    const base = window.location.origin;
    return `${base}/?id=${graphId}`;
  }, [graphId]);

  const destinations = parseDestinations(rawDestinations);
  const invalid = destinations.filter((d) => !ID_PATTERN.test(d));
  const validCount = destinations.length - invalid.length;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* silent — clipboard blocked */
    }
  }

  async function handleSend() {
    if (validCount === 0) return;
    setState({ status: 'sending' });
    try {
      const res = await shareGraph({
        graphId,
        destinations: destinations.filter((d) => ID_PATTERN.test(d)),
        sharerId: sharerId.trim() || undefined,
        note: note.trim() || undefined,
      });
      setState({ status: 'sent', results: res.results });
    } catch (err) {
      setState({ status: 'error', message: (err as Error).message });
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setState({ status: 'idle' });
      setCopied(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-100"
        >
          Share
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[min(92vw,540px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-ink-200 bg-white p-6 shadow-xl focus:outline-none">
          <Dialog.Title className="text-base font-semibold text-ink-900">
            Share this DocMap
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-ink-400">
            Copy the link, or send it to Slack channels and users via the DocMap bot.
          </Dialog.Description>

          {/* Copy link */}
          <div className="mt-4">
            <label className="text-xs font-medium uppercase tracking-wide text-ink-400">
              Link
            </label>
            <div className="mt-1 flex gap-2">
              <input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 rounded-md border border-ink-200 bg-ink-50 px-3 py-2 font-mono text-xs text-ink-700"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-md bg-accent px-3 py-2 text-xs font-medium text-white hover:opacity-90"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Send in Slack */}
          <div className="mt-5 border-t border-ink-100 pt-4">
            <div className="text-xs font-medium uppercase tracking-wide text-ink-400">
              Send in Slack
            </div>
            <label className="mt-2 block text-xs text-ink-700">
              Channel and user IDs (comma-separated)
              <textarea
                value={rawDestinations}
                onChange={(e) => setRawDestinations(e.target.value)}
                placeholder="C0123ABCD, U0456DEFG"
                rows={2}
                className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 font-mono text-xs text-ink-900 focus:border-accent focus:outline-none"
              />
            </label>
            <p className="mt-1 text-[11px] text-ink-400">
              In Slack, right-click a channel or user → <em>View member details</em> or{' '}
              <em>Copy link</em> to grab the ID.
            </p>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs text-ink-700">
                Your Slack user ID (optional)
                <input
                  value={sharerId}
                  onChange={(e) => setSharerId(e.target.value)}
                  placeholder="U0..."
                  className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 font-mono text-xs text-ink-900 focus:border-accent focus:outline-none"
                />
              </label>
              <label className="block text-xs text-ink-700">
                Note (optional)
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Onboarding for the new hire"
                  maxLength={500}
                  className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-xs text-ink-900 focus:border-accent focus:outline-none"
                />
              </label>
            </div>

            {invalid.length > 0 && (
              <div className="mt-2 text-[11px] text-red-600">
                Ignoring invalid IDs: {invalid.join(', ')}
              </div>
            )}
          </div>

          {/* Feedback */}
          {state.status === 'sent' && (
            <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-xs text-green-800">
              Sent to {state.results.filter((r) => r.ok).length} of {state.results.length}{' '}
              destination(s).
              {state.results.some((r) => !r.ok) && (
                <ul className="mt-1 list-disc pl-4">
                  {state.results
                    .filter((r) => !r.ok)
                    .map((r) => (
                      <li key={r.destination}>
                        <code>{r.destination}</code>: {r.error}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
          {state.status === 'error' && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {state.message}
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-100"
              >
                Close
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleSend}
              disabled={validCount === 0 || state.status === 'sending'}
              className="rounded-md bg-accent px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
            >
              {state.status === 'sending' ? 'Sending…' : `Send${validCount ? ` (${validCount})` : ''}`}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
