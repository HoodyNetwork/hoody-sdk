import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { type ReactElement, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canQr, qrMatrix, standInMatrix } from './qr';
import { QrButton, QrCode, QrSecret } from './Qr';
import strings from './strings.en.json';

const SECRET = 'https://quiet-owl-01-terminal-1.n12.hoody.example/?k=7f3a9c';
let written: string[] = [];

beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (text: string) => (written.push(text), Promise.resolve()) },
  });
});
afterEach(() => vi.restoreAllMocks());

async function inRouter(Component: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  return router;
}

const press = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.click(el);
  });
};
const qrButton = (name = 'QR code') => screen.getAllByRole('button', { name })[0] as HTMLElement;
const pageText = () => document.body.innerHTML;

describe('qrMatrix', () => {
  it('only https addresses that fit get a code', () => {
    expect(qrMatrix(SECRET)?.size).toBeGreaterThan(20);
    expect(canQr('http://example.com')).toBe(false);
    expect(canQr('not a url')).toBe(false);
    expect(canQr(undefined)).toBe(false);
    expect(canQr(`https://example.com/${'x'.repeat(3000)}`)).toBe(false);
  });

  it('the stand-in never depends on an address', () => {
    const a = standInMatrix();
    const b = standInMatrix();
    expect([...Array(29 * 29).keys()].map((i) => a.dark(Math.floor(i / 29), i % 29))).toEqual([...Array(29 * 29).keys()].map((i) => b.dark(Math.floor(i / 29), i % 29)));
  });
});

