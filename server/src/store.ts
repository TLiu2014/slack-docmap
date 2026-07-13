import type { DocmapGraph } from './types.js';

export interface GraphMeta {
  channelCount: number;
  days: number;
}

const DEFAULT_META: GraphMeta = { channelCount: 0, days: 0 };

interface Entry {
  graph: DocmapGraph;
  meta: GraphMeta;
}

// In-memory graph store. The deployed instance intentionally drops
// persistence for the hackathon demo — graphs live only for the
// container's lifetime, and every restart clears prior `?id=<uuid>` links.
const graphs = new Map<string, Entry>();

export async function saveGraph(
  id: string,
  graph: DocmapGraph,
  meta: GraphMeta = DEFAULT_META,
): Promise<void> {
  graphs.set(id, { graph, meta });
}

export async function getGraph(id: string): Promise<DocmapGraph | undefined> {
  return graphs.get(id)?.graph;
}

export async function getEntry(id: string): Promise<Entry | undefined> {
  return graphs.get(id);
}
