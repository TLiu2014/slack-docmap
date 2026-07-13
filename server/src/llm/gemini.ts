import { GoogleGenAI } from '@google/genai';

import type { DocmapGraph } from '../types.js';
import { DOCMAP_SYSTEM_PROMPT, buildUserPayload, parseJsonObject } from './prompt.js';
import type { GenerateGraphRequest, ILLMProvider } from './types.js';

export interface GeminiAdapterOpts {
  apiKey: string;
  model?: string;
}

export class GeminiProvider implements ILLMProvider {
  readonly name = 'gemini';
  private readonly ai: GoogleGenAI;
  private readonly model: string;

  constructor(opts: GeminiAdapterOpts) {
    if (!opts.apiKey) throw new Error('GEMINI_API_KEY missing');
    this.ai = new GoogleGenAI({ apiKey: opts.apiKey });
    this.model = opts.model ?? 'gemini-2.0-flash-exp';
  }

  async generateGraph(req: GenerateGraphRequest): Promise<DocmapGraph> {
    const userPayload = buildUserPayload({
      channelIds: req.channelIds,
      afterDate: req.afterDate,
      messages: req.messages,
    });

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: [{ role: 'user', parts: [{ text: userPayload }] }],
      config: {
        systemInstruction: DOCMAP_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        temperature: 0.2,
        // Full JSON graphs (docs + edges + summary markdown) frequently push
        // past the 8k default, especially with longer summaries. Give it
        // enough headroom to avoid truncated JSON that the parser can't
        // recover from.
        maxOutputTokens: 32768,
      },
    });

    const text = response.text ?? '';
    if (!text) throw new Error('Gemini returned empty response');
    return parseJsonObject<DocmapGraph>(text);
  }
}
