#!/usr/bin/env bun
// demo-record.ts: records the sample account of `hoody hub --demo` (scripts/term/build/demo-world.gen.json).
//   NODE_ENV=test /bin/bash -p scripts/term/netns.sh bun scripts/term/demo-record.ts [--check] [--out <file>]
// It mounts the fixture Hub on the Hub's one sample world (src/core/world.ts), every visible page at its default
// state, and writes down what the fixture transport answers each GET, keyed as a host's client sees the read (the
// path with its query; a kit or agent read by its address under the demo mount's reserved proxy domain). The reads
// the live boot makes and the fixture boot seeds (who am I, the realm list, the realm names) are asked once through
// core, so the same rules answer them. The file is plain data: the ship build takes it, and no fixture module.
// Only what goes through the transport is recorded; reads a page serves from its own fixtures in a fixture build
// are written by hand in build/demo-answers.ts.
// --check: records nothing; exit 1 when the fixture sources changed since the file was recorded (demoSourceHash).
import './netns-first';
import fs from 'node:fs';
import path from 'node:path';
import { renderPage } from './render';
import { SRC } from './resolve';
import { DEMO_DOMAIN, DEMO_WORLD_FILE, demoSourceHash } from './build/demo-source';
import { installTermLoader } from './loader';
// Types only (erased): the modules themselves are loaded below, after the fixture mode is set.
import type * as TransportModule from '../../src/core/transport';
import type * as WorldModule from '../../src/core/world';
import type * as PagesModule from '../../src/app/pages';
import type * as ApiModule from '../../src/core/api';

interface Rec { leg: 'hoody' | 'fetch'; method: string; url: string; status: number; body: unknown; raw?: boolean; type?: string; etag?: string; at?: string }

