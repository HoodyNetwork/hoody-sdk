// The one reader of a script file's route (`users/[id]/index.ts`, `docs/[...slug].ts`, `[[...path]].ts`), read the way hoody-exec reads it
// (its segment kinds, its terminal catch-all and routable-path rules,
// its route matching, its path cleaning and its final-segment extension strip):
//   [name]        exactly one part of the address                           (/users/123)
//   [...name]     one or more parts, never zero                             (/docs/a, /docs/a/b; /docs alone matches nothing)
//   [[...name]]   zero, one or many parts                                   (/opt, /opt/a, /opt/a/b)
//   index         ONLY a file named index answers its folder's address too   (users/[id]/index.ts → /users/7 and /users/7/index;
//                 users/[id].ts answers /users/7 only)
//   .ts           a file whose whole name is the extension (`docs/.ts`, or `.ts` at the root) answers its folder's address (`/` at the root)
//   pre / post    run around another script, never an address of their own
//   a catch-all must be the last part (an `index` aside): `docs/[...slug]/edit.ts` is not a route.
// The names are read by prefix and suffix like exec does, so `[]`, `[...]` and `[[...]]` are exec's dynamic parts with an empty name.
// Everything takes the path under default/1/ (`users/[id].ts`); the kit identity of a script stays its root-relative path and `routeOf`.
//
//   parseFile(rel)       → {segs, index, served, why}: the parts of the address, with the trailing index set aside.
//   describeFile(rel)    → what a page says about it: the pattern for people (`/*`, `/x/*`, `/x/:id`), the special parts' rules.
//   fileMatcher(rel)     → (urlPath) => boolean: whether exec would answer this URL path with this file (the Hub's alias matching).
export type SegKind = 'static' | 'param' | 'catchAll' | 'optionalCatchAll';
export interface Seg {
  readonly kind: SegKind;
  /** The text of a static part, or the parameter's name (empty for `[]`). */
  readonly text: string;
}
export type NotServed = 'catchAll' | 'middleware';

export interface ParsedFile {
  /** The parts of the address, the trailing `index` file name not among them. */
  readonly segs: readonly Seg[];
  /** The file is named index: its folder's address is its own, and so is `<folder>/index`. */
  readonly index: boolean;
  /** Exec can route to the file (a catch-all comes last; the file is not pre/post). */
  readonly served: boolean;
  /** Why not, when it is not. */
  readonly why: NotServed | null;
}

const ext = (s: string): string => s.replace(/\.(?:js|ts)$/, '');
const isOptional = (s: string): boolean => s.startsWith('[[...') && s.endsWith(']]');
const isCatchAll = (s: string): boolean => s.startsWith('[...') && s.endsWith(']');
const isDynamic = (s: string): boolean => s.startsWith('[') && s.endsWith(']');

function segOf(p: string): Seg {
  if (isOptional(p)) return { kind: 'optionalCatchAll', text: p.slice(5, -2) };
  if (isCatchAll(p)) return { kind: 'catchAll', text: p.slice(4, -1) };
  if (isDynamic(p)) return { kind: 'param', text: p.slice(1, -1) };
  return { kind: 'static', text: p };
}

export function parseFile(rel: unknown): ParsedFile | null {
  if (typeof rel !== 'string' || !/\.(?:js|ts)$/.test(rel)) return null;
  const raw = ext(rel).split('/');
  // A file named only `.ts` or `.js` answers its folder's address (exec drops the empty part); at the root that is `/`.
  const bare = raw[raw.length - 1] === '';
  if (bare) raw.pop();
  if (raw.some((p) => !p)) return null;
  const last = raw[raw.length - 1];
  // A folder named index above an extension-only file is just a folder: `docs/index/.ts` answers /docs/index (exec only descends into it for that).
  const index = !bare && last === 'index';
  const segs = (index ? raw.slice(0, -1) : raw).map(segOf);
  // exec reads pre/post from the file name, so `pre/.ts` is a route of the folder `pre`.
  if (!bare && (last === 'pre' || last === 'post')) return { segs, index, served: false, why: 'middleware' };
  // A catch-all takes the rest of the address: nothing may follow it (the index file name aside).
  const open = segs.slice(0, -1).some((s) => s.kind === 'catchAll' || s.kind === 'optionalCatchAll');
  return { segs, index, served: !open, why: open ? 'catchAll' : null };
}

export interface RouteInfo {
  /** 'unserved' for a file exec never routes to; 'static' for a plain address; else the kind of the LAST special part. */
  readonly kind: SegKind | 'unserved';
  /** The address as people write it: `/x`, `/x/:id`, `/x/*`, `/*`; empty for a file that is not served. */
  readonly pattern: string;
  /** The address of everything before the last special part (`/` for the root, `/x/:id` when an earlier part is a parameter). */
  readonly base: string;
  /** Every special part, in order: what each stands for. */
  readonly parts: readonly Seg[];
  /** Why the file is not served. */
  readonly why: NotServed | null;
  /** The file's parts, for the words a page builds from them. */
  readonly segs: readonly Seg[];
}

const part = (s: Seg): string => (s.kind === 'static' ? s.text : s.kind === 'param' ? `:${s.text || 'part'}` : '*');
const join = (segs: readonly Seg[]): string => '/' + segs.map(part).join('/');

export function describeFile(rel: unknown): RouteInfo | null {
  const f = parseFile(rel);
  if (!f) return null;
  const parts = f.segs.filter((s) => s.kind !== 'static');
  if (!f.served) return { kind: 'unserved', pattern: '', base: '', parts, why: f.why, segs: f.segs };
  const pattern = join(f.segs);
  if (!parts.length) return { kind: 'static', pattern, base: pattern, parts, why: null, segs: f.segs };
  let last = f.segs.length - 1;
  while ((f.segs[last] as Seg).kind === 'static') last--;
  return { kind: (f.segs[last] as Seg).kind, pattern, base: join(f.segs.slice(0, last)), parts, why: null, segs: f.segs };
}

/** exec's sanitizePath: the URL path as segments (decoded, characters checked, `.` `..` and empty parts gone), or null when exec answers 400. */
function urlParts(urlPath: string): string[] | null {
  const raw = urlPath.split('?')[0]?.split('#')[0] ?? '';
  let clean: string;
  try {
    clean = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (/[^a-zA-Z0-9\-_/.]/.test(clean)) return null;
  const out: string[] = [];
  for (const p of clean.split('/')) {
    if (!p || p === '.') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  // The extension is optional on the FINAL part only: /lib.js/api is the folder lib.js.
  if (out.length) out[out.length - 1] = (out[out.length - 1] as string).replace(/\.(js|ts)$/i, '');
  return out;
}

/** exec's matchRouteSegments over the file's parts. */
function walk(url: readonly string[], segs: readonly Seg[]): boolean {
  let at = 0;
  for (const s of segs) {
    if (s.kind === 'optionalCatchAll') return true;
    if (s.kind === 'catchAll') return at < url.length;
    if (s.kind === 'param') {
      if (at >= url.length) return false;
    } else if (at >= url.length || url[at] !== s.text) return false;
    at++;
  }
  return at === url.length;
}

export function fileMatcher(rel: unknown): (urlPath: string) => boolean {
  const f = parseFile(rel);
  if (!f || !f.served) return () => false;
  const withIndex: readonly Seg[] = [...f.segs, { kind: 'static', text: 'index' }];
  return (urlPath) => {
    const u = urlParts(urlPath);
    return !!u && (walk(u, f.segs) || (f.index && walk(u, withIndex)));
  };
}
