// The program library (library.json) as library.ts reads it. The shipped data passes every check
// whole (no row dropped), its numbers are the checked list's (250 programs, 14 categories, 20-30 popular, few terminal
// programs), nothing in it calls a program "open source", and the reader keeps a bad row from ever reaching a card.
// The one box: words, a GitHub address (parseRepo, ref and path kept) or a bad address.
import { describe, expect, it } from 'vitest';
import raw from './library.json';
import { EMPTY_LIBRARY, LIMITS, deriveFacets, findById, findByRepo, homepageOf, loadLibrary, readInput, readLibrary, searchLibrary, type LibraryProgram } from './library';

const lib = readLibrary(raw);
const RAW = raw as { categories: unknown[]; programs: Array<Record<string, unknown>> };
const firstRow = (): Record<string, unknown> => ({ ...RAW.programs[0]! });
const withRow = (row: Record<string, unknown>) => readLibrary({ categories: RAW.categories, programs: [row] }).programs;

describe('library.json, as shipped', () => {
  it('reads whole: every row and category passes, ids and repositories are unique', () => {
    expect(RAW.programs).toHaveLength(250);
    expect(lib.programs).toHaveLength(250);
    expect(lib.categories).toHaveLength(14);
    expect(new Set(lib.programs.map((p) => p.id)).size).toBe(250);
    expect(new Set(lib.programs.map((p) => `${p.owner}/${p.repo}`.toLowerCase())).size).toBe(250);
  });

  it('keeps its bounds: taglines, whys and blurbs short, 2-5 tags, 20-30 popular picks', () => {
    for (const p of lib.programs) {
      expect(p.tagline.length, p.id).toBeLessThanOrEqual(LIMITS.tagline);
      expect(p.why.length, p.id).toBeLessThanOrEqual(LIMITS.why);
      expect(p.tags.length, p.id).toBeGreaterThanOrEqual(2);
    }
    for (const c of lib.categories) expect(c.blurb.length, c.id).toBeLessThanOrEqual(LIMITS.blurb);
    const popular = lib.programs.filter((p) => p.popular).length;
    expect(popular).toBeGreaterThanOrEqual(20);
    expect(popular).toBeLessThanOrEqual(30);
  });

  it('never says "open source" in its own words, and a licence GitHub could not name is custom, never guessed', () => {
    // Every field of the file, but one project's own name and site: "Harness Open Source" is that project's name, and its
    // site's address says so too (the one exception, pinned).
    const all = JSON.stringify({ ...RAW, programs: RAW.programs.map((p) => (p.id === 'harness' ? { ...p, name: '', homepage: '' } : p)) }).toLowerCase();
    expect(all).not.toMatch(/open[ -]source/);
    expect(lib.programs.filter((p) => /open[ -]source/i.test(`${p.name} ${p.homepage ?? ''}`)).map((p) => p.id)).toEqual(['harness']);
    // The licences as last checked: a refresh that guesses a licence for a custom row, or
    // writes none, changes these counts and fails here first.
    const counts: Record<string, number> = {};
    for (const p of lib.programs) counts[p.license] = (counts[p.license] ?? 0) + 1;
    // Which rows GitHub named no licence for, by id: a refresh that swaps a custom row's licence with another row's keeps
    // every count but changes this list.
    const CUSTOM = ['activepieces', 'adminer', 'affine', 'airbyte', 'authentik', 'automatisch', 'budibase', 'chatwoot', 'cockpit', 'cronicle', 'dify', 'directus', 'dokploy', 'duplicati', 'esphome', 'formbricks', 'glances', 'goatcounter', 'gotify', 'graylog', 'infisical', 'invoiceninja', 'joplin', 'langfuse', 'lightdash', 'litellm', 'lobehub', 'mailu', 'mattermost', 'medusa', 'meilisearch', 'metabase', 'n8n', 'nocodb', 'odoo', 'openwebui', 'outline', 'pgadmin', 'photoprism', 'pihole', 'planka', 'posthog', 'privatebin', 'redisinsight', 'rocketchat', 'seafile', 'signoz', 'stalwart', 'stirling-pdf', 'strapi', 'tandoor', 'teable', 'twenty', 'windmill', 'wordpress'];
    expect(lib.programs.filter((p) => p.license === 'custom').map((p) => p.id).sort()).toEqual(CUSTOM);
    expect(counts).toEqual({ 'AGPL-3.0': 56, 'Apache-2.0': 42, 'BSD-2-Clause': 2, 'BSD-3-Clause': 4, 'GPL-2.0': 5, 'GPL-3.0': 19, 'LGPL-3.0': 1, MIT: 62, 'MPL-2.0': 3, Zlib: 1, custom: 55 });
    for (const p of lib.programs) expect(p.license, p.id).toMatch(/^(custom|[A-Za-z0-9.+-]+)$/);
  });

  it('derives its facets from the data: categories in file order with counts, three kinds, Terminal only 2', () => {
    const f = deriveFacets(lib);
    expect(f.categories.map((c) => c.value)).toEqual(lib.categories.map((c) => c.id));
    expect(f.categories.reduce((n, c) => n + c.count, 0)).toBe(250);
    expect(f.categories.every((c) => c.count > 0)).toBe(true);
    expect(f.kinds.map((k) => k.value)).toEqual(['web', 'api', 'terminal']);
    expect(f.kinds.find((k) => k.value === 'terminal')?.count).toBe(2);
    expect(f.popular).toBe(lib.programs.filter((p) => p.popular).length);
    expect(f.stacks[0]!.count).toBeGreaterThanOrEqual(f.stacks.at(-1)!.count);
  });

  it('loads as its own chunk, the same library', async () => {
    const a = await loadLibrary();
    expect(a.programs).toHaveLength(250);
    expect(await loadLibrary()).toBe(a);
  });
});

