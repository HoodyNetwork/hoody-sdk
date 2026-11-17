// Vitest: a fresh key's secret comes with the link's address to copy and the QR codes of
// the address, with and without the key (keyshare.link.test.tsx); no address, no code. The code with the key starts hidden, shows on press, hides again when the tab is hidden, and the address is not hidden at all. The
// block follows the secret's life: a replacement key remounts it (hidden, no press carried over, whichever string it
// holds) and a wipe of the secret field clears the secret-bearing state, which removes the block.
import { CoreQueryProvider, bootFixtureCore } from '@core';
import { act, render, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { Suspense, startTransition, useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Change, KeyFields, LinkKey, MintResult } from './data';
import page from './page';
import { KeyShare, issueKey } from './parts/KeyShare';
import { KeyDrawer } from './parts/LinkDrawers';
import strings from './strings.en.json';

// The kit note's words (kit/widgets/Propagating.strings.en.json propagating.created): pages reach the kit only through @kit.
const CREATED_NOTE = /can take about a minute/;
const SECRET = 'hbk_live_0123456789abcdefghijklmnopqrstuv';
const URL_ = 'https://shop-bot.example.net/';
const shown = () => screen.queryByRole('img', { name: strings['keyShare.qrLabel'] });
const hidden = () => screen.queryByRole('img', { name: strings['keyShare.qrHiddenLabel'] });
const showBtn = () => screen.queryByRole('button', { name: strings['keyShare.qrShow'] });
const press = () => userEvent.click(screen.getByRole('button', { name: strings['keyShare.qrShow'] }));
const pagehide = () =>
  act(() => {
    window.dispatchEvent(new Event('pagehide'));
  });

describe('KeyShare', () => {
  it('shows the address with a copy button, and the code hidden until Show', async () => {
    render(<KeyShare secret={SECRET} url={URL_} />);
    expect(screen.getByText(URL_)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['keyShare.copyAddress'] })).toBeInTheDocument();
    expect(shown()).toBeNull();
    expect(hidden()).toBeInTheDocument();
    await press();
    expect(shown()).toBeInTheDocument();
    expect(hidden()).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['keyShare.qrHide'] }));
    expect(shown()).toBeNull();
  });

  it('the key is never written as text, shown or not; no address means no address row', async () => {
    const { container, unmount } = render(<KeyShare secret={SECRET} url={URL_} />);
    expect(container.textContent).not.toContain(SECRET);
    await press();
    expect(container.innerHTML).not.toContain(SECRET);
    unmount();
    render(<KeyShare secret={SECRET} />);
    expect(screen.queryByText(strings['keyShare.address'])).toBeNull();
    expect(screen.queryByRole('button', { name: strings['keyShare.copyAddress'] })).toBeNull();
  });

  it('a hidden tab hides the code again', async () => {
    render(<KeyShare secret={SECRET} url={URL_} />);
    await press();
    expect(shown()).toBeInTheDocument();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    try {
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(shown()).toBeNull();
      expect(showBtn()).toBeInTheDocument();
    } finally {
      delete (document as unknown as Record<string, unknown>).visibilityState;
    }
  });

  it('a key too long for a code says so instead of drawing one', async () => {
    render(<KeyShare secret={'k'.repeat(4000)} url={URL_} />);
    await press();
    expect(screen.getByText(strings['keyShare.qrTooLong'])).toBeInTheDocument();
    expect(shown()).toBeNull();
  });

  it('that note is announced: its live region is there, empty, before Show, and the note goes into that same element', async () => {
    // A screen reader hears Show even when it draws no code. ARIA22: a status region must exist before its message.
    // The keyed code's own region (the address's CopyButton has a status line of its own).
    render(<KeyShare secret={'k'.repeat(4000)} url={URL_} />);
    const fig = screen.getByText(strings['keyShare.qrKeyed']).closest('figure')!;
    const region = within(fig).getByRole('status');
    expect(region.textContent).toBe('');
    await press();
    expect(screen.getByText(strings['keyShare.qrTooLong']).closest('[role="status"]')).toBe(region);
    await userEvent.click(screen.getByRole('button', { name: strings['keyShare.qrHide'] }));
    expect(within(fig).getByRole('status').textContent).toBe('');
  });

  it('a key that fits announces nothing: the code itself is the answer to Show', async () => {
    render(<KeyShare secret={SECRET} url={URL_} />);
    await press();
    expect(shown()).toBeInTheDocument();
    expect(within(screen.getByText(strings['keyShare.qrKeyed']).closest('figure')!).getByRole('status').textContent).toBe('');
  });

  it('issueKey is one id per holder object and never the text', () => {
    const a = { secret: SECRET };
    const b = { secret: SECRET };
    expect(issueKey(a)).toBe(issueKey(a));
    expect(issueKey(a)).not.toBe(issueKey(b));
    expect(issueKey(a)).not.toContain(SECRET);
  });
});

