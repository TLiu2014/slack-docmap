import type { DocmapParams } from './types.js';

const DEFAULT_DAYS = 7;
const QUICK_MODE_TOKEN = 'quick';

export interface ParsedCommand extends DocmapParams {
  quickMode: boolean;
}

export function parseDocmapText(text: string | undefined, channelId: string): ParsedCommand {
  const tokens = (text ?? '').trim().split(/\s+/).filter(Boolean);

  let days = DEFAULT_DAYS;
  let quickMode = false;
  const channelIds: string[] = [];

  for (const token of tokens) {
    if (token.toLowerCase() === QUICK_MODE_TOKEN) {
      quickMode = true;
      continue;
    }
    const dayMatch = token.match(/^(\d+)d$/i);
    if (dayMatch) {
      days = clampDays(Number(dayMatch[1]));
      continue;
    }
    const channelMatch = token.match(/^<#(C[A-Z0-9]+)(?:\|[^>]+)?>$/);
    if (channelMatch) {
      channelIds.push(channelMatch[1]);
      continue;
    }
    if (/^C[A-Z0-9]{6,}$/.test(token)) {
      channelIds.push(token);
    }
  }

  if (channelIds.length === 0) channelIds.push(channelId);

  return { channelIds, days, afterDate: daysAgoIso(days), quickMode };
}

export function clampDays(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_DAYS;
  return Math.max(1, Math.min(365, n));
}

export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(afterDateIso: string): number {
  const after = new Date(`${afterDateIso}T00:00:00Z`).getTime();
  const now = Date.now();
  return Math.max(1, Math.round((now - after) / (1000 * 60 * 60 * 24)));
}
