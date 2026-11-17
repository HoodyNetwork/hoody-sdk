// Vitest: column tips and autolinked cells in DataTable. A column's `meta.tip` is an InfoTip after the header text in table
// presentation and the list or card label's term, so every presentation carries the explanation. A column without its
// own `cell` shows its string through autolink(): a web address is a link, one whole address is cut in its one-line
// cell, and a secret-shaped address is masked and never an href.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createColumnHelper } from '@tanstack/react-table';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataTable } from './DataTable';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  name: string;
  size: number;
  note: string;
}
const col = createColumnHelper<Row>();
const TIP = 'The processor cores the computer has.';
const sized = (tip?: string) => [
  col.accessor('name', { header: 'Name', meta: { pinned: true, list: 'primary' } }),
  col.accessor('size', { header: 'Size', meta: { align: 'end', list: 'meta', listLabel: true, ...(tip ? { tip } : {}) }, cell: (c) => `${c.getValue()} cores` }),
];
const DATA: Row[] = [{ id: 'a', name: 'alpha', size: 4, note: '' }];
const noop = () => undefined;
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'DataTable.module.css'), 'utf8');

function setCoarse(on: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({ matches: on && (q.includes('coarse') || q.includes('hover: none')), media: q, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop, onchange: null, dispatchEvent: () => false })),
  );
}
afterEach(() => vi.unstubAllGlobals());

