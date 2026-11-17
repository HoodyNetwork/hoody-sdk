// The Home web widgets of the shown account in the selected realm, and the changes to them. The one place that knows
// where they are kept: a core account preference ('hub_homew_v1', scope account+realm, stored encrypted and removed at
// sign-out, registered in core/prefs.ts and the storage registry). Moving them to the server later changes this file
// only.
//
// Contract, in plain words:
//   - Reads fail closed (model.ts parseWidgets): a malformed value, a locked one or no account shows no widgets.
//   - Each change is a function of the stored value (core usePrefUpdate), so a change made over another tab's newer
//     value is applied again on top of it, not lost. A change the browser does not keep says so once (a toast).
//   - With All realms (or no concrete realm) selected, nothing is shown and add refuses ('no-realm').
//   - Titles mask access ids (core maskAddress), the unnamed host included.
//   - A card frames its address only when url.ts frameable says the Hub page may, and the address is not the Hub's
//     own origin (checked again here: the stored value cannot know the page).
import { maskAddress, proxyDomain, usePrefUpdate, useRealms } from '@core';
import { showToast, useStrings } from '@kit';
import { useCallback, useMemo } from 'react';
import { addChange, cleanName, defaultName, EMPTY, newId, parseWidgets, WIDGET_MAX, type WebWidget, type WebWidgets, type WidgetSize } from './model';
import { checkUrl, frameable, type UrlRefusal } from './url';
import { hubOrigin } from './store.web';
import strings from './strings.en.json';

export const KEY = 'hub_homew_v1';
export const PAGE_ID = 'home-web';
/** Default place: after Home's own cards (keys 70). */
export const ORDER = 200;
/** A concrete realm (core realms.ts: 'all' or a 24-hex id); 'all' holds no widgets of its own. */
const REALM = /^[0-9a-f]{24}$/;

/** A web widget as Home arranges it (one of the dashboard cards). */
export interface UrlCard {
  key: string;
  pageId: typeof PAGE_ID;
  id: string;
  /** For display: masked (see toCard). */
  title: string;
  /** The name as the person typed it, for Rename only; '' when unnamed. Never shown as text. */
  name: string;
  order: number;
  size: WidgetSize;
  url: string;
  /** The Hub page may show it in a frame. */
  frame: boolean;
}

export const isUrlCard = (c: { pageId: string }): c is UrlCard => c.pageId === PAGE_ID && 'url' in c;

export type AddResult = { ok: true } | { refused: UrlRefusal | 'name' | 'full' | 'no-realm' | 'unsaved' };

export interface UrlWidgets {
  cards: UrlCard[];
  full: boolean;
  realmKnown: boolean;
  add(url: string, name: string): AddResult;
  rename(id: string, name: string): boolean;
  resize(id: string, size: WidgetSize): void;
  remove(id: string): void;
}

export function toCard(w: WebWidget, pd: string, hub: string): UrlCard {
  return {
    key: `${PAGE_ID}:${w.id}`,
    pageId: PAGE_ID,
    id: w.id,
    // Kit addresses carry ids that grant access: a title (the host when unnamed) shows them masked, like AddressText.
    title: maskAddress(w.name || defaultName(w.url)),
    name: w.name ?? '',
    order: ORDER,
    size: w.size,
    url: w.url,
    frame: frameable(w.url, pd) && 'url' in checkUrl(w.url, hub),
  };
}

export function useUrlWidgets(): UrlWidgets {
  const t = useStrings(strings);
  const realm = useRealms().selected;
  const realmKnown = typeof realm === 'string' && REALM.test(realm);
  const notKept = useCallback(() => showToast({ title: t('toast.notKept'), tone: 'warn' /* noDetails: the browser did not keep the change (core prefs onUnsaved); there is no rejection */ }), [t]);
  const { value, update } = usePrefUpdate<WebWidgets>(KEY, parseWidgets, { scope: 'account+realm', part: realmKnown ? realm : 'x', onUnsaved: notKept });
  const list = realmKnown ? value : EMPTY;
  const pd = proxyDomain();
  const cards = useMemo(() => list.items.map((w) => toCard(w, pd, hubOrigin())), [list, pd]);
  const full = list.items.length >= WIDGET_MAX;

  const change = useCallback((fn: (now: WebWidgets) => WebWidgets) => realmKnown && update(fn), [realmKnown, update]);

  const add = useCallback(
    (rawUrl: string, rawName: string): AddResult => {
      if (!realmKnown) return { refused: 'no-realm' };
      const u = checkUrl(rawUrl, hubOrigin());
      if ('refused' in u) return u;
      const name = cleanName(rawName);
      if (name === null) return { refused: 'name' };
      // The id is chosen here, once: every application of the change adds the same widget (model.ts addChange).
      const op = addChange(newId(list.items.map((x) => x.id)), u.url, name, () => showToast({ title: t('add.lost'), tone: 'warn' /* noDetails: another tab filled the list first (model.ts addChange); there is no rejection */ }));
      const stored = change(op.fn);
      const result = op.result();
      if (result === 'full') return { refused: 'full' };
      return stored && result === 'added' ? { ok: true } : { refused: 'unsaved' };
    },
    [realmKnown, change, list, t],
  );
  const rename = useCallback(
    (id: string, rawName: string): boolean => {
      const name = cleanName(rawName);
      if (name === null) return false;
      change((now) => ({ v: 1, items: now.items.map((w) => (w.id !== id ? w : name ? { ...w, name } : { id: w.id, url: w.url, size: w.size })) }));
      return true;
    },
    [change],
  );
  const resize = useCallback((id: string, size: WidgetSize) => { change((now) => ({ v: 1, items: now.items.map((w) => (w.id === id ? { ...w, size } : w)) })); }, [change]);
  const remove = useCallback((id: string) => { change((now) => ({ v: 1, items: now.items.filter((w) => w.id !== id) })); }, [change]);
  return { cards, full, realmKnown, add, rename, resize, remove };
}
