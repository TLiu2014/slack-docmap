import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { displayDocTitle, docTypeLabel } from '../lib/docTypes';
import type { DocmapGraph } from '../types';

export function SummaryReport({ graph }: { graph: DocmapGraph }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <section className="lg:col-span-2 rounded-lg border border-ink-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">
          Executive summary
        </h2>
        <div className="markdown-body mt-2">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{graph.summaryReport}</ReactMarkdown>
        </div>
      </section>

      <section className="rounded-lg border border-ink-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">
          Top documents
        </h2>
        <ul className="mt-3 divide-y divide-ink-100">
          {graph.docs.map((doc) => (
            <li key={doc.id} className="flex flex-col gap-1 py-3">
              <a
                href={doc.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-ink-900 hover:text-accent"
              >
                {displayDocTitle(doc)}
              </a>
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
                <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">
                  #{doc.channel}
                </span>
                <span className="inline-flex items-center gap-1">
                  {docTypeLabel(doc.type) || doc.type}
                </span>
              </div>
            </li>
          ))}
          {graph.docs.length === 0 && (
            <li className="py-6 text-center text-sm text-ink-400">No documents found.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