// A parent that holds the issued secret as state, as every mount site does: a wipe clears it, a new issue replaces it.
type Issued = { secret: string };
function Parent({ first, onReady }: { first: Issued | null; onReady: (api: { set: (v: Issued | null) => void; transition: (v: Issued) => void }) => void }) {
  const [held, setHeld] = useState<Issued | null>(first);
  const [pending, setPending] = useState<Issued | null>(null);
  onReady({ set: setHeld, transition: (v) => startTransition(() => setPending(v)) });
  return (
    <div>
      {held ? <KeyShare key={issueKey(held)} secret={held.secret} url={URL_} /> : null}
      {pending ? (
        <Suspense fallback={null}>
          <Never />
        </Suspense>
      ) : null}
    </div>
  );
}
function Never(): never {
  throw new Promise(() => undefined);
}

describe('a replacement key', () => {
  const setup = (first: Issued | null) => {
    let api!: { set: (v: Issued | null) => void; transition: (v: Issued) => void };
    render(<Parent first={first} onReady={(a) => (api = a)} />);
    return { set: (v: Issued | null) => act(() => api.set(v)), transition: (v: Issued) => act(() => api.transition(v)) };
  };
  it('starts hidden even though the first was shown', async () => {
    const { set } = setup({ secret: SECRET });
    await press();
    expect(shown()).toBeInTheDocument();
    set({ secret: `${SECRET}-second` });
    expect(shown()).toBeNull();
    expect(hidden()).toBeInTheDocument();
    await press();
    expect(shown()).toBeInTheDocument();
  });
  it('A, then B, then A again starts hidden: no earlier press comes back', async () => {
    const a = { secret: SECRET };
    const { set } = setup(a);
    await press();
    expect(shown()).toBeInTheDocument();
    set({ secret: `${SECRET}-second` });
    expect(shown()).toBeNull();
    set(a);
    expect(shown()).toBeNull();
    expect(hidden()).toBeInTheDocument();
    await press();
    expect(shown()).toBeInTheDocument();
    // The same text issued again is a new key: it starts hidden too.
    set({ secret: SECRET });
    expect(shown()).toBeNull();
    expect(hidden()).toBeInTheDocument();
  });
  it('a wipe clears the secret-bearing state: no Show button, and nothing brings an earlier key back', async () => {
    const a = { secret: SECRET };
    const b = { secret: `${SECRET}-second` };
    const { set } = setup(a);
    await press();
    expect(shown()).toBeInTheDocument();
    set(null);
    expect(showBtn()).toBeNull();
    expect(shown()).toBeNull();
    set(b);
    await press();
    expect(shown()).toBeInTheDocument();
    set(null);
    expect(showBtn()).toBeNull();
    // Only a newly issued key puts a block back, and it is hidden.
    set({ secret: SECRET });
    expect(shown()).toBeNull();
    expect(hidden()).toBeInTheDocument();
  });
  it('a replacement that is still loading (suspended) leaves the shown key as it was; the wipe then removes it for good', async () => {
    const { set, transition } = setup({ secret: SECRET });
    await press();
    transition({ secret: `${SECRET}-second` });
    expect(shown()).toBeInTheDocument();
    set(null);
    expect(showBtn()).toBeNull();
    expect(shown()).toBeNull();
  });
});

