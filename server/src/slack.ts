import { WebClient } from '@slack/web-api';

import type { SlackMessageLite } from './types.js';

export interface FetchHistoryOpts {
  channelIds: string[];
  afterDate: string;
  userToken: string;
  perChannelLimit?: number;
}

export async function fetchChannelHistory(opts: FetchHistoryOpts): Promise<SlackMessageLite[]> {
  const { channelIds, afterDate, userToken, perChannelLimit = 100 } = opts;

  if (!userToken) {
    console.warn('[slack] SLACK_USER_TOKEN not set — returning empty history');
    return [];
  }

  const client = new WebClient(userToken);
  const all: SlackMessageLite[] = [];

  for (const channel of channelIds) {
    const query = `in:<#${channel}> has:link after:${afterDate}`;
    try {
      const result = await client.search.messages({
        query,
        count: perChannelLimit,
        sort: 'timestamp',
        sort_dir: 'desc',
      });
      const matches = result.messages?.matches ?? [];
      for (const m of matches) {
        if (!m.text) continue;
        all.push({
          user: m.user ?? 'unknown',
          username: m.username,
          text: m.text,
          ts: m.ts ?? '',
          channel: m.channel?.name ?? m.channel?.id ?? channel,
          permalink: m.permalink,
        });
      }
    } catch (err) {
      console.error(`[slack] search failed for ${channel}:`, err);
    }
  }

  return all;
}
