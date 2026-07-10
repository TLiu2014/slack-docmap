import type { DocmapGraph, SlackMessageLite } from '../types.js';

export interface GenerateGraphRequest {
  messages: SlackMessageLite[];
  channelIds: string[];
  afterDate: string;
}

export interface ILLMProvider {
  readonly name: string;
  generateGraph(req: GenerateGraphRequest): Promise<DocmapGraph>;
}

export type GraphData = DocmapGraph;
