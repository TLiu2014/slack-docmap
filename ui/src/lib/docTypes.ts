// Friendly labels + icons for doc types. The LLM emits short slugs (e.g.
// "gdoc", "github"); we render them as their real product names, with an
// emoji only when we're confident it reads correctly. Anything not in the map
// falls back to a Title-Cased raw value with no icon.

const LABELS: Record<string, string> = {
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

const ICONS: Record<string, string> = {
  gdoc: '📄',
  gsheet: '📊',
  gslides: '📽️',
  notion: '📝',
  figma: '🎨',
  github: '🐙',
  gitlab: '🦊',
  jira: '🗂️',
  confluence: '📚',
  loom: '🎥',
  pdf: '📕',
};

export function docTypeLabel(rawType: string | undefined): string {
  if (!rawType) return '';
  const key = rawType.toLowerCase();
  if (key in LABELS) return LABELS[key];
  return rawType.charAt(0).toUpperCase() + rawType.slice(1);
}

export function docTypeIcon(rawType: string | undefined): string {
  if (!rawType) return '';
  return ICONS[rawType.toLowerCase()] ?? '';
}

/**
 * Pick a friendly display string for a doc title. LLMs sometimes hand back the
 * raw URL as `title` when they can't derive a real name from the surrounding
 * message text — that overflows nodes and table cells. This function keeps
 * good titles as-is and shortens URL-shaped titles to something readable.
 */
export function displayDocTitle(doc: { title?: string; url?: string; type?: string }): string {
  const raw = (doc.title ?? '').trim();
  const looksLikeUrl = /^https?:\/\//i.test(raw);
  if (raw && !looksLikeUrl) return raw;

  const url = raw || doc.url || '';
  if (!url) return docTypeLabel(doc.type) || 'Untitled';

  try {
    const u = new URL(url);
    const segments = u.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1] || '';
    if (last) {
      // github.com/org/repo → "org/repo"; …/README.md → "README.md"
      if (u.hostname.includes('github.com') && segments.length >= 2) {
        return decodeURIComponent(segments.slice(0, 2).join('/'));
      }
      return decodeURIComponent(last);
    }
    const label = docTypeLabel(doc.type);
    return label ? `${label} — ${u.hostname}` : u.hostname;
  } catch {
    return raw || url;
  }
}
