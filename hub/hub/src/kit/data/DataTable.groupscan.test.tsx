// Vitest: a grouped table reads as heading, children and callout. A group's count can be
// drawn in words (TableGroup.countLabel, "1 Bot"), which stay part of the header button's name; every grouped row is
// indented, stacked or not; and the CSS rules the browser spec (groupscan.spec.ts) measures are pinned here by name.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createColumnHelper } from '@tanstack/react-table';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataTable, type TableGroup } from './DataTable';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  name: string;
  group: string;
}
const ROWS: Row[] = [
  { id: 'a', name: 'alpha', group: 'one' },
  { id: 'b', name: 'bravo', group: 'one' },
  { id: 'c', name: 'charlie', group: 'two' },
];
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true } })];
const table = (groups: TableGroup[], extra: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) =>
  render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} groupBy={(r) => r.group} groups={groups} {...extra} />);

afterEach(cleanup);

describe('TableGroup.countLabel', () => {
  it('draws the words in place of the number, and the header button is named by its label and those words', () => {
    table([
      { id: 'one', label: 'atlas', countLabel: '2 Bots' },
      { id: 'two', label: 'cinder', countLabel: <span>1 Bot</span> },
    ]);
    expect(screen.getByRole('button', { name: 'atlas 2 Bots' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'cinder 1 Bot' })).toBeTruthy();
  });

  it('without it the count is the number of the group\'s rows, or its whole count when given', () => {
    table([
      { id: 'one', label: 'atlas' },
      { id: 'two', label: 'cinder', count: 7 },
    ]);
    expect(screen.getByRole('button', { name: 'atlas 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'cinder 7' })).toBeTruthy();
  });
});

describe('grouped rows are the group\'s children', () => {
  for (const presentation of ['table', 'list'] as const) {
    it(`${presentation}: every row under an inline header carries the indent`, () => {
      table([{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }], { presentation });
      expect(document.querySelectorAll('tr[data-row-id] [data-group-indent]')).toHaveLength(3);
    });
  }

  it('an ungrouped table indents nothing', () => {
    render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} />);
    expect(document.querySelectorAll('[data-group-indent]')).toHaveLength(0);
  });
});

describe('the rules groupscan.spec.ts measures', () => {
  const css = readFileSync(join(__dirname, 'DataTable.module.css'), 'utf8');
  const tokens = readFileSync(join(__dirname, '..', 'tokens.css'), 'utf8');
  const rule = (sel: string) => {
    const at = css.indexOf(`\n${sel} {`);
    expect(at, `${sel} is in DataTable.module.css`).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf('}', at));
  };

  it('a heading: --t-group (the text font at 600 14/20) on its own band, its count in the small text font', () => {
    expect(tokens).toMatch(/--t-group: 600 14px\/20px var\(--font-text\);/);
    expect(rule('.groupBtn')).toMatch(/font: var\(--t-group\);/);
    expect(rule('.groupBtn')).not.toMatch(/text-transform|letter-spacing/);
    expect(rule('.groupCount')).toMatch(/font: var\(--t-small\);/);
    expect(rule('.groupRow > td')).toMatch(/background: var\(--hx-sec-bg\);/);
  });

  it('cards and the folder grid keep their header shades: transparent cards, the page shade under icons', () => {
    expect(rule('.cards .groupRow > td,\n.cards .expandedRow > td')).toMatch(/background: transparent;/);
    expect(rule('.icons .groupRow > td')).toMatch(/background: var\(--hx-bg\);/);
  });

  it('three edges: the chevron in the lead column, the rows --group-indent in, the note half that', () => {
    expect(rule('.table')).toMatch(/--group-indent: calc\(var\(--rail-lead\) \+ var\(--rail-gap\)\);/);
    expect(rule('.table')).toMatch(/--group-note-indent: calc\(var\(--group-indent\) \/ 2\);/);
    expect(rule('.groupBtn')).toMatch(/gap: var\(--rail-gap\);/);
    expect(rule('.groupBtn > svg')).toMatch(/inline-size: var\(--rail-lead\);/);
    expect(rule('.rail .tr > .listCell.listCell.groupIndent')).toMatch(/padding-inline-start: calc\(var\(--rail-pad\) \+ var\(--group-indent\)\);/);
    expect(rule('.groupNoteRow > td')).toMatch(/calc\(var\(--sp-4\) \+ var\(--group-note-indent\)\)/);
    expect(rule('.rail .groupNoteRow > td')).toMatch(/calc\(var\(--rail-pad\) \+ var\(--group-note-indent\)\)/);
  });

  it('the note is a boxed callout, a flush Band included', () => {
    expect(rule('.groupNote > [data-band-flush]')).toMatch(/border: var\(--bw\) solid var\(--nt-line\);/);
    // Only a direct flush Band is a callout of its own: a Band nested in plain content keeps the plain box around all of it.
    expect(rule('.groupNote:not(:has(> [data-band-flush]))')).toMatch(/border: var\(--bw\) solid var\(--hx-notice-line\);/);
    expect(rule('.groupNoteRow > td')).toMatch(/border-block-end: 0;/);
  });

  it('the planner gives the 24 px indent to the first column (DataTable.tsx GROUP_INDENT = --group-indent)', () => {
    const tsx = readFileSync(join(__dirname, 'DataTable.tsx'), 'utf8');
    const px = (name: string) => Number(new RegExp(`${name}: (\\d+)px;`).exec(tokens)?.[1]);
    const lead = /--rail-lead: var\(--sp-(\d)\)/.exec(tokens)?.[1];
    const gap = /--rail-gap: var\(--sp-(\d)\)/.exec(tokens)?.[1];
    expect(lead && gap, '--rail-lead and --rail-gap are spacing steps').toBeTruthy();
    expect(/const GROUP_INDENT = (\d+);/.exec(tsx)?.[1]).toBe(String(px(`--sp-${lead}`) + px(`--sp-${gap}`)));
  });
});
