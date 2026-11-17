// The one rule for "which native packages stay out of a build", per target (build.ts and build/hub-ship.ts).
import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HOST_PLATFORM, NATIVE_PLATFORMS, NativePackageError, OTHER_PLATFORMS, bunTarget, nativeEntryFile, nativeEntryOf, otherPlatforms, parseTarget, packageFiles, vendoredNativeDir } from './platforms';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { nativeDirPlugin, shipBuild } from '../build';

describe('native platforms', () => {
  test('a build for another platform keeps THAT package and leaves this host\'s out', () => {
    const arm = otherPlatforms('linux-arm64');
    expect(arm).toContain('@opentui/core-linux-x64');
    expect(arm).not.toContain('@opentui/core-linux-arm64');
    expect(arm).toContain('@opentui/core-linux-arm64-musl');
    expect(arm.length).toBe(NATIVE_PLATFORMS.length - 1);
  });
  test('with no target the rule is the old host list', () => {
    const old = ['darwin-x64', 'darwin-arm64', 'linux-arm64', 'linux-arm64-musl', 'linux-x64-musl', 'win32-x64', 'win32-arm64']
      .filter((p) => p !== `${process.platform}-${process.arch}`).map((p) => `@opentui/core-${p}`);
    expect([...otherPlatforms()].sort()).toEqual([...old, ...(HOST_PLATFORM === 'linux-x64' ? [] : ['@opentui/core-linux-x64'])].sort());
    expect(OTHER_PLATFORMS).toEqual(otherPlatforms());
    expect(OTHER_PLATFORMS).not.toContain(`@opentui/core-${HOST_PLATFORM}`);
  });
  test('--target: only a listed platform; anything else is a refusal that never reaches a pattern or a path', () => {
    expect(parseTarget('linux-arm64')).toEqual({ target: 'linux-arm64' });
    for (const bad of ['foo', '', undefined, 'linux-x64$|.*', '../linux-x64', 'LINUX-X64', '--minify']) {
      const r = parseTarget(bad);
      expect('error' in r && /is not a platform \(one of: darwin-x64, /.test(r.error)).toBe(true);
    }
  });
  test('the compile target Bun expects', () => {
    expect(bunTarget('linux-arm64')).toBe('bun-linux-arm64');
    expect(bunTarget('linux-x64-musl')).toBe('bun-linux-x64-musl');
    expect(bunTarget('win32-x64')).toBe('bun-windows-x64');
  });
  test('the native package entry comes from its manifest, never from an assumed file name', () => {
    expect(nativeEntryOf({ main: 'index.js', module: 'index.js', exports: { '.': { bun: './index.bun.js', import: './index.js' } } })).toBe('./index.bun.js');
    expect(nativeEntryOf({ main: 'index.js', exports: { '.': './x.js' } })).toBe('./x.js');
    expect(nativeEntryOf({ module: 'm.js', main: 'index.js' })).toBe('m.js');
    expect(nativeEntryOf({})).toBeNull();
    expect(nativeEntryOf(null)).toBeNull();
  });
});

describe('--native-dir', () => {
  const NAME = '@opentui/core-linux-arm64';
  const pkg = (manifest: unknown, files: string[] = []): string => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-native-dir-'));
    if (manifest !== undefined) fs.writeFileSync(path.join(d, 'package.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest));
    for (const f of files) fs.writeFileSync(path.join(d, f), '');
    return d;
  };
  const refusal = (dir: string): string => {
    try { nativeEntryFile(dir, NAME); } catch (e) { expect(e).toBeInstanceOf(NativePackageError); return (e as Error).message; }
    return 'NOT REFUSED';
  };
  test('the package directory with its entry file is accepted', () => {
    const d = pkg({ name: NAME, exports: { '.': { bun: './index.bun.js' } }, main: 'index.js' }, ['index.bun.js', 'index.js']);
    expect(nativeEntryFile(d, NAME)).toBe(path.join(d, 'index.bun.js'));
  });
  test('no package.json, an unreadable one, another package: refused', () => {
    expect(refusal(pkg(undefined))).toContain('no readable package.json');
    expect(refusal(pkg('{not json'))).toContain('no readable package.json');
    expect(refusal(pkg({ name: '@opentui/core-linux-x64', main: 'index.js' }, ['index.js']))).toContain('holds "@opentui/core-linux-x64", not ' + NAME);
  });
  test('an entry that is not named, does not exist, or lies outside the package: refused', () => {
    expect(refusal(pkg({ name: NAME }))).toContain('names no entry file');
    expect(refusal(pkg({ name: NAME, main: 'gone.js' }))).toContain('does not exist (gone.js)');
    const outside = pkg({ name: 'x' }, ['x.js']);
    expect(refusal(pkg({ name: NAME, main: '../' + path.basename(outside) + '/x.js' }))).toContain('outside the package');
    expect(refusal(pkg({ name: NAME, main: path.join(outside, 'x.js') }))).toContain('outside the package');
    expect(refusal(pkg({ name: NAME, main: '.' }))).toContain('outside the package');
  });
  test('a foreign target whose package is neither installed nor given: a refusal before anything is written', async () => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hub-native-none-')), 'out');
    const target = NATIVE_PLATFORMS.find((p) => p !== HOST_PLATFORM && p.startsWith('win32-'))!;
    let err: unknown = null;
    try { await shipBuild({ outdir: out, target }); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(NativePackageError);
    expect((err as Error).message).toBe(`@opentui/core-${target} is not installed beside core; pass --native-dir <its package dir>`);
    expect(fs.existsSync(out)).toBe(false);
  });
});

describe('the vendored native package of another platform', () => {
  const NAME = '@opentui/core-linux-arm64';
  const V = '0.8.4-hoody.9';
  const FILE = `opentui-core-linux-arm64-${V}.tgz`;
  /** A vendor directory holding one version: the tarball (unless `tgz: false`) and the SHA256SUMS text `sums` makes. */
  /** One ustar entry (header and padded data), as `npm pack` writes it. */
  const entry = (name: string, data: Buffer, type = '0'): Buffer => {
    const h = Buffer.alloc(512);
    h.write(name, 0, 'utf8');
    h.write('000644 \0', 100); h.write('000000 \0', 108); h.write('000000 \0', 116);
    h.write(data.length.toString(8).padStart(11, '0') + '\0', 124); h.write('00000000000\0', 136);
    h.write('        ', 148); h.write(type, 156); h.write('ustar\0' + '00', 257);
    h.write(h.reduce((n, x) => n + x, 0).toString(8).padStart(6, '0') + '\0 ', 148);
    return Buffer.concat([h, data, Buffer.alloc((512 - (data.length % 512)) % 512)]);
  };
  const tarOf = (...entries: Buffer[]): Buffer => Buffer.concat([...entries, Buffer.alloc(1024)]);
  const PACKAGE = tarOf(entry('package/package.json', Buffer.from(JSON.stringify({ name: NAME, version: V, main: 'index.js' }))), entry('package/index.js', Buffer.alloc(0)), entry('package/lib/', Buffer.alloc(0), '5'), entry('package/lib/libopentui.so', Buffer.from([0x7f, 0x45, 0xff, 0x00, 0xc3])));
  const vendor = (o: { tgz?: boolean; tar?: Buffer; sums?: (sha: string) => string | null }): string => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-vendor-'));
    const dir = path.join(root, V);
    fs.mkdirSync(dir);
    let sha = '0'.repeat(64);
    if (o.tgz !== false) {
      fs.writeFileSync(path.join(dir, FILE), zlib.gzipSync(o.tar ?? PACKAGE));
      sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, FILE))).digest('hex');
    }
    const sums = (o.sums ?? ((s) => `${s}  ${FILE}\n`))(sha);
    if (sums !== null) fs.writeFileSync(path.join(dir, 'SHA256SUMS'), sums);
    return root;
  };
  const into = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'hub-vendor-into-'));
  const refusal = (root: string): string => {
    const d = into();
    try { vendoredNativeDir(root, NAME, V, d); } catch (e) { expect(e).toBeInstanceOf(NativePackageError); expect(fs.readdirSync(d)).toEqual([]); return (e as Error).message; }
    return 'NOT REFUSED';
  };
  test('a listed tarball whose bytes match is extracted as the package directory', () => {
    const d = into();
    expect(vendoredNativeDir(vendor({}), NAME, V, d)).toBe(d);
    expect(nativeEntryFile(d, NAME)).toBe(path.join(d, 'index.js'));
    expect([...fs.readFileSync(path.join(d, 'lib', 'libopentui.so'))]).toEqual([0x7f, 0x45, 0xff, 0x00, 0xc3]);
  });
  test('the tarball is read in process: only plain files and directories, all inside the package', () => {
    expect(packageFiles(PACKAGE).map((f) => f.name)).toEqual(['package.json', 'index.js', 'lib/libopentui.so']);
    expect(() => packageFiles(tarOf(entry('package/../x', Buffer.from('x'))))).toThrow('outside the package');
    expect(() => packageFiles(tarOf(entry('package/link', Buffer.alloc(0), '2')))).toThrow('not a file or a directory');
    expect(() => packageFiles(tarOf(entry('package/a', Buffer.from('abc'))).subarray(0, 513))).toThrow('truncated');
    expect(() => packageFiles(tarOf())).toThrow('no files');
    expect(refusal(vendor({ tar: tarOf(entry('package/link', Buffer.alloc(0), '2')) }))).toContain('not a package tarball');
  });
  test('no tarball for that platform and version: null, nothing refused', () => {
    expect(vendoredNativeDir(vendor({ tgz: false }), NAME, V, into())).toBeNull();
    expect(vendoredNativeDir(vendor({}), NAME, '0.8.4-hoody.8', into())).toBeNull();
    expect(vendoredNativeDir(vendor({}), '@opentui/core-win32-x64', V, into())).toBeNull();
  });
  test('a tarball SHA256SUMS does not name, or with other bytes, or with no list at all: refused, nothing extracted', () => {
    expect(refusal(vendor({ sums: () => null }))).toContain('not named in SHA256SUMS');
    expect(refusal(vendor({ sums: (s) => `${s}  opentui-core-linux-x64-${V}.tgz\n` }))).toContain('not named in SHA256SUMS');
    expect(refusal(vendor({ sums: () => `${'ab'.repeat(32)}  ${FILE}\n` }))).toContain('bytes differ from its SHA256SUMS entry');
  });
});

