import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { daysAgoIso } from '../parseParams.js';
import { runHeadlessAnalysis } from '../pipeline.js';
import { getEntry } from '../store.js';

/**
 * DocMap MCP server. Exposes the same document-mapping pipeline used by the
 * Slack slash command as MCP tools, so any MCP-capable AI host (Claude Desktop,
 * Cursor, Claude Code, etc.) can call DocMap from a chat context.
 *
 * Transport: stdio (standard for local MCP integrations). Add to your MCP host
 * config like:
 *
 *   {
 *     "mcpServers": {
 *       "docmap": {
 *         "command": "node",
 *         "args": ["/absolute/path/to/server/dist/mcp/server.js"],
 *         "env": {
 *           "DATABASE_URL": "file:./dev.db",
 *           "SLACK_USER_TOKEN": "xoxp-...",
 *           "ACTIVE_LLM": "gemini",
 *           "GEMINI_API_KEY": "...",
 *           "UI_BASE_URL": "http://localhost:5173"
 *         }
 *       }
 *     }
 *   }
 *
 * All Slack + LLM secrets are read from process.env, same as the HTTP server.
 */

const UI_BASE_URL = process.env.UI_BASE_URL ?? 'http://localhost:5173';
const SLACK_USER_TOKEN = process.env.SLACK_USER_TOKEN ?? '';

const server = new McpServer({
  name: 'docmap',
  version: '0.1.0',
});

// ---------- Tool: docmap.analyze ----------

server.registerTool(
  'analyze',
  {
    title: 'Analyze Slack channels',
    description:
      'Scan one or more Slack channels for shared document links, extract a structured graph of documents / contributors / relationships, and persist it. Returns a viewer URL and a summary of what was found. Requires SLACK_USER_TOKEN (search:read) and an LLM key configured on the server.',
    inputSchema: {
      channelIds: z
        .array(z.string().regex(/^C[A-Z0-9]{6,}$/, 'Slack channel id, e.g. C0123ABC456'))
        .min(1)
        .describe('Slack channel IDs to analyze (public channels the user token can see).'),
      days: z
        .number()
        .int()
        .min(1)
        .max(365)
        .default(7)
        .describe('Look-back window in days. Only messages posted within this window are scanned.'),
    },
  },
  async ({ channelIds, days }) => {
    if (!SLACK_USER_TOKEN) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'SLACK_USER_TOKEN is not configured on the DocMap MCP server. Set it in the MCP host env block or the server .env file.',
          },
        ],
      };
    }

    const afterDate = daysAgoIso(days);
    const result = await runHeadlessAnalysis({
      userToken: SLACK_USER_TOKEN,
      channelIdsToAnalyze: channelIds,
      afterDate,
      uiBaseUrl: UI_BASE_URL,
      workspace: null,
    });

    if (result.status === 'empty') {
      return {
        content: [
          {
            type: 'text',
            text: `No linked messages found in ${channelIds.length} channel(s) over the last ${days} day(s).`,
          },
        ],
      };
    }

    const graph = result.graph!;
    const payload = {
      graphId: result.graphId,
      viewerUrl: result.viewerUrl,
      summary: {
        docs: graph.docs.length,
        contributors: graph.users.length,
        edges: graph.edges.length,
        channelCount: result.channelCount,
        days: result.days,
      },
      summaryReport: graph.summaryReport,
      docs: graph.docs,
      users: graph.users,
      edges: graph.edges,
    };

    return {
      content: [
        {
          // Prefer a compact text payload the LLM can read + summarize.
          // The `viewerUrl` is the human handoff for the visual graph.
          type: 'text',
          text: JSON.stringify(payload, null, 2),
        },
      ],
    };
  },
);

// ---------- Tool: docmap.get_graph ----------

server.registerTool(
  'get_graph',
  {
    title: 'Fetch a previously generated DocMap graph',
    description:
      'Look up a graph by id (usually returned from `analyze`). Returns the full graph JSON so the AI host can inspect its docs / users / edges without re-running the analysis.',
    inputSchema: {
      graphId: z.string().min(1).describe('The graphId returned by a previous analyze call.'),
    },
  },
  async ({ graphId }) => {
    const entry = await getEntry(graphId);
    if (!entry) {
      return {
        isError: true,
        content: [{ type: 'text', text: `No graph found for id ${graphId}.` }],
      };
    }
    const viewerUrl = `${UI_BASE_URL}/?id=${graphId}`;
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              graphId,
              viewerUrl,
              channelCount: entry.meta.channelCount,
              days: entry.meta.days,
              graph: entry.graph,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ---------- Entry point ----------

const transport = new StdioServerTransport();
await server.connect(transport);
// Log to stderr because stdout is the MCP transport channel — anything on
// stdout is interpreted as JSON-RPC by the client.
console.error('[mcp] docmap MCP server ready on stdio');
