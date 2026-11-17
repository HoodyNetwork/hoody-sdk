// Vitest: the Desktop tab's environment picker. The list comes from the terminal program
// (GET /api/v1/system/desktop-envs) and, until it answers, from one fallback constant. The running
// desktop's environment is never guessed: "Not reported" until the Hub opened it with a choice. Switching a running
// desktop asks first (open apps close), then stops it and opens it with ?desktop_env=<id>; only an offered id is sent.
import { afterEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import * as C from '@core/changes';
import { computerKey, patchSlot, readSlot, rememberedDesktops, resetDesktopSlotsForTests } from './parts/desktopSlots';
import { DESKTOP_ENVS_FALLBACK, desktopEnvsOf, desktopShellOf, stopUndecided } from './desktop';
import { computers, desktopEnded, desktopSends } from './fixtures';
import page from './page';
import strings from './strings.en.json';
import { desktopUrl } from './urls';

/** Stop desktop sits in the toolbar's ⋯ menu (a live desktop only): open it, then choose Stop. */
const pressStop = async () => {
  await userEvent.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: new RegExp(`^${strings['desktop.more'].replace('{{n}}', '\\d+')}`) }));
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['desktop.stop']}`) }));
};

const atlas = computers.find((c) => c.name === 'atlas');
if (!atlas) throw new Error('fixture computer atlas');

afterEach(() => {
  desktopSends.length = 0;
  desktopEnded.clear();
  resetDesktopSlotsForTests();
  C.resetChanges();
});

const open = async (state?: string) => {
  await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=desktop', ...(state ? { state } : {}) });
  return screen.findByTitle('atlas, desktop 1', undefined, { timeout: 8000 });
};
const picker = () => screen.findByRole('button', { name: new RegExp(strings['desktop.env']) }, { timeout: 8000 });
const options = async () => {
  await userEvent.click(await picker());
  return within(await screen.findByRole('listbox')).getAllByRole('option');
};

describe('computers: desktop environments, pure', () => {
  it('reads a listing: valid ids only, once each, labels cleaned, installed only when a boolean', () => {
    expect(desktopEnvsOf([
      { id: 'xfce', label: 'Xfce', installed: true },
      { id: 'xfce', label: 'again' },
      { id: 'mate', label: '  MATE\u0007 ', installed: false },
      { id: 'Bad Id', label: 'x' },
      { id: 'kde', installed: 'yes' },
      { id: '../x' },
      null,
    ])).toEqual([
      { id: 'xfce', label: 'Xfce', installed: true },
      { id: 'mate', label: 'MATE', installed: false },
      { id: 'kde', label: 'kde', installed: null },
    ]);
    expect(desktopEnvsOf({ data: [{ id: 'xfce' }] })).toEqual([{ id: 'xfce', label: 'xfce', installed: null }]);
    expect(desktopEnvsOf({ environments: [{ id: 'mate' }] })).toEqual([{ id: 'mate', label: 'mate', installed: null }]);
    expect(desktopEnvsOf([])).toBeNull();
    expect(desktopEnvsOf({ error: 'x' })).toBeNull();
    expect(DESKTOP_ENVS_FALLBACK.map((e) => e.id)).toEqual(['xfce', 'mate']);
  });

  it('finds desktop N’s own session and its shell’s incarnation, nothing else', () => {
    const inc = '0123456789abcdef0123456789abcdef';
    expect(desktopShellOf([{ terminal_id: '1601', desktop_mode: true, incarnation: inc }], 1)).toEqual({ listed: true, incarnation: inc });
    expect(desktopShellOf([{ terminal_id: 1601, desktop_mode: true, incarnation: 'XYZ' }], 1)).toEqual({ listed: true, incarnation: null });
    expect(desktopShellOf([{ terminal_id: '1601', desktop_mode: false, incarnation: inc }], 1)).toEqual({ listed: false });
    expect(desktopShellOf([{ terminal_id: '1601', desktop_mode: true, daemon_program: true, incarnation: inc }], 1)).toEqual({ listed: false });
    expect(desktopShellOf([{ terminal_id: '1602', desktop_mode: true, incarnation: inc }], 1)).toEqual({ listed: false });
    expect(desktopShellOf({ data: [] }, 1)).toBeNull();
    expect(desktopShellOf(undefined, 1)).toBeNull();
    expect(desktopShellOf([], 1)).toEqual({ listed: false });
    expect(desktopShellOf([{ terminal_id: '1601', desktop_mode: true, incarnation: inc }], 0)).toEqual({ listed: false });
  });

  it('keeps each computer’s memory apart, a computer recreated under the same id included', () => {
    patchSlot('a', 1, { phase: 'x' });
    expect(readSlot(computerKey({ id: 'atlas.00a1', created_at: '2026-01-01' }), 1)).toEqual({});
    patchSlot(computerKey({ id: 'atlas.00a1', created_at: '2026-01-01' }), 1, { phase: 'off' });
    expect(readSlot(computerKey({ id: 'atlas.00a1', created_at: '2026-01-01' }), 1)).toEqual({ phase: 'off' });
    expect(readSlot(computerKey({ id: 'atlas.00a1', created_at: '2026-02-02' }), 1)).toEqual({});
    expect(rememberedDesktops(computerKey({ id: 'atlas.00a1', created_at: '2026-01-01' }))).toEqual([1]);
    expect(rememberedDesktops(computerKey({ id: 'atlas.00a1', created_at: '2026-02-02' }))).toEqual([]);
  });

  it('puts only an offered-shape id in the desktop address, as its one query', () => {
    expect(desktopUrl(atlas, 1, 'mate')).toBe(`${new URL(desktopUrl(atlas, 1)).origin}/?desktop_env=mate`);
    for (const bad of ['', 'MATE', 'a b', 'x&y=1', '../mate', 'm'.repeat(33)]) expect(desktopUrl(atlas, 1, bad)).toBe(desktopUrl(atlas, 1));
    expect(desktopUrl(atlas, 0, 'mate')).toBe('');
  });
});

describe('computers: desktop environment picker', () => {
  it('offers the fallback list when the program has no listing, and never guesses the running one', async () => {
    await open();
    expect((await picker()).textContent).toContain(strings['desktop.env.unknown']);
    expect((await options()).map((o) => o.textContent)).toEqual(['Xfce', 'MATE']);
    expect(screen.queryByText(strings['desktop.env.listDown'])).toBeNull();
  }, 30000);

  it('lists what the program reports; one not installed cannot be picked; an id the Hub never sends is left out', async () => {
    await open('desktopEnvsListed');
    const o = await options();
    expect(o.map((x) => x.textContent?.startsWith('MATE') ? 'MATE' : x.textContent)).toEqual(['Xfce', 'MATE', 'KDE Plasma']);
    const mate = o[1];
    if (!mate) throw new Error('no MATE');
    expect(mate).toHaveAttribute('aria-disabled', 'true');
    expect(mate.textContent).toContain(strings['desktop.env.notInstalled']);
  }, 30000);

  it('a listing that fails offers the fallback list and says so', async () => {
    await open('desktopEnvsDown');
    expect(await screen.findByText(strings['desktop.env.listDown'], undefined, { timeout: 8000 })).toBeInTheDocument();
    expect((await options()).map((o) => o.textContent)).toEqual(['Xfce', 'MATE']);
  }, 30000);

  it('switching a running desktop asks first; Cancel sends nothing and keeps it as it was', async () => {
    const f = await open();
    await options();
    await userEvent.click(screen.getByRole('option', { name: 'MATE' }));
    const d = await screen.findByRole('alertdialog', { name: strings['desktop.switch.title'].replace('{{n}}', '1').replace('{{env}}', 'MATE') });
    expect(d.textContent).toContain(strings['desktop.switch.body'].replace('{{env}}', 'MATE'));
    await userEvent.click(within(d).getByRole('button', { name: 'Cancel' }));
    await new Promise((r) => setTimeout(r, 400));
    expect(desktopSends).toEqual([]);
    expect(screen.getByTitle('atlas, desktop 1')).toBe(f);
    expect((await picker()).textContent).toContain(strings['desktop.env.unknown']);
  }, 30000);

  it('confirmed: stops it, ends its session, and opens it with ?desktop_env=mate', async () => {
    await open();
    await options();
    await userEvent.click(screen.getByRole('option', { name: 'MATE' }));
    const d = await screen.findByRole('alertdialog');
    await userEvent.click(within(d).getByRole('button', { name: strings['desktop.switch.go'] }));
    await waitFor(() => expect(screen.getByTitle('atlas, desktop 1').getAttribute('src')).toBe(desktopUrl(atlas, 1, 'mate')), { timeout: 8000 });
    expect(desktopSends.map((s) => `${s.method} ${s.path}`)).toEqual(['POST /api/v1/system/displays/1601/stop', 'DELETE /api/v1/terminal/1601']);
    expect(screen.getByRole('link', { name: strings['desktop.open'] })).toHaveAttribute('href', desktopUrl(atlas, 1, 'mate'));
    expect((await picker()).textContent).toContain('MATE');
  }, 30000);

  it('on a stopped desktop the choice only sets what Start opens (no question, nothing sent)', async () => {
    await open();
    await pressStop();
    const d = await screen.findByRole('alertdialog');
    await userEvent.click(within(d).getByRole('button', { name: strings['desktop.stop'] }));
    await screen.findByText(strings['desktop.off'].replace('{{n}}', '1'), undefined, { timeout: 8000 });
    desktopSends.length = 0;
    await options();
    await userEvent.click(screen.getByRole('option', { name: 'MATE' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['desktop.start'] }));
    expect((await screen.findByTitle('atlas, desktop 1')).getAttribute('src')).toBe(desktopUrl(atlas, 1, 'mate'));
    expect(desktopSends).toEqual([]);
  }, 30000);
});

describe('computers: a Stop step that decided nothing', () => {
  it('a lost answer, a BUSY refusal (a Stop already on its way), or any refusal after a lost answer stays unknown', () => {
    expect(stopUndecided({ outcome: 'pending' }, false)).toBe(true);
    expect(stopUndecided({ outcome: 'not_sent', code: 'BUSY' }, false)).toBe(true);
    expect(stopUndecided({ outcome: 'not_sent', code: 'STORE_UNAVAILABLE' }, true)).toBe(true);
    expect(stopUndecided({ outcome: 'not_sent', code: 'STORE_UNAVAILABLE' }, false)).toBe(false);
    expect(stopUndecided({ outcome: 'failed', code: 'PERMISSION_DENIED' }, true)).toBe(true);
    expect(stopUndecided({ outcome: 'failed', code: 'PERMISSION_DENIED' }, false)).toBe(false);
    expect(stopUndecided({ outcome: 'done' }, true)).toBe(false);
  });
});

