// ⌘K: jump to any page, run any manifest command, or run one of the current page's own keys ("This page",
// usePageShortcuts), by typing. A page row ends with its g-jump keys. With a passcode set, Commands also offers Lock now:
// the palette closes, then this tab locks and every other tab of the account gets the lock message.
// With text in the field it shows one list, best match first (shell/search/match: words and their starts, accents and case
// folded, synonyms, typos): the page's own keys, pages, commands and, from two letters, what only the pages' views draw
// (settings sections and rows, page tabs, FAQ questions) from the deep index it loads on its first open,
// less the places and commands a page's view does not draw now (its manifest's searchHide, read while the palette is open:
// the empty field's Commands leave out such a command too).
// A computer is found by its name too: the rows are the shell's own list (the top bar's: the shown realm's computers),
// each opens that computer on the Computers page; the palette reads nothing for them. Commands also offers Get a computer
// (the Computers page's own drawer, for a session that may make one) and Sign out (the shell's one sign-out path, which
// asks first when something is unresolved). Escape closes the palette at once, with text in the field too.
// Typed text also finds a realm by its name (the shell's own realm list; the row switches to it through the shell's one
// switch, as the realm menu does) and a page's own named things (its navCount reader's items: a named Board opens that
// Board). Neither reads anything on the wire.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Autocomplete,
  Dialog,
  Header,
  Input,
  Menu,
  MenuItem,
  MenuSection,
  Modal,
  ModalOverlay,
  SearchField,
} from 'react-aria-components';
import { computerHandle, computerHref, useCan } from '@core';
import { lockNow, lockSettings } from '@core/shell';
import { IconButton } from '@kit/controls/Button';
import { Kbd } from '@kit/controls/Kbd';
import { Icon } from '@kit/icons';
import { useGo, usePathname } from '@kit/nav';
import { hidesTail, type PageManifest, type SearchHide } from '@kit/page';
import { makeT, useStrings } from '@kit/strings';
import { useShellData } from './context';
import { JUMPS } from './keys';
import { NavItemsProbes, type NavItem } from './navCount';
import { runPageShortcut, usePageShortcutGroups } from './pageShortcuts';
import { servesPath } from './pageLinks';
import { loadDeep } from './search/deep';
import { SearchHideProbes } from './search/hide';
import { prepare, search, type Prepared, type SearchKind } from './search/match';
import type { DeepEntry } from './search/types';
import strings from './strings.en.json';
import s from './CommandPalette.module.css';

/** The palette's one action entry (not a page or a page command). */
const LOCK_NOW = 'lock:now';
/** Sign out: run in place through the shell's sign-out (ShellData.signOut), never a route. */
const SIGN_OUT = 'do:sign-out';
/** Get a computer: the Computers page's own drawer. */
const GET_COMPUTER = 'do:get-computer';
const GET_COMPUTER_TO = '/computers?get=1';
/** A realm row: `realm:<id>` (or `realm:all`), run in place through ShellData.setRealm, never a route. */
const REALM = 'realm:';

interface Entry {
  id: string;
  kind: SearchKind;
  label: string;
  /** Where it goes; none for the actions run in place (Lock now, This page keys). */
  to: string;
  icon: NonNullable<PageManifest['nav']>['icon'];
  keywords: string;
  /** The two-key jump to this page (['g', 'h'], …), when there is one. */
  jump?: readonly string[];
  /** A deep entry's place: its page, and the section a setting row sits in. */
  where?: string;
  /** The section a setting sits in (matched, counts less than the label). */
  under?: string;
  /** Help and answer words (matched, count least, never shown). */
  body?: string;
  /** A deep entry's page id and tail (after the page's path), read against the page's searchHide. */
  deep?: { page: string; tail: string };
  /** A manifest command's page id and command id, read against the page's searchHide `commands`. */
  cmd?: { page: string; id: string };
}

/** The most rows a search shows: past these the list is a scroll nobody reads. */
const RESULTS = 50;