describe('a cross build\'s own native package (a vendored tarball, --native-dir)', () => {
  test('its entry is served like the installed one: the library path is resolved beside the bundle, never left relative to the working directory', async () => {
    // The package as published: its entry hands on the file import as written. The directory has no @opentui/core-* name.
    const pkg = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-native-entry-'));
    const NAME = '@opentui/core-linux-arm64';
    fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: NAME, exports: { '.': { bun: './index.bun.js' } } }));
    fs.writeFileSync(path.join(pkg, 'index.bun.js'), 'const module = await import("./libopentui.so", { with: { type: "file" } })\n\nexport default module.default\n');
    fs.writeFileSync(path.join(pkg, 'libopentui.so'), Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
    const src = path.join(pkg, 'entry.ts');
    fs.writeFileSync(src, `export const lib = (await import(${JSON.stringify(NAME)})).default;\n`);
    const out = path.join(pkg, 'out');
    const res = await Bun.build({ entrypoints: [src], outdir: out, target: 'bun', format: 'esm', plugins: [nativeDirPlugin({ name: NAME, file: nativeEntryFile(pkg, NAME) })] });
    expect(res.success).toBe(true);
    const js = fs.readFileSync(path.join(out, 'entry.js'), 'utf8');
    const emitted = fs.readdirSync(out).find((f) => /^libopentui-.*\.so$/.test(f))!;
    expect(emitted).toBeDefined();
    expect(js).toContain('resolve(import.meta.dir, ');
    // The asset's name appears once, as the value handed to resolve(): no second, bare use of it.
    expect(js.split(`"./${emitted}"`).length - 1).toBe(1);
    expect(js).not.toContain('module.default');
  });
});
