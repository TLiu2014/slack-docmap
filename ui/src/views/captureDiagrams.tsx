import { Background, ReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { toPng } from 'html-to-image';
import { createRoot } from 'react-dom/client';

import { buildLayout } from './graphBuilders';
import { nodeTypes } from './nodes';
import type { DocmapGraph } from '../types';

export type ViewMode = 'god' | 'doc' | 'user';

// Offscreen canvas size. A wide 16:11-ish frame fits comfortably on one printed
// page and gives fitView enough room to show every node without cropping.
const CAPTURE_WIDTH = 1600;
const CAPTURE_HEIGHT = 1100;

// Drop React Flow's chrome (controls / minimap / attribution) from the snapshot.
function withoutChrome(node: HTMLElement): boolean {
  const cls = node.className;
  if (typeof cls !== 'string') return true;
  return (
    !cls.includes('react-flow__panel') &&
    !cls.includes('react-flow__minimap') &&
    !cls.includes('react-flow__controls') &&
    !cls.includes('react-flow__attribution')
  );
}

/**
 * Wait until the React Flow instance has ingested every node we passed in AND
 * each of those nodes has been measured (`node.measured.width > 0`). Polling
 * via requestAnimationFrame catches both signals reliably — the earlier
 * `useNodesInitialized` hook race-condition can return true before the store
 * has caught up to the `nodes` prop, so we'd rasterize an empty canvas.
 */
function waitForLayout(
  instance: ReactFlowInstance,
  expectedCount: number,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const start = performance.now();
    const check = () => {
      const nodes = instance.getNodes();
      if (nodes.length >= expectedCount) {
        const allMeasured = nodes.every((n) => {
          const m = (n as unknown as { measured?: { width?: number; height?: number } }).measured;
          return typeof m?.width === 'number' && m.width > 0;
        });
        if (allMeasured) return resolve(true);
      }
      if (performance.now() - start > timeoutMs) return resolve(false);
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

/**
 * Render one view into a detached, off-screen container and rasterize it once
 * every node has been measured. Resolves null on failure so a single bad view
 * never blocks the rest of the report.
 */
function captureView(mode: ViewMode, graph: DocmapGraph): Promise<string | null> {
  const layout = buildLayout(mode, graph);
  if (layout.nodes.length === 0) {
    return Promise.resolve(null);
  }

  const host = document.createElement('div');
  // Positioning trick: keep the container INSIDE the viewport (so the browser
  // actually runs layout + ResizeObserver on it) but visually inert. Using
  // `left:-100000px` used to work but some Chromium builds skip layout for
  // fully off-screen fixed elements, which starves React Flow's node-measured
  // signal and makes every capture come back "unavailable".
  host.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    `width:${CAPTURE_WIDTH}px`,
    `height:${CAPTURE_HEIGHT}px`,
    'background:#ffffff',
    'opacity:0.001',       // essentially invisible; keeps layout live
    'pointer-events:none', // don't intercept clicks
    'z-index:-9999',       // sit behind everything
    'contain:strict',      // paint-time isolation
  ].join(';') + ';';
  document.body.appendChild(host);
  const root = createRoot(host);

  return new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      // Defer teardown so we don't unmount mid-render.
      setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
      resolve(value);
    };

    const onInit = async (instance: ReactFlowInstance) => {
      console.debug(`[print] ${mode}: onInit fired, expected=${layout.nodes.length} nodes`);
      try {
        const ready = await waitForLayout(instance, layout.nodes.length, 8000);
        if (!ready) {
          const nodes = instance.getNodes();
          const measured = nodes.filter((n) => {
            const m = (n as unknown as { measured?: { width?: number } }).measured;
            return typeof m?.width === 'number' && m.width > 0;
          }).length;
          console.warn(
            `[print] ${mode}: layout not ready within 8s. store has ${nodes.length}/${layout.nodes.length} nodes, ${measured} measured.`,
          );
          return finish(null);
        }
        console.debug(`[print] ${mode}: layout ready, calling fitView`);
        // fitView is async in v12 — resolves after the viewport transform has
        // been applied. Await it so we don't rasterize a stale frame.
        await instance.fitView({ padding: 0.1, duration: 0 });
        await new Promise<void>((r) => requestAnimationFrame(() => r()));

        const el = host.querySelector('.react-flow') as HTMLElement | null;
        if (!el) {
          console.warn(`[print] ${mode}: no .react-flow element in host`);
          return finish(null);
        }

        console.debug(`[print] ${mode}: rasterizing`);
        const dataUrl = await toPng(el, {
          backgroundColor: '#ffffff',
          pixelRatio: 2,
          width: CAPTURE_WIDTH,
          height: CAPTURE_HEIGHT,
          filter: withoutChrome,
        });
        console.debug(`[print] ${mode}: captured ${dataUrl.length} chars`);
        finish(dataUrl);
      } catch (err) {
        console.error(`[print] capture failed for ${mode} view:`, err);
        finish(null);
      }
    };

    root.render(
      <div style={{ width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT }}>
        <ReactFlow
          nodes={layout.nodes}
          edges={layout.edges}
          nodeTypes={nodeTypes}
          minZoom={0.05}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          proOptions={{ hideAttribution: true }}
          onInit={onInit}
        >
          <Background />
        </ReactFlow>
      </div>,
    );

    // Hard safety net: onInit is guaranteed to fire, but if the browser is
    // gnarly (background tab throttling, extension interference) we don't want
    // to hang the print dialog forever.
    setTimeout(() => {
      if (!settled) {
        console.warn(`[print] ${mode} view: onInit never fired within 15s — bailing.`);
        finish(null);
      }
    }, 15000);
  });
}

export interface DiagramCaptures {
  god: string | null;
  doc: string | null;
  user: string | null;
}

export type ProgressStep = 'god' | 'doc' | 'user' | 'compose';

export interface ProgressUpdate {
  /** 1-based step index. */
  current: number;
  /** Total steps we plan to take (captures + compose). */
  total: number;
  /** Which view we're on (or `compose` for the final HTML assembly). */
  step: ProgressStep;
  /** Human-readable label a UI can render directly. */
  label: string;
}

const STEP_LABELS: Record<ProgressStep, string> = {
  god: 'Capturing God view…',
  doc: 'Capturing Doc view…',
  user: 'Capturing User view…',
  compose: 'Assembling the printable report…',
};

/**
 * Capture all three views sequentially, reporting progress after each step so
 * a UI can show a spinner / bar while the browser churns. Each capture needs
 * an exclusive off-screen mount, so we can't parallelize.
 */
export async function captureAllViews(
  graph: DocmapGraph,
  onProgress?: (update: ProgressUpdate) => void,
): Promise<DiagramCaptures> {
  const steps: ViewMode[] = ['god', 'doc', 'user'];
  const total = steps.length + 1; // + compose
  const captures: Partial<DiagramCaptures> = {};

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    onProgress?.({ current: i + 1, total, step, label: STEP_LABELS[step] });
    captures[step] = await captureView(step, graph);
  }

  onProgress?.({ current: total, total, step: 'compose', label: STEP_LABELS.compose });
  return {
    god: captures.god ?? null,
    doc: captures.doc ?? null,
    user: captures.user ?? null,
  };
}
