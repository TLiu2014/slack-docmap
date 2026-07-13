import type { HomeView, KnownBlock, ModalView } from '@slack/types';

import { contributionsByUser, contributorsByDoc, labelForType } from './graphView.js';
import type { DocmapDoc, DocmapGraph } from './types.js';

/**
 * Pick a friendly display string for a doc title. LLMs sometimes return the
 * raw URL as `title` when the surrounding message text doesn't name the doc;
 * that reads as a wall of URL in Slack. Keep good titles as-is, humanize
 * URL-shaped ones.
 */
function displayDocTitle(doc: Pick<DocmapDoc, 'title' | 'url' | 'type'>): string {
  const raw = (doc.title ?? '').trim();
  const looksLikeUrl = /^https?:\/\//i.test(raw);
  if (raw && !looksLikeUrl) return raw;
  const url = raw || doc.url || '';
  if (!url) return labelForType(doc.type) || 'Untitled';
  try {
    const u = new URL(url);
    const segments = u.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1] || '';
    if (last) {
      if (u.hostname.includes('github.com') && segments.length >= 2) {
        return decodeURIComponent(segments.slice(0, 2).join('/'));
      }
      return decodeURIComponent(last);
    }
    const label = labelForType(doc.type);
    return label ? `${label} — ${u.hostname}` : u.hostname;
  } catch {
    return raw || url;
  }
}

export const FORM_BLOCK_IDS = {
  channels: 'docmap_channels_block',
  timeframe: 'docmap_timeframe_block',
  prefs: 'docmap_prefs_block',
  actions: 'docmap_actions_block',
} as const;

export const ACTION_IDS = {
  channelsSelect: 'target_channels_select',
  durationSelect: 'timeframe_select',
  skipToggle: 'skip_form_toggle',
  generateBtn: 'generate_map_btn',
} as const;

export const SKIP_FORM_VALUE = 'skip_form';

/** Timeframe presets offered in the form (value is the look-back window in days). */
export const DURATION_OPTIONS: { days: number; label: string }[] = [
  { days: 1, label: '1 day' },
  { days: 7, label: '7 days' },
  { days: 14, label: '14 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

const DEFAULT_DURATION_DAYS = 7;

function durationOption(days: number) {
  const match =
    DURATION_OPTIONS.find((o) => o.days === days) ??
    DURATION_OPTIONS.find((o) => o.days === DEFAULT_DURATION_DAYS) ??
    DURATION_OPTIONS[0];
  return { text: { type: 'plain_text' as const, text: match.label }, value: String(match.days) };
}

export interface ConfigFormOpts {
  /** Pre-selected timeframe (days). Falls back to the 7-day preset. */
  defaultDays?: number;
  /** Whether the "skip this form next time" toggle starts checked. */
  skipForm?: boolean;
  /** Public channel to pre-select (the channel /docmap was invoked in). */
  currentChannelId?: string;
}

export function buildConfigForm(opts: ConfigFormOpts = {}): KnownBlock[] {
  const { defaultDays = DEFAULT_DURATION_DAYS, skipForm = false, currentChannelId } = opts;

  const channelsElement: Record<string, unknown> = {
    type: 'multi_channels_select',
    action_id: ACTION_IDS.channelsSelect,
    placeholder: { type: 'plain_text', text: 'Pick one or more channels' },
  };
  // multi_channels_select only lists public channels (ids starting with "C"),
  // so only pre-select the current channel when it's a public one.
  if (currentChannelId && currentChannelId.startsWith('C')) {
    channelsElement.initial_channels = [currentChannelId];
  }

  const skipOption = {
    text: {
      type: 'plain_text' as const,
      text: 'Skip this form next time — analyze the current channel immediately',
    },
    value: SKIP_FORM_VALUE,
  };

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*DocMap* — choose channels and a timeframe, then generate an interactive document map.',
      },
    },
    {
      type: 'input',
      block_id: FORM_BLOCK_IDS.channels,
      label: { type: 'plain_text', text: 'Channels to analyze' },
      element: channelsElement as never,
    },
    {
      type: 'input',
      block_id: FORM_BLOCK_IDS.timeframe,
      label: { type: 'plain_text', text: 'Timeframe' },
      element: {
        type: 'static_select',
        action_id: ACTION_IDS.durationSelect,
        initial_option: durationOption(defaultDays),
        options: DURATION_OPTIONS.map((o) => ({
          text: { type: 'plain_text', text: o.label },
          value: String(o.days),
        })),
      },
    },
    {
      type: 'input',
      block_id: FORM_BLOCK_IDS.prefs,
      optional: true,
      label: { type: 'plain_text', text: 'Preferences' },
      element: {
        type: 'checkboxes',
        action_id: ACTION_IDS.skipToggle,
        options: [skipOption],
        ...(skipForm ? { initial_options: [skipOption] } : {}),
      },
    },
    {
      type: 'actions',
      block_id: FORM_BLOCK_IDS.actions,
      elements: [
        {
          type: 'button',
          action_id: ACTION_IDS.generateBtn,
          style: 'primary',
          text: { type: 'plain_text', text: 'Generate Interactive Map' },
        },
      ],
    },
  ];
}

