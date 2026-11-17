// Vitest: CellLines stacks a DataTable cell's parts as lines, a name and its sub-line
// (a RowNote or a Tag) under it, with no raw <br>. Each non-empty child is its own block line that cuts on its own
// with an ellipsis. A child that is null, false or '' makes no line; a child component that renders nothing leaves an
// empty line wrapper, which its CSS hides (:empty, display none), so a conditional sub-line leaves no gap.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { CellLines } from './cells';
import { RowNote, Tag } from './Display';
import s from './cells.module.css';

const css = readFileSync(join(import.meta.dirname, 'cells.module.css'), 'utf8');
/** The declarations of one rule, by its exact selector. */
function rule(sel: string): string {
  const at = css.indexOf(`${sel} {`);
  expect(at, `${sel} has a rule`).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf('}', at));
}
const lines = (c: HTMLElement) => [...c.querySelectorAll(`.${s.lines} > *`)] as HTMLElement[];

function Nothing() {
  return null;
}

const mounts = { n: 0 };
/** A line with state of its own: counts its mounts. */
function Counted() {
  useEffect(() => {
    mounts.n++;
  }, []);
  return <span>counted</span>;
}

describe('CellLines', () => {
  it('two children make two lines, in order, each its own span line', () => {
    const { container } = render(
      <CellLines>
        photos-2026.zip
        <RowNote>From the backup computer</RowNote>
      </CellLines>,
    );
    const ls = lines(container);
    expect(ls.map((l) => l.textContent)).toEqual(['photos-2026.zip', 'From the backup computer']);
    for (const l of ls) {
      expect(l.tagName).toBe('SPAN');
      expect(l.className).toBe(s.line);
    }
    expect(container.querySelector('br')).toBeNull();
  });

  it("null, false and '' make no line", () => {
    const shown = false as boolean;
    const { container } = render(
      <CellLines>
        notes.md
        {null}
        {shown && <Tag>Shared</Tag>}
        {''}
        <Tag>Shared</Tag>
      </CellLines>,
    );
    expect(lines(container).map((l) => l.textContent)).toEqual(['notes.md', 'Shared']);
  });

  it('a child component that renders nothing leaves an empty line, which the CSS hides', () => {
    const { container } = render(
      <CellLines>
        report-q3.pdf
        <Nothing />
      </CellLines>,
    );
    const ls = lines(container);
    expect(ls).toHaveLength(2);
    expect(ls[1]!.childNodes).toHaveLength(0);
    expect(rule(`.line:empty`)).toMatch(/display:\s*none/);
  });

  it('each line is a block that cuts on its own: nowrap, hidden overflow, an ellipsis, no minimum width', () => {
    const r = rule('.line');
    expect(r).toMatch(/display:\s*block/);
    expect(r).toMatch(/white-space:\s*nowrap/);
    expect(r).toMatch(/overflow:\s*hidden/);
    expect(r).toMatch(/text-overflow:\s*ellipsis/);
    expect(r).toMatch(/min-inline-size:\s*0/);
    expect(rule('.lines')).toMatch(/display:\s*block/);
    expect(rule('.lines')).not.toMatch(/gap/);
  });

  it('a conditional child that comes or goes keeps the lines after it: no remount (keys by position, holes included)', () => {
    mounts.n = 0;
    const view = (on: boolean) => (
      <CellLines>
        name
        {on && <Tag>Shared</Tag>}
        <Counted />
      </CellLines>
    );
    const { container, rerender } = render(view(false));
    expect(lines(container).map((l) => l.textContent)).toEqual(['name', 'counted']);
    rerender(view(true));
    expect(lines(container).map((l) => l.textContent)).toEqual(['name', 'Shared', 'counted']);
    rerender(view(false));
    expect(mounts.n, 'the stateful line mounted once').toBe(1);
  });
});
