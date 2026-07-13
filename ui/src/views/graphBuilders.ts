import Dagre from '@dagrejs/dagre';
import { MarkerType, type Edge, type Node } from '@xyflow/react';

import { displayDocTitle } from '../lib/docTypes';
import type { DocmapDoc, DocmapGraph } from '../types';

interface Layout {
  nodes: Node[];
  edges: Edge[];
}

// Approximate dimensions used to hint dagre where each node type lives. Real
// nodes size themselves via Tailwind; dagre only needs a rectangle to route.
// These are intentionally a touch LARGER than the rendered node so dagre leaves
// breathing room and nodes never overlap each other or sit on top of an edge.
const NODE_SIZE = {
  user: { width: 200, height: 56 },
  doc: { width: 268, height: 120 },
  channel: { width: 190, height: 52 },
} as const;

// User View card layout (masonry — laid out manually, not via dagre).
const USER_CARD_WIDTH = 300;
const USER_CARD_GAP_X = 36;
const USER_CARD_GAP_Y = 36;
const USER_CARD_COLS = 3;

const DEFAULT_EDGE_STYLE: Partial<Edge> = {
  animated: false,
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: '#8a92a6' },
  style: { stroke: '#c7cad4', strokeWidth: 1.5 },
  labelStyle: { fill: '#3a4255', fontSize: 11, fontWeight: 500 },
  labelBgStyle: { fill: '#ffffff', opacity: 0.85 },
  labelBgPadding: [4, 2] as [number, number],
  labelBgBorderRadius: 4,
};

// ---------- God View: full graph with dagre auto-layout ----------

export function buildGodView(graph: DocmapGraph): Layout {
  const channels = uniqueChannels(graph.docs);

  const rawNodes: Node[] = [
    ...graph.users.map((u) => ({
      id: nodeId('user', u.id),
      type: 'user',
      position: { x: 0, y: 0 },
      data: { label: u.name },
    })),
    ...graph.docs.map((d) => ({
      id: nodeId('doc', d.id),
      type: 'doc',
      position: { x: 0, y: 0 },
      data: { label: displayDocTitle(d), sublabel: d.type },
    })),
    ...channels.map((c) => ({
      id: nodeId('channel', c),
      type: 'channel',
      position: { x: 0, y: 0 },
      data: { label: c },
    })),
  ];

  const rawEdges: Edge[] = [
    ...graph.edges.map((e, idx) => ({
      id: `e-${idx}`,
      source: resolveNodeId(e.source, graph),
      target: resolveNodeId(e.target, graph),
      label: e.action,
      ...DEFAULT_EDGE_STYLE,
    })),
    ...graph.docs.map((d) => ({
      id: `d2c-${d.id}`,
      source: nodeId('doc', d.id),
      target: nodeId('channel', d.channel),
      label: 'in',
      ...DEFAULT_EDGE_STYLE,
    })),
  ];

  return dagreLayout(rawNodes, rawEdges, 'LR');
}

function dagreLayout(nodes: Node[], edges: Edge[], direction: 'LR' | 'TB'): Layout {
  const g = new Dagre.graphlib.Graph({ compound: false }).setDefaultEdgeLabel(() => ({}));
  // Generous separations so nodes never collide and edges (with their labels)
  // have room to route between ranks. `edgesep` keeps parallel edges apart.
  g.setGraph({
    rankdir: direction,
    nodesep: 48,
    ranksep: 130,
    edgesep: 24,
    marginx: 24,
    marginy: 24,
  });

  for (const node of nodes) {
    const size = NODE_SIZE[node.type as keyof typeof NODE_SIZE] ?? { width: 200, height: 60 };
    // Clone the size object per node. Dagre MUTATES the label object it's given
    // (writes x/y/rank into it), so sharing a single reference across nodes
    // collapses them all to whichever coordinates dagre wrote last. Reproduced
    // in the browser as "all docs stacked at (354, 1320)".
    g.setNode(node.id, { width: size.width, height: size.height });
  }
  for (const edge of edges) g.setEdge(edge.source, edge.target);

  Dagre.layout(g);

  const laidOut = nodes.map((node) => {
    const laid = g.node(node.id);
    const size = NODE_SIZE[node.type as keyof typeof NODE_SIZE] ?? { width: 200, height: 60 };
    // dagre gives us the center; React Flow expects the top-left.
    return {
      ...node,
      position: { x: laid.x - size.width / 2, y: laid.y - size.height / 2 },
    };
  });

  return { nodes: laidOut, edges };
}

