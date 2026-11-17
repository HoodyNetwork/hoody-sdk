// Vitest: a Bot's FIRST link, made from the Give it a link drawer. Once the create is
// done the drawer closes and the page shows the Link and keys tab (?tab=link, replacing the drawer's history entry so
// Back does not come back to it), the keys part (no keys yet) says "here" once (data-hub-here: the kit's short tint,
// still under reduced motion, linkFirstKey.spec.ts measures both) and the keyboard lands on New key, whose description
// is the line saying a key is needed. Never on a failed or unknown create, never on a reload of the tab, never when keys
// already exist. The fixtures are static (the link read does not change after a create): the whole path runs on noKeys
// (a link with no keys, the drawer opened by its URL), the switch alone on noLink.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import { queryClient } from '@core';
import { keyOf } from './data';
import { focusAfterDialogs, keysCueFor } from './parts/LinkTab';
import strings from './strings.en.json';

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const at = (extra: string) => `/bots?sel=${encodeURIComponent(CHIEF)}${extra}`;
const search = (r: Awaited<ReturnType<typeof renderPage>>) => r.router.state.location.search as Record<string, unknown>;

async function createFromDrawer() {
  const drawer = await screen.findByRole('dialog', { name: strings['giveLink.title'] });
  await userEvent.click(within(drawer).getByRole('button', { name: strings['giveLink.create'] }));
}

const keysBlock = () => screen.getByText(strings['keys.empty']).closest('[data-keys-block]') as HTMLElement;
const newKey = () => screen.getByRole('button', { name: strings['keys.new'] });

describe('a first link done: the Link and keys tab, the keys part says here, New key has the keyboard', () => {
  it('closes the drawer and shows ?tab=link in place of the drawer entry (Back does not loop)', async () => {
    const r = await renderPage(page, { state: 'noKeys', path: at('&drawer=link') });
    await createFromDrawer();
    await waitFor(() => expect(search(r).tab).toBe('link'));
    expect(search(r).drawer).toBeUndefined();
    expect(r.router.history.canGoBack()).toBe(false);
    expect(screen.queryByRole('dialog', { name: strings['giveLink.title'] })).toBeNull();
  });

  it('marks the keys part once, then lets it go; New key has focus and says a key is needed', async () => {
    await renderPage(page, { state: 'noKeys', path: at('&drawer=link') });
    await createFromDrawer();
    await waitFor(() => expect(keysBlock()).toHaveAttribute('data-hub-here'));
    await waitFor(() => expect(newKey()).toHaveFocus());
    // Why a key is needed: said to assistive tech on New key, and on screen by the Keys table's empty state under it.
    expect(newKey()).toHaveAccessibleDescription(strings['keys.emptyBody']);
    expect(within(keysBlock()).getByText(strings['keys.emptyBody'])).toBeVisible();
    await waitFor(() => expect(keysBlock()).not.toHaveAttribute('data-hub-here'), { timeout: 3000 });
  });

  it('once: leaving the tab and coming back does not mark it again', async () => {
    await renderPage(page, { state: 'noKeys', path: at('&drawer=link') });
    await createFromDrawer();
    await waitFor(() => expect(keysBlock()).toHaveAttribute('data-hub-here'));
    await userEvent.click(screen.getByRole('tab', { name: strings['tab.activity'] }));
    await userEvent.click(screen.getByRole('tab', { name: strings['tab.link'] }));
    await act(async () => new Promise((res) => setTimeout(res, 50)));
    expect(keysBlock()).not.toHaveAttribute('data-hub-here');
    // The reason a key is needed stays on New key through the re-render (the tab came back), while there is no key.
    expect(newKey()).toHaveAccessibleDescription(strings['keys.emptyBody']);
  });

  it('the first key arrives: New key carries the reason while there is none and drops it once there is one', async () => {
    await renderPage(page, { state: 'noKeys', path: at('&tab=link') });
    await screen.findByText(strings['keys.empty']);
    expect(newKey()).toHaveAccessibleDescription(strings['keys.emptyBody']);
    // The link read turns: the Bot's link now has its first key (the page's own read, as after a create).
    const q = queryClient.getQueryCache().findAll().find((x) => {
      const d = x.state.data as Record<string, { keys?: unknown[] }> | undefined;
      return Array.isArray(d?.[CHIEF]?.keys);
    });
    expect(q, 'the link read').toBeDefined();
    act(() => {
      queryClient.setQueryData(q!.queryKey, (d: Record<string, Record<string, unknown>>) => ({ ...d, [CHIEF]: { ...d[CHIEF], keys: [keyOf({ id: 'knew00000001', name: 'First key', prefix: 'hk_new' })] } }));
    });
    await screen.findByRole('table', { name: /^1 key$/ });
    await waitFor(() => expect(newKey()).toHaveAccessibleDescription(''));
  });

  it('with keys from the start, New key carries no reason', async () => {
    await renderPage(page, { path: at('&tab=link') });
    await screen.findByRole('table', { name: /^\d+ keys?$/ });
    expect(newKey()).toHaveAccessibleDescription('');
  });

  it('noLink: the done create still switches to the tab (the read brings the link later)', async () => {
    const r = await renderPage(page, { state: 'noLink', path: at('&drawer=link') });
    await createFromDrawer();
    await waitFor(() => expect(search(r).tab).toBe('link'));
    expect(search(r).drawer).toBeUndefined();
  });
});

