import 'dotenv/config';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bolt from '@slack/bolt';
import { WebClient } from '@slack/web-api';
import cors from 'cors';
import express from 'express';
import { v4 as uuid } from 'uuid';

// MONETIZATION-DISABLED (hackathon submission): billing / workspace-tier /
// BYOK code paths are commented out below but not deleted — they'll come back
// when we productionize. Search "MONETIZATION-DISABLED" to find every site.
// import { checkSubscriptionLimit } from './billing.js';
import {
  ACTION_IDS,
  ANALYZE_MODAL_CALLBACK_ID,
  AUTOSAVE_VALUE,
  FORM_BLOCK_IDS,
  HOME_ACTION_IDS,
  HOME_BLOCK_IDS,
  REPORT_VIEW_ACTION_ID,
  SKIP_FORM_VALUE,
  buildAnalyzeModalView,
  buildConfigForm,
  buildDmWelcomeBlocks,
  buildHomeView,
  buildResultBlocks,
  buildShareBlocks,
  decodeReportViewValue,
} from './blocks.js';
// import { encryptSecret } from './crypto.js';
import {
  // getOrCreateWorkspace,
  getUserPref,
  // isWorkspaceTier,
  // prisma,
  saveUserPref,
  // type WorkspaceTier,
} from './db.js';
import { daysAgoIso, parseDocmapText } from './parseParams.js';
import { runDocmapPipeline } from './pipeline.js';
import { seedDemoGraph } from './seed.js';
import { getEntry, getGraph, saveGraph } from './store.js';

const { App, LogLevel } = bolt;

const PORT = Number(process.env.PORT ?? 3000);
const UI_BASE_URL = process.env.UI_BASE_URL ?? 'http://localhost:5173';
const SLACK_USER_TOKEN = process.env.SLACK_USER_TOKEN ?? '';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN ?? '';
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN ?? '';

// ---------- HTTP API (Express) ----------
const httpApp = express();
httpApp.use(cors());
httpApp.use(express.json({ limit: '2mb' }));

httpApp.get('/health', (_req, res) => {
  res.json({ ok: true });
});

httpApp.get('/api/graph/:id', async (req, res) => {
  const graph = await getGraph(req.params.id);
  if (!graph) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json(graph);
});

httpApp.post('/api/dev/graph', async (req, res) => {
  const id = uuid();
  await saveGraph(id, req.body);
  res.json({ id, url: `${UI_BASE_URL}/?id=${id}` });
});

// ---------- Share ----------
// Post the docmap link to one or more Slack destinations (channel IDs or user
// IDs). The bot posts as itself; if `sharerId` is provided we attribute in the
// message body. `note` is an optional freeform message from the sharer.
const shareBotClient = SLACK_BOT_TOKEN ? new WebClient(SLACK_BOT_TOKEN) : null;

interface ShareResult {
  destination: string;
  ok: boolean;
  error?: string;
}

httpApp.post('/api/graph/:id/share', async (req, res) => {
  const graph = await getGraph(req.params.id);
  if (!graph) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  if (!shareBotClient) {
    res.status(503).json({ error: 'slack_not_configured' });
    return;
  }

  const raw = req.body?.destinations;
  const destinations: string[] = Array.isArray(raw)
    ? raw.map((d) => String(d).trim()).filter(Boolean)
    : [];
  if (destinations.length === 0) {
    res.status(400).json({ error: 'destinations_required' });
    return;
  }

  const sharerId =
    typeof req.body?.sharerId === 'string' && req.body.sharerId.trim()
      ? req.body.sharerId.trim()
      : undefined;
  const note =
    typeof req.body?.note === 'string' ? req.body.note.slice(0, 500).trim() || undefined : undefined;
  const url = `${UI_BASE_URL}/?id=${req.params.id}`;
  const blocks = buildShareBlocks({ graph, url, sharerId, note });
  const fallback = `DocMap shared${sharerId ? ` by <@${sharerId}>` : ''}: ${url}`;

  const results: ShareResult[] = await Promise.all(
    destinations.map(async (destination) => {
      try {
        await shareBotClient.chat.postMessage({
          channel: destination,
          blocks,
          text: fallback,
          unfurl_links: false,
          unfurl_media: false,
        });
        return { destination, ok: true };
      } catch (err) {
        return { destination, ok: false, error: (err as Error).message };
      }
    }),
  );

  res.json({ url, results });
});

