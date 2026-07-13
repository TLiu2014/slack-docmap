import { toPng } from 'html-to-image';

export type ViewMode = 'god' | 'doc' | 'user';

export interface DiagramCaptures {
  god: string | null;
  doc: string | null;
  user: string | null;
}

export interface ProgressUpdate {
  current: number;
  total: number;
  label: string;
}

export const VIEW_LABELS: Record<ViewMode, string> = {
  god: 'God View',
  doc: 'Doc View',
  user: 'User View',
};

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

export const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const nextFrame = () =>
  new Promise<void>((r) => requestAnimationFrame(() => r()));

// Rasterize the live React Flow canvas found inside `container` to a PNG data
// URL. Returns null (never throws) so one failed view can't abort the report.
export async function captureFlow(container: HTMLElement | null): Promise<string | null> {
  if (!container) return null;
  const el = container.querySelector('.react-flow') as HTMLElement | null;
  if (!el) return null;
  try {
    // Two passes: the first warms html-to-image's font/style caches (its first
    // run on a fresh node can produce a blank frame), the second is the keeper.
    await toPng(el, { backgroundColor: '#ffffff', pixelRatio: 1, filter: withoutChrome });
    return await toPng(el, {
      backgroundColor: '#ffffff',
      pixelRatio: 2,
      filter: withoutChrome,
    });
  } catch (err) {
    console.error('[print] diagram capture failed:', err);
    return null;
  }
}
