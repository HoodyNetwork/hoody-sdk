// An inline group header keeps its extra (chips, short
// actions) on the name's line at every width and wraps only the group's text, which on a narrow header (under 600px)
// takes a line of its own under the name. jsdom has no layout, so the proof here is the markup and the rules; Notes'
// page.spec measures the header at 1440 and 390 in a browser.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
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
  { id: 'b', name: 'bravo', group: 'two' },
  { id: 'c', name: 'charlie', group: 'three' },
];
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true } })];
const Nothing = () => null;
const GROUPS: TableGroup[] = [
  { id: 'one', label: 'One', text: <span data-testid="text-one">No notes yet.</span>, extra: <span data-testid="extra-one">Open</span> },
  { id: 'two', label: 'Two', extra: <span data-testid="extra-two">Open</span> },
  { id: 'three', label: 'Three', text: <Nothing />, extraEnd: true, extra: <span data-testid="extra-three">Resume</span> },
];
const table = (extra: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) =>
  render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} groupBy={(r) => r.group} groups={GROUPS} {...extra} />);

const css = readFileSync(join(__dirname, 'DataTable.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** One top-level rule's declarations (whitespace normalised), never a rule inside an at-rule. */
const top = (sel: string) => {
  const flat = css.replace(/@[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s*');
  const m = flat.match(new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^{}]*)\\}`));
  return m ? m[1]!.replace(/\s+/g, ' ').trim() : undefined;
};

describe('DataTable inline group header: text and extra', () => {
  it('the text sits between the name and the extra, each in its own slot; a group without text has none', () => {
    table({ presentation: 'table' });
    const text = screen.getByTestId('text-one').closest('[data-group-text]') as HTMLElement;
    const extra = screen.getByTestId('extra-one').closest('[data-group-extra-inline]') as HTMLElement;
    expect(text).not.toBeNull();
    expect(extra).not.toBeNull();
    expect(text.parentElement).toBe(extra.parentElement);
    const kids = [...text.parentElement!.children];
    expect(kids[0]!.tagName).toBe('BUTTON');
    expect(kids.indexOf(text)).toBe(1);
    expect(kids.indexOf(extra)).toBe(2);
    const two = screen.getByTestId('extra-two').closest('tr')!;
    expect(two.querySelector('[data-group-text]')).toBeNull();
    // The inline wrapper is not the stacked second line (DataTable.stacked.test reads [data-group-extra] as that).
    expect(screen.getByTestId('extra-two').closest('[data-group-extra]')).toBeNull();
  });

  it('a text whose component draws nothing leaves an empty slot, which the rules hide, as they hide an empty end slot; extraEnd keeps its end slot', () => {
    table({ presentation: 'table' });
    const row = screen.getByTestId('extra-three').closest('tr')!;
    const text = row.querySelector('[data-group-text]') as HTMLElement;
    expect(text).not.toBeNull();
    expect(text.childNodes).toHaveLength(0);
    expect(css).toMatch(/\.groupText:empty,\s*\.groupExtraInline:empty,\s*\.groupExtraEnd:empty\s*\{\s*display:\s*none;/);
    expect(screen.getByTestId('extra-three').closest('[data-group-extra-end]')).not.toBeNull();
  });

  it('a stacked header draws the text on its second line, before the extra', () => {
    table({ presentation: 'table', groupHeader: 'stacked' });
    const text = screen.getByTestId('text-one').closest('[data-group-text]') as HTMLElement;
    const extra = screen.getByTestId('extra-one').closest('[data-group-extra]') as HTMLElement;
    expect(text.nextElementSibling).toBe(extra);
  });

  it('the inline header is a grid, never a wrapping flex line: the extra keeps the name\'s line, the label gives way', () => {
    const inner = top('.groupInner:not(.groupInnerStacked)')!;
    expect(inner).toMatch(/display: grid;/);
    expect(inner).toMatch(/grid-template-columns: minmax\(0, auto\) minmax\(0, max-content\) 1fr;/);
    expect(inner).toMatch(/container: group-head \/ inline-size;/);
    // One gap between the name and the extra, as before: the grid's own gap is 0, the slots carry start margins.
    expect(inner).toMatch(/gap: 0;/);
    expect(top('.groupInner:not(.groupInnerStacked) > .groupText')).toMatch(/margin-inline-start: var\(--sp-3\);/);
    expect(top('.groupInner:not(.groupInnerStacked) > .groupExtraInline')).toMatch(/margin-inline-start: var\(--sp-3\);/);
    expect(inner).not.toMatch(/flex-wrap/);
    expect(top('.groupInner:not(.groupInnerStacked) > .groupBtn')).toMatch(/grid-area: 1 \/ 1;/);
    expect(top('.groupInner:not(.groupInnerStacked) > .groupText')).toMatch(/grid-area: 1 \/ 2;/);
    expect(top('.groupInner:not(.groupInnerStacked) > :is(.groupExtraInline, .groupExtraEnd)')).toMatch(/grid-area: 1 \/ 3;/);
    // The extra is sized first: its own minimum is its whole width, which its 1fr column takes as the column's minimum
    // (a column minimum of max-content would also take the max-content of a text spanning the columns under 600px).
    expect(top('.groupInner:not(.groupInnerStacked) > :is(.groupExtraInline, .groupExtraEnd)')).toMatch(/min-inline-size: max-content;/);
    // The label is what gives way: its button may shrink to nothing, the label ending in an ellipsis.
    expect(css).toMatch(/\.groupBtn:not\(\.groupBtnStacked\) \{\s*flex: 0 1 auto;\s*min-width: 0;/);
  });

  it('on a narrow header the text, and only it, moves to a line of its own under the name', () => {
    const at = css.match(/@container group-head \(width < 600px\) \{([\s\S]*?)\n\}/);
    expect(at).not.toBeNull();
    const body = at![1]!.replace(/\s+/g, ' ');
    expect(body).toMatch(/\.groupInner:not\(\.groupInnerStacked\) > \.groupText \{ grid-area: 2 \/ 1 \/ 3 \/ -1;/);
    expect(body).not.toMatch(/groupExtra|groupBtn/);
  });
});
