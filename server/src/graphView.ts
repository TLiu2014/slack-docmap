import type { DocmapDoc, DocmapGraph, DocmapUser } from './types.js';

/**
 * Human-facing labels for doc types. The LLM is instructed to use short type
 * slugs (`gdoc`, `github`, ...); we render them as their real product names.
 * Anything not in this map falls back to the LLM's raw value (which may still be
 * something reasonable like `"figma"` — we uppercase it as a last resort).
 */
export const DOC_TYPE_LABEL: Record<string, string> = {
  gdoc: 'Google Docs',
  gsheet: 'Google Sheets',
  gslides: 'Google Slides',
  gdrive: 'Google Drive',
  gcal: 'Google Calendar',
  notion: 'Notion',
  figma: 'Figma',
  github: 'GitHub',
  gitlab: 'GitLab',
  jira: 'Jira',
  confluence: 'Confluence',
  loom: 'Loom',
  dropbox: 'Dropbox',
  onedrive: 'OneDrive',
  sharepoint: 'SharePoint',
  pdf: 'PDF',
  link: '',
};

/**
 * Emoji-per-type. Only present when we're confident the icon reads correctly.
 * Types absent from this map render with no leading emoji (better than showing
 * a generic 🔗 that adds noise).
 */
export const DOC_TYPE_EMOJI: Record<string, string> = {
  gdoc: '📄',
  gsheet: '📊',
  gslides: '📽️',
  notion: '📝',
  figma: '🎨',
  github: ':github:',
  gitlab: ':gitlab:',
  jira: '🗂️',
  confluence: '📚',
  loom: '🎥',
  pdf: '📕',
};

export function labelForType(rawType: string | undefined): string {
  if (!rawType) return '';
  const key = rawType.toLowerCase();
  if (key in DOC_TYPE_LABEL) return DOC_TYPE_LABEL[key];
  return rawType.charAt(0).toUpperCase() + rawType.slice(1);
}

export function iconForType(rawType: string | undefined): string {
  if (!rawType) return '';
  return DOC_TYPE_EMOJI[rawType.toLowerCase()] ?? '';
}

// ---------- Graph aggregation ----------

export interface DocContributors {
  authors: DocmapUser[];
  mentioners: DocmapUser[];
}

export interface UserContributions {
  authored: DocmapDoc[];
  mentioned: DocmapDoc[];
}

/**
 * For every doc, resolve the users who authored vs merely mentioned it.
 * An edge counts if source is a known user id and target is this doc id.
 * `authored` is the "authored" action; everything else falls into `mentioners`.
 */
export function contributorsByDoc(
  graph: DocmapGraph,
): Map<string, DocContributors> {
  const userById = new Map(graph.users.map((u) => [u.id, u]));
  const out = new Map<string, DocContributors>();
  for (const doc of graph.docs) out.set(doc.id, { authors: [], mentioners: [] });

  for (const edge of graph.edges) {
    const user = userById.get(edge.source);
    const bucket = out.get(edge.target);
    if (!user || !bucket) continue;
    const list =
      edge.action.toLowerCase() === 'authored' ? bucket.authors : bucket.mentioners;
    if (!list.some((u) => u.id === user.id)) list.push(user);
  }
  return out;
}

/**
 * Inverse of the above — for every user, resolve the docs they authored vs the
 * docs they mentioned. Users with no interactions are omitted.
 */
export function contributionsByUser(
  graph: DocmapGraph,
): Map<string, UserContributions> {
  const docById = new Map(graph.docs.map((d) => [d.id, d]));
  const out = new Map<string, UserContributions>();

  for (const edge of graph.edges) {
    const doc = docById.get(edge.target);
    if (!doc) continue;
    if (!out.has(edge.source)) out.set(edge.source, { authored: [], mentioned: [] });
    const bucket = out.get(edge.source)!;
    const list =
      edge.action.toLowerCase() === 'authored' ? bucket.authored : bucket.mentioned;
    if (!list.some((d) => d.id === doc.id)) list.push(doc);
  }
  return out;
}
