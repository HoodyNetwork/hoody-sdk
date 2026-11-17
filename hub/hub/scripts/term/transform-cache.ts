// The dev loader's transform cache: what loader.ts made of one hub/src file, kept on disk between processes.
//
// A transform (loader.ts TransformContext.transform) costs two TypeScript parses per module; a cold process spent 84 %
// of its load there. Its result depends on exactly:
//   - the file's own text;
//   - the transform context (flavour, fixtures, page, mode) and the loader's code, versions and allowances: the PACK
//     (one file per such combination and per source root, named by their hash);
//   - for a sibling: which web file it replaces and that file's text (what the sibling lacks is filled from it);
//   - what the resolver answered for each import (a `.term` sibling added or removed changes the answer);
//   - for `import.meta.glob`: a directory listing. Such a file is never cached (the loader does not ask).
// An entry is served only when every one of those is the same again; the caller re-asks the resolver, this module
// compares. A served entry is byte for byte what the transform returned when it was stored.
//
// One pack is one append-only file of lines `<json file path>\t<json entry>`; the last line of a file wins. Appends are
// one write each (several processes share a pack; a torn or foreign line is skipped). Every edit of a file appends a
// line, so a process that finds at least as many dead lines as live ones (and COMPACT_MIN_LINES in all) rewrites the
// pack with the latest line of each file (a file of its own, renamed into place; a line another process appends in
// between is lost, which costs that file one more transform). A pack over MAX_PACK_BYTES (64 MB) is started again; packs of
// another name untouched for a day are removed. HUB_TRANSFORM_CACHE=0 turns the cache off.
import fs from 'node:fs';
import path from 'node:path';

/** Every process that loads a pack holds all of it in memory, so the bound is small (the whole tree is about 50 MB). */
export const MAX_PACK_BYTES = 64 * 1024 * 1024;
const STALE_MS = 24 * 3600 * 1000;
/** Below this many lines a pack is never rewritten (nothing to gain). */
export const COMPACT_MIN_LINES = 256;

export const hashText = (s: string): string => new Bun.CryptoHasher('sha1').update(s).digest('hex');

export interface CachedTransform<R> {
  /** sha1 of the file's text. */
  source: string;
  /** A sibling's web file and the sha1 of its text; null when the file replaces nothing. */
  web: [file: string, hash: string] | null;
  /** Each import the transform resolved, with the resolver's answer as JSON, in the order asked. */
  resolved: [spec: string, answer: string][];
  code: string;
  /** sha1 of `code`: a torn line glued to the next one can never be served. */
  sum: string;
  record: R;
}

/** The state an entry must meet to be served. `answer` is asked for each import the entry recorded (null = cannot say). */
export interface Probe {
  source: string;
  web: [file: string, hash: string] | null;
  answer(spec: string): string | null;
}

export function entryHolds<R>(e: CachedTransform<R>, p: Probe): boolean {
  if (e.source !== p.source) return false;
  if ((e.web === null) !== (p.web === null)) return false;
  if (e.web && p.web && (e.web[0] !== p.web[0] || e.web[1] !== p.web[1])) return false;
  for (const [spec, answer] of e.resolved) if (p.answer(spec) !== answer) return false;
  return true;
}

export class TransformCache<R> {
  readonly file: string;
  private lines: Map<string, string> | null = null;
  private swept = false;
  hits = 0;
  misses = 0;

  /** `dir`: the cache directory; `parts`: everything every entry of this pack depends on (hashed into its name). */
  constructor(private readonly dir: string, parts: readonly unknown[]) {
    this.file = path.join(dir, `transform.${hashText(JSON.stringify(parts)).slice(0, 16)}.jsonl`);
  }

