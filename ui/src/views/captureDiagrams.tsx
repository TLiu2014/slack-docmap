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

// Render one view into a detached, off-screen container, let React Flow measure
// + fitView, then rasterize it to a PNG data URL. Resolves null on failure so a
// single bad view never blocks the rest of the report.
function captureView(mode: ViewMode, graph: DocmapGraph): Promise<string | null> {
  const host = document.createElement('div');
  host.style.cssText =
    `position:fixed;left:-100000px;top:0;width:${CAPTURE_WIDTH}px;height:${CAPTURE_HEIGHT}px;background:#ffffff;`;
  document.body.appendChild(host);
  const root = createRoot(host);
  const layout = buildLayout(mode, graph);

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

    const onInit = (instance: ReactFlowInstance) => {
      requestAnimationFrame(() => {
        instance.fitView({ padding: 0.1 });
        setTimeout(async () => {
          const el = host.querySelector('.react-flow') as HTMLElement | null;
          if (!el) return finish(null);
          try {
            finish(
              await toPng(el, {
                backgroundColor: '#ffffff',
                pixelRatio: 2,
                width: CAPTURE_WIDTH,
                height: CAPTURE_HEIGHT,
                filter: withoutChrome,
              }),
            );
          } catch (err) {
            console.error(`[print] capture failed for ${mode} view:`, err);
            finish(null);
          }
        }, 650);
      });
    };

    root.render(
      <div style={{ width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT }}>
        <ReactFlow
          nodes={layout.nodes}
          edges={layout.edges}
          nodeTypes={nodeTypes}
          fitView
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

    // Hard safety net if onInit / fitView never fires.
    setTimeout(() => finish(null), 5000);
  });
}

export interface DiagramCaptures {
  god: string | null;
  doc: string | null;
  user: string | null;
}

// Capture all three views sequentially (each needs an exclusive off-screen
// mount) and return their PNG data URLs for the printed report.
export async function captureAllViews(graph: DocmapGraph): Promise<DiagramCaptures> {
  const god = await captureView('god', graph);
  const doc = await captureView('doc', graph);
  const user = await captureView('user', graph);
  return { god, doc, user };
}
