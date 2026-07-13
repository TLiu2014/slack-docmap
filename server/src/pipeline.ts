import type { WebClient } from '@slack/web-api';
import { v4 as uuid } from 'uuid';

import { buildLoadingBlocks, buildResultBlocks } from './blocks.js';
import type { Workspace } from './db.js';
import { getLLMProvider } from './llm/index.js';
import { daysBetween } from './parseParams.js';
import { fetchChannelHistory } from './slack.js';
import { saveGraph } from './store.js';
import type { DocmapGraph } from './types.js';

const MAX_MESSAGES = 100;

// ---------- Headless analysis (shared by Slack + MCP surfaces) ----------

export interface RunHeadlessOpts {
  /** User token client — needed for search.messages (a user-scope API). */
  userToken: string;
  channelIdsToAnalyze: string[];
  /** ISO date `YYYY-MM-DD` — lower bound for search.messages. */
  afterDate: string;
  uiBaseUrl: string;
  /** Workspace owning this request — used for Enterprise BYOK key routing. */
  workspace?: Workspace | null;
}

export interface HeadlessResult {
  status: 'ok' | 'empty';
  /** Number of raw Slack messages returned by search (before the MAX cap). */
  messagesFound: number;
  /** Present only when status === 'ok'. */
  graph?: DocmapGraph;
  graphId?: string;
  viewerUrl?: string;
  channelCount?: number;
  days?: number;
}

/**
 * Core analysis pipeline with no chat side effects. Fetches Slack messages,
 * runs the LLM, persists the graph, and returns the identifiers the caller
 * needs to display or link to it. Used verbatim by:
 *   - the Slack Bolt handler (wrapped with chat.postMessage/update)
 *   - the MCP tool handler (returned as a tool response)
 */
export async function runHeadlessAnalysis(opts: RunHeadlessOpts): Promise<HeadlessResult> {
  const { userToken, channelIdsToAnalyze, afterDate, uiBaseUrl, workspace } = opts;
  const days = daysBetween(afterDate);

  const messages = await fetchChannelHistory({
    channelIds: channelIdsToAnalyze,
    afterDate,
    userToken,
  });

  if (messages.length === 0) {
    return { status: 'empty', messagesFound: 0 };
  }

  const capped = messages.slice(0, MAX_MESSAGES);
  const provider = await getLLMProvider({ workspace });
  const graph = await provider.generateGraph({
    messages: capped,
    channelIds: channelIdsToAnalyze,
    afterDate,
  });

  const graphId = uuid();
  await saveGraph(graphId, graph, {
    channelCount: channelIdsToAnalyze.length,
    days,
  });
  const viewerUrl = `${uiBaseUrl}/?id=${graphId}`;

  return {
    status: 'ok',
    messagesFound: messages.length,
    graph,
    graphId,
    viewerUrl,
    channelCount: channelIdsToAnalyze.length,
    days,
  };
}

// ---------- Slack pipeline: headless analysis + chat progression ----------

export interface RunPipelineOpts {
  client: WebClient;
  userClient: WebClient;
  postChannel: string;
  channelIdsToAnalyze: string[];
  afterDate: string;
  uiBaseUrl: string;
  workspace?: Workspace | null;
}

export async function runDocmapPipeline(opts: RunPipelineOpts): Promise<void> {
  const { client, userClient, postChannel, channelIdsToAnalyze, afterDate, uiBaseUrl, workspace } =
    opts;

  const initial = await client.chat.postMessage({
    channel: postChannel,
    text: '⏳ Fetching messages from Slack...',
    blocks: buildLoadingBlocks('⏳ *Fetching messages from Slack...*'),
  });

  const ts = initial.ts;
  // When postChannel is a user id (DM), Slack resolves it to the IM channel and
  // returns the real channel id here. chat.update MUST target that resolved id —
  // updating by user id fails with `message_not_found`.
  const channel = initial.channel ?? postChannel;
  if (!ts) throw new Error('chat.postMessage returned no ts');

  const update = (text: string) =>
    client.chat.update({
      channel,
      ts,
      text,
      blocks: buildLoadingBlocks(text),
    });

  try {
    // Peek at Slack first so we can emit the "Analyzing..." message BEFORE the
    // LLM call kicks off. Then run the headless helper for the rest.
    const messages = await fetchChannelHistory({
      channelIds: channelIdsToAnalyze,
      afterDate,
      userToken: userClient.token ?? '',
    });

    if (messages.length === 0) {
      await update('🚫 *No document links found in this timeframe.*');
      return;
    }

    const capped = messages.slice(0, MAX_MESSAGES);
    await update(`✨ *Analyzing document connections...* (${capped.length} messages)`);

    const provider = await getLLMProvider({ workspace });
    const graph = await provider.generateGraph({
      messages: capped,
      channelIds: channelIdsToAnalyze,
      afterDate,
    });

    const graphId = uuid();
    const days = daysBetween(afterDate);
    await saveGraph(graphId, graph, { channelCount: channelIdsToAnalyze.length, days });

    const viewerUrl = `${uiBaseUrl}/?id=${graphId}`;
    const resultText = `✅ DocMap ready — ${graph.docs.length} docs, ${graph.users.length} contributors across ${channelIdsToAnalyze.length} channel(s).`;
    await client.chat.update({
      channel,
      ts,
      text: resultText,
      blocks: buildResultBlocks({
        graph,
        graphId,
        url: viewerUrl,
        channelCount: channelIdsToAnalyze.length,
        days,
        view: 'doc',
      }),
    });
  } catch (err) {
    console.error('[pipeline] failed:', err);
    await update(`❌ *DocMap failed:* ${(err as Error).message}`).catch(() => undefined);
    throw err;
  }
}
