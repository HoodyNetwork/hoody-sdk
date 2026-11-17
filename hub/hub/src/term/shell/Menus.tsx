// The shell's menus, drawn at the shell root over the page when open (menus-store.ts): the realm and computer
// switchers and the account menu with the web's rows and rules (shell/Switchers.tsx), and the page list of a narrow
// terminal (the web's phone drawer). Rows are picked with the arrows and Enter, or a click; Esc closes.
// Left out here (web has them): Rename realms (its dialog is not ported), the theme and performance rows of the account
// menu (a terminal has neither).
import { useEffect, useState } from 'react';
import { useCan } from '@core';
import { lockNow, lockSettings } from '@core/shell';
import type { PageManifest } from '@kit/page';
import { HUB_LOCALE, localeName } from '@kit/locales';
import { makeT, useStrings } from '@kit/strings';
import { useShellData } from '../../shell/context';
import { useRenameRealms } from '@kit/realmRename';
import { realmHex } from './realmColour';
import { navEntries } from '../../shell/nav';
import { OPEN_REALM } from '../../shell/realmParam';
import { usePageLink, useServedPage, useServedPageLink } from '../../shell/pageLinks';
import shellStrings from '../../shell/strings.en.json';
import strings from './strings.en.json';
import { firstPickable, LineView, listMove, Modal, PickList, type PickItem, useLineEdit, MODAL_HEAD_ROWS } from './layer';
import type { HubKey } from './hubKey';
import { accountShortcuts, closeMenu, useOpenMenu } from './menus-store';
import { fold } from '../../shell/search/match';
import { navLabel, useBadge, useGroupLabel } from './Sidebar';
import { useTerminalSize } from '../prim';

/** Above this many realms the realm menu has a search line (the web's PickerPanel SEARCH_ABOVE). */
export const SEARCH_ABOVE = 7;

interface Row extends PickItem { run: () => void }

/** One menu: a list of rows, an optional search line filtering the rows marked `filter`. */
function MenuFrame({ title, rows, open, search, initial, width = 56 }: { title: string; rows: Row[]; open: boolean; search?: { placeholder: string; filter: (r: Row, q: string) => boolean; none: string }; initial?: string; width?: number }) {
  const t = useStrings(strings);
  const { height } = useTerminalSize();
  const edit = useLineEdit();
  const q = edit.value.trim();
  const shown = search && q ? rows.filter((r) => search.filter(r, q)) : rows;
  const list: Row[] = shown.length > 0 || !search ? shown : [{ id: 'none', label: search.none, disabled: true, run: () => {} }];
  const start = Math.max(0, list.findIndex((r) => r.id === initial));
  const [active, setActive] = useState(start);
  useEffect(() => { if (open) { edit.set(''); setActive(Math.max(0, firstPickable(list, start))); } }, [open]);
  useEffect(() => { if (q) setActive(firstPickable(list)); }, [q]);
  const at = active < list.length && !list[active]?.disabled ? active : firstPickable(list);
  const pick = (i: number) => {
    const r = list[i];
    if (!r || r.disabled) return;
    closeMenu();
    r.run();
  };
  const onKey = (k: HubKey) => {
    if (k.key === 'Escape') { if (edit.value) edit.set(''); else closeMenu(); return; }
    if (k.key === 'Enter') { pick(at); return; }
    const moved = listMove(k, at, list);
    if (moved !== null) { setActive(moved); return; }
    if (search) edit.onKey(k);
  };
  if (!open) return null;
  return (
    <Modal onKey={onKey} title={title} width={width} onClose={closeMenu} footer={t('menu.hint')} frame="single">
      {search && <LineView edit={edit} placeholder={search.placeholder} />}
      <PickList items={list} active={at} onPick={pick} onHover={setActive} rows={Math.max(3, Math.min(14, height - 8 - MODAL_HEAD_ROWS))} />
    </Modal>
  );
}

const contains = (text: string, q: string) => fold(text).includes(fold(q));

