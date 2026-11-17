// Core's notices, shown by the shell.
// - Realm: gone → warn toast; one kept from the last visit that the realm list no longer has (core's
//   `restored: true`) → its own warn toast; switch failed → error toast naming both realms, with Try again (a switch
//   only reads and re-shows, so it may be asked again). A realm-gone sent before CoreNotices mounts (boot) shows
//   when it mounts.
// - A change that may have gone through (C9): one sticky "unknown" toast per context, never a retry,
//   and only when no page shows that outcome itself.
// - Lifecycle: suspended → the suspended screen in place of the page (support, Notifications, sign out);
//   on the Notifications or Account view its links open, the screen gives way to a banner with Sign
//   out, so those views stay usable; purge-failed → a blocking panel (sign-out could not clear this device: close the tab / try again; a token
//   session's Try again ends it again with its own reason, a sign-out's is logout() again; a sign-out's panel also
//   names the live sends that sign-out kept stored, signOut.tsx useSendsKeptAtSignOut);
//   token panels (offline, network) → a banner; token notices → toasts.
// - A newer Hub build replaced this tab's chunks (shell/staleChunk.ts) → the "Hub was updated" banner with Reload; a
//   part that could not load for another reason → a neutral banner with Reload. Not while a panel above shows (the
//   offline banner has its own Reload; the screens cover the app).
import { useEffect, useState } from 'react';
import { Button } from '@kit/controls/Button';
import { Link } from '@kit/controls/Link';
import { showToast } from '@kit/states/Toast';
import { makeT, type Translate, useStrings } from '@kit/strings';
import permStrings from '@kit/states/strings.en.json';
import { useCore } from '@core';
import { endTokenSession, logout, onLifecycle, onPending, onRealmNotice, onTeardown, realmName, type LifecycleEvent, type RealmNotice, type TokenPanel } from '@core/shell';
import { type PageLink, segment, usePageLink } from './pageLinks';
import { requestSignOut, useSendsKeptAtSignOut } from './signOut';
import strings from './strings.en.json';
import { useStaleChunkNotice } from './staleChunk';
import { startSwitch } from './switchOp';
import s from './notices.module.css';

type T = Translate<typeof strings>;

// A permission leaf's words (perm.<leaf>.do / .right): the kit's, so a page's error line and this toast say the same.
const kt = makeT(permStrings);

function nameOf(t: T, id: string): string {
  const n = realmName(id);
  return n.kind === 'alias' || n.kind === 'short' ? n.text : n.kind === 'all' ? t('top.realmAll') : t('notice.noRealm');
}

type RealmGone = Extract<RealmNotice, { kind: 'realm-gone' }>;

function realmGoneToast(t: T, n: RealmGone): void {
  // `restored`: the realm kept from the last visit is not on the realm list now (core opened All realms).
  if (n.restored === true)
    showToast({ tone: 'warn', title: t('notice.realmNotRestored'), body: t('notice.realmNotRestoredBody') });
  else showToast({ tone: 'warn', title: t('notice.realmGone'), body: t('notice.realmGoneBody') });
}

// At boot core's realm list can answer while saved preferences open (core-boot waits up to 2 s for them before the
// first render), and core keeps no notice for a later listener. This module loads with core-boot, before boot starts,
// so it keeps the latest realm-gone sent while no CoreNotices is mounted and the next one to mount shows it.
let earlyGone: RealmGone | null = null;
let noticesMounted = 0;
onRealmNotice((n) => {
  if (noticesMounted === 0 && n.kind === 'realm-gone') earlyGone = n;
});
// A teardown (the account ends, sign-out, suspension, a committed switch) makes a kept warning stale. Core's
// fallbacks send realm-gone without one, so a fresh warning is never dropped by its own fallback.
onTeardown(() => {
  earlyGone = null;
});

/** How long a page has to render its own outcome for a change before the shell toasts it. */
export const PENDING_SETTLE_MS = 600;

