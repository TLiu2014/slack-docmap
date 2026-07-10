import type { WebClient } from '@slack/web-api';
import { v4 as uuid } from 'uuid';

import { buildLoadingBlocks, buildResultBlocks } from './blocks.js';
import type { Workspace } from './db.js';
import { getLLMProvider } from './llm/index.js';
import { daysBetween } from './parseParams.js';
import { fetchChannelHistory } from './slack.js';
import { saveGraph } from './store.js';

const MAX_MESSAGES = 100;

export interface RunPipelineOpts {
  client: WebClient;
  userClient: WebClient;
  postChannel: string;
  channelIdsToAnalyze: string[];
  afterDate: string;
  uiBaseUrl: string;
  /** Workspace owning this request — used for Enterprise BYOK key routing. */
  workspace?: Workspace | null;
}

export async function runDocmapPipeline(opts: RunPipelineOpts): Promise<void> {
  const { client, userClient, postChannel, channelIdsToAnalyze, afterDate, uiBaseUrl, workspace } =
    opts;
  const days = daysBetween(afterDate);

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
    await update(
      `✨ *Analyzing document connections...* (${capped.length} messages)`,
    );

    const provider = await getLLMProvider({ workspace });
    const graph = await provider.generateGraph({
      messages: capped,
      channelIds: channelIdsToAnalyze,
      afterDate,
    });

    const id = uuid();
    await saveGraph(id, graph, { channelCount: channelIdsToAnalyze.length, days });

    const url = `${uiBaseUrl}/?id=${id}`;
    const resultText = `✅ DocMap ready — ${graph.docs.length} docs, ${graph.users.length} contributors across ${channelIdsToAnalyze.length} channel(s).`;
    await client.chat.update({
      channel,
      ts,
      text: resultText,
      blocks: buildResultBlocks({
        graph,
        graphId: id,
        url,
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