describe('the New key drawer, once the key is made', () => {
  const key: LinkKey = { id: 'k1', name: 'ci', prefix: 'hk_k1', enabled: true, allowlist: [], expiresAt: null, notes: '', holderNote: '', createdAt: '2026-10-25T00:00:00Z', rotatedAt: null };
  // The change holds the made key until reset, as the page's does.
  function Drawer({ url, onReset }: { url?: string; onReset?: () => void }) {
    const [data, setData] = useState<MintResult | undefined>(undefined);
    const mint = {
      run: async () => {
        setData({ key, secret: SECRET, curl: '' });
        return { outcome: 'done' as const };
      },
      outcome: data ? 'done' : 'idle',
      data,
      reset: () => {
        onReset?.();
        setData(undefined);
      },
      dismiss: () => undefined,
      readBack: async () => true,
    } as unknown as Change<MintResult, KeyFields>;
    const none = { run: vi.fn(), outcome: 'idle', data: undefined, reset: () => undefined, dismiss: () => undefined, readBack: async () => true } as never;
    return (
      <>
        <button onClick={() => setData({ key, secret: SECRET, curl: '' })}>remint</button>
        <KeyDrawer open onClose={() => undefined} editing={null} mint={mint} edit={none} url={url} />
      </>
    );
  }
  // The drawer opens on the form (opening resets the change), and Create makes the key.
  const drawer = async (url?: string, onReset?: () => void) => {
    bootFixtureCore({ rules: [] });
    render(<Drawer url={url} onReset={onReset} />, { wrapper: CoreQueryProvider });
    await userEvent.click(screen.getByRole('button', { name: strings['keyForm.create'] }));
    await screen.findByText(url ? strings['keyShare.qrKeyed'] : strings['keyShare.qrNoUrl']);
  };
  it('offers the address and the code beside the secret', async () => {
    await drawer(URL_);
    expect(screen.getByText(URL_)).toBeInTheDocument();
    expect(showBtn()).toBeInTheDocument();
  });
  it('a key made again while the drawer is up starts hidden, though the first code was shown', async () => {
    await drawer(URL_);
    await press();
    expect(shown()).toBeInTheDocument();
    act(() => screen.getByRole('button', { name: 'remint', hidden: true }).click());
    expect(shown()).toBeNull();
    expect(hidden()).toBeInTheDocument();
  });
  it('a wipe after the code was shown clears the made key: the code, the button and the address are gone', async () => {
    const reset = vi.fn();
    await drawer(URL_, reset);
    reset.mockClear();
    await press();
    expect(shown()).toBeInTheDocument();
    pagehide();
    expect(reset).toHaveBeenCalled();
    expect(shown()).toBeNull();
    expect(showBtn()).toBeNull();
    expect(screen.queryByText(URL_)).toBeNull();
  });
  it('without a known address it offers no code, only the note to copy the key', async () => {
    await drawer(undefined);
    expect(screen.queryByText(strings['keyShare.address'])).toBeNull();
    expect(showBtn()).toBeNull();
    expect(hidden()).toBeNull();
    expect(screen.getByText(strings['keyShare.qrNoUrl'])).toBeInTheDocument();
  });
});