describe('QrButton, secret address', () => {
  it('until Show the page holds neither the address nor its code; Copy still works', async () => {
    await inRouter(() => <QrButton url={SECRET} name="Terminal" reach="terminal" />);
    await press(qrButton());
    expect(screen.getByRole('dialog', { name: 'QR code: Terminal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Only share it with people you trust.' })).toBeInTheDocument();
    expect(screen.getByText('Hidden until you press Show')).toBeInTheDocument();
    // No link while hidden: nothing that opens or names the address.
    expect(document.querySelector('[data-secret-link], a[href]')).toBeNull();
    expect(screen.getByRole('img', { name: 'Hidden QR code' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'QR code for this address' })).toBeNull();
    expect(pageText()).not.toContain('quiet-owl-01-terminal');
    await press(screen.getByRole('button', { name: 'Copy' }));
    expect(written).toEqual([SECRET]);
    expect(pageText()).not.toContain('quiet-owl-01-terminal');
  });

  it('Show reveals the code and address, Hide puts the stand-in back, closing wipes it', async () => {
    await inRouter(() => <QrButton url={SECRET} name="Terminal" />);
    await press(qrButton());
    await press(screen.getByRole('button', { name: 'Show' }));
    expect(screen.getByRole('img', { name: 'QR code for this address' })).toBeInTheDocument();
    expect(screen.getByText(SECRET)).toBeInTheDocument();
    await press(screen.getByRole('button', { name: 'Hide' }));
    expect(pageText()).not.toContain('quiet-owl-01-terminal');
    expect(document.querySelector('[data-secret-link]')).toBeNull();
    await press(screen.getByRole('button', { name: 'Show' }));
    await press(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(pageText()).not.toContain('quiet-owl-01-terminal');
    await press(qrButton());
    expect(screen.getByRole('button', { name: 'Show' })).toBeInTheDocument();
    expect(pageText()).not.toContain('quiet-owl-01-terminal');
  });

  it('Open opens a new tab without opener', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await inRouter(() => <QrButton url={SECRET} name="Terminal" />);
    await press(qrButton());
    await press(screen.getByRole('button', { name: 'Open' }));
    expect(open).toHaveBeenCalledWith(SECRET, '_blank', 'noopener,noreferrer');
  });

  it('a changed address closes the open surface instead of showing the new one', async () => {
    let setUrl: (u: string) => void = () => undefined;
    function Host() {
      const [url, set] = useState(SECRET);
      setUrl = set;
      return <QrButton url={url} name="Terminal" secret={false} />;
    }
    await inRouter(Host);
    await press(qrButton());
    expect(screen.getByText(SECRET)).toBeInTheDocument();
    await act(async () => setUrl('https://other.example.com/'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(pageText()).not.toContain('other.example.com');
  });

  it('a resetKey change (realm switch) closes it', async () => {
    let setKey: (k: string) => void = () => undefined;
    function Host() {
      const [key, set] = useState('r1');
      setKey = set;
      return <QrButton url={SECRET} name="Terminal" resetKey={key} />;
    }
    await inRouter(Host);
    await press(qrButton());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () => setKey('r2'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('only one QR surface is open at a time', async () => {
    await inRouter(() => (
      <>
        <QrButton url={SECRET} name="Terminal" />
        <QrButton url="https://files.example.com/" name="Files" />
      </>
    ));
    const [a, b] = screen.getAllByRole('button', { name: 'QR code' }) as [HTMLElement, HTMLElement];
    await press(a);
    expect(screen.getByRole('dialog', { name: 'QR code: Terminal' })).toBeInTheDocument();
    await press(b);
    expect(screen.queryByRole('dialog', { name: 'QR code: Terminal' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'QR code: Files' })).toBeInTheDocument();
  });
});

describe('QrButton, other addresses', () => {
  it('a non-secret address shows at once with no Show button', async () => {
    await inRouter(() => <QrButton url="https://hoody.com/download" name="Download" secret={false} />);
    await press(qrButton());
    expect(screen.getByText('https://hoody.com/download')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show' })).toBeNull();
  });

  it('an address that cannot be a QR code disables the button with the reason', async () => {
    await inRouter(() => <QrButton url="http://plain.example.com/" name="Plain" />);
    const b = qrButton('No QR code for this address');
    expect(b).toHaveAttribute('aria-disabled', 'true');
    await press(b);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('the shown address is the kit link, the trust sentence says what it reaches, and the size control', () => {
  it('shown: the address is the kit new-tab link (a button, no href), its words the whole address; a press opens it with no opener and no referrer (as Open)', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await inRouter(() => <QrButton url={SECRET} name="Terminal" reach="terminal" />);
    await press(qrButton());
    await press(screen.getByRole('button', { name: 'Show' }));
    const link = screen.getByRole('button', { name: `${SECRET} (opens in a new tab)` });
    expect(link).toHaveAttribute('data-secret-link', '');
    expect(link).toHaveTextContent(SECRET);
    expect(document.querySelector('a[href*="quiet-owl"]')).toBeNull();
    expect(pageText()).not.toMatch(/href="[^"]*quiet-owl/);
    await press(link);
    expect(open).toHaveBeenCalledWith(SECRET, '_blank', 'noopener,noreferrer');
    // Copy still copies exactly the address.
    await press(screen.getByRole('button', { name: 'Copy' }));
    expect(written).toEqual([SECRET]);
  });

  it('the trust sentence is an InfoTip that says what the address reaches, per program', async () => {
    for (const [reach, words] of [
      ['terminal', strings['qr.reach.terminal']],
      ['desktop', strings['qr.reach.desktop']],
      ['files', strings['qr.reach.files']],
      ['browser', strings['qr.reach.browser']],
      ['agent', strings['qr.reach.agent']],
      ['port', strings['qr.reach.port']],
      ['alias', strings['qr.reach.alias']],
    ] as const) {
      const view = render(
        <QrSecret reach={words}>
          <QrCode matrix={qrMatrix(SECRET)!} label="Code" secret />
        </QrSecret>,
      );
      const tip = screen.getByRole('button', { name: 'Only share it with people you trust.' });
      await press(tip);
      expect(screen.getByRole('dialog', { name: 'Only share it with people you trust.' }), reach).toHaveTextContent(words);
      view.unmount();
    }
    expect(strings['qr.reach.terminal']).toBe('It opens a shell on this computer as its user: the whole computer, with all of its files and programs.');
    // A program address's key is the computer's: every other program's note says it can open the rest, the terminal too.
    for (const k of ['desktop', 'files', 'browser', 'agent', 'port', 'program'] as const) expect(strings[`qr.reach.${k}`]).toContain("The same key can open the computer's other programs too, its terminal included.");
    expect(strings['qr.reach.program']).toMatch(/^It opens this program on your computer\./);
    // A custom address (alias) is the server's own address for one program: its note claims nothing about other programs.
    expect(strings['qr.reach.alias']).toBe('Anyone with this address can open this program.');
  });

  it('QrButton: a program kind picks its words; none on a secret address is one program on the computer; a page may give its own', async () => {
    const tipText = async () => {
      await press(screen.getByRole('button', { name: 'Only share it with people you trust.' }));
      return screen.getByRole('dialog', { name: 'Only share it with people you trust.' }).textContent;
    };
    await inRouter(() => <QrButton url={SECRET} name="Desktop" reach="desktop" />);
    await press(qrButton());
    expect(await tipText()).toBe(strings['qr.reach.desktop']);
    cleanup();
    await inRouter(() => <QrButton url={SECRET} name="Notes" />);
    await press(qrButton());
    expect(await tipText()).toBe(strings['qr.reach.program']);
    cleanup();
    await inRouter(() => <QrButton url="https://3f9a0c7e5b2d4f6a8c1e0b3d5f7a9c2e4b6d8f0a1c3e5b7d.quiet-amber-heron-1234-fra.computers.hoody.com" name="Viewer link" secret={false} keyed reach={{ text: 'Anyone with this link can watch while you broadcast.' }} />);
    await press(qrButton());
    expect(await tipText()).toBe('Anyone with this link can watch while you broadcast.');
  });

  it('the size control sits beside Close (maximize / minimize icons, named Make larger / Make smaller), not in the action row', async () => {
    await inRouter(() => <QrButton url={SECRET} name="Terminal" />);
    await press(qrButton());
    const dialog = screen.getByRole('dialog', { name: 'QR code: Terminal' });
    const larger = within(dialog).getByRole('button', { name: 'Make larger' });
    const close = within(dialog).getByRole('button', { name: 'Close' });
    expect(larger.parentElement).toBe(close.parentElement);
    expect(larger.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Open' }).parentElement!.contains(larger)).toBe(false);
  });
});

describe('a code that carries a key says so', () => {
  const NOTE = strings['qr.keyNote'];
  const tagOf = (box: HTMLElement) => box.querySelector<SVGElement>('svg[data-qr-key]');

  it('QrSecret: the key badge on top of the code (before its box, never inside it), the caption under it, and the code described by the caption', () => {
    expect(NOTE).toBe('Contains a key. Only share it with people you trust.');
    const { container } = render(
      <QrSecret>
        <QrCode matrix={qrMatrix(SECRET)!} label="Code" secret />
      </QrSecret>,
    );
    const code = screen.getByRole('img', { name: 'Code' });
    expect(code).toHaveAccessibleDescription(NOTE);
    expect(screen.getByText(NOTE)).toBeVisible();
    const tag = tagOf(container)!;
    const badgeEl = tag.parentElement!;
    expect(badgeEl).toHaveAttribute('aria-hidden', 'true');
    expect(badgeEl).toHaveTextContent(strings['qr.keyBadge']);
    expect(tag.querySelector('path')).toHaveAttribute('d', 'M1 3h6v6H1zM3 5v2h2V5zM7 5h4v2H7zM9 7h2v2H9z');
    expect(code.contains(tag)).toBe(false);
    // On top: the badge comes before the code's box, a sibling of it; the caption comes after.
    const box = code.parentElement!;
    expect(box.contains(badgeEl)).toBe(false);
    expect(badgeEl.nextElementSibling).toBe(box);
    expect(box.parentElement!.nextElementSibling).toBe(screen.getByText(NOTE).closest('p'));
    expect(container.querySelectorAll('svg[data-qr-key]')).toHaveLength(1);
  });

  it('a secret code is drawn exactly as one that is not: same box, same modules, same mark, nothing added', () => {
    for (const m of [qrMatrix(SECRET)!, qrMatrix(`${SECRET}&${'x'.repeat(600)}`)!, standInMatrix()]) {
      const plain = render(<QrCode matrix={m} label="Code" secret={false} />).container.innerHTML;
      const keyed = render(
        <QrSecret>
          <QrCode matrix={m} label="Code" secret />
        </QrSecret>,
      ).container.querySelector('svg[role="img"]')!.outerHTML;
      expect(keyed).toMatch(/ aria-describedby="[^"]+"/);
      expect(keyed.replace(/ aria-describedby="[^"]*"/, '')).toBe(plain);
    }
  });

  it('a 2FA-style caption replaces the words, and still describes the code', () => {
    render(
      <QrSecret note="Contains your sign-in key">
        <QrCode matrix={qrMatrix(SECRET)!} label="Code" secret />
      </QrSecret>,
    );
    expect(screen.getByRole('img', { name: 'Code' })).toHaveAccessibleDescription('Contains your sign-in key');
    expect(screen.queryByText(NOTE)).toBeNull();
  });

  it('a secret address in a QR panel: the hidden and the shown code are described by the caption, which starts with the key mark (no badge above the code: one column of slots)', async () => {
    await inRouter(() => <QrButton url={SECRET} name="Terminal" />);
    await press(qrButton());
    const dialog = screen.getByRole('dialog', { name: 'QR code: Terminal' });
    expect(screen.getByRole('img', { name: 'Hidden QR code' })).toHaveAccessibleDescription(NOTE);
    expect(tagOf(dialog)).toBeNull();
    const caption = within(dialog).getByText(strings['qr.keyNoteLead']).closest('p')!;
    expect(caption).toBeVisible();
    expect(caption.firstElementChild!.tagName.toLowerCase()).toBe('svg');
    await press(screen.getByRole('button', { name: 'Show' }));
    expect(screen.getByRole('img', { name: 'QR code for this address' })).toHaveAccessibleDescription(NOTE);
    expect(tagOf(dialog)).toBeNull();
  });

  it('an address that is not secret: no tag, no description, no caption', async () => {
    await inRouter(() => <QrButton url="https://hoody.com/download" name="Download" secret={false} />);
    await press(qrButton());
    const dialog = screen.getByRole('dialog', { name: 'QR code: Download' });
    expect(screen.getByRole('img', { name: 'QR code for this address' })).not.toHaveAttribute('aria-describedby');
    expect(tagOf(dialog)).toBeNull();
    expect(within(dialog).queryByText(NOTE)).toBeNull();
  });

  it('an address shown at once that grants access (keyed): shown with no Show, and it wears the caption', async () => {
    await inRouter(() => <QrButton url="https://3f9a0c7e5b2d4f6a8c1e0b3d5f7a9c2e4b6d8f0a1c3e5b7d.quiet-amber-heron-1234-fra.computers.hoody.com" name="Viewer link" secret={false} keyed />);
    await press(qrButton());
    const dialog = screen.getByRole('dialog', { name: 'QR code: Viewer link' });
    expect(screen.queryByRole('button', { name: 'Show' })).toBeNull();
    expect(screen.getByRole('img', { name: 'QR code for this address' })).toHaveAccessibleDescription(NOTE);
    expect(within(dialog).getByText(NOTE)).toBeVisible();
  });
});
