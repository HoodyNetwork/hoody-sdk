// ExtLink and autolink: a web address is a link with its full scheme; one that grants access is masked and
// opens through a button, never an <a href>; text with a URL in it gets the same links.
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CopyField, Facts } from '../index';
import { maskId } from '../data/Ids';
import { ExtLink, autolink, resetExtLinkNotes, secretShape, webAddress } from './Link';

const P = '6a0000000000000000000001';
const C = 'c0ffee0000000000000000aa';
const SECRET = `https://${P}-${C}-http-8080.n12.example.test/path`;
// A secret address shows its scheme and bullets: nothing of the address.
const SECRET_SHOWN = 'https://••••';
/** Nothing of SECRET may be on screen: not an id, not the host, not the path. */
const NO_SECRET_PARTS = [P, C, 'n12.example.test', 'http-8080', '6a00…'];
const expectNothingOf = (parts: string[] = NO_SECRET_PARTS) => {
  for (const part of parts) expect(document.body.innerHTML).not.toContain(part);
};
const PLAIN = 'https://docs.example.test/start?x=1';

// The once-per-kind dev notes are module state: every test starts with none said, whatever ran before it.
beforeEach(() => resetExtLinkNotes());
afterEach(() => vi.restoreAllMocks());

/** The dev diagnostics print once per kind and never carry an address. */
const errors = () => vi.spyOn(console, 'error').mockImplementation(() => {});

describe('ExtLink: a plain web address', () => {
  it('is a real <a> with the full scheme, opening a new tab without opener', () => {
    render(<ExtLink url={PLAIN} />);
    const a = screen.getByRole('link');
    expect(a.getAttribute('href')).toBe(PLAIN);
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a.textContent).toBe(PLAIN);
    expect(a.getAttribute('aria-label')).toBe(`${PLAIN} (opens in a new tab)`);
  });

  it('shows the given words instead of the URL, and `name` is the spoken name', () => {
    render(<ExtLink url={PLAIN} name="Open the docs">Docs</ExtLink>);
    const a = screen.getByRole('link');
    expect(a.textContent).toBe('Docs');
    expect(a.getAttribute('aria-label')).toBe('Docs: Open the docs (opens in a new tab)');
  });

  it('keeps the URL left to right whatever the page direction', () => {
    render(<ExtLink url={PLAIN} />);
    expect(document.querySelector('bdi')?.getAttribute('dir')).toBe('ltr');
  });

  it('is plain text for anything that is not an http(s) address, and a dash for nothing', () => {
    const { unmount } = render(<ExtLink url="javascript:alert(1)" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('javascript:alert(1)').getAttribute('title')).toBe('Not a web address');
    unmount();
    const b = render(<ExtLink url="ssh://root@host.example.test:22" />);
    expect(b.container.querySelector('a, button')).toBeNull();
    b.unmount();
    const c = render(<ExtLink url="" />);
    expect(c.container.textContent).toBe('—');
  });
});