// ---------- App Home (persistent per-user settings) ----------

export const HOME_BLOCK_IDS = {
  timeframe: 'home_timeframe_block',
  prefs: 'home_prefs_block',
  autoSave: 'home_autosave_block',
} as const;

export const HOME_ACTION_IDS = {
  durationSelect: 'home_timeframe_select',
  skipToggle: 'home_skip_toggle',
  autoSaveToggle: 'home_autosave_toggle',
  save: 'home_save_btn',
  analyze: 'home_analyze_btn',
} as const;

export const AUTOSAVE_VALUE = 'autosave_on';

/**
 * Save button lifecycle. `clean` = nothing pending (neutral). `dirty` = a
 * change was just made and auto-save is in flight or the user can hit Save
 * manually (green). `error` = save failed (red + ⚠️).
 */
export type SaveState = 'clean' | 'dirty' | 'error';

export interface HomeViewOpts {
  defaultDays?: number;
  skipForm?: boolean;
  /** When true (default), changes save immediately and the Save button is hidden. */
  autoSave?: boolean;
  /**
   * Save button state. Only meaningful when autoSave is off. Callers flip to
   * `dirty` as soon as a change is made, `clean` after a successful save, or
   * `error` if the DB write fails.
   */
  saveState?: SaveState;
}

