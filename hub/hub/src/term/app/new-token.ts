// `hoody hub --new-token`: before the mount, the CLI mints ONE access key with
// its stored login, the mount runs as a token session on it, and leaving revokes it. The CLI
// command hands in `send` (its HTTP client, base `/api/v1`), the masked 2FA prompt
// and the store area it opened.
//
//   - Only the process holding the store's flock mints or cleans up (`mode` 'rw'): a second instance
//     is refused with one sentence and sends nothing, and never revokes the open mount's key.
//   - The key VALUE stays in this process's memory (the returned `token`); the store keeps only the intent in
//     NEW_KEY_KEY (op id, full name, time; then the id and the accepted expiry), written and read back BEFORE the
//     request it guards, and never a value shaped like a credential.
//   - A start that finds an intent settles it first: a known id is revoked; no id = the key is looked up by its
//     FULL name and every match revoked. A failed lookup or revoke keeps the intent and mints nothing. An empty lookup
//     settles the intent only once its mint can no longer land (older than the request deadline plus a margin);
//     sooner, it is kept.
//   - Scope as the server ACCEPTED it: the answer must name exactly the one realm asked for, no permission leaf
//     beyond those asked for, and an expiry no later than the one asked for; anything else is revoked at once and the
//     mount does not start.
//   - Nothing the mint returns is printed. The only text is the one outcome line of leaving (LEAVE_LINES).

import { SECRET_SHAPED } from '../env/secret-shaped';
import type { PersistArea } from '../env/persist';
import type { StoreMode } from './live-records';

export const NEW_KEY_KEY = 'term.new_key';
/** The key's life. */
export const NEW_KEY_TTL_MS = 12 * 3_600_000;
/** An empty lookup settles an intent only this long after its mint's deadline (live-direct's BOOT_LAND_MARGIN_MS). */
export const NEW_KEY_LAND_MARGIN_MS = 60_000;
/** The answer's expiry may sit this far past the asked one (server clock, rounding) and still count as accepted. */
const EXPIRY_SLACK_MS = 60_000;

export const NEW_OP = /^[a-z0-9]{10}$/;
const TOKEN_ID = /^[0-9a-f]{24}$/;
const REALM_ID = /^[0-9a-f]{24}$/;
const HOST = /^[a-z0-9.-]{1,200}(?::[0-9]{1,5})?$/;
const ALIAS = /^hoody hub [a-z0-9-]{1,206} \d{4}-\d{2}-\d{2} [a-z0-9]{10}$/;
/** The API's token-create schema, `alias`: pattern and maxLength 254. Every name must pass it. */
export const ALIAS_API = /^[a-zA-Z0-9 _-]*$/;
export const ALIAS_API_MAX = 254;

export type NewKeyArea = Pick<PersistArea, 'readOnly' | 'failed' | 'get' | 'set' | 'del'>;
export interface NewKeyIntent { readonly op: string; readonly alias: string; readonly at: number; readonly id?: string; readonly expires_at?: string }

/** One request through the CLI's client. Resolves with any HTTP answer; rejects only when no answer came. */
export type NewKeySend = (method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown) => Promise<{ readonly status: number; readonly body: unknown }>;

const isRec = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** The key's full name: `hoody hub <host> <UTC date> <op id>` (the op id makes it unique). */
export function newKeyAlias(host: string, at: number, op: string): string | null {
  if (!HOST.test(host) || !NEW_OP.test(op) || !Number.isFinite(at)) return null;
  // The API refuses '.' and ':' in a key name (createTokenSchema alias pattern, ALIAS_API): the host goes in with '-'.
  const alias = `hoody hub ${host.replace(/[.:]/g, '-')} ${new Date(at).toISOString().slice(0, 10)} ${op}`;
  return ALIAS.test(alias) && ALIAS_API.test(alias) && alias.length <= ALIAS_API_MAX ? alias : null;
}

/** The permission tree of the Hub's route leaves (`core/routePerms.ts routeLeaves()`): 'a.b.c' → {a: {b: {c: true}}}. */
export function leavesTree(leaves: readonly string[]): Record<string, unknown> | null {
  const tree: Record<string, unknown> = {};
  for (const leaf of leaves) {
    const parts = leaf.split('.');
    if (parts.length < 2 || !parts.every((p) => /^[a-z_]{1,64}$/.test(p))) return null;
    let at = tree;
    for (const p of parts.slice(0, -1)) {
      const next = at[p];
      if (next === true) return null;
      if (!isRec(next)) at[p] = {};
      at = at[p] as Record<string, unknown>;
    }
    if (isRec(at[parts[parts.length - 1]!])) return null;
    at[parts[parts.length - 1]!] = true;
  }
  return tree;
}