describe('meta.tip: the column explains itself in every presentation', () => {
  it('table: an InfoTip named for its column after the header text, outside the sort button', async () => {
    setCoarse(false);
    render(<DataTable label="Things" presentation="table" data={DATA} columns={sized(TIP)} getRowId={(r) => r.id} />);
    const th = screen.getByRole('columnheader', { name: /Size/ });
    const tip = within(th).getByRole('button', { name: 'About Size' });
    const sort = within(th).getByRole('button', { name: /^Size$/ });
    expect(sort.contains(tip)).toBe(false);
    expect(tip.compareDocumentPosition(sort) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    await userEvent.click(tip);
    expect(await screen.findByText(TIP)).toBeInTheDocument();
  });

  it('table: a column without a tip has no InfoTip', () => {
    setCoarse(false);
    render(<DataTable label="Things" presentation="table" data={DATA} columns={sized()} getRowId={(r) => r.id} />);
    expect(screen.queryByRole('button', { name: /^About / })).toBeNull();
  });

  it('list: the field label is the InfoTip term; pressing it shows the tip and does not open the row', async () => {
    setCoarse(false);
    const open = vi.fn();
    render(<DataTable label="Things" presentation="list" data={DATA} columns={sized(TIP)} getRowId={(r) => r.id} onRowAction={open} />);
    const term = screen.getByRole('button', { name: 'Size' });
    expect(term).toHaveAttribute('aria-expanded', 'false');
    expect(term.closest('tr')).not.toBeNull();
    await userEvent.click(term);
    expect(await screen.findByText(TIP)).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  });

  it('cards: the field label is the InfoTip term too', () => {
    setCoarse(false);
    render(<DataTable label="Things" presentation="cards" data={DATA} columns={sized(TIP)} getRowId={(r) => r.id} />);
    expect(screen.getByRole('button', { name: 'Size' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('list: without a tip the label stays plain text', () => {
    setCoarse(false);
    render(<DataTable label="Things" presentation="list" data={DATA} columns={sized()} getRowId={(r) => r.id} />);
    expect(screen.getByText('Size').closest('button')).toBeNull();
  });

  it('list and cards: the visually hidden header holds no tip (the title column has no label to carry it)', () => {
    setCoarse(false);
    const titled = [
      col.accessor('name', { header: 'Name', meta: { pinned: true, list: 'primary', tip: TIP } }),
      col.accessor('size', { header: 'Size', meta: { list: 'meta', listLabel: true, tip: TIP } }),
    ];
    for (const presentation of ['list', 'cards'] as const) {
      const { container, unmount } = render(<DataTable label="Things" presentation={presentation} data={DATA} columns={titled} getRowId={(r) => r.id} />);
      expect(container.querySelector('thead')?.textContent).toContain('Name');
      expect(container.querySelector('thead button')).toBeNull();
      expect(screen.queryByRole('button', { name: 'About Name' })).toBeNull();
      unmount();
    }
  });

  // listmeta-wrap: line 2 wraps whole fields onto more lines, so no field is out of sight and nothing
  // scrolls to a focused one. jsdom has no layout: listmeta-wrap.spec.ts measures it in a browser; this pins the rules.
  it('list: line 2 has no fixed height and no scroll box, so focusing a field in it hides nothing and scrolls nothing', () => {
    setCoarse(false);
    render(<DataTable label="Things" presentation="list" data={DATA} columns={sized(TIP)} getRowId={(r) => r.id} />);
    const term = screen.getByRole('button', { name: 'Size' });
    const line = term.closest('[class*="listMeta"]') as HTMLElement;
    term.focus();
    expect(document.activeElement).toBe(term);
    expect(line.scrollTop).toBe(0);
    // Every rule block whose selector list ends with `sel` (`.listLine1,\n.listLine2 {` and `.listLine2 {` both count).
    const rule = (sel: string) => [...css.matchAll(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join('\n');
    for (const sel of ['.listLine2', '.listMeta', ".listMeta:has(button, a[href], [role='button'])"]) {
      expect(rule(sel), sel).not.toBe('');
      expect(rule(sel), sel).not.toMatch(/(?:^|[\s;])(?:height|max-height)\s*:/);
      expect(rule(sel), sel).not.toMatch(/overflow(?:-[xy])?\s*:\s*(?:hidden|auto|scroll)/);
    }
    expect(rule('.listMeta')).toMatch(/flex-wrap:\s*wrap/);
  });

  it('the stylesheet: a header holding a tip is its hit height plus ring room, and a term label does not clip its focus ring', () => {
    expect(css).toMatch(/\.table \{[^}]*--th-tip-h: max\(var\(--th-h\), calc\(max\(var\(--sp-6\), var\(--touch-min\)\) \+ 2 \* var\(--sp-1\)\)\);/);
    expect(css).toMatch(/\.thead th:has\(\.thTip\) \{\s*height: var\(--th-tip-h\);/);
    // Sticky group rows stick under that header; a list's header is screen-reader only.
    expect(css).toMatch(/\.stickyGroups:not\(\.list\):has\(> \.thead \.thTip\) \{\s*--group-sticky-top: var\(--th-tip-h\);/);
    expect(css).not.toMatch(/\.thTip > button \{[^}]*margin-block/);
    expect(css).toMatch(/\.listLabel:has\(> button\) \{\s*overflow: visible;/);
    expect(css).toMatch(/\.listLabel > button \{[^}]*text-overflow: ellipsis;/);
  });
});

describe('text cells link web addresses', () => {
  const noted = [
    col.accessor('name', { header: 'Name', meta: { pinned: true, list: 'primary' } }),
    col.accessor('note', { header: 'Note' }),
    col.accessor('size', { header: 'Size' }),
  ];
  const rowWith = (note: string): Row[] => [{ id: 'a', name: 'alpha', size: 4, note }];

  it('a URL inside text becomes an external link; the words around it stay', () => {
    setCoarse(false);
    render(<DataTable label="Things" presentation="table" data={rowWith('Fetched https://example.com/notes today')} columns={noted} getRowId={(r) => r.id} />);
    const a = screen.getByRole('link', { name: /example\.com\/notes/ });
    expect(a).toHaveAttribute('href', 'https://example.com/notes');
    expect(a).toHaveAttribute('target', '_blank');
    expect(a.closest('td')?.textContent).toMatch(/^Fetched .* today$/);
    // Inside running text the link wraps with its words; only a whole-address cell is cut.
    expect(a.className).not.toMatch(/extCut/);
  });

  it('a cell that is one whole URL is a link cut at the end of its one line (its full text in a tooltip)', () => {
    setCoarse(false);
    render(<DataTable label="Things" presentation="table" data={rowWith('https://example.org/docs/tables')} columns={noted} getRowId={(r) => r.id} />);
    const a = screen.getByRole('link', { name: /example\.org\/docs\/tables/ });
    expect(a).toHaveAttribute('href', 'https://example.org/docs/tables');
    expect(a.className).toMatch(/extCut/);
  });

  it('a secret-shaped address (24-hex host) is masked whole (safeShown) and never in the DOM', () => {
    setCoarse(false);
    const url = 'https://0123456789abcdef01234567.example.net/files';
    const { container } = render(<DataTable label="Things" presentation="table" data={rowWith(url)} columns={noted} getRowId={(r) => r.id} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.innerHTML).not.toContain('0123456789abcdef01234567');
    expect(container.innerHTML).not.toContain('example.net');
    expect(container.querySelector('tbody')?.textContent).toContain('••••');
  });

  it('a cell holding a secret-shaped address with a query, a fragment or userinfo (no link) is the mask, alone or in words', () => {
    setCoarse(false);
    for (const note of [
      'https://0123456789abcdef01234567.example.net/files?x=1',
      'see https://0123456789abcdef01234567.example.net/files#top now',
      'from https://user@0123456789abcdef01234567.example.net/files and https://example.com/docs',
    ]) {
      const { container, unmount } = render(<DataTable label="Things" presentation="table" data={rowWith(note)} columns={noted} getRowId={(r) => r.id} />);
      expect(container.innerHTML).not.toContain('0123456789abcdef01234567');
      expect(container.querySelector('tbody')?.textContent).toContain('••••');
      expect(container.innerHTML).not.toContain('example.net');
      unmount();
    }
  });

  it('a secret-shaped address in a list or card field is masked too', () => {
    setCoarse(false);
    const listed = [col.accessor('name', { header: 'Name', meta: { pinned: true, list: 'primary' } }), col.accessor('note', { header: 'Note', meta: { list: 'meta' } })];
    for (const presentation of ['list', 'cards'] as const) {
      const { container, unmount } = render(<DataTable label="Things" presentation={presentation} data={rowWith('at https://0123456789abcdef01234567.example.net/files?x=1')} columns={listed} getRowId={(r) => r.id} />);
      expect(container.innerHTML).not.toContain('0123456789abcdef01234567');
      unmount();
    }
  });

  it('clicking a link in a row does not open the row', async () => {
    setCoarse(false);
    const open = vi.fn();
    render(<DataTable label="Things" presentation="table" data={rowWith('see https://example.com/docs')} columns={noted} getRowId={(r) => r.id} onRowAction={open} />);
    const a = screen.getByRole('link', { name: /example\.com\/docs/ });
    a.addEventListener('click', (e) => e.preventDefault());
    await userEvent.click(a);
    expect(open).not.toHaveBeenCalled();
  });

  it('plain text and numbers show as before; a column with its own cell is left alone', () => {
    setCoarse(false);
    const own = [col.accessor('name', { header: 'Name', meta: { pinned: true } }), col.accessor('note', { header: 'Note', cell: (c) => <span>{c.getValue()}</span> }), col.accessor('size', { header: 'Size' })];
    render(<DataTable label="Things" presentation="table" data={rowWith('https://example.com/docs')} columns={own} getRowId={(r) => r.id} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('https://example.com/docs')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('alpha')).toBeInTheDocument();
  });
});
