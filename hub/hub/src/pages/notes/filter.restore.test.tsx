// Vitest: the computer chosen last time comes back when the URL names none. The page asks again for a
// few seconds while the shell settles the URL; once the person changes the filter in the table's own controls, the asks
// bring back only their own choice. "All computers" chosen in those seconds stays (the chip's Clear by pointer or
// keyboard, the menu's "Any", "Clear filters"), and so does "Any" chosen before the kept computer arrives (kept as the new
// choice), while a URL that loses the filter on its own still gets it back, focus moved by the page or not. A choice is
// kept the moment it is made, even when its URL write is lost: a lost computer pick is saved and comes back, and a lost
// "Any" stays saved.
import { act, cleanup, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { fixtureWorld } from '@core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Holds from './holds';
import page from './page';
import strings from './strings.en.json';
import kitStrings from '@kit/strings.en.json';
import stateStrings from '@kit/states/strings.en.json';

// Each render boots a fresh fixture core, whose account prefs (encrypted per boot) do not carry over: the kept computer
// rides between the two visits here, through the page's own keep(). `mine`: what this visit kept, which core applies
// again over a kept value that arrives late (`arrive`).
const kept = vi.hoisted(() => ({ computer: '', mine: undefined as string | undefined }));
const arrive = (id: string) => {
  kept.computer = kept.mine ?? id;
};
vi.mock('./holds', async (orig) => {
  const real = await orig<typeof Holds>();
  return {
    ...real,
    useNotesKept: () => {
      const k = real.useNotesKept();
      return {
        ...k,
        store: { ...k.store, computer: kept.computer },
        keep: (id: string) => {
          kept.computer = id;
          kept.mine = id;
          k.keep(id);
        },
      };
    },
  };
});

const chip = () => document.querySelector<HTMLElement>('[data-chip="computer"]');
const chipText = () => chip()?.querySelector('button')?.textContent ?? '';
const later = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

// The page reads the browser's hash to know it is still shown; the test router keeps its own history, so the hash says
// "#/notes" with no computer throughout, as the address bar does while the shell settles it.
let hash = '';
beforeEach(() => {
  hash = window.location.hash;
  window.location.hash = '#/notes';
});
afterEach(() => {
  vi.useRealTimers();
  kept.computer = '';
  kept.mine = undefined;
  window.location.hash = hash;
});

const borealisId = fixtureWorld.computers.find((c) => c.name === 'borealis')!.id;

/** The address loses every computer the page writes (the shell rewrites it at that moment), until `settle()`. */
const loseComputerWrites = (router: { navigate: (o: never) => Promise<void>; state: { location: { search: unknown } } }) => {
  const navigate = router.navigate;
  const lost = { count: 0, settle: () => { router.navigate = navigate; } };
  router.navigate = ((o: { search?: unknown }) => {
    const next = (typeof o?.search === 'function' ? (o.search as (p: unknown) => unknown)(router.state.location.search) : o?.search) as { computer?: string } | undefined;
    if (next?.computer) {
      lost.count += 1;
      return Promise.resolve();
    }
    return navigate(o as never);
  }) as never;
  return lost;
};

/** A visit that picks atlas, so atlas is the computer kept for the next visit. */
const keepAtlas = async () => {
  const user = userEvent.setup();
  await renderPage(page, { state: 'colours', path: '/notes' });
  // The first visit boots the page cold: on a loaded host that takes longer than waitFor's default second.
  await waitFor(() => expect(chip()?.querySelector('button')).toBeTruthy(), { timeout: 10000 });
  await user.click(chip()!.querySelector('button')!);
  const menu = await screen.findByRole('menu', { name: strings['filter.computer'] });
  await user.click(within(menu).getByRole('menuitemradio', { name: 'atlas' }));
  await waitFor(() => expect(chipText()).toContain('atlas'));
  expect(kept.computer).not.toBe('');
  cleanup();
  kept.mine = undefined;
};

describe('notes: the kept computer comes back, and the person can still leave it', () => {
  it('"All computers" chosen while the page is still asking stays chosen', async () => {
    await keepAtlas();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    const { router } = await renderPage(page, { state: 'colours', path: '/notes' });
    await waitFor(() => expect(chipText()).toContain('atlas'));
    await user.click(within(chip()!).getByRole('button', { name: `Clear ${strings['filter.computer']}` }));
    await waitFor(() => expect(chipText()).not.toContain('atlas'));
    await later(7000);
    expect(chipText()).not.toContain('atlas');
    expect(router.state.location.href).not.toMatch(/[?&]computer=/);
  });

  it('by keyboard too: Tab to the filter\'s Clear and Enter, and the kept computer does not come back', async () => {
    await keepAtlas();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    await renderPage(page, { state: 'colours', path: '/notes' });
    await waitFor(() => expect(chipText()).toContain('atlas'));
    const clear = within(chip()!).getByRole('button', { name: `Clear ${strings['filter.computer']}` });
    for (let i = 0; i < 60 && document.activeElement !== clear; i++) await user.tab();
    expect(clear).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(chipText()).not.toContain('atlas'));
    await later(7000);
    expect(chipText()).not.toContain('atlas');
  });

  it('"Any" in the computer menu stays chosen', async () => {
    await keepAtlas();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    await renderPage(page, { state: 'colours', path: '/notes' });
    await waitFor(() => expect(chipText()).toContain('atlas'));
    await user.click(chip()!.querySelector('button')!);
    // The menu is named by its chip, value included ("Computer atlas").
    const menu = await screen.findByRole('menu', { name: new RegExp(`^${strings['filter.computer']}`) });
    await user.click(within(menu).getByRole('menuitemradio', { name: kitStrings['table.filterAny'] }));
    await waitFor(() => expect(chipText()).not.toContain('atlas'));
    await later(7000);
    expect(chipText()).not.toContain('atlas');
  });

  it('"Clear filters" on a search that matches nothing clears the computer for good too', async () => {
    await keepAtlas();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    await renderPage(page, { state: 'colours', path: '/notes' });
    await waitFor(() => expect(chipText()).toContain('atlas'));
    await user.type(screen.getByRole('searchbox'), 'zzqx-no-such-note');
    await user.click(await screen.findByRole('button', { name: stateStrings['recipe.noMatch.clear'] }));
    await waitFor(() => expect(chipText()).not.toContain('atlas'));
    await later(7000);
    expect(chipText()).not.toContain('atlas');
  });

  it('"Any" chosen before the kept computer arrives is not undone when it does', async () => {
    await keepAtlas();
    const atlas = kept.computer;
    kept.computer = '';
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    const { router } = await renderPage(page, { state: 'colours', path: '/notes' });
    await waitFor(() => expect(chip()?.querySelector('button')).toBeTruthy());
    await user.click(chip()!.querySelector('button')!);
    const menu = await screen.findByRole('menu', { name: new RegExp(`^${strings['filter.computer']}`) });
    await user.click(within(menu).getByRole('menuitemradio', { name: kitStrings['table.filterAny'] }));
    // The kept computer arrives now (the preference read is slower than the list); any render picks it up.
    arrive(atlas);
    await user.type(screen.getByRole('searchbox'), 'x{Backspace}');
    await later(7000);
    expect(chipText()).not.toContain('atlas');
    expect(router.state.location.href).not.toMatch(/[?&]computer=/);
    // The choice is kept too, so the next visit does not bring atlas back either.
    expect(kept.computer).toBe('');
  });

  it('"Clear filters" that only clears a search is no choice of computer: the kept one still comes back', async () => {
    await keepAtlas();
    const atlas = kept.computer;
    kept.computer = '';
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    await renderPage(page, { state: 'colours', path: '/notes' });
    await waitFor(() => expect(chip()?.querySelector('button')).toBeTruthy());
    await user.type(screen.getByRole('searchbox'), 'zzqx-no-such-note');
    await user.click(await screen.findByRole('button', { name: stateStrings['recipe.noMatch.clear'] }));
    arrive(atlas);
    await user.type(screen.getByRole('searchbox'), 'x{Backspace}');
    await later(1600);
    await waitFor(() => expect(chipText()).toContain('atlas'));
    expect(kept.computer).toBe(atlas);
  });

  it('a computer picked before the kept one arrives, whose URL update is lost, is kept and shown, never saved as all', async () => {
    await keepAtlas();
    const atlas = kept.computer;
    kept.computer = '';
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    const { router } = await renderPage(page, { state: 'colours', path: '/notes' });
    await waitFor(() => expect(chip()?.querySelector('button')).toBeTruthy());
    await user.click(chip()!.querySelector('button')!);
    const menu = await screen.findByRole('menu', { name: new RegExp(`^${strings['filter.computer']}`) });
    const other = within(menu).getByRole('menuitemradio', { name: 'borealis' });
    // The pick's URL write is lost: the page never renders the pick. The address keeps losing every computer the page
    // writes until the first tries are over.
    const lost = loseComputerWrites(router as never);
    await user.click(other);
    expect(lost.count).toBeGreaterThan(0);
    expect(chipText()).not.toContain('borealis');
    arrive(atlas);
    await user.type(screen.getByRole('searchbox'), 'x{Backspace}');
    await later(300);
    // No try has reached the screen yet: the person's pick is saved already, never "all computers" or the old one.
    expect(lost.count).toBeGreaterThan(1);
    expect(chipText()).not.toContain('borealis');
    expect(kept.computer).toBe(borealisId);
    // The address settles: the next try brings the pick back.
    lost.settle();
    await later(7000);
    await waitFor(() => expect(chipText()).toContain('borealis'));
    expect(router.state.location.href).toMatch(/[?&]computer=/);
    expect(kept.computer).toBe(borealisId);
  });

  it('"Any" chosen while every try is lost is saved at once, so the old computer does not come back', async () => {
    await keepAtlas();
    const atlas = kept.computer;
    kept.computer = '';
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    const { router } = await renderPage(page, { state: 'colours', path: '/notes' });
    await waitFor(() => expect(chip()?.querySelector('button')).toBeTruthy());
    const lost = loseComputerWrites(router as never);
    // The kept computer arrives; every try's write is lost, so no computer ever reaches the screen.
    arrive(atlas);
    await user.type(screen.getByRole('searchbox'), 'x{Backspace}');
    await later(300);
    expect(lost.count).toBeGreaterThan(0);
    expect(chipText()).not.toContain('atlas');
    await user.click(chip()!.querySelector('button')!);
    const menu = await screen.findByRole('menu', { name: new RegExp(`^${strings['filter.computer']}`) });
    await user.click(within(menu).getByRole('menuitemradio', { name: kitStrings['table.filterAny'] }));
    expect(kept.computer).toBe('');
    lost.settle();
    await later(7000);
    expect(chipText()).not.toContain('atlas');
    expect(kept.computer).toBe('');
    expect(router.state.location.href).not.toMatch(/[?&]computer=/);
  });

  it('a computer picked while the tries are asking, whose URL write is lost, is what the next try brings back', async () => {
    await keepAtlas();
    const atlas = kept.computer;
    kept.computer = '';
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    const { router } = await renderPage(page, { state: 'colours', path: '/notes' });
    await waitFor(() => expect(chip()?.querySelector('button')).toBeTruthy());
    const lost = loseComputerWrites(router as never);
    // The kept computer arrives and the tries start asking for it; their writes are lost for now.
    arrive(atlas);
    await user.type(screen.getByRole('searchbox'), 'x{Backspace}');
    await later(300);
    expect(chipText()).not.toContain('atlas');
    await user.click(chip()!.querySelector('button')!);
    const menu = await screen.findByRole('menu', { name: new RegExp(`^${strings['filter.computer']}`) });
    await user.click(within(menu).getByRole('menuitemradio', { name: 'borealis' }));
    expect(chipText()).not.toContain('borealis');
    expect(kept.computer).toBe(borealisId);
    // The address settles: the next try brings back the person's pick, never the kept computer it was asking for.
    lost.settle();
    await later(7000);
    await waitFor(() => expect(chipText()).toContain('borealis'));
    expect(chipText()).not.toContain('atlas');
    expect(kept.computer).toBe(borealisId);
  });

  it('a URL that drops the filter on its own gets it back on the next ask, even after the page moved focus to a control', async () => {
    await keepAtlas();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    const { router } = await renderPage(page, { state: 'colours', path: '/notes' });
    await waitFor(() => expect(chipText()).toContain('atlas'));
    // Focus a dialog or the page itself puts on a control (New note's field, a restored focus) is not the person's change.
    act(() => chip()!.querySelector('button')!.focus());
    await act(async () => {
      await router.navigate({ to: '/notes', search: {}, replace: true } as never);
    });
    await waitFor(() => expect(chipText()).not.toContain('atlas'));
    await later(1600);
    await waitFor(() => expect(chipText()).toContain('atlas'));
  });
});
