// Which addresses a Home web widget takes, and which of them the Hub page may frame.
//
// Contract, in plain words:
//   - checkUrl takes an absolute http or https address with its `//` and a host (the kit webAddress rule), trimmed and
//     kept exactly as typed, at most URL_MAX characters. It refuses control characters and spaces, a user name or
//     password in the address (it would sit on screen and in storage), direction controls (BIDI), and the Hub's own origin (a same-origin page
//     with scripts in the frame could reach the Hub).
//   - frameable is the frame policy, in this one place: the Hub page's CSP is `frame-src https://*.<proxy domain>`
//     (the CSP lists both host families, `computers` and `containers`), so only
//     https addresses on a host under the proxy domain or its family twin, on the default port, can show in a frame.
//     Every other address shows "can't be shown here" with Open in a new tab;
//     no frame is made for it.
import { hostUnderFamily } from '@core';

export const URL_MAX = 2048;
/** Direction controls (marks, embeddings, overrides, isolates): they reorder how text shows, so no address or name keeps one. */
export const BIDI = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/;

export type UrlRefusal = 'empty' | 'scheme' | 'bad' | 'long' | 'credentials' | 'hub';

export function checkUrl(raw: string, hubOrigin: string): { url: string } | { refused: UrlRefusal } {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return { refused: 'empty' };
  // The scheme's `//` is required: `https:example.org` parses, but a frame would resolve it on the Hub's host.
  if (!/^https?:\/\//i.test(s)) return { refused: 'scheme' };
  if (s.length > URL_MAX) return { refused: 'long' };
  if (/[\u0000-\u001f\u007f-\u009f\s]/.test(s) || BIDI.test(s)) return { refused: 'bad' };
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { refused: 'bad' };
  }
  if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !u.hostname) return { refused: 'bad' };
  if (u.username || u.password) return { refused: 'credentials' };
  let hub = '';
  try {
    hub = new URL(hubOrigin).origin;
  } catch {
    hub = '';
  }
  if (hub && u.origin === hub) return { refused: 'hub' };
  return { url: s };
}

export function frameable(url: string, proxyDomain: string): boolean {
  const pd = proxyDomain.toLowerCase();
  if (!pd) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  // Under the proxy domain or its family twin (`computers.x` and `containers.x`): exact suffix, subdomains only.
  return u.protocol === 'https:' && !u.port && !u.hostname.endsWith('.') && hostUnderFamily(u.hostname, pd, true);
}
