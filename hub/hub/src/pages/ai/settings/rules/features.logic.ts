// Rules & safety → Agent features and Where agents may work: the agent's answers read strictly (a wrong shape
// fails the read, never shows defaults or an empty list), what each feature row may offer, and what a fresh read
// proves about a sent change.
import { isRecord } from '@core';

/** The features the Hub shows, in no particular order (the agent's answer gives the display order). */
export const FEATURES = ['read_agents_md', 'read_claude_md', 'account_rotation', 'session_titles', 'hooks_agent_self_trust'] as const;
export type FeatureName = (typeof FEATURES)[number];
/** The ones the Hub may change. hooks_agent_self_trust relaxes a safety check: shown, never changed here. */
const WRITABLE: ReadonlySet<FeatureName> = new Set(['read_agents_md', 'read_claude_md', 'account_rotation', 'session_titles']);
/** Read per realm by a chat (its realm's own settings layer, then its folder's), while the route reads and writes the
 *  agent's flat home settings, the user layer of the Global realm only. */
const PER_REALM: ReadonlySet<FeatureName> = new Set(['read_agents_md', 'read_claude_md']);
/** Read from the agent's home settings alone (agent config feature()): a folder's own settings never change them. */
const HOME_ONLY: ReadonlySet<FeatureName> = new Set(['account_rotation', 'session_titles']);

export interface FeatureRow { name: FeatureName; value: boolean; writable: boolean }
export interface Where { allowed: string[]; deny: string[]; hidden: number }

const known = (n: unknown): n is FeatureName => typeof n === 'string' && (FEATURES as readonly string[]).includes(n);

/** GET/PATCH /settings/features → the known rows in the agent's order; null when the answer is not that shape. */
export function featuresOf(raw: unknown): FeatureRow[] | null {
  if (!isRecord(raw) || !Array.isArray(raw.features)) return null;
  const out: FeatureRow[] = [];
  for (const r of raw.features) {
    if (!isRecord(r) || typeof r.name !== 'string' || typeof r.value !== 'boolean' || typeof r.writable !== 'boolean') return null;
    if (!known(r.name)) continue;
    if (out.some((x) => x.name === r.name)) return null;
    out.push({ name: r.name, value: r.value, writable: r.writable && WRITABLE.has(r.name) });
  }
  return out;
}

const paths = (v: unknown): string[] | null => (Array.isArray(v) && v.every((p) => typeof p === 'string' && p.length > 0) ? [...(v as string[])] : null);

/** GET /settings/where-agents-work → both lists and the hidden count; null when the answer is not that shape. */
export function whereOf(raw: unknown): Where | null {
  if (!isRecord(raw)) return null;
  const allowed = paths(raw.allowed_directories);
  const deny = paths(raw.deny_paths);
  const hidden = raw.deny_paths_hidden;
  if (!allowed || !deny || typeof hidden !== 'number' || !Number.isInteger(hidden) || hidden < 0) return null;
  return { allowed, deny, hidden };
}

/** What a feature row offers in the realm shown: a switch, its value only, or (CLAUDE.md / AGENTS.md outside the
 *  Global realm) neither, since the agent's value is not the one that realm's chats use. */
export function featureView(f: FeatureRow, realm: string): 'switch' | 'value' | 'perRealm' {
  if (PER_REALM.has(f.name) && realm !== 'global') return 'perRealm';
  return f.writable ? 'switch' : 'value';
}

/** Whether a folder's own settings may still set this feature for the chats in that folder. */
export const folderMayOverride = (f: FeatureRow): boolean => !HOME_ONLY.has(f.name);

/** A sent change {computer, name, value} against a fresh read of the features on its computer: only the value sent
 *  proves anything (applied). The other value proves nothing: the agent reads the settings file without the lock its
 *  write waits on (config.SetHubFeatures), so a change whose answer was lost may still save after that read. */
export function featureProved(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const i = isRecord(identity) ? identity : {};
  if (!known(i.name) || typeof i.value !== 'boolean') return undefined;
  for (const rows of answers[0] ?? []) {
    const r = Array.isArray(rows) ? (rows as FeatureRow[]).find((x) => x.name === i.name) : undefined;
    if (r) return r.value === i.value ? 'applied' : undefined;
  }
  return undefined;
}