describe('ExtLink: an address that grants access', () => {
  it('shows its scheme and bullets only, and puts nothing of the address and no href in the page', () => {
    render(<ExtLink url={SECRET} />);
    expect(screen.getByRole('button').textContent).toBe(SECRET_SHOWN);
    expectNothingOf();
    expect(document.querySelector('a')).toBeNull();
    expect(document.querySelector('[href]')).toBeNull();
  });

  it('opens the whole address in a new tab without opener, from a button the keyboard reaches', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<ExtLink url={SECRET} />);
    const b = screen.getByRole('button');
    expect(b.getAttribute('tabindex')).toBeNull();
    await act(async () => {
      fireEvent.click(b);
    });
    expect(open).toHaveBeenCalledWith(SECRET, '_blank', 'noopener');
  });

  it('opens nothing when the click ends a drag that selected part of it', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<ExtLink url={SECRET} />);
    const b = screen.getByRole('button');
    const range = document.createRange();
    range.selectNodeContents(b);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    await act(async () => {
      fireEvent.click(b, { detail: 1 });
    });
    expect(open).not.toHaveBeenCalled();
    window.getSelection()?.removeAllRanges();
  });

  it('opens the address on a keyboard activation even while text in it is selected', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<ExtLink url={SECRET} />);
    const b = screen.getByRole('button');
    const range = document.createRange();
    range.selectNodeContents(b);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    await act(async () => {
      fireEvent.click(b, { detail: 0 });
    });
    expect(open).toHaveBeenCalledWith(SECRET, '_blank', 'noopener');
    window.getSelection()?.removeAllRanges();
  });

  it('Enter and Space on the focused button open the address even while text in it is selected', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const user = userEvent.setup();
    render(<ExtLink url={SECRET} />);
    await user.tab();
    const b = screen.getByRole('button');
    expect(document.activeElement).toBe(b);
    const range = document.createRange();
    range.selectNodeContents(b);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(open.mock.calls).toEqual([
      [SECRET, '_blank', 'noopener'],
      [SECRET, '_blank', 'noopener'],
    ]);
    window.getSelection()?.removeAllRanges();
  });

  it('is secret by shape: `secret={false}` cannot unmask it (and a dev warning says so)', () => {
    const warn = errors();
    render(<ExtLink url={SECRET} secret={false} />);
    expect(screen.getByRole('button').textContent).toBe(SECRET_SHOWN);
    expectNothingOf();
    expect(document.querySelector('a')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    for (const part of NO_SECRET_PARTS) expect(String(warn.mock.calls[0]?.[0])).not.toContain(part);
  });

  it('`secret` makes any address a button with the same fixed text, whatever it holds (a token in a query, say)', () => {
    render(<ExtLink url="https://docs.example.test/start?token=abc" secret />);
    expect(screen.getByRole('button').textContent).toBe(SECRET_SHOWN);
    expect(document.body.innerHTML).not.toContain('token');
    expect(document.body.innerHTML).not.toContain('docs.example.test');
    expect(document.querySelector('a')).toBeNull();
  });

  it('judges the host only: a 24-hex run in the path or a shorter run in the host is not secret', () => {
    expect(secretShape(SECRET)).toBe(true);
    expect(secretShape(`https://docs.example.test/${P}`)).toBe(false);
    expect(secretShape('https://6a000000000000000000001.example.test')).toBe(false);
    expect(secretShape('ssh://6a0000000000000000000001.example.test')).toBe(false);
  });

  it('names a secret link by its fixed text, never by the address, with no title or tooltip', () => {
    render(<ExtLink url={SECRET} truncate />);
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe(`${SECRET_SHOWN} (opens in a new tab)`);
    expect(document.querySelector('[title]')).toBeNull();
    expectNothingOf();
  });

  it('a truncated secret address gets no tooltip on focus or hover; a truncated plain one shows its address', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ExtLink url={SECRET} truncate />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button'));
    await new Promise((r) => setTimeout(r, 700));
    expect(screen.queryByRole('tooltip')).toBeNull();
    await user.hover(screen.getByRole('button'));
    await new Promise((r) => setTimeout(r, 700));
    expect(screen.queryByRole('tooltip')).toBeNull();
    expectNothingOf();
    unmount();
    render(<ExtLink url={PLAIN} truncate />);
    await user.tab();
    expect((await screen.findByRole('tooltip')).textContent).toBe(PLAIN);
  });

  it('plain words for a secret link are kept; words or a name that repeat 8 characters of the address are refused', () => {
    const err = errors();
    const { unmount } = render(<ExtLink url={SECRET} name="port 8080">Program rules</ExtLink>);
    expect(screen.getByRole('button').textContent).toBe('Program rules');
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Program rules: port 8080 (opens in a new tab)');
    expect(err).not.toHaveBeenCalled();
    unmount();
    for (const leak of [SECRET, 'n12.example.test', `go to ${P.slice(0, 8)}`, 'HTTP-8080.N12', 'https://']) {
      const r = render(<ExtLink url={SECRET}>{leak}</ExtLink>);
      expect(screen.getByRole('button').textContent).toBe(SECRET_SHOWN);
      r.unmount();
    }
    render(<ExtLink url={SECRET} name={`open ${C.slice(0, 8)}`} />);
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe(`${SECRET_SHOWN} (opens in a new tab)`);
    expect(err).toHaveBeenCalled();
    for (const call of err.mock.calls) for (const part of NO_SECRET_PARTS) expect(String(call[0])).not.toContain(part);
  });
});

