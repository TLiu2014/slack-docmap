import type { DocmapGraph, WorkspacePublic, WorkspaceTier } from './types';

export async function fetchGraph(id: string): Promise<DocmapGraph> {
  const res = await fetch(`/api/graph/${encodeURIComponent(id)}`);
  if (!res.ok) {
    throw new Error(`Graph not found (${res.status})`);
  }
  return (await res.json()) as DocmapGraph;
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export async function fetchWorkspace(teamId: string): Promise<WorkspacePublic> {
  const res = await fetch(`/api/workspace/${encodeURIComponent(teamId)}`);
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as WorkspacePublic;
}

/** Mock Stripe Checkout — flips the workspace tier (defaults to PRO). */
export async function mockCheckout(
  teamId: string,
  tier: WorkspaceTier = 'PRO',
): Promise<WorkspacePublic> {
  const res = await fetch(`/api/workspace/${encodeURIComponent(teamId)}/checkout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tier }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as WorkspacePublic;
}

export interface SaveSettingsInput {
  slackTeamId: string;
  openAIKey?: string;
  anthropicKey?: string;
  geminiKey?: string;
  qwenKey?: string;
}

/** Save BYOK keys (Enterprise only). Omitted fields are left unchanged. */
export async function saveWorkspaceSettings(
  input: SaveSettingsInput,
): Promise<WorkspacePublic> {
  const res = await fetch('/api/workspace/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as WorkspacePublic;
}

export interface ShareResult {
  destination: string;
  ok: boolean;
  error?: string;
}

export interface ShareResponse {
  url: string;
  results: ShareResult[];
}

export interface ShareInput {
  graphId: string;
  destinations: string[];
  sharerId?: string;
  note?: string;
}

/** POST the docmap link to one or more Slack channels/users via the bot. */
export async function shareGraph(input: ShareInput): Promise<ShareResponse> {
  const res = await fetch(`/api/graph/${encodeURIComponent(input.graphId)}/share`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      destinations: input.destinations,
      sharerId: input.sharerId,
      note: input.note,
    }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as ShareResponse;
}
