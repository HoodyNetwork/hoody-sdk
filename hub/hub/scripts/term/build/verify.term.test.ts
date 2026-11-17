// The ship build's artifact check and fixture folding (scripts/term/build.ts), on small inputs: the full build runs in
// hub:term-build / hub:check.
import { describe, expect, test } from 'bun:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assetFindings, bundleModuleList, nameComparisonFindings, verifyArtifact } from './verify';
import { foldedSource, isDevOnly } from './plugin';

const SCRATCH = path.join(path.resolve(import.meta.dirname, '../../../../..'), 'tmp', 'term-build', 'verify-' + process.pid);

describe('ship artifact check', () => {
  test('an emptied module header is not a module', () => {
    const code = `// src/core/world.ts\nvar init_world = () => {};\n\n// src/core/live.ts\nfunction live() { return 1; }\n`;
    expect(bundleModuleList(code)).toEqual({ modules: ['src/core/live.ts'], emptied: ['src/core/world.ts'] });
  });
  test('fixture modules, placeholders, scripts and a second React are findings', () => {
    fs.mkdirSync(SCRATCH, { recursive: true });
    const b = path.join(SCRATCH, 'hub-term.js');
    fs.writeFileSync(b, [
      '// src/core/world.ts', 'var w = 1;',
      '// src/term/placeholder.ts', 'var p = 1;',
      '// ../hub/scripts/term/css-translate.ts', 'var c = 1;',
      '// node_modules/react/index.js', 'var r = 1;',
      '// node_modules/x/node_modules/react/index.js', 'var r2 = 1;',
      '// node_modules/react-reconciler/index.js', 'var rr = 1;',
      '// node_modules/scheduler/index.js', 'var s = 1;',
      'const q = __fixturesOff("WORLD_NOW", "src/core/world.ts");',
    ].join('\n') + '\n');
    fs.writeFileSync(path.join(SCRATCH, 'libopentui-x.so'), '');
    const r = verifyArtifact(SCRATCH, b);
    const f = r.findings.join('\n');
    expect(f).toContain('src/core/world.ts: fixture world is in the bundle');
    expect(f).toContain('src/term/placeholder.ts: placeholder runtime');
    expect(f).toContain('css-translate');
    expect(f).toContain('react: 2 copies');
    expect(f).toContain('src/core/world.ts: fixture-only, but live code reaches it (folded stand-ins kept: WORLD_NOW)');
    expect(r.copies['react-reconciler']).toBe(1);
    expect(r.native).toBe('libopentui-x.so');
    fs.rmSync(SCRATCH, { recursive: true, force: true });
  });
});

describe('fixture folding', () => {
  test('which modules fold: fixture world, page fixtures, gallery, demo, fixture entry; never shared code', () => {
    for (const f of ['src/core/world.ts', 'src/core/fixture-boot.ts', 'src/core/run-open/fixtureKits.ts', 'src/pages/logs/fixtures.ts', 'src/kit/gallery/page.ts', 'src/pages/demo/view.tsx', 'src/term/entry.fixture.ts', 'src/term/app/boot.ts']) expect({ f, fold: isDevOnly(f) }).toEqual({ f, fold: true });
    for (const f of ['src/core/index.ts', 'src/pages/logs/data.ts', 'src/term/entry.live.ts']) expect({ f, fold: isDevOnly(f) }).toEqual({ f, fold: false });
    // the fixture engine folds in the ship build, stays in a --stand-ins measurement build
    expect(isDevOnly('src/app/fixtures.ts')).toBe(true);
    expect(isDevOnly('src/app/fixtures.ts', true)).toBe(false);
  });
  test('a folded module keeps its export names as PURE stand-ins that throw TERM_FIXTURES_OFF; nothing runs at load', async () => {
    const out = foldedSource('/x/world.ts', `console.log('side effect');\nexport const WORLD_NOW = 1;\nexport function fixtureWorld() {}\nexport { a } from './a';\nexport default 3;\n`, 'src/core/world.ts');
    expect(out).not.toContain('side effect');
    for (const n of ['WORLD_NOW', 'fixtureWorld', 'a', 'default']) expect(out).toContain(`/* @__PURE__ */ __fixturesOff(${JSON.stringify(n)}`);
    fs.mkdirSync(SCRATCH, { recursive: true });
    const f = path.join(SCRATCH, 'folded.mjs');
    fs.writeFileSync(f, out);
    const mod = await import(f) as { WORLD_NOW: { x: number } };
    fs.unlinkSync(f);
    expect(() => mod.WORLD_NOW.x).toThrow(/TERM_FIXTURES_OFF: WORLD_NOW from src\/core\/world\.ts/);
  });
});

