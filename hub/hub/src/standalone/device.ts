// device.ts: the standalone Hub's browser sign-in, over the API's device flow (POST /auth/device/code, then
// POST /auth/device/token until the person approves on their Hoody's own sign-in page).
//
// Contract:
//   - Sends only to the chosen Hoody's origin (origin.ts apiOrigin), never with a bearer or cookies. Password, OAuth,
//     2FA and the challenge all happen on that Hoody's page (/auth/device); this file never sees a password.
//   - PKCE: a fresh verifier per start; its S256 challenge goes with /device/code, the verifier with every poll.
//   - Polls at the interval the API names, 5 s more after `slow_down`; stops at `expired_token`, `access_denied`, the
//     code's own expiry, a stop() call, or the first 200. A 200 stores the session through shared.js storeAccessTokens
//     (the login page's own writer) and is reported once; the device code is spent by then, so nothing is retried.
//     It is stored only while storage still names the Hoody the flow started on (origin.ts apiOrigin, read fresh);
//     otherwise the flow ends 'no-api' and nothing is written. The same check runs again right after the write: if
//     another Hoody was named in between, the pair this flow wrote is removed (only while it is still the stored one)
//     and the flow ends 'no-api'. Like the login page, it supersedes a session another
//     tab stored on the same Hoody meanwhile (shared.js: the account sign-in wins).
//   - Every other answer (5xx, 429, no answer) is retried at the next tick until the code expires: a poll is a read
//     on the server's side until it answers 200.
//   - Codes and the verifier live in this closure only; nothing here is put in storage, the URL or a log.
//   - A page shown inside another page sends nothing: the flow ends 'framed' before its first request (a framing page
//     could otherwise start a sign-in that installs a session in the frame). A check that throws counts as framed.
import { apiOrigin } from '@core/origin';
import { dropOwnPair, type OwnPair } from '@core/ownPair';
import { isFramed } from '@core/session';

export type DeviceState =
  | { kind: 'starting' }
  | { kind: 'waiting'; userCode: string; verifyUrl: string; expiresAt: number }
  | { kind: 'signed-in' }
  | { kind: 'failed'; why: 'off' | 'expired' | 'denied' | 'network' | 'refused' | 'storage' | 'no-api' | 'framed' };

export interface DeviceDeps {
  fetch: typeof globalThis.fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  random: (n: number) => Uint8Array;
  sha256: (data: Uint8Array) => Promise<ArrayBuffer>;
  /** shared.js storeAccessTokens; true when the account keys are stored. */
  store: (data: Record<string, unknown>) => boolean;
  origin: () => string | null;
  /** True when this page is shown inside another page (session.ts isFramed). */
  framed: () => boolean;
  /** ownPair.ts dropOwnPair: removes the pair this flow stored, each key only while it still holds this flow's value. */
  dropOwn: (pair: OwnPair) => void;
}

const CLIENT_NAME = 'Hoody Hub file';
const REQUEST_TIMEOUT_MS = 15_000;
const SLOW_DOWN_MS = 5_000;
const USER_CODE_RE = /^[A-Z0-9]{2,8}-[A-Z0-9]{2,8}$/;
const DEVICE_CODE_RE = /^[0-9a-f]{64}$/;

const b64url = (b: Uint8Array): string => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

function storeTokens(data: Record<string, unknown>): boolean {
  const g = globalThis as { storeAccessTokens?: (p: unknown) => void; classifyStoredAuth?: () => string };
  if (typeof g.storeAccessTokens !== 'function' || typeof data.token !== 'string' || typeof data.refreshToken !== 'string') return false;
  g.storeAccessTokens(data);
  return typeof g.classifyStoredAuth === 'function' && g.classifyStoredAuth() === 'account';
}

const liveDeps = (): DeviceDeps => ({
  fetch: (...a) => globalThis.fetch(...a),
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  random: (n) => globalThis.crypto.getRandomValues(new Uint8Array(n)),
  sha256: (d) => globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(d)),
  store: storeTokens,
  origin: apiOrigin,
  framed: isFramed,
  dropOwn: dropOwnPair,
});

const framedNow = (deps: DeviceDeps): boolean => {
  try {
    return deps.framed();
  } catch {
    return true;
  }
};

type Answer = { status: number; body: unknown } | null;

