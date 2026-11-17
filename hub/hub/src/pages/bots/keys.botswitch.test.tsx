// Vitest: a rotate answered after the person picked another Bot. The Bot pane stays mounted across a Bot change, so the
// answer still reaches it; the new key is shown only on its own Bot's Link and keys, never under another Bot's address.
// The positive control first: the same held answer, released with the Bot still on screen, shows its key. Last: a rotate
// answered "may have gone through" says so on its own Bot only, and says it again when that Bot comes back.
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as dataModule from './data';
import page from './page';
import strings from './strings.en.json';

// The rotate's answer waits for the test: `gate` holds it, `open` lets it through, `answered` counts answers handed back.
const hold = vi.hoisted(() => ({ gate: null as Promise<void> | null, open: (): void => undefined, answered: 0 }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof dataModule>();
  return {
    ...real,
    useRotateKey: (linkId: string) => {
      const c = real.useRotateKey(linkId);
      const run: typeof c.run = async (v) => {
        await hold.gate;
        const r = await c.run(v);
        hold.answered += 1;
        return r;
      };
      return { ...c, run };
    },
  };
});
const holdRotate = () => {
  hold.gate = new Promise<void>((go) => {
    hold.open = () => go();
  });
};

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const SUPPORT = 'c-atlas~a1b2c3d4e5f60718293a4b5c~support';
const at = (sel: string) => `/bots?sel=${encodeURIComponent(sel)}&tab=link`;
// The secret field's group is named by its label, "Copy the key “<name>” now".
const SECRET_FIELD = new RegExp(`^${strings['secret.title'].split('{{name}}')[0]}`);
const secretField = () => screen.queryByRole('group', { name: SECRET_FIELD });
const done = () => screen.queryByRole('button', { name: strings['secret.done'] });

async function rotateLastKey() {
  // The keys table's own row menus (the Bot list's and the Addresses table's are other tables).
  const menus = within(screen.getByRole('table', { name: /^\d+ keys?$/ })).getAllByRole('button', { name: 'Row actions' });
  await userEvent.click(menus[menus.length - 1]!);
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['key.rotate']}`) }));
  const ask = await screen.findByRole('alertdialog', { name: strings['key.rotateTitle'] });
  await userEvent.click(within(ask).getByRole('button', { name: strings['key.rotate'] }));
}

describe('a rotate answered after a Bot change', () => {
  beforeAll(async () => {
    await import('./view');
  }, 30000);
  afterEach(() => {
    hold.open();
    hold.gate = null;
    hold.answered = 0;
  });

  it('with its Bot still on screen, the held answer shows the new key (the control)', async () => {
    await renderPage(page, { state: 'idle', path: at(CHIEF) });
    await screen.findByText(strings['keys.new']);
    holdRotate();
    await rotateLastKey();
    expect(done()).toBeNull();
    await act(async () => hold.open());
    await waitFor(() => expect(hold.answered).toBe(1));
    expect(await screen.findByRole('button', { name: strings['secret.done'] })).toBeInTheDocument();
    expect(secretField()).toBeInTheDocument();
  }, 30000);

  it('another Bot picked before the answer: its Link and keys shows no secret, no Done', async () => {
    const { router } = await renderPage(page, { state: 'idle', path: at(CHIEF) });
    await screen.findByText(strings['keys.new']);
    holdRotate();
    await rotateLastKey();
    await act(async () => {
      await router.navigate({ href: at(SUPPORT) });
    });
    await waitFor(() => expect(router.state.location.search).toMatchObject({ sel: SUPPORT }));
    // Support's pane is on screen, not Chief's (Chief draws "New key" too, so that alone would not say whose page it is).
    await screen.findByRole('heading', { name: 'Support', level: 2 });
    expect(screen.queryByRole('heading', { name: 'Chief', level: 2 })).toBeNull();
    // Support's Link and keys is on screen (its link is off but listed, so its Keys part, where a new key shows, is drawn).
    await screen.findByText(strings['keys.new']);
    await act(async () => hold.open());
    await waitFor(() => expect(hold.answered).toBe(1));
    // `answered` counts as the answer is handed back; the tab's own follow-up (onRotated) runs right after: give it a turn.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.getByText(strings['keys.new'])).toBeInTheDocument();
    expect(done()).toBeNull();
    expect(secretField()).toBeNull();
  }, 30000);

  // The pane stays mounted, and so do its key hooks: a rotate's own "may have gone through" belongs to its link only, and
  // stays with it (fixture mode keeps the pending only in the hook: losing it would also let a second rotate through).
  it('a rotate that may have gone through, then another Bot and back: only its own page says so, again on return', async () => {
    const { router } = await renderPage(page, { state: 'keyLost', path: at(CHIEF) });
    await screen.findByText(strings['keys.new']);
    await rotateLastKey();
    await waitFor(() => expect(hold.answered).toBe(1));
    // The control: Chief's own page says it.
    expect((await screen.findAllByText(strings['secret.unknown'])).length).toBeGreaterThan(0);
    await act(async () => {
      await router.navigate({ href: at(SUPPORT) });
    });
    await screen.findByRole('heading', { name: 'Support', level: 2 });
    await screen.findByText(strings['keys.new']);
    expect(screen.queryByText(strings['secret.unknown'])).toBeNull();
    // Chief again: its page says it again (the hook kept Chief's pending); no rotate ran again on the way.
    await act(async () => {
      await router.navigate({ href: at(CHIEF) });
    });
    await screen.findByRole('heading', { name: 'Chief', level: 2 });
    expect((await screen.findAllByText(strings['secret.unknown'])).length).toBeGreaterThan(0);
    expect(hold.answered).toBe(1);
  }, 30000);
});