const DEEP_ICON: Record<DeepEntry['kind'], Entry['icon']> = { section: 'arrow-right', setting: 'sliders', tab: 'arrow-right', faq: 'info' };

/** Deep entries are listed from this many typed characters on: one letter would list most of the Hub. */
const DEEP_FROM = 2;

export interface CommandPaletteProps {
  pages: readonly PageManifest[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ pages, isOpen, onOpenChange }: CommandPaletteProps) {
  const t = useStrings(strings);
  const go = useGo();
  const pathname = usePathname();
  // The field's text, so the list can be told to make its first match the active row (below).
  const [query, setQuery] = useState('');
  // A closed palette forgets it: each open starts on an empty field.
  if (!isOpen && query !== '') setQuery('');
  // The list, read when a page's searchHide answers: which row was active then (below).
  const menuRef = useRef<HTMLDivElement>(null);
  // The row that was active when a page's searchHide answered (its key; top: it was the first row shown), until this
  // render has judged it; null: no answer since.
  const [wasActive, setWasActive] = useState<{ key: string | null; top: boolean } | null>(null);
  // Bumped to make a new list whose first row is the active one (the Menu key below).
  const [rebuilt, setRebuilt] = useState(0);
  // The rebuilt list that starts on its first row although the field is empty (the row arrowed to there was left out),
  // until the text changes or the palette closes: an empty field otherwise makes no row active.
  const [emptyFirst, setEmptyFirst] = useState<number | null>(null);
  if (emptyFirst !== null && (!isOpen || query !== '')) setEmptyFirst(null);
  const [deep, setDeep] = useState<readonly DeepEntry[]>([]);
  useEffect(() => {
    if (!isOpen || deep.length > 0) return;
    let live = true;
    loadDeep().then(
      (d) => live && setDeep(d),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [isOpen, deep.length]);
  // What each page's view leaves out now, by page id (search/hide). Reported while the palette is open, from its open:
  // the empty field's Commands list no command a page's view would not open (Turn on two-step sign-in while it is on),
  // and typed results leave out such commands and places from the first letter. The readers may read (a page's own
  // identity, two-step or referral record, page 1 of the computer list), so an open reads too, each read at most once
  // per its freshness window (core/query.ts staleTime). The trade-off: for the time a reader takes to answer, a command
  // or place it will leave out shows, then goes (the active row stays by its key; see the lists below). The probes go
  // when the palette closes, and so does this.
  const [hides, setHides] = useState<Readonly<Record<string, SearchHide>>>({});
  const onHide = useCallback((page: string, hide: SearchHide | null) => {
    // The list on screen is still the one from before this answer: React Aria marks its active row data-focused (the
    // focus is virtual, the caret stays in the field, so no focus event tells it).
    const rows = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    const row = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"][data-focused="true"]') ?? null;
    setWasActive((w) => w ?? { key: row?.dataset.key ?? null, top: row !== null && row === rows?.[0] });
    setHides((prev) => {
      if (hide === null) {
        if (!(page in prev)) return prev;
        const next = { ...prev };
        delete next[page];
        return next;
      }
      return JSON.stringify(prev[page]) === JSON.stringify(hide) ? prev : { ...prev, [page]: hide };
    });
  }, []);

  // The named things each page's navCount reader holds now (a named Board), by page id. Read only while text is typed,
  // like the hides above; the reader is the left menu's own (stored Boards: no request). The reader answers a render
  // after the text, so its rows can arrive on a list that had none (a pasted name, one letter): the answer is judged
  // like a searchHide's (which row was active then), and with no row active the new list's first row becomes the
  // active one, so Enter opens it.
  const [navItems, setNavItems] = useState<Readonly<Record<string, readonly NavItem[]>>>({});
  const onItems = useCallback((page: string, items: readonly NavItem[] | null) => {
    const rows = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    const row = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"][data-focused="true"]') ?? null;
    setWasActive((w) => w ?? { key: row?.dataset.key ?? null, top: row !== null && row === rows?.[0] });
    setNavItems((prev) => {
      if (items === null) {
        if (!(page in prev)) return prev;
        const next = { ...prev };
        delete next[page];
        return next;
      }
      return JSON.stringify(prev[page]) === JSON.stringify(items) ? prev : { ...prev, [page]: items };
    });
  }, []);

  // The entries of the pages this load serves, folded for the matcher once per page list and index, never per keystroke.
  const { pageEntries, commandEntries, prepared, deepPrepared } = useMemo(() => {
    const pageEntries: Entry[] = pages
      .filter((p) => p.nav)
      .map((p) => {
        const pt = makeT(p.strings);
        const key = Object.keys(JUMPS).find((k) => JUMPS[k] === p.id);
        const jump = key ? ['g', key] : undefined;
        const nav = p.nav ? pt(p.nav.label) : '';
        return { id: `page:${p.id}`, kind: 'page', label: pt(p.title), to: p.path, icon: p.nav?.icon ?? 'apps', keywords: `${p.id} ${nav}`, jump };
      });
    const commandEntries: Entry[] = pages.flatMap((p) => {
      const pt = makeT(p.strings);
      // A command that points into a page this load hides is left out (never a Not Found jump).
      return (p.commands ?? []).filter((c) => servesPath(pages, c.to ?? p.path)).map((c) => ({
        id: `cmd:${p.id}:${c.id}`,
        kind: 'command' as const,
        label: pt(c.label),
        to: c.to ?? p.path,
        // An action into the page: its own icon or an outline, never the page's filled brand icon (that marks the page).
        icon: c.icon ?? 'arrow-right',
        keywords: [p.id, ...(c.keywords ?? [])].join(' '),
        cmd: { page: p.id, id: c.id },
      }));
    });
    // The deep index names pages by id: only pages this load serves, and only places they serve.
    const byId = new Map(pages.map((p) => [p.id, p]));
    const deepEntries: Entry[] = deep.flatMap((d, i) => {
      const p = byId.get(d.page);
      if (!p) return [];
      const to = `${p.path}${d.to}`;
      if (!servesPath(pages, to)) return [];
      const title = makeT(p.strings)(p.title);
      return [{ id: `deep:${i}`, kind: d.kind, label: d.label, to, icon: DEEP_ICON[d.kind], keywords: '', under: d.under, body: d.words, where: d.under ? `${title} · ${d.under}` : title, deep: { page: d.page, tail: d.to } }];
    });
    return { pageEntries, commandEntries, prepared: [...pageEntries, ...commandEntries].map(prepare), deepPrepared: deepEntries.map(prepare) };
  }, [pages, deep]);
  // The computers the shell lists (the top bar's menu), found by name once text is typed: each opens that computer on
  // the Computers page. None while this load hides that page. A list the shell has not read adds no row and claims nothing.
  const { computers, signOut, realms, realmId, setRealm, switchingTo } = useShellData();
  const computerEntries = useMemo(
    () =>
      computers.flatMap((c) => {
        const to = computerHref(computerHandle(c));
        if (!c.name || !servesPath(pages, to)) return [];
        return [prepare<Entry>({ id: `computer:${c.id}`, kind: 'command', label: c.name, to, icon: 'hoody-virtual-server', keywords: '', where: t('top.computer') })];
      }),
    [computers, pages, t],
  );
  // The realms the shell lists (the realm menu's), found by name once text is typed: each switches to that realm
  // through the shell's one switch. Not the realm shown now; All realms only while one realm is shown. None for a
  // session that cannot switch (a token session pinned to its realm has no setRealm) or while a switch is under way.
  const realmEntries = useMemo(
    () =>
      !setRealm || switchingTo !== undefined || realms.length === 0
        ? []
        : [...(realmId === 'all' ? [] : [{ id: 'all', name: t('top.realmAll') }]), ...realms.filter((r) => r.id !== realmId && r.id !== 'all')].flatMap((r) =>
            r.name.trim() ? [prepare<Entry>({ id: `${REALM}${r.id}`, kind: 'command', label: r.name, to: '', icon: 'realm', keywords: '', where: t('top.realm') })] : [],
          ),
    [realms, realmId, setRealm, switchingTo, t],
  );
  // A page's own named things (a named Board), found by name once text is typed: each opens at the route its page gave
  // (at or below that page's path, checked by the probe). None for a page this load does not serve.
  const itemEntries = useMemo(
    () =>
      pages.flatMap((p) =>
        (navItems[p.id] ?? []).flatMap((it) =>
          servesPath(pages, it.to)
            ? [prepare<Entry>({ id: `item:${p.id}:${it.id}`, kind: 'command', label: it.label, to: it.to, icon: p.nav?.icon ?? 'arrow-right', keywords: '', where: makeT(p.strings)(p.title) })]
            : [],
        ),
      ),
    [pages, navItems],
  );
  // The current page's own commands (usePageShortcuts rows meant for the palette: not moving around),
  // first: they act on what is on screen. One item per row, shown with its first way to press it.
  const pageKeys = usePageShortcutGroups().flatMap((g) => g.rows.filter((r) => r.palette));
  // Get a computer, as the top bar's computer menu offers it: only while this load serves the Computers page and the
  // session may make one (a token session never has the account capability); not beside the Computers page's own
  // "Get a computer" key (This page). Sign out only where the shell has a sign-out (the account menu's rule).
  const mayGet = useCan('account');
  const getLabel = t('top.getComputer');
  const getEntry: Entry | null =
    mayGet && servesPath(pages, GET_COMPUTER_TO) && !pageKeys.some((r) => r.label === getLabel)
      ? { id: GET_COMPUTER, kind: 'command', label: getLabel, to: GET_COMPUTER_TO, icon: 'plus', keywords: 'new create add rent buy' }
      : null;
  const signOutEntry: Entry | null = signOut ? { id: SIGN_OUT, kind: 'command', label: t('account.signOut'), to: '', icon: 'logout', keywords: 'logout leave' } : null;
  // Read at each open (the palette renders again when it opens): a passcode set since the last open shows.
  const lockable = isOpen && lockSettings() !== null;
  const typed = query.trim();
  const results: Entry[] =
    typed === ''
      ? []
      : search(
          [
            // This page's keys act on what is on screen: first among equal matches.
            ...pageKeys.map((r) => prepare<Entry>({ id: `key:${r.id}`, kind: 'command', label: r.label, to: '', icon: 'arrow-right', keywords: '', jump: r.alts[0] })),
            ...(lockable ? [prepare<Entry>({ id: LOCK_NOW, kind: 'command', label: t('lock.now'), to: '', icon: 'lock', keywords: 'passcode' })] : []),
            ...(getEntry ? [prepare(getEntry)] : []),
            ...(signOutEntry ? [prepare(signOutEntry)] : []),
            ...prepared.filter((p) => !(p.item.cmd && hides[p.item.cmd.page]?.commands?.includes(p.item.cmd.id))),
            ...computerEntries,
            ...realmEntries,
            ...itemEntries,
            // Before the limit, so a place the page does not draw takes no row a drawn one would get.
            ...(typed.length < DEEP_FROM ? [] : deepPrepared.filter((p) => !(p.item.deep && hidesTail(hides[p.item.deep.page], p.item.deep.tail)))),
          ] satisfies Prepared<Entry>[],
          typed,
          RESULTS,
        );
  // The empty field's Commands: the pages' commands their searchHide does not name now.
  const shownCommands = commandEntries.filter((e) => !(e.cmd && hides[e.cmd.page]?.commands?.includes(e.cmd.id)));
  // A page's searchHide (or its named things) answering rebuilds the results. The active row keeps its place by its key when it is still
  // listed: a row the person arrowed to stays the one Enter acts on. A new list, its first row active, only when that
  // row is gone (React Aria would leave no row active), or when the active row was the first one and another is first
  // now (the best match stays the one Enter acts on, as when the text changes). The empty field has no best match and
  // makes no row active: its list is rebuilt only when the row the person arrowed to is gone (left out now), and that
  // new list starts on its first row, as a typed one does (the field would otherwise still name the gone row).
  if (wasActive !== null) {
    setWasActive(null);
    const first = results[0]?.id;
    const kept =
      typed === ''
        ? wasActive.key === null || !wasActive.key.startsWith('cmd:') || shownCommands.some((e) => e.id === wasActive.key)
        : wasActive.key !== null && (wasActive.top ? first === wasActive.key : results.some((e) => e.id === wasActive.key));
    if (!kept) {
      setRebuilt((n) => n + 1);
      if (typed === '') setEmptyFirst(rebuilt + 1);
    }
  }
  const all = new Map([...pageEntries, ...commandEntries, ...deepPrepared.map((p) => p.item), ...computerEntries.map((p) => p.item), ...itemEntries.map((p) => p.item), ...(getEntry ? [getEntry] : [])].map((e) => [e.id, e]));

  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={onOpenChange} isDismissable className={s.overlay}>
      <Modal className={s.modal}>
        <Dialog className={s.dialog} aria-label={t('palette.label')}>
          {/* Draw nothing: they read, while the palette is open, what each page's view leaves out now. */}
          <SearchHideProbes pages={pages} onHide={onHide} />
          {typed !== '' && <NavItemsProbes pages={pages} onItems={onItems} />}
          {/* No filter here: the list below is already the search's, in its order. */}
          <Autocomplete inputValue={query} onInputChange={setQuery}>
            {/* Escape in a field with text is the search field's own clear; the palette closes on that same press
                (otherwise it would take two presses). An empty field's Escape closes it through the overlay, as before. */}
            {/* The palette exists to be typed into: focus its field on open. */}
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <SearchField className={s.field} aria-label={t('palette.label')} autoFocus onClear={() => onOpenChange(false)}>
              <Icon name="search" className={s.fieldIcon} />
              <Input className={s.input} placeholder={t('palette.placeholder')} />
            </SearchField>
            {/* Phones get the palette full screen with no scrim or Esc to leave by: a Close button. */}
            <span className={s.close}>
              <IconButton icon="x" label={t('palette.close')} onPress={() => onOpenChange(false)} />
            </span>
            {/* Whenever the field holds text, its first match is the active row, so Enter acts on it. React Aria makes the
                first match active only when typing forward changes the list; a letter that leaves the list as it was, a
                Backspace or a paste leaves no row active and Enter does nothing. A new list per text, focusing its first row,
                covers every way the text changes. A page's searchHide answering
                keeps the active row by its key, or makes a new list when it must (above). */}
            <Menu
              ref={menuRef}
              key={`${query}\n${rebuilt}`}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- the active row is virtual: the caret stays in the field
              autoFocus={query === '' && emptyFirst !== rebuilt ? undefined : 'first'}
              className={s.menu}
              renderEmptyState={() => <div className={s.empty}>{t('palette.empty')}</div>}
              onAction={(key) => {
                const k = String(key);
                if (k === LOCK_NOW) {
                  onOpenChange(false);
                  lockNow();
                  return;
                }
                if (k === SIGN_OUT) {
                  onOpenChange(false);
                  // After the palette has closed, so the sign-out's own question can open.
                  requestAnimationFrame(() => signOut?.());
                  return;
                }
                if (k.startsWith(REALM)) {
                  onOpenChange(false);
                  // After the palette has closed, so the switch's own line (and its check) is what the person sees.
                  requestAnimationFrame(() => setRealm?.(k.slice(REALM.length)));
                  return;
                }
                if (k.startsWith('key:')) {
                  onOpenChange(false);
                  // After the palette has closed, so the page's own overlay can open.
                  requestAnimationFrame(() => runPageShortcut(k.slice(4)));
                  return;
                }
                const e = all.get(k);
                if (!e) return;
                onOpenChange(false);
                // A command to another section of the page already open leaves the scroll alone: the router's reset or restore
                // would undo the landing the page makes on that section itself (the AI page's "See what AI cost").
                const [path = '', query = ''] = e.to.split('#')[0]!.split('?');
                go(e.to, { keepScroll: path === pathname && new URLSearchParams(query).has('section') });
              }}
            >
              {typed !== '' && results.length > 0 && (
                <MenuSection className={s.section}>
                  <Header className={s.sectionHead}>{t('palette.results')}</Header>
                  {results.map((e) => (
                    <MenuItem key={e.id} id={e.id} textValue={e.label} className={s.item}>
                      <Icon name={e.icon} />
                      {e.where ? (
                        <span className={s.itemText}>
                          <span className={s.itemLabel}>{e.label}</span>
                          <span className={s.where}>{e.where}</span>
                        </span>
                      ) : (
                        <span className={s.itemLabel}>{e.label}</span>
                      )}
                      {e.jump && (
                        <span className={s.keys} aria-hidden="true">
                          {e.jump.map((k) => (
                            <Kbd key={k}>{k}</Kbd>
                          ))}
                        </span>
                      )}
                    </MenuItem>
                  ))}
                </MenuSection>
              )}
              {typed === '' && pageKeys.length > 0 && (
                <MenuSection className={s.section}>
                  <Header className={s.sectionHead}>{t('palette.page')}</Header>
                  {pageKeys.map((r) => (
                    <MenuItem key={`key:${r.id}`} id={`key:${r.id}`} textValue={r.label} className={s.item}>
                      <Icon name="arrow-right" />
                      <span className={s.itemLabel}>{r.label}</span>
                      <span className={s.keys} aria-hidden="true">
                        {(r.alts[0] ?? []).map((k) => (
                          <Kbd key={k}>{k}</Kbd>
                        ))}
                      </span>
                    </MenuItem>
                  ))}
                </MenuSection>
              )}
              {typed === '' && pageEntries.length > 0 && (
                <MenuSection className={s.section}>
                  <Header className={s.sectionHead}>{t('palette.pages')}</Header>
                  {pageEntries.map((e) => (
                    <MenuItem key={e.id} id={e.id} textValue={`${e.label} ${e.keywords}`} className={s.item}>
                      <Icon name={e.icon} />
                      <span className={s.itemLabel}>{e.label}</span>
                      {e.jump && (
                        <span className={s.keys} aria-hidden="true">
                          {e.jump.map((k) => (
                            <Kbd key={k}>{k}</Kbd>
                          ))}
                        </span>
                      )}
                    </MenuItem>
                  ))}
                </MenuSection>
              )}
              {typed === '' && (shownCommands.length > 0 || lockable || getEntry !== null || signOutEntry !== null) && (
                <MenuSection className={s.section}>
                  <Header className={s.sectionHead}>{t('palette.commands')}</Header>
                  {lockable && (
                    <MenuItem key={LOCK_NOW} id={LOCK_NOW} textValue={t('lock.now')} className={s.item}>
                      <Icon name="lock" />
                      <span className={s.itemLabel}>{t('lock.now')}</span>
                    </MenuItem>
                  )}
                  {/* The pages' commands, then the shell's own: Get a computer, Sign out. */}
                  {[...shownCommands, ...(getEntry ? [getEntry] : []), ...(signOutEntry ? [signOutEntry] : [])].map((e) => (
                    <MenuItem key={e.id} id={e.id} textValue={`${e.label} ${e.keywords}`} className={s.item}>
                      <Icon name={e.icon} />
                      <span className={s.itemLabel}>{e.label}</span>
                    </MenuItem>
                  ))}
                </MenuSection>
              )}
            </Menu>
          </Autocomplete>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
