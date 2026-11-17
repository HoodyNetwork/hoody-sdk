// DataTable conformance over pages:
//   - a page's main list (a DataTable fed by useDataView: `view=`) offers the toolbar Reload through
//     `onRefresh=`, so refresh sits in one place on every list;
//   - no page uses the legacy DataTable search (`searchParam=`, `searchText=`, or `search=` without a
//     view): search, filters, sort and paging go through useDataView and its URL state.
// A main list is judged as the hub/use-data-view lint rule does: <DataTable view={view}>. Bare
// sub-tables (no view, no search) are untouched by both rules. Same scoping as conformance.test.ts:
// `hub:check --page <id>` (HUB_CHECK_PAGE) judges only that page.
import { describe, expect, it } from 'vitest';
import { allowNoRefresh, allowPages } from './conformance/allow';

const raw = (pattern: Record<string, unknown>) => Object.fromEntries(Object.entries(pattern).map(([f, text]) => [f, String(text)]));
const folders = Object.keys(import.meta.glob('../pages/*/page.ts')).map((f) => f.split('/')[2] as string);
const only = process.env.HUB_CHECK_PAGE;
const scoped = (id: string): boolean => !only || id === only;

const sources = raw(
  import.meta.glob(['../pages/*/**/*.tsx', '!../pages/*/**/*.test.tsx'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
);

/** Main lists that may go without a Reload (`<page>/<file>:<line>`; dataTable.noRefresh rows, with the reason). Keep it short. */
const NO_REFRESH_OK = allowNoRefresh();

interface Tag {
  file: string;
  line: number;
  attrs: string;
}

/** Every `<DataTable ...>` opening tag: its attribute text up to the `>` at brace depth 0. */
export function dataTableTags(file: string, text: string): Tag[] {
  const out: Tag[] = [];
  // `<DataTable<Row>` (a type argument) included: its `>` does not end the tag.
  for (const m of text.matchAll(/<DataTable\b(?:<[^<>]*>)?/g)) {
    const start = (m.index ?? 0) + m[0].length;
    let depth = 0;
    let quote = '';
    let i = start;
    for (; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === quote && text[i - 1] !== '\\') quote = '';
        continue;
      }
      if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0 && text[i - 1] !== '=') break;
    }
    out.push({ file, line: text.slice(0, m.index).split('\n').length, attrs: text.slice(start, i) });
  }
  return out;
}

const attr = (t: Tag, name: string): boolean => new RegExp(`(^|\\s)${name}(=|\\s|$)`).test(t.attrs);
const tags = Object.entries(sources).flatMap(([file, text]) => dataTableTags(file.replace('../pages/', ''), text));
const pageOf = (t: Tag) => t.file.split('/')[0] ?? '';
/** `bare` or `bare={true}`; `bare={false}` is a full table. */
const isBare = (t: Tag): boolean => attr(t, 'bare') && !/(^|\s)bare=\{\s*false\s*\}/.test(t.attrs);
/** Pages still migrating to countLabel (kit tables, dataTable.noCountLabel rows). It only shrinks. */
const NO_COUNT_LABEL_PAGES = allowPages('dataTable.noCountLabel');
const where = (t: Tag) => `${t.file}:${t.line}`;

describe('DataTable on pages', () => {
  it.each(folders.filter(scoped))('%s: every main list (view=) has onRefresh', (id) => {
    const bad = tags.filter((t) => pageOf(t) === id && attr(t, 'view') && !attr(t, 'onRefresh') && !NO_REFRESH_OK.has(where(t)));
    expect(bad.map(where), `pages/${id}: give <DataTable view={view}> the kit prop onRefresh={() => void query.refetch()} (Reload at the toolbar end), as hub/templates/page-table and page-list-detail do`).toEqual([]);
  });

  it.each(folders.filter(scoped))('%s: no legacy DataTable search (searchParam, searchText, search without view)', (id) => {
    const bad = tags.filter((t) => pageOf(t) === id && (attr(t, 'searchParam') || attr(t, 'searchText') || (attr(t, 'search') && !attr(t, 'view'))));
    expect(bad.map(where), `pages/${id}: drop the DataTable props searchParam/searchText; declare useDataView({ search }) (@kit) and pass <DataTable view={view}>, as hub/templates/page-table does`).toEqual([]);
  });

  it.each(folders.filter(scoped))('%s: every non-bare DataTable names its count (countLabel=)', (id) => {
    const bad = tags.filter((t) => pageOf(t) === id && !isBare(t) && !attr(t, 'countLabel') && !NO_COUNT_LABEL_PAGES.has(id));
    expect(bad.map(where), `pages/${id}: pass countLabel={(n) => t('…count', { count: n })} so the toolbar says "8 computers", not "8 rows" (bare tables show no count and are exempt)`).toEqual([]);
  });

  it('the countLabel migrating-page list only names pages that still lack it (shrink it, then tell the kit tables owner)', () => {
    const stale = [...NO_COUNT_LABEL_PAGES].filter((p) => scoped(p) && !tags.some((t) => pageOf(t) === p && !isBare(t) && !attr(t, 'countLabel')));
    expect(stale, 'drop dataTable.noCountLabel from these pages\' hub/src/pages/<page>/conformance.allow.ts and tell the kit tables owner "countLabel migrated: <page>"').toEqual([]);
  });

  it('the no-refresh allow-list only names main lists that still exist', () => {
    const live = new Set(tags.filter((t) => attr(t, 'view')).map(where));
    expect([...NO_REFRESH_OK].filter((k) => !live.has(k)), 'remove these from dataTable.noRefresh in hub/src/pages/<page>/conformance.allow.ts').toEqual([]);
  });

  it('the tag reader sees attributes across lines and braces', () => {
    const [t] = dataTableTags('x.tsx', `<DataTable\n  view={view}\n  actions={(r) => [{ a: 1 }]}\n  onRefresh={() => q.refetch()}\n/>`);
    expect(t && attr(t, 'view') && attr(t, 'onRefresh') && !attr(t, 'search')).toBe(true);
    const [g] = dataTableTags('x.tsx', `<DataTable<SubRow>
  view={view}
/>`);
    expect(g && attr(g, 'view') && !attr(g, 'onRefresh')).toBe(true);
  });
});
