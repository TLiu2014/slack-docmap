import { prisma } from './db.js';
import type { DocmapGraph } from './types.js';

export interface GraphMeta {
  channelCount: number;
  days: number;
}

const DEFAULT_META: GraphMeta = { channelCount: 0, days: 0 };

/**
 * Persist (or overwrite) a graph in the Graph table. The full DocmapGraph is
 * serialized as a JSON string — SQLite doesn't have a native JSON column, but
 * this stays compatible when we swap the datasource to PostgreSQL for prod.
 */
export async function saveGraph(
  id: string,
  graph: DocmapGraph,
  meta: GraphMeta = DEFAULT_META,
): Promise<void> {
  const graphJson = JSON.stringify(graph);
  await prisma.graph.upsert({
    where: { id },
    update: { graphJson, channelCount: meta.channelCount, days: meta.days },
    create: { id, graphJson, channelCount: meta.channelCount, days: meta.days },
  });
}

export async function getGraph(id: string): Promise<DocmapGraph | undefined> {
  const row = await prisma.graph.findUnique({ where: { id } });
  if (!row) return undefined;
  try {
    return JSON.parse(row.graphJson) as DocmapGraph;
  } catch (err) {
    console.error(`[store] corrupt graphJson for id=${id}:`, err);
    return undefined;
  }
}

export async function getEntry(
  id: string,
): Promise<{ graph: DocmapGraph; meta: GraphMeta } | undefined> {
  const row = await prisma.graph.findUnique({ where: { id } });
  if (!row) return undefined;
  try {
    const graph = JSON.parse(row.graphJson) as DocmapGraph;
    return { graph, meta: { channelCount: row.channelCount, days: row.days } };
  } catch (err) {
    console.error(`[store] corrupt graphJson for id=${id}:`, err);
    return undefined;
  }
}