describe('on the page', () => {
  const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
  beforeAll(async () => {
    await import('./view');
  }, 30000);
  it('a key made in the drawer comes with the link\'s address and a hidden code', async () => {
    await renderPage(page, { state: 'idle', path: `/bots?sel=${encodeURIComponent(CHIEF)}&tab=link&drawer=key` });
    const dialog = await screen.findByRole('dialog', { name: strings['keyForm.newTitle'] });
    await userEvent.click(within(dialog).getByRole('button', { name: strings['keyForm.create'] }));
    const secret = await screen.findByRole('dialog', { name: /Copy the key/ });
    expect(within(secret).getByText(/^https:\/\/.+/)).toBeInTheDocument();
    expect(within(secret).getByRole('img', { name: strings['keyShare.qrHiddenLabel'] })).toBeInTheDocument();
    expect(within(secret).getByRole('button', { name: strings['keyShare.qrShow'] })).toBeInTheDocument();
  }, 30000);

  it('a rotated key comes with the same address and hidden code; rotating again starts hidden', async () => {
    await renderPage(page, { state: 'idle', path: `/bots?sel=${encodeURIComponent(CHIEF)}&tab=link` });
    await screen.findByText(strings['keys.new']);
    const rotate = async () => {
      // The keys table's own row menus (the Bot list's and the Addresses table's are other tables).
      const menus = within(screen.getByRole('table', { name: /^\d+ keys?$/ })).getAllByRole('button', { name: 'Row actions' });
      await userEvent.click(menus[menus.length - 1]!);
      await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['key.rotate']}`) }));
      const ask = await screen.findByRole('alertdialog', { name: strings['key.rotateTitle'] });
      await userEvent.click(within(ask).getByRole('button', { name: strings['key.rotate'] }));
    };
    await rotate();
    expect(await screen.findByRole('button', { name: strings['keyShare.qrShow'] })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: strings['keyShare.qrHiddenLabel'] })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['keyShare.copyAddress'] })).toBeInTheDocument();
    await press();
    expect(shown()).toBeInTheDocument();
    await rotate();
    await screen.findByRole('button', { name: strings['keyShare.qrShow'] });
    expect(shown()).toBeNull();
    expect(hidden()).toBeInTheDocument();
    // The field's wipe (the page hiding) drops the fresh key: the block goes with it.
    await press();
    expect(shown()).toBeInTheDocument();
    pagehide();
    await waitFor(() => expect(showBtn()).toBeNull());
    expect(shown()).toBeNull();
    expect(hidden()).toBeNull();
  }, 30000);

  it('Done under a rotated key drops it: the code, its button and the address go with the secret', async () => {
    // LinkTab unmounts KeyShare when its fresh key is dropped (the secret field's Done, not only its wipe).
    await renderPage(page, { state: 'idle', path: `/bots?sel=${encodeURIComponent(CHIEF)}&tab=link` });
    await screen.findByText(strings['keys.new']);
    const menus = within(screen.getByRole('table', { name: /^\d+ keys?$/ })).getAllByRole('button', { name: 'Row actions' });
    await userEvent.click(menus[menus.length - 1]!);
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['key.rotate']}`) }));
    const ask = await screen.findByRole('alertdialog', { name: strings['key.rotateTitle'] });
    await userEvent.click(within(ask).getByRole('button', { name: strings['key.rotate'] }));
    await press();
    expect(shown()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['keyShare.copyAddress'] })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['secret.done'] }));
    await waitFor(() => expect(showBtn()).toBeNull());
    expect(shown()).toBeNull();
    expect(hidden()).toBeNull();
    expect(screen.queryByRole('button', { name: strings['keyShare.copyAddress'] })).toBeNull();
  }, 30000);

  it('a new Bot with a link shows its first key with the address and a hidden code; a wipe clears it', async () => {
    await renderPage(page, { path: '/bots?drawer=new&initial=c-atlas' });
    const dialog = await screen.findByRole('dialog', { name: strings['newBot.title'] });
    const link = within(dialog).getByRole('switch', { name: strings['newBot.link'] });
    if (!(link as HTMLInputElement).checked) await userEvent.click(link);
    await userEvent.click(within(dialog).getByRole('button', { name: strings['newBot.create'] }));
    expect(await within(dialog).findByText(strings['newBot.done'])).toBeInTheDocument();
    // Item 71: a link just made can take about a minute to start working (the kit's confirmation line, shown always).
    expect(within(dialog).getByText(CREATED_NOTE)).toBeInTheDocument();
    expect(within(dialog).getByRole('img', { name: strings['keyShare.qrHiddenLabel'] })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: strings['keyShare.copyAddress'] })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: strings['keyShare.qrShow'] }));
    expect(within(dialog).getByRole('img', { name: strings['keyShare.qrLabel'] })).toBeInTheDocument();
    pagehide();
    expect(within(dialog).queryByRole('img', { name: strings['keyShare.qrLabel'] })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: strings['keyShare.qrShow'] })).toBeNull();
  }, 30000);

  it('a new Bot made without a link says nothing about a link spreading', async () => {
    await renderPage(page, { state: 'newBotNoLink', path: '/bots?drawer=new&initial=c-atlas' });
    const dialog = await screen.findByRole('dialog', { name: strings['newBot.title'] });
    await userEvent.click(within(dialog).getByRole('button', { name: strings['newBot.create'] }));
    expect(await within(dialog).findByText(strings['newBot.done'])).toBeInTheDocument();
    expect(within(dialog).queryByText(CREATED_NOTE)).toBeNull();
    expect(within(dialog).queryByRole('button', { name: strings['keyShare.qrShow'] })).toBeNull();
  }, 30000);

  it('a new Bot that stopped part-way (name taken) says nothing about a link spreading', async () => {
    await renderPage(page, { state: 'newBotNameTaken', path: '/bots?drawer=new&initial=c-atlas' });
    const dialog = await screen.findByRole('dialog', { name: strings['newBot.title'] });
    // The result carries the link (createBotFlow stops after the link is made), so the link is asked for first.
    const link = within(dialog).getByRole('switch', { name: strings['newBot.link'] });
    if (!(link as HTMLInputElement).checked) await userEvent.click(link);
    await userEvent.click(within(dialog).getByRole('button', { name: strings['newBot.create'] }));
    expect(await within(dialog).findByText(strings['newBot.stop.nametaken.title'])).toBeInTheDocument();
    expect(within(dialog).queryByText(CREATED_NOTE)).toBeNull();
  }, 30000);
});
