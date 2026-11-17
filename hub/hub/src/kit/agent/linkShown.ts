// When a terminal link shows its host after its words, as "(host)". The words are a hyperlink (OSC 8) to the checked
// address; the host is added when the reader would otherwise not know where it goes:
//   - the words name another host than the address ("example.com" linking elsewhere): always (a phishing defence);
//   - the terminal is not known to show hyperlinks (a terminal without OSC 8 shows the words only, unlinked);
//   - never when the words are the address itself (a bare link) or already say the host.
// The breaker (lineBreak.pure.ts) keeps "(host)" one unit: it never breaks after "(" or before ")".

// A host-like word: labels with a dot and a 2+ letter last label (example.com, www.ex-ample.co.uk).
const HOSTISH = /(?:^|[^\w.-])((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})(?![\w-])/gi;

const norm = (h: string): string => h.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');

/** Whether the words name a host other than `host` (and other than one of its subdomains or parents). */
export function namesOtherHost(words: string, host: string): boolean {
  const target = norm(host);
  for (const m of words.matchAll(HOSTISH)) {
    const named = norm(m[1]!);
    if (named === target || target.endsWith('.' + named) || named.endsWith('.' + target)) continue;
    return true;
  }
  return false;
}

/** Whether to add " (host)" after a link's words. `osc8`: true when the terminal is known to draw hyperlinks, false or null otherwise. */
export function linkHostShown(words: string, host: string, bare: boolean, osc8: boolean | null): boolean {
  if (bare) return false;
  if (namesOtherHost(words, host)) return true;
  if (norm(words).includes(norm(host))) return false;
  return osc8 !== true;
}

/** Whether this terminal is known to draw OSC 8 hyperlinks. The renderer's `hyperlinks` option (OpenTUI patch 0003) is not
 *  exposed to callers yet, so this is unknown, and links say their host. */
export function hyperlinksOn(): boolean | null {
  return null;
}
