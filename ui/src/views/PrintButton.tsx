import { useState } from 'react';

import { type DiagramCaptures, type ProgressUpdate } from './captureDiagrams';
import { displayDocTitle, docTypeLabel } from '../lib/docTypes';
import type { DocmapGraph } from '../types';

interface PrintButtonProps {
  graph: DocmapGraph;
  // Snapshots all three diagram views (God / Doc / User) from the live map,
  // reporting progress after each step.
  capture: (onProgress?: (update: ProgressUpdate) => void) => Promise<DiagramCaptures>;
}

// Escape a small set of chars for safe inclusion in the print-window HTML.
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Best-effort markdown → HTML for the summary. Handles headings, bullets, and
 *  paragraphs — enough for our LLM-generated summaries. */
function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      continue;
    }
    if (line.startsWith('### ')) {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      out.push(`<h3>${inlineMd(esc(line.slice(4)))}</h3>`);
    } else if (line.startsWith('## ')) {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      out.push(`<h2>${inlineMd(esc(line.slice(3)))}</h2>`);
    } else if (line.startsWith('# ')) {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      out.push(`<h1>${inlineMd(esc(line.slice(2)))}</h1>`);
    } else if (/^[-*] /.test(line)) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inlineMd(esc(line.slice(2)))}</li>`);
    } else {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      out.push(`<p>${inlineMd(esc(line))}</p>`);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('\n');
}

/** Handle bold + inline links inside an already-escaped line. */
function inlineMd(escaped: string): string {
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>');
}

function diagramSection(title: string, dataUrl: string | null): string {
  const body = dataUrl
    ? `<img src="${dataUrl}" alt="${esc(title)}" />`
    : '<div class="empty">Diagram unavailable.</div>';
  return `<section class="diagram">
    <h2>${esc(title)}</h2>
    ${body}
  </section>`;
}

function buildPrintHtml(graph: DocmapGraph, diagrams: DiagramCaptures): string {
  const now = new Date().toLocaleString();
  const summaryHtml = markdownToHtml(graph.summaryReport ?? '');

  const docRows = graph.docs
    .map((d) => {
      const title = esc(displayDocTitle(d));
      const link = d.url
        ? `<a href="${esc(d.url)}">${title}</a>`
        : title;
      const type = esc(docTypeLabel(d.type) || d.type);
      const channel = d.channel ? `#${esc(d.channel)}` : '';
      return `<tr><td>${link}</td><td>${type}</td><td>${channel}</td></tr>`;
    })
    .join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>DocMap — printed ${esc(now)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #13182a; margin: 32px; }
    header { border-bottom: 2px solid #4f46e5; padding-bottom: 8px; margin-bottom: 24px; }
    header h1 { margin: 0; font-size: 20px; color: #4f46e5; }
    header .meta { color: #8a92a6; font-size: 12px; margin-top: 2px; }
    h2 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.08em; color: #8a92a6; margin-top: 32px; margin-bottom: 12px; }
    section.summary p { line-height: 1.6; margin: 8px 0; }
    section.summary ul { padding-left: 20px; margin: 8px 0; }
    section.summary a { color: #4f46e5; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #d8dce6; vertical-align: top; }
    th { background: #f8f9fb; font-weight: 600; color: #3a4255; }
    td a { color: #4f46e5; text-decoration: none; word-break: break-all; }
    /* Each diagram gets its own page and is scaled to fit within it so it is
       never truncated across a page break. */
    section.diagram { page-break-before: always; page-break-inside: avoid; }
    section.diagram img {
      display: block;
      width: 100%;
      max-height: 8.5in;
      object-fit: contain;
      border: 1px solid #d8dce6;
      border-radius: 8px;
    }
    .empty { color: #8a92a6; font-style: italic; padding: 16px; border: 1px dashed #d8dce6; border-radius: 8px; text-align: center; }
    @media print {
      body { margin: 16px; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
      section.diagram img { max-height: 9in; }
    }
  </style>
</head>
<body>
  <header>
    <h1>DocMap</h1>
    <div class="meta">${graph.docs.length} docs · ${graph.users.length} contributors · Printed ${esc(now)}</div>
  </header>

  <section class="summary">
    <h2>Summary</h2>
    ${summaryHtml || '<p><em>No summary generated.</em></p>'}
  </section>

  <section>
    <h2>Documents</h2>
    <table>
      <thead><tr><th>Title</th><th>Type</th><th>Channel</th></tr></thead>
      <tbody>${docRows || '<tr><td colspan="3"><em>No documents.</em></td></tr>'}</tbody>
    </table>
  </section>

  ${diagramSection('Document Map — God View', diagrams.god)}
  ${diagramSection('Document Map — Doc View', diagrams.doc)}
  ${diagramSection('Document Map — User View', diagrams.user)}
</body>
</html>`;
}

export function PrintButton({ graph, capture }: PrintButtonProps) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    setProgress(null);
    try {
      // Snapshot all three live views so the printed report includes the
      // God / Doc / User diagrams, each on its own page. `capture` reports
      // progress after each step so the UI can show a spinner / bar.
      const diagrams = await capture((update) => setProgress(update));
      const html = buildPrintHtml(graph, diagrams);
      const win = window.open('', '_blank');
      if (!win) {
        alert('Could not open print window. Please allow popups for this site.');
        return;
      }
      win.document.write(html);
      win.document.close();
      // Give the new window a moment to render (especially the images) before
      // triggering print. `load` fires after the body's HTML has been parsed.
      win.addEventListener('load', () => {
        win.focus();
        win.print();
      });
    } catch (err) {
      console.error('[print] failed:', err);
      alert('Could not build the print view. See console for details.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="relative inline-flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-busy={busy || undefined}
        className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-100 disabled:opacity-50"
      >
        {busy ? 'Preparing…' : 'Print'}
      </button>
      {busy && <PrintProgress progress={progress} />}
    </div>
  );
}

function PrintProgress({ progress }: { progress: ProgressUpdate | null }) {
  const pct = progress ? Math.round((progress.current / progress.total) * 100) : 5;
  const label = progress?.label ?? 'Starting…';
  return (
    // Floating status card so it doesn't shove the header layout around while
    // the capture runs. Positioned right under the button, right-aligned.
    <div
      role="status"
      aria-live="polite"
      className="absolute right-0 top-full z-20 mt-1 w-56 rounded-md border border-ink-200 bg-white p-2 shadow-md"
    >
      <div className="flex items-center gap-2">
        <span
          className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-ink-200 border-t-accent"
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-ink-700">
          {label}
        </span>
        {progress && (
          <span className="shrink-0 text-[10px] tabular-nums text-ink-400">
            {progress.current}/{progress.total}
          </span>
        )}
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-ink-100">
        <div
          className="h-full bg-accent transition-[width] duration-200 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
