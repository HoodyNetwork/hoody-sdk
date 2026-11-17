// Vitest: table rows and group rows take their heights from one table token, and every three-dot (more actions) button
// is the kit's small grey plate, whatever size its row asks for.
// The CSS is read as text (a CSS module import gives class names, not rules); the components are rendered to prove which
// buttons carry the look. The computed side, both themes, is d1rows.spec.ts.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionMenu } from '../overlays/Menu';
import { IconButton } from '../controls/Button';
import { DataTable } from './DataTable';
import kitStrings from '../strings.en.json';

// The table's view state lives in the URL; this test renders it bare.
vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

const KIT = path.join(import.meta.dirname, '..');
const read = (f: string) => readFileSync(path.join(KIT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of the first rule whose selector list is exactly `sel`. */
function rule(file: string, sel: string): Map<string, string> | null {
  const text = read(file);
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if ((m[1] ?? '').replace(/\s+/g, ' ').trim() !== sel) continue;
    const out = new Map<string, string>();
    for (const d of (m[2] ?? '').split(';')) {
      const i = d.indexOf(':');
      if (i > 0) out.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
    }
    return out;
  }
  return null;
}
const root = rule('tokens.css', ':root');
const darkRoot = rule('tokens.css', ':root[data-hx-theme="dark"]');
const dark = (name: string) => darkRoot?.get(name);

describe('rows', () => {
  it('a table data row is 44 px, a minimum that keeps the coarse 48', () => {
    expect(root?.get('--table-row-h')).toBe('max(44px, var(--row-h))');
    expect(rule('data/DataTable.module.css', '.tr')?.get('height')).toBe('var(--table-row-h)');
  });
  it('--row-h itself stays 36 (its non-table users keep their size), dense and 2-line rows unchanged', () => {
    expect(root?.get('--row-h')).toBe('36px');
    expect(root?.get('--row-h-dense')).toBe('32px');
    expect(root?.get('--row-h-2line')).toBe('56px');
    expect(rule('data/DataTable.module.css', "[data-density='compact'] .tr")?.get('height')).toBe('var(--row-h-dense)');
  });
  it('a group header row is 40 px as drawn: 39 plus its 1 px rule', () => {
    expect(root?.get('--group-row-h')).toBe('39px');
  });
  it('a group header above cards or tiles keeps its 32 px (card-style tables are not changed)', () => {
    expect(root?.get('--group-row-h-tiles')).toBe('32px');
    expect(rule('data/DataTable.module.css', '.cards')?.get('--group-row-h')).toBe('var(--group-row-h-tiles)');
    expect(rule('data/DataTable.module.css', '.icons')?.get('--group-row-h')).toBe('var(--group-row-h-tiles)');
  });
  // Billing plans has no table since the plan columns: its plans are kit PlanCards.
  // Keys candidates are a kit ItemList: no plain table is left there.
  it('the plain table that is a data table (AI usage) takes the table row height', () => {
    expect(rule('agent/Usage.module.css', '.table tbody tr')?.get('height')).toBe('var(--table-row-h)');
  });
  it('the table skeleton rows follow the table row height', () => {
    expect(rule('states/States.module.css', '.sk_table .skRow')?.get('height')).toBe('var(--table-row-h)');
  });
  it('the virtualizer estimates 44 for a row and 40 for a group row', () => {
    const src = read('data/DataTable.tsx');
    expect(src).toMatch(/density === 'compact' \? 32 : 44;/);
    expect(src).toMatch(/kind === 'group' \? 40 : rowH/);
  });
});

describe('three-dot look (the small grey plate)', () => {
  it('light: the plate #e3e3e3 in a #7a7a7a frame, hover #d6d6d6 in a full-ink frame, pressed #cacaca', () => {
    expect(root?.get('--hx-btn-plate')).toBe('#e3e3e3');
    expect(root?.get('--hx-btn-line')).toBe('#7a7a7a');
    expect(root?.get('--hx-btn-plate-hover')).toBe('#d6d6d6');
    expect(root?.get('--hx-btn-line-hover')).toBe('#101010');
    expect(root?.get('--hx-btn-plate-press')).toBe('#cacaca');
  });
  it('dark: the plate, its frame and its steps have their own values', () => {
    expect(dark('--hx-btn-plate')).toBe('#222225');
    expect(dark('--hx-btn-line')).toBe('#6d6d70');
    expect(dark('--hx-btn-plate-hover')).toBe('#2d2d31');
    expect(dark('--hx-btn-plate-press')).toBe('#38383d');
    expect(dark('--hx-btn-line-hover')).toBe('#ededed');
  });
  it('the look: every plate paints through --plate and --plate-line, with one hover and one pressed step; a three-dot is the small plate', () => {
    const base = rule('controls/Button.module.css', '.button');
    expect(base?.get('--plate')).toBe('var(--hx-btn-plate)');
    expect(base?.get('--plate-line')).toBe('var(--hx-btn-line)');
    expect(rule('controls/Button.module.css', '.button[data-hovered]')?.get('--plate')).toBe('var(--hx-btn-plate-hover)');
    expect(rule('controls/Button.module.css', '.button[data-hovered]')?.get('--plate-line')).toBe('var(--hx-btn-line-hover)');
    expect(rule('controls/Button.module.css', '.button[data-pressed]')?.get('--plate')).toBe('var(--hx-btn-plate-press)');
    const more = rule('controls/Button.module.css', '.iconOnly.more:not(.toolbar, .inStrip)');
    expect(more?.get('--plate-h')).toBe('var(--btn-h-sm)');
    expect(more?.get('--plate-cut')).toBe('var(--btn-cut-sm)');
    expect(root?.get('--btn-h-sm')).toBe('28px');
    // No rule gives a three-dot a fill or a line of its own: it is the plate.
    expect(read('controls/Button.module.css')).not.toMatch(/\.more[^{]*\{[^}]*\b(background|border-color)\s*:/);
  });
  it('in a table row the button takes its kit size: no table rule sizes it (DataTable.xs.test.tsx: sm at the default density; xs when compact)', () => {
    expect(rule('data/DataTable.module.css', '[data-row-menu][data-row-actions] .rowMore')).toBeNull();
    expect(rule('data/DataTable.module.css', "[data-density='compact'] [data-row-menu][data-row-actions] .rowMore")).toBeNull();
  });
});

describe('which buttons carry the look', () => {
  const cls = (name: string) => screen.getByRole('button', { name }).className;
  it('the Row actions button of a table row (sm at the default density)', () => {
    render(
      <DataTable
        label="T"
        data={[{ id: 'a', name: 'Alpha' }]}
        columns={[{ id: 'name', header: 'Name', accessorKey: 'name' }]}
        getRowId={(r: { id: string }) => r.id}
        actions={() => [{ id: 'x', label: 'X', onAction: () => undefined }]}
      />,
    );
    const b = screen.getAllByRole('button', { name: kitStrings['table.rowActions'] })[0];
    expect(b?.className).toMatch(/\bmore\b/);
    expect(b?.className).toMatch(/\browMore\b/);
    expect(b?.className).toMatch(/\bsm\b/);
  });
  it('an ActionMenu default dots trigger (More actions), not one marked plain, not another icon', () => {
    render(
      <>
        <ActionMenu label="More vault actions" items={[{ id: 'a', label: 'A', onAction: () => undefined }]} />
        <ActionMenu label="Board menu" plain items={[{ id: 'b', label: 'B', onAction: () => undefined }]} />
        <ActionMenu label="Run here" icon="terminal" items={[{ id: 'c', label: 'C', onAction: () => undefined }]} />
        <IconButton icon="dots" label="Plain dots" />
      </>,
    );
    expect(cls('More vault actions')).toMatch(/\bmore\b/);
    expect(cls('Board menu')).not.toMatch(/\bmore\b/);
    expect(cls('Run here')).not.toMatch(/\bmore\b/);
    expect(cls('Plain dots')).not.toMatch(/\bmore\b/);
  });
});