describe('readLibrary keeps a bad row from a card', () => {
  it('reads anything but the {categories, programs} object as empty (an array included)', () => {
    expect(readLibrary(null)).toBe(EMPTY_LIBRARY);
    expect(readLibrary([])).toBe(EMPTY_LIBRARY);
    expect(readLibrary(RAW.programs)).toBe(EMPTY_LIBRARY);
    expect(readLibrary({ categories: RAW.categories })).toBe(EMPTY_LIBRARY);
  });

  it.each([
    ['an owner with a slash', { owner: 'a/b' }],
    ['a repository name ..', { repo: '..' }],
    ['a repository with a query', { repo: 'x?y=1' }],
    ['an unknown category', { category: 'nope' }],
    ['an unknown kind', { kind: 'desktop' }],
    ['a port out of range', { port: 70000 }],
    ['a port as text', { port: '8080' }],
    ['a tagline too long', { tagline: 'x'.repeat(61) }],
    ['a control character', { why: 'line\nbreak' }],
    ['six tags', { tags: ['a', 'b', 'c', 'd', 'e', 'f'] }],
    ['a tag with a space', { tags: ['two words', 'ok'] }],
    ['popular as text', { popular: 'yes' }],
    ['an id that is not kebab-case', { id: 'Bad_Id' }],
    ['a tag twice', { tags: ['chat', 'chat'] }],
  ])('drops %s', (_, change) => {
    expect(withRow({ ...firstRow(), ...change })).toEqual([]);
  });

  it('keeps the first of two rows naming the same repository in another case, or the same id', () => {
    const a = firstRow();
    const b = { ...firstRow(), id: 'other-id', owner: String(a.owner).toUpperCase() };
    const c = { ...firstRow(), repo: 'another-repo' };
    expect(readLibrary({ categories: RAW.categories, programs: [a, b, c] }).programs.map((p) => p.id)).toEqual([a.id]);
  });

  it("keeps no category with Start here's id ('popular'), so the rail's Start here always means the popular picks", () => {
    const cats = [...RAW.categories, { id: 'popular', label: 'Popular', blurb: 'Not a category' }];
    expect(readLibrary({ categories: cats, programs: [{ ...firstRow(), category: 'popular' }] }).programs).toEqual([]);
    expect(readLibrary({ categories: cats, programs: RAW.programs }).categories.map((c) => c.id)).not.toContain('popular');
  });

  it('leaves out a category no program uses', () => {
    expect(readLibrary({ categories: RAW.categories, programs: [firstRow()] }).categories.map((c) => c.id)).toEqual([firstRow().category]);
  });
});

