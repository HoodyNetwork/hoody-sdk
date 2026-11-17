// Facts, the grid layout: a description list drawn as ruled cells. Pins the structure (one named list, a term over its
// value in every cell), the cell plan (how many to a row, a short last row widened, the phone rule), the meter (only for
// a fact that carries one) and the stylesheet (the table header's label type, shared borders, the phone breakpoint).
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Facts } from './Display';
import { factsPlan, type Fact } from './Display.pure';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, 'Display.module.css'), 'utf8');
const facts = (n: number): Fact[] => Array.from({ length: n }, (_, i) => ({ label: `L${i + 1}`, value: `v${i + 1}` }));
const spans = (dl: Element) => [...dl.children].map((c) => (c as HTMLElement).style.getPropertyValue('--cell-span'));

describe('Facts cells: structure', () => {
  it('is one named description list; every cell holds its term, then its value', () => {
    const { container } = render(<Facts label="Room" items={facts(6)} />);
    const lists = container.querySelectorAll('dl');
    expect(lists).toHaveLength(1);
    expect(lists[0]!.getAttribute('aria-label')).toBe('Room');
    const cells = [...lists[0]!.children];
    expect(cells).toHaveLength(6);
    for (const c of cells) expect([...c.children].map((e) => e.tagName)).toEqual(['DT', 'DD']);
    expect(screen.getAllByRole('term').map((d) => d.textContent)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L6']);
    expect(screen.getAllByRole('definition').map((d) => d.textContent)).toEqual(['v1', 'v2', 'v3', 'v4', 'v5', 'v6']);
  });

  it('wide facts are full rows at the end of the same named list', () => {
    const { container } = render(<Facts label="Room" items={[...facts(2), { label: 'Path', value: '/srv/data', wide: true }]} />);
    const lists = container.querySelectorAll('dl');
    expect(lists).toHaveLength(1);
    expect(lists[0]!.getAttribute('aria-label')).toBe('Room');
    expect(spans(lists[0]!)).toEqual(['6', '6', '12']);
  });

  it('one column is compact rows; a list with a long fact becomes rows on a phone; short facts keep two cells', () => {
    const { container, rerender } = render(<Facts columns={1} items={facts(3)} />);
    const dl = () => container.querySelector('dl')!;
    expect(dl().getAttribute('data-rows')).toBe('always');
    expect([...dl().children].map((c) => [...c.children].map((e) => e.tagName))).toEqual([['DT', 'DD'], ['DT', 'DD'], ['DT', 'DD']]);
    rerender(<Facts items={[{ label: 'Memory', value: '8 GB' }, { label: 'Largest VM that can start', value: '8 GB' }]} />);
    expect(dl().getAttribute('data-rows')).toBe('narrow');
    rerender(<Facts items={[{ label: 'Memory', value: '8 GB' }, { label: 'Path', value: '/srv', wide: true }]} />);
    expect(dl().getAttribute('data-rows')).toBe('narrow');
    rerender(<Facts items={[{ label: 'Memory', value: '8 GB' }, { label: 'Cores', value: 4 }]} />);
    expect(dl().hasAttribute('data-rows')).toBe(false);
    expect(dl().getAttribute('data-phone')).toBe('two');
  });

  it('draws a meter only for a fact that carries one, under its words, named whole', () => {
    render(
      <Facts
        items={[
          { label: 'Running VMs', value: '3 of 16', meter: { value: 18.75, label: '3 of 16 VMs running' } },
          { label: 'Free disk', value: '410 GB' },
          { label: 'Kept', value: '2 of 3 kept' },
        ]}
      />,
    );
    const meters = screen.getAllByRole('meter');
    expect(meters).toHaveLength(1);
    expect(meters[0]!.getAttribute('aria-label')).toBe('3 of 16 VMs running');
    const cell = screen.getByText('Running VMs').parentElement!;
    const dd = within(cell).getByRole('definition');
    expect(dd.contains(meters[0]!)).toBe(true);
    expect(dd.firstElementChild!.textContent).toBe('3 of 16');
    expect(dd.lastElementChild).toBe(meters[0]);
  });

  it('the spec layout keeps its rows and draws no meter', () => {
    const { container } = render(<Facts layout="spec" items={[{ label: 'Running VMs', value: '3 of 16', meter: { value: 18.75, label: '3 of 16 VMs running' } }]} />);
    expect(screen.queryByRole('meter')).toBeNull();
    expect((container.querySelector('dl') as HTMLElement).style.getPropertyValue('--cell-span')).toBe('');
  });
});

describe('Facts cells: the plan', () => {
  it('up to four share a row; one column gives every fact a row', () => {
    expect([1, 2, 3, 4].map((n) => factsPlan(facts(n), 2).across)).toEqual([1, 2, 3, 4]);
    expect(factsPlan(facts(4), 1)).toMatchObject({ across: 1, last: 1 });
  });

  it('from five on, three or four to a row, whichever leaves the fuller last row', () => {
    const plan = (n: number) => { const p = factsPlan(facts(n), 2); return [p.across, p.last]; };
    expect(plan(5)).toEqual([3, 2]);
    expect(plan(6)).toEqual([3, 3]);
    expect(plan(7)).toEqual([4, 3]);
    expect(plan(8)).toEqual([4, 4]);
    expect(plan(9)).toEqual([3, 3]);
    expect(plan(10)).toEqual([4, 2]);
    expect(plan(13)).toEqual([3, 1]);
  });

  it('a web address or a long unbroken word takes half the row, never a narrower cell', () => {
    expect(factsPlan([...facts(3), { label: 'Docs', url: 'https://docs.example.test' }], 2)).toMatchObject({ across: 2, last: 2 });
    expect(factsPlan([...facts(2), { label: 'Host', value: 'ssh://root@host.example.test:22' }], 2)).toMatchObject({ across: 2, last: 1 });
    expect(factsPlan([...facts(2), { label: 'Kind', value: 'A whole machine of your own' }], 2).across).toBe(3);
  });

  it('a short last row widens to fill: no empty cell, every row adds up to twelve tracks', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13]) {
      const { container, unmount } = render(<Facts items={facts(n)} />);
      const dl = container.querySelector('dl')!;
      expect(dl.children).toHaveLength(n);
      const total = spans(dl).reduce((a, b) => a + Number(b), 0);
      expect(total % 12).toBe(0);
      unmount();
    }
    const { container } = render(<Facts items={facts(5)} />);
    expect(spans(container.querySelector('dl')!)).toEqual(['4', '4', '4', '6', '6']);
  });

  it('on a phone two short facts share a row; a long label, a long value, a link, an id or a copy takes a row', () => {
    expect(factsPlan([{ label: 'Memory', value: '8 GB' }, { label: 'Cores', value: 4 }], 2).phoneOne).toBe(false);
    expect(factsPlan([{ label: 'Largest VM that can start', value: '8 GB' }], 2).phoneOne).toBe(true);
    expect(factsPlan([{ label: 'Memory', value: '0 B in use, no limit set' }], 2).phoneOne).toBe(true);
    expect(factsPlan([{ label: 'Logs', value: 'Open', href: '/logs' }], 2).phoneOne).toBe(true);
    expect(factsPlan([{ label: 'Box', id: 'a1b2c3d4e5f6a1b2c3d4e5f6' }], 2).phoneOne).toBe(true);
    expect(factsPlan([{ label: 'Host', value: 'n12', copy: 'n12' }], 2).phoneOne).toBe(true);
    expect(factsPlan([{ label: 'State', value: <b>On</b> }], 2).phoneOne).toBe(true);
    const { container } = render(<Facts items={[{ label: 'Memory', value: '8 GB' }, { label: 'Logs', value: 'Open', href: '/logs' }]} />);
    expect(container.querySelector('dl')!.getAttribute('data-phone')).toBe('one');
  });
});

