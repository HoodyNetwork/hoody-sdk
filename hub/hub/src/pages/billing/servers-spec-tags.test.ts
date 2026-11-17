// Vitest: the Bare metal view keeps the functional e2e of a list page. The shared guard
// (app/conformance.test.ts "functional e2e of list pages") selects pages by a list layout, and Plans & billing is a
// `detail` page, so it would not see the Bare metal list: this page-local check keeps the six URL-state tags and their
// proofs present in ./page.spec.ts, on the tests that drive /billing?view=servers.
import { describe, expect, it } from 'vitest';
import spec from './page.spec.ts?raw';
import { SEARCH_PROOF_TESTS, searchProofProblems } from '@app/search-proofs';

// TAGS and the @filter/@sort/@page proofs are copied from app/conformance.test.ts; keep the two in step. @search and
// @reload are proved by the shared helpers (app/e2e-search.ts): the servers rows of the inventory (app/search-proofs.ts)
// must call them.
const TAGS = ['@search', '@filter', '@sort', '@page', '@reload', '@no-match'];
const URL_PROOF: Record<string, RegExp[]> = {
  '@filter': [/(?<!not\.)toHaveURL\([^)]*\w=/],
  '@sort': [/(?<!not\.)toHaveURL\([^)]*sort=/],
  '@page': [/(?<!not\.)toHaveURL\([^)]*page=/],
};
const tests = [...spec.matchAll(/^\s*test(?:\.\w+)?\(\s*(['"`])(.*?)\1/gm)].map((m, i, all) => ({
  title: m[2] ?? '',
  body: spec.slice(m.index ?? 0, all[i + 1]?.index ?? spec.length),
}));
const servers = tests.filter((t) => t.title.startsWith('servers:') && t.body.includes('view=servers'));

describe('the Bare metal list keeps its functional e2e', () => {
  it.each(TAGS)('a servers test is tagged %s', (tag) => {
    expect(servers.some((t) => t.title.includes(tag))).toBe(true);
  });
  it('the servers @search and @reload tests call the shared search proofs (inventory rows)', () => {
    const rows = SEARCH_PROOF_TESTS.filter((r) => r.file === 'src/pages/billing/page.spec.ts');
    expect(rows.filter((r) => r.test.startsWith('servers:')).map((r) => r.helpers.join(''))).toEqual(['S', 'R']);
    expect(searchProofProblems({ 'src/pages/billing/page.spec.ts': spec }, rows, [])).toEqual([]);
  });
  it.each(Object.keys(URL_PROOF))('the servers %s test proves its state in the URL', (tag) => {
    const need = URL_PROOF[tag] ?? [];
    expect(servers.filter((t) => t.title.includes(tag)).some((t) => need.every((re) => re.test(t.body)))).toBe(true);
  });
});
