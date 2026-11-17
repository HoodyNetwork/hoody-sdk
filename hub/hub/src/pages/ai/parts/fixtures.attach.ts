// The agent's attachment-lease routes (core/agent/attach.ts) for the AI tab's fixture world, answered as the
// agent answers them: POST acquire -> 201 {lease_id, expires_at} for a session the agent
// has, 404 not_found for any other; PATCH renew -> 200 with the new expiry for a lease this session holds, 410
// attachment_expired once it expired (the expired lease is kept, never revived, until it is released), 404 not_found for a
// lease it never issued or already released; DELETE release -> 200 {status: "ok", released: true}, then 404 not_found.
// Lifetimes follow attachmentTTL: ttl_ms <= 0 or absent -> 15 minutes, capped at 60. Leases live in the rules' own memory;
// the agent's expiry sweep is not modelled.
import { agent, answers, reply, type FixtureRequest } from '@core';

/** The agent's bounds (default and longest lease time). */
export const LEASE_DEFAULT_MS = 15 * 60_000;
export const LEASE_MAX_MS = 60 * 60_000;
/** The agent's attachmentTTL: the requested ttl_ms, the default when absent or not positive, never above the cap. */
export function leaseTtl(body: unknown): number {
  const ms = body && typeof body === 'object' ? (body as { ttl_ms?: unknown }).ttl_ms : undefined;
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return LEASE_DEFAULT_MS;
  return Math.min(Math.trunc(ms), LEASE_MAX_MS);
}

/** `known`: the session ids the fixture agent has (anything with has()). `now`: the clock leases expire by. */
export function attachRules(known: () => { has(sid: string): boolean }, now: () => number = Date.now) {
  const leases = new Map<string, { sid: string; expiresAt: number }>();
  let n = 0;
  const parts = (r: FixtureRequest) => {
    const rest = r.path.split('/sessions/')[1] ?? '';
    const [sid = '', , lease = ''] = rest.split('/');
    return { sid: decodeURIComponent(sid), lease: decodeURIComponent(lease) };
  };
  const body = (id: string, expiresAt: number) => ({ lease_id: id, expires_at: new Date(expiresAt).toISOString() });
  const gone = answers.refused(404, 'not_found');
  return [
    reply(agent.attachRoutes.acquire, (r) => {
      const { sid } = parts(r);
      if (!known().has(sid)) return gone;
      n += 1;
      const id = `lease-${sid}-${n}`;
      const expiresAt = now() + leaseTtl(r.body);
      leases.set(id, { sid, expiresAt });
      return { status: 201, body: body(id, expiresAt) };
    }),
    reply(agent.attachRoutes.renew, (r) => {
      const { sid, lease } = parts(r);
      const l = leases.get(lease);
      if (!known().has(sid) || !l || l.sid !== sid) return gone;
      if (now() > l.expiresAt) return answers.refused(410, 'attachment_expired');
      l.expiresAt = now() + leaseTtl(r.body);
      return answers.ok(body(lease, l.expiresAt));
    }),
    reply(agent.attachRoutes.release, (r) => {
      const { sid, lease } = parts(r);
      const l = leases.get(lease);
      if (!known().has(sid) || !l || l.sid !== sid) return gone;
      leases.delete(lease);
      return answers.ok({ status: 'ok', released: true });
    }),
  ];
}