describe('never on anything else', () => {
  it('a failed create keeps the drawer and its message; no tab switch', async () => {
    const r = await renderPage(page, { state: 'linkCreateFailed', path: at('&drawer=link') });
    await createFromDrawer();
    expect(await screen.findByText(strings['giveLink.failed'])).toBeInTheDocument();
    expect(search(r).drawer).toBe('link');
    expect(search(r).tab).toBeUndefined();
  });

  it('an unknown create keeps the drawer with Check again; no tab switch', async () => {
    const r = await renderPage(page, { state: 'linkCreateUnknown', path: at('&drawer=link') });
    await createFromDrawer();
    expect(await screen.findByText(strings['giveLink.maybe'])).toBeInTheDocument();
    expect(search(r).drawer).toBe('link');
    expect(search(r).tab).toBeUndefined();
  });

  it('keys already exist: the drawer closes as before, no switch and no mark', async () => {
    const r = await renderPage(page, { state: 'many', path: at('&drawer=link') });
    await createFromDrawer();
    await waitFor(() => expect(search(r).drawer).toBeUndefined());
    expect(search(r).tab).toBeUndefined();
    expect(document.querySelector('[data-keys-block][data-hub-here]')).toBeNull();
  });

  it('a reload of the tab marks nothing and moves no focus', async () => {
    await renderPage(page, { state: 'noKeys', path: at('&tab=link') });
    await waitFor(() => expect(keysBlock()).toBeInTheDocument());
    await act(async () => new Promise((res) => setTimeout(res, 100)));
    expect(keysBlock()).not.toHaveAttribute('data-hub-here');
    expect(newKey()).not.toHaveFocus();
  });
});

describe('the person comes first (a late answer, a late focus)', () => {
  const pause = (ms: number) => act(async () => new Promise((res) => setTimeout(res, ms)));

  it('a create that answers after the pane is gone changes nothing', async () => {
    const r = await renderPage(page, { state: 'linkCreateSlow', path: at('&drawer=link') });
    await createFromDrawer();
    await act(async () => r.router.history.push('/bots'));
    await pause(1000);
    expect(search(r).sel).toBeUndefined();
    expect(search(r).tab).toBeUndefined();
  });

  it('a filter changed while the create ran is kept: the tab is set on the URL as it is now', async () => {
    const r = await renderPage(page, { state: 'linkCreateSlow', path: at('&drawer=link') });
    await createFromDrawer();
    await act(async () => r.router.history.replace(at('&drawer=link&status=working')));
    await waitFor(() => expect(search(r).tab).toBe('link'), { timeout: 3000 });
    expect(search(r).status).toBe('working');
    expect(search(r).drawer).toBeUndefined();
  });

  it('opened from a button: the drawer hands focus back to it, and the cue still moves it to New key', async () => {
    const r = await renderPage(page, { state: 'noKeys', path: at('') });
    const opener = await screen.findByRole('button', { name: strings['bot.settingsButton'] });
    opener.focus();
    await act(async () => r.router.history.push(at('&drawer=link')));
    await createFromDrawer();
    await waitFor(() => expect(search(r).tab).toBe('link'));
    await waitFor(() => expect(newKey()).toHaveFocus());
  });

  it('a cue taken for one Bot ends when the page moves to another: no mark and no late focus there', async () => {
    const SUPPORT = 'c-atlas~a1b2c3d4e5f60718293a4b5c~support';
    const atB = `/bots?sel=${encodeURIComponent(SUPPORT)}&tab=link`;
    // Bot B's tab is read first, so the move back to it is a cached one (the pane and its tab stay mounted).
    const r = await renderPage(page, { state: 'noKeys', path: atB });
    await screen.findByRole('button', { name: strings['keys.new'] });
    await act(async () => r.router.history.push(at('&drawer=link')));
    const held: FrameRequestCallback[] = [];
    const real = window.requestAnimationFrame.bind(window);
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => (new Error().stack?.includes('focusAfterDialogs') ? held.push(cb) : real(cb)));
    try {
      await createFromDrawer();
      await waitFor(() => expect(keysBlock()).toHaveAttribute('data-hub-here'));
      await waitFor(() => expect(held.length).toBeGreaterThan(0));
      await act(async () => r.router.history.push(atB));
      await waitFor(() => expect(search(r).sel).toBe(SUPPORT));
      for (let i = 0; i < 100 && held.length > 0; i++) await act(async () => held.splice(0).forEach((cb) => cb(performance.now())));
      await pause(300);
      expect(document.querySelector('[data-keys-block][data-hub-here]')).toBeNull();
      expect(document.activeElement?.getAttribute('data-action-id') === 'keys-new').toBe(false);
    } finally {
      raf.mockRestore();
    }
  });

  it('a key pressed after the create keeps focus where the person put it', async () => {
    const r = await renderPage(page, { state: 'noKeys', path: at('&drawer=link') });
    await screen.findByRole('dialog', { name: strings['giveLink.title'] });
    // The cue's own frames are held (only those: a call made from focusAfterDialogs) so the person's key lands between
    // the answer and the focus, as it can in a browser; every other frame runs as usual.
    const held: FrameRequestCallback[] = [];
    const real = window.requestAnimationFrame.bind(window);
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => (new Error().stack?.includes('focusAfterDialogs') ? held.push(cb) : real(cb)));
    try {
      await createFromDrawer();
      await waitFor(() => expect(search(r).tab).toBe('link'));
      await waitFor(() => expect(keysBlock()).toHaveAttribute('data-hub-here'));
      await waitFor(() => expect(held.length).toBeGreaterThan(0));
      expect(newKey()).not.toHaveFocus();
      const other = screen.getByRole('button', { name: strings['addr.limits'] });
      fireEvent.keyDown(document.body, { key: 'Tab' });
      other.focus();
      for (let i = 0; i < 100 && held.length > 0; i++) await act(async () => held.splice(0).forEach((cb) => cb(performance.now())));
      await pause(300);
      expect(other).toHaveFocus();
    } finally {
      raf.mockRestore();
    }
  });
});

