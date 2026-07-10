import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { saveGraph } from './store.js';
import type { DocmapGraph } from './types.js';

/**
 * Reserved id for the auto-seeded sample graph. Visiting
 * `${UI_BASE_URL}/?id=demo` always renders this fixture — handy for UI dev,
 * demos, and screenshots. Re-seeded on every server boot so edits to the
 * fixture file take effect after a restart.
 */
export const DEMO_GRAPH_ID = 'demo';

const FIXTURE_URL = new URL('../fixtures/mock-graph.json', import.meta.url);

export async function seedDemoGraph(): Promise<void> {
  try {
    const raw = await readFile(fileURLToPath(FIXTURE_URL), 'utf8');
    const graph = JSON.parse(raw) as DocmapGraph;
    const channelCount = new Set(graph.docs.map((d) => d.channel).filter(Boolean)).size || 1;
    await saveGraph(DEMO_GRAPH_ID, graph, { channelCount, days: 30 });
    console.log(`[seed] demo graph ready at ?id=${DEMO_GRAPH_ID}`);
  } catch (err) {
    console.warn('[seed] failed to seed demo graph:', (err as Error).message);
  }
}