// ---------- Doc View: documents clustered by channel, with relation edges ----------
//
// A document-centric graph. Every doc connects to its channel (so related docs
// naturally cluster together), and any explicit doc↔doc relationship the model
// emitted (action = "related-to", "references", …) is drawn between the two
// docs with its action as the edge label — mirroring the God View's labelled
// edges. Users are intentionally omitted here; that's the User View's job.

export function buildDocView(graph: DocmapGraph): Layout {
  const docIds = new Set(graph.docs.map((d) => d.id));
  const channels = uniqueChannels(graph.docs);

  const rawNodes: Node[] = [
    ...graph.docs.map((d) => ({
      id: nodeId('doc', d.id),
      type: 'doc',
      position: { x: 0, y: 0 },
      data: { label: displayDocTitle(d), sublabel: d.type },
    })),
    ...channels.map((c) => ({
      id: nodeId('channel', c),
      type: 'channel',
      position: { x: 0, y: 0 },
      data: { label: c },
    })),
  ];

  const rawEdges: Edge[] = [
    // doc ↔ doc relationships surfaced by the model
    ...graph.edges
      .filter((e) => docIds.has(e.source) && docIds.has(e.target) && e.source !== e.target)
      .map((e, idx) => ({
        id: `dd-${idx}`,
        source: nodeId('doc', e.source),
        target: nodeId('doc', e.target),
        label: e.action,
        ...DEFAULT_EDGE_STYLE,
      })),
    // group docs under their channel so related docs sit together
    ...graph.docs.map((d) => ({
      id: `d2c-${d.id}`,
      source: nodeId('doc', d.id),
      target: nodeId('channel', d.channel),
      label: 'in',
      ...DEFAULT_EDGE_STYLE,
      style: { stroke: '#dfe1e8', strokeWidth: 1.25, strokeDasharray: '4 4' },
    })),
  ];

  return dagreLayout(rawNodes, rawEdges, 'LR');
}

// ---------- User View: one card per contributor listing ALL their docs ----------
//
// Cards vary in height (a prolific contributor lists many docs), so a fixed
// grid would overlap. We lay them out as a simple masonry: each card drops into
// the currently-shortest column, and we advance that column by the card's
// estimated height. That guarantees no overlap while keeping columns balanced.

export function buildUserView(graph: DocmapGraph): Layout {
  const docsByUser = mapDocsToUsers(graph);
  const columnHeights = new Array(USER_CARD_COLS).fill(0);

  const nodes: Node[] = graph.users.map((user) => {
    const docs = docsByUser.get(user.id) ?? [];
    let col = 0;
    for (let c = 1; c < USER_CARD_COLS; c++) {
      if (columnHeights[c] < columnHeights[col]) col = c;
    }
    const x = col * (USER_CARD_WIDTH + USER_CARD_GAP_X);
    const y = columnHeights[col];
    columnHeights[col] = y + estimateUserCardHeight(docs.length) + USER_CARD_GAP_Y;

    return {
      id: nodeId('user-card', user.id),
      type: 'userCard',
      position: { x, y },
      data: { user, docs },
    };
  });

  return { nodes, edges: [] };
}

// Height estimate must be >= the rendered card so masonry never overlaps.
// Header ~64, section header ~28, card padding ~32, then ~26px per doc row.
function estimateUserCardHeight(docCount: number): number {
  return 64 + 28 + 32 + Math.max(docCount, 1) * 26;
}

// ---------- View dispatch ----------

export function buildLayout(mode: 'god' | 'doc' | 'user', graph: DocmapGraph): Layout {
  switch (mode) {
    case 'god':
      return buildGodView(graph);
    case 'doc':
      return buildDocView(graph);
    case 'user':
      return buildUserView(graph);
  }
}

// ---------- Helpers ----------

function uniqueChannels(docs: DocmapDoc[]): string[] {
  return Array.from(new Set(docs.map((d) => d.channel))).filter(Boolean);
}

function mapDocsToUsers(graph: DocmapGraph): Map<string, DocmapDoc[]> {
  const docById = new Map(graph.docs.map((d) => [d.id, d]));
  const out = new Map<string, DocmapDoc[]>();
  for (const e of graph.edges) {
    const doc = docById.get(e.target);
    if (!doc) continue;
    const userId = e.source;
    const list = out.get(userId) ?? [];
    if (!list.find((d) => d.id === doc.id)) list.push(doc);
    out.set(userId, list);
  }
  return out;
}

function nodeId(kind: string, id: string): string {
  return `${kind}:${id}`;
}

function resolveNodeId(rawId: string, graph: DocmapGraph): string {
  if (graph.users.some((u) => u.id === rawId)) return nodeId('user', rawId);
  if (graph.docs.some((d) => d.id === rawId)) return nodeId('doc', rawId);
  return rawId;
}
