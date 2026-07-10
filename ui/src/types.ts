export interface DocmapUser {
  id: string;
  name: string;
  avatar?: string;
}

export interface DocmapDoc {
  id: string;
  url: string;
  title: string;
  type: string;
  channel: string;
}

export interface DocmapEdge {
  source: string;
  target: string;
  action: string;
}

export interface DocmapGraph {
  summaryReport: string;
  users: DocmapUser[];
  docs: DocmapDoc[];
  edges: DocmapEdge[];
}

export type WorkspaceTier = 'FREE' | 'PRO' | 'ENTERPRISE';

export interface WorkspacePublic {
  slackTeamId: string;
  tier: WorkspaceTier;
  usageCount: number;
  freeLimit: number;
  hasOpenAIKey: boolean;
  hasAnthropicKey: boolean;
  hasGeminiKey: boolean;
  hasQwenKey: boolean;
}
