// live-fake-api.ts (tests only): a HoodyClient for live-mount tests that keeps the real client contract. It is the
// real adapter (src/term/app/cli-client.ts) over an in-memory "wire": every request is admitted by the mount's send
// policy exactly as on a real run (attempt-bound beforeWire), then answered here by method + path. Nothing leaves the
// process. A live mount is always wired (src/term/app/live-wiring.ts), so a fake that calls beforeWire() without its
// attempt sends nothing; use this instead.
import { createHash } from 'node:crypto';
import { cliHoodyClient, type WireRequest } from '../../src/term/app/cli-client';
import { canonicalJson } from '../../src/term/app/live-policy';
import type { HoodyClient, WireAttempt } from '../../src/term/host-types';

export const FAKE_API_ORIGIN = 'https://api.example.invalid';
export const FAKE_REALM_DOMAIN = 'realm.invalid';

export interface FakeHit { readonly method: string; readonly url: string; readonly path: string; readonly body: unknown; readonly auth: string | null }
/** An answer: a status (default 200) and a JSON body; undefined = 404 NOT_FOUND. */
export interface FakeAnswer { readonly status?: number; readonly body?: unknown; readonly hang?: boolean }
export type FakeAnswers = (method: string, path: string, body: unknown) => FakeAnswer | undefined;

export interface FakeApi {
  readonly client: HoodyClient;
  readonly hits: FakeHit[];
  /** Ends the client's session (signed out by another command). */
  end(): void;
}

export function fakeApiClient(o: { uid?: string; sid?: string; answers?: FakeAnswers; table?: Record<string, unknown>; proxyDomain?: string } = {}): FakeApi {
  const uid = o.uid ?? '64f0ada00000000000000001';
  const sid = o.sid ?? 'sid-1';
  const hits: FakeHit[] = [];
  const listeners = new Set<(e: { sid: string; reason: 'expired' | 'signed-out' | 'revoked' }) => void>();
  let current: string | null = sid;
  const json = (status: number, b: unknown): Response => new Response(b === undefined ? '' : JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  const wire = async (q: WireRequest): Promise<Response> => {
    const u = new URL(q.url);
    const text = q.body ? new TextDecoder().decode(q.body) : '';
    let body: unknown = null;
    if (text) { try { body = JSON.parse(text) as unknown; } catch { body = text; } }
    const p = u.pathname.replace(/^\/api\/v1/, '');
    hits.push({ method: q.method, url: q.url, path: p + u.search, body, auth: q.headers.authorization ?? null });
    const a = o.answers?.(q.method, p + u.search, body)
      ?? (o.table && Object.hasOwn(o.table, `${q.method} ${p}`) ? { body: structuredClone(o.table[`${q.method} ${p}`]) } : undefined);
    if (a?.hang) return new Promise<Response>((_, no) => { q.signal.addEventListener('abort', () => no(new Error('aborted')), { once: true }); });
    if (!a) return json(404, { statusCode: 404, error: 'NOT_FOUND', message: 'no' });
    return json(a.status ?? 200, a.body ?? { data: null });
  };
  const inner = cliHoodyClient({
    identity: { kind: 'account', uid, sid }, apiOrigin: FAKE_API_ORIGIN, realmApiDomain: FAKE_REALM_DOMAIN,
    ...(o.proxyDomain ? { proxyDomain: o.proxyDomain } : {}),
    currentSid: () => current, bearer: () => 'fake-bearer', wire,
  });
  const client: HoodyClient = {
    ...inner,
    request: inner.request.bind(inner), fetch: inner.fetch.bind(inner),
    onAuthEnded: (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
  };
  return { client, hits, end: () => { current = null; for (const l of [...listeners]) l({ sid, reason: 'signed-out' }); } };
}

/** The attempt the real adapter reports for a Hoody call (cli-client.ts request): for a hand-written fake client that
 *  passes it to beforeWire, so the wired mount admits its send. `base` is the realm host core addressed, if any. */
export function hoodyAttempt(method: string, path: string, body: unknown, base?: string): WireAttempt {
  const url = (base === undefined || base === '/api/v1' ? FAKE_API_ORIGIN + '/api/v1' : base) + path;
  const text = body === null || body === undefined ? null : canonicalJson(body);
  return Object.freeze({ method: method.toUpperCase(), url, bodyDigest: text === null ? null : createHash('sha256').update(new TextEncoder().encode(text)).digest('hex') });
}
