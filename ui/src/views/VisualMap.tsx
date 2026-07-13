import * as ToggleGroup from '@radix-ui/react-toggle-group';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type ReactFlowInstance,
} from '@xyflow/react';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';

import {
  captureFlow,
  delay,
  nextFrame,
  VIEW_LABELS,
  type DiagramCaptures,
  type ProgressUpdate,
  type ViewMode,
} from './captureDiagrams';
import { nodeTypes } from './nodes';
import { buildLayout } from './graphBuilders';
import type { DocmapGraph } from '../types';

export interface VisualMapHandle {
  captureAll: (onProgress?: (update: ProgressUpdate) => void) => Promise<DiagramCaptures>;
}

export const VisualMap = forwardRef<VisualMapHandle, { graph: DocmapGraph }>(function VisualMap(
  { graph },
  ref,
) {
  const [mode, setMode] = useState<ViewMode>('god');
  const containerRef = useRef<HTMLDivElement>(null);

  const layout = useMemo(() => buildLayout(mode, graph), [mode, graph]);
  // useNodesState / useEdgesState give us the onChange handlers React Flow
  // needs to persist drags. Without them, controlled `nodes={...}` snaps back
  // to its useMemo value and drags don't stick.
  const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges);
  const [rf, setRf] = useState<ReactFlowInstance | null>(null);

  // Print support: cycle the live canvas through all three views, fit + snapshot
  // each, then restore the user's original view. Capturing the on-screen React
  // Flow is far more reliable than rendering an off-screen copy.
  useImperativeHandle(
    ref,
    () => ({
      async captureAll(onProgress): Promise<DiagramCaptures> {
        const original = mode;
        const out: DiagramCaptures = { god: null, doc: null, user: null };
        const order = ['god', 'doc', 'user'] as const;
        for (let i = 0; i < order.length; i++) {
          const m = order[i];
          onProgress?.({ current: i + 1, total: order.length, label: `Capturing ${VIEW_LABELS[m]}…` });
          setMode(m);
          // Let React commit the new layout + the reset effect run.
          await delay(150);
          await nextFrame();
          rf?.fitView({ padding: 0.12 });
          // Let fitView's transition finish before rasterizing.
          await delay(550);
          out[m] = await captureFlow(containerRef.current);
        }
        setMode(original);
        await delay(50);
        return out;
      },
    }),
    [mode, rf],
  );

  // On mode / graph change, reset the layout and re-fit the viewport. Using an
  // effect (not a `key` remount) means the ReactFlowProvider survives and the
  // instance's fitView reliably centers on the fresh node set.
  useEffect(() => {
    setNodes(layout.nodes);
    setEdges(layout.edges);
    if (rf) {
      requestAnimationFrame(() => rf.fitView({ padding: 0.15, duration: 250 }));
    }
  }, [layout, rf, setNodes, setEdges]);

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[520px] flex-col gap-3">
      <ToggleGroup.Root
        type="single"
        value={mode}
        onValueChange={(v) => v && setMode(v as ViewMode)}
        className="inline-flex gap-1 self-start rounded-lg border border-ink-200 bg-white p-1"
        aria-label="View mode"
      >
        {(
          [
            { value: 'god', label: 'God View' },
            { value: 'doc', label: 'Doc View' },
            { value: 'user', label: 'User View' },
          ] as const
        ).map((opt) => (
          <ToggleGroup.Item
            key={opt.value}
            value={opt.value}
            className="rounded-md px-3 py-1 text-xs font-medium text-ink-700 hover:bg-ink-100 data-[state=on]:bg-accent data-[state=on]:text-white"
          >
            {opt.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>

      <div
        ref={containerRef}
        className="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-ink-200 bg-white"
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          nodesConnectable={false}
          elementsSelectable={false}
          edgesFocusable={false}
          minZoom={0.15}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          onInit={(instance) => {
            setRf(instance);
            requestAnimationFrame(() => instance.fitView({ padding: 0.15 }));
          }}
          className="h-full w-full"
        >
          <Background gap={16} color="#e5e7eb" />
          <Controls position="bottom-right" showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            className="!bg-white"
            nodeColor={(n) =>
              n.type === 'doc'
                ? '#4f46e5'
                : n.type === 'channel'
                  ? '#13182a'
                  : '#8a92a6'
            }
          />
        </ReactFlow>
      </div>
    </div>
  );
});
