// The Apps tab's "Open
// on this computer" table keeps each row's own action (RowPrimary) in its list presentation too. On a phone (390 px, list
// rows) the action sits on line 2 beside Opens in, so a row's recovery (Open display, Check again…) is in the row and not
// only in its inspector; a table (1440 px) keeps it in the Action column.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { fixtureStore } from '@app/fixtures';
import { harness } from './launch/harness';
import { ops } from './parts/ops';
import strings from './strings.en.json';

// Every observer here reports this width for what it observes, like a real layout at that width.
const layout = vi.hoisted(() => ({ width: 390 }));

beforeEach(() => {
  fixtureStore.set({ state: null, latency: 'instant' });
  // A press reads an app back into the page's own store: each test starts from the fixture's rows.
  ops.reset();
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

/** The Open table's row of an app, by its name as the Name cell shows it (looked up afresh: a row may be drawn anew). */
function rowNow(name: string): HTMLElement {
  const table = screen.getByRole('table', { name: strings['tab.open'] });
  const r = within(table)
    .getAllByRole('row')
    .find((x) => within(x).queryByText(name, { exact: true }) !== null);
  if (!r) throw new Error(`no Open row for ${name}`);
  return r;
}

describe.each([
  ['phone', 390, true],
  ['desktop', 1440, false],
] as const)('Apps, Opened apps, %s: a row keeps its own action', (_, width, list) => {
  beforeEach(() => {
    layout.width = width;
  });

  it("a running app's row holds its action (Firefox: Open display, a link to its screen)", async () => {
    // The Apps section the way Programs mounts it (launch/harness): /apps itself redirects to Programs' Apps tab.
    await renderPage(harness, { path: '/apps' });
    const firefox = await waitFor(() => rowNow('Firefox'), { timeout: 4000 });
    // The presentation the width asks for: a table has its Action column header, a list row has none.
    expect(screen.queryAllByRole('columnheader', { name: strings['col.action'] }).length > 0).toBe(!list);
    const open = within(firefox).getByRole('link', { name: new RegExp(strings['act.screen']) });
    expect(open).toHaveAttribute('href', 'https://15005-atlas.example.invalid/screen');
    // One action per row: it is not repeated in the row.
    expect(within(firefox).getAllByRole('link', { name: new RegExp(strings['act.screen']) })).toHaveLength(1);
  });

  // A button action, not only a link, is the row's own
  // and does its job from the row; a row whose action waits draws none.
  it("a row whose start is unconfirmed holds its Check again button, and pressing it reads the app back", async () => {
    await renderPage(harness, { path: '/apps' });
    const sqlite = await waitFor(() => rowNow('sqlite-web'), { timeout: 4000 });
    const check = within(sqlite).getByRole('button', { name: strings['act.check'] });
    expect(check).toHaveAttribute('data-row-primary');
    expect(within(sqlite).getAllByRole('button', { name: strings['act.check'] })).toHaveLength(1);
    await userEvent.setup().click(check);
    // The fixture's read-back answers ready: the row's state moves on and its Check again goes.
    await waitFor(() => expect(within(rowNow('sqlite-web')).queryByRole('button', { name: strings['act.check'] })).toBeNull(), { timeout: 4000 });
  });

  it('a row whose launch waits on its source draws no action of its own; its neighbours keep theirs', async () => {
    await renderPage(harness, { path: '/apps', state: 'warming' });
    const grafana = await waitFor(() => rowNow('Grafana'), { timeout: 4000 });
    expect(grafana.querySelector('[data-row-primary]')).toBeNull();
    expect(within(rowNow('Firefox')).getByRole('link', { name: new RegExp(strings['act.screen']) })).toHaveAttribute('data-row-primary');
  });
});
