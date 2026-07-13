import { tryDecryptSecret } from '../crypto.js';
import type { Workspace } from '../db.js';
import { ClaudeProvider } from './claude.js';
import { GeminiProvider } from './gemini.js';
import { OpenAIProvider } from './openai.js';
import type { ILLMProvider } from './types.js';

export type LLMName = 'gemini' | 'openai' | 'claude' | 'qwen';

// Qwen (Alibaba DashScope) exposes an OpenAI-compatible API, so we reuse the
// OpenAI adapter with this base URL instead of adding another SDK. Default is the
// international endpoint; set QWEN_BASE_URL to the Beijing endpoint if needed:
//   https://dashscope.aliyuncs.com/compatible-mode/v1
const QWEN_DEFAULT_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

export interface ProviderSelection {
  /** Pre-fetched workspace (preferred — avoids a second DB round trip). */
  workspace?: Workspace | null;
  /** Slack team id to look up if `workspace` isn't supplied. */
  slackTeamId?: string;
}

/**
 * Resolve the active LLM provider, honoring Enterprise BYOK.
 *
 * For ENTERPRISE workspaces that have stored their own (encrypted) key for the
 * active provider, we decrypt it and initialize the SDK with *their* key instead
 * of the server's primary environment variable. All other tiers use the server's
 * env keys.
 */
export async function getLLMProvider(selection: ProviderSelection = {}): Promise<ILLMProvider> {
  const active = (process.env.ACTIVE_LLM ?? 'gemini').toLowerCase() as LLMName;
  const workspace = await resolveWorkspace(selection);
  const byok = workspace?.tier === 'ENTERPRISE' ? workspace : null;

  switch (active) {
    case 'gemini': {
      const customKey = tryDecryptSecret(byok?.customGeminiKey);
      if (customKey) console.log('[llm] using Enterprise BYOK Gemini key');
      return new GeminiProvider({
        apiKey: customKey ?? process.env.GEMINI_API_KEY ?? '',
        model: process.env.GEMINI_MODEL,
      });
    }
    case 'openai': {
      const customKey = tryDecryptSecret(byok?.customOpenAIKey);
      if (customKey) console.log('[llm] using Enterprise BYOK OpenAI key');
      return new OpenAIProvider({
        apiKey: customKey ?? process.env.OPENAI_API_KEY ?? '',
        model: process.env.OPENAI_MODEL,
      });
    }
    case 'claude': {
      const customKey = tryDecryptSecret(byok?.customAnthropicKey);
      if (customKey) console.log('[llm] using Enterprise BYOK Anthropic key');
      return new ClaudeProvider({
        apiKey: customKey ?? process.env.ANTHROPIC_API_KEY ?? '',
        model: process.env.CLAUDE_MODEL,
      });
    }
    case 'qwen': {
      const customKey = tryDecryptSecret(byok?.customQwenKey);
      if (customKey) console.log('[llm] using Enterprise BYOK Qwen key');
      return new OpenAIProvider({
        name: 'qwen',
        apiKey: customKey ?? process.env.QWEN_API_KEY ?? process.env.DASHSCOPE_API_KEY ?? '',
        model: process.env.QWEN_MODEL ?? 'qwen-plus',
        baseURL: process.env.QWEN_BASE_URL ?? QWEN_DEFAULT_BASE_URL,
      });
    }
    default:
      throw new Error(
        `Unknown ACTIVE_LLM: ${active}. Expected gemini | openai | claude | qwen.`,
      );
  }
}

async function resolveWorkspace(selection: ProviderSelection): Promise<Workspace | null> {
  // Monetization / BYOK is disabled for the hackathon build. If the caller
  // passes a workspace explicitly we honour it; otherwise we return null
  // and the provider falls back to the env-var API key.
  return selection.workspace ?? null;
}

export type { ILLMProvider, GenerateGraphRequest, GraphData } from './types.js';
