// The Board's embed data stays the SDK's: catalog.ui.json = trimCatalog(SDK catalogue), and vectors.json holds what
// the SDK's own buildEmbedUrl answers for every vector input today (URL or refusal code).
// The drift tests read the live SDK and kit trees outside this repo, so they run only when asked: HUB_BOARD_SYNC=1,
// which `bun run hub:board-sync` sets (the release checks run it as a reported step). A plain vitest run reports them
// skipped and stays hermetic: it does not read those trees at all, not even to see whether they exist (a test below
// spies on fs and child_process to hold that). embed.parity.test.ts still checks the Hub's port against the stored
// vectors in a plain run, but only hub:board-sync checks the stored data against what the SDK answers now. Asked for
// on a host without those trees, the run fails ('the SDK and kit trees are there') rather than skip. A red drift test
// means the SDK moved: REGEN_BOARD_EMBEDS=1 rewrites both files from the SDK.
// Env: HUB_BOARD_SDK (hoody-sdk root), HUB_BOARD_KITS (the kits' root) point the drift tests at other trees.
import { execFileSync } from 'node:child_process';
import type * as ChildProcess from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type * as Fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { monorepoPath } from '@core/test/monorepo';
import { TILE_PROGRAMS, trimCatalog, type Catalog } from './catalog';
import { decodeVector, encodeVector, vectorInputs, VECTOR_DOMAIN, VECTOR_TARGET, type KitCase, type VectorInput } from './vectors';
import stored from './catalog.ui.json';
import storedVectors from './vectors.json';

const HERE = dirname(fileURLToPath(import.meta.url));
// Outside the monorepo neither tree exists ('' here): the drift tests are skipped even when asked for.
const SDK = monorepoPath(process.env.HUB_BOARD_SDK, 'hoody-sdk-generator', 'hoody-sdk') ?? '';
const KITS = monorepoPath(process.env.HUB_BOARD_KITS, 'hoody-kit') ?? '';
const inTree = (p: string, tree: string): boolean => tree !== '' && p.startsWith(tree);
const CATALOG = join(SDK, 'generated', 'embeds.catalog.v1.json');
const RUNTIME = join(SDK, 'lib', 'embeds', 'runtime.ts');
// The kit suites whose cases.json name tile views (terminal's covers terminal, desktop and agent).
const SUITES = ['hoody-terminal', 'hoody-display', 'hoody-files', 'hoody-browser', 'hoody-code'];
/** What the drift tests need and this host lacks; called only inside a test that runs in sync mode. */
const missingTrees = (): string[] => [CATALOG, RUNTIME, ...SUITES.map((s) => join(KITS, s, 'test', 'embeds', 'cases.json'))].filter((f) => !existsSync(f));

// The real fs and child_process, wrapped so the plain-run test can see that nothing read the trees. The log is its
// own (vi.hoisted), not a spy's mock.calls: those come back empty in the test for calls made at module load.
const seen = vi.hoisted(() => ({ paths: [] as string[], spawns: 0 }));
vi.mock('node:fs', async (real) => {
  const fs = await real<typeof Fs>();
  const existsSync = (f: Fs.PathLike) => {
    seen.paths.push(String(f));
    return fs.existsSync(f);
  };
  const readFileSync = ((f: Fs.PathOrFileDescriptor, ...rest: unknown[]) => {
    seen.paths.push(String(f));
    return (fs.readFileSync as (...a: unknown[]) => unknown)(f, ...rest);
  }) as typeof fs.readFileSync;
  return { ...fs, existsSync, readFileSync };
});
vi.mock('node:child_process', async (real) => {
  const cp = await real<typeof ChildProcess>();
  const execFileSync = ((...args: unknown[]) => {
    seen.spawns++;
    return (cp.execFileSync as (...a: unknown[]) => unknown)(...args);
  }) as typeof cp.execFileSync;
  return { ...cp, execFileSync };
});

export interface StoredVector extends VectorInput { readonly expect: { url: string } | { refused: string; field: string | null } }
interface VectorFile { readonly cases: readonly string[]; readonly vectors: readonly StoredVector[] }

/** Every case of the tile kit suites, as view id + param (code's file names views without the kit). */
function kitCases(): Array<KitCase & { id: string }> {
  const out: Array<KitCase & { id: string }> = [];
  for (const s of SUITES) {
    const doc = JSON.parse(readFileSync(join(KITS, s, 'test', 'embeds', 'cases.json'), 'utf8')) as Record<string, unknown>;
    const kit = typeof doc.kit === 'string' ? doc.kit : s.replace(/^hoody-/, '');
    const cases = (doc.cases && typeof doc.cases === 'object' ? doc.cases : doc) as Record<string, { view?: unknown; param?: unknown }>;
    for (const [id, c] of Object.entries(cases)) {
      if (!c || typeof c.view !== 'string') continue;
      out.push({ id: s + ':' + id, view: c.view.includes('.') ? c.view : kit + '.' + c.view, param: typeof c.param === 'string' ? c.param : null });
    }
  }
  return out;
}