/** Every leaf the tree grants (a value of true), as dotted paths. Anything that is neither true, false nor a tree is a
 *  grant of unknown width: returned as the path itself followed by '.*' so no asked set can contain it. */
function grantedLeaves(tree: unknown, at = ''): string[] {
  if (!isRec(tree)) return [at ? `${at}.*` : '*'];
  const out: string[] = [];
  for (const [k, v] of Object.entries(tree)) {
    const p = at ? `${at}.${k}` : k;
    if (v === true) out.push(p);
    else if (v === false || v === null) continue;
    else out.push(...grantedLeaves(v, p));
  }
  return out;
}

const validIntent = (v: unknown): v is NewKeyIntent => isRec(v)
  && Object.keys(v).every((k) => ['op', 'alias', 'at', 'id', 'expires_at'].includes(k))
  && typeof v.op === 'string' && NEW_OP.test(v.op) && typeof v.alias === 'string' && ALIAS.test(v.alias) && v.alias.endsWith(` ${v.op}`)
  && typeof v.at === 'number' && Number.isFinite(v.at) && v.at >= 0
  && (v.id === undefined || (typeof v.id === 'string' && TOKEN_ID.test(v.id)))
  && (v.expires_at === undefined || (typeof v.expires_at === 'string' && v.expires_at.length <= 40 && Number.isFinite(Date.parse(v.expires_at))));

/** The kept intent; null when there is none; 'unread' when the store cannot be read or holds another shape. */
export function readNewKeyIntent(area: Pick<PersistArea, 'get'>): NewKeyIntent | null | 'unread' {
  let text: string | null;
  try { text = area.get(NEW_KEY_KEY); } catch { return 'unread'; }
  if (text === null) return null;
  if (SECRET_SHAPED.test(text)) return 'unread';
  let v: unknown;
  try { v = JSON.parse(text); } catch { return 'unread'; }
  return validIntent(v) ? v : 'unread';
}

/** Writes the intent (fsynced by the store) and reads it back; false when it could not be kept. */
function writeIntent(area: NewKeyArea, intent: NewKeyIntent): boolean {
  if (area.readOnly !== null || area.failed() || !validIntent(intent)) return false;
  const text = JSON.stringify(intent);
  if (SECRET_SHAPED.test(text)) return false;
  try { area.set(NEW_KEY_KEY, text); } catch { return false; }
  let back: string | null;
  try { back = area.get(NEW_KEY_KEY); } catch { return false; }
  return back === text;
}

function dropIntent(area: NewKeyArea): boolean {
  try { area.del(NEW_KEY_KEY); } catch { return false; }
  try { return area.get(NEW_KEY_KEY) === null; } catch { return false; }
}

async function revokeId(send: NewKeySend, id: string): Promise<'gone' | 'failed'> {
  try {
    const r = await send('DELETE', `/auth/tokens/${id}`);
    return (r.status >= 200 && r.status < 300) || r.status === 404 ? 'gone' : 'failed';
  } catch { return 'failed'; }
}

export interface SettleDeps {
  readonly mode: StoreMode;
  readonly area: NewKeyArea;
  readonly send: NewKeySend;
  /** The client's per-request deadline. */
  readonly requestDeadlineMs: number;
  readonly now?: () => number;
}
/** settled: nothing (left) to revoke. kept: the intent stays (why), and no new mint goes out. */
export type SettleOutcome = { readonly k: 'settled'; readonly revoked: number } | { readonly k: 'kept'; readonly why: 'not-holder' | 'unread' | 'lookup' | 'revoke' | 'young' | 'write' };