export function buildHomeView(opts: HomeViewOpts = {}): HomeView {
  const {
    defaultDays = DEFAULT_DURATION_DAYS,
    skipForm = false,
    autoSave = true,
    saveState = 'clean',
  } = opts;

  const skipOption = {
    text: { type: 'plain_text' as const, text: 'Analyze the current channel immediately' },
    value: SKIP_FORM_VALUE,
  };

  const autoSaveOption = {
    text: {
      type: 'plain_text' as const,
      text: 'Save changes automatically (recommended)',
    },
    value: AUTOSAVE_VALUE,
  };

  // Slack button styles: `primary` renders green, `danger` renders red. There
  // is no "disabled" attribute — the only way to make a button un-clickable is
  // to not render it. So the clean state renders no button at all; users see
  // Save only when there's something to save (dirty) or something failed (error).
  const saveButton: KnownBlock | null =
    saveState === 'error'
      ? {
          type: 'actions',
          elements: [
            {
              type: 'button',
              action_id: HOME_ACTION_IDS.save,
              style: 'danger',
              text: { type: 'plain_text', text: '⚠️ Retry save', emoji: true },
            },
          ],
        }
      : saveState === 'dirty'
        ? {
            type: 'actions',
            elements: [
              {
                type: 'button',
                action_id: HOME_ACTION_IDS.save,
                style: 'primary',
                text: { type: 'plain_text', text: 'Save' },
              },
            ],
          }
        : null;

  const blocks: KnownBlock[] = [
    { type: 'header', text: { type: 'plain_text', text: '🗂️  DocMap settings', emoji: true } },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Choose the defaults used when you run `/docmap`. Changes save automatically.',
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Default timeframe*\nHow far back `/docmap` looks when analyzing a channel.',
      },
    },
    {
      type: 'actions',
      block_id: HOME_BLOCK_IDS.timeframe,
      elements: [
        {
          type: 'static_select',
          action_id: HOME_ACTION_IDS.durationSelect,
          initial_option: durationOption(defaultDays),
          options: DURATION_OPTIONS.map((o) => ({
            text: { type: 'plain_text', text: o.label },
            value: String(o.days),
          })),
        },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Skip the configuration form*\nWhen on, `/docmap` starts right away on the current channel instead of showing the form.',
      },
    },
    {
      type: 'actions',
      block_id: HOME_BLOCK_IDS.prefs,
      elements: [
        {
          type: 'checkboxes',
          action_id: HOME_ACTION_IDS.skipToggle,
          options: [skipOption],
          ...(skipForm ? { initial_options: [skipOption] } : {}),
        },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Auto-save*\nApply changes on this page as soon as you make them. When off, use the Save button below.',
      },
    },
    {
      type: 'actions',
      block_id: HOME_BLOCK_IDS.autoSave,
      elements: [
        {
          type: 'checkboxes',
          action_id: HOME_ACTION_IDS.autoSaveToggle,
          options: [autoSaveOption],
          ...(autoSave ? { initial_options: [autoSaveOption] } : {}),
        },
      ],
    },
  ];

  // Save button only appears when auto-save is off AND there's something to
  // click (dirty or error). Clean state → no button at all, so users can't
  // click it when there's nothing to save.
  if (!autoSave && saveButton) {
    blocks.push(saveButton);
  }

  const savedCaption =
    saveState === 'error'
      ? '⚠️ Could not save your settings. Click *Retry save* to try again.'
      : autoSave
        ? saveState === 'dirty'
          ? 'Saving…'
          : 'Changes save automatically.'
        : saveState === 'dirty'
          ? 'You have unsaved changes. Click *Save* to apply them.'
          : 'Auto-save is off. Changes appear here as you make them — click *Save* to apply.';
  blocks.push(
    { type: 'context', elements: [{ type: 'mrkdwn', text: savedCaption }] },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'Tip: run `/docmap settings` from any channel to jump back here.',
        },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Analyze channels now*\nOpens the full configuration form so you can pick channels and a timeframe — useful even when the skip-form option above is on.',
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          action_id: HOME_ACTION_IDS.analyze,
          style: 'primary',
          text: { type: 'plain_text', text: 'Analyze channels' },
        },
      ],
    },
  );

  return { type: 'home', blocks };
}

// ---------- Config form as a modal (opened from App Home) ----------

export const ANALYZE_MODAL_CALLBACK_ID = 'docmap_analyze_modal';

/**
 * A message posted in the DocMap bot's DM inviting the user to run an analysis.
 * Rendered on first-touch (any user message in the DM) so people don't stare at
 * an empty chat input wondering what to type — the button opens the same modal
 * used by App Home's "Analyze channels".
 */
export function buildDmWelcomeBlocks(): KnownBlock[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '👋 *Hi! I map documents from your Slack channels.*\nClick below to pick channels and a timeframe — I\'ll DM the results back to you.',
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          action_id: HOME_ACTION_IDS.analyze,
          style: 'primary',
          text: { type: 'plain_text', text: 'Analyze channels' },
        },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'You can also run `/docmap` from any channel, or open the *Home* tab above for defaults.',
        },
      ],
    },
  ];
}

export function buildAnalyzeModalView(opts: ConfigFormOpts = {}): ModalView {
  return {
    type: 'modal',
    callback_id: ANALYZE_MODAL_CALLBACK_ID,
    title: { type: 'plain_text', text: 'DocMap' },
    close: { type: 'plain_text', text: 'Cancel' },
    submit: { type: 'plain_text', text: 'Generate map' },
    // Reuse the same input blocks; strip the trailing button — the modal has
    // its own submit action.
    blocks: buildConfigForm(opts).filter((b) => b.block_id !== FORM_BLOCK_IDS.actions),
  };
}

export function buildLoadingBlocks(text: string): KnownBlock[] {
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text },
    },
  ];
}