describe('ExtLink: secret shapes the plain host test misses', () => {
  const NESTED = `https://public.example.test/go?next=${SECRET}`;
  const ENC_HOST = `${P.slice(0, 10)}%30${P.slice(11)}`;
  const NESTED_ENC = `https://public.example.test/go?next=${encodeURIComponent(`https://${ENC_HOST}.example.test/x`)}`;

  it('an address inside the address is the same secret: judged, bullets, never an href', () => {
    expect(secretShape(NESTED)).toBe(true);
    render(<ExtLink url={NESTED} />);
    expect(screen.getByRole('button').textContent).toBe(SECRET_SHOWN);
    expectNothingOf([...NO_SECRET_PARTS, 'public.example.test', 'next=']);
    expect(document.querySelector('[href]')).toBeNull();
  });

  it('a run with an address inside it, plain or percent-encoded, is never an anchor and never shown (autolink too)', () => {
    for (const url of [NESTED, NESTED_ENC]) {
      const { unmount } = render(<ExtLink url={url} />);
      expect(screen.getByRole('button').textContent).toBe(SECRET_SHOWN);
      expect(document.querySelector('[href]')).toBeNull();
      expectNothingOf([...NO_SECRET_PARTS, ENC_HOST, 'public.example.test']);
      unmount();
    }
    expect(secretShape(NESTED_ENC)).toBe(true);
    // autolink keeps a URL with a query as plain text: it makes no anchor for it.
    render(<p>{autolink(`see ${NESTED_ENC}`)}</p>);
    expect(document.querySelector('a')).toBeNull();
    // ... and one with the inner address in the path, no query, makes the whole text the mask (it holds an id).
    const inPath = `https://public.example.test/https://${ENC_HOST}.example.test/x`;
    expect(secretShape(inPath)).toBe(true);
    expect(autolink(`see ${inPath}`)).toBe('••••');
    render(<ExtLink url={inPath} />);
    expect(document.querySelector('a')).toBeNull();
    expect(document.querySelectorAll('button')).toHaveLength(1);
    expectNothingOf([...NO_SECRET_PARTS, ENC_HOST, 'public.example.test']);
  });

  it('a malformed escape elsewhere in the address does not hide an encoded address inside it', () => {
    const url = `https://public.example.test/?next=${encodeURIComponent(SECRET)}&x=%`;
    expect(webAddress(url)).toBe(url);
    expect(secretShape(url)).toBe(true);
    render(<ExtLink url={url} />);
    expect(screen.getByRole('button').textContent).toBe(SECRET_SHOWN);
    expect(document.querySelector('[href]')).toBeNull();
    expectNothingOf([...NO_SECRET_PARTS, 'public.example.test']);
    render(<p>{autolink(`see ${url}`)}</p>);
    expect(document.querySelector('a')).toBeNull();
  });

  it('a percent-encoded character inside the host id, with another id elsewhere in the address, still shows bullets only', () => {
    // %30 is "0": the written host has no 24-hex run, the parsed host does; a literal id sits in the path.
    const url = `https://${ENC_HOST}.example.test/${C}`;
    expect(secretShape(url)).toBe(true);
    render(<ExtLink url={url} truncate />);
    expect(screen.getByRole('button').textContent).toBe(SECRET_SHOWN);
    expectNothingOf([...NO_SECRET_PARTS, ENC_HOST, '%30', C]);
  });

  it('a host the parser normalises into an id (full-width digits) is judged by the parsed hostname', () => {
    const wide = `https://\uFF16${P.slice(1)}.example.test/x`;
    expect(secretShape(wide)).toBe(true);
    render(<ExtLink url={wide} />);
    expect(screen.getByRole('button').textContent).toBe(SECRET_SHOWN);
    expectNothingOf([...NO_SECRET_PARTS, '\uFF16', 'example.test']);
  });

  it('input that is not a web address and is secret shows bullets, not itself', () => {
    for (const url of [`ssh://root@${P}.example.test:22`, 'ssh://root@host.example.test:22', 'not a url at all']) {
      const { unmount, container } = render(<ExtLink url={url} secret />);
      expect(container.textContent).toBe('••••');
      expect(container.querySelector('a, button')).toBeNull();
      unmount();
    }
    // Not asked to be secret but holding an id: still never verbatim.
    const { container } = render(<ExtLink url={`ssh://root@${P}.example.test:22`} />);
    expect(container.textContent).toBe('••••');
  });
});

