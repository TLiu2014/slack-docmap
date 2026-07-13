import { Handle, Position, type NodeProps, type NodeTypes } from '@xyflow/react';

import { displayDocTitle, docTypeLabel } from '../lib/docTypes';
import type { DocmapDoc, DocmapUser } from '../types';

interface BasicNodeData extends Record<string, unknown> {
  label: string;
  sublabel?: string;
}

interface UserCardData extends Record<string, unknown> {
  user: DocmapUser;
  docs: DocmapDoc[];
}

// Invisible handles keep edges routable while letting the node body carry the
// visual weight — the read-only pattern from transform-flow-ui.
const HORIZONTAL_HANDLES = (
  <>
    <Handle type="target" position={Position.Left} className="!opacity-0" />
    <Handle type="source" position={Position.Right} className="!opacity-0" />
  </>
);

const userInitial = (name: string) => (name.trim()[0] ?? '?').toUpperCase();

export function UserNode({ data }: NodeProps) {
  const d = data as BasicNodeData;
  return (
    <div className="flex min-w-[160px] items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-2 shadow-sm">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
        {userInitial(d.label)}
      </span>
      <span className="truncate text-sm font-medium text-ink-900">{d.label}</span>
      {HORIZONTAL_HANDLES}
    </div>
  );
}

export function DocNode({ data }: NodeProps) {
  const d = data as BasicNodeData;
  const typeLabel = docTypeLabel(d.sublabel);
  return (
    <div className="flex min-w-[220px] max-w-[260px] flex-col gap-1 rounded-lg border border-accent/40 bg-white p-3 shadow-sm">
      <span className="line-clamp-2 text-sm font-semibold text-ink-900">{d.label}</span>
      {typeLabel && (
        <div className="text-[11px] font-medium uppercase tracking-wide text-accent">
          {typeLabel}
        </div>
      )}
      {HORIZONTAL_HANDLES}
    </div>
  );
}

export function ChannelNode({ data }: NodeProps) {
  const d = data as BasicNodeData;
  return (
    <div className="flex min-w-[140px] items-center rounded-md border border-ink-900 bg-ink-900 px-3 py-2 text-white shadow-sm">
      <span className="text-sm font-semibold">#{d.label}</span>
      {HORIZONTAL_HANDLES}
    </div>
  );
}

export function UserCardNode({ data }: NodeProps) {
  const { user, docs } = data as UserCardData;
  return (
    <div className="w-[300px] rounded-lg border border-ink-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">
          {userInitial(user.name)}
        </span>
        <span className="truncate text-sm font-semibold text-ink-900">{user.name}</span>
        <span className="ml-auto shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">
          {docs.length} {docs.length === 1 ? 'doc' : 'docs'}
        </span>
      </div>
      {docs.length > 0 ? (
        <div className="mt-3 border-t border-ink-100 pt-2">
          <div className="text-[10px] uppercase tracking-wide text-ink-400">Curated docs</div>
          <ul className="mt-1 space-y-1.5">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-1.5 text-[11px] text-ink-700">
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate hover:text-accent"
                  title={d.title || d.url}
                >
                  {displayDocTitle(d)}
                </a>
                {d.channel && (
                  <span className="shrink-0 rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-500">
                    #{d.channel}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-ink-400">No docs attributed.</div>
      )}
      {HORIZONTAL_HANDLES}
    </div>
  );
}

// Shared React Flow node-type map used by both the live map and the print
// capture. Keep this the single source of truth for node → component wiring.
export const nodeTypes: NodeTypes = {
  user: UserNode,
  doc: DocNode,
  channel: ChannelNode,
  userCard: UserCardNode,
};