export function buildShareBlocks(opts: {
  graph: DocmapGraph;
  url: string;
  sharerId?: string;
  note?: string;
}): KnownBlock[] {
  const { graph, url, sharerId, note } = opts;
  const attribution = sharerId ? `<@${sharerId}> shared` : 'Shared';
  const blocks: KnownBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🗂️ *${attribution} a DocMap* — ${graph.docs.length} docs, ${graph.users.length} contributors.`,
      },
    },
  ];
  if (note) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `> ${note.replace(/\n/g, '\n> ')}` },
    });
  }
  blocks.push(
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Open Document Map' },
          url,
          style: 'primary',
        },
      ],
    },
    { type: 'context', elements: [{ type: 'mrkdwn', text: url }] },
  );
  return blocks;
}

/** Escape the handful of characters that are special inside Slack mrkdwn. */
function escapeMrkdwn(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Slack messages allow up to 50 blocks. Reserving ~8 for headers/dividers/
// footers/switcher/buttons leaves us plenty for docs + users. One section per
// item — each gets the full 3000-char text budget.
const MAX_DOCS_LISTED = 30;
const MAX_USERS_LISTED = 20;
const MAX_INLINE_USERS = 4;
const MAX_DOCS_PER_USER = 10;

export type ReportView = 'doc' | 'user';

export const REPORT_VIEW_ACTION_ID = 'report_view_switch';

/** Encoded value of the view-switch button: "<view>:<graphId>". */
export function encodeReportViewValue(view: ReportView, graphId: string): string {
  return `${view}:${graphId}`;
}

export function decodeReportViewValue(value: string): { view: ReportView; graphId: string } | null {
  const idx = value.indexOf(':');
  if (idx <= 0) return null;
  const view = value.slice(0, idx);
  const graphId = value.slice(idx + 1);
  if ((view !== 'doc' && view !== 'user') || !graphId) return null;
  return { view, graphId };
}

function userList(users: import('./types.js').DocmapUser[]): string {
  if (users.length === 0) return '';
  const shown = users.slice(0, MAX_INLINE_USERS).map((u) => escapeMrkdwn(u.name));
  const extra = users.length > MAX_INLINE_USERS ? ` +${users.length - MAX_INLINE_USERS}` : '';
  return shown.join(', ') + extra;
}

/**
 * Render a single doc as one compact line — title link, type, channel, authors,
 * mentioners all inline separated by "·". Each doc becomes its own Section
 * block, so the whole entry lives on one row.
 */
function docBlockText(
  doc: DocmapGraph['docs'][number],
  contributors: import('./graphView.js').DocContributors | undefined,
): string {
  const label = labelForType(doc.type);
  const title = escapeMrkdwn(displayDocTitle(doc));
  const link = doc.url ? `<${doc.url}|${title}>` : title;

  const parts: string[] = [`*${link}*`];
  if (label) parts.push(label);
  if (doc.channel) parts.push(`#${escapeMrkdwn(doc.channel)}`);
  const authors = contributors?.authors ?? [];
  const mentioners = contributors?.mentioners ?? [];
  if (authors.length) parts.push(`by ${userList(authors)}`);
  if (mentioners.length) parts.push(`mentioned by ${userList(mentioners)}`);
  return parts.join(' · ');
}

/**
 * Render a single user's Section — bold header + one bulleted line per doc
 * (with type inline). Uses `\n• ` bullets inside a single Section text so the
 * whole user card is one block per user.
 */
function userBlockText(
  user: import('./types.js').DocmapUser,
  contributions: import('./graphView.js').UserContributions,
): string {
  const rows: string[] = [`*${escapeMrkdwn(user.name)}*`];

  const bulletFor = (
    d: import('./types.js').DocmapDoc,
    verb: 'authored' | 'mentioned',
  ) => {
    const label = labelForType(d.type);
    const link = `<${d.url}|${escapeMrkdwn(displayDocTitle(d))}>`;
    const meta = [label, d.channel ? `#${escapeMrkdwn(d.channel)}` : ''].filter(Boolean).join(' · ');
    return `• ${link}${meta ? ` — ${meta}` : ''} _(${verb})_`;
  };

  const items = [
    ...contributions.authored.map((d) => bulletFor(d, 'authored')),
    ...contributions.mentioned.map((d) => bulletFor(d, 'mentioned')),
  ];
  const shown = items.slice(0, MAX_DOCS_PER_USER);
  rows.push(...shown);
  if (items.length > shown.length) {
    rows.push(`_…and ${items.length - shown.length} more_`);
  }
  return rows.join('\n');
}

