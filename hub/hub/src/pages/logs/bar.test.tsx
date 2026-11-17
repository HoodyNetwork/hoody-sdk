// Vitest: the Logs bar. Toolbar start is what you look at, end is what you do: the Live switch is
// the one Live control (no "Watch live" header primary), then Refresh and the ⋯ menu, which opens with Export. Clear
// all (the old Reset filters) sits under the bar with the chips, only while the view is off its defaults.
import { afterEach, describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent, within } from '@app/testing';
import strings from './strings.en.json';
import kitStrings from '@kit/strings.en.json';

const { default: page } = await import('./page');
const table = strings as Record<string, string>;
const bar = () => screen.getByRole('group', { name: table['title'] });

/** A page region (#hub-main) of the given width: below 600 px the bar folds Result and When into Filters. */
const mainOf = (width: number) => {
  const main = document.createElement('div');
  main.id = 'hub-main';
  Object.defineProperty(main, 'clientWidth', { configurable: true, get: () => width });
  document.body.appendChild(main);
};

describe('Logs bar', () => {
  afterEach(() => document.getElementById('hub-main')?.remove());

  it('has one Live control, the switch in the bar, and no live action in the header', async () => {
    await renderPage(page, { state: 'quiet', path: '/logs' });
    await screen.findByRole('switch', { name: table['act.live'] });
    expect(screen.getAllByRole('switch', { name: table['act.live'] })).toHaveLength(1);
    // The quiet view holds a few failed visits, so once its counts arrive the header primary is "See what failed",
    // never a live action. (Asserting no header primary raced the counts: green only when it ran before they loaded.)
    await screen.findByRole('button', { name: table['act.seeFailed'] });
    expect(screen.getAllByRole('switch', { name: table['act.live'] })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /^Watch live$|^Live: on$/ })).toBeNull();
  });

  it('ends with Live, Refresh and ⋯, and the ⋯ opens with Export, then Explain this view and the views', async () => {
    await renderPage(page, { path: '/logs' });
    await screen.findByRole('switch', { name: table['act.live'] });
    const more = within(bar()).getByRole('button', { name: table['act.barMore'] });
    expect(within(bar()).getByRole('button', { name: table['act.refresh'] })).toBeTruthy();
    // Export is no longer a bar button of its own.
    expect(within(bar()).queryByRole('button', { name: table['act.export'] })).toBeNull();
    const order = [...bar().querySelectorAll('[role="switch"], button')].map((e) => e.getAttribute('aria-label') ?? e.textContent ?? '');
    const live = order.findIndex((x) => x.includes(table['act.live'] as string));
    expect(order.indexOf(table['act.refresh'] as string)).toBeGreaterThan(live);
    expect(order.indexOf(table['act.barMore'] as string)).toBe(order.length - 1);
    // Every button in the bar is a toolbar control, as tall as the search field and the chips beside it: Refresh, the
    // ⋯ menu and the sources' More.
    for (const name of [table['act.refresh'], table['act.barMore']]) expect(within(bar()).getByRole('button', { name }), name).toHaveClass('toolbar');
    const worded = [...bar().querySelectorAll('button[data-words]')];
    expect(worded.length).toBeGreaterThan(0);
    for (const b of worded) expect(b, b.textContent ?? '').toHaveClass('toolbar');
    await userEvent.setup().click(more);
    const names = screen.getAllByRole('menuitem').map((m) => m.textContent ?? '');
    expect(names[0]).toMatch(new RegExp(`^${table['act.export']}`));
    expect(names[1]).toMatch(new RegExp(`^${table['act.explain']}`));
    expect(names.some((n) => n.startsWith(table['v.save'] as string))).toBe(true);
  });

  it('shows Clear all under the bar only off the defaults, and it brings the view back', async () => {
    const { router } = await renderPage(page, { path: '/logs?src=visits&sev=failed&win=24h' });
    await screen.findByRole('switch', { name: table['act.live'] });
    const clear = screen.getByRole('button', { name: table['act.reset'] });
    expect(bar().contains(clear)).toBe(false);
    await act(async () => {
      await userEvent.setup().click(clear);
    });
    for (const key of ['src', 'sev', 'win']) expect(router.state.location.search).not.toHaveProperty(key);
    expect(screen.queryByRole('button', { name: table['act.reset'] })).toBeNull();
  });

  it('shows Result and When as the kit filter chips every list page uses, not as selects', async () => {
    mainOf(1200);
    await renderPage(page, { path: '/logs?sev=failed' });
    await screen.findByRole('switch', { name: table['act.live'] });
    const chips = within(bar()).getByRole('group', { name: kitStrings['table.filters'] });
    expect(within(chips).getByText(table['f.severity'] as string)).toBeTruthy();
    expect(within(chips).getByText(table['f.window'] as string)).toBeTruthy();
    // The set severity shows as the chip's value, with its × to clear it.
    expect(within(chips).getByText(table['sev.failed'] as string)).toBeTruthy();
    expect(within(bar()).queryByRole('button', { name: new RegExp(`^${table['sev.failed']}`) })).toBeNull();
  });

  it('on a phone folds Result and When into Filters, counted, each with its visible label', async () => {
    mainOf(390);
    await renderPage(page, { path: '/logs?sev=failed' });
    await screen.findByRole('switch', { name: table['act.live'] });
    expect(within(bar()).queryByRole('button', { name: table['f.severity'] })).toBeNull();
    const filters = within(bar()).getByRole('button', { name: kitStrings['table.filtersButtonCount'].replace('{{count}}', '1') });
    await act(async () => {
      await userEvent.setup().click(filters);
    });
    const dialog = screen.getByRole('dialog', { name: kitStrings['table.filters'] });
    expect(within(dialog).getByText(table['f.severity'] as string)).toBeTruthy();
    expect(within(dialog).getByText(table['f.window'] as string)).toBeTruthy();
    // Live, Refresh and ⋯ stay in the bar.
    expect(within(bar()).getByRole('button', { name: table['act.refresh'] })).toBeTruthy();
    expect(within(bar()).getByRole('button', { name: table['act.barMore'] })).toBeTruthy();
  });
});
