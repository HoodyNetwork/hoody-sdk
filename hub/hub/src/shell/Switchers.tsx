// Realm and computer switchers and the account menu in the top bar.
import { type CSSProperties, type KeyboardEvent, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Autocomplete, Button as AriaButton, Dialog, Header, Heading, type Key, Link, Menu, MenuItem, MenuSection, MenuTrigger, Modal, ModalOverlay, Popover, Separator, Text, useFilter } from 'react-aria-components';
import { useCan } from '@core';
import { useRealmCap } from '@core/realms';
import { isStandalone, servedHubUrl } from '@core/origin';
import { realmCapMore } from '@core/realmLimit';
import { lockNow, lockSettings } from '@core/shell';
import { Shortcut } from '@kit/controls/Kbd';
import { cx } from '@kit/controls/Button';
import { SR_ONLY } from '@kit/controls/SrOnly';
import { IconButton } from '@kit/controls/Button';
import { ComputerMark } from '@kit/data/ComputerMark';
import { SearchField } from '@kit/forms/fields';
import { Icon } from '@kit/icons';
import { menuFooterSectionClass, menuSearchClass } from '@kit/overlays/Menu';
import { InfoTip } from '@kit/overlays/InfoTip';
import { menuFooterClass } from '@kit/overlays/MenuFooter';
import { Tooltip } from '@kit/overlays/Popover';
import overlayStrings from '@kit/overlays/strings.en.json';
import { useKeyshortcuts } from '@kit/keyshortcuts';
import { labelInNameProps } from '@kit/labelInName';
import { HUB_LOCALE, localeName } from '@kit/locales';
import { usePerf } from '@kit/perf';
import perfStrings from '@kit/perf.strings.en.json';
import { LanguageMenu } from '@kit/pickers/LanguageMenu';
import { SEARCH_ABOVE } from '@kit/pickers/PickerPanel';
import { Spinner } from '@kit/states/States';
import { makeT, useStrings } from '@kit/strings';
import { chromeHidden, restoreChrome } from './chrome';
import { initials, switchTarget, useShellData } from './context';
import { shownRealmName } from './realmName';
import { type PageLink, usePageLink, useServedPage, useServedPageLink } from './pageLinks';
import { useShellPrefs } from './prefs';
import { OPEN_REALM } from './realmParam';
import { useRenameRealms } from './RenameRealms';
import strings from './strings.en.json';
import s from './Switchers.module.css';

/** `link` with a query or hash added. */
const withTail = (link: PageLink | null, tail: string): PageLink | null => (link ? { kind: 'hub', href: link.href + tail } : null);
/** The computers page's Get a computer drawer (its `?get=1`). Null while this load hides Computers, and for a
 *  session that cannot create one (a token session never has the account capability; the drawer would not open). */
const useGetComputerLink = (): PageLink | null => {
  const link = withTail(usePageLink('computers'), '?get=1');
  return useCan('account') ? link : null;
};
/** The menu key of Get a computer (computer ids are hex: no clash). */
const GET = 'hub:get-computer';
/** The menu key of All computers: no computer shown. */
const ALL = 'hub:all-computers';
/** The menu key of Try again: read the computer list again after a read that failed. */
const RETRY = 'hub:retry-computers';
/** The menu key of the loading line: a disabled item while the computer list reads. */
const LOADING = 'hub:loading-computers';

// Each mounted computer switcher (the top bar's) registers how to open it, so a page that needs a computer asks for a
// pick in place, and offers none where no switcher is mounted. The newest registration opens; one leaving takes only
// its own.
const openers: (() => void)[] = [];
const openerListeners = new Set<() => void>();
const onOpener = (l: () => void) => {
  openerListeners.add(l);
  return () => void openerListeners.delete(l);
};
function addOpener(fn: () => void): () => void {
  openers.push(fn);
  for (const l of openerListeners) l();
  return () => {
    const i = openers.lastIndexOf(fn);
    if (i >= 0) openers.splice(i, 1);
    for (const l of openerListeners) l();
  };
}

/** The switcher on screen: the top bar's on a wide screen, else the phone's realm and computer sheet chip. Its trigger
 *  takes focus first, so closing the menu or sheet returns focus to it, not to a hidden opener such as the More drawer. */
function openVisibleSwitcher(): void {
  const seen = (el: HTMLElement | null) => (el && (el.checkVisibility ? el.checkVisibility() : el.getClientRects().length > 0) ? el : null);
  const trigger = seen(document.querySelector<HTMLElement>('[data-hub-switch="computer"]')) ?? seen(document.querySelector<HTMLElement>('[data-hub-switch="context"]'));
  trigger?.focus({ preventScroll: true });
  trigger?.click();
}

/** Opens the computer switcher, as Alt+C does; in focus mode it brings the chrome back first. Without a mounted
 *  switcher it does nothing (useComputerSwitcherReady says so). */
export function openComputerSwitcher(): void {
  openers[openers.length - 1]?.();
}

/** Whether a computer switcher is mounted for openComputerSwitcher to open. */
export function useComputerSwitcherReady(): boolean {
  return useSyncExternalStore(onOpener, () => openers.length > 0, () => false);
}
/** The menu key of Share this realm (realm ids are hex: no clash). */
const SHARE = 'hub:share-realm';
/** The Keys page's share drawer, for `realm` (none: All realms, the person picks). Only for a session that can share
 *  (an account) and only when this load serves the Keys page. */
const useShareRealmLink = (realm: string | undefined): string | null => {
  const keys = useServedPageLink('keys');
  const can = useCan('account');
  if (!keys || !can) return null;
  return `${keys.href}/shared?share=1${realm ? `&${OPEN_REALM}=${encodeURIComponent(realm)}` : ''}`;
};

