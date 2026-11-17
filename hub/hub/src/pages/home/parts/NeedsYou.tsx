// Needs you: what Home has SEEN needs the person, with one action each. Only positive observations show; the strip
// is absent when there are none, and it never says "nothing needs you" (a partial or stale read can count 0).
// Each line says its scope: the shown realm, or the whole account in this browser. One polite live region speaks
// only when an item, its count or its computer changes.
import { Icon, LinkButton, SR_ONLY, usePageLink, useStrings } from '@kit';
import { useLayoutEffect, useRef } from 'react';
import { links as bots } from '../../bots/links';
import { links as computers } from '../../computers/links';
import strings from '../strings.en.json';
import { needsSignature, survivorAfter, type HeldLine, type NeedItem } from '../logic';
import { visibleHeaderControl } from './focus';
import { usePageTarget } from './usePageTarget';
import s from './home.module.css';

// Each line's action sits at the strip's far right edge and is wider than its word. It stays the kit
// secondary: Home's one primary is the Ask submit; the chip variant gives it the white chip shape.
function Action({ item }: { item: NeedItem }) {
  const t = useStrings(strings);
  const computer = usePageTarget('computers', item.handle ? computers.item(item.handle) : computers.list);
  const bot = usePageTarget('bots', bots.list);
  // A held change's Check: the place on its sender page where it is checked, only while this load serves that page. A
  // change of a known page opens that page where it lives (the path its manifest declares, as the shell links it:
  // Realms is /realms/new), never a path made from its id.
  const held = item.held;
  const heldHref = held?.href ?? null;
  const heldPage = held?.kind === 'page' ? (held.page ?? '') : heldHref ? (heldHref.split(/[/?#]/)[1] ?? '') : '';
  const heldLink = usePageLink(heldPage);
  const check = usePageTarget(heldPage, held?.kind === 'page' ? (heldLink?.href ?? '/') : (heldHref ?? '/'));
  const target = item.held ? (heldHref && check && !check.asPage ? check : null) : item.key === 'computers' ? computer : item.key === 'bots' ? bot : null;
  if (!target) return null;
  // A hidden page gave no target above. (asPage marks a classic link, which no load
  // gives.)
  const isBots = item.key === 'bots';
  return (
    <LinkButton variant="secondary" href={target.href} className={s.needAction}>
      {item.held ? t('needs.held.action') : target.asPage ? (isBots ? t('actions.bot.page') : t('intro.openPage')) : isBots ? t('needs.bots.action') : t('needs.computers.action')}
    </LinkButton>
  );
}

export function NeedsYou({ items, realm }: { items: readonly NeedItem[]; realm: { name: string; all: boolean } }) {
  const t = useStrings(strings);
  // Focus follows a resolved item: when the item holding focus goes away, the next surviving action takes it, then
  // the previous one, then a Home header control. Focus elsewhere is left alone.
  const listRef = useRef<HTMLUListElement>(null);
  const focused = useRef<{ key: string; order: string[] } | null>(null);
  const keys = items.map((i) => i.key).join();
  useLayoutEffect(() => {
    const was = focused.current;
    if (!was || items.some((i) => i.key === was.key)) return;
    focused.current = null;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    // Survivors are the items that still have an action: a line of changes being sent has none, nor a line whose page is
    // not served.
    const action = (key: string) => listRef.current?.querySelector<HTMLElement>(`[data-need="${key}"] a[href]`) ?? null;
    const next = survivorAfter(was.order, was.key, items.map((i) => i.key).filter((k) => action(k)));
    (next ? action(next) : visibleHeaderControl())?.focus();
    // keys is the identity of the items; the effect reads them through it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);
  const onFocus = (e: React.FocusEvent) => {
    const key = (e.target as HTMLElement).closest<HTMLElement>('[data-need]')?.dataset.need;
    focused.current = key ? { key, order: items.map((i) => i.key) } : null;
  };
  const onBlur = (e: React.FocusEvent) => {
    // Focus moving out of the strip (not lost with a removed node) forgets it.
    if (e.relatedTarget && !listRef.current?.contains(e.relatedTarget as Node)) focused.current = null;
  };
  const sentence = (item: NeedItem): string => {
    if (item.key === 'more') return t('needs.more', { count: item.count });
    if (item.held) return heldSentence(item.held);
    return item.key === 'computers' && item.name ? t('needs.computer', { name: item.name }) : t(`needs.${item.key as 'bots' | 'computers' | 'changes'}`, { count: item.count });
  };
  // What a held change is and what to do: a script save by its path (and computer, when Home's list names it), another
  // page's change by that page's name (another Scripts change: where to look, no Check), else a change whose page is not known.
  const heldSentence = (h: HeldLine): string => {
    if (h.kind === 'script') return h.computer ? t('needs.held.script', { path: h.path ?? '', computer: h.computer }) : t('needs.held.scriptAny', { path: h.path ?? '' });
    const pageKey = `needs.page.${h.page ?? ''}`;
    const page = h.page && Object.hasOwn(strings, pageKey) ? t(pageKey as `needs.page.${'scripts'}`) : null;
    if (h.kind === 'look' && page) return h.computer ? t('needs.held.look', { page, computer: h.computer }) : t('needs.held.lookAny', { page });
    if (h.kind === 'page' && page) return h.computer ? t('needs.held.page', { page, computer: h.computer }) : t('needs.held.pageAny', { page });
    return h.kind === 'page' || h.kind === 'look' ? t('needs.held.any') : t('needs.held.unknown');
  };
  return (
    <>
      {/* One region that stays mounted, so a first item is spoken too; its text changes only with the items. */}
      <span className={SR_ONLY} role="status" aria-live="polite">{/* inline hint: the strip's one polite announcement, not an outcome */}
        {items.map(sentence).map((x) => (/[.!?]$/.test(x) ? x : `${x}.`)).join(' ')}
      </span>
      {items.length > 0 && (
        <section className={s.needs} aria-labelledby="home-needs-title" data-needs={needsSignature(items)}>
          <h2 id="home-needs-title" className={s.needsTitle}>
            <Icon name="warn" size="sm" />
            {t('needs.title')}
          </h2>
          <ul className={s.needsList} ref={listRef} onFocus={onFocus} onBlur={onBlur}>
            {items.map((item) => (
              <li key={item.key} className={s.need} data-need={item.key} data-tone={item.tone}>
                <span className={s.needMark} aria-hidden="true">
                  <span className={s.needDot} />
                </span>
                <span className={s.needText}>
                  <span className={s.needSentence}>{sentence(item)}</span>
                  <span className={s.needScope}>
                    {item.scope === 'account' ? t('needs.scope.account') : realm.all ? null : t('needs.scope.realm', { realm: realm.name })}
                  </span>
                  {item.key === 'changes' && <span className={s.needBody}>{t('needs.changes.body', { count: item.count })}</span>}
                </span>
                <Action item={item} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