const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/;
/** The newest time in a body that is not after `cap` (0: none). */
export function newestPast(v: unknown, cap: number): number {
  if (typeof v === 'string') { const t = ISO.test(v) ? Date.parse(v) : 0; return t <= cap ? t : 0; }
  if (Array.isArray(v)) return v.reduce<number>((m, x) => Math.max(m, newestPast(x, cap)), 0);
  if (v && typeof v === 'object') return Object.values(v).reduce<number>((m, x) => Math.max(m, newestPast(x, cap)), 0);
  return 0;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const out = args.includes('--out') ? path.resolve(args[args.indexOf('--out') + 1]!) : DEMO_WORLD_FILE;
  if (args.includes('--check')) {
    const have = (JSON.parse(fs.readFileSync(out, 'utf8')) as { source: string }).source;
    const now = demoSourceHash(SRC);
    process.stdout.write(have === now ? 'demo world: recorded from the current fixtures\n' : 'demo world: STALE, the fixture sources changed since it was recorded; run scripts/term/demo-record.ts\n');
    process.exit(have === now ? 0 : 1);
  }
  installTermLoader({ flavour: 'fixture', fixtures: true });
  const T = await import(path.join(SRC, 'core/transport.ts')) as typeof TransportModule;
  const { fixtureWorld } = await import(path.join(SRC, 'core/world.ts')) as typeof WorldModule;
  const { discoverPages, visiblePages } = await import(path.join(SRC, 'app/pages.ts')) as typeof PagesModule;
  const pages = visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false });
  const recs = new Map<string, Rec>();
  const size = (r: Rec): number => JSON.stringify(r.body).length;
  const note = (r: Rec): void => {
    if (r.method !== 'GET') return;
    r = { ...r, url: r.url.replace('.fixture.invalid', '.' + DEMO_DOMAIN) };
    const k = `${r.leg} ${r.url}`;
    const had = recs.get(k);
    // Two pages' fixture states can answer one read differently (a page that needs only ids answers with ids): the
    // fuller success is the world's.
    if (!had || (r.status === 200 && (had.status !== 200 || size(r) > size(had)))) recs.set(k, r);
  };
  let bootRead = false;
  let heldNow = 0;
  const unsettled: string[] = [];
  for (const page of pages) {
    const s = await renderPage({ page: page.id, cols: 120, rows: 40, afterBoot: async () => {
      heldNow = Date.now(); // the fixture clock is held here: the moment every relative time of a fixture is from
      const inner = T.transport();
      T.installTransport({
        ...inner,
        hoody: async (method, url, body, opts, meta) => {
          let etag: string | null = null;
          try {
            const v = await inner.hoody(method, url, body, { ...opts, onEtag: (e: string | null) => { etag = e; opts.onEtag?.(e); } }, meta);
            note({ leg: 'hoody', method, url, status: 200, body: JSON.parse(JSON.stringify(v)), ...(etag ? { etag } : {}) });
            return v;
          } catch (e) {
            const err = e as { status?: number; data?: unknown };
            if (typeof err.status === 'number' && err.status > 0) note({ leg: 'hoody', method, url, status: err.status, body: err.data ?? null });
            throw e;
          }
        },
        fetch: async (url, init, meta) => {
          const res = await inner.fetch(url, init, meta);
          const text = await res.clone().text();
          const type = res.headers.get('content-type') ?? 'application/json';
          let body: unknown = text; let raw = true;
          if (type.includes('json')) { try { body = JSON.parse(text); raw = false; } catch { /* kept as text */ } }
          note({ leg: 'fetch', method: (init.method ?? 'GET').toUpperCase(), url, status: res.status, body, ...(raw ? { raw } : {}), ...(type !== 'application/json' ? { type } : {}) });
          return res;
        },
      });
      if (bootRead) return;
      bootRead = true;
      const { api } = await import(path.join(SRC, 'core/api.ts')) as typeof ApiModule;
      const L = await import(path.join(SRC, 'core/lifecycle.ts')) as unknown as { meRoute: never };
      const R = await import(path.join(SRC, 'core/realm.ts')) as unknown as { realmsRoute: never; vaultKeyRoute: never };
      const quiet = (p: Promise<unknown>): Promise<unknown> => p.catch(() => undefined);
      await quiet(api(L.meRoute));
      await quiet(api(R.realmsRoute, { query: { include_usage: true } } as never));
      await quiet(api(R.vaultKeyRoute, { params: { key: 'hoody.realm-aliases' } } as never));
    } });
    await s.releaseHeld();
    if (!s.settled) unsettled.push(page.id);
    s.close();
  }
  const W = fixtureWorld;
  const held = heldNow || W.now;
  // Two clocks date the fixtures: the world's own moment (world.ts WORLD_NOW) and the held fixture clock. A read whose
  // past times end within a day of the world's moment is dated from it (`at`), so its "4 minutes ago" stays 4 minutes;
  // one that ends a little after the world's moment is dated from its own newest time, so nothing lands in the future.
  // A sign-up link on the product's API host is moved under the demo domain: the sample account's codes are not real.
  // Public addresses are moved into a documentation range (203.0.113.0/24): the sample world names nobody's machine.
  const DAY = 86_400_000;
  const sample = (text: string): string => text.replaceAll('//api.hoody.com/', `//api.${DEMO_DOMAIN}/`).replace(/(?<![\d.])93\.184\.216\.(\d{1,3})(?![\d.])/g, '203.0.113.$1');
  const records = [...recs.values()].sort((a, b) => (a.leg + a.url < b.leg + b.url ? -1 : 1)).map((r) => {
    const body = JSON.parse(sample(JSON.stringify(r.body))) as unknown;
    const newest = newestPast(body, held);
    const world = W.now < held && newest > 0 && newest <= W.now + DAY;
    return { ...r, url: sample(r.url), body, ...(world ? { at: new Date(Math.max(W.now, newest)).toISOString() } : {}) };
  });
  const doc = {
    note: 'GENERATED by scripts/term/demo-record.ts from the fixture world. Do not edit: record again.',
    source: demoSourceHash(SRC),
    recordedAt: new Date(held).toISOString(),
    account: W.account.id,
    context: { realmId: W.realms[0]!.id, projectId: W.current.project_id, containerId: W.current.id },
    records,
  };
  fs.writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
  process.stdout.write(`demo world: ${records.length} reads from ${pages.length} pages -> ${out}${unsettled.length ? `; NOT SETTLED: ${unsettled.join(', ')}` : ''}\n`);
  process.exit(unsettled.length ? 1 : 0);
}
