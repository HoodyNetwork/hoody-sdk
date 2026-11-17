// secret.ts: a freshly minted secret (an API key, a Bot key, a share link token), held for the one context
// that minted it: custody (bind/shown/drop/watch), the scrubs (scrubSecret, scrubMint,
// takeMint/mintFor/mintFail) and the wipe hook (onWipe).
//
// Contract:
//   - mintSecret(route, input, pick) sends one change through api() with a scrub of its own. The scrub sees
//     every raw success answer once, at the response boundary and before the liveness check (answers that
//     are then dropped included): it copies the secret out with pick(raw) and nulls every copy in the raw
//     answer (scrubMint: `secret`, every `curl*` key, and any string that contains the secret). An earlier
//     copy is wiped first, so a retried call never keeps two. The caller gets the scrubbed answer and a
//     HeldSecret; no copy of the secret is anywhere else.
//   - The route must be declared secret (defineRoute secret), so its rejection is rebuilt from safe fields
//     only, and the caller passes no scrub of its own: both are refused unsent.
//   - A pick that throws (SCRUB_FAILED: the answer arrived but could not be read) rejects pending with that
//     code and no notice: the thing was made, its secret is gone, the caller reads back.
//   - A context that died after the answer was let through drops the secret unseen and rejects pending with
//     code STALE_CONTEXT (the thing was made; one "may have gone through" notice). A rejection drops the copy.
//   - A HeldSecret is bound to its minting context, and its wipe is armed before anyone sees it: every
//     teardown (switch, sign-out, account change, suspension), every generation move, a change of view, or
//     the context dying drops it. reveal(ctx) gives the secret only to that very context while it lives;
//     any other context, live or not, gets null and the secret is dropped. drop() ("I saved it, close", Esc)
//     is idempotent and unsubscribes the wipe.
//   - Only the kit's SecretField shows a secret, and it reads it through useSecret() alone.
import { useSyncExternalStore } from 'react';
import { api, notifyPending, type HubError } from './api';
import { alive, capture, subscribe, vgen, type Ctx } from './ctx';
import { onTeardown } from './realm';
import type { CallInput, Route } from './routes';

/** Null every credential copy in one object tree, at any depth: `secret`, `curl*` keys, and strings containing the
 *  secret. A walk with a visited set (no recursion, no depth cut-off), so a cycle ends and a deep answer is scrubbed whole. */
export function scrubSecret(o: unknown, secret: string | null): void {
  const seen = new Set<object>();
  const todo: unknown[] = [o];
  while (todo.length > 0) {
    const x = todo.pop();
    if (!x || typeof x !== 'object' || seen.has(x)) continue;
    seen.add(x);
    const rec = x as Record<string, unknown>;
    for (const k of Object.keys(rec)) {
      const v = rec[k];
      if (typeof v === 'string') {
        if (k === 'secret' || /^curl/.test(k) || (secret && v.indexOf(secret) !== -1)) rec[k] = null;
      } else if (v && typeof v === 'object') todo.push(v);
    }
  }
}

/** The one drop for a mint result: every copy in x and down its own `mint` chain is nulled, the chain cut. */
export function scrubMint<T>(x: T): T {
  const chain: Array<Record<string, unknown>> = [];
  let secret: string | null = null;
  let o: unknown = x;
  while (o && typeof o === 'object' && !chain.includes(o as Record<string, unknown>) && chain.length < 8) {
    const r = o as Record<string, unknown>;
    chain.push(r);
    if (!secret && typeof r.secret === 'string' && r.secret) secret = r.secret;
    o = Object.hasOwn(r, 'mint') ? r.mint : null;
  }
  for (const r of chain) {
    scrubSecret(r, secret);
    if (Object.hasOwn(r, 'mint')) r.mint = null;
  }
  return x;
}

export interface HeldSecret {
  /** The context it was minted under. */
  readonly ctx: Ctx;
  /** The secret for that very context while it lives; anything else gets null and drops it. */
  reveal(ctx: Ctx | null | undefined): string | null;
  /** Drop it now (idempotent). */
  drop(): void;
  readonly dropped: boolean;
  /** fn() once, when it is dropped. Returns the unsubscribe. */
  onDrop(fn: () => void): () => void;
}