describe('engine capability check', () => {
  test('stock OpenTUI is refused, naming what is missing; the patched build passes', async () => {
    const { assertPatchedEngine } = await import('./engine-check');
    const react = { setHostTextFilter() {} };
    const core = { isStorableLinkUrl() {} };
    expect(() => assertPatchedEngine({}, {}, '')).toThrow(/TERM_ENGINE_UNPATCHED: .*version, hostTextFilter, linkUrlCheck/);
    expect(() => assertPatchedEngine(react, {}, '0.8.4-hoody.1')).toThrow(/missing: linkUrlCheck\)/);
    expect(() => assertPatchedEngine(react, core, '0.8.4')).toThrow(/missing: version\)/);
    expect(() => assertPatchedEngine(react, core, '0.8.4-hoody.0')).toThrow(/missing: version\)/);
    expect(() => assertPatchedEngine(react, core, '0.8.4-hoody.1')).not.toThrow();
  });
  test('the build refuses an engine whose packages are not one hoody version', async () => {
    const { engineVersion } = await import('./engine-check');
    const N = '@opentui/core-linux-x64';
    const pkgs = (core: string, react: string, native: string, pin: string) => (p: string) =>
      p === '@opentui/core' ? { version: core, optionalDependencies: { [N]: pin } } : { version: p === N ? native : react };
    expect(engineVersion(pkgs('0.8.4-hoody.2', '0.8.4-hoody.2', '0.8.4-hoody.2', '0.8.4-hoody.2'), N)).toBe('0.8.4-hoody.2');
    expect(() => engineVersion(pkgs('0.8.4', '0.8.4', '0.8.4', '0.8.4'), N)).toThrow(/TERM_ENGINE_VERSION/);
    expect(() => engineVersion(pkgs('0.8.4-hoody.2', '0.8.4-hoody.2', '0.8.4', '0.8.4-hoody.2'), N)).toThrow(/core-linux-x64 0\.8\.4,/);
    expect(() => engineVersion(pkgs('0.8.4-hoody.2', '0.8.4-hoody.1', '0.8.4-hoody.2', '0.8.4-hoody.2'), N)).toThrow(/@opentui\/react 0\.8\.4-hoody\.1/);
  });
  test('react-devtools-core in the bundle is a finding, wherever it is installed; the absent stand-in is not', async () => {
    const { FORBIDDEN, bundleModuleList: list } = await import('./verify');
    const hit = (m: string): string[] => FORBIDDEN.filter(([re]) => re.test(m)).map(([, w]) => w);
    expect(hit('node_modules/react-devtools-core/dist/backend.js')).toEqual(['React devtools client (opens a websocket to a devtools server)']);
    expect(hit('../../node_modules/.bun/react-devtools-core@7.0.1/node_modules/react-devtools-core/backend.js').length).toBe(1);
    expect(hit('node_modules/react/index.js')).toEqual([]);
    // What the build leaves of the specifier (plugin.ts hub-term-absent): a throwing stand-in, not the package.
    expect(list('// hub-term-absent:react-devtools-core\nvar x = () => { throw Error("absent"); };\n').modules.flatMap(hit)).toEqual([]);
  });
  test('the ship entry and its check are the only scripts allowed in the bundle', async () => {
    const { FORBIDDEN } = await import('./verify');
    const script = FORBIDDEN.find(([, w]) => w === 'build / dev script')![0];
    expect(script.test('scripts/term/build/ship-entry.ts')).toBe(false);
    expect(script.test('scripts/term/build/engine-check.ts')).toBe(false);
    expect(script.test('scripts/term/build/plugin.ts')).toBe(true);
    expect(script.test('scripts/term/css-translate.ts')).toBe(true);
  });
});

describe('minification: no class or function name comparisons in shipped hub code', () => {
  const bundle = (body: string, mod = 'src/term/prim/x.ts'): string => `// ${mod}\n${body}\n// node_modules/lib/index.js\nif (a.constructor.name === "Lib") {}\n`;
  test('comparisons are found, in hub modules only', () => {
    const f = nameComparisonFindings(bundle('if (a.constructor.name !== "ScrollBoxRenderable") continue;\nconst s = /ScrollBox/.test(n.constructor.name);\nif (type.name === "Button") {}'));
    expect(f).toHaveLength(3);
    expect(f.every((x) => x.startsWith('src/term/prim/x.ts: reads or compares a class or function name'))).toBe(true);
  });
  test('any read of constructor.name in shipped hub code is found, a label too (it shows the minified name)', () => {
    expect(nameComparisonFindings(bundle('const label = `${a.id ?? a.constructor.name} wide`;\nconst t = n.constructor.name.replace(/Renderable$/, "");'))).toHaveLength(2);
  });
  test('a function name in a label is not a comparison', () => {
    expect(nameComparisonFindings(bundle('const label = `${fn.name} failed`;'))).toEqual([]);
  });
  test('the source line is named when the source is readable', () => {
    // A scratch hub (the hub's own git-ignored cache) with one source file: line 3 holds the comparison.
    const scratch = path.resolve(import.meta.dirname, '..', '..', '..', '.term-cache', 'tmp');
    fs.mkdirSync(scratch, { recursive: true });
    const hub = fs.mkdtempSync(path.join(scratch, 'names-'));
    const file = path.join(hub, 'src', 'term', 'prim', 'f.ts');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "// x\n\n    if (a.constructor.name !== 'ScrollBoxRenderable') continue;\n");
    try {
      const f = nameComparisonFindings(bundle('if (a.constructor.name !== "ScrollBoxRenderable") continue;', 'src/term/prim/f.ts'), hub);
      expect(f[0]).toMatch(/^src\/term\/prim\/f\.ts:3: /);
    } finally {
      fs.rmSync(hub, { recursive: true, force: true });
    }
  });
});

