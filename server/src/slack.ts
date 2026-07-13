import { WebClient } from '@slack/web-api';

import type { SlackMessageLite } from './types.js';

export interface FetchHistoryOpts {
  channelIds: string[];
  /** ISO date `YYYY-MM-DD` — lower bound for the search query's `after:` clause. */
  afterDate: string;
  userToken: string;
  /** Per-channel cap. `search.messages` returns up to 100 matches per call. */
  perChannelLimit?: number;
}

/**
 * Fetch link-bearing messages via Slack's classic `search.messages` Web API.
 *
 * Historical note: DocMap originally targeted the newer Real-Time Search API
 * (`assistant.search.context`) — see the `rts-api` branch for that
 * implementation. In practice the RTS endpoint requires the workspace / app
 * tier to have the "Agents & AI Apps" capability turned on and Slack AI
 * enabled, which Developer Program sandboxes don't grant. `search.messages`
 * covers the same query semantics (`in:<#channel> has:link after:YYYY-MM-DD`),
 * works on every workspace tier, and only needs the classic `search:read`
 * user-token scope. When we later run on a workspace that has RTS available,
 * swap `server/src/slack.ts` back to the `rts-api` version — the exported
 * `fetchChannelHistory` signature is identical.
 *
 * Required user-token scope: `search:read`.
 */
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

      // Diagnostic: log the query when the result set is empty so it's easy
      // to distinguish a legitimately empty channel from an indexing lag or
      // a scope / query issue.
      if (matches.length === 0) {
        console.warn(
          `[slack] search.messages returned 0 results for channel=${channel} query="${query}". If you just posted the messages, Slack's search index usually catches up in ~30 seconds.`,
        );
      }
    } catch (err) {
      console.error(`[slack] search.messages failed for ${channel}:`, err);
    }
  }

  return all;
}
