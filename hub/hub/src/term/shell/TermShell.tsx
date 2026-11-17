// The terminal shell around the pages: the web AppShell's frame (shell/AppShell.tsx) in cells.
//   top bar   HOODY · page title · realm switcher · computer switcher · account · key hint (the title only on a page that
//             draws no header of its own, headerShown.ts: else the name would be drawn twice)
//   sidebar   the nav groups (Sidebar.tsx), from SIDEBAR_MIN_COLS columns; below it `[` (or the ≡ trigger) opens the
//             page list as a menu (the web's phone drawer)
//   page      the page host (app/router.tsx → shell/pageHost.term.tsx), inside ContextOutlet and the realm wait
//   status    one line: the realm switch (with Esc to cancel), a transient note, a pending `g`, else the main keys
// Over it: the palette (Ctrl+K), the `?` sheet, the menus, the shell's prompts (quit, lock), the web's LeaveConfirm,
// SignOutConfirm and OtpDialog, and the toasts (kit Toaster), all on the kit overlay layer (prim/Overlay.ts).
// Keys come from one keymap (keymap.ts); this file wires its actions and its bubble phase (KeyBubble).
// Beside the page: the Ask dock (AskDock.tsx: a pane from ASK_PANE_MIN_COLS, else a full-screen sheet; Alt+J).
// Below MIN_COLS x MIN_ROWS (80x24) the "terminal too small" screen covers all of it (TooSmall.tsx); the page stays
// mounted under it.
// Core's pending notice (a change whose outcome is unknown) is the web's toast, told once the person leaves the page
// that shows it (pendingNotice.tsx). Not here (web has them): the other core notices (shell/notices.tsx reads the DOM),
// browser alerts (notify/AlertRunner), the sidebar resize handle.
import { useRouter, useRouterState } from '@tanstack/react-router';
import { type ReactNode, type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { setStylePane } from '../jsx/style';
import { setView, isLocked } from '@core/shell';
import type { PageManifest } from '@kit/page';
import { Toaster } from '@kit/states/Toast';
import { makeT, useStrings } from '@kit/strings';
import { ShellDataProvider, switchTarget, useShellData } from '../../shell/context';
import { LeaveConfirm } from '../../shell/LeaveConfirm';
import { LiveShellData } from '../../shell/live';
import { usePageHeaderShown } from './headerShown';
import { OtpDialog } from '../../shell/OtpDialog';
import { ShellView, ShownPageWait } from '../../shell/pageHost';
import { ContributionsProvider } from '../../shell/contributions';
import { PagesProvider } from '../../shell/pageLinks';
import { RenameRealmsProvider } from '../../shell/RenameRealms';
import { setShortcutsOpener } from '../../shell/shortcutsOpen';
import { claimPageKeyOrder } from '../../shell/pageShortcuts';
import { RealmWait, useRealmParam } from '../../shell/realmParam';
import { SignOutConfirm } from '../../shell/signOut';
import { ContextOutlet, useOnContextSwitch } from '../../shell/switch';
import { PageOutlet } from '@kit/layouts/termScroll';
import { cancelSwitch } from '../../shell/switchOp';
import { AccountMenu, ComputerSwitcher, openComputerSwitcher, RealmSwitcher } from '../../shell/Switchers';
import shellStrings from '../../shell/strings.en.json';
import { Box, FocusRegion, Mark, Pressable, SIDEBAR_MIN_COLS, Text, useKeys, useTerminalSize, PaneSize, usePaneSize, useFocusControl, useFocusable, useFocusedNode, type FocusId, type Focusable } from '../prim';
import { useRenderer, type KeyEvent } from '../prim/engine';
import { Above, opaqueRaw, TOP_Z, useGlobalKey, useLayerCount } from '../prim/Overlay';
import { focusMark } from '../prim/FocusInk';
import { demoMounted } from '../app/demo-flag';
import { hubKey } from './hubKey';
import { INTERRUPT_MS, type ShellActions, type ShellKeymap } from './keymap';
import { TermPendingNotices } from './pendingNotice';
import { KeymapContext, useShellKeymap } from './layer';
import { Menus } from './Menus';
import { closeMenu, openMenu, switcherShown } from './menus-store';
import { Palette, type Recents } from './Palette';
import { QuitPrompt, somethingAtStake, TermLock } from './Prompts';
import { Sheet } from './Sheet';
import { AskDockSlot, loadAsk } from './AskDock';
import { useAskDock } from '@kit/ask';
import { SIDEBAR_COLS, Sidebar } from './Sidebar';
import { TooSmall } from './TooSmall';
import strings from './strings.en.json';

/** Below this many columns the top bar shortens its hint. */
const TOP_HINT_MIN_COLS = 110;

export interface TermShellProps {
  pages: readonly PageManifest[];
  keymap: ShellKeymap;
  /** Leave the Hub (the lifecycle's end: the renderer is closed and the process or the mount ends). */
  onQuit: () => void;
  /** Ctrl-Z, where the host can suspend (a real terminal); absent: Ctrl-Z says it is not available. */
  onSuspend?: () => void;
  children: ReactNode;
}

/** Whether the engine's focused renderable is a text editor (a field that takes printable keys). */
export function useTyping(): () => boolean {
  const renderer = useRenderer();
  // The same function while the renderer is the same: KeyCapture's key listener depends on it and must not be set again
  // on a re-render (a listener set again runs after the focused control's).
  return useCallback(() => {
    const fr = renderer?.currentFocusedRenderable as { insertText?: unknown; isDestroyed?: boolean; focused?: boolean } | null | undefined;
    return !!fr && !fr.isDestroyed && typeof fr.insertText === 'function';
  }, [renderer]);
}

/** Whether a text field holds OpenTUI's focus, as render state: the status line re-renders when the focus moves (the
 *  renderer's focus events), so the Typing hint never outlives its field (a field focused for a moment
 *  while a page loads must not leave "Typing · Esc leaves the field" with no field focused). */
export function useTypingNow(): boolean {
  const renderer = useRenderer();
  const typing = useTyping();
  const subscribe = useCallback((cb: () => void) => {
    const r = renderer as unknown as { on?(e: string, f: () => void): unknown; off?(e: string, f: () => void): unknown } | null | undefined;
    if (!r?.on) return () => {};
    r.on('focused_renderable', cb);
    r.on('focused_editor', cb);
    return () => { r.off?.('focused_renderable', cb); r.off?.('focused_editor', cb); };
  }, [renderer]);
  return useSyncExternalStore(subscribe, typing, () => false);
}

/**
 * The keymap's capture phase: mounted before the app's FocusRoot (App.tsx), so its key listener runs before the focused
 * control. Ctrl-C and Ctrl-Z also run while a layer is open (the overlay gate's global keys).
 */
export function KeyCapture({ keymap }: { keymap: ShellKeymap }) {
  const typing = useTyping();
  const renderer = useRenderer();
  useEffect(() => {
    const input = renderer?.keyInput as unknown as { on(ev: string, fn: (k: never) => void): void; off(ev: string, fn: (k: never) => void): void } | undefined;
    if (!input) return;
    const onKey = (raw: KeyEvent) => {
      if (raw.eventType === 'release' || raw.propagationStopped) return;
      if (keymap.capture(hubKey(raw), typing())) { raw.preventDefault(); raw.stopPropagation(); }
      // After the key has landed (the focus may have moved into or out of a field): the status line re-reads it.
      setTimeout(keymap.poke, 0);
    };
    input.on('keypress', onKey as never);
    return () => input.off('keypress', onKey as never);
  }, [renderer, keymap, typing]);
  // Ctrl-C and Ctrl-Z work whatever layer is open (a dialog, the palette, the lock screen).
  useGlobalKey((raw) => {
    if (raw.eventType === 'release' || !raw.ctrl || raw.meta || (raw.name !== 'c' && raw.name !== 'z')) return false;
    return keymap.capture(hubKey(raw), typing());
  });
  return null;
}

/** True when this drawn node is (or holds) a text editor. */
const isField = (n: unknown): boolean => {
  for (let x = n as { insertText?: unknown; getChildren?: () => unknown[] } | null, d = 0; x && d < 3; d++) {
    if (typeof x.insertText === 'function') return true;
    x = (x.getChildren?.()[0] as typeof x | undefined) ?? null;
  }
  return false;
};

/**
 * The keymap's bubble phase: a shortcut handler of the app's FocusRoot, after the focused control declined the key.
 * Esc that a text field did not use leaves the field (the web's Esc out of a search box): the focus goes back to what
 * had it before the field (a list row, a button), else to the pane's anchor, from where Tab reaches the page's first
 * control. Nothing typed is lost.
 */
function KeyBubble({ keymap, anchor }: { keymap: ShellKeymap; anchor: RefObject<Focusable | null> }) {
  const typing = useTyping();
  const ctl = useFocusControl();
  const lastOutside = useRef<FocusId | null>(null);
  useFocusedNode((node) => {
    const id = ctl.current();
    if (node && !isField(node) && id !== null) lastOutside.current = id;
  });
  useKeys((k) => {
    const t = typing();
    if (t && k.name === 'escape' && !k.ctrl && !k.meta && !k.shift) {
      const back = lastOutside.current;
      ctl.restore(back);
      if (ctl.current() === back && back !== null && !typing()) return true;
      anchor.current?.focus();
      return true;
    }
    return keymap.bubble(hubKey(k), t);
  });
  return null;
}

/** The pane's focus anchor (not a Tab stop, draws nothing): where Esc out of a field lands when nothing had the focus. */
function PaneAnchor({ into }: { into: RefObject<Focusable | null> }) {
  const f = useFocusable({ tabStop: false });
  into.current = f;
  return <Box boxRef={f.ref} width={0} height={0} />;
}

/** In the page's root: reports a page focus MOVE a person asked for (a click), for the dock to give way. The store also
 *  emits when its root turns inactive or active (the dock entered or left), which moves nothing: only a new id counts,
 *  or a new ask for the same id made while the root was inactive (a click on the row that already had the focus). */
function PageFocusWatch({ into }: { into: RefObject<((id: FocusId | null) => void) | null> }) {
  const ctl = useFocusControl();
  const last = useRef<FocusId | null>(null);
  const lastReasks = useRef(0);
  useFocusedNode((_node, how, reasks) => {
    const id = ctl.current();
    const again = reasks !== lastReasks.current;
    lastReasks.current = reasks;
    if (id === last.current && !again) return;
    last.current = id;
    if (how === 'asked' && id !== null) into.current?.(id);
  });
  return null;
}

/** The keymap's transient state for the status line. */
function useKeymapState(km: ShellKeymap) {
  const get = () => `${km.pending()?.join(' ') ?? ''}\u0000${km.status()?.text ?? ''}\u0000${km.version()}`;
  const v = useSyncExternalStore(km.subscribe, get, get);
  const [pending, note] = v.split('\u0000');
  return { pending: pending || null, note: note || null };
}

const titleOf = (p: PageManifest | undefined): string => (p ? makeT(p.strings)(p.title) : '');

function TopBar({ title, narrow, compact, onNav, onShortcuts }: { title: string; narrow: boolean; compact: boolean; onNav: () => void; onShortcuts: () => void }) {
  const tt = useStrings(strings);
  const headerShown = usePageHeaderShown();
  const t = useStrings(shellStrings);
  return (
    <Box dir="row" height={1} shrink={0} bg="card" padX={1} gap={2} raw={{ id: SHELL_TOPBAR_ID }}>
      {compact && (
        <Pressable onPress={onNav}>
          {({ focused }) => <Text colour={focused ? 'blueInk' : 'ink'} bg={focused ? 'blue' : undefined} {...focusMark(focused)}>{tt('top.nav')}</Text>}
        </Pressable>
      )}
      {/* The brand cell, as the web sidebar's: the mark, HOODY, and HUB where the sidebar shows (there it is as wide as
          the sidebar). Never shrinks (at 60 columns a shrinking brand drew "HOOD"). */}
      <Box dir="row" gap={1} shrink={0} width={compact ? undefined : SIDEBAR_COLS - 1}>
        <Mark />
        <Text bold shrink={0} truncate={false}>{tt('top.brand')}{compact ? null : <Text colour="muted">{' ' + t('hub').toUpperCase()}</Text>}</Text>
      </Box>
      {/* The page's name only when the page draws no header of its own (a canvas page): else it would be drawn twice. */}
      {headerShown ? <Box grow={1} shrink={1} /> : <Text bold truncate grow={1} shrink={1}>{title}</Text>}
      <RealmSwitcher />
      <ComputerSwitcher />
      <AccountMenu onOpenShortcuts={onShortcuts} />
      <Text colour="faint" shrink={0}>{narrow ? tt('top.hintNarrow') : tt('top.hint')}</Text>
    </Box>
  );
}

function StatusLine({ waiting }: { waiting: boolean }) {
  const t = useStrings(shellStrings);
  const tt = useStrings(strings);
  const km = useShellKeymap();
  const { pending, note } = useKeymapState(km!);
  const data = useShellData();
  const going = switchTarget(data, t('top.realmAll'));
  const typingNow = useTypingNow();
  // Below the sidebar's width the sample-account line is its short form, so the key line beside it is never cut
  // mid-word (80 columns drew "Ctrl+K comman…").
  const { width, height } = useTerminalSize();
  // A layer that takes the keys may hide this row (a full-screen sheet or drawer; in mono every modal's scrim), and
  // Ctrl-C and Ctrl-Z still reach the keymap there: while a note is up ("again to leave") it is also drawn above every
  // layer, on this row.
  const covered = useLayerCount({ trapping: true }) > 0;
  let text: string;
  let colour: 'muted' | 'warn' | 'blueText' = 'muted';
  if (going) {
    text = `⟳ ${going.name !== null ? t('switching', { realm: going.name }) : t('switchingUnnamed')} · Esc ${t('switchCancel')}`;
    colour = 'blueText';
  } else if (waiting) {
    text = '⟳ ' + t('realmParam.opening');
    colour = 'blueText';
  } else if (note) {
    text = '! ' + note;
    colour = 'warn';
  } else if (pending) {
    text = tt('status.pending', { key: pending });
    colour = 'blueText';
  } else {
    text = typingNow ? tt('status.keysTyping') : tt('status.keys');
  }
  return (
    // On the bars' ground, as the top bar: the row was left unpainted (the terminal's own background showed, a strip of
    // another colour under the page on every terminal whose background is not the theme's).
    <Box dir="row" height={1} shrink={0} bg="card" padX={1} gap={2}>
      <Text colour={colour} truncate grow={1} shrink={1}>{text}</Text>
      {/* Dim, as the key line: it reassures, it does not warn, and in the dark theme the warning tone is the accent
          itself (the screen's one accent stays with the current page and the primary action). */}
      {demoMounted() ? <Text colour="muted" shrink={0}>{tt(width < SIDEBAR_MIN_COLS ? 'status.demoNarrow' : 'status.demo')}</Text> : null}
      {note && covered ? (
        <Above>
          <Box absolute={{ top: height - 1, left: 0 }} width={width} height={1} z={TOP_Z} padX={1} bg="card" raw={opaqueRaw('card')}>
            <Text colour="warn" truncate grow={1}>{'! ' + note}</Text>
          </Box>
        </Above>
      ) : null}
    </Box>
  );
}

function ShellFrame({ pages, keymap, onQuit, onSuspend, children }: TermShellProps) {
  const tt = useStrings(strings);
  const router = useRouter();
  const current = useRouterState({ select: (s) => s.matches[s.matches.length - 1]?.staticData.pageId });
  const pagePath = useRouterState({ select: (s) => s.location.pathname });
  const { width } = useTerminalSize();
  const page = pages.find((p) => p.id === current);
  const [palette, setPalette] = useState(false);
  const [sheet, setSheet] = useState(false);
  const openSheet = useCallback(() => setSheet(true), []);
  // A page's own control opens the `?` sheet (kit openShortcutsSheet: Home's "All shortcuts"), as AppShell registers
  // it on the web. Unregistered, the press did nothing.
  useEffect(() => setShortcutsOpener(openSheet), [openSheet]);
  const [quitAsk, setQuitAsk] = useState(false);
  const [sideHidden, setSideHidden] = useState(false);
  const recents = useRef<Recents>({ ids: [] }).current;
  const askDock = useAskDock();
  const askRef = useRef(askDock);
  askRef.current = askDock;
  const toggleAsk = useCallback(() => askRef.current.toggle(), []);
  const pageFocus = useRef<((id: FocusId | null) => void) | null>(null);
  const anchor = useRef<Focusable | null>(null);
  const lastInterrupt = useRef(0);
  const ended = useRef(false);
  const keysPage = pages.find((p) => p.id === 'keys');
  const realmWait = useRealmParam(keysPage ? `${keysPage.path}/shared` : undefined);
  const data = useShellData();
  const going = switchTarget(data, '');
  const wide = width >= SIDEBAR_MIN_COLS;
  // Stable while the router and the host's quit are: the action table below is handed to the keymap only when it changes.
  const go = useCallback((to: string) => { void router.navigate({ href: to } as never); }, [router]);
  const end = useCallback(() => {
    if (ended.current) return;
    ended.current = true;
    setQuitAsk(false);
    onQuit();
  }, [onQuit]);
  const latest = useRef({ quitAsk, going, wide });
  latest.current = { quitAsk, going, wide };

  // An account or realm switch: nothing of the old context stays in the palette (the web's rule).
  useOnContextSwitch(() => setPalette(false));
  useEffect(() => claimPageKeyOrder(), []);
  // The menu store is the mount's (sessionSlot); a shell that ends still closes what it had open (a test drawing
  // without a session shares the detached slot until the next session starts).
  useEffect(() => () => closeMenu(), []);
  // src/ask (Agent's active-chat provider, the dock's panel): loaded once the shell runs, so after the host env.
  useEffect(() => { void loadAsk().catch((e: unknown) => console.error('ask load:', e)); }, []);

  const actions = useMemo<ShellActions>(() => ({
    palette: () => setPalette((v) => !v),
    search: () => { keymap.note(tt('status.noSearch')); return false; },
    help: () => setSheet(true),
    sidebar: () => { if (latest.current.wide) setSideHidden((v) => !v); else openMenu('nav'); },
    ask: toggleAsk,
    realm: () => { if (switcherShown('realm')) openMenu('realm'); else keymap.note(tt('status.noRealms')); },
    computer: () => { if (switcherShown('computer')) openComputerSwitcher(); else keymap.note(tt('status.noComputers')); },
    go,
    quit: () => { if (somethingAtStake()) setQuitAsk(true); else end(); },
    interrupt: () => {
      const now = Date.now();
      const twice = now - lastInterrupt.current < INTERRUPT_MS;
      lastInterrupt.current = now;
      // The question is up (or this is the second Ctrl-C): leave without asking.
      if (latest.current.quitAsk || twice) { end(); return; }
      if (somethingAtStake()) { setQuitAsk(true); keymap.note(tt('status.againForced'), INTERRUPT_MS); return; }
      keymap.note(tt('status.again'), INTERRUPT_MS);
    },
    suspend: () => { if (onSuspend) onSuspend(); else keymap.note(tt('status.suspendNo')); },
    cancelSwitch: () => (latest.current.going ? cancelSwitch() : false),
    pages: () => pages,
    locked: () => isLocked(),
  }), [keymap, pages, onSuspend, toggleAsk, end, go, tt]);
  useEffect(() => keymap.setActions(actions), [keymap, actions]);
  // A page's own Sign out (the shared-access way out of Notifications, Vault and Account, and Account's "Sign in again"
  // after a password change) calls the shell data's signOut. The terminal never signs the CLI out (Menus.tsx):
  // for the page it is the account menu's Leave, as q (asking first when something is at stake). The
  // web's signOut ran core's logout here: the mount ended signed-out and the kept keys were purged from disk.
  const pageData = useMemo(() => ({ ...data, signOut: actions.quit }), [data, actions]);

  const showSide = wide && !sideHidden;
  return (
    <Box dir="column" width="100%" height="100%">
      {/* Tab regions in the web's DOM order (shell/AppShell.tsx: sidebar, top bar, main), whatever is drawn first:
          Tab walks the sidebar, then the top bar, then the page; F6 / Shift+F6 jump between them (the skip link). */}
      <FocusRegion order={REGION.topBar}>
        <TopBar title={titleOf(page)} narrow={width < TOP_HINT_MIN_COLS} compact={!showSide} onNav={() => openMenu('nav')} onShortcuts={openSheet} />
      </FocusRegion>
      <Box dir="row" grow={1} shrink={1}>
        {showSide && <FocusRegion order={REGION.sidebar}><Sidebar pages={pages} current={current} go={go} /></FocusRegion>}
        {/* The content pane: its measured size is what pages lay out by (usePaneSize, container queries). */}
        <PaneSize dir="column" grow={1} shrink={1} basis={0} minWidth={0} clip pad={{ left: showSide ? 1 : 0 }} raw={{ id: SHELL_PANE_ID }}>
          {/* Mounted before the page: its shortcut handler is registered first, so it runs LAST (a page's own keys,
              its search field's `/` among them, come before the shell's fallbacks). */}
          <KeyBubble keymap={keymap} anchor={anchor} />
          <FocusRegion order={REGION.page}>
            <StylePane />
            <PaneAnchor into={anchor} />
            <PageFocusWatch into={pageFocus} />
            <ShownPageWait value={realmWait ? <RealmWait /> : null}>
              <ShellView value={setView}>
                {/* The page's default scroll owner (a page with no kit layout still scrolls); a layout with its own PageBody
                    claims it and it stands down (kit/layouts/termScroll.tsx). */}
                <ContextOutlet>
                  <ShellDataProvider value={pageData}><PageOutlet keep={pagePath}>{children}</PageOutlet></ShellDataProvider>
                </ContextOutlet>
              </ShellView>
            </ShownPageWait>
          </FocusRegion>
        </PaneSize>
        <AskDockSlot width={width} side={showSide ? SIDEBAR_COLS + 1 : 0} keymap={keymap} pageFocus={pageFocus} />
      </Box>
      <StatusLine waiting={realmWait} />
      <Palette pages={pages} open={palette} onClose={() => setPalette(false)} go={go} recents={recents} onAsk={toggleAsk} />
      <Sheet open={sheet} onClose={() => setSheet(false)} />
      <Menus pages={pages} current={current} go={go} onShortcuts={openSheet} onLeave={actions.quit} />
      <QuitPrompt open={quitAsk} onStay={() => setQuitAsk(false)} onLeave={end} />
      <LeaveConfirm />
      <SignOutConfirm />
      <OtpDialog />
      <TermLock />
      <Toaster />
      <TermPendingNotices />
      {/* Last, so a layer opened in the same commit (the Ask sheet, when a shrink crosses 120 columns) is under it. */}
      <TooSmall onQuit={actions.quit} />
    </Box>
  );
}

export function TermShell(props: TermShellProps) {
  return (
    <KeymapContext value={props.keymap}>
      <LiveShellData>
        <PagesProvider pages={props.pages}>
          {/* What pages contribute to each other (Home's page cards, the Guide's topics, the Board's tile views), as
              AppShell provides it: without it every reader got none (Home had no "Your computer" card). */}
          <ContributionsProvider pages={props.pages}>
            <RenameRealmsProvider>
              <ShellFrame {...props} />
            </RenameRealmsProvider>
          </ContributionsProvider>
        </PagesProvider>
      </LiveShellData>
    </KeymapContext>
  );
}

/** The Tab regions, in the web's DOM order (shell/AppShell.tsx: Sidebar, TopBar, main). */
const REGION = { sidebar: 0, topBar: 1, page: 2 } as const;

/** The content pane's renderable id (tests measure it). */
export const SHELL_PANE_ID = 'hub-shell-pane';
/** Tells the class styles how wide the page pane is: @container conditions are judged by it (jsx/style setStylePane),
 *  so the sidebar, an open dock or a resize that takes columns from the pane re-selects the styles' width band. */
function StylePane(): null {
  const pane = usePaneSize();
  const cols = pane.source === 'pane' ? pane.cols : null;
  useLayoutEffect(() => { setStylePane(cols); }, [cols]);
  useLayoutEffect(() => () => setStylePane(null), []);
  return null;
}
/** The top bar's box: the goldens judge it from the layout (prim/layoutcheck topBarFault, TOP_BAR_ID is the same). */
export const SHELL_TOPBAR_ID = 'hub-shell-topbar';

/** The width the sidebar takes when shown (tests size frames with it). */
export const SIDEBAR_WIDTH = SIDEBAR_COLS;
