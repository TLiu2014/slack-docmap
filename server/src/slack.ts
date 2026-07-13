import { WebClient } from '@slack/web-api';

import type { SlackMessageLite } from './types.js';

export interface FetchHistoryOpts {
  channelIds: string[];
  /** ISO date `YYYY-MM-DD` — lower bound. Converted to a UNIX ts for RTS. */
  afterDate: string;
  userToken: string;
  /** Total-per-channel cap. RTS returns max 20 per page; we paginate up to this. */
  perChannelLimit?: number;
}

/** Response shape from the Real-Time Search API (typed loosely — the WebClient
 * we ship pre-dates this method, so we call it via `apiCall`). */
interface RtsMessage {
  author_name?: string;
  author_user_id?: string;
  channel_id?: string;
  channel_name?: string;
  message_ts?: string;
  content?: string;
  permalink?: string;
  is_author_bot?: boolean;
}

interface RtsResponse {
  ok: boolean;
  error?: string;
  results?: { messages?: RtsMessage[] };
  response_metadata?: { next_cursor?: string };
}

const RTS_METHOD = 'assistant.search.context';
const RTS_PAGE_LIMIT = 20; // hard-capped by Slack

/**
 * Fetch linked messages via Slack's **Real-Time Search API**
 * (`assistant.search.context`). This is the agent-optimized replacement for the
 * legacy `search.messages` method — it accepts natural-language + DSL queries,
 * respects the same date range and `has:` filters, and paginates via cursor.
 *
 * Required user-token scopes (add these to your app and reinstall):
 *   - search:read.public   (for public channels)
 *   - search:read.private  (private channels — optional)
 *   - search:read.im       (DMs — optional)
 *   - search:read.mpim     (multi-party DMs — optional)
 *
 * Note: Slack still lists `search.messages` under `search:read`, but that
 * method is now marked legacy. DocMap runs entirely on RTS.
 */
export async function fetchChannelHistory(opts: FetchHistoryOpts): Promise<SlackMessageLite[]> {
  const { channelIds, afterDate, userToken, perChannelLimit = 100 } = opts;

  if (!userToken) {
    console.warn('[slack] SLACK_USER_TOKEN not set — returning empty history');
    return [];
  }

  const client = new WebClient(userToken);
  const afterEpoch = Math.floor(new Date(`${afterDate}T00:00:00Z`).getTime() / 1000);
  const all: SlackMessageLite[] = [];

  for (const channel of channelIds) {
    // Standard Slack search DSL: `has:link` (no brackets — the docs table used
    // `has:[link]` as a "value goes here" placeholder, not literal syntax).
    // We also scope the search via `context_channel_id` rather than an `in:`
    // clause in the query, per RTS's argument surface.
    const query = 'has:link';
    let collected = 0;
    let cursor: string | undefined;
    let pageCount = 0;

    try {
      while (collected < perChannelLimit) {
        const remaining = perChannelLimit - collected;
        const limit = Math.min(RTS_PAGE_LIMIT, remaining);

        const params: Record<string, unknown> = {
          query,
          context_channel_id: channel,
          after: afterEpoch,
          content_types: ['messages'],
          sort: 'timestamp',
          sort_dir: 'desc',
          disable_semantic_search: true,
          limit,
        };
        if (cursor) params.cursor = cursor;

        const raw = (await client.apiCall(RTS_METHOD, params)) as unknown as RtsResponse;
        pageCount += 1;
        if (!raw.ok) {
          console.error(`[slack] ${RTS_METHOD} failed for ${channel}: ${raw.error ?? 'unknown'}`);
          break;
        }

        const page = raw.results?.messages ?? [];
        for (const m of page) {
          if (!m.content) continue;
          all.push({
            user: m.author_user_id ?? 'unknown',
            username: m.author_name,
            text: m.content,
            ts: m.message_ts ?? '',
            channel: m.channel_name ?? m.channel_id ?? channel,
            permalink: m.permalink,
          });
        }
        collected += page.length;

        cursor = raw.response_metadata?.next_cursor;
        if (!cursor || page.length === 0) break;
      }

      // Diagnostic: when we get zero matches, log the request shape so it's
      // clear whether it's a scope / query / date issue. `ok:true, empty` is
      // otherwise indistinguishable from a legitimately empty channel.
      if (collected === 0) {
        console.warn(
          `[slack] ${RTS_METHOD} returned 0 results for channel=${channel} query="${query}" after=${afterEpoch} (${new Date(afterEpoch * 1000).toISOString()}) pages=${pageCount}. If the channel really has linked messages: check that the user token has search:read.public and can see this channel, and that the after-date isn't newer than the messages.`,
        );
      }
    } catch (err) {
      console.error(`[slack] RTS search failed for ${channel}:`, err);
    }
  }

  return all;
}
