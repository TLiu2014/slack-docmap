import { PrismaClient } from '@prisma/client';
import type { UserPref, Workspace } from '@prisma/client';

/**
 * Single shared PrismaClient. Reused across hot reloads in dev (tsx watch) by
 * stashing it on globalThis to avoid exhausting the connection pool.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export type { UserPref, Workspace };

export type WorkspaceTier = 'FREE' | 'PRO' | 'ENTERPRISE';
export const WORKSPACE_TIERS: readonly WorkspaceTier[] = ['FREE', 'PRO', 'ENTERPRISE'];

export function isWorkspaceTier(value: string): value is WorkspaceTier {
  return (WORKSPACE_TIERS as readonly string[]).includes(value);
}

/** Fetch a workspace by Slack team id, creating a default FREE row on first sight. */
export async function getOrCreateWorkspace(slackTeamId: string): Promise<Workspace> {
  return prisma.workspace.upsert({
    where: { slackTeamId },
    update: {},
    create: { slackTeamId },
  });
}

/**
 * Roll the usage window forward if we've crossed into a new calendar month.
 * Keeps the "5 free maps this month" quota honest without a cron job.
 */
export async function ensureCurrentPeriod(workspace: Workspace): Promise<Workspace> {
  const now = new Date();
  const start = workspace.usagePeriodStart;
  const sameMonth =
    start.getUTCFullYear() === now.getUTCFullYear() &&
    start.getUTCMonth() === now.getUTCMonth();

  if (sameMonth) return workspace;

  return prisma.workspace.update({
    where: { slackTeamId: workspace.slackTeamId },
    data: { usageCount: 0, usagePeriodStart: now },
  });
}

/** Atomically increment a workspace's usage counter and return the new total. */
export async function incrementUsage(slackTeamId: string): Promise<number> {
  const updated = await prisma.workspace.update({
    where: { slackTeamId },
    data: { usageCount: { increment: 1 } },
    select: { usageCount: true },
  });
  return updated.usageCount;
}

/** Fetch a user's saved /docmap preferences, or null if they've never set any. */
export async function getUserPref(
  slackTeamId: string,
  slackUserId: string,
): Promise<UserPref | null> {
  return prisma.userPref.findUnique({
    where: { slackTeamId_slackUserId: { slackTeamId, slackUserId } },
  });
}

/** Create or update a user's /docmap preferences. */
export async function saveUserPref(
  slackTeamId: string,
  slackUserId: string,
  data: { defaultDays?: number; skipForm?: boolean; autoSave?: boolean },
): Promise<UserPref> {
  return prisma.userPref.upsert({
    where: { slackTeamId_slackUserId: { slackTeamId, slackUserId } },
    update: data,
    create: {
      slackTeamId,
      slackUserId,
      defaultDays: data.defaultDays ?? 7,
      skipForm: data.skipForm ?? false,
      autoSave: data.autoSave ?? true,
    },
  });
}
