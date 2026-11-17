// The Programs list on a phone (list presentation, 390 px) has three line-2
// fields: Kind, Up, and the row's last change while one is in flight, else its ports. A table (1440 px) does the same in
// its Ports column: the note while one is in flight, else the ports, so no column stands empty waiting for a change.
// The in-flight note keeps its Check again in both.
// The other notes of that place, the working one
// and a failure with its Dismiss, and the row's ports back once the note is gone.
// A table's note and port are checked in the
// Ports cell, not anywhere in the row; the working note offers no Check again and no Dismiss.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

// Every observer here reports this width for what it observes, like a real layout at that width.
const layout = vi.hoisted(() => ({ width: 390, observers: new Set<() => void>() }));

beforeEach(() => {
  layout.observers = new Set();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private fire: (() => void) | null = null;
      constructor(private cb: (entries: unknown[], o: unknown) => void) {}
      observe(el: Element) {
        this.fire = () => this.cb([{ target: el, contentRect: { width: layout.width, height: 800 } }], this);
        layout.observers.add(this.fire);
        this.fire();
      }
      unobserve() {}
      disconnect() {
        if (this.fire) layout.observers.delete(this.fire);
        this.fire = null;
      }
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

/** A table row's cell under the column header named `name`: the header's place in its own row picks the cell. */
function cellUnder(row: HTMLElement, name: string): HTMLElement {
  const table = row.closest('[role="table"], table') as HTMLElement;
  const head = within(table).getByRole('columnheader', { name });
  const at = Array.from(head.parentElement?.children ?? []).indexOf(head);
  const cell = row.children[at];
  if (at < 0 || !(cell instanceof HTMLElement)) throw new Error(`no cell under ${name}`);
  return cell;
}

/** While `note` shows for web it has the ports' place: line 2 of a list row, the Ports cell of a table. */
function noteAndPort(note: string | RegExp, list: boolean) {
  const row = rowNow('web');
  expect(row).not.toHaveTextContent('3000');
  if (list) return;
  expect(within(cellUnder(row, strings['col.ports'])).getByText(note)).toBeInTheDocument();
}

/** No note for web: the row shows its port (a table: in its Ports cell). */
function portBack(list: boolean) {
  const row = rowNow('web');
  expect(row).toHaveTextContent('3000');
  if (list) return;
  expect(cellUnder(row, strings['col.ports'])).toHaveTextContent('3000');
}

describe.each([
  ['phone', 390, true],
  ['desktop', 1440, false],
] as const)('Programs list, %s: the last change and the ports', (_, width, list) => {
  beforeEach(() => {
    layout.width = width;
  });

  it('a row shows its port, and a press in flight shows its note with Check again in the row', async () => {
    await renderPage(page, { state: 'press-pending', path: '/programs' });
    const web = await waitFor(() => rowNow('web'));
    // The presentation the width asks for: a table has its Ports column header, a list row has none.
    expect(screen.queryAllByRole('columnheader', { name: strings['col.ports'] }).length > 0).toBe(!list);
    expect(web).toHaveTextContent('3000');
    expect(within(web).queryByText(strings['op.pendingRow'])).toBeNull();
    await userEvent.click(within(web).getByRole('button', { name: 'Restart web' }));
    await waitFor(() => expect(within(rowNow('web')).getByText(strings['op.pendingRow'])).toBeInTheDocument());
    expect(within(rowNow('web')).getByRole('button', { name: /Check again/ })).toBeInTheDocument();
    // The in-flight note takes the ports' place.
    noteAndPort(strings['op.pendingRow'], list);
  });
  it('a press in flight shows the working note in the row, and once it lands the row shows its port again', async () => {
    await renderPage(page, { state: 'press-slow', path: '/programs' });
    await waitFor(() => rowNow('web'));
    await userEvent.click(within(rowNow('web')).getByRole('button', { name: 'Restart web' }));
    // The working note: a status holding its words (the spinner beside them is only the mark; a status takes no name
    // from its content on the web, so it is found by its text).
    await waitFor(() => expect(within(rowNow('web')).getAllByRole('status').some((el) => el.textContent?.includes(strings['op.working']))).toBe(true));
    expect(within(rowNow('web')).getByText(strings['op.working'])).toBeInTheDocument();
    // Working is not an outcome yet: no Check again and no Dismiss beside it.
    expect(within(rowNow('web')).queryByRole('button', { name: /Check again/ })).toBeNull();
    expect(within(rowNow('web')).queryByRole('button', { name: 'Dismiss' })).toBeNull();
    noteAndPort(strings['op.working'], list);
    // The answer comes after 4 s: the note goes and the list row shows its ports in the note's place.
    await waitFor(() => expect(within(rowNow('web')).queryByText(strings['op.working'])).toBeNull(), { timeout: 8000 });
    portBack(list);
  }, 15000);

  it('a refused press shows the failure with its Dismiss in the row; Dismiss clears it and the row shows its port again', async () => {
    await renderPage(page, { state: 'press-failed', path: '/programs' });
    await waitFor(() => rowNow('web'));
    await userEvent.click(within(rowNow('web')).getByRole('button', { name: 'Restart web' }));
    await waitFor(() => expect(within(rowNow('web')).getByText(strings['op.failedShort'])).toBeInTheDocument());
    // A definite failure has no Check again: only its Dismiss.
    expect(within(rowNow('web')).queryByRole('button', { name: /Check again/ })).toBeNull();
    noteAndPort(strings['op.failedShort'], list);
    await userEvent.click(within(rowNow('web')).getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(within(rowNow('web')).queryByText(strings['op.failedShort'])).toBeNull());
    expect(within(rowNow('web')).queryByRole('button', { name: 'Dismiss' })).toBeNull();
    portBack(list);
  });
});
