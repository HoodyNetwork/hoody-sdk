// The app shell: sidebar (240 / 56 rail / phone drawer), 48 px top bar, the content
// area `main` (the named `content` container and the one scroll container), the Ask dock, and on
// phones the bottom tab bar. Nav items, commands and titles come from page manifests; the shell
// never imports a page.
import { memo, type ReactNode, useCallback, useDeferredValue, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from '@tanstack/react-router';
import { askOn, DOCK_MAX, dropAskDraft, focusAskDock, useAskDock } from '@kit/ask';
import { Button, cx } from '@kit/controls/Button';
import { useGo, usePathname } from '@kit/nav';
import type { PageManifest } from '@kit/page';
import { PaneSeparator, usePaneWidth } from '@kit/layouts/PaneSeparator';
import { Toaster } from '@kit/states/Toast';
import { useStrings } from '@kit/strings';
import { AskDock, focusPage } from './AskDock';
import { BottomNav } from './BottomNav';
import { ChromeRestore, useChromeIsHidden } from './chrome';
import { CommandPalette } from './CommandPalette';
import { ContributionsProvider } from './contributions';
import { useGlobalKeys } from './keys';
import { setView } from '@core/shell';
import { askHasFocus } from '../ask';
import { switchTarget, useShellData } from './context';
import { LiveShellData, SWITCH_SHOW_MS } from './live';
import { RenameRealmsProvider } from './RenameRealms';
import { PagesProvider, segment } from './pageLinks';
import { focusShownTitle, ShellView, ShownPageWait } from './pageHost';
import { CoreNotices } from './notices';
import { RealmWait, useRealmParam } from './realmParam';
import { AlertRunner } from './notify/AlertRunner';
import { OtpDialog } from './OtpDialog';
import { SignOutConfirm } from './signOut';
import { LeaveConfirm } from './LeaveConfirm';
import { ShortcutsSheet } from './ShortcutsSheet';
import { setShortcutsOpener } from './shortcutsOpen';
import { Sidebar } from './Sidebar';
import { ContextOutlet, useOnContextSwitch } from './switch';
import { cancelSwitch } from './switchOp';
import { TopBar } from './TopBar';
import { useMedia, useShellPrefs } from './prefs';
import { onAiTab, railCollapsed } from './railMode';
import strings from './strings.en.json';
import s from './AppShell.module.css';

// The shell parts that never read the route skip the render a page switch starts in the shell (each still
// renders on its own state, stores and props). Their callbacks below are stable for that.
const StillTopBar = memo(TopBar);
const StillPalette = memo(CommandPalette);
const StillShortcuts = memo(ShortcutsSheet);
const StillChromeRestore = memo(ChromeRestore);
const StillOtpDialog = memo(OtpDialog);
const StillSignOutConfirm = memo(SignOutConfirm);
const StillLeaveConfirm = memo(LeaveConfirm);
const StillAlertRunner = memo(AlertRunner);
const StillToaster = memo(Toaster);

/** The viewport width, followed on resize (0 where there is no window). */
function useViewportWidth(): number {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener('resize', onChange);
      return () => window.removeEventListener('resize', onChange);
    },
    () => window.innerWidth,
    () => 0,
  );
}

/** What the overlaying dock (768-1279) always leaves of the page beside the sidebar: the rail
 *  (--sidebar-w-collapsed) or, when the person expanded it, the full sidebar (--sidebar-w). */
const OVERLAY_PAGE_MIN = 288;
const RAIL_W = 56;
/** The expanded sidebar's width, which its edge handle drags and this device remembers. */
const SIDEBAR = { min: 200, max: 360, def: 240 };
/** A drag (or key) that leaves less than this draws the rail; at or past it, the sidebar at SIDEBAR.min or wider. */
const RAIL_SNAP = 128;
/** The page always keeps this much beside the expanded sidebar: a remembered width wider than the window allows is
 *  drawn narrower (never under SIDEBAR.min), and kept as asked for a wider window. */
const SIDEBAR_PAGE_MIN = 480;

export interface AppShellProps {
  pages: readonly PageManifest[];
  /** The Ask conversation. Required: the router passes AskPanel with the Board's Add link (app/router.tsx); a shell of
   *  its own cannot draw one without importing the Board into the kit's graph (app/kitGraph.test.ts). */
  dock: ReactNode;
  onNewConversation?: () => void;
  children: ReactNode;
}

