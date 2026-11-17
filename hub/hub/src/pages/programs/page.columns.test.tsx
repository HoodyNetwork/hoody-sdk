// The Programs table has no column that stands empty: a cell with nothing to say shows the dash, the kind is said by
// the group rows (no Kind column), and a row's last change shows in its Ports cell (no Last change column). A list row
// (phone) leaves an empty field out instead: no dash on its second line.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const layout = vi.hoisted(() => ({ width: 1920 }));

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private cb: (entries: unknown[], o: unknown) => void) {}
      observe(el: Element) {
        this.cb([{ target: el, contentRect: { width: layout.width, height: 900 } }], this);
      }
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function rowNow(name: string): HTMLElement {
  const r = screen.getAllByRole('row').find((x) => within(x).queryByText(name, { exact: true }) !== null && x.closest('[role="table"], table') !== null);
  if (!r) throw new Error(`no row for ${name}`);
  return r;
}

describe('Programs table: no empty column', () => {
  it('a wide table has no Kind and no Last change column, and every data cell of a row says something', async () => {
    layout.width = 1920;
    await renderPage(page, { state: 'many', path: '/programs' });
    const row = await waitFor(() => rowNow('docs-preview'));
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent?.trim());
    expect(heads).toContain(strings['col.ports']);
    expect(heads).toContain(strings['col.up']);
    expect(heads).not.toContain(strings['col.kind']);
    expect(heads).not.toContain('Last change');
    // docs-preview is stopped, has no port and no change in flight: Up and Ports show the dash.
    const table = row.closest('[role="table"], table') as HTMLElement;
    const under = (name: string) => {
      const head = within(table).getByRole('columnheader', { name });
      return row.children[Array.from(head.parentElement?.children ?? []).indexOf(head)] as HTMLElement;
    };
    expect(under(strings['col.up'])).toHaveTextContent(strings.none);
    expect(under(strings['col.ports'])).toHaveTextContent(strings.none);
    // mystery's restart policy and startup are not known: the dash, not a blank.
    const mystery = rowNow('mystery');
    const underOf = (r: HTMLElement, name: string) => {
      const head = within(table).getByRole('columnheader', { name });
      return r.children[Array.from(head.parentElement?.children ?? []).indexOf(head)] as HTMLElement;
    };
    for (const name of [strings['col.up'], strings['col.ports'], strings['col.policy'], strings['col.boot']]) expect(underOf(mystery, name)).toHaveTextContent(strings.none);
    // A temporary program has no sandbox: the dash there too.
    expect(underOf(rowNow('http-server'), 'Sandbox')).toHaveTextContent(strings.none);
  });

  it('a list row leaves an empty field out: no dash', async () => {
    layout.width = 390;
    await renderPage(page, { state: 'many', path: '/programs' });
    const row = await waitFor(() => rowNow('docs-preview'));
    expect(row).not.toHaveTextContent(strings.none);
  });
});
