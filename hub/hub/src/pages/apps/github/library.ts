// The program library of "From GitHub": a curated list of programs a person can install from
// their GitHub repository, as data, not strings. library.json is the list (250 programs in 14 categories, checked
// against the GitHub API; the file is an
// object {categories, programs}). It is its own chunk, loaded when the library is first shown, never before.
//
// Contract, in plain words:
//   - loadLibrary() is the only way in. readLibrary() checks every field and keeps only the programs that pass, so a bad
//     row can never reach a card, a link or the installer; a file that is not the expected object reads as empty.
//   - Nothing here fetches anything: no logos, no stars, no live GitHub reads. A homepage is shown only when it is a plain
//     https address (homepageOf).
//   - The licence is as GitHub reported it on the check date: an SPDX id, or 'custom' when GitHub named none it knows
//     (NOASSERTION or missing). It never says "open source".
//   - A port is the one the project documents (it can be inside a container), or null when unknown, never "none".
//   - readInput() decides what the one box holds: words to search, a GitHub address (through parseRepo, never a looser
//     reading), or an address-like text that parseRepo refuses (a scheme, or github.com at the start followed by / : ? # or
//     nothing: shown as a bad address, never sent anywhere).
//   - The library pane (Library.tsx) is the one place that shows it.
import { type Repo, parseRepo } from '../github';

export type LibraryKind = 'web' | 'api' | 'terminal';
export const LIBRARY_KINDS: readonly LibraryKind[] = ['web', 'api', 'terminal'];

export interface LibraryCategory {
  id: string;
  label: string;
  blurb: string;
}

export interface LibraryProgram {
  /** Stable kebab-case id: the card's key and a link's gh=<id>. */
  id: string;
  name: string;
  owner: string;
  repo: string;
  category: string;
  tagline: string;
  why: string;
  kind: LibraryKind;
  port: number | null;
  stack: string;
  /** As GitHub reported it: an SPDX id, or 'custom' (GitHub named no licence it knows). */
  license: string;
  tags: readonly string[];
  popular: boolean;
  homepage: string | null;
}

export interface Library {
  categories: readonly LibraryCategory[];
  programs: readonly LibraryProgram[];
}

export const EMPTY_LIBRARY: Library = { categories: [], programs: [] };

/** Start here (the popular picks): a filter of its own, so no category may take this id. */
export const POPULAR = 'popular';

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const NAME = /^[A-Za-z0-9._-]{1,100}$/;
const TAG = /^[a-z0-9][a-z0-9+.-]{0,39}$/;
/** Bounds the list keeps (library.test pins the data to them; readLibrary drops a row past them). */
export const LIMITS = { name: 60, tagline: 60, why: 140, blurb: 80, label: 40, stack: 20, license: 40, tags: 5, homepage: 200 } as const;

const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim() === v && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);

function categoryOf(v: unknown): LibraryCategory | null {
  if (!v || typeof v !== 'object') return null;
  const c = v as Record<string, unknown>;
  // 'popular' is Start here's filter value (LibraryFilter.category), never a category's id.
  return typeof c.id === 'string' && ID.test(c.id) && c.id !== POPULAR && text(c.label, LIMITS.label) && text(c.blurb, LIMITS.blurb) ? { id: c.id, label: c.label, blurb: c.blurb } : null;
}

