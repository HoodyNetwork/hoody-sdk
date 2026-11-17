// A leaf module (no imports but node's own): build/measure-run.ts read OTHER_PLATFORMS from ../build, and build.ts awaits
// import('./build/measure-run') at top level: one evaluation cycle, the same hang as goldens.ts <-> render.ts (see
// goldens-entry.term.test.ts).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/** Every platform OpenTUI core imports a native package for, by a literal dynamic import. */
export const NATIVE_PLATFORMS = ['darwin-x64', 'darwin-arm64', 'linux-x64', 'linux-arm64', 'linux-arm64-musl', 'linux-x64-musl', 'win32-x64', 'win32-arm64'] as const;
export type NativePlatform = (typeof NATIVE_PLATFORMS)[number];
export const isNativePlatform = (s: unknown): s is NativePlatform => (NATIVE_PLATFORMS as readonly unknown[]).includes(s);
/** This host as Node names it. It cannot tell a musl host: process.arch gives `linux-x64` there too (a musl build
 *  names its target). On a platform outside the list nothing is filtered out below, as before. */
export const HOST_PLATFORM = `${process.platform}-${process.arch}`;
/** Native packages a build for `target` leaves out (external): every platform's but the target's. The ONE rule,
 *  for the bundle (build.ts) and for the compile (build/hub-ship.ts). */
export const otherPlatforms = (target: string = HOST_PLATFORM): string[] => NATIVE_PLATFORMS.filter((p) => p !== target).map((p) => `@opentui/core-${p}`);
/** Native packages of other platforms than this host. */
export const OTHER_PLATFORMS = otherPlatforms();
/** `--target` as given on a command line: a listed platform or a refusal text (the caller exits 1 before any build). */
export const parseTarget = (s: string | undefined): { target: NativePlatform } | { error: string } =>
  isNativePlatform(s) ? { target: s } : { error: `--target ${JSON.stringify(s ?? '')} is not a platform (one of: ${NATIVE_PLATFORMS.join(', ')})` };
/** `bun build --compile --target` for a native platform (Bun says `windows` where the packages say `win32`). */
export const bunTarget = (target: NativePlatform): string => `bun-${target.replace(/^win32-/, 'windows-')}`;
/** The file a native package's manifest names for Bun (`exports["."].bun`, or `exports["."]` when it is one string,
 *  else `module`, else `main`), relative to the package; null when it names none. */
export function nativeEntryOf(manifest: unknown): string | null {
  const m = (manifest ?? {}) as { exports?: Record<string, unknown>; module?: unknown; main?: unknown };
  const root = m.exports?.['.'];
  const bun = typeof root === 'string' ? root : root && typeof root === 'object' ? (root as { bun?: unknown }).bun : undefined;
  for (const v of [bun, m.module, m.main]) if (typeof v === 'string' && v !== '') return v;
  return null;
}
/** A build refused because of the target's native package (exit 1 with this message, before anything is written). */
export class NativePackageError extends Error {}
/** The entry file of the native package in `dir`, as its own manifest names it for Bun: `dir` must hold exactly
 *  `nativePackage`, and the entry must be an existing file INSIDE `dir`. */
export function nativeEntryFile(dir: string, nativePackage: string): string {
  let manifest: { name?: unknown };
  try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch { throw new NativePackageError(`--native-dir ${dir}: no readable package.json`); }
  if (manifest.name !== nativePackage) throw new NativePackageError(`--native-dir ${dir}: holds ${JSON.stringify(manifest.name ?? null)}, not ${nativePackage}`);
  const rel = nativeEntryOf(manifest);
  if (rel === null) throw new NativePackageError(`--native-dir ${dir}: its package.json names no entry file`);
  const file = path.resolve(dir, rel);
  const within = path.relative(path.resolve(dir), file);
  if (within === '' || within.startsWith('..') || path.isAbsolute(within)) throw new NativePackageError(`--native-dir ${dir}: its package.json names an entry outside the package (${rel})`);
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) throw new NativePackageError(`--native-dir ${dir}: its package.json names an entry file that does not exist (${rel})`);
  return file;
}
/** The vendored tarball of a native package (`<vendor>/<version>/opentui-core-<platform>-<version>.tgz`), extracted
 *  into `into`: where the package of another platform comes from on a build machine (an install skips a native package
 *  of another cpu). Null when that version's directory holds no such tarball. The tarball must be named in the
 *  directory's SHA256SUMS and its bytes must match the entry: anything else is refused, nothing extracted. */
export function vendoredNativeDir(vendor: string, nativePackage: string, version: string, into: string): string | null {
  const file = `opentui-${nativePackage.replace(/^@opentui\//, '')}-${version}.tgz`;
  const dir = path.join(vendor, version);
  const tgz = path.join(dir, file);
  if (!fs.statSync(tgz, { throwIfNoEntry: false })?.isFile()) return null;
  let sums = '';
  try { sums = fs.readFileSync(path.join(dir, 'SHA256SUMS'), 'utf8'); } catch { /* no list: refused below */ }
  const want = sums.split('\n').map((l) => /^([0-9a-f]{64}) [ *](\S+)$/.exec(l)).find((m) => m?.[2] === file)?.[1];
  if (want === undefined) throw new NativePackageError(`vendored ${file}: not named in SHA256SUMS beside it`);
  const bytes = fs.readFileSync(tgz);
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== want) throw new NativePackageError(`vendored ${file}: its bytes differ from its SHA256SUMS entry`);
  let entries: { name: string; data: Buffer }[];
  try { entries = packageFiles(zlib.gunzipSync(bytes)); } catch (e) { throw new NativePackageError(`vendored ${file}: not a package tarball (${e instanceof Error ? e.message : String(e)})`); }
  for (const f of entries) {
    fs.mkdirSync(path.dirname(path.join(into, f.name)), { recursive: true });
    fs.writeFileSync(path.join(into, f.name), f.data);
  }
  return into;
}
/** The regular files of an npm package tarball (ustar; every entry under one top directory, which is dropped), read in
 *  process: no `tar` is started. An entry that is not a plain file or directory, or whose path leaves the package,
 *  throws. */
export function packageFiles(tar: Buffer): { name: string; data: Buffer }[] {
  const out: { name: string; data: Buffer }[] = [];
  const text = (b: Buffer): string => { const z = b.indexOf(0); return b.subarray(0, z < 0 ? b.length : z).toString('utf8'); };
  for (let at = 0; at + 512 <= tar.length;) {
    const h = tar.subarray(at, at + 512);
    if (h.every((x) => x === 0)) break;
    const size = parseInt(text(h.subarray(124, 136)).trim() || '0', 8);
    const type = String.fromCharCode(h[156]!);
    const full = [text(h.subarray(345, 500)), text(h.subarray(0, 100))].filter(Boolean).join('/');
    if (!Number.isSafeInteger(size) || size < 0 || at + 512 + size > tar.length) throw new Error('a truncated entry');
    if (type === '0' || type === '\0') {
      const rel = full.split('/').slice(1);
      if (rel.length === 0 || rel.some((p) => p === '' || p === '.' || p === '..') || full.startsWith('/')) throw new Error('an entry outside the package');
      out.push({ name: rel.join('/'), data: Buffer.from(tar.subarray(at + 512, at + 512 + size)) });
    } else if (type !== '5') {
      throw new Error('an entry that is not a file or a directory');
    }
    at += 512 + Math.ceil(size / 512) * 512;
  }
  if (out.length === 0) throw new Error('no files');
  return out;
}