/** Settles a kept intent (a crashed mount's key, or a mint whose answer was lost). Only the store lock's holder. */
export async function settleNewKey(d: SettleDeps): Promise<SettleOutcome> {
  if (d.mode !== 'rw') return { k: 'kept', why: 'not-holder' };
  const now = d.now ?? Date.now;
  const intent = readNewKeyIntent(d.area);
  if (intent === 'unread') return { k: 'kept', why: 'unread' };
  if (intent === null) return { k: 'settled', revoked: 0 };
  let revoked = 0;
  if (intent.id !== undefined) {
    if (await revokeId(d.send, intent.id) !== 'gone') return { k: 'kept', why: 'revoke' };
    revoked++;
  } else {
    const listStart = now();
    let list: unknown;
    try {
      const r = await d.send('GET', '/auth/tokens');
      if (r.status !== 200 || !isRec(r.body) || !Array.isArray(r.body.data) || r.body.truncated === true) return { k: 'kept', why: 'lookup' };
      list = r.body.data;
    } catch { return { k: 'kept', why: 'lookup' }; }
    const matches = (list as unknown[]).filter((t): t is { id: string } => isRec(t) && t.alias === intent.alias && typeof t.id === 'string' && TOKEN_ID.test(t.id));
    if (matches.length === 0 && listStart <= intent.at + d.requestDeadlineMs + NEW_KEY_LAND_MARGIN_MS) return { k: 'kept', why: 'young' };
    for (const t of matches) {
      if (await revokeId(d.send, t.id) !== 'gone') return { k: 'kept', why: 'revoke' };
      revoked++;
    }
  }
  return dropIntent(d.area) ? { k: 'settled', revoked } : { k: 'kept', why: 'write' };
}

export interface MintDeps extends SettleDeps {
  /** The CLI's credential kind: a stored login may mint; an access key may not (refused, nothing sent). */
  readonly credential: 'login' | 'key';
  /** The mount's realm: one realm id; 'all' is refused. */
  readonly realm: string;
  /** The API host as the name shows it (`api.example.com`). */
  readonly host: string;
  /** The Hub's route leaves (`routeLeaves()`). */
  readonly leaves: readonly string[];
  /** The CLI's own prompt, reading the 2FA code MASKED before the alternate screen; null = the person gave none. */
  readonly askCode: () => Promise<string | null>;
  readonly opId: () => string;
}

/** refused: nothing sent (why). failed: sent, no usable key; `kept` = the intent stays for the next start. */
export type MintOutcome =
  | { readonly k: 'ok'; readonly token: string; readonly id: string; readonly expires_at: string }
  | { readonly k: 'refused'; readonly why: 'key-credential' | 'all-realms' | 'not-holder' | 'unsettled' | 'scope' | 'store' }
  | { readonly k: 'failed'; readonly why: 'api' | 'otp' | 'unknown' | 'widened' | 'store'; readonly code?: string; readonly kept: boolean };

/** The API's refusal code: `error` of its envelope {statusCode, error, message, data?} (error-handler.ts), `code` only as a fallback. */
const codeOf = (body: unknown): string | undefined => {
  if (!isRec(body)) return undefined;
  const c = typeof body.error === 'string' ? body.error : typeof body.code === 'string' ? body.code : undefined;
  return c !== undefined && /^[A-Za-z_]{1,40}$/.test(c) ? c : undefined;
};

