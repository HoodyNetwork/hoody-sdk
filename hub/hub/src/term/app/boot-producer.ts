// The terminal's boot-token producer: what
// /auth/hub-boot-token.js is on the web, for core/boot-token.ts's `HubBootToken.ensure(uid, {mint})` contract.
// The live boot installs it; nothing here sends except through the `mint` core hands it and the deps it is given.
//
//   - The token VALUE lives in this process's memory only (never stored, logged or shown; no PERSISTED row in
//     env/persist.ts takes it): reused within the
//     mount while it has more than REUSE_SKEW_MS left (half the asked life, when that is shorter), else a new one is
//     minted. A new mount mints anew.
//   - Its ID and full name (never the value) are kept in the store's housekeeping key (boot-keys.ts BOOT_KEYS_KEY,
//     store.json, a housekeeping key outside PERSISTED; never through the registry seam), at most BOOT_KEYS_MAX. A token stays until `hoody
//     logout` revokes them all, or a start that finds the list full revokes the oldest (revokeBootKeys); an expired one
//     takes no room and is dropped unasked (at a start, or by the next mint's write).
//     So an agent signed in from the terminal keeps its login after the Hub closes, as on the web.
//   - One mint = one record (live-direct.ts, `term.direct.boot-token-mint:<op>`, meta: the full name), written and read
//     back before the POST. A definite refusal frees it. A 2xx with an id frees it only after the id is in the kept
//     list (else the token is not handed out: the record stays and the recovery revokes it by name). Anything unknown
//     keeps it; while any mint record is held no new mint goes out (the recovery settles it first).
//   - The body is the web's (hub-boot-token.js mintOnce): the server's full_access tree with the financial category
//     cut to the three read-only leaves and create_tokens + vault on, both access flags, all realms, a unique name
//     ('hoody-agent auto term <op>'), the days the Account page saved (1 to 365; 90 when none is kept). core's mint
//     (boot-token.ts bootBody) checks it again before sending.
//   - One ask per account: a second ensure while one runs rides it. Only a press-started ask brings a mint; without one
//     only the memory token is answered. Account changes need no fence: a mount runs as one account.
import { outcomeOf } from '../../core/api';
import { heldAttempts } from '../../core/attempts';
import { tokenMintRoute } from '../../core/boot-token';
import { persistRule, type PersistArea } from '../env/persist';
import { BOOT_KEYS_MAX, TOKEN_ID, readBootKeys, writeBootKeys, type BootKey, type BootKeysArea } from './boot-keys';
import { BOOT_MINT_LOCK_PREFIX, BOOT_OP, bootAliasOf, holdDirectChange, noteMintHold, settleDirectChange } from './live-direct';

const DAY = 86_400_000;
export const BOOT_TTL_DAYS = 90;
/** Where the Account page keeps the agent sign-in days (the web's hub-boot-token.js reads the same key). */
export const BOOT_TTL_DAYS_KEY = 'hub_boot_token_ttl_days';
/** A memory token with less than this left is not reused (the web's REMINT_SKEW), or with less than half the life
 *  it was asked for, when that is shorter: a token asked for a few days is still reused within the mount. */
export const REUSE_SKEW_MS = 14 * DAY;
/** The expiry assumed when the mint's answer names none (the web's conservative value), never past the asked one. */
const FALLBACK_LIFE_MS = 21 * DAY;

/** The days a mint asks for: the Account page's value when the store keeps one of the kept shape (persist.ts), else
 *  BOOT_TTL_DAYS. */
export function bootTtlDays(area: Pick<PersistArea, 'get'>): number {
  let text: string | null;
  try { text = area.get(BOOT_TTL_DAYS_KEY); } catch { return BOOT_TTL_DAYS; }
  const check = persistRule(BOOT_TTL_DAYS_KEY)?.check;
  return text !== null && check && check(text) ? Number(text) : BOOT_TTL_DAYS;
}

const isRec = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** The boot token's permission tree from GET /auth/tokens/templates (hub-boot-token.js bootPermsTree), or null. */
export function bootPermsTree(answer: unknown): Record<string, unknown> | null {
  const rows = isRec(answer) && Array.isArray(answer.data) ? answer.data : Array.isArray(answer) ? answer : null;
  const row = rows?.find((r: unknown) => isRec(r) && r.name === 'full_access') as Record<string, unknown> | undefined;
  if (!row || !isRec(row.permissions)) return null;
  let perms: Record<string, unknown>;
  try { perms = JSON.parse(JSON.stringify(row.permissions)) as Record<string, unknown>; } catch { return null; }
  if (!isRec(perms)) return null;
  // An allowlist, never a cut of known-bad leaves: a money leaf added to the template later never reaches this token.
  perms.financial = { wallet: { read: true }, billing: { read: true }, server_rental: { view_marketplace: true } };
  const res = isRec(perms.resources) ? perms.resources : {};
  perms.resources = { ...res, create_tokens: true, vault: true };
  return perms;
}

type MintFn = (method: unknown, path: unknown, body: unknown, opts?: { owner?: unknown; bind?: object } | null) => Promise<unknown>;
export interface BootAnswer { readonly token: string; readonly state: 'ok' }
export interface TermBootProducer {
  ensure(uid: string, o?: { mint?: MintFn }): Promise<BootAnswer>;
  /** The memory tokens dropped (the mount ends). */
  forget(): void;
}
export interface ProducerDeps {
  readonly area: BootKeysArea;
  /** GET /auth/tokens/templates (its answer as sent). */
  readonly templates: () => Promise<unknown>;
  readonly now?: () => number;
  /** A fresh op id (BOOT_OP); default: 10 random characters. */
  readonly opId?: () => string;
  /** The wire's bind for this mint's own record: its key goes on the mint call; drop() once the call is over. */
  readonly bindMint?: (record: unknown) => { readonly key: object; drop(): void };
}