test('class-style tables: the per-band pack (about 1.21 MB) is within budget; over 1.5 MB is a finding', async () => {
  const { assetFindings } = await import('./verify');
  const dir = path.join(SCRATCH, 'tables-budget');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, 'css-tables-abc123.json');
  fs.writeFileSync(f, '');
  fs.truncateSync(f, 1_212_599);
  expect(assetFindings(dir)).toEqual([]);
  fs.truncateSync(f, 1_500_001);
  expect(assetFindings(dir).join('\n')).toContain('class-style tables budget of 1500000 B');
  fs.unlinkSync(f);
});

test('the Node build (--runtime node): the named libraries with their pinned bytes, the launcher pinning each, nothing else, no bun: import', () => {
  const dir = path.join(SCRATCH, 'node-build');
  fs.mkdirSync(dir, { recursive: true });
  try {
    const sha = (s: string): string => crypto.createHash('sha256').update(s).digest('hex');
    const b = path.join(dir, 'hub-term.js');
    const x64 = path.join(dir, 'libopentui-linux-x64.so');
    const arm = path.join(dir, 'libopentui-linux-arm64.so');
    const launcher = path.join(dir, 'hub-node.js');
    const natives = { 'linux-x64': { file: 'libopentui-linux-x64.so', sha256: sha('x64') }, 'linux-arm64': { file: 'libopentui-linux-arm64.so', sha256: sha('arm64') } };
    const reset = (): void => {
      fs.writeFileSync(b, '// src/core/live.ts\nvar x = 1;\n');
      fs.writeFileSync(x64, 'x64');
      fs.writeFileSync(arm, 'arm64');
      fs.writeFileSync(launcher, `export const hub = nodeHub(import.meta.dirname, ${JSON.stringify(natives)});\n`);
    };
    const node = (): string[] => verifyArtifact(dir, b, { natives }).findings.filter((f) => /native librar|launcher|Node b|bun:|libopentui/.test(f));
    reset();
    expect(node()).toEqual([]);
    expect(verifyArtifact(dir, b, { natives }).native).toBe('libopentui-linux-arm64.so, libopentui-linux-x64.so');
    fs.writeFileSync(arm, 'arm64, another build');
    expect(node()).toEqual(['the linux-arm64 library libopentui-linux-arm64.so is not the bytes the launcher pins']);
    reset();
    fs.unlinkSync(arm);
    expect(node()).toEqual(['the linux-arm64 library libopentui-linux-arm64.so is not beside the bundle']);
    reset();
    fs.writeFileSync(launcher, `export const hub = nodeHub(import.meta.dirname, ${JSON.stringify({ 'linux-x64': natives['linux-x64'] })});\n`);
    expect(node()).toEqual(['the launcher does not pin the linux-arm64 library']);
    fs.unlinkSync(launcher);
    expect(node()).toEqual(['the Node build has no launcher (hub-node.js)']);
    reset();
    fs.writeFileSync(path.join(dir, 'libopentui-linux-x64-musl.so'), 'musl');
    expect(node()).toEqual(['libopentui-linux-x64-musl.so: a native library the Node build does not name', '3 native library files; the budget is 2']);
    fs.unlinkSync(path.join(dir, 'libopentui-linux-x64-musl.so'));
    for (const line of ['import { dlopen } from "bun:ffi";', 'const { dlopen } = await import("bun:ffi");', 'const B = require("bun");']) {
      fs.writeFileSync(b, `// src/core/live.ts\n${line}\n`);
      expect(node()).toEqual(['the Node bundle imports a bun: module']);
    }
    // The Bun build is judged as before: its one library, no launcher asked for.
    reset();
    fs.unlinkSync(arm);
    fs.unlinkSync(launcher);
    expect(verifyArtifact(dir, b).native).toBe('libopentui-linux-x64.so');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('native library budget: one library for the Bun build, one per platform for the Node build', () => {
  const dir = path.join(SCRATCH, 'native-budget');
  fs.mkdirSync(dir, { recursive: true });
  try {
    for (const p of ['linux-x64', 'linux-arm64']) {
      const f = path.join(dir, `libopentui-${p}.so`);
      fs.writeFileSync(f, '');
      fs.truncateSync(f, 5_400_000);
    }
    expect(assetFindings(dir, 2)).toEqual([]);
    expect(assetFindings(dir).join('\n')).toContain('2 native library files; the budget is 1');
    fs.truncateSync(path.join(dir, 'libopentui-linux-arm64.so'), 8_000_001);
    expect(assetFindings(dir, 2).join('\n')).toContain('is over the native library budget of 8000000 B each');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
