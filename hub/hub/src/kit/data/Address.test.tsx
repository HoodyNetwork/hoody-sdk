// AddressField: an address shown masked, handed whole to Copy, Open and the QR code.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QrCode } from '../qr/Qr';
import { qrMatrix } from '../qr/qr';
import { AddressField, AddressList, AddressRow, AddressText, webAddress } from './Address';
import strings from './Address.strings.en.json';

const P = '6a0000000000000000000001';
const C = 'c0ffee0000000000000000aa';
const URL_ = `https://${P}-${C}-http-8080.n12.example.test`;
// Masked text (an address that is not opened) and the fixed text of the button that opens a secret address.
const MASKED = 'https://6a00…0001-c0ff…00aa-http-8080.n12.example.test';
const SHOWN = 'https://••••';
const NAME = `${SHOWN}: port 8080 (opens in a new tab)`;

let written: string[] = [];
beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (s: string) => (written.push(s), Promise.resolve()) } });
});
afterEach(() => vi.restoreAllMocks());

async function inRouter(Component: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}
const press = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.click(el);
  });
};

describe('AddressText', () => {
  it('shows every 24-hex id masked, with the scheme; the tooltip is masked too', () => {
    render(<AddressText url={URL_} />);
    const el = screen.getByText(MASKED);
    expect(el.getAttribute('title')).toBe(MASKED);
    expect(document.body.innerHTML).not.toContain(P);
    expect(document.body.innerHTML).not.toContain(C);
  });

  it('opens only when asked to and only a web address; never an <a href> holding the whole address', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { unmount } = render(<AddressText url={URL_} />);
    await press(screen.getByText(MASKED));
    unmount();
    render(<AddressText url="ssh://root@host.example.test:22" open />);
    await press(screen.getByText('ssh://root@host.example.test:22'));
    expect(open).not.toHaveBeenCalled();
    expect(document.querySelector('a')).toBeNull();
  });
});

describe('AddressText that opens', () => {
  it('a program address is a button with fixed text: nothing of the address, in the text, the name or any attribute', () => {
    render(<AddressText url={URL_} open name="port 8080" />);
    const b = screen.getByRole('button', { name: NAME });
    expect(b.textContent).toBe(SHOWN);
    for (const part of [P, C, 'n12.example.test', 'http-8080', '6a00…']) expect(document.body.innerHTML).not.toContain(part);
    expect(document.querySelector('[href], [title]')).toBeNull();
  });

  it('an address on the user\'s own domain is an ordinary new-tab link with its address shown', () => {
    render(<AddressText url="https://shop.example.test" open name="shop" />);
    const a = screen.getByRole('link');
    expect(a.getAttribute('href')).toBe('https://shop.example.test');
    expect(a.textContent).toBe('https://shop.example.test');
  });
});

describe('AddressText that is cut short', () => {
  it('a secret address has no tooltip on focus or hover; an address on the user\'s own domain shows its address in one', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<AddressText url={URL_} open />);
    await user.tab();
    await new Promise((r) => setTimeout(r, 700));
    expect(screen.queryByRole('tooltip')).toBeNull();
    await user.hover(screen.getByRole('button'));
    await new Promise((r) => setTimeout(r, 700));
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(document.body.innerHTML).not.toContain(P);
    unmount();
    render(<AddressText url="https://app.example.test/docs" open />);
    await user.tab();
    expect((await screen.findByRole('tooltip')).textContent).toBe('https://app.example.test/docs');
  });
});

describe('AddressRow', () => {
  it('its `label` is the address button\'s accessible name; without it the name is the fixed text alone', () => {
    render(
      <AddressList>
        <AddressRow name="Terminal" url={URL_} open label="Terminal" />
        <AddressRow name="Files" url={URL_} open />
      </AddressList>,
    );
    expect(screen.getByRole('button', { name: `${SHOWN}: Terminal (opens in a new tab)` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `${SHOWN} (opens in a new tab)` })).toBeInTheDocument();
  });
});

