// StaticTable: a real table named by its label; column headers scope col, the first cell of each row a row header
// (scope row); mono cells on request with the headers in the text face; cells break after separators, an overlong run
// anywhere; tokens only.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { boot } from '@core/test/env';
import { StaticTable } from './StaticTable';

const css = readFileSync(join(__dirname, 'StaticTable.module.css'), 'utf8');
const rule = (sel: string) => {
  const i = css.indexOf(`${sel} {`);
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i));
};

beforeEach(() => {
  boot();
});

const table = (mono?: boolean) => (
  <StaticTable
    label="Where each agent keeps its skills"
    mono={mono}
    columns={[
      { id: 'agent', label: 'Agent' },
      { id: 'project', label: 'In the project' },
      { id: 'global', label: 'For every project' },
    ]}
    rows={[
      { id: 'a', cells: ['claude-code', '.claude/skills/', '~/.claude/skills/'] },
      { id: 'b', cells: ['codex', '.agents/skills/', '~/.codex/skills/'] },
    ]}
  />
);

describe('StaticTable', () => {
  it('is a table named by its label, with column headers and a row-header column', () => {
    render(table());
    const t = screen.getByRole('table', { name: 'Where each agent keeps its skills' });
    const cols = within(t).getAllByRole('columnheader');
    expect(cols.map((c) => c.textContent)).toEqual(['Agent', 'In the project', 'For every project']);
    for (const c of cols) expect(c).toHaveAttribute('scope', 'col');
    const rowHeads = within(t).getAllByRole('rowheader');
    expect(rowHeads.map((c) => c.textContent)).toEqual(['claude-code', 'codex']);
    for (const c of rowHeads) expect(c).toHaveAttribute('scope', 'row');
    expect(within(t).getAllByRole('cell').map((c) => c.textContent)).toEqual(['.claude/skills/', '~/.claude/skills/', '.agents/skills/', '~/.codex/skills/']);
  });

  it('mono sets the mono face on body cells only', () => {
    const { container, rerender } = render(table());
    const t = container.querySelector('table')!;
    const plain = t.className;
    rerender(table(true));
    expect(t.className).not.toBe(plain);
    expect(rule('.mono tbody th,\n.mono tbody td')).toMatch(/font: var\(--t-mono\);/);
    expect(css).not.toMatch(/\.mono thead/);
  });

  // "anywhere" on every cell made a column's least
  // width one character, so at 390 px a path split inside a word (".agents/sk" / "ills/") while another column kept its
  // paths whole. Cells now break at spaces and after separators; only an overlong run breaks anywhere.
  it('a path breaks after its separators, never inside a word; an overlong run alone may break anywhere', () => {
    const { container } = render(
      <StaticTable
        label="Paths"
        columns={[
          { id: 'a', label: 'Agent' },
          { id: 'p', label: 'Path' },
        ]}
        rows={[
          { id: 'x', cells: ['claude-code', '.agents/skills/'] },
          { id: 'y', cells: ['codex', 'sha256:0f3c9a7e5b2d4c6e8a1f0b9d7c5e3a2f and more'] },
          { id: 'z', cells: [<b key="b">own/node</b>, 'C:\\Users\\me'] },
        ]}
      />,
    );
    const cells = within(container.querySelector('table')!).getAllByRole('cell');
    // Text unchanged, a soft break after each "/" and none inside a word.
    expect(cells[0]!.textContent).toBe('.agents/skills/');
    expect(cells[0]!.innerHTML).toBe('.agents/<wbr>skills/<wbr>');
    // A run past the bound sits in its own break-anywhere span; the short words around it do not.
    const long = cells[1]!.querySelectorAll('span');
    expect(long).toHaveLength(1);
    expect(long[0]!.textContent).toBe('0f3c9a7e5b2d4c6e8a1f0b9d7c5e3a2f');
    expect(long[0]!.className).toMatch(/longRun/);
    expect(cells[1]!.textContent).toBe('sha256:0f3c9a7e5b2d4c6e8a1f0b9d7c5e3a2f and more');
    expect(cells[2]!.innerHTML).toBe('C:<wbr>\\<wbr>Users\\<wbr>me');
    // A non-text cell is left as given.
    expect(within(container.querySelector('table')!).getAllByRole('rowheader')[2]!.innerHTML).toBe('<b>own/node</b>');
  });

  it('CSS: cells break by word (columns share the width by content), fill the width, take tokens only', () => {
    expect(rule('.table')).toMatch(/inline-size: 100%;/);
    expect(rule('.table th,\n.table td')).toMatch(/overflow-wrap: break-word;/);
    expect(rule('.table th,\n.table td')).not.toMatch(/anywhere/);
    expect(rule('.longRun')).toMatch(/overflow-wrap: anywhere;/);
    expect(rule('.table thead th')).toMatch(/font: var\(--t-label\);/);
    // No raw lengths or colours: every value is a token, 0 or 100%.
    const values = [...css.matchAll(/:\s*([^;{}]+);/g)].map((m) => m[1]!.trim());
    for (const v of values) expect(v).toMatch(/^(var\(--[a-z0-9-]+\)( var\(--[a-z0-9-]+\))*|0( var\(--[a-z0-9-]+\))?|100%|collapse|anywhere|break-word|start|top|inherit|var\(--bw\) solid var\(--hx-line\))$/);
  });
});
