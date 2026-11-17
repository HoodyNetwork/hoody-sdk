// Where a Home action goes: the place inside a page this load serves (a creation drawer, one computer), or nowhere
// when this load hides the page. (asPage is for a classic link, which no load gives.)
import { usePageLink } from '@kit';
import { tileTarget } from '../logic';

export function usePageTarget(page: string, hubPath: string): { href: string; asPage: boolean } | null {
  return tileTarget(usePageLink(page), hubPath);
}
