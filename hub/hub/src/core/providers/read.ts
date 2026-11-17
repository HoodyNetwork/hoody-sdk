// The evidence a model choice is judged against: one read of the computer's catalogue
// (providers, models, the ready list, and an older agent's credential probes), and the Claude Code read when the
// caller offers it, each a part that is loading, failed (settled) or ok, under one seq and one scope.
// Additive: catalogue() in call.ts stays while its other users remain.
import type { ClaudeSet } from '../agent/types';
import type { Ctx } from '../ctx';
import type { ProvidersApi } from './api';
import { catalogue, obj, probeSet, publicName } from './catalogue';
import type { AuthBody, Catalogue, Outcome } from './types';

/** Where evidence belongs: it is never shown or judged under another scope. */
export interface Scope {
  account: string;
  realm: string;
  /** `${project}|${container}|${server_name}`: the target the reads went to. */
  computer: string;
  gen: number;
  /** A random id per page load, so a stored gen never matches after a reload. */
  boot: string;
}

export interface Snapshot {
  /** Providers and models (both reads answered). */
  cat: Catalogue;
  /** The ready read: ok (trusted), failed (an agent that reports status; ready withheld), legacy (no status: not trusted). */
  ready: 'ok' | 'failed' | 'legacy';
  /** The catalogue's identity for the search index: provider ids, prefixes and public labels, model specs and public labels. */
  sig: string;
}

export type Part<T> = { state: 'loading' } | { state: 'failed'; err: Outcome } | { state: 'ok'; value: T };

export interface Evidence {
  seq: number;
  scope: Scope;
  at: number;
  /** failed = the providers or models read failed (settled), never "loading". */
  catalogue: Part<Snapshot>;
  /** Only when the caller offers Claude Code. */
  claude: Part<ClaudeSet> | null;
}

const randomId = (): string => {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
};
/** This page load's id (Scope.boot). */
export const BOOT = randomId();

/** The scope of a read that starts now, from its captured context (core/ctx.ts capture). */
export function scopeOf(ctx: Ctx, boot = BOOT): Scope {
  const t = ctx.target;
  return {
    account: ctx.account ?? '',
    realm: ctx.realm,
    computer: t ? `${t.project.id}|${t.container.id}|${t.container.server_name ?? ''}` : '',
    gen: ctx.gen,
    boot,
  };
}

export function sameScope(a: Scope | null | undefined, b: Scope | null | undefined): boolean {
  return !!a && !!b && a.account === b.account && a.realm === b.realm && a.computer === b.computer && a.gen === b.gen && a.boot === b.boot;
}

/** FNV-1a over the indexed fields, in catalogue order: a rename changes it, readiness never does. */
export function catalogueSig(cat: Catalogue): string {
  let h = 0x811c9dc5;
  const add = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= 0x1f;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  for (const id of Object.keys(cat.byId)) {
    const p = cat.byId[id]!;
    add(p.id);
    add(p.prefix);
    add(p.label === null ? '' : publicName(p.label, p.id));
  }
  for (const m of cat.models) {
    add(m.spec);
    add(publicName(m.display_name, m.spec));
  }
  return `${cat.models.length}:${h.toString(16)}`;
}

/**
 * One read of the catalogue. The three reads run in parallel and the part settles once all three have: a failed
 * providers or models read fails the part; a failed ready read does not (providers and models stay, ready is
 * withheld, other rules apply). An agent without provider status gets its credential probes for `probeSet(cat,
 * wanted)` (the caller's current, default and remembered specs first), which change only the provider line.
 */
/** The reads readCatalogue makes (providersApi() is one). */
export type CatalogueReader = Pick<ProvidersApi, 'providers' | 'auth'> & Required<Pick<ProvidersApi, 'models'>>;

export async function readCatalogue(api: CatalogueReader, wanted: readonly string[] = []): Promise<Part<Snapshot>> {
  const [p, m, r] = await Promise.all([api.providers(), api.models(), api.models({ ready: true })]);
  if (!p.ok) return { state: 'failed', err: p.err };
  if (!m.ok) return { state: 'failed', err: m.err };
  const base = catalogue({ providers: p.body, models: m.body, ready: r.ok ? r.body : undefined });
  if (base.am1) return { state: 'ok', value: { cat: base, ready: r.ok ? 'ok' : 'failed', sig: catalogueSig(base) } };
  const auth: Record<string, AuthBody> = {};
  await Promise.all(
    probeSet(base, wanted).map(async (id) => {
      const a = await api.auth(id);
      if (a.ok && obj(a.body)) auth[id] = a.body as AuthBody;
    }),
  );
  const cat = catalogue({ providers: p.body, models: m.body, auth });
  return { state: 'ok', value: { cat, ready: 'legacy', sig: catalogueSig(cat) } };
}