  private load(): Map<string, string> {
    if (this.lines) return this.lines;
    const m = new Map<string, string>();
    let text = '';
    try {
      if (fs.statSync(this.file).size > MAX_PACK_BYTES) fs.rmSync(this.file, { force: true });
      else text = fs.readFileSync(this.file, 'utf8');
    } catch { /* no pack yet */ }
    let at = 0;
    let total = 0;
    while (at < text.length) {
      const nl = text.indexOf('\n', at);
      if (nl < 0) break; // a line still being written by another process
      const tab = text.indexOf('\t', at);
      if (tab > at && tab < nl) m.set(text.slice(at, tab), text.slice(tab + 1, nl));
      total++;
      at = nl + 1;
    }
    if (total >= COMPACT_MIN_LINES && total - m.size >= m.size) this.compact(m);
    return (this.lines = m);
  }

  /** Rewrites the pack as the latest line of each file. */
  private compact(m: ReadonlyMap<string, string>): void {
    // A random name, created exclusively: pids repeat across pid namespaces, and two writers of one file would mix.
    const tmp = `${this.file}.${crypto.randomUUID()}.tmp`;
    try {
      let out = '';
      for (const [k, v] of m) out += `${k}\t${v}\n`;
      fs.writeFileSync(tmp, out, { flag: 'wx' });
      fs.renameSync(tmp, this.file);
    } catch { try { fs.rmSync(tmp, { force: true }); } catch { /* nothing to remove */ } }
  }

  /** The stored entry of `file` when it holds under `probe`, else null. */
  get(file: string, probe: Probe): CachedTransform<R> | null {
    const raw = this.load().get(JSON.stringify(file));
    let e: CachedTransform<R> | null = null;
    if (raw !== undefined) {
      try { e = JSON.parse(raw) as CachedTransform<R>; } catch { e = null; }
      if (e && !(typeof e.code === 'string' && typeof e.source === 'string' && Array.isArray(e.resolved) && e.sum === hashText(e.code))) e = null;
    }
    if (e && entryHolds(e, probe)) { this.hits++; return e; }
    this.misses++;
    return null;
  }

  /** Stores `entry` for `file` (one appended line). A failed write is not an error: the next process transforms again. */
  put(file: string, entry: CachedTransform<R>): void {
    const key = JSON.stringify(file);
    const raw = JSON.stringify(entry);
    this.load().set(key, raw);
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.appendFileSync(this.file, `${key}\t${raw}\n`);
      if (!this.swept) { this.swept = true; this.sweep(); }
    } catch { /* read-only or full: uncached */ }
  }

  /** Removes packs of another name that nobody wrote for a day (another loader version, context or tree). */
  private sweep(): void {
    const now = Date.now();
    for (const f of fs.readdirSync(this.dir)) {
      if (!/^transform\.[0-9a-f]{16}\.jsonl$/.test(f)) continue;
      const p = path.join(this.dir, f);
      if (p === this.file) continue;
      try { if (now - fs.statSync(p).mtimeMs > STALE_MS) fs.rmSync(p, { force: true }); } catch { /* gone */ }
    }
  }
}

/** The texts of the files whose code makes a transform, as they are now (call when the process loads that code). */
export function codeStamp(files: readonly string[]): string {
  const h = new Bun.CryptoHasher('sha1');
  for (const f of [...files].sort()) { h.update(f + '\0'); try { h.update(fs.readFileSync(f)); } catch { h.update('absent'); } h.update('\0'); }
  return h.digest('hex');
}

/**
 * HUB_TRANSFORM_CACHE=0 (or `off`, `false`, `no`) turns the cache off. Code running from a compiled binary (`from`
 * inside Bun's embedded file system) never caches: a shipped Hub writes nothing beside itself.
 */
export const transformCacheOn = (env: Readonly<Record<string, string | undefined>> = process.env, from: string = import.meta.dirname): boolean =>
  !/^(\/\$bunfs\/|[A-Za-z]:[\\/]~BUN[\\/])/.test(from) && !['0', 'off', 'false', 'no'].includes((env.HUB_TRANSFORM_CACHE ?? '').trim().toLowerCase());
