// A Programs list row shows one inline action, Start for a program that can
// start, else Restart (none for a program that can only stop), and lists the rest (Stop, Logs, Copy id) only in its ⋯
// menu. Each action is shown once: the inline one is not repeated in the menu (DataTable splitActions).
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';

const ACTION = /^(Start|Restart|Stop) /;

/** The list row of a program, by its name as the Name cell shows it. */
async function rowOf(name: string): Promise<HTMLElement> {
  return waitFor(() => {
    const r = screen.getAllByRole('row').find((x) => within(x).queryByText(name, { exact: true }) !== null && x.closest('[role="table"], table') !== null);
    if (!r) throw new Error(`no list row for ${name}`);
    return r;
  });
}

/** The visible action buttons of a row (Start, Restart, Stop), by accessible name. */
const rowActions = (row: HTMLElement) => within(row).queryAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent ?? '').filter((n) => ACTION.test(n));

/** The row's ⋯ menu, opened: its items' names. */
async function menuOf(row: HTMLElement): Promise<string[]> {
  await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
  const menu = await screen.findByRole('menu');
  const names = within(menu).getAllByRole('menuitem').map((m) => m.getAttribute('aria-label') ?? (m.textContent ?? '').trim());
  await userEvent.keyboard('{Escape}');
  return names;
}

describe('Programs list row actions', () => {
  it('a running program: Restart is its one inline action, and Stop is in its menu, not in the row', async () => {
    await renderPage(page, { state: 'many', path: '/programs' });
    const row = await rowOf('web');
    expect(rowActions(row)).toEqual(['Restart web']);
    // The inline button shows the short word; its name keeps the program (label in name).
    expect(within(row).getByRole('button', { name: 'Restart web' })).toHaveTextContent(/^Restart$/);
    const items = await menuOf(row);
    expect(items.some((n) => n.startsWith('Stop web'))).toBe(true);
    expect(items.some((n) => n.startsWith('Restart web'))).toBe(false);
    // Logs is only in the menu, named with the program; no Logs button stays in the row.
    expect(items.some((n) => n.startsWith('Logs of web'))).toBe(true);
    expect(within(row).queryAllByRole('button').filter((b) => /^Logs/.test(b.getAttribute('aria-label') ?? b.textContent ?? ''))).toHaveLength(0);
  });

  it('a stopped program: Start is its one inline action', async () => {
    await renderPage(page, { state: 'many', path: '/programs' });
    const row = await rowOf('docs-preview');
    expect(rowActions(row)).toEqual(['Start docs-preview']);
    expect((await menuOf(row)).some((n) => n.startsWith('Start docs-preview'))).toBe(false);
  });

  it('a program that can only stop (a temporary run): no inline action; Stop and Logs are in its menu', async () => {
    await renderPage(page, { state: 'many', path: '/programs' });
    const row = await rowOf('http-server');
    const names = within(row).queryAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent ?? '');
    expect(names.filter((n) => /^(Start|Restart|Stop|Logs)/.test(n))).toEqual([]);
    const items = await menuOf(row);
    expect(items.some((n) => n.startsWith('Stop http-server'))).toBe(true);
    expect(items.some((n) => n.startsWith('Logs of http-server'))).toBe(true);
  });

  it('a range program: its actions name all its parts, Restart inline, Stop in its menu', async () => {
    await renderPage(page, { state: 'many', path: '/programs' });
    const row = await rowOf('api');
    expect(rowActions(row)).toEqual(['Restart all ports of api']);
    const items = await menuOf(row);
    expect(items.some((n) => n.startsWith('Stop all ports of api'))).toBe(true);
    expect(items.some((n) => n.startsWith('Logs of api'))).toBe(true);
  });

  it('no row keeps the old Actions column: one inline action at most per row', async () => {
    await renderPage(page, { state: 'many', path: '/programs' });
    await rowOf('web');
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
    for (const r of screen.getAllByRole('row').filter((x) => x.querySelector('td'))) expect(rowActions(r).length).toBeLessThanOrEqual(1);
  });
});