/** Hold a secret for ctx with its wipe armed. null for an empty value or a context already gone. */
export function holdSecret(value: unknown, ctx: Ctx): HeldSecret | null {
  if (typeof value !== 'string' || !value) return null;
  if (!alive(ctx) || vgen() !== ctx.vgen) return null;
  let secret: string | null = value;
  const dropListeners = new Set<() => void>();
  const offs: Array<() => void> = [];
  const drop = () => {
    if (secret === null) return;
    secret = null;
    for (const off of offs.splice(0)) off();
    for (const l of [...dropListeners]) { try { l(); } catch { /* the listener's own */ } }
    dropListeners.clear();
  };
  offs.push(onTeardown(drop));
  // Any core change (generation, session, sign-out, view) that ends what this context showed.
  offs.push(subscribe(() => { if (!alive(ctx) || vgen() !== ctx.vgen) drop(); }));
  return Object.freeze({
    ctx,
    reveal(c: Ctx | null | undefined) {
      if (secret !== null && c === ctx && alive(ctx) && vgen() === ctx.vgen) return secret;
      drop();
      return null;
    },
    drop,
    get dropped() { return secret === null; },
    onDrop(fn: () => void) {
      if (secret === null) { try { fn(); } catch { /* the listener's own */ } return () => {}; }
      dropListeners.add(fn);
      return () => { dropListeners.delete(fn); };
    },
  });
}

export interface Minted<R> {
  /** The answer with every copy of the secret nulled (ids, names, prefixes stay readable). */
  readonly answer: R;
  /** The secret, or null when the answer carried none (the thing was made, nothing secret kept). */
  readonly held: HeldSecret | null;
}

function refused(code: string): HubError {
  return { kind: 'not_sent', code, notSent: true };
}

/** One minting change (see the contract). pick reads the secret out of the raw success answer. */
export async function mintSecret<R, B>(route: Route<R, B>, input: CallInput<B>, pick: (raw: R) => unknown): Promise<Minted<R>> {
  if (!route.secret) throw refused('SECRET_ROUTE');
  if (input.scrub != null) throw refused('SCRUB_OWN');
  const ctx = input.ctx ?? capture(input.target);
  let box: string | null = null;
  let raw: R | undefined;
  const scrub = (answer: unknown) => {
    const s = pick(answer as R);
    const value = typeof s === 'string' && s ? s : null;
    scrubMint({ secret: value, mint: answer });
    box = value;
    raw = answer as R;
  };
  let answer: R;
  try {
    answer = await api(route, { ...input, ctx, scrub });
  } catch (e) {
    box = null;
    // The answer arrived and could not be read: the thing was made and its secret is gone (no notice).
    if (e && typeof e === 'object' && (e as HubError).code === 'SCRUB_FAILED') throw { kind: 'pending', pending: true, code: 'SCRUB_FAILED' } as HubError;
    throw e;
  }
  // A transport that never called the scrub: wipe the answer here, the same way.
  if (raw === undefined) scrub(answer);
  const value = box;
  box = null;
  if (!alive(ctx) || vgen() !== ctx.vgen) {
    if (!(input.recovers && alive(ctx))) notifyPending(ctx);
    throw { kind: 'pending', pending: true, stale: true, code: 'STALE_CONTEXT' } as HubError;
  }
  return Object.freeze({ answer, held: value === null ? null : holdSecret(value, ctx) });
}

/** SecretField's one read: the secret for ctx while it is held, else null; re-renders when it is dropped. */
export function useSecret(held: HeldSecret | null | undefined, ctx: Ctx | null | undefined): string | null {
  const sub = (cb: () => void) => (held ? held.onDrop(cb) : () => {});
  const get = () => (held && !held.dropped ? held.reveal(ctx) : null);
  return useSyncExternalStore(sub, get, get);
}