// MONETIZATION-DISABLED: workspace tier lookup, mock Stripe checkout, and
// Enterprise BYOK key storage endpoints. Restore this block (and the imports
// above) when re-enabling monetization.
/*
interface WorkspacePublic {
  slackTeamId: string;
  tier: WorkspaceTier;
  usageCount: number;
  freeLimit: number;
  // Only booleans are exposed — raw/decrypted keys never leave the server.
  hasOpenAIKey: boolean;
  hasAnthropicKey: boolean;
  hasGeminiKey: boolean;
  hasQwenKey: boolean;
}

function toPublicWorkspace(ws: {
  slackTeamId: string;
  tier: string;
  usageCount: number;
  customOpenAIKey: string | null;
  customAnthropicKey: string | null;
  customGeminiKey: string | null;
  customQwenKey: string | null;
}): WorkspacePublic {
  return {
    slackTeamId: ws.slackTeamId,
    tier: (isWorkspaceTier(ws.tier) ? ws.tier : 'FREE') as WorkspaceTier,
    usageCount: ws.usageCount,
    freeLimit: 5,
    hasOpenAIKey: Boolean(ws.customOpenAIKey),
    hasAnthropicKey: Boolean(ws.customAnthropicKey),
    hasGeminiKey: Boolean(ws.customGeminiKey),
    hasQwenKey: Boolean(ws.customQwenKey),
  };
}

// Fetch (or lazily create) a workspace's public-safe settings.
httpApp.get('/api/workspace/:teamId', async (req, res) => {
  try {
    const ws = await getOrCreateWorkspace(req.params.teamId);
    res.json(toPublicWorkspace(ws));
  } catch (err) {
    console.error('[workspace] get failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Mock Stripe Checkout: flips the workspace tier. Defaults to PRO (the self-serve
// upgrade). `tier` may be supplied to simulate other plans (e.g. ENTERPRISE) for
// local testing of the Enterprise settings tab.
httpApp.post('/api/workspace/:teamId/checkout', async (req, res) => {
  const requestedTier = String(req.body?.tier ?? 'PRO').toUpperCase();
  if (!isWorkspaceTier(requestedTier)) {
    res.status(400).json({ error: 'invalid_tier' });
    return;
  }
  try {
    await getOrCreateWorkspace(req.params.teamId);
    const ws = await prisma.workspace.update({
      where: { slackTeamId: req.params.teamId },
      data: { tier: requestedTier },
    });
    res.json(toPublicWorkspace(ws));
  } catch (err) {
    console.error('[workspace] checkout failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Save BYOK provider keys (Enterprise only). Keys are AES-256-GCM encrypted at
// rest. An empty string clears a stored key; an omitted field leaves it unchanged.
httpApp.post('/api/workspace/settings', async (req, res) => {
  const { slackTeamId, openAIKey, anthropicKey, geminiKey, qwenKey } = req.body ?? {};
  if (!slackTeamId || typeof slackTeamId !== 'string') {
    res.status(400).json({ error: 'missing_slackTeamId' });
    return;
  }

  try {
    const ws = await getOrCreateWorkspace(slackTeamId);
    if (ws.tier !== 'ENTERPRISE') {
      res.status(403).json({ error: 'enterprise_required' });
      return;
    }

    const data: Record<string, string | null> = {};
    applyKeyUpdate(data, 'customOpenAIKey', openAIKey);
    applyKeyUpdate(data, 'customAnthropicKey', anthropicKey);
    applyKeyUpdate(data, 'customGeminiKey', geminiKey);
    applyKeyUpdate(data, 'customQwenKey', qwenKey);

    const updated = await prisma.workspace.update({
      where: { slackTeamId },
      data,
    });
    res.json(toPublicWorkspace(updated));
  } catch (err) {
    console.error('[workspace] settings save failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

function applyKeyUpdate(
  data: Record<string, string | null>,
  field: string,
  value: unknown,
): void {
  if (typeof value !== 'string') return; // omitted → leave unchanged
  const trimmed = value.trim();
  data[field] = trimmed === '' ? null : encryptSecret(trimmed);
}
*/

