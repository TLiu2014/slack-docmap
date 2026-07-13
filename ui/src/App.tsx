import { useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom';

import { fetchGraph } from './api';
// MONETIZATION-DISABLED (hackathon submission): admin/billing dashboard is
// hidden. Restore the import + `/billing` route when re-enabling monetization.
// import { AdminDashboard } from './views/AdminDashboard';
import { Docs } from './views/Docs';
import { Landing } from './views/Landing';
import { PrintButton } from './views/PrintButton';
import { ShareDialog } from './views/ShareDialog';
import { SummaryReport } from './views/SummaryReport';
import { VisualMap, type VisualMapHandle } from './views/VisualMap';
import type { DiagramCaptures } from './views/captureDiagrams';
import type { DocmapGraph } from './types';

const EMPTY_CAPTURES: DiagramCaptures = { god: null, doc: null, user: null };

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; graph: DocmapGraph }
  | { status: 'error'; message: string };

// MONETIZATION-DISABLED: fallback team id for the mock admin panel.
// const DEV_TEAM_ID = 'T_DEV_WORKSPACE';

export function App() {
  return (
    <Routes>
      {/* Index: a Slack result link is `/?id=<uuid>` → graph viewer; a bare
          visit to `/` shows the public landing page. */}
      <Route path="/" element={<Home />} />
      <Route path="/docs" element={<Docs />} />
      {/* MONETIZATION-DISABLED: <Route path="/billing" element={<BillingRoute />} /> */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function Home() {
  const [params] = useSearchParams();
  const id = params.get('id');
  return id ? <GraphViewer id={id} /> : <Landing />;
}

// MONETIZATION-DISABLED: /billing route + AdminDashboard container.
/*
function BillingRoute() {
  const [params] = useSearchParams();
  const teamId = params.get('team') ?? DEV_TEAM_ID;
  return (
    <AppShell subtitle="Workspace administration">
      <AdminDashboard teamId={teamId} />
    </AppShell>
  );
}
*/

export function AppShell({
  children,
  subtitle,
  headerRight,
}: {
  children: React.ReactNode;
  subtitle: string;
  headerRight?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-3">
            <img src="/docmap-icon.svg" alt="DocMap" className="h-8 w-8" />
            <div>
              <h1 className="text-lg font-semibold leading-none">DocMap</h1>
              <p className="text-xs text-ink-400">{subtitle}</p>
            </div>
          </a>
          <div className="text-xs text-ink-400">{headerRight}</div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 py-6">{children}</main>
    </div>
  );
}

function GraphViewer({ id }: { id: string }) {
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const mapRef = useRef<VisualMapHandle>(null);

  useEffect(() => {
    setState({ status: 'loading' });
    fetchGraph(id)
      .then((graph) => setState({ status: 'ready', graph }))
      .catch((err) => setState({ status: 'error', message: (err as Error).message }));
  }, [id]);

  return (
    <AppShell
      subtitle="Slack document intelligence"
      headerRight={
        state.status === 'ready' ? (
          <div className="flex items-center gap-3">
            <span>
              {state.graph.docs.length} docs · {state.graph.users.length} users
            </span>
            <PrintButton
              graph={state.graph}
              capture={(onProgress) =>
                mapRef.current?.captureAll(onProgress) ?? Promise.resolve(EMPTY_CAPTURES)
              }
            />
            <ShareDialog graphId={id} />
          </div>
        ) : undefined
      }
    >
      {state.status === 'loading' && (
        <div className="rounded-lg border border-ink-200 bg-white p-8 text-center text-ink-400">
          Loading DocMap…
        </div>
      )}
      {state.status === 'error' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center text-red-700">
          {state.message}
        </div>
      )}
      {state.status === 'ready' && <GraphPage graph={state.graph} mapRef={mapRef} />}
    </AppShell>
  );
}

// Single-page layout: report at the top, diagram below. Tabs removed — the
// report is short enough that stacking reads better than swapping between them.
function GraphPage({
  graph,
  mapRef,
}: {
  graph: DocmapGraph;
  mapRef: React.Ref<VisualMapHandle>;
}) {
  return (
    <div className="flex flex-1 flex-col gap-8">
      <section aria-label="Report" className="print-report">
        <SummaryReport graph={graph} />
      </section>
      <section aria-label="Visual map" className="print-hide">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">
          Visual map
        </h2>
        <VisualMap ref={mapRef} graph={graph} />
      </section>
    </div>
  );
}
