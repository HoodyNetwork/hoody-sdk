// Vitest: desktopFrameAllow grants the desktop frame's features only to plain https host origins.
// Refused: IPv4 in every spelling the URL parser turns into one, IPv6 literals, wildcards (literal
// and %2A), ';' and ',' in the host, and user info (an empty one too: the parser drops it, so the text is read). Kept:
// the Hub-built desktop and display addresses, a proxy domain's terminal dot and an explicit port.
import { describe, expect, it } from 'vitest';
import { DESKTOP_FRAME_FEATURES, desktopFrameAllow } from './desktop';
import { computers } from './fixtures';
import { desktopUrl, desktopViewerUrl } from './urls';

const atlas = computers.find((c) => c.name === 'atlas');
if (!atlas) throw new Error('fixture computer atlas');

const grants = (origin: string) => DESKTOP_FRAME_FEATURES.map((f) => `${f} ${origin}`).join('; ');
// The same Hub-built address with its host written another way: a terminal dot, an explicit port.
const withHost = (u: string, edit: (host: string) => string) => {
  const x = new URL(u);
  return `https://${edit(x.host)}${x.pathname}${x.search}`;
};

describe('computers: the desktop frame grants its features only to plain https host origins', () => {
  const desk = desktopUrl(atlas, 2);
  const disp = desktopViewerUrl(atlas, 2);
  const kept: Array<[string, string, string]> = [
    ['the Hub-built desktop address', desk, new URL(desk).origin],
    ['the Hub-built display address', disp, new URL(disp).origin],
    ['a proxy domain written with its terminal dot', withHost(desk, (h) => `${h}.`), `${new URL(desk).origin}.`],
    ['an explicit port', withHost(disp, (h) => `${h}:8443`), `${new URL(disp).origin}:8443`],
    ['a terminal dot and a port together', withHost(desk, (h) => `${h}.:8443`), `${new URL(desk).origin}.:8443`],
  ];
  it.each(kept)('keeps %s', (_what, url, origin) => {
    expect(desktopFrameAllow([url])).toBe(grants(origin));
  });

  const refused: Array<[string, string]> = [
    ['dotted IPv4', 'https://127.0.0.1/'],
    ['dotted IPv4 with a port', 'https://10.0.0.5:8443/'],
    ['short IPv4 (127.1)', 'https://127.1/'],
    ['hex IPv4', 'https://0x7f000001/'],
    ['dotted hex IPv4', 'https://0x7f.0.0.1/'],
    ['octal IPv4', 'https://0177.0.0.1/'],
    ['integer IPv4', 'https://2130706433/'],
    ['IPv4 with a terminal dot', 'https://127.0.0.1./'],
    ['IPv6 literal', 'https://[::1]/'],
    ['IPv6 literal with a port', 'https://[2001:db8::1]:8443/'],
    ['IPv4-mapped IPv6 literal', 'https://[::ffff:127.0.0.1]/'],
    ['literal wildcard', 'https://*.example.com/'],
    ['percent-encoded wildcard', 'https://%2A.example.com/'],
    ['lower-case percent-encoded wildcard', 'https://%2a.example.com/'],
    ['a semicolon in the host', 'https://a;b.example.com/'],
    ['a comma in the host', 'https://a,b.example.com/'],
    ['user info', 'https://user@desk.example.com/'],
    ['user info with a password', 'https://user:pw@desk.example.com/'],
    ['a password alone', 'https://:pw@desk.example.com/'],
    ['an empty user info', 'https://@desk.example.com/'],
    ['an empty user info with its colon', 'https://:@desk.example.com/'],
    ['an empty user info behind a tab', 'https://\t@desk.example.com/'],
    ['an empty user info with backslashes', 'https:\\\\@desk.example.com/'],
    ['plain http', 'http://desk.example.com/'],
    ['not a URL', 'not a url'],
  ];
  it.each(refused)('refuses %s', (_what, url) => {
    expect(desktopFrameAllow([url])).toBe('');
  });

  it('a refused origin beside a kept one leaves only the kept one granted', () => {
    expect(desktopFrameAllow(['https://*.example.com/', desk, 'https://127.1/'])).toBe(grants(new URL(desk).origin));
  });
});
