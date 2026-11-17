// Vitest: the page's questions in a list pane never shrink a fill table to a few rows, and an
// in-text FaqLink is told from its sentence by more than its colour (axe link-in-text-block).
//   - a fill table carries data-fill (a table that sizes to its rows does not);
//   - in a list pane that holds the questions, a data-fill child (or a page's wrapper holding one) does not flex and is capped at the pane's height: a long
//     table keeps the whole pane and the questions start under its end, reached by scrolling the pane; a short table or
//     any other list keeps its own height;
//   - the FaqLink trigger is underlined at rest; the peek's own action link is a standalone link and keeps the nav look.
import { createColumnHelper } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DataTable } from '../data/DataTable';

interface Row {
  id: string;
  name: string;
}
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true } })];
const ROWS: Row[] = Array.from({ length: 3 }, (_, i) => ({ id: `r${i}`, name: `row ${i}` }));

async function mount(fill: boolean | undefined) {
  const page = () => <DataTable label="Rows" columns={COLUMNS} data={ROWS} getRowId={(r) => r.id} presentation="table" {...(fill === undefined ? {} : { fill })} />;
  const router = createRouter({ routeTree: createRootRoute({ component: page }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

const flat = (src: string, sel: RegExp) => (sel.exec(src)?.[1] ?? '').replace(/\s+/g, ' ').trim();

describe('list pane questions', () => {
  afterEach(cleanup);

  it('a fill table (the default) is marked data-fill; a table that sizes to its rows is not', async () => {
    await mount(undefined);
    expect(document.querySelector('[data-table-frame]')?.hasAttribute('data-fill')).toBe(true);
    cleanup();
    await mount(false);
    expect(document.querySelector('[data-table-frame]')?.hasAttribute('data-fill')).toBe(false);
  });

  it('beside the questions a fill table is capped at the list pane, never stretched', () => {
    const css = readFileSync(join(import.meta.dirname, 'ListDetailPage.module.css'), 'utf8');
    // The table itself, or a page's wrapper around it (Scripts, Support).
    const own = flat(css, /\n\.listBody:not\(\.faqAsked\):has\(> \.listFaq\) > \[data-fill\],\n\.listBody:not\(\.faqAsked\):has\(> \.listFaq\) > :has\(\[data-fill\]\)\s*\{([^}]*)\}/);
    expect(own).toContain('flex: none;');
    expect(own).toContain('max-block-size: 100%;');
    // A cap, not a height: a short table keeps its rows' height and the questions stay right under it; a wrapper's own
    // height gives way to its content.
    expect(own).toContain('block-size: auto;');
    expect(own).not.toMatch(/(^|[ ;])block-size: (?!auto)/);
    // The pane itself is the scroller the questions are reached in.
    expect(flat(css, /\n\.listBody\s*\{([^}]*)\}/)).toContain('overflow: auto;');
  });

  it('the in-text FaqLink is underlined at rest; the peek action link is not given that rule', () => {
    const css = readFileSync(join(import.meta.dirname, 'Faq.module.css'), 'utf8');
    expect(flat(css, /\n\.inText > a\s*\{([^}]*)\}/)).toContain('text-decoration: underline;');
    const tsx = readFileSync(join(import.meta.dirname, 'Faq.tsx'), 'utf8');
    expect(tsx.match(/s\.inText/g)).toHaveLength(1);
  });
});
