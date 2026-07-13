// In-memory replacement for the Prisma-backed data layer. The deployed
// hackathon instance runs without a database — user prefs live in memory
// and reset on container restart. Workspace/monetization helpers are
// exported as no-ops so the (currently disabled) billing code paths in
// index.ts still typecheck.

export interface UserPref {
  slackTeamId: string;
  slackUserId: string;
  defaultDays: number;
  skipForm: boolean;
  autoSave: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Workspace {
  slackTeamId: string;
  tier: WorkspaceTier;
  usageCount: number;
  usagePeriodStart: Date;
  customOpenAIKey: string | null;
  customAnthropicKey: string | null;
  customGeminiKey: string | null;
  customQwenKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type WorkspaceTier = 'FREE' | 'PRO' | 'ENTERPRISE';
export const WORKSPACE_TIERS: readonly WorkspaceTier[] = ['FREE', 'PRO', 'ENTERPRISE'];

export function isWorkspaceTier(value: string): value is WorkspaceTier {
  return (WORKSPACE_TIERS as readonly string[]).includes(value);
}

// ---------- UserPref (in-memory) ----------

const prefKey = (teamId: string, userId: string) => `${teamId}:${userId}`;
const userPrefs = new Map<string, UserPref>();

export async function getUserPref(
  slackTeamId: string,
  slackUserId: string,
): Promise<UserPref | null> {
  return userPrefs.get(prefKey(slackTeamId, slackUserId)) ?? null;
}

export async function saveUserPref(
  slackTeamId: string,
  slackUserId: string,
  data: { defaultDays?: number; skipForm?: boolean; autoSave?: boolean },
): Promise<UserPref> {
  const key = prefKey(slackTeamId, slackUserId);
  const now = new Date();
  const existing = userPrefs.get(key);
  const next: UserPref = existing
    ? {
        ...existing,
        defaultDays: data.defaultDays ?? existing.defaultDays,
        skipForm: data.skipForm ?? existing.skipForm,
        autoSave: data.autoSave ?? existing.autoSave,
        updatedAt: now,
      }
    : {
        slackTeamId,
        slackUserId,
        defaultDays: data.defaultDays ?? 7,
        skipForm: data.skipForm ?? false,
        autoSave: data.autoSave ?? true,
        createdAt: now,
        updatedAt: now,
      };
  userPrefs.set(key, next);
  return next;
}

// ---------- Workspace / monetization (no-op stubs) ----------
//
// The monetization flow is disabled in index.ts (see MONETIZATION-DISABLED
// comments there). These stubs exist so imports still resolve; every call
// returns a synthetic FREE-tier workspace with a zeroed usage window.

export async function getOrCreateWorkspace(slackTeamId: string): Promise<Workspace> {
  const now = new Date();
  return {
    slackTeamId,
    tier: 'FREE',
    usageCount: 0,
    usagePeriodStart: now,
    customOpenAIKey: null,
    customAnthropicKey: null,
    customGeminiKey: null,
    customQwenKey: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function ensureCurrentPeriod(workspace: Workspace): Promise<Workspace> {
  return workspace;
}

export async function incrementUsage(_slackTeamId: string): Promise<number> {
  return 0;
}