// Serve the built UI from the same origin in production so a deployed instance
// only needs one public URL. In the Docker runtime image the layout is:
//   /app/dist/index.js         ← this file at runtime
//   /app/public/index.html     ← Vite build output
// so `../public` from __dirname resolves to /app/public.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_DIST = path.resolve(__dirname, '../public');
if (existsSync(UI_DIST)) {
  console.log(`[http] serving UI from ${UI_DIST}`);
  httpApp.use(express.static(UI_DIST));
  // SPA fallback: any non-API GET returns index.html so client-side routing works.
  httpApp.get(/^\/(?!api\/|health).*/, (_req, res) => {
    res.sendFile(path.join(UI_DIST, 'index.html'));
  });
}

httpApp.listen(PORT, () => {
  console.log(`[http] listening on :${PORT}`);
  // Fire-and-forget: re-seed the demo graph so `?id=demo` is always populated.
  void seedDemoGraph();
});

// ---------- Slack (Socket Mode) ----------
if (!SLACK_BOT_TOKEN || !SLACK_APP_TOKEN) {
  console.warn(
    '[slack] SLACK_BOT_TOKEN and/or SLACK_APP_TOKEN missing — slash command disabled.',
  );
} else {
  const slack = new App({
    token: SLACK_BOT_TOKEN,
    appToken: SLACK_APP_TOKEN,
    socketMode: true,
    logLevel: LogLevel.INFO,
  });

  const userClient = new WebClient(SLACK_USER_TOKEN);

  slack.command('/docmap', async ({ ack, command, client, respond }) => {
    await ack();

    // MONETIZATION-DISABLED: FREE-tier quota gate. When re-enabling, uncomment
    // and thread `limit.workspace` back into the pipeline calls below.
    /*
    const limit = await checkSubscriptionLimit(command.team_id, UI_BASE_URL);
    if (!limit.allowed) {
      await respond({
        response_type: 'ephemeral',
        blocks: limit.blocks,
        text: limit.text,
      });
      return;
    }
    */

    const parsed = parseDocmapText(command.text, command.channel_id);
    // `/docmap settings` (or `config`/`setup`) always reopens the form, even for
    // users who've opted to skip it — their escape hatch to change preferences.
    const forceSettings = /^(settings|config|setup)$/i.test((command.text ?? '').trim());

    if (parsed.quickMode) {
      try {
        await runDocmapPipeline({
          client,
          userClient,
          // DM the invoker: chat.postMessage accepts a user_id and routes it to
          // the bot ↔ user DM channel, keeping the loading progression private.
          postChannel: command.user_id,
          channelIdsToAnalyze: [command.channel_id],
          afterDate: daysAgoIso(7),
          uiBaseUrl: UI_BASE_URL,
          // MONETIZATION-DISABLED: was `workspace: limit.workspace`.
          workspace: null,
        });
      } catch (err) {
        console.error('[docmap] quick mode failed:', err);
      }
      return;
    }

    const pref = await getUserPref(command.team_id, command.user_id);

    // Preference: skip the form and analyze the current channel immediately.
    if (pref?.skipForm && !forceSettings) {
      try {
        await runDocmapPipeline({
          client,
          userClient,
          postChannel: command.user_id,
          channelIdsToAnalyze: [command.channel_id],
          afterDate: daysAgoIso(pref.defaultDays),
          uiBaseUrl: UI_BASE_URL,
          // MONETIZATION-DISABLED: was `workspace: limit.workspace`.
          workspace: null,
        });
      } catch (err) {
        console.error('[docmap] skip-form mode failed:', err);
      }
      return;
    }

    await respond({
      response_type: 'ephemeral',
      blocks: buildConfigForm({
        defaultDays: pref?.defaultDays ?? parsed.days,
        skipForm: pref?.skipForm ?? false,
        currentChannelId: command.channel_id,
      }),
      text: 'Configure your DocMap',
    });
  });

  slack.action(ACTION_IDS.generateBtn, async ({ ack, body, client, respond }) => {
    await ack();

    if (body.type !== 'block_actions') return;
    const userId = body.user?.id;
    if (!userId) {
      await respond({ response_type: 'ephemeral', text: 'Could not identify the invoking user.' });
      return;
    }

    const state = body.state?.values ?? {};
    const channelsValue = state[FORM_BLOCK_IDS.channels]?.[ACTION_IDS.channelsSelect];
    const durationValue = state[FORM_BLOCK_IDS.timeframe]?.[ACTION_IDS.durationSelect];
    const prefsValue = state[FORM_BLOCK_IDS.prefs]?.[ACTION_IDS.skipToggle];

    const selectedChannels =
      (channelsValue && 'selected_channels' in channelsValue && channelsValue.selected_channels) ||
      [];

    const selectedDays =
      durationValue && 'selected_option' in durationValue && durationValue.selected_option
        ? Number(durationValue.selected_option.value) || 7
        : 7;

    const skipForm = Boolean(
      prefsValue &&
        'selected_options' in prefsValue &&
        prefsValue.selected_options?.some((o) => o.value === SKIP_FORM_VALUE),
    );

    if (selectedChannels.length === 0) {
      await respond({
        response_type: 'ephemeral',
        replace_original: false,
        text: '⚠️ Pick at least one channel before generating.',
      });
      return;
    }

    await respond({ response_type: 'ephemeral', delete_original: true });

    const teamId = body.team?.id;
    // MONETIZATION-DISABLED: workspace fetch previously routed Enterprise BYOK
    // keys into the pipeline. Restore the fetch when re-enabling monetization.
    // const workspace = teamId ? await getOrCreateWorkspace(teamId) : null;

    // Remember the chosen timeframe + skip preference for next time.
    if (teamId) {
      try {
        await saveUserPref(teamId, userId, { defaultDays: selectedDays, skipForm });
      } catch (err) {
        console.error('[docmap] failed to save user prefs:', err);
      }
    }

    try {
      await runDocmapPipeline({
        client,
        userClient,
        // DM the invoker (see quick-mode branch above).
        postChannel: userId,
        channelIdsToAnalyze: selectedChannels,
        afterDate: daysAgoIso(selectedDays),
        uiBaseUrl: UI_BASE_URL,
        workspace: null,
      });
    } catch (err) {
      console.error('[docmap] interactive mode failed:', err);
    }
  });

  // ----- Report view switcher: swap Doc view ↔ User view in place -----
  slack.action(REPORT_VIEW_ACTION_ID, async ({ ack, body, client }) => {
    await ack();
    if (body.type !== 'block_actions') return;
    const action = body.actions?.[0];
    if (!action || action.type !== 'radio_buttons' || !action.selected_option?.value) return;

    const decoded = decodeReportViewValue(action.selected_option.value);
    if (!decoded) return;
    const entry = await getEntry(decoded.graphId);
    if (!entry) return;

    // Container gives us the channel + message ts to update in place.
    const container = body.container as { channel_id?: string; message_ts?: string } | undefined;
    const channel = container?.channel_id ?? body.channel?.id;
    const ts = container?.message_ts;
    if (!channel || !ts) return;

    try {
      await client.chat.update({
        channel,
        ts,
        text: `DocMap — ${entry.graph.docs.length} docs, ${entry.graph.users.length} contributors`,
        blocks: buildResultBlocks({
          graph: entry.graph,
          graphId: decoded.graphId,
          url: `${UI_BASE_URL}/?id=${decoded.graphId}`,
          channelCount: entry.meta.channelCount,
          days: entry.meta.days,
          view: decoded.view,
        }),
      });
    } catch (err) {
      console.error('[report] view switch failed:', err);
    }
  });

  // ----- App Home tab: persistent per-user settings (auto-saves on change) -----
  slack.event('app_home_opened', async ({ event, body, client }) => {
    if (event.tab !== 'home') return;
    const teamId = (body as { team_id?: string }).team_id;
    if (!teamId) return;
    try {
      const pref = await getUserPref(teamId, event.user);
      await client.views.publish({
        user_id: event.user,
        view: buildHomeView({
          defaultDays: pref?.defaultDays,
          skipForm: pref?.skipForm,
          autoSave: pref?.autoSave ?? true,
        }),
      });
    } catch (err) {
      console.error('[home] publish failed:', err);
    }
  });

  // Home-pref helpers. Two flavors:
  //  - persistHomePref: write to DB, publish dirty→clean/error. Used when
  //    auto-save is ON, or the user explicitly clicked Save.
  //  - markHomeDirty: skip the DB write, publish dirty with the pending values.
  //    Used when auto-save is OFF and the user changes a control.
  interface HomePrefState {
    defaultDays: number;
    skipForm: boolean;
    autoSave: boolean;
  }

  async function getPrefWithDefaults(
    teamId: string,
    userId: string,
  ): Promise<HomePrefState> {
    const pref = await getUserPref(teamId, userId).catch(() => null);
    return {
      defaultDays: pref?.defaultDays ?? 7,
      skipForm: pref?.skipForm ?? false,
      autoSave: pref?.autoSave ?? true,
    };
  }

  async function persistHomePref(
    userId: string,
    teamId: string,
    patch: Partial<HomePrefState>,
    client: WebClient,
  ) {
    const current = await getPrefWithDefaults(teamId, userId);
    const next: HomePrefState = { ...current, ...patch };

    // Optimistic dirty view (green button, "Saving…") while the write is inflight.
    await client.views
      .publish({
        user_id: userId,
        view: buildHomeView({ ...next, saveState: 'dirty' }),
      })
      .catch((err) => console.error('[home] optimistic publish failed:', err));

    try {
      await saveUserPref(teamId, userId, next);
    } catch (err) {
      console.error('[home] save failed:', err);
      await client.views
        .publish({
          user_id: userId,
          view: buildHomeView({ ...next, saveState: 'error' }),
        })
        .catch(() => undefined);
      return;
    }
    await client.views
      .publish({
        user_id: userId,
        view: buildHomeView({ ...next, saveState: 'clean' }),
      })
      .catch((err) => console.error('[home] republish failed:', err));
  }

  async function markHomeDirty(
    userId: string,
    teamId: string,
    patch: Partial<HomePrefState>,
    client: WebClient,
  ) {
    const current = await getPrefWithDefaults(teamId, userId);
    // The pending values are current + patch; not written to DB yet.
    const pending: HomePrefState = { ...current, ...patch };
    await client.views
      .publish({
        user_id: userId,
        view: buildHomeView({ ...pending, saveState: 'dirty' }),
      })
      .catch((err) => console.error('[home] dirty publish failed:', err));
  }

  slack.action(HOME_ACTION_IDS.durationSelect, async ({ ack, body, client }) => {
    await ack();
    if (body.type !== 'block_actions') return;
    const userId = body.user?.id;
    const teamId = body.team?.id;
    const action = body.actions?.[0];
    if (!userId || !teamId || !action || action.type !== 'static_select' || !action.selected_option)
      return;
    const days = Number(action.selected_option.value) || 7;
    const current = await getPrefWithDefaults(teamId, userId);
    if (current.autoSave) {
      await persistHomePref(userId, teamId, { defaultDays: days }, client);
    } else {
      await markHomeDirty(userId, teamId, { defaultDays: days }, client);
    }
  });

  slack.action(HOME_ACTION_IDS.skipToggle, async ({ ack, body, client }) => {
    await ack();
    if (body.type !== 'block_actions') return;
    const userId = body.user?.id;
    const teamId = body.team?.id;
    const action = body.actions?.[0];
    if (!userId || !teamId || !action || action.type !== 'checkboxes') return;
    const skipForm = (action.selected_options ?? []).some((o) => o.value === SKIP_FORM_VALUE);
    const current = await getPrefWithDefaults(teamId, userId);
    if (current.autoSave) {
      await persistHomePref(userId, teamId, { skipForm }, client);
    } else {
      await markHomeDirty(userId, teamId, { skipForm }, client);
    }
  });

  // The auto-save toggle itself respects the current auto-save state — if
  // it's on right now, the toggle change is persisted immediately (turning
  // it off); if it's currently off, the toggle change stays dirty until
  // the user clicks Save. Keeps the "when off, nothing auto-saves" invariant.
  slack.action(HOME_ACTION_IDS.autoSaveToggle, async ({ ack, body, client }) => {
    await ack();
    if (body.type !== 'block_actions') return;
    const userId = body.user?.id;
    const teamId = body.team?.id;
    const action = body.actions?.[0];
    if (!userId || !teamId || !action || action.type !== 'checkboxes') return;
    const autoSave = (action.selected_options ?? []).some((o) => o.value === AUTOSAVE_VALUE);
    const current = await getPrefWithDefaults(teamId, userId);
    if (current.autoSave) {
      await persistHomePref(userId, teamId, { autoSave }, client);
    } else {
      await markHomeDirty(userId, teamId, { autoSave }, client);
    }
  });

  // Explicit Save click — reads the current view state (in case the user hit
  // Save without touching a control since app_home_opened) and re-persists.
  slack.action(HOME_ACTION_IDS.save, async ({ ack, body, client }) => {
    await ack();
    if (body.type !== 'block_actions') return;
    const userId = body.user?.id;
    const teamId = body.team?.id;
    if (!userId || !teamId) return;

    // block_actions from App Home puts the view state on body.view.
    const state = (body as { view?: { state?: { values?: Record<string, Record<string, unknown>> } } })
      .view?.state?.values ?? {};
    const durationValue = state[HOME_BLOCK_IDS.timeframe]?.[HOME_ACTION_IDS.durationSelect] as
      | { selected_option?: { value?: string } }
      | undefined;
    const skipValue = state[HOME_BLOCK_IDS.prefs]?.[HOME_ACTION_IDS.skipToggle] as
      | { selected_options?: { value?: string }[] }
      | undefined;
    const autoSaveValue = state[HOME_BLOCK_IDS.autoSave]?.[HOME_ACTION_IDS.autoSaveToggle] as
      | { selected_options?: { value?: string }[] }
      | undefined;

    const patch: Partial<HomePrefState> = {};
    if (durationValue?.selected_option?.value) {
      patch.defaultDays = Number(durationValue.selected_option.value) || undefined;
    }
    if (skipValue?.selected_options) {
      patch.skipForm = skipValue.selected_options.some((o) => o.value === SKIP_FORM_VALUE);
    }
    if (autoSaveValue?.selected_options) {
      patch.autoSave = autoSaveValue.selected_options.some((o) => o.value === AUTOSAVE_VALUE);
    }
    await persistHomePref(userId, teamId, patch, client);
  });

  // "Analyze channels" button in App Home opens the config form as a modal —
  // a way for skip-form users to still trigger a multi-channel analysis.
  slack.action(HOME_ACTION_IDS.analyze, async ({ ack, body, client }) => {
    await ack();
    if (body.type !== 'block_actions' || !body.trigger_id) return;
    const userId = body.user?.id;
    const teamId = body.team?.id;
    const pref = userId && teamId ? await getUserPref(teamId, userId) : null;
    try {
      await client.views.open({
        trigger_id: body.trigger_id,
        view: buildAnalyzeModalView({
          defaultDays: pref?.defaultDays,
          skipForm: pref?.skipForm,
        }),
      });
    } catch (err) {
      console.error('[home] open analyze modal failed:', err);
    }
  });

  // Modal submit — mirrors the generate_map_btn action but drives from a modal.
  slack.view(ANALYZE_MODAL_CALLBACK_ID, async ({ ack, body, client }) => {
    const state = body.view.state.values;
    const channelsValue = state[FORM_BLOCK_IDS.channels]?.[ACTION_IDS.channelsSelect];
    const durationValue = state[FORM_BLOCK_IDS.timeframe]?.[ACTION_IDS.durationSelect];

    const selectedChannels =
      (channelsValue && 'selected_channels' in channelsValue && channelsValue.selected_channels) ||
      [];
    const selectedDays =
      durationValue && 'selected_option' in durationValue && durationValue.selected_option
        ? Number(durationValue.selected_option.value) || 7
        : 7;

    if (selectedChannels.length === 0) {
      await ack({
        response_action: 'errors',
        errors: { [FORM_BLOCK_IDS.channels]: 'Pick at least one channel.' },
      });
      return;
    }
    await ack();

    const userId = body.user?.id;
    const teamId = body.team?.id;
    if (!userId) return;

    // MONETIZATION-DISABLED: was `const workspace = teamId ? await getOrCreateWorkspace(teamId) : null;`
    try {
      await runDocmapPipeline({
        client,
        userClient,
        postChannel: userId,
        channelIdsToAnalyze: selectedChannels,
        afterDate: daysAgoIso(selectedDays),
        uiBaseUrl: UI_BASE_URL,
        workspace: null,
      });
    } catch (err) {
      console.error('[docmap] analyze-modal submit failed:', err);
    }
  });

  // ----- DM entry point: any user message in the bot's DM gets a form CTA -----
  // Slack's default DM has a chat input, but free-form text isn't what we act
  // on. Whenever a human sends something, reply with the same "Analyze channels"
  // button used by App Home so users always have a structured way in.
  //
  // Requires: `message.im` in Event Subscriptions → Subscribe to bot events,
  // and `im:history` in Bot Token Scopes (reinstall the app after adding).
  slack.event('message', async ({ event, client }) => {
    // Log every message-event delivery so we can tell scope/subscription issues
    // (event never arrives) apart from filter-drop issues (event arrives but is
    // discarded here).
    console.log('[dm] message event received', {
      channel_type: (event as { channel_type?: string }).channel_type,
      subtype: (event as { subtype?: string }).subtype,
      bot_id: (event as { bot_id?: string }).bot_id,
      channel: (event as { channel?: string }).channel,
      user: (event as { user?: string }).user,
    });

    // Narrow to human-authored DMs. Bot messages, edits, and joins get skipped.
    if (event.channel_type !== 'im') return;
    if ('subtype' in event && event.subtype) return;
    if ('bot_id' in event && event.bot_id) return;

    try {
      await client.chat.postMessage({
        channel: event.channel,
        text: 'Click *Analyze channels* to map documents from your Slack.',
        blocks: buildDmWelcomeBlocks(),
        unfurl_links: false,
        unfurl_media: false,
      });
    } catch (err) {
      console.error('[dm] welcome post failed:', err);
    }
  });

  // Silence the no-listener warnings for the form inputs (they only need to capture state).
  slack.action(ACTION_IDS.channelsSelect, async ({ ack }) => ack());
  slack.action(ACTION_IDS.durationSelect, async ({ ack }) => ack());
  slack.action(ACTION_IDS.skipToggle, async ({ ack }) => ack());
  // URL button — Slack opens the link client-side; we just ack the interaction.
  slack.action('upgrade_on_stripe_btn', async ({ ack }) => ack());

  (async () => {
    await slack.start();
    console.log('[slack] socket mode connected');
  })();
}