/** `on`, once it has held for `ms` (false again at once when it goes off). */
function useShownAfter(on: boolean, ms: number): boolean {
  const [shown, setShown] = useState(false);
  if (!on && shown) setShown(false);
  useEffect(() => {
    if (!on) return;
    const id = window.setTimeout(() => setShown(true), ms);
    return () => window.clearTimeout(id);
  }, [on, ms]);
  return on && shown;
}

/** The shell over the shown session's live data (realms, computers, account, bell). */
export function AppShell(props: AppShellProps) {
  return (
    <LiveShellData>
      <RenameRealmsProvider>
        <ShellFrame {...props} />
      </RenameRealmsProvider>
    </LiveShellData>
  );
}

function ShellFrame({ pages, dock, onNewConversation, children }: AppShellProps) {
  const t = useStrings(strings);
  const prefs = useShellPrefs();
  const ask = useAskDock();
  const go = useGo();
  const path = usePathname();
  const wide = useMedia('(width >= 1280px)');
  const phone = useMedia('(width < 768px)');
  const xl = useMedia('(width >= 1560px)');
  const [moreOpen, setMoreOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  useEffect(() => setShortcutsOpener(() => setShortcuts(true)), []);
  // Rail mode (railMode.ts): on the AI tab under 1560 px the sidebar is a rail unless toggled there; leaving forgets the
  // toggle and draws the person's own setting again. Leaving is read from every history entry, not from a render off the
  // AI tab: /ai -> /home -> /ai in one tick renders only the last /ai, and the toggle must still be forgotten.
  const router = useRouter();
  const onAi = onAiTab(path);
  const [aiChoice, setAiChoice] = useState<boolean | null>(null);
  useEffect(
    () =>
      router.history.subscribe(({ location }) => {
        if (!onAiTab(location.pathname)) setAiChoice(null);
      }),
    [router],
  );
  const collapsed = railCollapsed({ own: prefs.collapsed ?? !wide, onAi, xl, choice: aiChoice });
  const toggleCollapsed = () => (onAi ? setAiChoice(!collapsed) : prefs.setCollapsed(!collapsed));
  const dockMode = phone ? 'sheet' : wide ? 'push' : 'overlay';
  // Overlaying (768-1279), the dock never covers the whole page: it leaves OVERLAY_PAGE_MIN beside the sidebar, even
  // when that draws it narrower than DOCK_MIN (768 with the sidebar expanded: 768 - 240 - 288 = 240). The width the
  // person asked for is stored as is and drawn again where there is room.
  const vw = useViewportWidth();
  const [sidebarW, setSidebarW] = usePaneWidth('sidebar', 'w', SIDEBAR);
  const sidebarDrawn = vw > 0 ? Math.min(sidebarW, Math.max(SIDEBAR.min, vw - SIDEBAR_PAGE_MIN)) : sidebarW;
  const side = collapsed ? RAIL_W : sidebarDrawn;
  // The edge handle: one width from the rail to SIDEBAR.max. A drag under RAIL_SNAP draws the rail (the collapse
  // toggle) and keeps the width the drag started from, not the last one it passed on the way; out of the
  // rail, past it, the sidebar at the drawn width, never under SIDEBAR.min. A key step crosses the gap between the rail
  // and SIDEBAR.min at once: narrower than the minimum is the rail, wider than the rail the remembered
  // width. The wrapper tells a key from a drag (capture handlers, before the separator's own).
  const edgeGesture = useRef({ key: false, from: SIDEBAR.def });
  // A drag in progress keeps the handle drawn even where the rail has none (a touch screen), so a drag that crosses
  // into the rail keeps its pointer and can come back out before it ends.
  const [edgeDrag, setEdgeDrag] = useState(false);
  const resizeSidebar = (w: number) => {
    const g = edgeGesture.current;
    if (g.key && w < SIDEBAR.min && (collapsed ? w > RAIL_W : true)) {
      toggleCollapsed();
      return;
    }
    if (w < RAIL_SNAP) {
      if (!collapsed) {
        toggleCollapsed();
        if (!g.key) setSidebarW(g.from);
      }
      return;
    }
    if (collapsed) toggleCollapsed();
    setSidebarW(Math.max(SIDEBAR.min, w));
  };
  const dockMax = dockMode === 'overlay' && vw > 0 ? Math.min(DOCK_MAX, vw - side - OVERLAY_PAGE_MIN) : DOCK_MAX;
  const dockWidth = Math.min(dockMax, ask.width ?? (xl ? 400 : wide ? 360 : 400));
  // Focus mode (useChromeHidden): the chrome is hidden, never unmounted, the dock included, so no sheet covers the
  // page then; the More drawer closes.
  const focus = useChromeIsHidden();
  const sheetOpen = ask.isOpen && dockMode === 'sheet' && !focus;
  useEffect(() => {
    if (focus || sheetOpen) setMoreOpen(false);
  }, [focus, sheetOpen]);

  // Opening the dock by any entry (top bar, phone tab, a page's Ask button) puts focus in it, as
  // Ctrl/⌘J does; closing it puts focus back on what had it before (the entry that opened it), else on the page,
  // never on <body>. A dock restored open at load takes no focus, and a close while focus is on the page leaves it.
  const askOpened = useRef(ask.isOpen);
  const askReturn = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (ask.isOpen === askOpened.current) return;
    askOpened.current = ask.isOpen;
    const inDock = () => !!document.querySelector('[data-hub-dock]')?.contains(document.activeElement);
    if (ask.isOpen) {
      const a = document.activeElement;
      askReturn.current = a instanceof HTMLElement && a !== document.body && !a.closest('[data-hub-dock]') ? a : null;
      // After the dock has drawn; not when the person put focus somewhere else in between (a newer choice wins).
      const raf = requestAnimationFrame(() => {
        const now = document.activeElement;
        if (!inDock() && (now === a || now === document.body || !now)) focusAskDock();
      });
      return () => cancelAnimationFrame(raf);
    }
    const back = askReturn.current;
    askReturn.current = null;
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected) return;
    back?.focus({ preventScroll: true });
    if (!back?.isConnected || document.activeElement !== back) focusPage();
  }, [ask.isOpen]);

  // The open dock becomes the phone's sheet (a resize below 768, or focus mode ending on a phone): the page under it
  // goes inert, so focus left there moves into the sheet. Only on that change, never on every resize; opening is the
  // effect above's.
  const sheetWas = useRef(sheetOpen);
  const askWasOpen = useRef(ask.isOpen);
  useEffect(() => {
    const was = sheetWas.current;
    const openBefore = askWasOpen.current;
    sheetWas.current = sheetOpen;
    askWasOpen.current = ask.isOpen;
    if (!sheetOpen || was || !openBefore) return;
    const raf = requestAnimationFrame(() => {
      if (!document.querySelector('[data-hub-dock]')?.contains(document.activeElement)) focusAskDock();
    });
    return () => cancelAnimationFrame(raf);
  }, [sheetOpen, ask.isOpen]);

  // An account or realm switch: nothing of the old context stays in the palette or the Ask draft.
  useOnContextSwitch(() => {
    setPalette(false);
    dropAskDraft();
  });

  // A canvas page (the Board) fills the content area itself: no inner scroll, no extra padding.
  const layout = pages.find((p) => segment(p.path) === segment(path))?.layout;
  const canvas = layout === 'canvas';
  // A wizard (New realm) has no action button: on phones main keeps only the bottom bar's strip under its footer.
  const wizard = layout === 'wizard';

  // A link asking for a realm (?open_realm=<id>; a page's own ?realm= filter is not one): the page the route shows
  // waits until the shell has switched to it; pages kept loaded stay as they are.
  const keysPage = pages.find((p) => p.id === 'keys');
  const realmWait = useRealmParam(keysPage ? `${keysPage.path}/shared` : undefined);
  // The switch line, in a row of its own under the top bar (it never covers the page). It is one announcement for
  // both kinds of switch:
  // - a realm the person picked: where the Hub is going, and the realm the page still shows (the page stays usable,
  //   and a newer pick supersedes the switch);
  // - a realm a link asked for: the page waits, so the line says only where it is going ("Opening the realm…" while
  //   the shell still reads the list).
  // Either shows once it has run 300 ms. Cancel, or Esc, drops the switch the shell started (core commits nothing).
  const data = useShellData();
  const going = switchTarget(data, t('top.realmAll'));
  const showsName = data.realmId === 'all' ? t('top.realmAll') : data.realms.find((r) => r.id === data.realmId)?.name;
  const waitShown = useShownAfter(realmWait, SWITCH_SHOW_MS);
  const lineText = going ? (going.name !== null ? t('switching', { realm: going.name }) : t('switchingUnnamed')) : waitShown ? t('realmParam.opening') : null;
  const lineStill = going && !realmWait && showsName ? t('switchingStill', { realm: showsName }) : null;
  const cancelShown = () => {
    if (!cancelSwitch()) return false;
    // The Cancel button goes away with the line: focus lands on the realm switcher shown at this width, where the
    // realm still shows (the realm menu; on a phone, where it is display:none, the realm-and-computer chip).
    if (document.activeElement === document.body || document.activeElement?.closest('[data-hub-switch-line]')) {
      const to = Array.from(document.querySelectorAll<HTMLElement>('[data-hub-switch="realm"], [data-hub-switch="context"]'));
      (to.find((el) => el.getClientRects().length > 0) ?? to[0])?.focus();
    }
    return true;
  };

  useGlobalKeys(pages, {
    palette: () => setPalette((v) => !v),
    shortcuts: () => setShortcuts(true),
    toggleSidebar: toggleCollapsed,
    // The Ask dock: closed → open (the panel focuses its composer); open → move focus between dock and page.
    toggleAsk: () => {
      if (!askOn()) return;
      // Opening puts focus in the dock through the open effect above (the composer first), one place for every entry.
      if (!ask.isOpen) return ask.open();
      // A phone's sheet covers the page: there is no page to move to, so the key closes it.
      if (dockMode === 'sheet') return ask.close();
      if (askHasFocus() || document.querySelector('[data-hub-dock]')?.contains(document.activeElement)) return focusPage();
      focusAskDock();
    },
    go,
    cancelSwitch: going ? cancelShown : undefined,
  });

  const closeMore = useCallback(() => setMoreOpen(false), []);
  const openPalette = useCallback(() => setPalette(true), []);
  const openShortcuts = useCallback(() => setShortcuts(true), []);

  // Close the phone drawer on navigation.
  const lastPath = useRef(path);
  useEffect(() => {
    if (lastPath.current === path) return;
    lastPath.current = path;
    setMoreOpen(false);
  }, [path]);
  // The pages draw a step behind the route (app/router.tsx): this path moves in the same background render
  // that gets the new page ready (its view loaded), so the title focused is the new page's, even when its view loaded
  // late. The view change itself (core setView) is the page host's (ShellView below): it moves before the new page
  // renders, and the page renders in the pass right after it, before the frame paints.
  const shownPath = useDeferredValue(path);
  const lastShown = useRef(shownPath);
  useLayoutEffect(() => {
    if (lastShown.current === shownPath) return;
    lastShown.current = shownPath;
    const id = requestAnimationFrame(focusShownTitle);
    return () => cancelAnimationFrame(id);
  }, [shownPath]);

  // The phone More drawer is modal while open: focus moves into it (the current page's row, else its first link), the skip
  // link, top bar, switch line, page and bottom bar behind its scrim are inert, and Escape or the scrim closes it and gives
  // focus back to what had it before (the More tab). A close by navigation leaves focus to the new page's title. A layout
  // effect: it reads the focused element in the commit that makes the bottom bar inert, before a style pass can move focus
  // off it.
  const drawerOpen = moreOpen && phone;
  const shellRef = useRef<HTMLDivElement>(null);
  const moreOpener = useRef<HTMLElement | null>(null);
  const moreGiveBack = useRef(false);
  const dismissMore = useCallback(() => {
    moreGiveBack.current = true;
    setMoreOpen(false);
  }, []);
  useLayoutEffect(() => {
    if (drawerOpen) {
      const had = document.activeElement;
      moreOpener.current = had instanceof HTMLElement && had !== document.body ? had : null;
      moreGiveBack.current = false;
      const nav = shellRef.current?.querySelector<HTMLElement>(`.${s.sidebar}`);
      const first = nav?.querySelector<HTMLElement>('[aria-current="page"]') ?? nav?.querySelector<HTMLElement>('a[href]');
      first?.focus();
      return;
    }
    const back = moreOpener.current;
    moreOpener.current = null;
    if (moreGiveBack.current && back?.isConnected) back.focus();
    moreGiveBack.current = false;
  }, [drawerOpen]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismissMore();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen, dismissMore]);

  return (
    <PagesProvider pages={pages}>
    <ContributionsProvider pages={pages}>
      <div
        ref={shellRef}
        className={cx(s.shell, collapsed && s.rail, moreOpen && s.moreOpen, ask.isOpen && s[`dock_${dockMode}`], focus && s.focus)}
        // The phone More drawer and the phone Ask sheet own the keyboard while open (keygate overlayOpen).
        data-hub-overlay={(moreOpen && phone) || sheetOpen ? '' : undefined}
        style={{ ['--dock-cur' as string]: `${dockWidth}px`, ['--sidebar-w' as string]: `${sidebarDrawn}px` }}
      >
        <a className={s.skip} href="#hub-main" inert={sheetOpen || drawerOpen} onClick={(e) => { e.preventDefault(); document.getElementById('hub-main')?.focus(); }}>
          {t('skipToContent')}
        </a>
        <Sidebar
          pages={pages}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          onNavigate={closeMore}
          drawer={phone}
          className={s.sidebar}
          handle={
            <div
              className={cx(s.edge, edgeDrag && s.edgeDrag)}
              onPointerDownCapture={() => {
                edgeGesture.current = { key: false, from: sidebarW };
                setEdgeDrag(true);
              }}
              onPointerUp={() => setEdgeDrag(false)}
              onPointerCancel={() => setEdgeDrag(false)}
              onLostPointerCapture={() => setEdgeDrag(false)}
              onKeyDownCapture={() => (edgeGesture.current = { key: true, from: sidebarW })}
            >
              <PaneSeparator value={side} range={{ min: RAIL_W, max: SIDEBAR.max, def: SIDEBAR.def }} onChange={resizeSidebar} dir={1} label={t('nav.resize')} />
            </div>
          }
        />
        <div className={s.scrim} onClick={dismissMore} aria-hidden="true" />
        {/* Under a phone's Ask sheet (full screen) or its open More drawer the chrome and the page are inert: Tab stays in
            the sheet or the drawer. */}
        <StillTopBar className={s.topbar} inert={sheetOpen || drawerOpen} onOpenPalette={openPalette} onOpenShortcuts={openShortcuts} />
        {/* The live region stays mounted, empty while idle, so its text is read out when it appears; Cancel sits
            outside it, so it is not read as part of the message. */}
        <div className={cx(s.switchLine, lineText !== null && s.switchOn)} data-hub-switch-line="" inert={sheetOpen || drawerOpen}>
          <span className={s.switchText} role="status" aria-live="polite">
            {lineText !== null && <span>{lineText}</span>}
            {lineStill !== null && <span className={s.switchStill}>{lineStill}</span>}
          </span>
          {going && (
            <Button variant="ghost" size="sm" aria-label={t('switchCancelName')} onPress={() => void cancelShown()}>
              {t('switchCancel')}
            </Button>
          )}
        </div>
        <main id="hub-main" data-hub-content="" className={cx(s.main, canvas && s.canvas, wizard && s.wizard)} tabIndex={-1} inert={sheetOpen || drawerOpen}>
          <ShownPageWait value={realmWait ? <RealmWait /> : null}>
            <ShellView value={setView}>
              <ContextOutlet>{children}</ContextOutlet>
            </ShellView>
          </ShownPageWait>
        </main>
        {ask.isOpen && (
          <div className={s.dock}>
            <AskDock width={dockWidth} max={dockMax} sheet={sheetOpen} onNew={onNewConversation}>
              {dock}
            </AskDock>
          </div>
        )}
        <BottomNav pages={pages} onMore={() => setMoreOpen((v) => !v)} moreOpen={moreOpen} className={s.bottom} inert={drawerOpen} />
        <StillChromeRestore />
        <StillPalette pages={pages} isOpen={palette} onOpenChange={setPalette} />
        <StillShortcuts isOpen={shortcuts} onOpenChange={setShortcuts} />
        <StillOtpDialog />
        <StillSignOutConfirm />
        <StillLeaveConfirm />
        <StillAlertRunner />
        <CoreNotices path={path} />
        <StillToaster />
      </div>
    </ContributionsProvider>
    </PagesProvider>
  );
}