const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const randomOp = (): string => { const b = new Uint8Array(10); crypto.getRandomValues(b); return [...b].map((x) => CHARS[x % CHARS.length]).join(''); };
const failed = (): { token: ''; state: 'failed' } => ({ token: '', state: 'failed' });

export function termBootProducer(deps: ProducerDeps): TermBootProducer {
  const now = deps.now ?? Date.now;
  const memory = new Map<string, { token: string; exp: number; skew: number }>();
  const asks = new Map<string, Promise<BootAnswer>>();
  // forget() against a mint still out: each forget starts a new generation; a mint of an older one fails for every
  // caller and never writes its token to memory (its id is in the kept list, so the next start or logout revokes it).
  let gen = 0;

  async function mintFor(uid: string, mint: MintFn): Promise<BootAnswer> {
    // An unsettled mint (this mount's or a crashed one's) blocks the next until the recovery settles it.
    if (heldAttempts().some((h) => h.lock.startsWith(BOOT_MINT_LOCK_PREFIX))) throw failed();
    const mine = gen;
    const area = deps.area;
    if (area.readOnly !== null || area.failed()) throw failed();
    // A kept entry past its expiry names a token that has ended (the entry holds the later of the answered and the asked
    // expiry): it takes no room, and the next write drops it unasked, as a start's revokeBootKeys does.
    const unexpired = (k: BootKey): boolean => Date.parse(k.expires_at) > now();
    const kept = readBootKeys(area);
    if (kept === null || kept.filter(unexpired).length >= BOOT_KEYS_MAX) throw failed();
    let perms: Record<string, unknown> | null;
    try { perms = bootPermsTree(await deps.templates()); } catch { perms = null; }
    if (!perms) throw failed();
    const op = (deps.opId ?? randomOp)();
    if (typeof op !== 'string' || !BOOT_OP.test(op)) throw failed();
    const held = await holdDirectChange('boot-token-mint', tokenMintRoute as never, { op });
    if (!held.ok) throw failed();
    noteMintHold(held.hold);
    // The mint's record goes to its own call only (the wire matches it by this key, never by route).
    const bound = deps.bindMint ? deps.bindMint(held.record) : null;
    const alias = bootAliasOf(op);
    const life = bootTtlDays(area) * DAY;
    const body = { alias, permissions: perms, vault_access: true, event_access: true, allow_no_realm: true, expires_at: new Date(now() + life).toISOString() };
    let res: unknown;
    try {
      res = await mint('POST', '/auth/tokens', body, { owner: uid, ...(bound ? { bind: bound.key } : {}) });
    } catch (e) {
      settleDirectChange(held.hold, outcomeOf(e, true) === 'pending' ? 'unknown' : 'definite', now());
      throw failed();
    } finally { bound?.drop(); }
    const d = isRec(res) && isRec(res.data) ? res.data : isRec(res) ? res : {};
    const token = typeof d.token === 'string' ? d.token : '', id = typeof d.id === 'string' ? d.id : '';
    const serverExp = typeof d.expires_at === 'string' && Number.isFinite(Date.parse(d.expires_at)) ? d.expires_at : '';
    // Memory reuse takes the short fallback when the answer names no expiry; the kept entry (revoke bookkeeping) takes
    // the LATER of the answer's and the requested expiry, so a live token never drops out of the list as "expired":
    // a revoke of a token that did end early answers gone.
    const expiresAt = serverExp || new Date(now() + FALLBACK_LIFE_MS).toISOString();
    const keptExp = serverExp && Date.parse(serverExp) >= Date.parse(body.expires_at) ? serverExp : body.expires_at;
    // A 2xx is kept only once its id is on disk; otherwise the token is not handed out and the record stays for the
    // recovery (it finds the token by name and revokes it).
    const latest = token && TOKEN_ID.test(id) ? readBootKeys(area) : null;
    const entry: BootKey = { id, alias, expires_at: keptExp, at: now() };
    const room = latest === null ? null : latest.filter((k) => k.id !== id && unexpired(k));
    if (room === null || room.length >= BOOT_KEYS_MAX || !writeBootKeys(area, [...room, entry])) {
      settleDirectChange(held.hold, 'unknown', now());
      throw failed();
    }
    settleDirectChange(held.hold, 'definite');
    if (mine !== gen) throw failed();
    memory.set(uid, { token, exp: serverExp ? Date.parse(expiresAt) : Math.min(Date.parse(expiresAt), Date.parse(body.expires_at)), skew: Math.min(REUSE_SKEW_MS, life / 2) });
    return { token, state: 'ok' };
  }

  return {
    ensure(uid, o) {
      if (typeof uid !== 'string' || !uid) return Promise.reject(failed());
      const m = memory.get(uid);
      if (m && m.exp - now() > m.skew) return Promise.resolve({ token: m.token, state: 'ok' });
      const running = asks.get(uid);
      if (running) return running;
      const mint = o && typeof o.mint === 'function' ? o.mint : null;
      if (!mint) return Promise.reject(failed());
      const p = mintFor(uid, mint).finally(() => { if (asks.get(uid) === p) asks.delete(uid); });
      asks.set(uid, p);
      return p;
    },
    forget() { gen++; memory.clear(); },
  };
}
