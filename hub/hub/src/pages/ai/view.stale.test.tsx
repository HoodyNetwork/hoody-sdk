// Models & keys drops its one-shot params (?connect=, ?step=) only while the browser still shows
// it. The shell can draw the view once more with its last location as the person leaves (browser Back from a model
// chooser's trip); a drop then would replace the page before's history entry with this one. The real round trip is
// pages/bots/model.roundtrip.test.tsx; here the browser's route is held elsewhere while the view runs its drop.
import { act, renderPage, screen, waitFor } from '@app/testing';
import type * as Kit from '@kit';
import { useCallback } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { links } from './links';
import page from './page';
import strings from './strings.en.json';

// `elsewhere`: the browser shows another page than the one this view was drawn for.
const W = vi.hoisted(() => ({ elsewhere: null as string | null }));
vi.mock('@kit', async (orig) => {
  const real = await orig<typeof Kit>();
  return {
    ...real,
    // As stable as the real one (a new function per render would re-run every effect that depends on the drop).
    useLiveRoute: () => {
      const live = real.useLiveRoute();
      return useCallback(() => W.elsewhere ?? live(), [live]);
    },
  };
});

// The page's own chunk (its load(), import('./tab')) loads once per file before the first visit: renderPage does not
// wait for it, and its cold transform on a busy machine outlives SLOW, which is about the page, not the import.
beforeAll(async () => {
  await import('./tab');
}, 120_000);

beforeEach(() => {
  W.elsewhere = null;
});

const SLOW = { timeout: 5000 };

async function open() {
  const r = await renderPage(page, { path: links.list });
  await screen.findByText(strings['def.helper'], undefined, SLOW);
  const search = () => r.router.state.location.search as Record<string, unknown>;
  const go = (href: string) => act(async () => { await r.router.navigate({ href } as never); });
  return { r, search, go };
}

describe('Models & keys drops its one-shot params only while it is shown', () => {
  it('control: shown, ?connect= opens Connect and the param goes with a replace', async () => {
    const p = await open();
    await p.go(`${links.list}?connect=new`);
    await screen.findByRole('dialog', { name: strings['connect.title'] }, SLOW);
    await waitFor(() => expect(p.search().connect).toBeUndefined(), SLOW);
  });

  it('a stale view (the browser shows another page) writes nothing to the address', async () => {
    const p = await open();
    W.elsewhere = '/bots';
    const replace = vi.spyOn(p.r.router.history, 'replace');
    await p.go(`${links.list}?connect=new&handoff=0123456789abcdef`);
    await screen.findByRole('dialog', { name: strings['connect.title'] }, SLOW);
    await act(async () => { await new Promise((ok) => setTimeout(ok, 50)); });
    expect(replace, 'no replace from the view').not.toHaveBeenCalled();
    expect(p.search()).toEqual({ connect: 'new', handoff: '0123456789abcdef' });
  });
});
