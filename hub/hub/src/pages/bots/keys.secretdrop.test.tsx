// Vitest: a rotated key leaves no copy behind on the page. The rotate hook hands its answer to the pane, which draws the
// key once; each drop of the key shown (Done, leaving Link and keys, a page hide) drops the hook's copy too. The control
// first: while the key is shown the hook holds it. Last: a rotate that may have gone through refuses every later press,
// in fixture mode too, and stays shown as such, so nothing is sent twice.
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as dataModule from './data';
import page from './page';
import strings from './strings.en.json';

// The rotate hook as the pane holds it now (each render's), and every run's answer.
const h = vi.hoisted(() => ({ rotate: null as ReturnType<typeof dataModule.useRotateKey> | null, answers: [] as unknown[] }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof dataModule>();
  return {
    ...real,
    useRotateKey: (linkId: string) => {
      const c = real.useRotateKey(linkId);
      const run: typeof c.run = async (v) => {
        const r = await c.run(v);
        h.answers.push(r);
        return r;
      };
      const wrapped = { ...c, run };
      h.rotate = wrapped;
      return wrapped;
    },
  };
});

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const at = (sel: string, tab = 'link') => `/bots?sel=${encodeURIComponent(sel)}&tab=${tab}`;
const done = () => screen.queryByRole('button', { name: strings['secret.done'] });

async function rotateLastKey() {
  // The keys table's own row menus (the Bot list's and the Addresses table's are other tables).
  const menus = within(screen.getByRole('table', { name: /^\d+ keys?$/ })).getAllByRole('button', { name: 'Row actions' });
  await userEvent.click(menus[menus.length - 1]!);
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['key.rotate']}`) }));
  const ask = await screen.findByRole('alertdialog', { name: strings['key.rotateTitle'] });
  await userEvent.click(within(ask).getByRole('button', { name: strings['key.rotate'] }));
}
/** Rotates the last key and waits for its key to be shown; the hook holds it then (the control). */
async function rotateAndShow() {
  await screen.findByText(strings['keys.new']);
  await rotateLastKey();
  expect(await screen.findByRole('button', { name: strings['secret.done'] })).toBeInTheDocument();
  expect(h.rotate?.data?.secret).toBeTruthy();
}

describe('a rotated key, once its shown copy is dropped', () => {
  beforeAll(async () => {
    await import('./view');
  }, 30000);
  afterEach(() => {
    h.rotate = null;
    h.answers = [];
  });

  it('Done drops the hook\'s copy too', async () => {
    await renderPage(page, { state: 'idle', path: at(CHIEF) });
    await rotateAndShow();
    await userEvent.click(screen.getByRole('button', { name: strings['secret.done'] }));
    await waitFor(() => expect(done()).toBeNull());
    expect(h.rotate?.data).toBeUndefined();
  }, 30000);

  it('leaving Link and keys drops the hook\'s copy too', async () => {
    const { router } = await renderPage(page, { state: 'idle', path: at(CHIEF) });
    await rotateAndShow();
    await act(async () => {
      await router.navigate({ href: at(CHIEF, 'apps') });
    });
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: 'apps' }));
    await waitFor(() => expect(h.rotate?.data).toBeUndefined());
    expect(done()).toBeNull();
  }, 30000);

  it('a page hide drops the hook\'s copy too', async () => {
    await renderPage(page, { state: 'idle', path: at(CHIEF) });
    await rotateAndShow();
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });
    await waitFor(() => expect(done()).toBeNull());
    expect(h.rotate?.data).toBeUndefined();
  }, 30000);
});

describe('a rotate that may have gone through (fixture mode)', () => {
  beforeAll(async () => {
    await import('./view');
  }, 30000);
  afterEach(() => {
    h.rotate = null;
    h.answers = [];
  });

  it('refuses every later press and stays shown as held: nothing is sent again', async () => {
    await renderPage(page, { state: 'keyLost', path: at(CHIEF) });
    await screen.findByText(strings['keys.new']);
    await rotateLastKey();
    await waitFor(() => expect(h.answers).toHaveLength(1));
    // The control: the first press is the held one, and the page says so.
    expect(h.answers[0]).toMatchObject({ outcome: 'pending' });
    expect((await screen.findAllByText(strings['secret.unknown'])).length).toBeGreaterThan(0);
    // Two more presses through the hook (the dialog's Rotate is off while held; any caller is refused the same way).
    for (let i = 0; i < 2; i++) {
      await act(async () => {
        await h.rotate?.run({ keyId: 'k-again' });
      });
      expect(h.rotate?.outcome).toBe('pending');
    }
    expect(h.answers.slice(1)).toEqual([
      { outcome: 'not_sent', code: 'READ_BACK_FIRST' },
      { outcome: 'not_sent', code: 'READ_BACK_FIRST' },
    ]);
    expect((await screen.findAllByText(strings['secret.unknown'])).length).toBeGreaterThan(0);
  }, 30000);
});
