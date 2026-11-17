// GitHub accounts of one computer's agent in one realm: the status answer → rows, the device login's
// start answer → what the person types and where, and what a fresh status read proves about a change whose answer was lost.
// Agent facts:
//   - accounts[] {key "<host>/<login>", host, login, active}; at most one is active. `linked` false: none is active.
//   - The active account's health: valid true (GitHub accepted it), valid false + needs_reauth (the token no longer works),
//     code github_token_forbidden / token_forbidden (GitHub refused it: SSO or a removed grant), reachable false (GitHub
//     could not be asked: unknown, never "broken").
//   - The first account ever linked becomes active whatever `activate` says.
// Proofs (C9): only a status read of the same computer and realm proves anything, and only "applied"; a read that does not
// show the change keeps it held (never "not applied": an account can be linked, switched or removed again meanwhile).
import { isRecord, stringOrEmpty as str } from '@core';

export interface GhAccount { key: string; host: string; login: string; active: boolean }
export type Health = 'ok' | 'invalid' | 'forbidden' | 'unchecked' | 'none';
export interface GhStatus {
  accounts: GhAccount[];
  /** False when the answer carried no account list (nothing can be proved from it). */
  known: boolean;
  /** Every row of the list read as an account: only such a list proves an account gone (a row dropped as unreadable may
   *  be that very account). */
  whole: boolean;
  health: Health;
  /** The active account can push to repositories (null: not said). */
  repoScope: boolean | null;
  /** The account the agent checked for `health` and `repoScope` (it reads the list apart, after the check, so a switch in
   *  between can make them another account's facts): null when it named none. */
  observed: { host: string; login: string } | null;
  computer: string;
  realm: string;
}


export function accountOf(v: unknown): GhAccount | null {
  if (!isRecord(v)) return null;
  const key = str(v.key), login = str(v.login), host = str(v.host);
  if (!key || !login) return null;
  return { key, login, host: host || 'github.com', active: v.active === true };
}

export function healthOf(raw: Record<string, unknown>, anyActive: boolean): Health {
  if (!anyActive && raw.linked !== true) return 'none';
  const code = str(raw.code).replace(/^github_/, '');
  if (raw.valid === false || raw.needs_reauth === true || code === 'token_invalid') return 'invalid';
  if (code === 'token_forbidden') return 'forbidden';
  if (raw.valid === true) return 'ok';
  return 'unchecked';
}

export function statusOf(raw: unknown, at: { computer: string; realm: string }): GhStatus {
  const r = isRecord(raw) ? raw : {};
  const known = Array.isArray(r.accounts);
  const rows: unknown[] = Array.isArray(r.accounts) ? r.accounts : [];
  const accounts = rows.map(accountOf).filter((a): a is GhAccount => a !== null);
  const anyActive = accounts.some((a) => a.active);
  return {
    accounts,
    known,
    whole: known && accounts.length === rows.length,
    health: healthOf(r, anyActive),
    repoScope: typeof r.has_repo_scope === 'boolean' ? r.has_repo_scope : null,
    observed: str(r.login) ? { host: str(r.host) || 'github.com', login: str(r.login) } : null,
    computer: at.computer,
    realm: at.realm,
  };
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
/** The checked facts of one row: only the account in use, and only when the check named that same account (GitHub logins
 *  and hosts compare without case). The account in use whose facts belong to another one is "not checked", and says nothing
 *  about pushing. Null for every other row. */
export function factsFor(s: GhStatus, a: GhAccount): { health: Exclude<Health, 'none'>; noPush: boolean } | null {
  if (!a.active || s.health === 'none') return null;
  const o = s.observed;
  if (!o || !same(o.host, a.host) || !same(o.login, a.login)) return { health: 'unchecked', noPush: false };
  return { health: s.health, noPush: s.repoScope === false };
}

/** What a device login's start says: the code the person types, where, and the poll's handle (the device code: secret). */
export interface DeviceStart { userCode: string; link: string | null; deviceCode: string; interval: number; expiresIn: number }

const CODE = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;
/** GitHub's device page, only as GitHub names it: https://github.com/login/device, nothing else (no other host, no code in
 *  the address). Anything else is not offered as a link: the person reads the code and goes to GitHub themselves. */
export function githubLink(uri: string): string | null {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.hostname !== 'github.com' || u.port || u.username || u.password || u.search || u.hash) return null;
  return u.pathname === '/login/device' ? 'https://github.com/login/device' : null;
}

const int = (v: unknown, lo: number, hi: number, dflt: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(hi, Math.max(lo, Math.floor(v))) : dflt;

export function deviceOf(raw: unknown): DeviceStart | null {
  if (!isRecord(raw)) return null;
  const userCode = str(raw.user_code).toUpperCase();
  const deviceCode = str(raw.device_code);
  if (!CODE.test(userCode) || !deviceCode || deviceCode.length > 256) return null;
  return {
    userCode,
    deviceCode,
    link: githubLink(str(raw.verification_uri)),
    interval: int(raw.interval, 1, 60, 5),
    expiresIn: int(raw.expires_in, 60, 900, 900),
  };
}

/** A device login's held identity: where it was sent and which accounts the realm had at the press. Never the device code. */
export interface LoginIdentity { computer: string; realm: string; host: string; before: string[] }
/** A switch or log-out's held identity. */
export interface AccountIdentity { computer: string; realm: string; key: string; login: string }

const statuses = (answers: readonly (readonly unknown[])[], computer: string, realm: string): GhStatus[] =>
  (answers[0] ?? []).filter((s): s is GhStatus => {
    const x = s as Partial<GhStatus> | null | undefined;
    return isRecord(s) && x?.computer === computer && x.realm === realm && x.known === true;
  });

/** Applied when a status of the same computer and realm lists an account of that host that was not there at the press. */
export function loginProved(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const i = identity as LoginIdentity;
  if (!isRecord(i) || !Array.isArray(i.before)) return undefined;
  for (const s of statuses(answers, i.computer, i.realm)) if (s.accounts.some((a) => a.host === i.host && !i.before.includes(a.key))) return 'applied';
  return undefined;
}

/** The account a lost login linked (the first new one of that host), for "Linked as …". */
export const newAccount = (s: GhStatus | undefined, before: readonly string[], host = 'github.com'): GhAccount | undefined =>
  s?.accounts.find((a) => a.host === host && !before.includes(a.key));

export function activeProved(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const i = identity as AccountIdentity;
  if (!isRecord(i)) return undefined;
  for (const s of statuses(answers, i.computer, i.realm)) if (s.accounts.some((a) => a.key === i.key && a.active)) return 'applied';
  return undefined;
}

export function logoutProved(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const i = identity as AccountIdentity;
  if (!isRecord(i)) return undefined;
  for (const s of statuses(answers, i.computer, i.realm)) if (s.whole && !s.accounts.some((a) => a.key === i.key)) return 'applied';
  return undefined;
}