function programOf(v: unknown, categories: ReadonlySet<string>): LibraryProgram | null {
  if (!v || typeof v !== 'object') return null;
  const p = v as Record<string, unknown>;
  if (typeof p.id !== 'string' || !ID.test(p.id)) return null;
  if (!text(p.name, LIMITS.name) || !text(p.tagline, LIMITS.tagline) || !text(p.why, LIMITS.why) || !text(p.stack, LIMITS.stack) || !text(p.license, LIMITS.license)) return null;
  if (typeof p.owner !== 'string' || !OWNER.test(p.owner) || typeof p.repo !== 'string' || !NAME.test(p.repo) || p.repo === '.' || p.repo === '..') return null;
  if (typeof p.category !== 'string' || !categories.has(p.category)) return null;
  if (typeof p.kind !== 'string' || !(LIBRARY_KINDS as readonly string[]).includes(p.kind)) return null;
  if (p.port !== null && !(typeof p.port === 'number' && Number.isInteger(p.port) && p.port >= 1 && p.port <= 65535)) return null;
  if (!Array.isArray(p.tags) || p.tags.length > LIMITS.tags || !p.tags.every((x) => typeof x === 'string' && TAG.test(x)) || new Set(p.tags).size !== p.tags.length) return null;
  if (typeof p.popular !== 'boolean') return null;
  if (p.homepage !== null && !(typeof p.homepage === 'string' && p.homepage.length <= LIMITS.homepage)) return null;
  // Only the repository the address names reaches the installer: the pair must read back through parseRepo.
  const back = parseRepo(`https://github.com/${p.owner}/${p.repo}`);
  if (!back.ok || back.repo.owner !== p.owner || back.repo.name !== p.repo) return null;
  return {
    id: p.id,
    name: p.name,
    owner: p.owner,
    repo: p.repo,
    category: p.category,
    tagline: p.tagline,
    why: p.why,
    kind: p.kind as LibraryKind,
    port: p.port as number | null,
    stack: p.stack,
    license: p.license,
    tags: [...(p.tags as string[])],
    popular: p.popular,
    homepage: p.homepage as string | null,
  };
}

/** The library as data: every category and program that passes its checks; a repeated id or repository (owner/repo,
 *  any case) keeps only its first row, and a category with no program is left out. Anything else reads as empty. */
export function readLibrary(raw: unknown): Library {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return EMPTY_LIBRARY;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.categories) || !Array.isArray(r.programs)) return EMPTY_LIBRARY;
  const cats: LibraryCategory[] = [];
  const catIds = new Set<string>();
  for (const v of r.categories) {
    const c = categoryOf(v);
    if (c && !catIds.has(c.id)) {
      catIds.add(c.id);
      cats.push(c);
    }
  }
  const ids = new Set<string>();
  const repos = new Set<string>();
  const programs: LibraryProgram[] = [];
  for (const v of r.programs) {
    const p = programOf(v, catIds);
    if (!p) continue;
    const repo = `${p.owner}/${p.repo}`.toLowerCase();
    if (ids.has(p.id) || repos.has(repo)) continue;
    ids.add(p.id);
    repos.add(repo);
    programs.push(p);
  }
  const used = new Set(programs.map((p) => p.category));
  return { categories: cats.filter((c) => used.has(c.id)), programs };
}

let loading: Promise<Library> | undefined;
/** The library, from its own chunk (fetched once, on first use). A chunk that fails to load rejects; the next call tries again. */
export function loadLibrary(): Promise<Library> {
  loading ??= import('./library.json').then(
    (m) => readLibrary((m as { default: unknown }).default),
    (e: unknown) => {
      loading = undefined;
      throw e;
    },
  );
  return loading;
}

/** A program's project site, only when it is a plain https address (no sign-in, no port); else null. */
export function homepageOf(p: LibraryProgram): string | null {
  if (!p.homepage) return null;
  try {
    const u = new URL(p.homepage);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port ? u.href : null;
  } catch {
    return null;
  }
}

export interface Facet<T extends string = string> {
  value: T;
  count: number;
}
export interface LibraryFacets {
  /** Every category, in the file's order, with its program count. */
  categories: ReadonlyArray<Facet & { label: string }>;
  /** Each kind that has programs, in LIBRARY_KINDS order. */
  kinds: ReadonlyArray<Facet<LibraryKind>>;
  /** Stacks by count, then name. */
  stacks: readonly Facet[];
  /** Tags by count, then name. */
  tags: readonly Facet[];
  popular: number;
}

const counted = (values: readonly string[]): Facet[] => {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
};