/** A page (not a toast) shows a "may have gone through" outcome (kit outcomes carry data-outcome="pending"). */
function pageShowsPending(): boolean {
  return Array.from(document.querySelectorAll('[data-outcome="pending"]')).some(
    (el) => !(el.getAttribute('role') === 'alertdialog' && el.closest('[role="region"]')),
  );
}

/** How a failed token-session purge started: its Try again ends the session again the same way. */
type TokenAgain = Extract<TokenPanel, { panel: 'purgeFailed' }>['again'];
// purge-failed: `again` set when a token session's end failed to purge (retry with that reason); unset when a
// sign-out's purge failed (retry is logout() again).
// `boot`: the panel a live boot ended in (no sign-out of this page led to it, so it names no kept sends).
type Panel = { kind: 'suspended' } | { kind: 'purge-failed'; again?: TokenAgain; boot?: true } | { kind: 'offline'; network: boolean } | null;

// A panel from boot (app/core-boot.ts hands bootLive()'s offline / purge-failed result here before
// the shell mounts, so it is kept until CoreNotices reads it).
let bootPanel: Panel = null;
const bootListeners = new Set<() => void>();

/** For app/core-boot.ts: show the panel a live boot ended in ('offline' or 'purge-failed'). */
export function showBootPanel(result: { state: string; again?: TokenAgain }): void {
  if (result.state === 'offline') bootPanel = { kind: 'offline', network: false };
  else if (result.state === 'purge-failed') bootPanel = result.again ? { kind: 'purge-failed', again: result.again, boot: true } : { kind: 'purge-failed', boot: true };
  else return;
  for (const l of [...bootListeners]) l();
}

/** Kit Link, nav look (blue: it goes somewhere), routed through the router. */
function PageAnchor({ link, text }: { link: PageLink; text: string }) {
  return (
    <Link href={link.href} variant="nav">
      {text}
    </Link>
  );
}

/** Subscribes to core's notices; renders the blocking panel or banner they call for. `path`: the
 *  current route (AppShell passes it), for the views the suspended screen gives way to. */
