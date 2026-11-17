// lockout.ts: the wait a lockout names in its answer body.
/** A 429's wait as its body names it (data.lockout_seconds: the 2FA lockout, up to 15 minutes): whole seconds,
 *  at most a day. A positive finite number, or its plain digits as text ("900"); undefined for anything else.
 *  Nothing else of the body is read.
 *  A rejection carries the body in one of two shapes: `data` is the whole answer body (the web page's client), or
 *  `data` is the body's own `data` (the terminal's client). Both are read here, the whole-body shape first. */
export function lockoutSeconds(e: unknown): number | undefined {
  const x = e as { status?: unknown; data?: unknown } | null;
  if (!x || x.status !== 429 || !x.data || typeof x.data !== 'object') return undefined;
  const named = (o: unknown): number | undefined => {
    const raw = o && typeof o === 'object' ? (o as { lockout_seconds?: unknown }).lockout_seconds : undefined;
    const s = typeof raw === 'string' && /^\d{1,9}$/.test(raw) ? Number(raw) : raw;
    return typeof s === 'number' && Number.isFinite(s) && s > 0 ? Math.min(Math.ceil(s), 86400) : undefined;
  };
  return named((x.data as { data?: unknown }).data) ?? named(x.data);
}
