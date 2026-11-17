// Outside links on the Board: a web address the Hub cannot show in a frame opens in a
// running computer's own browser, as a new tab, and the Board shows that browser's display.
//
// Contract, in plain words:
//   - outsideUrl (core) decides what may go: http or https, no user or password, a public name or public IPv4 host.
//     Everything else (data:, localhost, a private or loopback address, a local suffix, IPv6) is never sent; the
//     Board shows the web tile's card instead (New tab, Copy link).
//   - openOutside(computer, url) uses browser-1 (OUTSIDE_BROWSER). It reads it first (browserUp, a read that never starts
//     anything): when it runs, the address is opened; when the kit says none runs, the Board's own create-or-get
//     start is sent once (shown, no options) and the address is opened only after 'started'. The browse never starts a
//     browser itself (start=false) and never names a tab (the kit opens a new one, so a page the person was on is kept).
//   - framedHere(url): whether the Hub's frame policy lets a web tile show the address (https, default port, a host under
//     the computer proxy domain or its family twin, the two the Hub page's CSP frame-src names). A web tile that cannot
//     be framed draws a card instead of a frame the browser would refuse.
//   - Answers: 'opened'; {pending: 'start' | 'open'} when an answer was lost (never sent again: a start is read back
//     with browserUp, an open is not repeated); {failed: 'read' | 'start' | 'open'} with the cause for Details.
import { boardSend, hostUnderFamily, outcomeOf, outsideUrl, BROWSE_TIMEOUT_MS } from '@core';
import { computersDomain, type BoardComputer } from '../computers';
import { boardTarget } from '../termSessions';
import { browserUp, startBrowser } from './browserStart';

/** The browser the Board opens outside links in. */
export const OUTSIDE_BROWSER = 1;

export type OutsideResult =
  | 'opened'
  | { readonly pending: 'start' | 'open' }
  | { readonly failed: 'read' | 'start' | 'open'; readonly cause?: unknown };

export function framedHere(url: string): boolean {
  const pd = computersDomain().toLowerCase();
  if (!pd) return false;
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  // The Hub page's CSP frames https://*.<proxy domain> and its family twin (the API's accepted families:
  // `computers.x` and `containers.x`), subdomains only: so does this, as Home's frameable.
  return u.protocol === 'https:' && !u.port && !u.hostname.endsWith('.') && hostUnderFamily(u.hostname, pd, true);
}

/** The host a web address names, for the card that cannot frame it (empty for an address that does not parse). */
export function hostOf(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}

/** The host an outside address names, for the control that opens it, else null (never sent this way). */
export function outsideHost(raw: string): string | null {
  return outsideUrl(raw)?.host ?? null;
}

async function browse(computer: BoardComputer, url: string): Promise<OutsideResult> {
  try {
    await boardSend({ kit: 'browser', index: OUTSIDE_BROWSER }, 'GET', '/api/v1/browser/browse', {
      target: boardTarget(computer),
      query: { url, start: false, waitUntil: 'commit', timeoutMs: BROWSE_TIMEOUT_MS },
    });
    return 'opened';
  } catch (e) {
    // A sent change never rejects 'stale': core turns it into 'pending' (api.ts), as for startBrowser.
    return outcomeOf(e, true) === 'pending' ? { pending: 'open' } : { failed: 'open', cause: e };
  }
}

export async function openOutside(computer: BoardComputer, raw: string): Promise<OutsideResult> {
  const o = outsideUrl(raw);
  if (!o) return { failed: 'open' };
  const up = await browserUp(computer, OUTSIDE_BROWSER);
  if (up === null) return { failed: 'read' };
  if (up === 'down') {
    const s = await startBrowser(computer, OUTSIDE_BROWSER, { showBrowser: true });
    if (s !== 'started') return 'pending' in s ? { pending: 'start' } : { failed: 'start', cause: s.cause };
  }
  return browse(computer, o.url);
}