// The URL parser reads a backslash as a path separator and skips separators before the host, so the written authority
// and the parsed host can differ. An id in either one makes the address secret:
// failing safe beats showing an id. The written authority is judged whole, so an id the parser reads as path or userinfo
// counts too.
describe('ExtLink: an id in the written authority or the parsed host, around backslashes and empty userinfo', () => {
  it.each([
    ['an id written after a backslash (the parser reads it as path)', `https://docs.example.test\\@${P}.example.test/a`],
    ['an id written after a backslash with no @', `https://docs.example.test\\${P}.example.test/a`],
    ['an id before a backslash (the parsed host)', `https://${P}.example.test\\@docs.example.test/a`],
    ['a backslash before the host', `https://\\\\${P}.example.test/a`],
    ['a backslash before an empty userinfo', `https://\\\\@${P}.example.test/a`],
    ['an empty userinfo before the host', `https://@${P}.example.test/a`],
    ['an empty user and password before the host', `https://:@${P}.example.test/a`],
    ['an id as the userinfo of a plain host', `https://${P}@docs.example.test/a`],
  ])('%s is secret: bullets, no href, never shown (ExtLink, autolink, CopyField plain)', (_case, url) => {
    expect(webAddress(url)).toBe(url);
    expect(secretShape(url)).toBe(true);
    const ext = render(<ExtLink url={url} />);
    expect(screen.getByRole('button').textContent).toBe(SECRET_SHOWN);
    expect(document.querySelector('[href]')).toBeNull();
    expectNothingOf([P]);
    ext.unmount();
    const text = render(<p>{autolink(`see ${url} now`)}</p>);
    expect(document.querySelector('a')).toBeNull();
    expectNothingOf([P]);
    text.unmount();
    render(<CopyField value={url} plain />);
    expect(document.querySelector('[href]')).toBeNull();
    expectNothingOf([P]);
  });

  // A full-width first digit: no 24-hex run is written (nor decoded), only the parser's host holds the id, so these cases
  // need the parsed-host judgement on their own.
  const WIDE = `\uFF16${P.slice(1)}`;
  it.each([
    ['backslashes before the host', `https://\\\\${WIDE}.example.test/a`],
    ['an empty userinfo before the host', `https://@${WIDE}.example.test/a`],
    ['a backslash after the host, an @ in the path', `https://${WIDE}.example.test\\@docs.example.test/a`],
  ])('only the parsed host holds the id (%s): still secret, bullets, never shown', (_case, url) => {
    expect(new URL(url).hostname).toBe(`${P}.example.test`);
    expect(secretShape(url)).toBe(true);
    const ext = render(<ExtLink url={url} />);
    expect(screen.getByRole('button').textContent).toBe(SECRET_SHOWN);
    expect(document.querySelector('[href]')).toBeNull();
    expectNothingOf([P, P.slice(1)]);
    ext.unmount();
    const text = render(<p>{autolink(`see ${url} now`)}</p>);
    expect(document.querySelector('a')).toBeNull();
    expectNothingOf([P, P.slice(1)]);
    text.unmount();
    render(<CopyField value={url} plain />);
    expect(document.querySelector('[href]')).toBeNull();
    expectNothingOf([P, P.slice(1)]);
  });
});

