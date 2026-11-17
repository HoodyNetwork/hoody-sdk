// The realm and computer switchers and the account menu, in a terminal: the web's rules (Switchers.tsx) over the same
// shell data (useShellData), drawn as top-bar triggers. Each trigger opens its menu, which the shell draws at its root
// over the page (src/term/shell/Menus.tsx); Alt+R and Alt+C open them through the keymap. What a menu lists and what
// its rows do is in Menus.tsx, rule for rule with the web's menus.
// PhoneContext (the web's phone chip) draws nothing: a narrow terminal keeps both switchers in the top bar, shortened.
import { useEffect } from 'react';
import type * as Web from './Switchers';
import { useStrings } from '@kit/strings';
import { initials, switchTarget, useShellData } from './context';
import { shownRealmName } from './realmName';
import { useCan } from '@core';
import { usePageLink } from './pageLinks';
import strings from './strings.en.json';
import { Pressable, Text } from '../term/prim';
import { cellWidth } from '../term/prim/TableCells';
import { focusMark } from '../term/prim/FocusInk';
import { openMenu, registerSwitcher, setAccountShortcuts, switcherShown, toggleMenu, useOpenMenu, useSwitcherShown } from '../term/shell/menus-store';

/** Opens the computer switcher, as Alt+C does. Without a mounted switcher it does nothing (useComputerSwitcherReady). */
export const openComputerSwitcher: typeof Web.openComputerSwitcher = () => {
  if (switcherShown('computer')) openMenu('computer');
};

export const useComputerSwitcherReady: typeof Web.useComputerSwitcherReady = () => useSwitcherShown('computer');

/** A realm label up to this many cells is never cut: a long computer name beside it takes the loss (at 80 columns the
 *  bar drew `◆ 0123…ef` beside `● my-computer-copy…`). A longer realm name shrinks like the computer's. */
const REALM_KEEP_CELLS = 16;

/** One top-bar trigger: the words cut with "…" when the bar is short; the caret after them never does (a cut trigger
 *  lost its ▾ and no longer read as a menu). `keep`: the trigger keeps its whole width. */
function Trigger({ label, caret, name, open, onPress, colour, keep = false }: { label: string; caret?: string; name?: string; open: boolean; onPress: () => void; colour?: 'ink' | 'muted'; keep?: boolean }) {
  return (
    <Pressable dir="row" onPress={onPress} shrink={keep ? 0 : 1} sem={{ role: 'button', expanded: open, ...(name ? { name } : {}) }}>
      {({ focused }) => {
        const fg = focused ? 'blueInk' : (colour ?? 'ink');
        const bg = focused ? 'blue' : open ? 'selected' : undefined;
        return (
          <>
            <Text colour={fg} bg={bg} truncate shrink={1} {...focusMark(focused)}>{label}</Text>
            {caret ? <Text colour={fg} bg={bg} shrink={0} truncate={false} {...focusMark(focused)}>{caret}</Text> : null}
          </>
        );
      }}
    </Pressable>
  );
}

export const RealmSwitcher: typeof Web.RealmSwitcher = () => {
  const t = useStrings(strings);
  const data = useShellData();
  const open = useOpenMenu() === 'realm';
  const canNew = useCan('account') && !!data.setRealm;
  const shows = data.realms.length > 0 || canNew;
  useEffect(() => (shows ? registerSwitcher('realm') : undefined), [shows]);
  // An account with no realm yet still gets the menu when it can make one.
  if (!shows) return null;
  const going = switchTarget(data, t('top.realmAll'));
  const name = shownRealmName(data, t('top.realmAll'), t('top.realmThis'));
  // While core checks a picked realm the trigger keeps the realm the page shows and marks the switch.
  const label = going ? `◆ ${name} ⟳ ${going.name ?? '…'}` : `◆ ${name}`;
  return <Trigger label={label} caret={going ? undefined : ' ▾'} keep={cellWidth(label) <= REALM_KEEP_CELLS} open={open} onPress={() => toggleMenu('realm')} />;
};

export const ComputerSwitcher: typeof Web.ComputerSwitcher = () => {
  const t = useStrings(strings);
  const data = useShellData();
  const open = useOpenMenu() === 'computer';
  const getLink = usePageLink('computers');
  const canGet = useCan('account') && !!getLink;
  const current = data.computers.find((c) => c.id === data.computerId);
  const any = data.computers.length > 0;
  const read = any ? undefined : data.computersRead;
  const shows = any || canGet || (read !== undefined && !!data.retryComputers);
  useEffect(() => (shows ? registerSwitcher('computer') : undefined), [shows]);
  if (!shows) return null;
  const name = current?.name
    ?? t(read === 'loading' ? 'top.computerLoading' : read === 'unknown' ? 'top.computerNotLoaded' : !any ? 'top.computerNoneYet' : data.computerId ? 'top.computerUnlisted' : 'top.computerAll');
  // The run state is a mark, never colour alone: ● running, ○ not running. The country flag is left out: terminals
  // disagree on a flag's width (two cells, or two letters), which would shift the rest of the bar.
  const mark = current ? (current.running ? '● ' : '○ ') : read === 'loading' ? '… ' : '';
  return <Trigger label={`${mark}${name}`} caret=" ▾" open={open} onPress={() => toggleMenu('computer')} />;
};

export const AccountMenu: typeof Web.AccountMenu = ({ onOpenShortcuts }) => {
  const data = useShellData();
  const open = useOpenMenu() === 'account';
  useEffect(() => registerSwitcher('account'), []);
  // The menu's Keyboard shortcuts row runs this (the web menu's 'keys' item); without one the shell's own sheet opens.
  useEffect(() => setAccountShortcuts(onOpenShortcuts ?? null), [onOpenShortcuts]);
  const t = useStrings(strings);
  return <Trigger label={`[${initials(data.account?.name)}]`} name={t('top.account')} open={open} onPress={() => toggleMenu('account')} colour="muted" keep />;
};

export const PhoneContext: typeof Web.PhoneContext = () => null;
