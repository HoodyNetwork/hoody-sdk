// Vitest: a reset, forget, purge or Delete confirm acts on the Bot it was opened for. The view refreshes while the confirm is
// open; a Bot replaced under the same id since then (the view reads a new uid) must not be the one acted on, so the change sends
// the uid the confirm opened with (expect_uid) and the agent refuses it. The control: with no replacement, that is the view's uid.
import { act, renderPage, screen, userEvent, within } from '@app/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as dataModule from './data';
import page from './page';
import strings from './strings.en.json';

// `swap`: a uid the view reads in place of the Bot's own (its replacement), or null. `seen`: each Bot's own uid as read.
// `sent`: every Bot action run, with the hook's context (the view's uid at that render) and the vars the press sent.
const spy = vi.hoisted(() => ({
  swap: null as string | null,
  seen: new Map<string, string>(),
  sent: [] as Array<{ hook: { uid?: string }; vars: { action?: string; uid?: string } }>,
  memo: new WeakMap<object, { uid: string; bot: unknown }>(),
}));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof dataModule>();
  return {
    ...real,
    useBotView: (key: string | undefined) => {
      const q = real.useBotView(key);
      const b = q.bot;
      if (!b || !key) return q;
      spy.seen.set(key, b.uid);
      const swap = spy.swap;
      if (swap === null) return q;
      // One object per read and swap, so nothing keyed on the Bot object runs again for it.
      const m = spy.memo.get(b);
      const bot = m && m.uid === swap ? (m.bot as dataModule.BotView) : { ...b, uid: swap };
      spy.memo.set(b, { uid: swap, bot });
      return { ...q, bot };
    },
    useBotAction: (c?: Parameters<typeof real.useBotAction>[0]) => {
      const a = real.useBotAction(c);
      const run: typeof a.run = (vars) => {
        spy.sent.push({ hook: { ...(c ?? {}) }, vars: { ...(vars as object) } });
        return a.run(vars);
      };
      return { ...a, run };
    },
  };
});

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const at = (doParam: string) => `/bots?sel=${encodeURIComponent(CHIEF)}&do=${doParam}`;
const lastSent = () => spy.sent[spy.sent.length - 1];

describe('a confirm acts on the Bot it was opened for', () => {
  beforeAll(async () => {
    await import('./view');
  }, 30000);
  afterEach(() => {
    spy.swap = null;
    spy.seen.clear();
    spy.sent.length = 0;
  });

  async function pressDelete() {
    const dialog = screen.getByRole('alertdialog', { name: /Delete Chief/ });
    await userEvent.type(within(dialog).getByRole('textbox'), 'Chief');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['danger.deleteGo'] }));
  }

  it('Delete sends the uid the view read (the control)', async () => {
    await renderPage(page, { state: 'idle', path: at('delete') });
    await screen.findByRole('alertdialog', { name: /Delete Chief/ });
    const own = spy.seen.get(CHIEF);
    expect(own).toBeTruthy();
    await pressDelete();
    expect(lastSent()?.vars).toMatchObject({ action: 'delete', uid: own });
  }, 30000);

  it('Delete sends the uid the confirm opened with, not a replacement the view read since', async () => {
    const { queryClient } = await renderPage(page, { state: 'idle', path: at('delete') });
    await screen.findByRole('alertdialog', { name: /Delete Chief/ });
    const own = spy.seen.get(CHIEF);
    expect(own).toBeTruthy();
    spy.swap = 'u-replaced';
    // The view's refresh, as its timer would: the pane draws again with the replacement's uid.
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await pressDelete();
    // The pane had read the replacement (the hook's own context carries it), and the press still sent the confirm's uid.
    expect(lastSent()?.hook.uid).toBe('u-replaced');
    expect(lastSent()?.vars).toMatchObject({ action: 'delete', uid: own });
  }, 30000);

  it('Restart the conversation does the same', async () => {
    const { queryClient } = await renderPage(page, { state: 'idle', path: at('reset') });
    const dialog = await screen.findByRole('alertdialog', { name: strings['conv.reset.title'] });
    const own = spy.seen.get(CHIEF);
    expect(own).toBeTruthy();
    spy.swap = 'u-replaced';
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await userEvent.click(within(dialog).getByRole('button', { name: strings['conv.reset'] }));
    expect(lastSent()?.hook.uid).toBe('u-replaced');
    expect(lastSent()?.vars).toMatchObject({ action: 'reset', uid: own });
  }, 30000);
});
