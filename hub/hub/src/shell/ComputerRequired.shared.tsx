// The shared body of shell/ComputerRequired.tsx (web) and shell/ComputerRequired.term.tsx (terminal): which state shows
// and with which words and way out. Each side only wraps the result: the web in a PageFrame or a plain block, the
// terminal in a PageFrame or a column box.
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useCan } from '@core';
import { Button } from '@kit/controls/Button';
import type { PageHeaderProps } from '@kit/layouts/PageHeader';
import { useGo } from '@kit/nav';
import { EmptyState, ErrorState, Skeleton } from '@kit/states/States';
import { type Translate, useStrings } from '@kit/strings';
import { type ShellData, useInShell, useShellData } from './context';
import { followPageLink, type PageLink, usePageLink } from './pageLinks';
import { openComputerSwitcher, useComputerSwitcherReady } from './Switchers';
import strings from './strings.en.json';

interface ComputerRequiredBase {
  /** none: no computer chosen · stopped: the chosen one is not running · failed: reading it failed. none shows as
   *  loading, or as not loaded with Try again, until the shell's computer list is known (C9). A known list with no
   *  computer at all is not "none": it says there are none yet, with Get a computer (or, in a realm that is empty
   *  while other realms hold computers, Show all realms); the page's title, body and action are for the pick. */
  state: 'none' | 'stopped' | 'failed';
  /** The computer's name, for the stopped title. */
  name?: string;
  /** The page's own words; each state has a default. `body={null}`: no body. */
  title?: string;
  body?: ReactNode;
  /** Replaces Open Computers (stopped) or adds an action (none). Pass null for none. */
  action?: ReactNode;
  /** The page's own content that stays at the top while it waits for a computer (Scripts' builds in this browser):
   *  under the header, above the state. */
  top?: ReactNode;
  /** failed: Try again. */
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}
/** A page: its own header in a PageFrame (`header`). `inline`: a host that is not a page (a pane in a drawer): the state
 *  alone, no PageFrame and no PageHeader, so no h1 of its own; the host's section sets the heading level (inside a strict
 *  section the state's title is not a heading). The list's loading and not-loaded states are the same either way. */
export type ComputerRequiredProps = ComputerRequiredBase &
  (
    | { inline?: false; /** The page's own header, so the state lines up with the page it stands in for. */ header: PageHeaderProps }
    | { inline: true; header?: never }
  );

/** The state to draw under the header (or alone, inline). */
export function useComputerRequiredContent(props: ComputerRequiredProps): ReactNode {
  const { state, name, title, body, action, onRetry, retrying } = props;
  const t = useStrings(strings);
  const go = useGo();
  const computers = usePageLink('computers');
  const switcher = useComputerSwitcherReady();
  const shell = useShellData();
  const inShell = useInShell();
  const mayCreate = useCan('account');
  const canPick = shell.computers.length > 0 && switcher;
  // none needs a known list (C9): while the shell's list loads it reads as loading, and a failed read as not loaded
  // with the shell's Try again, never "No computer selected". The person's Try again keeps that button on screen,
  // busy, through its own read (focus stays on it); any other read shows loading. The attempt ends when its read is
  // seen ending, or when the retry's promise settles while no loading shows: a read that failed before any loading
  // render was seen. A promise that settles while loading still shows leaves the end to that read (no flash).
  const read = state === 'none' ? shell.computersRead : undefined;
  const [askedAgain, setAskedAgain] = useState(false);
  const attempt = useRef(0);
  const shown = useRef(read);
  useEffect(() => {
    shown.current = read;
    if (read !== 'loading') setAskedAgain(false);
  }, [read]);
  const retry = shell.retryComputers;
  const retryHere = (run: () => unknown) => {
    const me = ++attempt.current;
    setAskedAgain(true);
    const p = run();
    if (p instanceof Promise) void p.finally(() => { if (attempt.current === me && shown.current !== 'loading') setAskedAgain(false); });
  };

  if (read === 'unknown' || (read === 'loading' && askedAgain)) {
    const again = retry ? { onRetry: () => retryHere(retry), retrying: read === 'loading' } : {};
    return <ErrorState title={t('top.computerNotLoaded')} body={t('cr.list.failedBody')} {...again} />;
  }
  if (read === 'loading') return <Skeleton rows={4} />;
  if (state === 'failed') {
    return <ErrorState {...(title !== undefined ? { title } : {})} {...(body !== undefined ? { body } : {})} {...(onRetry ? { onRetry } : {})} {...(retrying ? { retrying } : {})} />;
  }
  if (state === 'stopped') {
    // The default body names Computers only when its button is there.
    const showsOpen = action === undefined && computers !== null;
    const open = showsOpen ? <Button onPress={() => followPageLink(computers, go)}>{t('cr.openComputers')}</Button> : undefined;
    return (
      <EmptyState
        icon="computer"
        title={title ?? (name ? t('cr.stopped.titleNamed', { name }) : t('cr.stopped.title'))}
        body={body === undefined ? (showsOpen ? t('cr.stopped.body') : t('cr.stopped.bodyNoLink')) : (body ?? undefined)}
        action={action === undefined ? open : (action ?? undefined)}
      />
    );
  }
  // No computer at all in what the top bar lists: not a pick; the page's pick words give way to the shell's.
  const none = inShell && shell.computers.length === 0 ? noComputersYet(t, shell, mayCreate, computers, go) : null;
  // With a computer to pick, the way out is the pick itself, in place.
  const pick = action === undefined && canPick ? <Button onPress={openComputerSwitcher}>{t('cr.pickComputer')}</Button> : undefined;
  return (
    <EmptyState
      icon="computer"
      title={none ? none.title : (title ?? t('cr.none.title'))}
      body={none ? none.body : body === undefined ? t('cr.none.body') : (body ?? undefined)}
      action={none ? (none.way ? <Button variant="primary" onPress={none.way.press}>{none.way.label}</Button> : undefined) : action === undefined ? pick : (action ?? undefined)}
    />
  );
}

/** The known computer list is empty: what the top bar lists has no computer at all. In one realm that says only that
 *  this realm is empty (a computer in no realm counts for no realm, so the other realms' counts cannot prove the account
 *  has none), with All realms as the way out where the session may switch. "None yet" is said only for All realms: its
 *  way out is the Computers page's Get a computer drawer; a session that cannot create a computer (a token session never
 *  has the account capability) or a load without Computers gets the words alone, never a dead button. */
function noComputersYet(
  t: Translate<typeof strings>,
  shell: ShellData,
  mayCreate: boolean,
  computers: PageLink | null,
  go: (to: string) => void,
): { title: string; body: string; way?: { label: string; press: () => void } } {
  const setRealm = shell.setRealm;
  if (shell.realmId !== 'all') {
    if (!setRealm) return { title: t('cr.emptyRealm.title'), body: t('cr.emptyRealm.bodyPinned') };
    return { title: t('cr.emptyRealm.title'), body: t('cr.emptyRealm.body'), way: { label: t('cr.showAllRealms'), press: () => setRealm('all') } };
  }
  const get = mayCreate && computers ? { kind: computers.kind, href: `${computers.href}?get=1` } : null;
  return {
    title: t('cr.empty.title'),
    body: t(mayCreate ? 'cr.empty.body' : 'cr.empty.bodyCannot'),
    ...(get ? { way: { label: t('cr.getComputer'), press: () => followPageLink(get, go) } } : {}),
  };
}