describe('Facts cells: the stylesheet', () => {
  const rule = (sel: string) => {
    const m = new RegExp(`(?:^|\\n)${sel.replace(/[.[\]'=]/g, '\\$&')} \\{([^}]*)\\}`).exec(css);
    if (!m) throw new Error(`no rule ${sel}`);
    return m[1]!;
  };

  it('the label is the table header type: mono small capitals in the muted text colour', () => {
    const label = rule('.cellLabel');
    expect(label).toMatch(/font: var\(--t-label\);/);
    expect(label).toMatch(/letter-spacing: var\(--tracking-caps\);/);
    expect(label).toMatch(/text-transform: var\(--case-caps\);/);
    expect(label).toMatch(/color: var\(--hx-muted\);/);
  });

  it('the value is ink, semibold, with tabular figures', () => {
    const value = rule('.cellValue');
    expect(value).toMatch(/color: var\(--hx-ink\);/);
    expect(value).toMatch(/font-weight: var\(--fw-semibold\);/);
    expect(value).toMatch(/font-variant-numeric: tabular-nums;/);
  });

  it('cells share solid rules on twelve tracks: the list draws the start edges, every cell its end edges', () => {
    const list = rule('.cells');
    expect(list).toMatch(/grid-template-columns: repeat\(12, minmax\(0, 1fr\)\);/);
    expect(list).toMatch(/border-block-start: var\(--bw\) solid var\(--hx-panel-line\);/);
    expect(list).toMatch(/border-inline-start: var\(--bw\) solid var\(--hx-panel-line\);/);
    const cell = rule('.cell');
    expect(cell).toMatch(/grid-column: span var\(--cell-span, 12\);/);
    expect(cell).toMatch(/border-block-end: var\(--bw\) solid var\(--hx-panel-line\);/);
    expect(cell).toMatch(/border-inline-end: var\(--bw\) solid var\(--hx-panel-line\);/);
    expect(css).not.toMatch(/dashed|dotted/);
  });

  it('rows: one label column per list on a subgrid, the same rules always and below the phone breakpoint', () => {
    for (const when of ['always', 'narrow']) {
      const list = new RegExp(`\\.cells\\[data-rows='${when}'\\] \\{\\s*grid-template-columns: fit-content\\(45%\\) minmax\\(0, 1fr\\);`);
      const cell = new RegExp(`\\.cells\\[data-rows='${when}'\\] \\.cell \\{\\s*display: grid;\\s*grid-template-columns: subgrid;\\s*grid-column: 1 / -1;`);
      expect(css).toMatch(list);
      expect(css).toMatch(cell);
    }
    expect(css).toMatch(/@container \(width < 600px\) \{\s*\.cells\[data-rows='narrow'\] \{/);
  });

  it('below the phone breakpoint: half rows, a full row for an odd last cell and for every cell of a long list', () => {
    expect(css).toMatch(/@container \(width < 600px\) \{\s*\.cells:not\(\[data-rows\]\) \.cell \{\s*grid-column: span 6;\s*\}\s*\.cells:not\(\[data-rows\]\) \.cell:nth-child\(odd\):last-child,\s*\.cells:not\(\[data-rows\]\)\[data-phone='one'\] \.cell \{\s*grid-column: span 12;/);
  });
});
