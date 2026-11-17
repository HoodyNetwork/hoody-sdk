// Vitest: the Remove all local data confirm from the keyboard. Its tick box never takes
// focus on open, and Space then Enter on it ticks the box without wiping: only the confirm button itself confirms. The
// page's own wipe call is counted (the real fixture call underneath), so "nothing was sent" is proven, not inferred.
import { bootFixtureCore } from '@core';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Data from './data';
import { locks } from './parts/locks';
import page from './page';
import strings from './strings.en.json';

const h = vi.hoisted(() => ({ runs: 0 }));
vi.mock('./data', async (orig) => {
  const m = await orig<typeof Data>();
  return {
    ...m,
    useLocalWipe: (open: boolean) => {
      const wipe = m.useLocalWipe(open);
      return { ...wipe, run: (shown: Parameters<typeof wipe.run>[0]) => { h.runs += 1; return wipe.run(shown); } };
    },
  };
});

beforeEach(() => {
  bootFixtureCore();
  locks.clear();
  h.runs = 0;
});

const frames = () =>
  act(async () => {
    await new Promise((r) => window.requestAnimationFrame(() => r(undefined)));
    await new Promise((r) => window.requestAnimationFrame(() => r(undefined)));
    await new Promise((r) => setTimeout(r, 5));
  });

describe('remove all local data from the keyboard', () => {
  it('the tick box never takes focus on open; Space then Enter on it ticks and wipes nothing', async () => {
    const { router } = await renderPage(page, { state: 'wipe-items', path: '/account?sheet=wipe' });
    const d = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[role="alertdialog"]');
      if (!el) throw new Error('no open confirm');
      return el;
    });
    const tick = await within(d).findByRole('checkbox', { name: strings['w.tick'] });
    await frames();
    expect(document.activeElement).not.toBe(tick);
    tick.focus();
    await userEvent.keyboard(' ');
    expect(tick).toBeChecked();
    const go = within(d).getByRole('button', { name: strings['w.confirm'] });
    expect(go).toBeEnabled();
    await userEvent.keyboard('{Enter}');
    await frames();
    expect(h.runs).toBe(0);
    expect(router.state.location.search).toMatchObject({ sheet: 'wipe' });
    expect(screen.getByRole('alertdialog')).toBe(d);
    // The button itself still confirms, from the keyboard too.
    go.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(router.state.location.search).not.toMatchObject({ sheet: 'wipe' }));
    expect(h.runs).toBe(1);
  });
});
