// Where billing sends the person on other pages. A page this load hides has no link (no classic Hub to fall back to
// any more) and its control is left out, so a destination is asked of the shell, never written as a
// path here.
import { followPageLink, useGo, usePageLink } from '@kit';
import { links as computersLinks } from '../computers/links';
import { links } from './links';

export type Place = 'market' | 'computers';

const HUB_PATH: Record<Place, string> = {
  // The Bare metal view of this page, never the old /market route: leaving /billing would drop the suspension the page
  // holds until its reads answer again.
  market: links.servers(),
  computers: computersLinks.servers,
};

/** `open` goes to the page inside the Hub; null when this load does not serve it (nowhere to send the person). */
export function usePlace(id: Place): { open: () => void; href: string } | null {
  const link = usePageLink(id);
  const go = useGo();
  if (!link) return null;
  const href = link.kind === 'hub' ? HUB_PATH[id] : link.href;
  return { href, open: () => followPageLink({ kind: link.kind, href }, go) };
}
