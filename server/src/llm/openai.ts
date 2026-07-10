import OpenAI from 'openai';

import type { DocmapGraph } from '../types.js';
import { DOCMAP_SYSTEM_PROMPT, buildUserPayload, parseJsonObject } from './prompt.js';
import type { GenerateGraphRequest, ILLMProvider } from './types.js';

export interface OpenAIAdapterOpts {
  apiKey: string;
  model?: string;
  /**
   * Override the API base URL. Lets this same adapter drive any OpenAI-compatible
   * endpoint (e.g. Qwen / DashScope compatible-mode) without a separate SDK.
   */
  baseURL?: string;
  /** Provider identity, used for logging/telemetry. Defaults to "openai". */
  name?: string;
}

export class OpenAIProvider implements ILLMProvider {
  readonly name: string;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(opts: OpenAIAdapterOpts) {
    this.name = opts.name ?? 'openai';
    if (!opts.apiKey) throw new Error(`${this.name}: API key missing`);
    this.client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL });
    this.model = opts.model ?? 'gpt-4o';
  }

  async generateGraph(req: GenerateGraphRequest): Promise<DocmapGraph> {
    const userPayload = buildUserPayload({
      channelIds: req.channelIds,
      afterDate: req.afterDate,
      messages: req.messages,
    });

    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: DOCMAP_SYSTEM_PROMPT },
        { role: 'user', content: userPayload },
      ],
    });

    const text = response.choices[0]?.message?.content ?? '';
    if (!text) throw new Error('OpenAI returned empty response');
    return parseJsonObject<DocmapGraph>(text);
  }
}