function RealmMenu({ go }: { go: (to: string) => void }) {
  const t = useStrings(shellStrings);
  const data = useShellData();
  const open = useOpenMenu() === 'realm';
  const current = data.realms.find((r) => r.id === data.realmId);
  const keys = useServedPageLink('keys');
  const realmsPage = useServedPageLink('realms');
  const account = useCan('account');
  useEffect(() => { if (open) data.refreshRealms?.(); }, [open]);
  const rows: Row[] = [];
  if (data.setRealm && data.realms.length > 0) rows.push({ id: 'all', label: t('top.realmAll'), checked: data.realmId === 'all', run: () => data.setRealm?.('all') });
  for (const r of data.realms) {
    rows.push({ id: r.id, label: r.name, ...(realmHex(r.color) ? { swatch: realmHex(r.color)! } : {}), checked: r.id === data.realmId, ...(typeof r.computers === 'number' ? { detail: t('top.realmComputers', { count: r.computers }) } : {}), run: () => data.setRealm?.(r.id) });
  }
  const share = keys && account && data.realms.length > 0 ? `${keys.href}/shared?share=1${current ? `&${OPEN_REALM}=${encodeURIComponent(current.id)}` : ''}` : null;
  const newLink = realmsPage && account && data.setRealm ? realmsPage.href : null;
  const footer: Row[] = [];
  if (share) footer.push({ id: 'hub:share', label: t(current ? 'top.shareRealm' : 'top.shareARealm'), run: () => go(share) });
  if (newLink) footer.push({ id: 'hub:new', label: '+ ' + t('top.newRealm'), run: () => go(newLink) });
  if (footer[0]) footer[0] = { ...footer[0], section: '—' };
  // Rename realms ends the realm list in a section of its own (as the web Switchers do), above the footer.
  const rename = useRenameRealms();
  if (rename && data.realms.length > 0) rows.push({ id: 'hub:rename-realms', label: t('top.renameRealms'), section: '—', run: () => rename() });
  return (
    <MenuFrame
      title={t('top.realm')}
      open={open}
      initial={data.realmId}
      rows={[...rows, ...footer]}
      {...(data.realms.length > SEARCH_ABOVE ? { search: { placeholder: t('top.realmSearch'), none: t('top.realmNoMatch'), filter: (r: Row, q: string) => r.id.startsWith('hub:') || contains(r.label, q) } } : {})}
    />
  );
}

function ComputerMenu({ go }: { go: (to: string) => void }) {
  const t = useStrings(shellStrings);
  const data = useShellData();
  const open = useOpenMenu() === 'computer';
  const page = usePageLink('computers');
  const getLink = useCan('account') && page ? `${page.href}?get=1` : null;
  const any = data.computers.length > 0;
  const read = any ? undefined : data.computersRead;
  const rows: Row[] = [];
  if (any && data.clearComputer) rows.push({ id: 'hub:all', label: t('top.computerAll'), checked: !data.computerId, run: () => data.clearComputer?.() });
  for (const c of data.computers) {
    rows.push({
      id: c.id,
      // The run state is a mark: ● running, ○ not running.
      // No country flag: its width differs between terminals (see Switchers.term.tsx).
      label: `${c.running ? '●' : '○'} ${c.name}`,
      checked: c.id === data.computerId,
      ...(c.location ? { detail: c.location } : {}),
      run: () => data.setComputer?.(c.id),
    });
  }
  if (read === 'loading') rows.push({ id: 'hub:loading', label: t('top.computerLoading'), disabled: true, run: () => {} });
  if (read === 'unknown' && data.retryComputers) rows.push({ id: 'hub:retry', label: '↻ ' + t('top.computerRetry'), run: () => void data.retryComputers?.() });
  if (getLink) rows.push({ id: 'hub:get', label: '+ ' + t('top.getComputer'), section: '—', run: () => go(getLink) });
  return <MenuFrame title={t('top.computer')} open={open} initial={data.computerId ?? 'hub:all'} rows={rows} />;
}