describe('homepageOf', () => {
  const p = (homepage: string | null) => ({ ...lib.programs[0]!, homepage }) as LibraryProgram;
  it('shows only a plain https address', () => {
    expect(homepageOf(p('https://anythingllm.com'))).toBe('https://anythingllm.com/');
    expect(homepageOf(p('http://nodered.org'))).toBeNull();
    expect(homepageOf(p('https://me:pw@x.example'))).toBeNull();
    expect(homepageOf(p('https://x.example:8443/'))).toBeNull();
    expect(homepageOf(p('javascript:alert(1)'))).toBeNull();
    expect(homepageOf(p('not a url'))).toBeNull();
    expect(homepageOf(p(null))).toBeNull();
  });
});

describe('searchLibrary', () => {
  it('no words: every program, the popular first', () => {
    const all = searchLibrary(lib, '');
    expect(all).toHaveLength(250);
    const n = lib.programs.filter((p) => p.popular).length;
    expect(all.slice(0, n).every((p) => p.popular)).toBe(true);
  });

  it('every word must match; case and accents are ignored; a name that starts with the words comes first', () => {
    const r = searchLibrary(lib, 'ANYTHINGLLM');
    expect(r[0]?.id).toBe('anythingllm');
    expect(searchLibrary(lib, 'anythíngllm')[0]?.id).toBe('anythingllm');
    expect(searchLibrary(lib, 'anythingllm zzzz-no-such-word')).toEqual([]);
  });

  it('finds by owner/repo, tag and stack', () => {
    expect(searchLibrary(lib, 'Mintplex-Labs/anything-llm').map((p) => p.id)).toContain('anythingllm');
    for (const p of searchLibrary(lib, 'rag')) expect([p.name, p.tagline, p.why, `${p.owner}/${p.repo}`, p.stack, ...p.tags].join(' ').toLowerCase()).toContain('rag');
  });

  it('filters by category, Start here, kind, stack and tag', () => {
    expect(searchLibrary(lib, '', { category: 'ai' }).every((p) => p.category === 'ai')).toBe(true);
    expect(searchLibrary(lib, '', { category: 'popular' })).toHaveLength(lib.programs.filter((p) => p.popular).length);
    expect(searchLibrary(lib, '', { kind: 'terminal' })).toHaveLength(2);
    expect(searchLibrary(lib, '', { stack: 'Go' }).every((p) => p.stack === 'Go')).toBe(true);
    expect(searchLibrary(lib, '', { tag: 'chat' }).every((p) => p.tags.includes('chat'))).toBe(true);
  });
});

describe('the one box (readInput) and the library card for an address', () => {
  it('a GitHub address is an address, its ref and path kept', () => {
    expect(readInput('  https://github.com/Mintplex-Labs/anything-llm  ')).toEqual({ kind: 'address', repo: { owner: 'Mintplex-Labs', name: 'anything-llm' } });
    expect(readInput('github.com/o/r/tree/dev/apps/web')).toEqual({ kind: 'address', repo: { owner: 'o', name: 'r', ref: 'dev', path: 'apps/web' } });
  });

  it.each(['github.com?x=1', 'github.com#readme', 'http://github.com/o/r', 'https://user@github.com/o/r', 'https://github.com:443/o/r', 'https://github.com/o/r?x=1', 'https://gitlab.com/o/r', 'github.com', 'www.github.com/o/r', 'https://github.com/o/r/tree/../x'])(
    'reads %s as a bad address, never searched or sent',
    (s) => {
      expect(readInput(s)).toEqual({ kind: 'badAddress' });
    },
  );

  it('words are words (a slash or a dot inside them included), and empty is empty', () => {
    expect(readInput('chat with documents')).toEqual({ kind: 'words', q: 'chat with documents' });
    expect(readInput('ci/cd')).toEqual({ kind: 'words', q: 'ci/cd' });
    expect(readInput('node.js')).toEqual({ kind: 'words', q: 'node.js' });
    expect(readInput('   ')).toEqual({ kind: 'empty' });
  });

  it("finds the library's program for an address in any case, whatever its ref or path", () => {
    const p = findByRepo(lib, { owner: 'mintplex-labs', name: 'ANYTHING-LLM', ref: 'dev', path: 'x' });
    expect(p?.id).toBe('anythingllm');
    expect(findByRepo(lib, { owner: 'nobody-here', name: 'nothing' })).toBeUndefined();
    expect(findById(lib, 'anythingllm')?.repo).toBe('anything-llm');
    expect(findById(lib, 'no-such-id')).toBeUndefined();
  });
});
