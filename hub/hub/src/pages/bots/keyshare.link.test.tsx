// Vitest (a QR code opens the Bot from a phone, with or without the
// key): beside a fresh key, two codes. The address only, shown at once, and the address with the
// key after # (url + '/#key=' + key, the shape the Bot's page reads: page.js shareLink / readKeyFromLocation), hidden until
// Show, wearing the key badge. No address, no code at all: a note says to copy the key.
import { QrCode, qrMatrix } from '@kit';
import { render, screen, userEvent, within } from '@app/testing';
import { describe, expect, it } from 'vitest';
import { KeyShare, keyedLink } from './parts/KeyShare';
import strings from './strings.en.json';

const SECRET = 'hbk_live_0123456789abcdefghijklmnopqrstuv';
const ORIGIN = 'https://shop-bot.example.net';
const keyed = () => screen.queryByRole('img', { name: strings['keyShare.qrLabel'] });
const plain = () => screen.queryByRole('img', { name: strings['keyShare.qrPlainLabel'] });
const press = () => userEvent.click(screen.getByRole('button', { name: strings['keyShare.qrShow'] }));
const badge = (el: Element) => el.querySelector('svg[data-qr-key]');
const figureOf = (caption: string) => screen.getByText(caption).closest('figure')!;

/** The module path QrCode draws for `text`: equal paths mean the same coded text (the encoder is deterministic). */
function modulesOf(text: string): string {
  const { container, unmount } = render(<QrCode matrix={qrMatrix(text)!} label="probe" secret={false} />);
  const d = container.querySelector('svg > path')!.getAttribute('d')!;
  unmount();
  return d;
}
const drawnModules = (img: Element) => img.querySelector(':scope > path')!.getAttribute('d');

describe('the code with the key is the Bot\'s address with #key=', () => {
  it('keyedLink: the address, one slash, #key= and the key; none without an address', () => {
    expect(keyedLink(ORIGIN, SECRET)).toBe(`${ORIGIN}/#key=${SECRET}`);
    expect(keyedLink(`${ORIGIN}/`, SECRET)).toBe(`${ORIGIN}/#key=${SECRET}`);
    expect(keyedLink(undefined, SECRET)).toBeNull();
    expect(keyedLink('', SECRET)).toBeNull();
  });

  it('a key of the real shape reaches the page as is: unencoded, read back whole, and accepted by its key rule', () => {
    // page.js:6 KEY_RE, copied: the public page accepts only this shape.
    const KEY_RE = /^hbk_[A-Za-z0-9]{43}$/;
    const real = `hbk_${'aB3'.repeat(14)}x`;
    expect(KEY_RE.test(real)).toBe(true);
    const link = keyedLink(`${ORIGIN}/`, real)!;
    expect(link).toBe(`${ORIGIN}/#key=${real}`);
    const v = new URL(link).hash.replace(/^#/, '').split('&')[0]!.slice(4);
    expect(KEY_RE.test(decodeURIComponent(v.replace(/\+/g, ' ')))).toBe(true);
  });

  it('keyedLink: every trailing slash goes, and a key with reserved characters comes back whole through the page\'s own reading', () => {
    const odd = 'a b+c/=&#%';
    const link = keyedLink(`${ORIGIN}///`, odd)!;
    expect(link.startsWith(`${ORIGIN}/#key=`)).toBe(true);
    // page.js readKeyFromLocation: split the fragment on '&', take key=..., then decodeURIComponent(v.replace(/\+/g, ' ')).
    const frag = new URL(link).hash.replace(/^#/, '');
    const parts = frag.split('&');
    expect(parts).toHaveLength(1);
    expect(decodeURIComponent(parts[0]!.slice(4).replace(/\+/g, ' '))).toBe(odd);
  });

  for (const url of [ORIGIN, `${ORIGIN}/`])
    it(`the shown code codes exactly url + '/#key=' + key (${url.endsWith('/') ? 'address with a slash' : 'bare origin'})`, async () => {
      render(<KeyShare secret={SECRET} url={url} />);
      expect(keyed()).toBeNull();
      await press();
      const d = drawnModules(keyed()!);
      expect(d).toBe(modulesOf(`${ORIGIN}/#key=${SECRET}`));
      // Controls: neither the address alone, nor the key alone, nor the address without its slash.
      expect(d).not.toBe(modulesOf(ORIGIN));
      expect(d).not.toBe(modulesOf(`${ORIGIN}#key=${SECRET}`));
    });

  it('the address-only code is there at once, codes the address alone, and carries no badge or key caption', () => {
    render(<KeyShare secret={SECRET} url={ORIGIN} />);
    const img = plain()!;
    expect(drawnModules(img)).toBe(modulesOf(ORIGIN));
    expect(img).not.toHaveAttribute('aria-describedby');
    const fig = figureOf(strings['keyShare.qrPlain']);
    expect(badge(fig)).toBeNull();
    expect(fig.contains(screen.getByRole('img', { name: strings['keyShare.qrHiddenLabel'] }))).toBe(false);
  });

  it('the two codes sit side by side, each under its own words; the keyed one wears the key badge, hidden or shown', async () => {
    render(<KeyShare secret={SECRET} url={ORIGIN} />);
    const plainFig = figureOf(strings['keyShare.qrPlain']);
    const keyedFig = figureOf(strings['keyShare.qrKeyed']);
    expect(plainFig.parentElement).toBe(keyedFig.parentElement);
    expect(within(keyedFig).getByRole('img', { name: strings['keyShare.qrHiddenLabel'] })).toBeInTheDocument();
    expect(badge(keyedFig)).not.toBeNull();
    await press();
    expect(within(keyedFig).getByRole('img', { name: strings['keyShare.qrLabel'] })).toBeInTheDocument();
    expect(badge(keyedFig)).not.toBeNull();
    expect(badge(plainFig)).toBeNull();
  });

  it('no address: no code at all, no Show, and a note to copy the key instead', () => {
    const { container } = render(<KeyShare secret={SECRET} />);
    expect(container.querySelector('svg[role="img"]')).toBeNull();
    expect(screen.queryByRole('button', { name: strings['keyShare.qrShow'] })).toBeNull();
    expect(screen.getByText(strings['keyShare.qrNoUrl'])).toBeInTheDocument();
    expect(container.innerHTML).not.toContain(SECRET);
  });

  it('the words: the keyed code is named as the address with its key', () => {
    expect(strings['keyShare.qrLabel']).toBe("QR code: the Bot's address with its key");
  });
});