function AccountMenuOverlay({ go, onShortcuts, onLeave }: { go: (to: string) => void; onShortcuts: () => void; onLeave: () => void }) {
  const t = useStrings(shellStrings);
  const tt = useStrings(strings);
  const data = useShellData();
  const open = useOpenMenu() === 'account';
  const settings = usePageLink('account');
  const billing = usePageLink('billing');
  const earn = usePageLink('referrals');
  const guide = usePageLink('guide');
  const supportPage = useServedPage('support');
  const support = usePageLink('support');
  const rows: Row[] = [];
  if (data.account) rows.push({ id: 'head', label: data.account.name, ...(data.account.detail ? { detail: data.account.detail } : {}), disabled: !settings, run: () => settings && go(settings.href) });
  if (settings) rows.push({ id: 'settings', label: t('account.settings'), section: '—', run: () => go(settings.href) });
  if (billing) rows.push({ id: 'billing', label: t('account.billing'), run: () => go(billing.href) });
  if (earn) rows.push({ id: 'earn', label: t('account.earn'), run: () => go(earn.href) });
  if (guide) rows.push({ id: 'connect', label: t('account.connect'), run: () => go(`${guide.href}#connect`) });
  if (supportPage && support) rows.push({ id: 'support', label: makeT(supportPage.strings)(supportPage.nav?.label ?? supportPage.title), run: () => go(support.href) });
  // The language in use, as the web menu's Language row names it; nothing to choose yet, so the row is not a choice.
  rows.push({ id: 'language', label: t('account.language'), detail: tt('account.languageSoon', { name: localeName(HUB_LOCALE) }), section: '—', disabled: true, run: () => {} });
  rows.push({ id: 'keys', label: t('account.shortcuts'), keys: ['?'], run: () => (accountShortcuts() ?? onShortcuts)() });
  if (open && lockSettings()) rows.push({ id: 'lock', label: t('lock.now'), run: () => lockNow() });
  // The terminal never signs the CLI out: the item leaves the Hub, as q does (asking first when
  // something is at stake). Signing out stays `hoody logout`.
  rows.push({ id: 'leave', label: tt('account.leave'), run: () => onLeave() });
  return <MenuFrame title={t('top.account')} open={open} rows={rows} initial={settings ? 'settings' : 'keys'} />;
}

/** The page list of a narrow terminal (`[` or the ≡ trigger): the sidebar's entries, in its order and groups, with its
 *  badges (the unread notices, the Bots waiting) after the label. Below SIDEBAR_MIN_COLS the sidebar is hidden and the
 *  top bar has no bell, so this list is where the counts show. */
function NavMenu({ pages, current, go }: { pages: readonly PageManifest[]; current: string | undefined; go: (to: string) => void }) {
  const t = useStrings(strings);
  const open = useOpenMenu() === 'nav';
  const groupLabel = useGroupLabel();
  const badge = useBadge();
  let group = '';
  // The sidebar's order: by group (main, build, account, help), then the group's own order.
  const rank = { main: 0, build: 1, account: 2, help: 3 } as const;
  const entries = navEntries(pages).map((e, i) => ({ e, i })).sort((a, b) => rank[a.e.group] - rank[b.e.group] || a.i - b.i).map((x) => x.e);
  const rows: Row[] = entries.map((e) => {
    // A new group starts a section: its sidebar title, or a plain rule where the sidebar has none.
    const section = e.group !== group && group !== '' ? (groupLabel(e.group) ?? '—') : undefined;
    group = e.group;
    const count = badge(e.page);
    return { id: e.page.id, label: navLabel(e.page), checked: e.page.id === current, ...(count ? { detail: count } : {}), ...(section ? { section } : {}), run: () => go(e.page.path) };
  });
  return <MenuFrame title={t('nav.title')} open={open} rows={rows} initial={current} width={40} />;
}

/** Every shell menu; only the open one draws. */
export function Menus({ pages, current, go, onShortcuts, onLeave }: { pages: readonly PageManifest[]; current: string | undefined; go: (to: string) => void; onShortcuts: () => void; onLeave: () => void }) {
  return (
    <>
      <RealmMenu go={go} />
      <ComputerMenu go={go} />
      <AccountMenuOverlay go={go} onShortcuts={onShortcuts} onLeave={onLeave} />
      <NavMenu pages={pages} current={current} go={go} />
    </>
  );
}