describe('keysCueFor and focusAfterDialogs', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('the cue counts a pointer press as the person acting, and its watch ends', () => {
    vi.useFakeTimers();
    const a = keysCueFor('k', null);
    expect(a.acted()).toBe(false);
    document.dispatchEvent(new Event('pointerdown'));
    expect(a.acted()).toBe(true);
    const c = keysCueFor('k', null);
    vi.advanceTimersByTime(10_000);
    expect(c.acted()).toBe(true);
    const d = keysCueFor('k', null);
    d.end();
    expect(d.acted()).toBe(true);
  });

  const frames = (n: number) => {
    for (let i = 0; i < n; i++) vi.advanceTimersToNextFrame();
  };
  const setup = () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'] });
    const target = document.createElement('button');
    document.body.append(target);
    return { target, job: { on: true, raf: 0 } };
  };

  it('focuses two frames after no dialog is left', () => {
    const { target, job } = setup();
    focusAfterDialogs(() => target, { acted: () => false, opener: null }, job);
    frames(1);
    expect(target).not.toHaveFocus();
    frames(2);
    expect(target).toHaveFocus();
  });

  it('a dialog still open after about a second: focus stays where it is', () => {
    const { target, job } = setup();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    focusAfterDialogs(() => target, { acted: () => false, opener: null }, job);
    frames(80);
    expect(target).not.toHaveFocus();
    // The job gave up: a dialog closing later does not bring a late focus.
    dialog.remove();
    frames(5);
    expect(target).not.toHaveFocus();
  });

  it('focus the person placed is kept; focus on the opener, the page title or nowhere is taken', () => {
    const { target, job } = setup();
    const opener = document.createElement('button');
    const title = document.createElement('h1');
    title.setAttribute('data-hub-title', '');
    title.tabIndex = -1;
    const mine = document.createElement('button');
    document.body.append(opener, title, mine);
    for (const [at, taken] of [
      [opener, true],
      [title, true],
      [null, true],
      [mine, false],
    ] as const) {
      target.blur();
      at?.focus();
      focusAfterDialogs(() => target, { acted: () => false, opener }, { on: true, raf: 0 });
      frames(3);
      expect(document.activeElement === target, String(at?.tagName)).toBe(taken);
    }
    expect(job.on).toBe(true);
  });

  it('the person acting first, or the job cancelled, means no focus', () => {
    const { target, job } = setup();
    let acted = false;
    focusAfterDialogs(() => target, { acted: () => acted, opener: null }, job);
    acted = true;
    frames(5);
    expect(target).not.toHaveFocus();
    const job2 = { on: true, raf: 0 };
    focusAfterDialogs(() => target, { acted: () => false, opener: null }, job2);
    job2.on = false;
    window.cancelAnimationFrame(job2.raf);
    frames(5);
    expect(target).not.toHaveFocus();
  });
});
