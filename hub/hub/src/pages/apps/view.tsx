// The old Apps route: the launcher moved into the Apps tab of Programs. An old link lands
// there with what it pointed at: the selected app (sel), the list's search (q) and Find with its words (tab=find).
// Programs not served by this load: no link, the note stays.
import { EmptyState, useGo, usePageLink, useSearchParam, useStrings } from '@kit';
import { useEffect, useRef } from 'react';
import { links } from './links';
import strings from './strings.en.json';

/** Where an old /apps address goes now. */
export function redirectFor(p: { tab?: unknown; sel?: unknown; q?: unknown }): string {
  const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));
  const q = str(p.q);
  if (str(p.tab) === 'find') return links.find(q);
  const sel = str(p.sel);
  if (sel) return links.app(sel) + (q ? `&appq=${encodeURIComponent(q)}` : '');
  return links.list + (q ? `&appq=${encodeURIComponent(q)}` : '');
}

export default function AppsRedirect() {
  const t = useStrings(strings);
  const go = useGo();
  const [tab] = useSearchParam('tab');
  const [sel] = useSearchParam('sel');
  const [q] = useSearchParam('q');
  const to = redirectFor({ tab, sel, q });
  const link = usePageLink('programs');
  const kind = link?.kind;
  // Once only: the router may render this route again after the move, with the new address (tab=apps, no sel),
  // and a second move from that render would drop what the old link pointed at.
  const moved = useRef(false);
  useEffect(() => {
    if (moved.current) return;
    if (kind === 'hub') { moved.current = true; go(to, { replace: true }); }
  }, [go, to, kind]);
  return <EmptyState icon="apps" title={t('moved')} size="sm" />;
}
