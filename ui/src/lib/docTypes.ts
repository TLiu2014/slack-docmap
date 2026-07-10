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