export function CoreNotices({ path }: { path?: string } = {}) {
  const t = useStrings(strings);
  const [panel, setPanel] = useState<Panel>(bootPanel);
  // Live sends a sign-out kept stored: its purge-failed panel (the page stayed) says so, as the warning did.
  const kept = useSendsKeptAtSignOut();

  useEffect(() => {
    const l = () => setPanel(bootPanel);
    bootListeners.add(l);
    if (bootPanel) l();
    return () => {
      bootListeners.delete(l);
    };
  }, []);

  useEffect(() => {
    noticesMounted += 1;
    const early = earlyGone;
    earlyGone = null;
    if (early) realmGoneToast(t, early);
    const offRealm = onRealmNotice((n) => {
      if (n.kind === 'realm-gone') realmGoneToast(t, n);
      else if (n.kind === 'switch-failed')
        showToast({
          tone: 'error',
          title: t('notice.switchFailed', { realm: nameOf(t, n.target) }),
          body: t('notice.stillShowing', { realm: nameOf(t, n.current) }),
          action: { label: t('notice.tryAgain'), onAction: () => void startSwitch(n.target).done },
        });
    });
    // Only when no page shows that outcome itself (the person moved on): a page's own "may have gone
    // through" line at the action is the message; the toast would repeat it.
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const offPending = onPending((n) => {
      if (n.signingOut) return;
      const id = setTimeout(() => {
        timers.delete(id);
        if (pageShowsPending()) return;
        showToast({ tone: 'unknown', title: t('notice.pending', { realm: nameOf(t, n.realm) }), body: t('notice.pendingBody') });
      }, PENDING_SETTLE_MS);
      timers.add(id);
    });
    const offLife = onLifecycle((e: LifecycleEvent) => {
      if (e.kind === 'suspended') setPanel({ kind: 'suspended' });
      else if (e.kind === 'purge-failed') setPanel({ kind: 'purge-failed' });
      else if (e.kind === 'token-panel') {
        if (e.panel === 'purgeFailed') setPanel({ kind: 'purge-failed', again: e.again });
        else setPanel({ kind: 'offline', network: e.panel === 'network' });
      } else if (e.kind === 'token-notice') {
        if (e.notice === 'ending') showToast({ tone: 'warn', title: t('notice.tokenEnding', { minutes: Math.max(1, Math.round(e.leftMs / 60000)) }) });
        else if (e.notice === 'changed') showToast({ tone: 'info', title: t('notice.tokenChanged') });
        // One toast per permission: what this shared link can't do and the right to ask for; a repeat
        // while it shows counts on it (kit showToast id).
        // Shown: true tells core (lifecycle emit) the page's own toast may step aside (tokenSaid).
        else if (e.notice === 'notAllowed') {
          showToast({ id: 'token-lacks:' + e.perm, tone: 'warn', title: t('notice.tokenLacks', { do: kt(`perm.${e.perm}.do` as never) }), body: t('notice.tokenLacksBody', { realm: nameOf(t, e.realm), right: kt(`perm.${e.perm}.right` as never) }) });
          return true;
        }
        else showToast({ tone: 'warn', title: t('notice.offline') });
      }
    });
    return () => {
      for (const id of timers) clearTimeout(id);
      noticesMounted -= 1;
      offRealm();
      offPending();
      offLife();
    };
  }, [t]);

  const inbox = usePageLink('notifications');
  // Sessions live on the account page; while it is hidden there is no link.
  const sessions = usePageLink('account');
  // An account that boots suspended (identity.banned) gets the same screen as one suspended mid-session.
  const banned = useCore().identity?.banned === true;
  const chunks = useStaleChunkNotice();
  const shown: Panel = panel ?? (banned ? { kind: 'suspended' } : null);
  if (!shown)
    return chunks ? (
      <div className={s.banner} role="status">
        <span>{chunks === 'updated' ? t('notice.hubUpdated') : t('notice.chunkFailed')}</span>
        <Button variant="ghost" size="sm" onPress={() => window.location.reload()}>
          {t('notice.reload')}
        </Button>
      </div>
    ) : null;
  if (shown.kind === 'offline')
    return (
      <div className={s.banner} role="status">
        <span>{shown.network ? t('notice.network') : t('notice.offline')}</span>
        <Button variant="ghost" size="sm" onPress={() => window.location.reload()}>
          {t('notice.reload')}
        </Button>
      </div>
    );
  const suspended = shown.kind === 'suspended';
  // The views the suspended screen links to inside the Hub: there it steps down to a banner.
  const opened = (l: PageLink | null) => !!l && path !== undefined && segment(path) === segment(l.href);
  if (suspended && (opened(inbox) || opened(sessions)))
    return (
      <div className={s.banner} role="status">
        <span>{t('notice.suspendedTitle')}</span>
        <Button variant="ghost" size="sm" onPress={() => requestSignOut()}>
          {t('account.signOut')}
        </Button>
      </div>
    );
  return (
    <div className={s.screen} role="alertdialog" aria-modal="true" aria-labelledby="hub-notice-title">
      <div className={s.card}>
        <h1 id="hub-notice-title" className={s.title}>
          {suspended ? t('notice.suspendedTitle') : t('notice.purgeTitle')}
        </h1>
        <p className={s.body}>{suspended ? t('notice.suspendedBody') : t('notice.purgeBody')}</p>
        {shown.kind === 'purge-failed' && !shown.again && !shown.boot && kept > 0 && <p className={s.body}>{t('notice.sendsKept', { count: kept })}</p>}
        <div className={s.actions}>
          {suspended && inbox && <PageAnchor link={inbox} text={t('notice.openNotifications')} />}
          {suspended && sessions && <PageAnchor link={sessions} text={t('notice.openSessions')} />}
          <Button variant={suspended ? 'secondary' : 'primary'} onPress={() => (suspended ? requestSignOut() : shown.again ? endTokenSession(shown.again) : logout())}>
            {suspended ? t('account.signOut') : t('notice.tryAgain')}
          </Button>
        </div>
      </div>
    </div>
  );
}