/** The menu key of New realm. */
const NEW_REALM = 'hub:new-realm';
/** The menu key of Rename realms (the Rename realms dialog; null where renaming is not offered: a pinned token session). */
const RENAME = 'hub:rename-realms';
/** The menu key of the "No realm matches" line (a disabled row while the search matches no realm). */
const NO_MATCH = 'hub:no-realm-match';
/** The New realm flow: the realms page (path /realms/new). Only for an account session that may
 *  switch realms (a pinned token session has no setRealm) and only when this load serves the page. The flow ends in a
 *  link with ?open_realm=<id>, which the shell switches to (realmParam.tsx); the page never switches itself. */
const useNewRealmLink = (canSwitch: boolean): string | null => {
  const realms = useServedPageLink('realms');
  const can = useCan('account');
  return realms && can && canSwitch ? realms.href : null;
};

/** The Realm limit as the realm menu shows it, for a session that may make realms: the use beside New realm ("1/5",
 *  null while the API reports no count or no limit), its spoken name, the hint that opens from it, whether New realm
 *  is off (the API says the limit is reached) and its reason. The hint links to the plans only while a higher plan
 *  exists and this sign-in can open Billing (on the one-file Hub: the served Hub's). No cap: nothing shown, nothing off. */
interface RealmLimitShown {
  use: { text: string; name: string; hint: string; link: { href: string; label: string } | null } | null;
  reached: boolean;
  reason: string;
}
function useRealmLimit(): RealmLimitShown {
  const t = useStrings(strings);
  const cap = useRealmCap();
  const billing = usePageLink('billing');
  const account = useCan('account');
  const reached = cap.k !== 'none' && cap.reached;
  const href = realmCapMore(cap) && billing && account ? (isStandalone() ? servedHubUrl('/billing') : billing.href) : '';
  return {
    use: cap.k === 'use'
      ? {
          text: t('top.realmUseShort', { used: cap.used, max: cap.max }),
          name: t('top.realmUse', { used: cap.used, max: cap.max }),
          hint: t(href ? 'top.realmHintMore' : 'top.realmHint'),
          link: href ? { href, label: t('top.realmUpgrade') } : null,
        }
      : null,
    reached,
    reason: reached ? t('top.realmLimitReached') : '',
  };
}

/** The room New realm's line keeps free at its end for the number, by the number's length (a custom property: the
 *  style sheet sizes it). */
const capRoom = (limit: RealmLimitShown): CSSProperties | undefined => (limit.use ? ({ '--cap-ch': limit.use.text.length } as CSSProperties) : undefined);

/** The account's use against its Realm limit, at the end of the New realm line: the number is the hint's trigger. */
function RealmUse({ limit, onFollow, sheet }: { limit: RealmLimitShown; onFollow: () => void; sheet?: boolean }) {
  if (!limit.use) return null;
  return (
    <span className={cx(s.capNum, sheet && s.capNumSheet)} data-realm-use="">
      <InfoTip text={limit.use.hint} subject={limit.use.name} name={limit.use.name} link={limit.use.link ? { ...limit.use.link, onPress: onFollow } : undefined}>
        {limit.use.text}
      </InfoTip>
    </span>
  );
}

/** A menu item that is off but stays reachable (arrows and Tab still land on it, so its reason is read): the library's
 *  own disabled state would take it out of the focus order, so the element only says it is off. */
const softOff = (el: HTMLElement | null): void => { el?.setAttribute('aria-disabled', 'true'); };

/** The busy mark in place of a trigger's caret while a realm switch runs. */
function SwitchBusy() {
  return (
    <span className={s.busy} data-hub-switch-busy="" aria-hidden="true">
      <Spinner />
    </span>
  );
}

/** The busy mark in place of the computer trigger's caret while the computer list loads (not a realm switch). */
function ListBusy() {
  return (
    <span className={s.busy} data-hub-list-busy="" aria-hidden="true">
      <Spinner />
    </span>
  );
}

/** A realm's computer count: the number shown, its words read out. */
function RealmCount({ n }: { n: number }) {
  const t = useStrings(strings);
  return (
    <>
      <span aria-hidden="true">{n}</span>
      <span className={SR_ONLY}>{t('top.realmComputers', { count: n })}</span>
    </>
  );
}