function docViewBlocks(graph: DocmapGraph): KnownBlock[] {
  const blocks: KnownBlock[] = [];
  if (graph.docs.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '_No documents were found in this timeframe._' },
    });
    return blocks;
  }
  const byDoc = contributorsByDoc(graph);
  const shown = graph.docs.slice(0, MAX_DOCS_LISTED);
  for (const doc of shown) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: docBlockText(doc, byDoc.get(doc.id)).slice(0, 2900) },
    });
  }
  if (graph.docs.length > shown.length) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `_…and ${graph.docs.length - shown.length} more docs (open the interactive map to browse all)._`,
        },
      ],
    });
  }
  return blocks;
}

function userViewBlocks(graph: DocmapGraph): KnownBlock[] {
  const blocks: KnownBlock[] = [];
  const byUser = contributionsByUser(graph);
  const ranked = [...graph.users]
    .map((u) => {
      const c = byUser.get(u.id) ?? { authored: [], mentioned: [] };
      return { user: u, count: c.authored.length + c.mentioned.length, contributions: c };
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  if (ranked.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '_No attributed contributors yet._' },
    });
    return blocks;
  }
  const shown = ranked.slice(0, MAX_USERS_LISTED);
  for (const { user, contributions } of shown) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: userBlockText(user, contributions).slice(0, 2900) },
    });
  }
  if (ranked.length > shown.length) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `_…and ${ranked.length - shown.length} more contributors._`,
        },
      ],
    });
  }
  return blocks;
}

/**
 * View switch as a `radio_buttons` group — a single element with two options
 * (Slack stacks them vertically; that's the only radio layout Block Kit offers).
 * One click on an option fires the action and re-renders the message.
 */
function viewSwitcher(view: ReportView, graphId: string): KnownBlock {
  const options = [
    {
      text: { type: 'plain_text' as const, text: 'Doc view' },
      value: encodeReportViewValue('doc', graphId),
    },
    {
      text: { type: 'plain_text' as const, text: 'User view' },
      value: encodeReportViewValue('user', graphId),
    },
  ];
  const initial = view === 'user' ? options[1] : options[0];
  return {
    type: 'actions',
    elements: [
      {
        type: 'radio_buttons',
        action_id: REPORT_VIEW_ACTION_ID,
        initial_option: initial,
        options,
      },
    ],
  };
}

function openMapButtonBlock(url: string): KnownBlock {
  return {
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Open interactive map' },
        url,
        style: 'primary',
      },
    ],
  };
}

export function buildResultBlocks(opts: {
  graph: DocmapGraph;
  graphId: string;
  url: string;
  channelCount: number;
  days: number;
  view?: ReportView;
}): KnownBlock[] {
  const { graph, graphId, url, channelCount, days, view = 'doc' } = opts;

  const header: KnownBlock = {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*✅ DocMap ready* — *${graph.docs.length}* docs and *${graph.users.length}* contributors across ${channelCount} channel(s) in the last ${days} day(s).`,
    },
  };

  const body = view === 'doc' ? docViewBlocks(graph) : userViewBlocks(graph);

  const blocks: KnownBlock[] = [
    header,
    // openMapButtonBlock(url),
    viewSwitcher(view, graphId),
    { type: 'divider' },
    ...body,
    { type: 'divider' },
    // Second Open-map button so long reports remain useful from the bottom.
    openMapButtonBlock(url),
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'The interactive map opens in your browser. Run `/docmap settings` to change defaults.',
        },
      ],
    },
  ];

  // Slack rejects messages with >50 blocks. If the body pushes us over, trim
  // the tail of the body list (keeping headers/switch/buttons intact).
  const MAX_BLOCKS = 50;
  if (blocks.length > MAX_BLOCKS) {
    const overflow = blocks.length - MAX_BLOCKS;
    // Trim from the end of the body (index range 3 .. 3 + body.length).
    const bodyEnd = 3 + body.length;
    blocks.splice(bodyEnd - overflow, overflow);
  }
  return blocks;
}
