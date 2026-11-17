// A row change
// that may have gone through offers Check again once per layout, the row's own (its Ports cell in a table, line 2
// in a list row), never a second time in the row's ⋯ menu.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

// Every observer here reports this width for what it observes, like a real layout at that width.
const layout = vi.hoisted(() => ({ width: 390 }));

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private cb: (entries: unknown[], o: unknown) => void) {}
      observe(el: Element) {
        this.cb([{ target: el, contentRect: { width: layout.width, height: 800 } }], this);
      }
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** The list row of a program now, by its name as the Name cell shows it (looked up afresh: a row may be drawn anew). */
function rowNow(name: string): HTMLElement {
  const r = screen.getAllByRole('row').find((x) => within(x).queryByText(name, { exact: true }) !== null && x.closest('[role="table"], table') !== null);
  if (!r) throw new Error(`no list row for ${name}`);
  return r;
}

describe.each([
  ['phone', 390, true],
  ['desktop', 1440, false],
] as const)('Programs list, %s: Check again once per row', (_, width, list) => {
  beforeEach(() => {
    layout.width = width;
  });

  it('a press that may have gone through: the row shows its own Check again, and its menu has none', async () => {
    await renderPage(page, { state: 'press-pending', path: '/programs' });
    await waitFor(() => rowNow('web'));
    expect(screen.queryAllByRole('columnheader', { name: strings['col.ports'] }).length > 0).toBe(!list);
    await userEvent.click(within(rowNow('web')).getByRole('button', { name: 'Restart web' }));
    await waitFor(() => expect(within(rowNow('web')).getByText(strings['op.pendingRow'])).toBeInTheDocument());
    expect(within(rowNow('web')).getAllByRole('button', { name: /Check again/ })).toHaveLength(1);
    await userEvent.click(within(rowNow('web')).getByRole('button', { name: 'Row actions' }));
    const menu = await screen.findByRole('menu');
    // The menu still holds the row's other actions; Check again is not among them.
    expect(within(menu).getAllByRole('menuitem').length).toBeGreaterThan(0);
    expect(within(menu).queryByRole('menuitem', { name: /Check again/ })).toBeNull();
    await userEvent.keyboard('{Escape}');
  });
});