// The SDK runtime is TypeScript outside this tree: bun runs it (as the kit suites' sdk-urls.ts do) on the inputs
// from stdin and prints each answer, a URL or {refused, field}.
const SDK_SCRIPT = `
const { buildEmbedUrl } = await import(process.env.RT);
const input = JSON.parse(await Bun.stdin.text());
const out = input.map((v) => {
  try { return { url: buildEmbedUrl(v.kit, v.target, { view: v.view, index: v.index, params: v.params, query: v.query }, { computersDomain: v.domain }) }; }
  catch (e) { if (typeof e?.code !== 'string') throw e; return { refused: e.code, field: e.field ?? null }; }
});
process.stdout.write(JSON.stringify(out));
`;

function sdkAnswers(inputs: readonly VectorInput[]): Array<StoredVector['expect']> {
  const wire = inputs.map((v) => ({ ...v, target: v.target ?? VECTOR_TARGET, domain: v.domain ?? VECTOR_DOMAIN }));
  const out = execFileSync('bun', ['--eval', SDK_SCRIPT], { input: JSON.stringify(wire), env: { ...process.env, RT: RUNTIME }, maxBuffer: 64 << 20, timeout: 120000 });
  return JSON.parse(out.toString('utf8')) as Array<StoredVector['expect']>;
}

function fresh(): { catalog: Catalog; file: VectorFile } {
  const catalog = trimCatalog(JSON.parse(readFileSync(CATALOG, 'utf8')));
  const cases = kitCases().filter((c) => c.view in catalog.views);
  const inputs = vectorInputs(catalog, cases);
  const answers = sdkAnswers(inputs);
  const vectors = inputs.map((v, i) => ({ ...v, expect: answers[i] as StoredVector['expect'] }));
  return { catalog, file: { cases: cases.map((c) => c.id).sort(), vectors } };
}

const REGEN = process.env.REGEN_BOARD_EMBEDS === '1';
const SYNC = REGEN || process.env.HUB_BOARD_SYNC === '1';

it('the trimmed catalogue has exactly the tile programs', () => {
  expect(Object.keys((stored as unknown as Catalog).kits).sort()).toEqual([...TILE_PROGRAMS].sort());
});

it.skipIf(SYNC)('a plain run reads nothing of the SDK or kit trees and spawns nothing', () => {
  expect(seen.paths.filter((f) => inTree(f, SDK) || inTree(f, KITS))).toEqual([]);
  expect(seen.spawns).toBe(0);
});

describe.skipIf(!SYNC || SDK === '' || KITS === '')('board embed data = the SDK catalogue and the SDK builder (SDK drift: run `bun run hub:board-sync`)', () => {
  // Each test below looks for the trees when it runs, never at collection: a missing tree fails this one test and
  // skips the others, instead of hiding them.
  it('the SDK and kit trees are there to compare against', () => {
    expect(missingTrees()).toEqual([]);
  });
  if (REGEN) {
    it('regenerates catalog.ui.json and vectors.json', (ctx) => {
      if (missingTrees().length) ctx.skip();
      const { catalog, file } = fresh();
      writeFileSync(join(HERE, 'catalog.ui.json'), JSON.stringify(catalog, null, 1) + '\n');
      // One vector per line, so a change shows as the vectors it moved.
      writeFileSync(join(HERE, 'vectors.json'), '{"cases":' + JSON.stringify(file.cases) + ',"vectors":[\n' + file.vectors.map((v) => JSON.stringify(encodeVector(v))).join(',\n') + '\n]}\n');
    });
    return;
  }
  it('catalog.ui.json is trimCatalog(SDK generated/embeds.catalog.v1.json)', (ctx) => {
    if (missingTrees().length) ctx.skip();
    expect(stored).toEqual(fresh().catalog);
  });
  it('vectors.json names every case of the tile kit suites (sets, not counts)', (ctx) => {
    if (missingTrees().length) ctx.skip();
    expect([...(storedVectors as VectorFile).cases]).toEqual([...fresh().file.cases]);
  });
  it('every stored vector is what the SDK answers today, and no vector is missing', (ctx) => {
    if (missingTrees().length) ctx.skip();
    const now = fresh().file.vectors;
    expect((storedVectors as VectorFile).vectors.map((v) => v.id)).toEqual(now.map((v) => v.id));
    expect(decodeVector((storedVectors as unknown as VectorFile).vectors)).toEqual(JSON.parse(JSON.stringify(now)));
  });
});