/** Mints the mount's key. A second call in one process is the caller's error; nothing here shares a key. */
export async function mintNewKey(d: MintDeps): Promise<MintOutcome> {
  if (d.credential !== 'login') return { k: 'refused', why: 'key-credential' };
  if (typeof d.realm !== 'string' || !REALM_ID.test(d.realm)) return { k: 'refused', why: 'all-realms' };
  if (d.mode !== 'rw') return { k: 'refused', why: 'not-holder' };
  const settled = await settleNewKey(d);
  if (settled.k !== 'settled') return { k: 'refused', why: 'unsettled' };
  const now = d.now ?? Date.now;
  const permissions = leavesTree(d.leaves);
  if (!permissions) return { k: 'refused', why: 'scope' };
  const asked = new Set(grantedLeaves(permissions));
  const at = now();
  const op = d.opId();
  const alias = typeof op === 'string' ? newKeyAlias(d.host, at, op) : null;
  if (!alias) return { k: 'refused', why: 'scope' };
  const intent: NewKeyIntent = { op, alias, at };
  if (!writeIntent(d.area, intent)) return { k: 'refused', why: 'store' };
  const expiresAt = new Date(at + NEW_KEY_TTL_MS).toISOString();
  const body: Record<string, unknown> = { alias, permissions, realm_ids: [d.realm], vault_access: true, event_access: true, expires_at: expiresAt };

  let r: { status: number; body: unknown };
  try {
    r = await d.send('POST', '/auth/tokens', body);
    if (r.status === 400 && codeOf(r.body) === 'OTP_REQUIRED') {
      const code = await d.askCode();
      if (!code) return dropIntent(d.area) ? { k: 'failed', why: 'otp', kept: false } : { k: 'failed', why: 'otp', kept: true };
      // The resend may go out minutes after the first POST (the person typed the code): age the intent from THIS send, so a
      // lost answer is not settled as "old" inside the resend's own deadline. The name keeps its minted date.
      // The first POST was a definite refusal, so nothing exists yet: a failed rewrite sends nothing.
      if (!writeIntent(d.area, { ...intent, at: now() })) return { k: 'failed', why: 'store', kept: !dropIntent(d.area) };
      r = await d.send('POST', '/auth/tokens', { ...body, otp_code: code });
    }
  } catch { return { k: 'failed', why: 'unknown', kept: true }; }

  if (r.status >= 500 || (r.status >= 200 && r.status < 300 && !isRec(r.body))) return { k: 'failed', why: 'unknown', kept: true };
  if (r.status < 200 || r.status >= 300) {
    // A definite refusal: nothing was made.
    const code = codeOf(r.body);
    const kept = !dropIntent(d.area);
    return code === undefined ? { k: 'failed', why: 'api', kept } : { k: 'failed', why: 'api', code, kept };
  }
  const data = isRec(r.body) && isRec(r.body.data) ? r.body.data : (r.body as Record<string, unknown>);
  const token = typeof data.token === 'string' ? data.token : '';
  const id = typeof data.id === 'string' && TOKEN_ID.test(data.id) ? data.id : '';
  // No id: the key cannot be revoked by id; the intent stays, the next start finds it by name.
  if (!id) return { k: 'failed', why: 'unknown', kept: true };
  const answeredExp = typeof data.expires_at === 'string' && Number.isFinite(Date.parse(data.expires_at)) ? data.expires_at : '';
  // The id goes on disk BEFORE anything else: a crash from here on leaves a key the next start revokes by id.
  if (!writeIntent(d.area, { ...intent, id, ...(answeredExp ? { expires_at: answeredExp } : {}) })) {
    const gone = await revokeId(d.send, id);
    return { k: 'failed', why: 'store', kept: gone !== 'gone' || !dropIntent(d.area) };
  }
  const realms = data.realm_ids;
  const scopeOk = token.startsWith('hdy_') && data.alias === alias
    && Array.isArray(realms) && realms.length === 1 && realms[0] === d.realm
    && Date.parse(answeredExp) <= Date.parse(expiresAt) + EXPIRY_SLACK_MS
    && grantedLeaves(data.permissions).every((l) => asked.has(l));
  if (!scopeOk) {
    const gone = await revokeId(d.send, id);
    return { k: 'failed', why: 'widened', kept: gone !== 'gone' || !dropIntent(d.area) };
  }
  return { k: 'ok', token, id, expires_at: answeredExp };
}

/** The one line printed after leaving. `removeWith` is the CLI command that removes a key. */
export const LEAVE_LINES = {
  removed: "The Hub's access key was removed.",
  kept: (expiresAt: string, alias: string, removeWith: string): string =>
    `The Hub's access key "${alias}" could not be removed; it expires at ${expiresAt}. Remove it with \`${removeWith}\`.`,
} as const;

/** Revokes the mount's key after the mount ended (one retry). Only the store lock's holder clears the intent; a
 *  failure keeps it for the next start. */
export async function revokeNewKeyOnLeave(d: SettleDeps & { readonly id: string; readonly alias: string; readonly expiresAt: string; readonly removeWith: string }): Promise<{ readonly ok: boolean; readonly line: string }> {
  let r = await revokeId(d.send, d.id);
  if (r !== 'gone') r = await revokeId(d.send, d.id);
  if (r === 'gone') {
    const kept = d.mode === 'rw' ? readNewKeyIntent(d.area) : null;
    if (kept !== null && kept !== 'unread' && kept.id === d.id) dropIntent(d.area);
    return { ok: true, line: LEAVE_LINES.removed };
  }
  return { ok: false, line: LEAVE_LINES.kept(d.expiresAt, d.alias, d.removeWith) };
}
