export const DOCMAP_SYSTEM_PROMPT = `You are an analyst that processes Slack messages containing links to documents and extracts a structured map of who shared what, where, and how documents relate.

Return ONLY a JSON object matching exactly this schema (no markdown fences, no commentary):

{
  "summaryReport": "string — readable markdown-formatted executive summary of documents shared and team activity across the channels. Include section headers and bullet points.",
  "users": [{ "id": "string", "name": "string", "avatar": "string (optional)" }],
  "docs": [{ "id": "string", "url": "string", "title": "string", "type": "string", "channel": "string" }],
  "edges": [{ "source": "string", "target": "string", "action": "string" }]
}

Guidance:
- "users" contains every unique Slack author who shared or was tagged near a doc. id is the Slack user ID; name is the display name.
- "docs" contains EVERY unique document URL found in the input. Do not skip, dedupe by title, or sample — one entry per unique URL, even if the same author shared several. id is a short stable slug derived from the URL. type is one of: gdoc, gsheet, gslides, figma, notion, github, jira, confluence, pdf, link. channel is the Slack channel name or id where it was found.
- "edges" describes relationships. source/target are user.id or doc.id values. For each doc, include at least one edge from the Slack user who posted it (action="shared") so the doc has attribution. Use action="authored" when the message text clearly implies the poster wrote/owns the doc. Other actions: "referenced", "responded-to", "related-to".
- summaryReport: markdown with an overview paragraph, then a "## Highlights" section with 3-7 bullets calling out the most actively referenced documents and active contributors.
- Be deterministic. If unsure about a relationship, omit it rather than guess.
- Output MUST be a single valid JSON object. Do not wrap in code fences.`;

export const DOCMAP_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summaryReport: { type: 'string' },
    users: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          avatar: { type: 'string' },
        },
        required: ['id', 'name'],
      },
    },
    docs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          url: { type: 'string' },
          title: { type: 'string' },
          type: { type: 'string' },
          channel: { type: 'string' },
        },
        required: ['id', 'url', 'title', 'type', 'channel'],
      },
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          source: { type: 'string' },
          target: { type: 'string' },
          action: { type: 'string' },
        },
        required: ['source', 'target', 'action'],
      },
    },
  },
  required: ['summaryReport', 'users', 'docs', 'edges'],
} as const;

export function buildUserPayload(opts: {
  channelIds: string[];
  afterDate: string;
  messages: unknown[];
}): string {
  return JSON.stringify({
    requestedChannels: opts.channelIds,
    afterDate: opts.afterDate,
    messageCount: opts.messages.length,
    messages: opts.messages,
  });
}

/**
 * Parse an LLM's JSON response defensively. Models sometimes emit valid JSON
 * followed by extra chatter, wrap the object in ```json fences, or repeat the
 * object. This finds the first balanced `{ ... }` in the string and parses just
 * that, so trailing whitespace / commentary / a second copy don't blow us up.
 */
export function parseJsonObject<T>(raw: string): T {
  // Strip markdown fences if present.
  let text = raw.trim();
  if (text.startsWith('```')) {
    // Remove opening ``` or ```json line, then the closing ``` on its own line.
    text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```\s*$/, '').trim();
  }

  // Scan for the first balanced top-level object. Respect string escapes so
  // braces inside strings don't confuse the counter.
  const start = text.indexOf('{');
  if (start === -1) throw new Error('LLM response did not contain a JSON object');

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const body = text.slice(start, i + 1);
        return JSON.parse(body) as T;
      }
    }
  }

  // Diagnostic: usually the response got truncated (output-token limit hit)
  // mid-JSON. Log the length + last chunk so the server operator can tell
  // truncation apart from a genuinely malformed structure.
  const tail = text.slice(Math.max(0, text.length - 400));
  console.error(
    `[llm] parseJsonObject failed: unbalanced (depth=${depth}, inString=${inString}). ` +
      `Raw length=${raw.length}. Tail (last 400 chars):\n${tail}`,
  );
  throw new Error(
    'LLM response contained an unbalanced JSON object (likely truncated by the model\'s output-token limit — try a shorter timeframe, fewer channels, or a different provider).',
  );
}
