import Anthropic from '@anthropic-ai/sdk';

import type { DocmapGraph } from '../types.js';
import { DOCMAP_JSON_SCHEMA, DOCMAP_SYSTEM_PROMPT, buildUserPayload } from './prompt.js';
import type { GenerateGraphRequest, ILLMProvider } from './types.js';

export interface ClaudeAdapterOpts {
  apiKey: string;
  model?: string;
}

const TOOL_NAME = 'submit_docmap';

export class ClaudeProvider implements ILLMProvider {
  readonly name = 'claude';
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(opts: ClaudeAdapterOpts) {
    if (!opts.apiKey) throw new Error('ANTHROPIC_API_KEY missing');
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model ?? 'claude-sonnet-4-6';
  }

  async generateGraph(req: GenerateGraphRequest): Promise<DocmapGraph> {
    const userPayload = buildUserPayload({
      channelIds: req.channelIds,
      afterDate: req.afterDate,
      messages: req.messages,
    });

    const response = await this.client.messages.create({
      model: this.model,
      // Full JSON graphs (docs + edges + summary markdown) can push past 8k
      // for a busy channel; give enough headroom that tool_use never gets
      // cut off mid-object.
      max_tokens: 32000,
      temperature: 0.2,
      system: DOCMAP_SYSTEM_PROMPT,
      tools: [
        {
          name: TOOL_NAME,
          description: 'Submit the extracted DocMap graph.',
          input_schema: DOCMAP_JSON_SCHEMA as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: userPayload }],
    });

    const toolUse = response.content.find((c) => c.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new Error('Claude did not return a tool_use block');
    }
    return toolUse.input as DocmapGraph;
  }
}
