import * as Dialog from '@radix-ui/react-dialog';
import { useMemo, useState } from 'react';

// SEND-IN-SLACK-DISABLED (hackathon submission): the "Send in Slack" form that
// posted the viewer link into channels/DMs is commented out for the demo.
// Copy-link is enough for the hackathon flow — the Slack DM DocMap already
// posts is the primary share surface. Restore this block when we productionize
// (needs a channel/user picker rather than raw ID paste).
// import { shareGraph, type ShareResult } from '../api';

interface ShareDialogProps {
  graphId: string;
}

// type SendState =
//   | { status: 'idle' }
//   | { status: 'sending' }
//   | { status: 'sent'; results: ShareResult[] }
//   | { status: 'error'; message: string };

export function ShareDialog({ graphId }: ShareDialogProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = useMemo(() => {
    const base = window.location.origin;
    return `${base}/?id=${graphId}`;
  }, [graphId]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* silent — clipboard blocked */
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setCopied(false);
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
            Copy the link — paste it into any Slack channel, DM, doc, or email.
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
            <p className="mt-2 text-[11px] text-ink-400">
              Slack auto-unfurls this link into a preview when pasted, so recipients see the
              summary right in the message.
            </p>
          </div>

          {/*
          // SEND-IN-SLACK-DISABLED: form that hit /api/graph/:id/share to post
          // the link into channels/DMs. Left here so it's easy to bring back
          // once we have a proper channel/user picker (right now users have to
          // paste raw Slack IDs, which is bad UX).
          <div className="mt-5 border-t border-ink-100 pt-4">
            <div className="text-xs font-medium uppercase tracking-wide text-ink-400">
              Send in Slack
            </div>
            <label className="mt-2 block text-xs text-ink-700">
              Channel and user IDs (comma-separated)
              <textarea ... />
            </label>
            ...
          </div>
          */}

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-100"
              >
                Close
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