export function RealmSwitcher() {
  const t = useStrings(strings);
  const data = useShellData();
  const current = data.realms.find((r) => r.id === data.realmId);
  const shareLink = useShareRealmLink(current?.id);
  const newLink = useNewRealmLink(!!data.setRealm);
  const limit = useRealmLimit();
  const renameOpen = useRenameRealms();
  const rename = renameOpen && data.realms.length > 0 ? renameOpen : null;
  const share = shareLink && data.realms.length > 0 ? shareLink : null;
  const tk = useStrings(overlayStrings);
  const shownId = useId();
  const selfId = useId();
  const keys = useKeyshortcuts<HTMLButtonElement>('Alt+R');
  // Above SEARCH_ABOVE realms (PickerPanel's rule) a search row sits at the top of the menu: it
  // filters the realm choices (All realms included) by name, so the first match is the one Enter picks; Rename and the
  // footer's actions stay whatever is typed. A search that matches no choice shows a plain "No realm matches" line.
  const { contains } = useFilter({ sensitivity: 'base' });
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const searchable = data.realms.length > SEARCH_ABOVE;
  const choices = new Set(['all', ...data.realms.map((r) => r.id)]);
  // The realm choices the query keeps, in menu order: the first is what Enter picks.
  const matches = [...(data.setRealm && data.realms.length > 0 && contains(t('top.realmAll'), query) ? ['all'] : []), ...data.realms.filter((r) => contains(r.name, query)).map((r) => r.id)];
  const noMatch = searchable && query !== '' && matches.length === 0;
  // React Aria's virtual focus follows forward typing only (a paste, a deletion or an undo leaves no row focused) and
  // skips the disabled "No realm matches" row to Rename or the footer. So Enter after a query change picks the first
  // match itself, or nothing when none matches; a row the person reached with the arrows since then keeps Enter.
  const navigated = useRef(false);
  // The same rules as React Aria's useAutocomplete: keys of an IME composition are the composition's. Shift+Home/End
  // selects text when no row is focused and moves through the menu otherwise; React Aria decides that from its own
  // queued focus (the field's aria-activedescendant lags typing by a moment), and only a move cancels the key's default.
  // This capture handler runs before React Aria's, so the key is kept and read at the next key, once its dispatch has
  // ended (a browser can run microtasks between the capture and bubble listeners, so no earlier moment is safe).
  const heldShiftKey = useRef<Event | null>(null);
  const onSearchKey = (e: KeyboardEvent<HTMLElement>) => {
    if (heldShiftKey.current?.defaultPrevented) navigated.current = true;
    heldShiftKey.current = null;
    if (e.nativeEvent.isComposing) return;
    if ((e.key === 'Home' || e.key === 'End') && e.shiftKey) heldShiftKey.current = e.nativeEvent;
    else if (['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) navigated.current = true;
    if (e.key !== 'Enter' || navigated.current || query === '') return;
    e.preventDefault();
    e.stopPropagation();
    const first = matches[0];
    if (first === undefined) return;
    data.setRealm?.(first);
    setOpen(false);
    setQuery('');
  };
  // An account with no realm yet still gets the menu when it can make one.
  if (data.realms.length === 0 && !newLink) return null;
  // While core checks a picked realm, the trigger keeps the realm the page shows (page actions still go there),
  // takes a busy mark, and its name says where the Hub is going. react-aria's Button passes no aria-busy, and
  // isPending would block it: a newer pick supersedes the running switch. The menu keeps the realm shown.
  // Its name is the realm it shows, then this label (Label in Name).
  const going = switchTarget(data, t('top.realmAll'));
  // The selection stays on the menu itself, so opening it lands on the realm shown; Rename and the footer's actions sit
  // in sections without selection: plain items, never a realm choice. Escape never clears the selection: with the search
  // row (virtual focus) React Aria would otherwise spend every Escape on the fixed selection and the menu could not close.
  const menu = (
    <Menu
      className={s.menu}
      aria-label={t('top.realm')}
      selectionMode="single"
      selectedKeys={new Set([data.realmId])}
      escapeKeyBehavior="none"
      onAction={(k) => {
        if (k === RENAME) rename?.();
        else if (k !== SHARE && k !== NEW_REALM) data.setRealm?.(String(k));
      }}
    >
      {/* All realms is a realm choice like the others ('all' is core's own selection), first in the list. A pinned
          token session cannot switch (no setRealm), and with no realm listed there is nothing to widen to. */}
      {data.setRealm && data.realms.length > 0 && (
        <MenuItem id="all" className={s.item} textValue={t('top.realmAll')}>
          {({ isSelected }) => (
            <>
              <Icon name="realm" size="sm" />
              <span className={s.itemText}>{t('top.realmAll')}</span>
              {isSelected && <Icon name="check" size="sm" className={s.check} />}
            </>
          )}
        </MenuItem>
      )}
      {data.realms.map((r) => (
        <MenuItem key={r.id} id={r.id} className={s.item} textValue={r.name}>
          {({ isSelected }) => (
            <>
              <span className={cx(s.realmDot, r.color && `rc-${r.color}`)} aria-hidden="true" />
              {/* The name labels the row; its computer count describes it. The description is there (empty) while
                  the count is unknown: react-aria wires a description only when the row first renders one, and a
                  count that arrives with the menu open must still be read out. */}
              <Text slot="label" className={s.itemText}>
                {r.name}
              </Text>
              <Text slot="description" className={s.itemCount}>
                {typeof r.computers === 'number' && <RealmCount n={r.computers} />}
              </Text>
              {isSelected && <Icon name="check" size="sm" className={s.check} />}
            </>
          )}
        </MenuItem>
      ))}
      {noMatch && (
        <MenuItem id={NO_MATCH} isDisabled className={s.item} textValue={t('top.realmNoMatch')}>
          <span className={s.itemText}>{t('top.realmNoMatch')}</span>
        </MenuItem>
      )}
      {/* Rename realms ends the list (the footer holds at most two actions), in a section of its own. */}
      {rename && <Separator className={s.separator} />}
      {rename && (
        <MenuSection selectionMode="none">
          <MenuItem id={RENAME} className={s.item} textValue={t('top.renameRealms')}>
            <Icon name="pen" size="sm" />
            <span className={s.itemText}>{t('top.renameRealms')}</span>
          </MenuItem>
        </MenuSection>
      )}
      {/* The footer: Share this realm and New realm stay at the bottom of the scrolling menu, its last
          section, so arrows, typeahead and Enter reach them as any item. It draws its own hairline. */}
      {(share || newLink) && (
        <MenuSection selectionMode="none" aria-label={tk('menuActions')} className={menuFooterSectionClass} data-menu-footer="">
          {share ? (
            <MenuItem id={SHARE} href={share} className={s.item} textValue={t(current ? 'top.shareRealm' : 'top.shareARealm')}>
              <Icon name="share" size="sm" />
              <span className={s.itemText}>{t(current ? 'top.shareRealm' : 'top.shareARealm')}</span>
            </MenuItem>
          ) : null}
          {newLink && !limit.reached ? (
            <MenuItem id={NEW_REALM} href={newLink} className={cx(s.item, limit.use && s.itemCap)} style={capRoom(limit)} textValue={t('top.newRealm')}>
              <Icon name="plus" size="sm" />
              <span className={s.itemText}>{t('top.newRealm')}</span>
            </MenuItem>
          ) : null}
          {/* At or over the limit New realm is off but stays reachable, its reason on the same line; nothing is sent. */}
          {newLink && limit.reached ? (
            <MenuItem id={NEW_REALM} ref={softOff} shouldCloseOnSelect={false} className={cx(s.item, s.itemOff, limit.use && s.itemCap)} style={capRoom(limit)} textValue={t('top.newRealm')} data-realm-limit="">
              <Icon name="plus" size="sm" />
              <span className={s.itemLine}>
                <span>{t('top.newRealm')}</span>
                <span className={s.itemSub}>{limit.reason}</span>
              </span>
            </MenuItem>
          ) : null}
        </MenuSection>
      )}
    </Menu>
  );
  const label = !going ? t('top.realm') : going.name !== null ? t('top.realmSwitching', { realm: going.name }) : t('top.realmSwitchingUnnamed');
  return (
    <MenuTrigger
      isOpen={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        navigated.current = false;
        heldShiftKey.current = null;
        if (isOpen) data.refreshRealms?.();
        else setQuery('');
      }}
    >
      <AriaButton
        id={selfId}
        ref={keys}
        className={cx(s.trigger, s.realmPart)}
        {...labelInNameProps({ shownId, selfId, label })}
        data-hub-switch="realm"
      >
        {current ? <span className={cx(s.realmDot, current.color && `rc-${current.color}`)} aria-hidden="true" /> : <Icon name="realm" size="sm" />}
        <span id={shownId} className={cx(s.triggerText, s.realmName)}>{shownRealmName(data, t('top.realmAll'), t('top.realmThis'))}</span>
        {going ? <SwitchBusy /> : <Icon name="chevron-down" size="sm" className={s.caret} />}
      </AriaButton>
      <Popover className={s.popover} placement="bottom start">
        {searchable ? (
          // The search row is the popover's first child, so it stays at the top of the scrolling list; the Menu keeps
          // its keys (arrows, Enter) through the field, and the first Escape clears the field, the next one closes.
          <Autocomplete
            inputValue={query}
            onInputChange={(q) => {
              navigated.current = false;
              heldShiftKey.current = null;
              setQuery(q);
            }}
            filter={(text, input, node) => !choices.has(String(node.key)) || contains(text, input)}
          >
            <div className={menuSearchClass} onKeyDownCapture={onSearchKey}>
              {/* The menu was opened to find a realm: the field takes focus. */}
              {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
              <SearchField label={t('top.realmSearch')} placeholder={t('top.realmSearch')} autoFocus />
            </div>
            {menu}
          </Autocomplete>
        ) : (
          menu
        )}
        {/* The use against the Realm limit sits at the end of New realm's line, the menu's last: a control of its own
            after the menu (a menu holds only its items), so Tab reaches it and a press or a hover opens its hint. */}
        {newLink && limit.use ? (
          <div className={s.capSlot}>
            <RealmUse limit={limit} onFollow={() => setOpen(false)} />
          </div>
        ) : null}
      </Popover>
    </MenuTrigger>
  );
}

export function ComputerSwitcher() {
  const t = useStrings(strings);
  const data = useShellData();
  const getLink = useGetComputerLink();
  const tk = useStrings(overlayStrings);
  const current = data.computers.find((c) => c.id === data.computerId);
  const any = data.computers.length > 0;
  // A list the shell does not know is never "No computers yet" (C9): it reads as loading, or as not loaded with Try
  // again. Listed computers win (a read of a known list running again). Try again, and the loading after it, keep
  // the switcher on screen even without Get a computer.
  const read = any ? undefined : data.computersRead;
  const retry = read === 'unknown' ? data.retryComputers : undefined;
  const shows = any || !!getLink || (read !== undefined && !!data.retryComputers);
  const textId = useId();
  const tipId = useId();
  const selfId = useId();
  const keys = useKeyshortcuts<HTMLButtonElement>('Alt+C');
  useEffect(() => {
    if (!shows) return;
    // In focus mode the trigger shows once the chrome is back, a frame later; a switcher that goes first drops it.
    let frame = 0;
    const open = () => {
      if (!chromeHidden()) return openVisibleSwitcher();
      restoreChrome();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        openVisibleSwitcher();
      });
    };
    const off = addOpener(open);
    return () => {
      off();
      cancelAnimationFrame(frame);
    };
  }, [shows]);
  if (!shows) return null;
  const all = any && data.clearComputer !== undefined;
  const onAction = (k: Key) => {
    // Get a computer is a link (its href): nothing to do here.
    if (k === GET) return;
    if (k === ALL) data.clearComputer?.();
    else if (k === RETRY) retry?.();
    else data.setComputer?.(String(k));
  };
  // The shown computer's facts on hover or focus: name, its realm when one realm is shown (All realms
  // lists computers of several), where it runs, and whether it runs. None while no listed computer is shown.
  // The same facts, less the name the trigger already says, are its description, tooltip open or not: its own
  // describedby wins over the tooltip's. Its name is the words it shows, then "Computer" (Label in Name).
  const realm = data.realmId === 'all' ? undefined : data.realms.find((r) => r.id === data.realmId);
  const place = current && [current.flag, current.location].filter(Boolean).join(' ');
  const facts = current ? [current.name, realm?.name, place, t(current.running ? 'top.computerTipRunning' : 'top.computerTipNotRunning')].filter((f): f is string => !!f) : [];
  const trigger = (
    <AriaButton
      id={selfId}
      className={cx(s.trigger, s.computerPart)}
      {...labelInNameProps({ shownId: textId, selfId, label: t('top.computer') })}
      aria-describedby={current ? tipId : undefined}
      ref={keys}
      data-hub-switch="computer"
    >
      {current && <span className={cx(s.live, current.running && s.liveOn)} aria-hidden="true" />}
      {current?.color && <ComputerMark color={current.color} />}
      {current?.flag && (
        <span className={s.flag} aria-hidden="true">
          {current.flag}
        </span>
      )}
      <span id={textId} className={cx(s.triggerText, s.computerName)}>
        {current?.name ??
          t(read === 'loading' ? 'top.computerLoading' : read === 'unknown' ? 'top.computerNotLoaded' : !any ? 'top.computerNoneYet' : data.computerId ? 'top.computerUnlisted' : 'top.computerAll')}
      </span>
      {read === 'loading' ? <ListBusy /> : <Icon name="chevron-down" size="sm" className={s.caret} />}
      {current && (
        <span id={tipId} className={SR_ONLY}>
          {facts.slice(1).join(', ')}
        </span>
      )}
    </AriaButton>
  );
  return (
    <MenuTrigger>
      {/* One fact per line. Always mounted, off while no listed computer is shown: a wrapper that came and went would
          remount the trigger and drop its focus. Turned off, the kit tip forgets it was open, so one open from the
          keyboard when the shown computer left the list never comes back unfocused when it returns. */}
      <Tooltip content={facts[0] ?? ''} lines={facts.slice(1)} placement="bottom" isDisabled={!current} data-hub-computer-tip="">
        {trigger}
      </Tooltip>
      <Popover className={s.popover} placement="bottom start">
        {/* The selection is the menu's own, so opening it lands on the computer shown (or All computers, only when
            none is: a shown computer missing from the list checks nothing); Get a computer sits in the footer, a section
            without selection: a plain item. */}
        <Menu
          className={s.menu}
          aria-label={t('top.computer')}
          selectionMode="single"
          selectedKeys={new Set([data.computerId ?? ALL])}
          onAction={onAction}
        >
          {all && (
            <MenuItem id={ALL} className={s.item} textValue={t('top.computerAll')}>
              {({ isSelected }) => (
                <>
                  <Icon name="computer" size="sm" />
                  <span className={s.itemText}>{t('top.computerAll')}</span>
                  {isSelected && <Icon name="check" size="sm" className={s.check} />}
                </>
              )}
            </MenuItem>
          )}
          {data.computers.map((c) => (
            <MenuItem key={c.id} id={c.id} className={s.item} textValue={c.name}>
              {({ isSelected }) => (
                <>
                  <span className={cx(s.live, c.running && s.liveOn)} aria-hidden="true" />
                  {c.color && <ComputerMark color={c.color} />}
                  <span className={s.flag} aria-hidden="true">
                    {c.flag}
                  </span>
                  <span className={s.itemText}>
                    <span>{c.name}</span>
                    {c.location && <span className={s.itemSub}>{c.location}</span>}
                  </span>
                  {isSelected && <Icon name="check" size="sm" className={s.check} />}
                </>
              )}
            </MenuItem>
          ))}
          {read === 'loading' && (
            <MenuSection selectionMode="none">
              <MenuItem id={LOADING} isDisabled className={s.item} textValue={t('top.computerLoading')}>
                <span className={s.itemText}>{t('top.computerLoading')}</span>
              </MenuItem>
            </MenuSection>
          )}
          {retry && (
            <MenuSection selectionMode="none">
              <MenuItem id={RETRY} className={s.item} textValue={t('top.computerRetry')}>
                <Icon name="reload" size="sm" />
                <span className={s.itemText}>{t('top.computerRetry')}</span>
              </MenuItem>
            </MenuSection>
          )}
          {/* The footer: Get a computer stays at the bottom of the scrolling menu; Try again and the loading
              line are states of the list and stay in it. */}
          {getLink && (
            <MenuSection selectionMode="none" aria-label={tk('menuActions')} className={menuFooterSectionClass} data-menu-footer="">
              <MenuItem id={GET} href={getLink.href} className={s.item} textValue={t('top.getComputer')}>
                <Icon name="plus" size="sm" />
                <span className={s.itemText}>{t('top.getComputer')}</span>
              </MenuItem>
            </MenuSection>
          )}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

/** Lock now, only while a passcode is set here. A component of its own so the record is read
 *  when the menu opens (its items render then), not when the account button rendered. */
function LockNowItem({ label }: { label: string }) {
  if (!lockSettings()) return null;
  return (
    <MenuItem id="lock" className={s.item} textValue={label}>
      <Icon name="lock" size="sm" />
      <span className={s.itemText}>{label}</span>
    </MenuItem>
  );
}

export function AccountMenu({ onOpenShortcuts }: { onOpenShortcuts?: () => void }) {
  const t = useStrings(strings);
  const data = useShellData();
  const prefs = useShellPrefs();
  const perf = usePerf();
  const tp = useStrings(perfStrings);
  const initial = initials(data.account?.name);
  // Each entry is a link (its href, routed by the Hub); a page this load hides has no entry.
  const settingsLink = usePageLink('account');
  const billingLink = usePageLink('billing');
  // The referral program: its own page, linked under Billing while this load serves it.
  const earnLink = usePageLink('referrals');
  // The guide's Ways to connect section (CLI, SDK, MCP, API keys, SSH): the content lives there, not here.
  const connectLink = withTail(usePageLink('guide'), '#connect');
  // Support: the support page's own nav entry (label, icon, link), as in the sidebar's Help
  // group; none while this load does not serve the page.
  const supportPage = useServedPage('support');
  const supportLink = usePageLink('support');
  const supportLabel = supportPage ? makeT(supportPage.strings)(supportPage.nav?.label ?? supportPage.title) : '';
  // The language list opens from its row, in the account menu's place (under the avatar); Escape gives focus back to
  // the avatar.
  const avatar = useRef<HTMLButtonElement>(null);
  const [languageOpen, setLanguageOpen] = useState(false);
  const language = localeName(HUB_LOCALE);
  const onAction = (k: Key) => {
    if (k === 'signout') data.signOut?.();
    else if (k === 'lock') lockNow();
    else if (k === 'keys') onOpenShortcuts?.();
    else if (k === 'language') setLanguageOpen(true);
  };
  return (
    <>
    <MenuTrigger>
      <AriaButton ref={avatar} className={s.avatarBtn} aria-label={t('top.account')}>
        <span className={s.avatar} aria-hidden="true">
          {initial}
        </span>
      </AriaButton>
      <Popover className={cx(s.popover, s.accountPop)} placement="bottom end">
        {/* The name/email head opens Account: the menu's first item, named by the name and
            described by the email. A load that hides Account keeps it a plain heading above the menu. */}
        {data.account && !settingsLink && (
          <div className={s.accountHead}>
            <strong className={s.accountName}>{data.account.name}</strong>
            {data.account.detail && <span className={s.itemSub}>{data.account.detail}</span>}
          </div>
        )}
        <Menu className={s.menu} aria-label={t('top.account')} onAction={onAction}>
          {data.account && settingsLink && (
            <MenuItem id="head" href={settingsLink.href} className={cx(s.item, s.accountHeadItem)} textValue={data.account.name}>
              <Text slot="label" className={s.accountName}>
                {data.account.name}
              </Text>
              {data.account.detail && (
                <Text slot="description" className={s.itemSub}>
                  {data.account.detail}
                </Text>
              )}
            </MenuItem>
          )}
          {data.account && settingsLink && <Separator className={s.separator} />}
          {settingsLink && (
            <MenuItem id="settings" href={settingsLink.href} className={s.item}>
              <Icon name="account" size="sm" />
              <span className={s.itemText}>{t('account.settings')}</span>
            </MenuItem>
          )}
          {billingLink && (
            <MenuItem id="billing" href={billingLink.href} className={s.item}>
              <Icon name="wallet" size="sm" />
              <span className={s.itemText}>{t('account.billing')}</span>
            </MenuItem>
          )}
          {earnLink && (
            <MenuItem id="earn" href={earnLink.href} className={s.item} textValue={t('account.earn')}>
              <Icon name="share" size="sm" />
              <span className={s.itemText}>{t('account.earn')}</span>
            </MenuItem>
          )}
          {connectLink && (
            <MenuItem id="connect" href={connectLink.href} className={s.item} textValue={t('account.connect')}>
              <Icon name="link" size="sm" />
              <span className={s.itemText}>{t('account.connect')}</span>
            </MenuItem>
          )}
          {supportPage && supportLink && (
            <MenuItem id="support" href={supportLink.href} className={s.item} textValue={supportLabel}>
              <Icon name={supportPage.nav?.icon ?? 'apps'} size="sm" />
              <span className={s.itemText}>{supportLabel}</span>
            </MenuItem>
          )}
          {(settingsLink || billingLink || earnLink || connectLink || (supportPage && supportLink)) && <Separator className={s.separator} />}
          {/* The theme: one of Light, Dark and System, checked as chosen (System when nothing is saved). */}
          <MenuSection
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[prefs.choice]}
            onSelectionChange={(keys) => {
              const k = keys === 'all' ? undefined : [...keys][0];
              if (k === 'light' || k === 'dark' || k === 'system') prefs.setTheme(k);
            }}
          >
            <Header className={s.menuHead}>{t('account.appearance')}</Header>
            <MenuItem id="light" className={s.item} textValue={t('theme.light')}>
              <Icon name="sun" size="sm" />
              <span className={s.itemText}>{t('theme.light')}</span>
              {prefs.choice === 'light' && <Icon name="check" size="sm" className={s.check} />}
            </MenuItem>
            <MenuItem id="dark" className={s.item} textValue={t('theme.dark')}>
              <Icon name="moon" size="sm" />
              <span className={s.itemText}>{t('theme.dark')}</span>
              {prefs.choice === 'dark' && <Icon name="check" size="sm" className={s.check} />}
            </MenuItem>
            {/* System, the default: the device's light or dark, followed live. */}
            <MenuItem id="system" className={s.item} textValue={t('theme.system')}>
              <Icon name="display" size="sm" />
              <span className={s.itemText}>{t('theme.system')}</span>
              {prefs.choice === 'system' && (
                <span className={s.check}>
                  <Icon name="check" size="sm" />
                </span>
              )}
            </MenuItem>
          </MenuSection>
          {/* Performance mode: a checkbox item, on or off for this browser; a toast says which. */}
          <MenuSection
            selectionMode="multiple"
            selectedKeys={perf.on ? ['perf'] : []}
            onSelectionChange={(keys) => perf.set(keys !== 'all' && keys.has('perf'))}
          >
            <MenuItem id="perf" className={s.item} textValue={tp('perf.label')}>
              <Icon name="sparkle" size="sm" />
              <span className={s.itemText}>{tp('perf.label')}</span>
              {perf.on && <Icon name="check" size="sm" className={s.check} />}
            </MenuItem>
          </MenuSection>
          {/* The language: a block of its own after Appearance, the one in use at the row's end; the row opens the list
              (LanguageMenu below). */}
          <Separator className={s.separator} />
          <MenuItem id="language" className={s.item} textValue={t('account.language')} aria-label={t('account.languageNamed', { name: language })}>
            <Icon name="globe" size="sm" />
            <span className={s.itemText}>{t('account.language')}</span>
            <bdi className={s.itemSub}>{language}</bdi>
            <Icon name="chevron-right" size="sm" tone="faint" />
          </MenuItem>
          <Separator className={s.separator} />
          <MenuItem id="keys" className={s.item} textValue={t('account.shortcuts')}>
            <Icon name="command" size="sm" />
            <span className={s.itemText}>{t('account.shortcuts')}</span>
            <Shortcut keys="?" />
          </MenuItem>
          <LockNowItem label={t('lock.now')} />
          <MenuItem id="signout" className={s.item} isDisabled={!data.signOut}>
            <Icon name="logout" size="sm" />
            <span className={s.itemText}>{t('account.signOut')}</span>
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
    <LanguageMenu available={[HUB_LOCALE]} current={HUB_LOCALE} trigger={null} anchor={avatar} isOpen={languageOpen} onOpenChange={setLanguageOpen} placement="bottom end" />
    </>
  );
}

/**
 * Phone (< 768): one chip (realm square, state dot, flag, computer; the realm when there is no computer). With a
 * computer the chip does not name the realm; a listed realm's name is in the sheet.
 * Tapping opens a full-screen sheet with two sections, Realm then Computer.
 */
export function PhoneContext() {
  const t = useStrings(strings);
  const data = useShellData();
  const uid = useId();
  const shownId = useId();
  const selfId = useId();
  const [open, setOpen] = useState(false);
  // The realm whose list Try again last read again from this sheet.
  const [retriedIn, setRetriedIn] = useState<string | null>(null);
  const getLink = useGetComputerLink();
  const realm = data.realms.find((r) => r.id === data.realmId);
  const computer = data.computers.find((c) => c.id === data.computerId);
  // Without a computer the chip names the realm, by the top bar's one rule (shownRealmName): never "All realms" for a
  // realm missing from the list. With a computer it shows the realm as its square alone.
  const realmName = shownRealmName(data, t('top.realmAll'), t('top.realmThis'));
  const shareLink = useShareRealmLink(realm?.id);
  const newLink = useNewRealmLink(!!data.setRealm);
  const limit = useRealmLimit();
  const renameOpen = useRenameRealms();
  const sheetShare = shareLink && data.realms.length > 0 ? shareLink : null;
  const tk = useStrings(overlayStrings);
  // Get a computer (Computers served, account) or New realm (Realms served, account) keeps the chip even with no realm
  // and no computer: either is a way on for an empty account.
  const going = switchTarget(data, t('top.realmAll'));
  // The computer list not known: its line shows (loading, or not loaded with Try again), never "none" (C9). Try
  // again, and the loading after it, keep the chip (and an open sheet) even with no realm and no Get a computer.
  const listRead = data.computers.length > 0 ? undefined : data.computersRead;
  // Try again shows for a list not loaded, and stays (pending) through the read it started, so a keyboard press keeps
  // its focus. A load the sheet did not ask for (the first read, another realm's) has no Try again.
  const retry = listRead === 'unknown' || (listRead === 'loading' && retriedIn === data.realmId) ? data.retryComputers : undefined;
  if (data.realms.length === 0 && data.computers.length === 0 && !getLink && !newLink && !(listRead && data.retryComputers)) return null;
  const retryHere = () => {
    setRetriedIn(data.realmId);
    retry?.();
  };
  const getComputer = () => {
    // A link (its href) does the navigation; the sheet only closes.
    setOpen(false);
  };
  const pick = (fn: ((id: string) => void) | undefined, id: string) => {
    fn?.(id);
    setOpen(false);
  };
  return (
    <>
      <AriaButton
        id={selfId}
        className={s.phoneChip}
        // Named by the computer or realm it shows, then what it is for (Label in Name).
        {...labelInNameProps({ shownId, selfId, label: !going ? t('top.context') : going.name !== null ? t('top.contextSwitching', { realm: going.name }) : t('top.contextSwitchingUnnamed') })}
        onPress={() => {
          setOpen(true);
          data.refreshRealms?.();
        }}
        data-hub-switch="context"
      >
        {realm ? <span className={cx(s.realmDot, realm.color && `rc-${realm.color}`)} aria-hidden="true" /> : <Icon name="realm" size="sm" />}
        {computer && <span className={cx(s.live, computer.running && s.liveOn)} aria-hidden="true" />}
        {computer?.color && <ComputerMark color={computer.color} />}
        {computer?.flag && (
          <span className={s.flag} aria-hidden="true">
            {computer.flag}
          </span>
        )}
        <span id={shownId} className={cx(s.triggerText, s.computerName)}>{computer?.name ?? realmName}</span>
        {going ? <SwitchBusy /> : <Icon name="chevron-down" size="sm" className={s.caret} />}
      </AriaButton>
      <ModalOverlay isOpen={open} onOpenChange={setOpen} isDismissable className={s.sheetScrim}>
        <Modal className={s.sheet}>
          <Dialog className={s.sheetDialog} aria-label={t('top.context')}>
            <header className={s.sheetHead}>
              <IconButton icon="arrow-left" label={t('top.contextClose')} onPress={() => setOpen(false)} />
              <Heading slot="title" className={s.sheetTitle}>
                {t('top.context')}
              </Heading>
            </header>
            <div className={s.sheetBody}>
              <h3 className={s.menuHead}>{t('top.realm')}</h3>
              <ul className={s.sheetList}>
                {data.setRealm && data.realms.length > 0 && (
                  <li>
                    <AriaButton className={cx(s.sheetItem, data.realmId === 'all' && s.sheetCurrent)} aria-current={data.realmId === 'all' ? 'true' : undefined} onPress={() => pick(data.setRealm, 'all')}>
                      <Icon name="realm" size="sm" />
                      <span className={s.itemText}>{t('top.realmAll')}</span>
                      {data.realmId === 'all' && <Icon name="check" size="sm" className={s.check} />}
                    </AriaButton>
                  </li>
                )}
                {data.realms.map((r) => {
                  const counted = typeof r.computers === 'number';
                  return (
                    <li key={r.id}>
                      <AriaButton
                        className={cx(s.sheetItem, r.id === data.realmId && s.sheetCurrent)}
                        aria-current={r.id === data.realmId ? 'true' : undefined}
                        aria-labelledby={counted ? `${uid}-n-${r.id}` : undefined}
                        aria-describedby={counted ? `${uid}-c-${r.id}` : undefined}
                        onPress={() => pick(data.setRealm, r.id)}
                      >
                        <span className={cx(s.realmDot, r.color && `rc-${r.color}`)} aria-hidden="true" />
                        <span className={s.itemText} id={`${uid}-n-${r.id}`}>
                          {r.name}
                        </span>
                        {counted && (
                          <span className={s.itemCount} id={`${uid}-c-${r.id}`}>
                            <RealmCount n={r.computers as number} />
                          </span>
                        )}
                        {r.id === data.realmId && <Icon name="check" size="sm" className={s.check} />}
                      </AriaButton>
                    </li>
                  );
                })}
                {renameOpen && data.realms.length > 0 && (
                  <li>
                    <AriaButton
                      className={s.sheetItem}
                      onPress={() => {
                        setOpen(false);
                        renameOpen();
                      }}
                    >
                      <Icon name="pen" size="sm" />
                      <span className={s.itemText}>{t('top.renameRealms')}</span>
                    </AriaButton>
                  </li>
                )}
              </ul>
              <h3 className={s.menuHead}>{t('top.computer')}</h3>
              <ul className={s.sheetList}>
                {data.computers.length > 0 && data.clearComputer && (
                  <li>
                    <AriaButton
                      className={cx(s.sheetItem, !data.computerId && s.sheetCurrent)}
                      aria-current={data.computerId ? undefined : 'true'}
                      onPress={() => {
                        data.clearComputer?.();
                        setOpen(false);
                      }}
                    >
                      <Icon name="computer" size="sm" />
                      <span className={s.itemText}>{t('top.computerAll')}</span>
                      {!data.computerId && <Icon name="check" size="sm" className={s.check} />}
                    </AriaButton>
                  </li>
                )}
                {data.computers.map((c) => (
                  <li key={c.id}>
                    <AriaButton className={cx(s.sheetItem, c.id === data.computerId && s.sheetCurrent)} aria-current={c.id === data.computerId ? 'true' : undefined} onPress={() => pick(data.setComputer, c.id)}>
                      <span className={cx(s.live, c.running && s.liveOn)} aria-hidden="true" />
                      {c.color && <ComputerMark color={c.color} />}
                      <span className={s.flag} aria-hidden="true">
                        {c.flag}
                      </span>
                      <span className={s.itemText}>
                        <span>{c.name}</span>
                        {c.location && <span className={s.itemSub}>{c.location}</span>}
                      </span>
                      {c.id === data.computerId && <Icon name="check" size="sm" className={s.check} />}
                    </AriaButton>
                  </li>
                ))}
                {listRead === 'loading' && (
                  <li className={s.sheetNote}>
                    <span className={s.busy} data-hub-list-busy="" aria-hidden="true">
                      <Spinner />
                    </span>
                    <span className={s.itemText}>{t('top.computerLoading')}</span>
                  </li>
                )}
                {listRead === 'unknown' && (
                  <li className={s.sheetNote}>
                    <Icon name="warn" size="sm" />
                    <span className={s.itemText}>{t('top.computerNotLoaded')}</span>
                  </li>
                )}
                {retry && (
                  <li>
                    {/* The sheet stays open, and Try again stays where it is while the list reads again: pending, so it
                        refuses presses and keeps the focus a keyboard press gave it. */}
                    <AriaButton className={s.sheetItem} isPending={listRead === 'loading'} onPress={retryHere}>
                      <Icon name="reload" size="sm" />
                      <span className={s.itemText}>{t('top.computerRetry')}</span>
                    </AriaButton>
                  </li>
                )}
                {getLink && (
                  <li>
                    <Link className={s.sheetItem} href={getLink.href} onPress={getComputer}>
                      <Icon name="plus" size="sm" />
                      <span className={s.itemText}>{t('top.getComputer')}</span>
                    </Link>
                  </li>
                )}
              </ul>
            </div>
            {/* The footer: Share this realm and New realm stay below the scrolling lists, after them in Tab
                order. A group of links; Get a computer ends the computer list. */}
            {(sheetShare || newLink) && (
              <div role="group" aria-label={tk('menuActions')} className={cx(menuFooterClass, s.sheetFoot)} data-menu-footer="">
                {sheetShare && (
                  <Link className={s.sheetItem} href={sheetShare} onPress={() => setOpen(false)}>
                    <Icon name="share" size="sm" />
                    <span className={s.itemText}>{t(realm ? 'top.shareRealm' : 'top.shareARealm')}</span>
                  </Link>
                )}
                {newLink && (
                  <span className={s.capRow}>
                    {limit.reached ? (
                      <AriaButton className={cx(s.sheetItem, s.itemOff)} aria-disabled="true" data-realm-limit="">
                        <Icon name="plus" size="sm" />
                        <span className={s.itemLine}>
                          <span>{t('top.newRealm')}</span>
                          <span className={s.itemSub}>{limit.reason}</span>
                        </span>
                      </AriaButton>
                    ) : (
                      <Link className={s.sheetItem} href={newLink} onPress={() => setOpen(false)}>
                        <Icon name="plus" size="sm" />
                        <span className={s.itemText}>{t('top.newRealm')}</span>
                      </Link>
                    )}
                    <RealmUse limit={limit} onFollow={() => setOpen(false)} sheet />
                  </span>
                )}
              </div>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </>
  );
}