describe('AddressField', () => {
  it('the address is a button the keyboard reaches that opens it in a new tab with noopener, with no href in the page', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await inRouter(() => <AddressField url={URL_} label="port 8080" />);
    const btn = screen.getByRole('button', { name: NAME });
    expect(document.querySelector('a')).toBeNull();
    expect(btn.getAttribute('tabindex')).toBeNull();
    await press(btn);
    expect(open).toHaveBeenCalledWith(URL_, '_blank', 'noopener');
    await userEvent.tab();
    expect(document.activeElement).toBe(btn);
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Copy port 8080' }));
  });

  it('a click that ends a selection inside the address opens nothing; a selection elsewhere does not stop it', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await inRouter(() => (
      <>
        <p>elsewhere text</p>
        <AddressField url={URL_} label="port 8080" />
      </>
    ));
    const btn = screen.getByRole('button', { name: NAME });
    const select = (node: Node) => {
      const r = document.createRange();
      r.selectNodeContents(node);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(r);
    };
    // A pointer click carries detail >= 1; a keyboard activation (detail 0) opens whatever is selected.
    const pointer = async (el: HTMLElement) => {
      await act(async () => {
        fireEvent.click(el, { detail: 1 });
      });
    };
    select(btn);
    await pointer(btn);
    expect(open).not.toHaveBeenCalled();
    select(screen.getByText('elsewhere text'));
    await pointer(btn);
    expect(open).toHaveBeenCalledTimes(1);
    window.getSelection()?.removeAllRanges();
  });

  it('Copy copies the whole address and Open opens it in a new tab with noopener', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await inRouter(() => <AddressField url={URL_} label="port 8080" />);
    expect(screen.getByText(SHOWN)).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(P);
    await press(screen.getByRole('button', { name: 'Copy port 8080' }));
    expect(written).toEqual([URL_]);
    await press(screen.getByRole('button', { name: 'Open port 8080 in a new tab' }));
    expect(open).toHaveBeenCalledWith(URL_, '_blank', 'noopener');
  });

  it('idle: Open still opens, and says the address will not answer until started', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await inRouter(() => <AddressField url={URL_} label="port 8080" idle />);
    await press(screen.getByRole('button', { name: "Open port 8080 in a new tab (it won't answer until it is started)" }));
    expect(open).toHaveBeenCalledWith(URL_, '_blank', 'noopener');
  });

  it('the QR code is secret until Show, then encodes the whole address', async () => {
    await inRouter(() => <AddressField url={URL_} label="port 8080" />);
    await press(screen.getByRole('button', { name: 'QR code' }));
    const dialog = screen.getByRole('dialog', { name: 'QR code: port 8080' });
    expect(screen.queryByRole('img', { name: 'QR code for this address' })).toBeNull();
    expect(document.body.innerHTML).not.toContain(P);
    await press(screen.getByRole('button', { name: 'Show' }));
    expect(dialog.textContent).toContain(URL_);
    const shown = screen.getByRole('img', { name: 'QR code for this address' }).querySelector('path')?.getAttribute('d');
    const m = qrMatrix(URL_);
    if (!m) throw new Error('no matrix');
    const { container } = render(<QrCode matrix={m} label="want" />);
    expect(shown).toBeTruthy();
    expect(shown).toBe(container.querySelector('path')?.getAttribute('d'));
  });

  it('keyboard: Enter and Space on the address itself open the whole address in a new tab with noopener', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const user = userEvent.setup();
    await inRouter(() => <AddressField url={URL_} label="port 8080" />);
    await user.tab();
    const addr = screen.getByRole('button', { name: NAME });
    expect(document.activeElement).toBe(addr);
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(open.mock.calls).toEqual([
      [URL_, '_blank', 'noopener'],
      [URL_, '_blank', 'noopener'],
    ]);
  });

  it('keyboard: Tab reaches the address, then Copy, then Open; Enter and Space open the whole address in a new tab with noopener', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const user = userEvent.setup();
    await inRouter(() => <AddressField url={URL_} label="port 8080" />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: NAME }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Copy port 8080' }));
    await user.tab();
    const openBtn = screen.getByRole('button', { name: 'Open port 8080 in a new tab' });
    expect(document.activeElement).toBe(openBtn);
    await user.keyboard('{Enter}');
    expect(open.mock.calls).toEqual([[URL_, '_blank', 'noopener']]);
    await user.keyboard(' ');
    expect(open.mock.calls).toEqual([
      [URL_, '_blank', 'noopener'],
      [URL_, '_blank', 'noopener'],
    ]);
    expect(document.activeElement).toBe(openBtn);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'QR code' }));
  });

  it('keyboard: an invalid address leaves Open out of the Tab order and Enter opens nothing', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const user = userEvent.setup();
    await inRouter(() => <AddressField url="javascript:alert(1)" label="port 8080" />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Copy port 8080' }));
    await user.tab();
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Open port 8080 in a new tab' }));
    await user.keyboard('{Enter}');
    expect(open).not.toHaveBeenCalled();
  });

  it('a new resetKey closes an open QR code', async () => {
    function Harness() {
      const [key, setKey] = useState('a');
      return (
        <>
          <AddressField url={URL_} label="port 8080" resetKey={key} />
          <button type="button" onClick={() => setKey('b')}>
            other computer
          </button>
        </>
      );
    }
    await inRouter(() => <Harness />);
    await press(screen.getByRole('button', { name: 'QR code' }));
    expect(screen.getByRole('dialog', { name: 'QR code: port 8080' })).toBeInTheDocument();
    await press(screen.getByRole('button', { name: 'other computer' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('an empty address shows a dash and no buttons', async () => {
    await inRouter(() => <AddressField url="" label="port 8080" />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it.each([
    ['malformed', 'not a url'],
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:text/html,<b>x</b>'],
    ['scheme-relative', '//shop.example.test'],
    ['https: with no slashes', 'https:shop.example.test'],
  ])('a %s address: Open is disabled and opens nothing; QR has no code', async (_k, bad) => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await inRouter(() => <AddressField url={bad} label="port 8080" />);
    const btn = screen.getByRole('button', { name: 'Open port 8080 in a new tab' });
    expect(btn).toBeDisabled();
    await press(btn);
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'No QR code for this address' })).toBeInTheDocument();
  });

  it('webAddress accepts absolute http and https only, as given', () => {
    expect(webAddress(URL_)).toBe(URL_);
    expect(webAddress('http://shop.example.test/a?b=1')).toBe('http://shop.example.test/a?b=1');
    expect(webAddress('HTTPS://Shop.example.test')).toBe('HTTPS://Shop.example.test');
    for (const bad of ['', '   ', 'not a url', 'javascript:alert(1)', 'data:text/html,x', 'ftp://shop.example.test', '//shop.example.test', 'https:shop', 'https://', 'http://shop example.test']) {
      expect(webAddress(bad)).toBe('');
    }
  });

  it('a plain http address shows with its scheme too (any case)', async () => {
    await inRouter(() => <AddressField url="HTTP://shop.example.test" label="shop" />);
    expect(screen.getByText('HTTP://shop.example.test')).toBeInTheDocument();
  });

  it('its strings name no host', () => {
    expect(Object.values(strings).join('\n')).not.toMatch(/https?:|[a-z0-9-]+\.(?!(?:js|ts|json|md)\b)[a-z]{2,}\b/i);
  });
});
