// The viewer link: one pinned proxy alias per broadcast, never the computer's pipe host (that host names the
// project and computer ids, from which every other program's address can be built).
//
// Contract, in plain words:
//   - aliasBody(computer, name, until) is the alias create body: program pipe, instance 1, target the pipe's live
//     player for the name, allow_path_override false (the proxy then serves only that path and keeps its
//     parameters, which is the link's proof), no alias name (the service draws 48 random hex characters), and an
//     expiry `until` (renewBody: LINK_TTL_MS ahead) so a link left behind by a closed tab stops by itself within minutes.
//   - While the stream runs the link is extended every RENEW_EVERY_MS to LINK_TTL_MS ahead (renewBody). An update
//     takes about 30 s to reach the alias URL, so the margin (LINK_TTL_MS - RENEW_EVERY_MS) is minutes, not seconds.
//   - aliasListOf(raw, computer) reads the service's alias list of `computer` (kept on the list: a proof only reads
//     lists of the change's own computer, since core's read-back of a realm read refreshes every computer's): `rows`, the broadcast aliases shown (program pipe, pinned, a
//     broadcast target, nameOfTarget; a row without an id is dropped), and `ids`, the id of EVERY alias listed,
//     broadcast or not. null when the answer is not a list (then it proves nothing).
//   - createProves / removeProves are the C9 read-backs, on fresh lists of the change's computer only: one holding
//     a broadcast alias with this broadcast's name proves the create; one without it, read once the create's own
//     expiry has passed (CREATE_SETTLE_MS after it), proves it not applied (made or not, it no longer opens); a fresh list whose ids (all aliases, so an alias edited into another
//     shape still counts as there) no longer hold the alias id proves the remove. renewProves: a fresh list whose
//     row for the alias expires at or after the sent time proves the extension; a fresh list without the alias id
//     proves it was not applied (the alias is gone), and so does the row still listed with a readable earlier expiry once
//     the sent time plus CREATE_SETTLE_MS passed (the link has expired either way; the service keeps expired rows).
//     Anything else proves nothing (a row without a readable expiry, or an id whose row is no broadcast alias now).
import { stringOrEmpty as str } from '@core';
import { nameOfTarget, targetPathOf } from './name';

export const LINK_TTL_MS = 15 * 60 * 1000;
export const RENEW_EVERY_MS = 5 * 60 * 1000;
export const CREATE_SETTLE_MS = 60 * 1000;

export interface BroadcastAlias {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly enabled: boolean;
  readonly expiresAt: string;
  readonly createdAt: string;
}

export interface AliasBody {
  readonly computer_id: string;
  readonly program: 'pipe';
  readonly index: 1;
  readonly target_path: string;
  readonly allow_path_override: false;
  readonly expires_at: string;
}

export function aliasBody(computer: string, name: string, until: string): AliasBody {
  return { computer_id: computer, program: 'pipe', index: 1, target_path: targetPathOf(name), allow_path_override: false, expires_at: until };
}

export const renewBody = (now: number): { expires_at: string } => ({ expires_at: new Date(now + LINK_TTL_MS).toISOString() });

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** One alias row of the service, or null when it is not a broadcast alias. */
export function aliasOf(raw: unknown): BroadcastAlias | null {
  const a = obj(raw);
  const name = nameOfTarget(a?.target_path);
  if (!a || !name || a.program !== 'pipe' || a.allow_path_override !== false || !str(a.id)) return null;
  const url = str(a.url);
  return { id: str(a.id), name, url: /^https:\/\/[^/?#]+\/?$/.test(url) ? url : '', enabled: a.enabled !== false, expiresAt: str(a.expires_at), createdAt: str(a.created_at) };
}

export interface AliasList { readonly computer: string; readonly rows: readonly BroadcastAlias[]; readonly ids: readonly string[] }

export function aliasListOf(raw: unknown, computer: string): AliasList | null {
  const list = obj(obj(raw)?.data)?.aliases;
  if (!Array.isArray(list)) return null;
  return {
    computer,
    rows: list.map(aliasOf).filter((a): a is BroadcastAlias => a !== null),
    ids: list.map((a) => str(obj(a)?.id)).filter(Boolean),
  };
}

type Answers = readonly (readonly unknown[])[];
/** The fresh lists of `computer` among the answers (another computer's list never proves this one's change). */
const lists = (answers: Answers, computer: unknown): AliasList[] =>
  typeof computer !== 'string' || !computer ? [] : (answers[0] ?? []).filter((a): a is AliasList =>
    !!a && (a as AliasList).computer === computer && Array.isArray((a as AliasList).rows) && Array.isArray((a as AliasList).ids));
const rowsOf = (ls: AliasList[]): BroadcastAlias[] => ls.flatMap((l) => [...l.rows]);

export function createProves(identity: unknown, answers: Answers, now: number = Date.now()): 'applied' | 'not_applied' | undefined {
  const i = identity as { computer?: unknown; name?: unknown; until?: unknown } | null;
  const ls = lists(answers, i?.computer);
  if (typeof i?.name !== 'string' || !ls.length) return undefined;
  if (rowsOf(ls).some((a) => a.name === i.name)) return 'applied';
  const until = typeof i.until === 'string' ? Date.parse(i.until) : NaN;
  return Number.isFinite(until) && now >= until + CREATE_SETTLE_MS ? 'not_applied' : undefined;
}

export function removeProves(identity: unknown, answers: Answers): 'applied' | undefined {
  const i = identity as { computer?: unknown; alias?: unknown } | null;
  const ls = lists(answers, i?.computer);
  return typeof i?.alias === 'string' && i.alias && ls.length > 0 && !ls.some((l) => l.ids.includes(i.alias as string)) ? 'applied' : undefined;
}

export function renewProves(identity: unknown, answers: Answers, now = Date.now()): 'applied' | 'not_applied' | undefined {
  const i = identity as { computer?: unknown; alias?: unknown; until?: unknown } | null;
  const id = i?.alias, until = typeof i?.until === 'string' ? Date.parse(i.until) : NaN;
  const ls = lists(answers, i?.computer);
  if (typeof id !== 'string' || !id || !Number.isFinite(until) || !ls.length) return undefined;
  if (!ls.some((l) => l.ids.includes(id))) return 'not_applied';
  const at = rowsOf(ls).filter((a) => a.id === id).map((a) => Date.parse(a.expiresAt));
  if (at.some((t) => t >= until)) return 'applied';
  // Listed with a readable earlier expiry once the asked one (plus the settle window) passed: applied or not, the
  // link has expired, so nothing is left to wait for (the service keeps expired rows listed). A row without a readable
  // expiry, or an id whose row is no broadcast alias any more, proves nothing.
  return at.length > 0 && at.every((t) => t < until) && now >= until + CREATE_SETTLE_MS ? 'not_applied' : undefined;
}

/** An alias still listed but past its expiry no longer opens (the service disables it). */
export const expired = (a: BroadcastAlias, now: number): boolean => {
  const t = Date.parse(a.expiresAt);
  return Number.isFinite(t) && t <= now;
};

/** A link a viewer can open: an https URL, enabled, not past its expiry. */
export const usable = (a: BroadcastAlias, now: number): boolean => !!a.url && a.enabled && !expired(a, now);