describe('autolink: long input', () => {
  it('trims a run of closing brackets in linear time', () => {
    const url = `https://a.example.test/${')'.repeat(60000)}`;
    const t0 = Date.now();
    render(<p>{autolink(`go ${url}`)}</p>);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(screen.getByRole('link').getAttribute('href')).toBe('https://a.example.test/');
  });
});

describe('webAddress', () => {
  it('accepts an absolute http(s) URL exactly as given and nothing else', () => {
    expect(webAddress(PLAIN)).toBe(PLAIN);
    expect(webAddress('HTTP://shop.example.test')).toBe('HTTP://shop.example.test');
    for (const bad of ['', ' https://a.test', 'https://a.test ', '//a.test', 'javascript:alert(1)', 'data:text/html,x', 'https://', 'https://a b.test']) {
      expect(webAddress(bad)).toBe('');
    }
  });
});

describe('autolink', () => {
  it('returns text with no URL as the same string', () => {
    const text = 'Nothing to open here, not even example.test.';
    expect(autolink(text)).toBe(text);
  });

  it('turns every http(s) URL into a link and keeps the words around them', () => {
    render(<p>{autolink('See https://docs.example.test/start and https://other.example.test/a for details')}</p>);
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['https://docs.example.test/start', 'https://other.example.test/a']);
    expect(document.querySelector('p')?.textContent).toBe('See https://docs.example.test/start and https://other.example.test/a for details');
  });

  it.each([
    ['userinfo with a password', 'https://user:pw@docs.example.test/a'],
    ['userinfo with a user', 'https://u@docs.example.test/a'],
    ['empty userinfo', 'https://@docs.example.test/a'],
    ['an empty user and password', 'https://:@docs.example.test/a'],
    ['a query', PLAIN],
    ['a fragment', 'https://docs.example.test/a#top'],
  ])('makes no anchor for an address with %s: the text stays plain', (_case, url) => {
    const text = `open ${url} now`;
    expect(autolink(text)).toBe(text);
  });

  it.each([
    ['a backslash then a path holding an @', 'https://docs.example.test\\a@b'],
    ['extra slashes before an empty userinfo', 'https:////@docs.example.test/a'],
    ['a backslash before an empty userinfo', 'https://\\\\@docs.example.test/a'],
  ])('stays plain text for %s (the URL parser reads these differently from the written text)', (_case, url) => {
    const text = `see ${url} now`;
    expect(autolink(text)).toBe(text);
  });

  it('an @ in the path is not userinfo: the address is still linked', () => {
    render(<p>{autolink('see https://docs.example.test/a@b now')}</p>);
    expect(document.querySelectorAll('a')).toHaveLength(1);
  });

  it('leaves the punctuation that closes the sentence outside the link', () => {
    render(<p>{autolink('(see https://a.example.test/x), then https://b.example.test/y. Or https://c.example.test/z!')}</p>);
    expect(screen.getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['https://a.example.test/x', 'https://b.example.test/y', 'https://c.example.test/z']);
  });

  it('keeps a closing bracket the URL opened', () => {
    render(<p>{autolink('read https://en.example.test/wiki/Thing_(a) now')}</p>);
    expect(screen.getByRole('link').getAttribute('href')).toBe('https://en.example.test/wiki/Thing_(a)');
  });

  it('a text holding a secret-by-shape URL is the mask, whole, whatever `secret` says', () => {
    errors();
    render(<p>{autolink(`Your address is ${SECRET}.`, { secret: false })}</p>);
    expect(document.querySelector('a, button')).toBeNull();
    expectNothingOf();
    expect(document.querySelector('p')?.textContent).toBe('••••');
  });

  it('`secret` in text with no id: each address shows bullets and opens through a button', () => {
    render(<p>{autolink('Your address is https://docs.example.test/start.', { secret: true })}</p>);
    expect(document.querySelector('a')).toBeNull();
    expect(screen.getByRole('button').textContent).toBe(SECRET_SHOWN);
    expect(document.querySelector('p')?.textContent).toBe(`Your address is ${SECRET_SHOWN}.`);
  });
});

