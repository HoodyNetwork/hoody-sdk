// Vitest (fixture mode): leaving Link and keys while a rotate is still out leaves that rotate running. The tab-leave
// reset (BotPane's [tab] effect) never sets a running change back to idle, so the Rotate dialog stays busy on the way
// back and a second press cannot send a second rotate; the answer still lands once. Live, the core lock shows the
// change running whatever its slot says; fixture mode reads the slot alone. The idle state's rotate is answered after
// 2500 ms here (as linkCreateSlow's create is after 600 ms), long enough to leave Link while it is out.
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as dataModule from './data';
import fixtures from './fixtures';
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
// The fixture module the page loads (one instance per test file): its idle state's rotate gets a delay for each case.
const idle = fixtures.states.idle as unknown as Record<string, unknown>;
const ROTATE_MS = 2500;

async function rotateLastKey() {
  // The keys table's own row menus (the Bot list's and the Addresses table's are other tables).
  const menus = within(screen.getByRole('table', { name: /^\d+ keys?$/ })).getAllByRole('button', { name: 'Row actions' });
  await userEvent.click(menus[menus.length - 1]!);
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['key.rotate']}`) }));
  const ask = await screen.findByRole('alertdialog', { name: strings['key.rotateTitle'] });
  await userEvent.click(within(ask).getByRole('button', { name: strings['key.rotate'] }));
}

describe('a rotate still out when the person leaves Link and keys (fixture mode)', () => {
  let rotateKey: unknown;
  beforeAll(async () => {
    await import('./view');
  }, 30000);
  beforeEach(() => {
    rotateKey = idle.rotateKey;
    idle.rotateKey = { ...(rotateKey as object), delayMs: ROTATE_MS };
  });
  afterEach(() => {
    idle.rotateKey = rotateKey;
    h.rotate = null;
    h.answers = [];
  });

  it('stays running after the tab-leave reset, and its one answer lands', async () => {
    const { router } = await renderPage(page, { state: 'idle', path: at(CHIEF) });
    await screen.findByText(strings['keys.new']);
    await rotateLastKey();
    // The control: the rotate is out, nothing answered yet.
    await waitFor(() => expect(h.rotate?.running).toBe(true));
    expect(h.answers).toEqual([]);
    await act(async () => {
      await router.navigate({ href: at(CHIEF, 'apps') });
    });
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: 'apps' }));
    // The tab-leave reset has run: the rotate is still running, not idle (before the fix it read idle here).
    expect(h.answers).toEqual([]);
    expect(h.rotate?.running).toBe(true);
    expect(h.rotate?.outcome).toBe('running');
    // Its answer lands once, as it comes.
    await waitFor(() => expect(h.answers).toHaveLength(1), { timeout: ROTATE_MS + 5000 });
    expect(h.answers[0]).toMatchObject({ outcome: 'done' });
  }, 30000);
});
