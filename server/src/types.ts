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

export interface SlackMessageLite {
  user: string;
  username?: string;
  text: string;
  ts: string;
  channel: string;
  permalink?: string;
}

export interface DocmapParams {
  channelIds: string[];
  days: number;
  afterDate: string;
}