/** The rail and filter choices, derived from the data (never a hand-kept list). */
export function deriveFacets(lib: Library): LibraryFacets {
  const per = counted(lib.programs.map((p) => p.category));
  const kinds = counted(lib.programs.map((p) => p.kind));
  return {
    categories: lib.categories.map((c) => ({ value: c.id, label: c.label, count: per.find((f) => f.value === c.id)?.count ?? 0 })),
    kinds: LIBRARY_KINDS.flatMap((k) => {
      const n = kinds.find((f) => f.value === k)?.count ?? 0;
      return n ? [{ value: k, count: n }] : [];
    }),
    stacks: counted(lib.programs.map((p) => p.stack)),
    tags: counted(lib.programs.flatMap((p) => p.tags)),
    popular: lib.programs.filter((p) => p.popular).length,
  };
}

export interface LibraryFilter {
  /** A category id, or 'popular' for Start here; absent: all programs. */
  category?: string;
  kind?: LibraryKind;
  stack?: string;
  tag?: string;
}

const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * The programs that match the words and the filter. Every word must be found in the program (its name, tagline, why,
 * owner/repo, stack or a tag; case and accents ignored). Order: name starts with the words, then name holds them, then a
 * tag is a word, then the rest; within each, the popular first, then by name. No words: popular first, then by name.
 */
export function searchLibrary(lib: Library, query: string, filter: LibraryFilter = {}): LibraryProgram[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const q = words.join(' ');
  const rank = (p: LibraryProgram): number | null => {
    const name = fold(p.name);
    const hay = [name, fold(p.tagline), fold(p.why), fold(`${p.owner}/${p.repo}`), fold(p.stack), ...p.tags].join(' ');
    if (!words.every((w) => hay.includes(w))) return null;
    if (!words.length) return 3;
    if (name.startsWith(q)) return 0;
    if (name.includes(q)) return 1;
    if (words.some((w) => p.tags.includes(w))) return 2;
    return 3;
  };
  const out: Array<{ p: LibraryProgram; r: number }> = [];
  for (const p of lib.programs) {
    if (filter.category === POPULAR ? !p.popular : filter.category && p.category !== filter.category) continue;
    if (filter.kind && p.kind !== filter.kind) continue;
    if (filter.stack && p.stack !== filter.stack) continue;
    if (filter.tag && !p.tags.includes(filter.tag)) continue;
    const r = rank(p);
    if (r !== null) out.push({ p, r });
  }
  return out.sort((a, b) => a.r - b.r || Number(b.p.popular) - Number(a.p.popular) || a.p.name.localeCompare(b.p.name)).map((x) => x.p);
}

/** The library's program for a repository (owner and name, any case; a ref or path does not change which program it is). */
export function findByRepo(lib: Library, repo: Repo): LibraryProgram | undefined {
  const o = repo.owner.toLowerCase();
  const n = repo.name.toLowerCase();
  return lib.programs.find((p) => p.owner.toLowerCase() === o && p.repo.toLowerCase() === n);
}

/** A program by its id. */
export const findById = (lib: Library, id: string): LibraryProgram | undefined => lib.programs.find((p) => p.id === id);

/** What the one box holds. `address`: parseRepo accepted it (the whole Repo, ref and path kept); `badAddress`: it reads as
 *  an address (a scheme, or github.com at the start) that parseRepo refuses; `words`: anything else, to search with. */
export type BoxInput = { kind: 'empty' } | { kind: 'address'; repo: Repo } | { kind: 'badAddress' } | { kind: 'words'; q: string };

const ADDRESS_LIKE = /^(?:[a-z][a-z0-9+.-]*:\/\/|(?:www\.)?github\.com(?:[/:?#]|$))/i;

export function readInput(input: string): BoxInput {
  const s = input.trim();
  if (!s) return { kind: 'empty' };
  const parsed = parseRepo(s);
  if (parsed.ok) return { kind: 'address', repo: parsed.repo };
  if (ADDRESS_LIKE.test(s)) return { kind: 'badAddress' };
  return { kind: 'words', q: s };
}
