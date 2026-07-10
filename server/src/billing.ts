import type { KnownBlock } from '@slack/types';

import {
  ensureCurrentPeriod,
  getOrCreateWorkspace,
  incrementUsage,
  type Workspace,
} from './db.js';

/** Maps allowed per calendar month on the FREE tier. */
export const FREE_TIER_MONTHLY_LIMIT = 5;

/**
 * Kill-switch for the FREE-tier quota. Set `DISABLE_BILLING_LIMIT=true` in the
 * environment to let every workspace generate unlimited maps (useful during
 * active development). Usage is still counted for analytics.
 */
function isLimitDisabled(): boolean {
  return /^(1|true|yes|on)$/i.test(process.env.DISABLE_BILLING_LIMIT ?? '');
}

export interface LimitCheckResult {
  /** Whether the command may proceed to generate a map. */
  allowed: boolean;
  /** The (possibly updated) workspace record. */
  workspace: Workspace;
  /** Ephemeral Block Kit blocks to show the user when blocked. */
  blocks?: KnownBlock[];
  /** Fallback text for the ephemeral message. */
  text?: string;
}

/**
 * Billing gate that runs at the start of `/docmap`.
 *
 * - Looks up (or creates) the workspace by Slack team id.
 * - Resets the monthly counter if we've rolled into a new month.
 * - FREE tier at/over the limit → blocked, returns an upgrade prompt.
 * - Otherwise increments usage by 1 and allows the command to proceed.
 *
 * PRO and ENTERPRISE tiers are unlimited (usage is still counted for analytics).
 */
export async function checkSubscriptionLimit(
  slackTeamId: string,
  uiBaseUrl: string,
): Promise<LimitCheckResult> {
  let workspace = await getOrCreateWorkspace(slackTeamId);
  workspace = await ensureCurrentPeriod(workspace);

  const isFree = workspace.tier === 'FREE';
  if (isFree && !isLimitDisabled() && workspace.usageCount >= FREE_TIER_MONTHLY_LIMIT) {
    return {
      allowed: false,
      workspace,
      blocks: buildUpgradeBlocks(uiBaseUrl),
      text: `⚠️ You have reached the limit of ${FREE_TIER_MONTHLY_LIMIT} free maps this month for this workspace.`,
    };
  }

  const usageCount = await incrementUsage(slackTeamId);
  return { allowed: true, workspace: { ...workspace, usageCount } };
}

export function buildUpgradeBlocks(uiBaseUrl: string): KnownBlock[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `⚠️ *You have reached the limit of ${FREE_TIER_MONTHLY_LIMIT} free maps this month for this workspace.*\n` +
          'Upgrade to Pro for unlimited maps and multi-channel support!',
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          style: 'primary',
          text: { type: 'plain_text', text: 'Upgrade on Stripe', emoji: true },
          url: `${uiBaseUrl}/billing`,
          action_id: 'upgrade_on_stripe_btn',
        },
      ],
    },
  ];
}
