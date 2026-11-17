// display-frame.ts: what an embedded display viewer (a computer's desktop, a VM's screen) is allowed inside the Hub.
// Every page that draws such a frame reads these, so the frames never drift apart.
//
// Contract, in plain words:
//   - DISPLAY_FRAME_FEATURES / DISPLAY_FRAME_SANDBOX: what a remote display needs and nothing more (see each constant).
//   - displayFrameAllow(urls) → the frame's allow attribute: each feature for exactly these origins (the address the frame
//     opens and the display it may redirect to; a bare feature would reach only the frame's src). Addresses are ones the
//     Hub built itself; anything that is not a plain https host origin grants nothing.
//   - DISPLAY_FRAME_SLOW_MS: with no load event in this long, the page says it is taking long and offers a new tab (the
//     Hub cannot read the frame).

/** Clipboard for copying between the display and this device, fullscreen for the viewer's own button, keyboard-map so
 *  the viewer can read the layout. No microphone, camera, autoplay, location, payment or USB. */
export const DISPLAY_FRAME_FEATURES = ['clipboard-read', 'clipboard-write', 'fullscreen', 'keyboard-map'] as const;

/** A host made only of name labels (letters, digits, hyphens; a terminal dot allowed). The URL parser has already
 *  lower-cased it, decoded %2A to '*' and written every IPv4 spelling (hex, octal, short, integer) as dotted
 *  decimal. */
const PLAIN_HOST = /^(?:[a-z0-9-]+\.)*[a-z0-9-]+\.?$/;
/** The address as written, up to its path: any '@' there is user info, empty or not. Read from the text itself, since
 *  the parser drops an empty one ('https://@host', 'https://:@host'); tabs and newlines are removed first and '\\'
 *  counts as '/', as the parser does for https. */
const AUTHORITY = /^[\x00-\x20]*https:[/\\]*([^/\\?#]*)/i;

/** The frame's allow attribute: each feature for exactly these origins. Only a plain https host origin is kept: no user
 *  info (an empty one too), no IP address (an all-digit last label is IPv4, a bracketed host IPv6), no wildcard and no
 *  ';' or ',' that would break the attribute. None left, no feature is granted. */
export function displayFrameAllow(urls: readonly string[]): string {
  const origins = [...new Set(urls.flatMap((u) => {
    try {
      const o = new URL(u);
      const last = o.hostname.replace(/\.$/, '').split('.').pop() ?? '';
      const userInfo = (AUTHORITY.exec(u.replace(/[\t\n\r]/g, ''))?.[1] ?? '').includes('@');
      return o.protocol === 'https:' && !userInfo && PLAIN_HOST.test(o.hostname) && !/^\d+$/.test(last)
        ? [o.origin] : [];
    } catch {
      return [];
    }
  }))];
  return origins.length === 0 ? '' : DISPLAY_FRAME_FEATURES.map((f) => `${f} ${origins.join(' ')}`).join('; ');
}

/** The viewer is a script app on its own origin (its websocket and storage need allow-same-origin, which a different
 *  origin keeps apart from the Hub), sends its settings forms, locks the pointer for apps, and opens links a person
 *  clicks in the display in a new tab (popups, escaping the sandbox so the new tab works). No modals, downloads or top
 *  navigation: the frame can never move the Hub's own page. */
export const DISPLAY_FRAME_SANDBOX = 'allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-pointer-lock';

/** No load event in this long: the page says it is taking long and offers the new tab. */
export const DISPLAY_FRAME_SLOW_MS = 20_000;