async function post(deps: DeviceDeps, url: string, body: Record<string, unknown>): Promise<Answer> {
  const ctl = new AbortController();
  const timer = setTimeout(() => { ctl.abort(); }, REQUEST_TIMEOUT_MS);
  try {
    const res = await deps.fetch(url, {
      method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const dataOf = (b: unknown): Record<string, unknown> | null => {
  const d = b && typeof b === 'object' ? (b as { data?: unknown }).data : null;
  return d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, unknown>) : null;
};
/** The lifecycle code of a 400 poll answer (`data.error`, or a top-level `error`), or ''. */
const lifecycleOf = (b: unknown): string => {
  const d = dataOf(b);
  const e = d?.error ?? (b && typeof b === 'object' ? (b as { error?: unknown }).error : undefined);
  return typeof e === 'string' ? e : '';
};

/** The approval page on the chosen Hoody, with the code filled in. Built here from the origin the person chose, never
 *  taken from the answer: the server names its configured public origin, which may differ from the one typed. */
const verifyUrlOf = (origin: string, userCode: string): string => `${origin}/auth/device?code=${encodeURIComponent(userCode)}`;

export interface DeviceSignIn {
  /** Ends the polling; a state already reported stays. */
  stop(): void;
  readonly done: Promise<DeviceState>;
}

/** Starts one browser sign-in. `onState` is called for each state, the last one being signed-in or failed. */
export function startDeviceSignIn(onState: (s: DeviceState) => void, deps: DeviceDeps = liveDeps()): DeviceSignIn {
  let stopped = false;
  const report = (s: DeviceState): DeviceState => {
    if (!stopped || s.kind === 'signed-in') onState(s);
    return s;
  };
  const run = async (): Promise<DeviceState> => {
    report({ kind: 'starting' });
    if (framedNow(deps)) return report({ kind: 'failed', why: 'framed' });
    const origin = deps.origin();
    if (!origin) return report({ kind: 'failed', why: 'no-api' });
    const verifier = b64url(deps.random(32));
    const challenge = b64url(new Uint8Array(await deps.sha256(new TextEncoder().encode(verifier))));
    const start = await post(deps, `${origin}/api/v1/auth/device/code`, { client_name: CLIENT_NAME, code_challenge: challenge });
    if (stopped) return { kind: 'failed', why: 'refused' };
    if (!start) return report({ kind: 'failed', why: 'network' });
    if (start.status === 404 || start.status === 403 || start.status === 503) return report({ kind: 'failed', why: 'off' });
    const d = start.status === 200 ? dataOf(start.body) : null;
    const deviceCode = d?.device_code, userCode = d?.user_code;
    if (typeof deviceCode !== 'string' || !DEVICE_CODE_RE.test(deviceCode) || typeof userCode !== 'string' || !USER_CODE_RE.test(userCode)) {
      return report({ kind: 'failed', why: 'refused' });
    }
    const verifyUrl = verifyUrlOf(origin, userCode);
    const intervalS = typeof d?.interval === 'number' && d.interval >= 1 && d.interval <= 60 ? d.interval : 5;
    const lifeS = typeof d?.expires_in === 'number' && d.expires_in > 0 && d.expires_in <= 3600 ? d.expires_in : 900;
    const expiresAt = deps.now() + lifeS * 1000;
    let wait = intervalS * 1000;
    report({ kind: 'waiting', userCode, verifyUrl, expiresAt });
    for (;;) {
      await deps.sleep(wait);
      if (stopped) return { kind: 'failed', why: 'refused' };
      if (deps.now() >= expiresAt) return report({ kind: 'failed', why: 'expired' });
      const a = await post(deps, `${origin}/api/v1/auth/device/token`, { device_code: deviceCode, code_verifier: verifier });
      if (stopped && a?.status !== 200) return { kind: 'failed', why: 'refused' };
      if (!a) continue;
      if (a.status === 200) {
        // The pair belongs to `origin`. Another tab (or this page's Back) may have named another Hoody, or none, while
        // the poll was out; storing it then would hand this Hoody's bearer to the Hub of the other one.
        if (deps.origin() !== origin) return report({ kind: 'failed', why: 'no-api' });
        const tokens = dataOf(a.body);
        if (!tokens) return report({ kind: 'failed', why: 'storage' });
        if (!deps.store(tokens)) {
          // A partial write, and another Hoody named meanwhile: what this flow wrote is taken back as well.
          if (deps.origin() !== origin && typeof tokens.token === 'string' && typeof tokens.refreshToken === 'string') deps.dropOwn({ token: tokens.token, refreshToken: tokens.refreshToken });
          return report({ kind: 'failed', why: 'storage' });
        }
        // Another tab may have named another Hoody between that check and the write: then this pair sits beside the
        // other Hoody's record. Take back only what this flow wrote and end as if the check had refused it.
        if (deps.origin() !== origin) {
          if (typeof tokens.token === 'string' && typeof tokens.refreshToken === 'string') deps.dropOwn({ token: tokens.token, refreshToken: tokens.refreshToken });
          return report({ kind: 'failed', why: 'no-api' });
        }
        return report({ kind: 'signed-in' });
      }
      if (a.status === 400) {
        const code = lifecycleOf(a.body);
        if (code === 'authorization_pending') continue;
        if (code === 'slow_down') { wait += SLOW_DOWN_MS; continue; }
        if (code === 'access_denied') return report({ kind: 'failed', why: 'denied' });
        if (code === 'expired_token') return report({ kind: 'failed', why: 'expired' });
        return report({ kind: 'failed', why: 'refused' });
      }
      if (a.status === 404 || a.status === 403) return report({ kind: 'failed', why: 'off' });
      // 429, 5xx: the next tick asks again.
    }
  };
  const done = run();
  return {
    stop() { stopped = true; },
    done,
  };
}
