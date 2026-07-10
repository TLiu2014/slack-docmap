import * as Tabs from '@radix-ui/react-tabs';
import { useEffect, useState } from 'react';

import { fetchWorkspace, mockCheckout, saveWorkspaceSettings } from '../api';
import type { WorkspacePublic, WorkspaceTier } from '../types';

const TIER_BADGE: Record<WorkspaceTier, string> = {
  FREE: 'bg-ink-100 text-ink-700',
  PRO: 'bg-accent-soft text-accent',
  ENTERPRISE: 'bg-emerald-50 text-emerald-700',
};

export function AdminDashboard({ teamId }: { teamId: string }) {
  const [workspace, setWorkspace] = useState<WorkspacePublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchWorkspace(teamId)
      .then((ws) => {
        setWorkspace(ws);
        setError(null);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [teamId]);

  if (loading) {
    return (
      <div className="rounded-lg border border-ink-200 bg-white p-8 text-center text-ink-400">
        Loading workspace…
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center text-red-700">
        {error ?? 'Workspace unavailable'}
      </div>
    );
  }

  return (
    <Tabs.Root defaultValue="billing" className="flex flex-1 flex-col">
      <div className="mb-4 flex items-center justify-between">
        <Tabs.List className="inline-flex gap-1 self-start rounded-lg border border-ink-200 bg-white p-1">
          <Tabs.Trigger
            value="billing"
            className="rounded-md px-4 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-100 data-[state=active]:bg-accent data-[state=active]:text-white"
          >
            Billing
          </Tabs.Trigger>
          <Tabs.Trigger
            value="enterprise"
            className="rounded-md px-4 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-100 data-[state=active]:bg-accent data-[state=active]:text-white"
          >
            Enterprise Settings
          </Tabs.Trigger>
        </Tabs.List>
        <div className="flex items-center gap-2 text-xs text-ink-400">
          <span className="font-mono">{workspace.slackTeamId}</span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TIER_BADGE[workspace.tier]}`}>
            {workspace.tier}
          </span>
        </div>
      </div>

      <Tabs.Content value="billing" className="flex-1 outline-none">
        <BillingTab workspace={workspace} onChange={setWorkspace} />
      </Tabs.Content>
      <Tabs.Content value="enterprise" className="flex-1 outline-none">
        <EnterpriseTab workspace={workspace} onChange={setWorkspace} />
      </Tabs.Content>
    </Tabs.Root>
  );
}

function BillingTab({
  workspace,
  onChange,
}: {
  workspace: WorkspacePublic;
  onChange: (ws: WorkspacePublic) => void;
}) {
  const [busy, setBusy] = useState<WorkspaceTier | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const isFree = workspace.tier === 'FREE';
  const usageLabel = isFree
    ? `${workspace.usageCount} / ${workspace.freeLimit} maps used this month`
    : `${workspace.usageCount} maps generated this month`;

  const checkout = async (tier: WorkspaceTier) => {
    setBusy(tier);
    setErr(null);
    try {
      onChange(await mockCheckout(workspace.slackTeamId, tier));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <section className="lg:col-span-2 rounded-lg border border-ink-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">
          Current plan
        </h2>
        <div className="mt-3 flex items-baseline gap-3">
          <span className="text-2xl font-semibold text-ink-900">{workspace.tier}</span>
          <span className="text-sm text-ink-400">{usageLabel}</span>
        </div>

        {isFree && (
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-ink-100">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{
                width: `${Math.min(100, (workspace.usageCount / workspace.freeLimit) * 100)}%`,
              }}
            />
          </div>
        )}

        <p className="mt-4 text-sm leading-relaxed text-ink-700">
          {isFree
            ? 'Upgrade to Pro for unlimited maps and multi-channel support.'
            : 'Your workspace has unlimited maps and multi-channel support.'}
        </p>

        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={workspace.tier === 'PRO' || busy !== null}
            onClick={() => checkout('PRO')}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === 'PRO'
              ? 'Redirecting to Stripe…'
              : workspace.tier === 'PRO'
                ? 'Pro active'
                : 'Upgrade to Pro (Stripe)'}
          </button>

          {workspace.tier !== 'FREE' && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => checkout('FREE')}
              className="rounded-md border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 transition hover:bg-ink-100 disabled:opacity-40"
            >
              Downgrade to Free
            </button>
          )}
        </div>

        <div className="mt-6 border-t border-ink-100 pt-4">
          <p className="text-xs text-ink-400">
            Enterprise plans are sales-assisted. For local testing, simulate activation:
          </p>
          <button
            type="button"
            disabled={workspace.tier === 'ENTERPRISE' || busy !== null}
            onClick={() => checkout('ENTERPRISE')}
            className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-40"
          >
            {busy === 'ENTERPRISE' ? 'Activating…' : 'Simulate Enterprise activation'}
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-ink-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">Plans</h2>
        <ul className="mt-3 space-y-3 text-sm">
          <PlanRow name="Free" detail="5 maps / month, single channel" active={workspace.tier === 'FREE'} />
          <PlanRow name="Pro" detail="Unlimited maps, multi-channel" active={workspace.tier === 'PRO'} />
          <PlanRow
            name="Enterprise"
            detail="BYOK keys, unlimited, SSO"
            active={workspace.tier === 'ENTERPRISE'}
          />
        </ul>
      </section>
    </div>
  );
}

function PlanRow({ name, detail, active }: { name: string; detail: string; active: boolean }) {
  return (
    <li className="flex items-center justify-between rounded-md border border-ink-100 px-3 py-2">
      <div>
        <div className="font-medium text-ink-900">{name}</div>
        <div className="text-xs text-ink-400">{detail}</div>
      </div>
      {active && (
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
          Current
        </span>
      )}
    </li>
  );
}

function EnterpriseTab({
  workspace,
  onChange,
}: {
  workspace: WorkspacePublic;
  onChange: (ws: WorkspacePublic) => void;
}) {
  const locked = workspace.tier !== 'ENTERPRISE';
  const [openAIKey, setOpenAIKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [qwenKey, setQwenKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);

  if (locked) {
    return (
      <div className="rounded-lg border border-ink-200 bg-white p-8 text-center">
        <h2 className="text-lg font-semibold text-ink-900">Enterprise feature</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-400">
          Bring-your-own-key (BYOK) credentials are available on the Enterprise plan. Activate
          Enterprise from the Billing tab to manage your provider keys.
        </p>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const updated = await saveWorkspaceSettings({
        slackTeamId: workspace.slackTeamId,
        // Only send fields the admin actually typed into.
        ...(openAIKey ? { openAIKey } : {}),
        ...(anthropicKey ? { anthropicKey } : {}),
        ...(geminiKey ? { geminiKey } : {}),
        ...(qwenKey ? { qwenKey } : {}),
      });
      onChange(updated);
      setOpenAIKey('');
      setAnthropicKey('');
      setGeminiKey('');
      setQwenKey('');
      setStatus({ kind: 'ok', msg: 'Provider keys saved securely.' });
    } catch (err) {
      setStatus({ kind: 'error', msg: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="max-w-2xl rounded-lg border border-ink-200 bg-white p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">
        Bring your own keys
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-700">
        Keys are encrypted at rest and used in place of the platform&apos;s shared credentials when
        DocMap generates maps for your workspace. Leave a field blank to keep its current value.
      </p>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <KeyField
          label="OpenAI API key"
          placeholder="sk-…"
          value={openAIKey}
          onChange={setOpenAIKey}
          configured={workspace.hasOpenAIKey}
        />
        <KeyField
          label="Anthropic API key"
          placeholder="sk-ant-…"
          value={anthropicKey}
          onChange={setAnthropicKey}
          configured={workspace.hasAnthropicKey}
        />
        <KeyField
          label="Gemini API key"
          placeholder="AIza…"
          value={geminiKey}
          onChange={setGeminiKey}
          configured={workspace.hasGeminiKey}
        />
        <KeyField
          label="Qwen API key"
          placeholder="sk-…"
          value={qwenKey}
          onChange={setQwenKey}
          configured={workspace.hasQwenKey}
        />

        {status && (
          <p className={`text-sm ${status.kind === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>
            {status.msg}
          </p>
        )}

        <button
          type="submit"
          disabled={saving || (!openAIKey && !anthropicKey && !geminiKey && !qwenKey)}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save keys'}
        </button>
      </form>
    </section>
  );
}

function KeyField({
  label,
  placeholder,
  value,
  onChange,
  configured,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  configured: boolean;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink-900">{label}</span>
        <span
          className={`text-xs font-medium ${configured ? 'text-emerald-600' : 'text-ink-400'}`}
        >
          {configured ? '● Configured' : 'Not set'}
        </span>
      </div>
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={configured ? '•••••••••••• (saved)' : placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 font-mono text-sm text-ink-900 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
      />
    </label>
  );
}
