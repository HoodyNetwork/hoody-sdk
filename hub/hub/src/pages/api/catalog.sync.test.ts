// The API catalog stays the SDK's and the docs': catalog.gen.json = api-catalog-gen.ts on the sources today, every
// spec operation is in it exactly once, and every program host is the one the SDK's getKitUrl builds.
// The drift tests read the SDK and docs trees outside this repo, so they run only when asked: HUB_API_SYNC=1 on this file. A plain run reports them skipped and stays hermetic: it reads neither tree, not even to
// see whether it exists (the last test spies on fs and child_process to hold that). Asked for on a host without the
// trees, the run fails rather than skip. A red drift test means a source moved: HUB_API_CATALOG_REGEN=1 (with
// HUB_API_SYNC=1) rewrites catalog.gen.json, or run `bun hub/scripts/api-catalog-gen.ts`.
// Env: HUB_API_SDK (hoody-sdk root), HUB_API_DOCS (the docs site's root).
import { execFileSync } from 'node:child_process';
import type * as ChildProcess from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type * as Fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { monorepoPath } from '@core/test/monorepo';
import { unpackCatalog, type PackedCatalog } from './catalog';
import { baseFor } from './logic';
import stored from './catalog.gen.json';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');
// Outside the monorepo neither tree exists ('' here): the sync tests are skipped even when asked for.
const SDK = monorepoPath(process.env.HUB_API_SDK, 'hoody-sdk-generator', 'hoody-sdk') ?? '';
const DOCS = monorepoPath(process.env.HUB_API_DOCS, 'hoody-docs') ?? '';
const inTree = (p: string, tree: string): boolean => tree !== '' && p.startsWith(tree);
const SPEC = join(SDK, 'generated', 'openapi.public.json');
const GEN = join(ROOT, 'hub', 'scripts', 'api-catalog-gen.ts');
const SYNC = process.env.HUB_API_SYNC === '1';
/** Operations the SDK has no method for (their JavaScript tab is fetch). Pinned: a change is a reviewed change. */
const NO_SDK = 119;
const VECTOR = { project: '0123456789abcdef01234567', computer: '89abcdef0123456789abcdef', server: 'node-example-1' };
/** The Hub's proxy domain on hoody.com (its data-proxy-domain), the domain every snippet host is built under. */
const HUB_PROXY_DOMAIN = 'computers.hoody.com';

const seen = vi.hoisted(() => ({ paths: [] as string[], spawns: 0 }));
vi.mock('node:fs', async (real) => {
  const fs = await real<typeof Fs>();
  const existsSync = (f: Fs.PathLike) => { seen.paths.push(String(f)); return fs.existsSync(f); };
  const readFileSync = ((f: Fs.PathOrFileDescriptor, ...rest: unknown[]) => { seen.paths.push(String(f)); return (fs.readFileSync as (...a: unknown[]) => unknown)(f, ...rest); }) as typeof fs.readFileSync;
  return { ...fs, existsSync, readFileSync };
});
vi.mock('node:child_process', async (real) => {
  const cp = await real<typeof ChildProcess>();
  const execFileSync = ((...args: unknown[]) => { seen.spawns++; return (cp.execFileSync as (...a: unknown[]) => unknown)(...args); }) as typeof cp.execFileSync;
  return { ...cp, execFileSync };
});

const gen = (flag: string): string => execFileSync('bun', [GEN, flag], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, env: { ...process.env, HUB_API_SDK: SDK, HUB_API_DOCS: DOCS } });

describe.runIf(SYNC && SDK !== '' && DOCS !== '')('api catalog: sync with the SDK and docs (HUB_API_SYNC=1)', () => {
  it('the SDK and docs trees are there', () => {
    expect([SPEC, join(SDK, 'sdk-mappings.json'), join(SDK, 'cli-mappings.json'), join(DOCS, 'config', 'api-page-mapping.yaml')].filter((f) => !existsSync(f))).toEqual([]);
  });

  it('catalog.gen.json is what the generator writes from the sources today', () => {
    const fresh = gen('--print');
    if (process.env.HUB_API_CATALOG_REGEN === '1') writeFileSync(join(HERE, 'catalog.gen.json'), fresh);
    expect(JSON.parse(fresh)).toEqual(stored);
  }, 120_000);

  it('every spec operation is in it exactly once, a folded twin under its base, and the no-SDK count is pinned', () => {
    const spec = JSON.parse(readFileSync(SPEC, 'utf8')) as Record<string, Record<string, Record<string, { operationId?: string; 'x-original-operation-id'?: string }>>>;
    const ids: string[] = [];
    for (const paths of [spec.paths, spec['x-additional-paths']]) for (const item of Object.values(paths ?? {})) for (const o of Object.values(item)) if (o && typeof o === 'object' && typeof o.operationId === 'string') ids.push(o.operationId);
    expect(new Set(ids).size).toBe(ids.length);
    const c = unpackCatalog(stored as unknown as PackedCatalog);
    const listed = c.ops.map((o) => o.id);
    expect(new Set(listed).size).toBe(listed.length);
    expect(listed.length + c.counts.folded).toBe(ids.length);
    expect(ids.filter((id) => !listed.includes(id)).length).toBe(c.counts.folded);
    expect(c.counts.noSdk).toBe(NO_SDK);
  });

  it('every program host is the SDK getKitUrl for a fixed computer', () => {
    const c = unpackCatalog(stored as unknown as PackedCatalog);
    const sdk = JSON.parse(gen('--vectors')) as Record<string, string>;
    expect(Object.keys(sdk).length).toBeGreaterThan(10);
    // The expected host is getKitUrl's, whole (every kit, code included, on computers.*);
    // the page builds it from the Hub's proxy domain.
    for (const [service, url] of Object.entries(sdk)) {
      const o = c.ops.find((x) => x.service === service && x.host !== null);
      expect(o, service).toBeDefined();
      expect(baseFor(c, o!, VECTOR, HUB_PROXY_DOMAIN), service).toBe(url.replace(/\/+$/, ''));
    }
  }, 120_000);
});

describe('api catalog: the plain run stays hermetic', () => {
  it.runIf(!SYNC)('reads neither tree and spawns nothing', () => {
    expect(seen.paths.filter((p) => inTree(p, SDK) || inTree(p, DOCS))).toEqual([]);
    expect(seen.spawns).toBe(0);
  });
});