describe('Facts and CopyField', () => {
  it('a fact with `url` is a link; `secretUrl` masks it; a plain value is unchanged', () => {
    render(
      <Facts
        items={[
          { label: 'Docs', url: PLAIN },
          { label: 'Address', url: SECRET, secretUrl: true },
          { label: 'Name', value: 'Shop' },
        ]}
      />,
    );
    expect(screen.getByRole('link').getAttribute('href')).toBe(PLAIN);
    expect(screen.getByRole('button', { name: /^https:\/\/••••/ }).textContent).toBe(SECRET_SHOWN);
    expect(screen.getByText('Shop').tagName).not.toBe('A');
    expectNothingOf();
  });

  it('a string value with a URL in it gets the link; a URL in a secret-shaped value is masked', () => {
    render(<Facts items={[{ label: 'Read from', value: 'from https://docs.example.test/start today' }, { label: 'Where', value: SECRET }]} />);
    expect(screen.getByRole('link').getAttribute('href')).toBe('https://docs.example.test/start');
    expectNothingOf();
  });

  it('a field whose value is a web address shows a link and still copies the whole address', async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (s: string) => (written.push(s), Promise.resolve()) } });
    render(<CopyField label="Signup link" value={SECRET} />);
    expect(screen.getByRole('button', { name: /^https:\/\/••••/ }).textContent).toBe(SECRET_SHOWN);
    expectNothingOf();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });
    expect(written).toEqual([SECRET]);
  });

  it('a masked field keeps its old text byte for byte, whatever the value (an address included): no link, no button', () => {
    for (const value of ['https://docs.example.test/start?token=abc', SECRET, `${SECRET}?token=abc`, 'ABC-123-DEF-456']) {
      const { unmount, container } = render(<CopyField label="Signup link" value={value} masked />);
      expect(container.textContent).toContain(maskId(value));
      expect(container.querySelector('a, button[aria-label*="opens"]')).toBeNull();
      unmount();
    }
  });

  it('a field whose value is not a web address is unchanged', () => {
    render(<CopyField label="Code" value="ABC-123" />);
    expect(screen.getByText('ABC-123').tagName).toBe('SPAN');
  });

  it('`plain` shows a web address as text with no link, and still copies it; without it the same address links', async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (s: string) => (written.push(s), Promise.resolve()) } });
    const { unmount, container } = render(<CopyField label="API" value={PLAIN} plain />);
    expect(screen.getByText(PLAIN).tagName).toBe('SPAN');
    expect(container.querySelector('a, button[aria-label*="opens"]')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });
    expect(written).toEqual([PLAIN]);
    unmount();
    render(<CopyField label="API" value={PLAIN} />);
    expect(screen.getByRole('link').getAttribute('href')).toBe(PLAIN);
  });

  it('`copyName` names each Copy button and still copies its own value; without it the button is named Copy', async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (s: string) => (written.push(s), Promise.resolve()) } });
    render(
      <>
        <CopyField label="Code" value="ABC-123" copyName="Copy the code" />
        <CopyField label="Link" value={PLAIN} copyName="Copy the sign-up link" />
        <CopyField label="Name" value="Shop" />
      </>,
    );
    expect(screen.getAllByRole('button', { name: 'Copy' })).toHaveLength(1);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy the sign-up link' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy the code' }));
    });
    expect(written).toEqual([PLAIN, 'ABC-123']);
  });

  it('`plain` never shows a secret address: it keeps the masked button', () => {
    render(<CopyField label="Signup link" value={SECRET} plain />);
    expect(screen.getByRole('button', { name: /^https:\/\/••••/ }).textContent).toBe(SECRET_SHOWN);
    expectNothingOf();
  });
});
