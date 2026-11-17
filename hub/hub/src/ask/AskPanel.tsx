// AskPanel.tsx: everything inside the shell's Ask dock: the 48 px header (target chip and its
// popover, Recent, New, Close; on phones ‹ and ⋯), the conversation column and the composer. The shell's AskDock
// is only the frame (aside, grip, width, push/overlay/sheet); this panel fills its full height.
//
// One engine per (account, project, computer, realm) comes from registry.ts and outlives the panel; the panel
// resumes its stream on mount and suspends it on unmount (a closed dock keeps no stream open). Drafts are kept
// per computer, in memory only: dropped for any account other than the shown one while the panel is mounted,
// and all of them at core's account, sign-out or logout bump, mounted or not.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import {
  ActionMenu, Band, Button, ComputerMark, CountBadge, ContextLine, EmptyState, ErrorState, IconButton, ItemList, Link, Meter, Notice, Spinner, MenuFooter, Popover, ReasonButton, Skeleton, TextButton,
  ChatLinkHost, usePageLink, type LinkTarget, cx, formatRelative, menuFooterClass, type ItemProps, useAskDock, useGo, useNow, usePathname, useShellData, useStrings, type RealmColor, type Tone,
} from '@kit';
import { setAskFocus, type AskStartOutcome } from '@kit/ask';
import { agentBaseFor, computerHandle, hostEnv, useChatAttentionRev, useCore, useCurrentComputer, type Target } from '@core';
import { links as aiLinks } from '../pages/ai/links';
import { links as computersLinks } from '../pages/computers/links';
import { links as guideLinks } from '../pages/guide/links';
import { ToPageButton, useOpenChat, usePageTarget, useToPage } from './links';
import { clean, scrubSecrets } from './code';
import { Column, NewConversation } from './Column';
import { DockSession, type DockSessionProps } from './DockSession';
import { ForkBand } from './forkBand';
import { useAskTurnMenu } from './turnMenu';
import { Composer } from './Composer';
import { DockPictures } from './pictures';
import * as C from './conv';
import { newAsk } from './logic';
import { suggestionsFor } from './suggest';
import { claimDraft, draftFresh, draftGet, draftSet, draftWithTaken, dropUntouchedPrefill, dropUntouchedPrefills, markDraftFresh, notePrefill, oweFreshForDraft, purgeDrafts, startTellFor } from './drafts';
import { hideWelcome, useWelcomeHidden } from './welcome';
import type { AskEngine, Snapshot } from './engine';
import type { ClearOutcome, ClearPlan } from './recentClear';
import { activitySource, anyWaiting, engineFor, pokeActivity, slotKey, useEnginesVersion, useOwedMoves, useSnapshot, type ConvRef } from './registry';
import { orderRecent, recentState, shownPhase, type Activity } from './activity';
import type { Slot } from './engine';
import strings from './strings.en.json';
import s from './Ask.module.css';
import { termHead, useTermSheet } from './dockHead';

type T = ReturnType<typeof useStrings<typeof strings>>;

// ---- module state: the composer for focusAsk, the hidden tip (drafts: ./drafts) ----
// Panels mounted now (a close is the last one going).
let openPanels = 0;
let composerEl: HTMLTextAreaElement | null = null;
let panelEl: HTMLElement | null = null;

/** Focus the Ask dock: an open card's first button, else the composer. False when the panel is not mounted. */
export function focusAsk(): boolean {
  const card = panelEl?.querySelector<HTMLElement>('[data-ask-gate] button:not([disabled])');
  const el = card ?? composerEl;
  if (!el) return false;
  el.focus({ preventScroll: false });
  return true;
}
/** Whether focus is inside the Ask panel now (Ctrl/⌘J toggles between dock and page). */
export function askHasFocus(): boolean { return !!panelEl && hostEnv().browserPage === true && panelEl.contains(document.activeElement); }

/** True while any conversation of the shown account waits for the person: the "needs you" dot. */
export function useAskWaiting(): boolean {
  useEnginesVersion();
  // The shell's chat-attention observer: gates in chats nobody is looking at (core).
  useChatAttentionRev();
  const core = useCore();
  return anyWaiting(core.account);
}

/** The panel's computer: the slot its engine is keyed by, and the target its agent is reached at; null without one. */
function useCurrentSlot(): { slot: Slot; target: Target } | null {
  const core = useCore();
  const shell = useShellData();
  const target = useCurrentComputer();
  const comp = shell.computers.find((c) => c.id === (target?.container.id ?? shell.computerId));
  const account = core.account;
  if (!account || !target) return null;
  return { slot: { account, project: target.project.id, computer: target.container.id, realm: core.realm, name: comp?.name ?? '', server: target.container.server_name }, target };
}

const noSub = () => () => {};
const noAct = () => null;
/** How many of the panel computer's conversations run now, from the agent's own state (shared by every
 *  tab of this browser). null while not known: show no count then, never 0 or an older number. */
export function useAskActivity(): Activity | null {
  const cur = useCurrentSlot();
  const k = cur ? slotKey(cur.slot) : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the slot key and its server name the source
  const src = useMemo(() => (cur ? activitySource(cur.slot, cur.target) : null), [k, cur?.slot.server]);
  return useSyncExternalStore(src?.subscribe ?? noSub, src?.get ?? noAct, noAct);
}

const noPh = () => null;
/** Each Recent row's phase from the latest store read a round made (the agent's answer or the page being
 *  hidden does not drop it back to the phase read when Recent opened); null before the first round. */
export function useAskPhases(): Readonly<Record<string, string>> | null {
  const cur = useCurrentSlot();
  const k = cur ? slotKey(cur.slot) : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the slot key and its server name the source
  const src = useMemo(() => (cur ? activitySource(cur.slot, cur.target) : null), [k, cur?.slot.server]);
  return useSyncExternalStore(src?.subscribe ?? noSub, src?.phases ?? noPh, noPh);
}

/** The count in words for an aria label: "2 conversations running, 1 needs you"; '' when none runs or not known. */
export function activityLabel(a: Activity | null, t: T): string {
  if (!a || !a.running) return '';
  const run = t('ask.activity', { count: a.running });
  return a.waiting ? t('ask.activityWaiting', { running: run, count: a.waiting }) : run;
}
/** useAskActivity with its words, for the shell's Agent button (top bar, phone tab). */
export function useAskActivityLabel(): { activity: Activity | null; label: string } {
  const t = useStrings(strings);
  const activity = useAskActivity();
  return { activity, label: activityLabel(activity, t) };
}

/** After the draft's new words are in the box: a web page's next frame. A terminal has no frames (asking for one is a
 *  TERM_GLOBAL trap, in a press or in an effect): a timer of its own, which runs after the commit all the same. */
const nextFrame = (run: () => void): void => {
  if (hostEnv().browserPage === true) requestAnimationFrame(run);
  else setTimeout(run, 0);
};

function usePhone(): boolean {
  const q = '(width < 768px)';
  return useSyncExternalStore(
    (l) => { if (hostEnv().browserPage !== true) return () => {}; const m = window.matchMedia(q); m.addEventListener('change', l); return () => m.removeEventListener('change', l); },
    () => hostEnv().browserPage === true && window.matchMedia(q).matches,
    () => false,
  );
}

const STATE_TONE: Record<string, Tone> = { running: 'ok', stopped: 'neutral', starting: 'warn', attention: 'danger' };

// ---- the panel ----
export interface AskPanelProps {
  /** The Board's Add link for one of the dock chat's marked links (pages/board/links linkBoardAddPath). The router
   *  (app/router.tsx) passes it, so Ask imports nothing from the Board: the kit's own module graph reaches Ask through
   *  the shell (kit/index → shell → TopBar → ask), and the Board's links.ts brings BoardAddButton, which imports '@kit'
   *  Without it the dock's links offer no Put on Board. */
  boardAdd?: (chat: { readonly id: string; readonly project: string; readonly server?: string | undefined }, at: LinkTarget) => string;
}

export function AskPanel({ boardAdd: boardAddOf }: AskPanelProps = {}) {
  const t = useStrings(strings);
  const core = useCore();
  const shell = useShellData();
  const target = useCurrentComputer();
  const dock = useAskDock();
  const phone = usePhone();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { panelEl = root.current; setAskFocus(focusAsk); return () => { panelEl = null; setAskFocus(null); }; }, []);
  useEffect(() => { purgeDrafts(core.loggingOut ? null : core.account); }, [core.account, core.loggingOut]);
  // The panel closed: a page's prefill the person never touched goes; typed or edited text stays. Checked a
  // tick later so a remount at once (StrictMode, a route change under an open dock) is not a close.
  useEffect(() => {
    openPanels++;
    return () => { openPanels--; setTimeout(() => { if (!openPanels) dropUntouchedPrefills(); }, 0); };
  }, []);
  const realm = shell.realms.find((r) => r.id === shell.realmId);
  const comp = shell.computers.find((c) => c.id === (target?.container.id ?? shell.computerId));
  const name = comp?.name ?? '';
  const account = core.account;
  const slot = account && target ? { account, project: target.project.id, computer: target.container.id, realm: core.realm, name, server: target.container.server_name } : null;
  const key = slot ? slotKey(slot) : '';
  // The server is part of the engine's identity (the slot key does not name it): an engine made before it was known reaches no agent.
  const server = slot?.server;
  // An engine that was busy when the server changed keeps its server until it is quiet; the registry then tells the dock (owed moves)
  // and the engine is chosen again, so the move is not left to the dock's next open.
  const owed = useOwedMoves();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the slot key, the server and an owed move name the engine
  const eng = useMemo(() => (slot && target ? engineFor(slot, target) : null), [key, server, owed]);
  // The reply's links read against the dock's computer and its realm's list.
  const go = useGo();
  const linkChat = useMemo(() => (eng ? { id: eng.slot.computer, project: eng.slot.project, name: eng.slot.name, server: eng.slot.server } : null), [eng]);
  const servesBoard = !!usePageLink('board');
  const boardAdd = useMemo(() => (servesBoard && linkChat && boardAddOf ? (tg: LinkTarget) => boardAddOf(linkChat, tg) : undefined), [servesBoard, linkChat, boardAddOf]);
  // Ask the agent to fix it puts words in the shown conversation's composer, which that conversation owns.
  const askRef = useRef<((text: string) => void) | null>(null);
  const ask = useCallback((text: string) => askRef.current?.(text), []);
  // No computer to ask: a page's start cannot be sent; it hears so (and keeps its text).
  useEffect(() => {
    if (eng || !account || !dock.draft?.start) return;
    const d = dock.takeDraft();
    d?.onStart?.('notSent');
  }, [eng, account, dock]);
  return (
    <div ref={root} className={s.panel}>
      {eng ? (
        <ChatLinkHost value={{ chat: linkChat, realm: eng.slot.realm, openHub: go, boardAdd, ask }}>
          <Conversation key={`${key}|${eng.slot.server ?? ""}`} askRef={askRef} eng={eng} target={target as Target} computer={name} computerHref={comp ? computersLinks.item(computerHandle(comp)) : ''} realmName={realm?.name ?? t('ask.thisRealm')} realmColor={realm?.color} server={comp?.location} phone={phone} onClose={dock.close} t={t} />
        </ChatLinkHost>
      ) : (
        <>
          <Header t={t} phone={phone} onClose={dock.close} realmName={realm?.name ?? t('ask.thisRealm')} realmColor={realm?.color} computer={name} computerHref="" eng={null} snap={null} agentUrl="" />
          <div className={s.columnWrap}>
            <div className={s.column}>
              {!account ? <Skeleton variant="text" rows={3} /> : <NoComputer realmName={realm?.name ?? t('ask.thisRealm')} />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** No computer chosen. "None in this realm" is said only from the shell's whole read of the realm's computers that
 *  succeeded (C9): while it loads the panel shows loading, and a failed read says so, with the shell's Try again. */
export function NoComputer({ realmName }: { realmName: string }) {
  const t = useStrings(strings);
  const shell = useShellData();
  // A hidden Computers page gives no action at all, so the state draws no empty action row.
  const computersOn = usePageTarget('computers', computersLinks.list) !== null;
  if (shell.computers.length || shell.realmId === 'all') return <EmptyState icon="computer" size="sm" title={t('ask.noComputer')} action={<PickComputer />} />;
  const retry = shell.retryComputers;
  if (shell.computersRead === 'loading') return <Skeleton variant="text" rows={3} />;
  if (shell.computersRead === 'unknown') return <ErrorState size="sm" title={t('ask.computersNotLoaded', { realm: realmName })} body={t('ask.computersNotLoadedBody')} {...(retry ? { onRetry: () => void retry() } : {})} />;
  return <EmptyState icon="computer" size="sm" title={t('ask.noComputers', { realm: realmName })} body={t('ask.noComputersBody')} action={computersOn ? <ToPageButton page="computers" path={computersLinks.list} label={t('ask.getComputer')} /> : undefined} />;
}

export function PickComputer() {
  const t = useStrings(strings);
  // The same list and the same choice as the top bar's computer switch (which phones hide while the dock is open).
  const shell = useShellData();
  const set = shell.setComputer;
  if (!set || !shell.computers.length) return <ToPageButton page="computers" path={computersLinks.list} label={t('ask.openComputers')} />;
  const items = shell.computers.map((c) => ({ id: c.id, label: c.location ? t('ask.pickRow', { computer: c.name, server: c.location }) : c.name, ...(c.color ? { picture: <ComputerMark color={c.color} /> } : {}), onAction: () => set(c.id) }));
  return <ActionMenu items={items} label={t('ask.pickComputer')} placement="bottom start" trigger={<Button variant="secondary" iconEnd="chevron-down">{t('ask.pickComputer')}</Button>} />;
}

interface ConvProps {
  eng: AskEngine; target: Target; computer: string; computerHref: string; realmName: string; realmColor?: RealmColor; server?: string;
  phone: boolean; onClose: () => void; t: T;
  /** Where the panel's Ask the agent to fix it reaches this conversation's composer. */
  askRef: RefObject<((text: string) => void) | null>;
}

function Conversation({ eng, target, computer, computerHref, realmName, realmColor, server, phone, onClose, t, askRef }: ConvProps) {
  const snap = useSnapshot(eng);
  const turnMenu = useAskTurnMenu(eng, snap);
  const dock = useAskDock();
  const path = usePathname();
  const k = slotKey(eng.slot);
  const [draft, setDraftState] = useState(() => draftGet(k) ?? '');
  const setDraft = (v: string) => { draftSet(k, v); setDraftState(v); };
  // A Not sent message with files comes back to be fixed: its files join the draft's, its text the
  // composer's (after what is typed there, on a new line). The text is the person's own.
  const onEdit = (uid: string) => {
    const text = eng.takeBack(uid);
    if (text === null) return;
    claimDraft(k);
    setDraft(draft.trim() ? `${draft}\n${text}` : text);
    input.current?.focus();
  };
  // A handed-off first message (the chat was opened by another tab or a Check) is never sent by the page: its text comes
  // back to the composer as a draft, and the person presses Send.
  useEffect(() => { for (const uid of eng.restorable()) onEdit(uid); });
  // Once the dock's conversation has a session it is drawn by the kit's SessionView (DockSession), over this same engine; before, by the
  // column the dock always had. A Not sent message taken back there brings its text to the composer, as above.
  // Read from the store when the text arrives (Edit on a queued message answers after a wait): never this render's `draft`.
  const takeBackText = (text: string) => {
    claimDraft(k);
    setDraft(draftWithTaken(k, text));
    input.current?.focus();
  };
  useEffect(() => {
    askRef.current = takeBackText;
    return () => { if (askRef.current === takeBackText) askRef.current = null; };
  });
  const [note, setNote] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [typing, setTyping] = useState(false);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const agentUrl = agentBaseFor(target.project, target.container);
  useEffect(() => { const el = input.current; composerEl = el; return () => { if (composerEl === el) composerEl = null; }; });
  // Any edit in the composer (a keystroke, paste or cut, also one that leaves the same text, which React's onChange
  // never reports) makes the draft the person's. A page's prefill writes the value, firing no input event.
  useEffect(() => {
    const el = input.current;
    // The web textarea's input event, or the terminal composer's handle, which tells its listeners on every edit the person makes.
    if (!el || typeof el.addEventListener !== 'function') return;
    const own = () => claimDraft(k);
    el.addEventListener('input', own);
    return () => el.removeEventListener('input', own);
  });
  // The dock open: the stream resumes by replay; closed or switched away: no stream stays open.
  useEffect(() => { eng.resume(); return () => eng.suspend(); }, [eng]);
  // A send, a turn ending or a card opening here: the running count is read again at once.
  useEffect(() => { pokeActivity(eng.slot); }, [eng, snap.status]);
  // Back from a hidden tab, offline, or another tab's change to the conversations: the session is read again.
  useEffect(() => {
    const env = hostEnv();
    const wake = () => { if (env.visible()) eng.wake(); };
    const offs = [env.onVisibilityChange(wake), env.onLifecycle('online', wake), env.onExternalChange(wake)];
    return () => { for (const off of offs) off(); };
  }, [eng]);
  // A page's text always opens a NEW conversation: the one open before stays in Recent, untouched, and is never
  // appended to. The engine (it outlives the panel and a StrictMode replay) waits for the stored conversation and for
  // anything of it still in flight. A start (Home's quick ask) is then sent as the new conversation's first message,
  // and its page hears how it went; a prefill fills the composer (appended to any draft on a new line, caret at the
  // end, a short flash, a note) and is never sent.
  useEffect(() => {
    const raw = dock.takeDraft(target.container.id) as unknown;
    if (raw === undefined || raw === null) return;
    const text = typeof raw === 'string' ? raw : typeof (raw as { text?: unknown }).text === 'string' ? (raw as { text: string }).text : '';
    const source = typeof raw === 'object' && typeof (raw as { source?: unknown }).source === 'string' ? (raw as { source: string }).source : '';
    if (typeof raw === 'object' && (raw as { start?: unknown }).start === true) {
      const fn = (raw as { onStart?: unknown }).onStart;
      const told = typeof fn === 'function' ? (o: AskStartOutcome) => (fn as (o: AskStartOutcome) => void)(o) : () => {};
      // A later start takes out a prefill the person never touched, before its mark is read.
      const kept = dropUntouchedPrefill(k);
      if (kept !== null) setDraftState(kept);
      const tell = startTellFor(k, told);
      if (!text.trim()) { tell('notSent'); return; }
      eng.queueStart(text, tell);
      return;
    }
    if (!text) return;
    // A later prefill replaces an earlier one the person never touched; an edited one stays and this one follows it.
    dropUntouchedPrefill(k);
    const owedBefore = draftFresh(k);
    const engOwed = eng.owesFresh();
    eng.wantFresh();
    const cur = draftGet(k) ?? '';
    const next = cur.trim() ? cur.replace(/\s+$/, '') + '\n' + text : text;
    draftSet(k, next);
    markDraftFresh(k, true);
    notePrefill(k, cur, next, owedBefore, engOwed ? null : () => eng.releaseFresh());
    setDraftState(next);
    setNote(source ? t('ask.prefillFrom', { source }) : t('ask.prefillPlain'));
    setFlash(true);
    const id = setTimeout(() => setFlash(false), 600);
    nextFrame(() => { const el = input.current; if (el) { el.focus(); el.setSelectionRange(next.length, next.length); } });
    return () => clearTimeout(id);
  }, [dock.draft, k, dock, t, eng, target.container.id]);
  // A prefilled draft kept from an earlier engine of this slot (a realm switch and back) still goes to a new one.
  useEffect(() => { oweFreshForDraft(k, eng); }, [eng, k]);
  // A switched computer whose task still runs: a note row for 10 s with the way back.
  const fill = (text: string) => {
    setDraft(text);
    nextFrame(() => { const el = input.current; if (el) { el.focus(); el.setSelectionRange(text.length, text.length); } });
  };
  const empty = <FirstUse computer={computer} path={path} onPick={fill} t={t} />;
  const band = snap.band;
  // The engine was made for a server the computer's latest row no longer names (withheld, or moved while this engine is busy):
  // core sends none of its requests until a row names it again, and this conversation, its draft and its outcomes stay.
  const withheld = !!eng.slot.server && eng.slot.server !== target.container.server_name;
  const top = withheld
    ? <Band tone="warn" icon="warn">{t('ask.withheld')}</Band>
    : band?.k === 'unreachable'
    ? <Band tone="warn" icon="warn" actions={<Button size="sm" variant="secondary" onPress={() => eng.open()}>{t('ask.tryAgain')}</Button>}>{t('ask.unreachable', { computer })}</Band>
    : snap.status === 'lost'
      ? <Band tone="warn" icon="warn" actions={<Button size="sm" variant="secondary" onPress={() => eng.checkNow()}>{t('ask.checkStatus')}</Button>}>{t('ask.lost')}</Band>
      : undefined;
  const topAll = <>{top}<ForkBand eng={eng} /></>;
  const conv = dockConvRef(eng, target);
  const openInAi = useOpenInAi(eng, conv, snap, onClose, computer);
  return (
    <>
      <Header t={t} phone={phone} onClose={onClose} realmName={realmName} realmColor={realmColor} computer={computer} computerHref={computerHref} server={server} eng={eng} snap={snap} agentUrl={agentUrl} openInAi={openInAi} />
      {snap.phase === 'blocked' && snap.blocked ? (
        <div className={s.columnWrap}><div className={s.column}><Blocked b={snap.blocked} eng={eng} computer={computer} agentUrl={agentUrl} t={t} /></div></div>
      ) : snap.band?.k === 'provisioning' ? (
        <div className={s.columnWrap}><div className={s.column}><Provisioning computer={computer} t={t} /></div></div>
      ) : snap.phase === 'checking' && !snap.conv.turns.length && !snap.band ? (
        <div className={s.columnWrap}><div className={s.column}><Skeleton variant="text" rows={4} /></div></div>
      ) : (
        <ConvBody
          eng={eng} conv={conv} host={{ computer, realm: realmName }} agentUrl={agentUrl} typing={typing} empty={empty} top={topAll} turnMenu={turnMenu} onTakeBack={takeBackText}
          column={<Column eng={eng} snap={snap} agentUrl={agentUrl} typing={typing} empty={empty} top={topAll} onEdit={onEdit} turnMenu={turnMenu} />}
        />
      )}
      {snap.phase !== 'blocked' && <StatusLine snap={snap} t={t} />}
      {snap.recentFull && <p className={s.recentNote} role="note">{t('ask.recentFull')}</p>}
      {band?.k === 'stopped' && (
        <Band tone="neutral" icon="pause" className={s.band} actions={<Button size="sm" variant="secondary" busy={snap.starting} onPress={() => eng.startComputer()} aria-label={t('ask.start', { computer })}>{t('ask.startShort')}</Button>}>{t('ask.stopped', { computer })}</Band>
      )}
      {band?.k === 'starting' && <Band tone="neutral" icon="clock" className={s.band}>{t('ask.starting', { computer })}</Band>}
      {band?.k === 'busy' && (
        <Band tone="warn" icon="info" className={s.band} actions={agentUrl ? <Link href={agentUrl} target="_blank" rel="noopener noreferrer" iconEnd="external">{t('ask.openAgent')}</Link> : undefined}>{t('ask.busy')}</Band>
      )}
      {snap.phase !== 'blocked' && (
        <Composer eng={eng} snap={snap} computer={computer} draft={draft} setDraft={setDraft} note={note} onDismissNote={() => setNote(null)} flash={flash} inputRef={input} onTyping={setTyping} />
      )}
    </>
  );
}

/** The reference of the conversation the dock's engine holds, or null before it has a session (or a named computer to name it by). */
export function dockConvRef(eng: AskEngine, target: Target): ConvRef | null {
  const sid = eng.session(), realm = eng.record?.r, name = target.container.server_name;
  return sid && realm && name ? { computer: computerHandle({ id: target.container.id, name }), realm, sid } : null;
}

/** Open in AI: the same conversation on the AI page, by its reference, and the dock closes. The registry makes the move
 *  (openRef): at a quiet point the conversation goes to the page's engine; while a send, a decision or an unknown outcome is
 *  still this engine's to finish, the page is lent this engine (nothing is sent again, a pending row stays pending), and the
 *  dock stays open until that is settled, since this engine streams only while the dock shows it. The dock closes only once
 *  the page shows that conversation by this press: a navigation held by a leave confirmation closes nothing, a cancelled one
 *  leaves the dock as it was, and reaching the conversation later some other way is not this press. Returns the action; null when there is no conversation to open yet; undefined when this load serves no
 *  AI page. `snap`: the engine's snapshot, so the wait is judged again at each change. `name`: the computer's name as its row
 *  says now (the engine keeps the name it was made with across a rename; the AI page finds the computer by its current one). */
export function useOpenInAi(eng: AskEngine, conv: ConvRef | null, snap: Snapshot, onClose: () => void, name: string): (() => void) | null | undefined {
  const openChat = useOpenChat();
  const aiServed = usePageLink('ai')?.kind === 'hub';
  const path = usePathname();
  // The session on its way to the page: `from` the path it was asked on, `passed.yes` once the press's own navigation got past
  // every leave confirmation (useOpenChat's onPassed), `arrived` once the page shows it.
  const [moving, setMoving] = useState<{ sid: string; from: string; passed: { yes: boolean }; arrived: boolean } | null>(null);
  useEffect(() => {
    if (moving === null) return;
    const atChat = path === `/ai/c/${moving.sid}` || path === `/ai/c/${encodeURIComponent(moving.sid)}`;
    if (!moving.arrived) {
      // At the chat by this press: arrived. At it some other way (this press was cancelled): this press is over, nothing closes.
      if (atChat) setMoving(moving.passed.yes ? { ...moving, arrived: true } : null);
      // Still where it was asked (a leave confirmation is open, or it was cancelled): nothing closes. Gone elsewhere: done.
      else if (path !== moving.from) setMoving(null);
      return;
    }
    // Left the chat's page before it settled: the dock stays, as the person now wants it.
    if (!atChat) { setMoving(null); return; }
    if (eng.session() !== moving.sid || eng.quiet()) { setMoving(null); onClose(); }
  }, [moving, snap, path, eng, onClose]);
  if (!aiServed) return undefined;
  // The link names the computer by its current name (as the registry's hand-off and the AI page's lists do), so the page finds it.
  const chat = conv && name ? { computer: computerHandle({ id: eng.slot.computer, name }), realm: conv.realm, sid: conv.sid } : null;
  if (!chat) return null;
  return () => {
    const passed = { yes: false };
    if (!openChat(chat, () => { passed.yes = true; })) return;
    setMoving({ sid: chat.sid, from: path, passed, arrived: false });
  };
}

/** The dock's transcript: the kit's SessionView over the dock's own engine once its conversation has a session, the dock's column before.
 *  Both draw inside the dock's picture reader (DockPictures), so a message's stored pictures and a step's pictures read in either. */
export function ConvBody({ column, ...rest }: Omit<DockSessionProps, 'fallback'> & { column: ReactNode }) {
  return <DockPictures eng={rest.eng}><DockSession {...rest} fallback={column} /></DockPictures>;
}

// ---- header ----
export interface HeaderProps {
  t: T; phone: boolean; onClose: () => void; realmName: string; realmColor?: RealmColor; computer: string; computerHref: string; server?: string;
  eng: AskEngine | null; snap: Snapshot | null; agentUrl: string;
  /** Open in AI: shows this conversation on the AI page and closes the dock. null: nothing to open yet (no conversation, or
   *  its first message is still on its way), so the button says why. Absent: this load serves no AI page, so no button. */
  openInAi?: (() => void) | null;
}
export function Header({ t, phone, onClose, realmName, realmColor, computer, computerHref, server, eng, snap, agentUrl, openInAi }: HeaderProps) {
  const [confirm, setConfirm] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  // The target popover's links lead to a page: following one closes the popover (it would stay over the page it
  // opened), and a dock drawn as a full-screen sheet (a phone; a narrow terminal) closes too, or the new page would
  // stay hidden under it. A side pane stays open beside the page.
  const [targetOpen, setTargetOpen] = useState(false);
  const termSheet = useTermSheet();
  const followed = () => { setTargetOpen(false); if (phone || termSheet) onClose(); };
  const shut = () => setTargetOpen(false);
  const toPage = useToPage();
  const running = !!snap && C.running(C.current(snap.conv));
  // A first message that may have gone through (its Check lives only in this conversation) is asked about like a running task: the person's own
  // New conversation may still take it away, never silently.
  const unsure = !!eng && !!snap && typeof eng.holdsUnknownCreate === 'function' && eng.holdsUnknownCreate();
  const newWords = newAsk(running, unsure);
  // A first message still on its way: New waits for it, saying why (a reset would drop it: C9).
  const inFlight = !!snap && !!eng && eng.newWaits();
  const onNew = () => { if (!eng) return; if (newWords) setConfirm(true); else eng.newConversation(); };
  const act = useAskActivity();
  const phases = useAskPhases();
  const actLabel = activityLabel(act, t);
  const openRecent = (v: boolean) => { setRecentOpen(v); if (v && eng) { eng.loadRecent(); pokeActivity(eng.slot); } };
  // The engine knows the popover is open (a kept dock retry then refreshes the list on screen); an unmount or a replaced engine clears it.
  useEffect(() => {
    if (!eng) return;
    eng.setRecentShown(recentOpen);
    return () => eng.setRecentShown(false);
  }, [eng, recentOpen]);
  // The terminal draws the header with its own parts (dockHead.term.tsx); the web's markup stays here (H is null there).
  const H = termHead;
  if (confirm && eng) {
    const yes = <Button size="sm" variant="secondary" onPress={() => { setConfirm(false); eng.newConversation(); }}>{t('ask.newYes')}</Button>;
    const no = <Button size="sm" variant="ghost" onPress={() => setConfirm(false)}>{t('ask.cancel')}</Button>;
    return H ? (
      <H.HeadRow confirm><H.HeadText>{t(newWords ?? 'ask.newConfirm')}</H.HeadText>{yes}{no}</H.HeadRow>
    ) : (
      <header className={cx(s.head, s.headConfirm)}>
        <span className={s.confirmText}>{t(newWords ?? 'ask.newConfirm')}</span>
        {yes}
        {no}
      </header>
    );
  }
  const state = snap?.band?.k === 'stopped' ? 'stopped' : snap?.band?.k === 'starting' || snap?.band?.k === 'provisioning' ? 'starting' : snap?.blocked?.key === 'ask.computerFailed' ? 'attention' : 'running';
  const chip = (
    <Popover
      label={t('ask.targetPop')}
      title={t('ask.targetPop')}
      width="md"
      isOpen={targetOpen}
      onOpenChange={setTargetOpen}
      trigger={
        <Button variant="ghost" size="sm" className={s.chip} iconEnd="chevron-down">
          <ContextLine realm={{ name: realmName, color: realmColor }} computer={computer ? { name: computer, tone: STATE_TONE[state], state: t(`ask.state.${state as 'running'}`) } : undefined} />
        </Button>
      }
    >
      <dl className={s.targetFacts}>
        <dt>{t('ask.tRealm')}</dt><dd>{realmName}<span className={s.muted}>{t('ask.tRealmNote')}</span></dd>
        {computer && <><dt>{t('ask.tComputer')}</dt><dd>{computer} · {t(`ask.state.${state as 'running'}`)}{server && <span className={s.muted}>{server}</span>}{computerHref && toPage('computers', computerHref, t('ask.openComputer'), { variant: 'nav', onFollow: followed })}</dd></>}
        <dt>{t('ask.tAgent')}</dt><dd>{t('ask.tAgentValue')}{agentUrl && <Link href={agentUrl} variant="nav" target="_blank" rel="noopener noreferrer" iconEnd="external" onPress={shut}>{t('ask.openAgent')}</Link>}</dd>
        <dt>{t('ask.tModel')}</dt><dd>{t('ask.tModelValue')}{toPage('ai', aiLinks.list, t('ask.openModels'), { variant: 'nav', onFollow: followed })}</dd>
        <dt>{t('ask.tOwn')}</dt><dd>{t('ask.tOwnValue')}{toPage('guide', guideLinks.section('connect'), t('ask.welcomeLink'), { variant: 'nav', onFollow: followed })}</dd>
      </dl>
    </Popover>
  );
  const recentButton = <IconButton icon="clock" label={actLabel ? t('ask.recentWith', { label: actLabel }) : t('ask.recent')} />;
  const recent = eng && (
    <Popover label={t('ask.recent')} title={t('ask.recent')} width="md" flush isOpen={recentOpen} onOpenChange={openRecent} placement="bottom end"
      trigger={
        H ? (
          <H.CountWrap count={actLabel ? act?.running : null}>{recentButton}</H.CountWrap>
        ) : (
          <span className={s.countWrap}>
            {recentButton}
            {/* The button's name already carries the count (recentWith): the badge is hidden from assistive tech. */}
          {actLabel ? <span className={s.countPin}><CountBadge count={act?.running ?? 0} tone="accent" hidden /></span> : null}
          </span>
        )
      }>
      {(close) => (
        <>
          <Recent rows={snap?.recent ?? null} act={act} ph={phases} t={t} onPick={(k1) => { close(); markDraftFresh(slotKey(eng.slot), false); eng.openConversation(k1); }} />
          <RecentClear eng={eng} snap={snap} computer={computer} t={t} />
        </>
      )}
    </Popover>
  );
  const back = phone && <IconButton icon="chevron-left" label={t('ask.back')} onPress={onClose} />;
  const newChat = eng && <IconButton icon="pen" label={t('ask.new')} isDisabled={inFlight} description={inFlight ? t('ask.newWait') : undefined} onPress={onNew} />;
  const openAi = eng && openInAi !== undefined && <IconButton icon="maximize" label={t('ask.openInAi')} isDisabled={openInAi === null} description={openInAi === null ? t(inFlight ? 'ask.newWait' : 'ask.openInAiNone') : t('ask.openInAiTip')} onPress={() => openInAi?.()} />;
  const closeDock = !phone && <IconButton icon="x" label={t('ask.close')} onPress={onClose} />;
  return H ? (
    <H.HeadRow>{back}{chip}<H.HeadEnd>{recent}{openAi}{newChat}{closeDock}</H.HeadEnd></H.HeadRow>
  ) : (
    <header className={s.head}>
      {back}
      {chip}
      <span className={s.headEnd}>
        {recent}
        {openAi}
        {newChat}
        {closeDock}
      </span>
    </header>
  );
}

const ROW_TONE: Record<string, Tone> = { Running: 'ok', Waiting: 'accent', Failed: 'danger', Unknown: 'warn' };

export function Recent({ rows, act, ph, onPick, t }: { rows: Snapshot['recent']; act: Activity | null; ph: Readonly<Record<string, string>> | null; onPick: (k1: string) => void; t: T }) {
  if (!rows) return <Skeleton variant="rows" rows={3} />;
  if (!rows.length) return <p className={s.recentEmpty}>{t('ask.recentEmpty')}</p>;
  const now = Date.now();
  // The agent's own word on each conversation (activity.ts recentState), waiting and running ones first.
  const shown = orderRecent(rows, act);
  const items: ItemProps[] = shown.map((r) => {
    const st = recentState(shownPhase(r.ph, ph?.[r.k1]), act?.by[r.k1]);
    const time = r.at ? formatRelative(r.at, now) : '';
    const meta = [time, r.current ? t('ask.recentHere') : ''].filter(Boolean) as string[];
    return {
      id: r.k1,
      title: r.title || t('ask.recentUntitled'),
      onOpen: () => onPick(r.k1),
      status: { tone: ROW_TONE[st] ?? 'neutral', label: t(`ask.row${st}`) },
      ...(meta.length ? { meta: meta as [string] | [string, string] } : {}),
    };
  });
  return <ItemList label={t('ask.recent')} items={items} />;
}

/** What Clear list says after it ran: a strings key (and its count). Rows stay as the list shows them unless the outcome republished. */
function clearWords(o: ClearOutcome): { key: string; count?: number; again?: boolean } {
  switch (o.t) {
    case 'done': return { key: 'ask.clearDone', count: o.removed };
    case 'some': return { key: 'ask.clearSome' };
    case 'none': return { key: 'ask.clearNothing' };
    case 'same': return { key: 'ask.clearSame' };
    case 'unreadable': return { key: 'ask.clearUnreadable' };
    case 'full': return { key: 'ask.clearFull' };
    case 'account': return { key: 'ask.clearAccount' };
    case 'refused': return { key: 'ask.clearNoLocks' };
    case 'stale': return { key: 'ask.clearStale' };
    case 'unconfirmed': return { key: 'ask.clearUnconfirmed', again: true };
  }
}
// A 'none' result holds for the rows it was read for: once Recent shows other rows, the cheap checks decide again.
// The rows are compared by what Clear's checks read (which conversations, their phase, which is open), never by the array: the engine
// publishes a new array for the same rows (the titles' lookup, a reload that kept them, a record moved to the front), and that
// must not end the result: the key is the sorted rows, so their order does not count.
// The checks also read state no row shows (a session going idle on its computer, another engine letting go of one), so a held entry,
// a 'none' result or the cheap checks' zero, never outlives CLEAR_RECHECK_MS: then the result ends and the cheap checks are read again
// (no server read), and Clear is offered again if they pass.
export const CLEAR_RECHECK_MS = 15_000;
type ClearView = { k: 'idle'; said?: ClearOutcome } | { k: 'checking' } | { k: 'none'; rows: string } | { k: 'confirm'; plan: ClearPlan } | { k: 'working' } | { k: 'unsure'; plan: ClearPlan };

/** Clear list, in the Recent popover's footer: it hides references and never deletes. The plan (a fresh read of each finished
 *  conversation's own state) is dropped when the popover closes (this unmounts) or the engine's account, slot or generation moves. */
export function RecentClear({ eng, snap, computer, t }: { eng: AskEngine; snap: Snapshot | null; computer: string; t: T }) {
  const [view, setView] = useState<ClearView>({ k: 'idle' });
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const support = eng.clearSupport();
  // The cheap checks (no server read) decide whether Clear is offered at all; they are read again whenever the rows change.
  const recent = snap?.recent;
  const rowsKey = useMemo(() => JSON.stringify(recent?.map((r) => JSON.stringify([r.k1, r.ph, r.current])).sort() ?? null), [recent]);
  const [near, setNear] = useState(-1);
  const [tick, setTick] = useState(0);
  useEffect(() => { setNear(support === 'ok' ? eng.clearCandidatesNow() : -1); }, [eng, support, recent, view.k, tick]);
  useEffect(() => { if (view.k === 'confirm' && !eng.planLive(view.plan)) setView({ k: 'idle' }); }, [eng, snap, view]);
  useEffect(() => { if (view.k === 'none' && view.rows !== rowsKey) setView({ k: 'idle' }); }, [rowsKey, view]);
  const noneNow = view.k === 'none' && view.rows === rowsKey;
  const held = support === 'ok' && (noneNow || (near === 0 && view.k === 'idle'));
  useEffect(() => {
    if (!held) return;
    const id = setTimeout(() => {
      setView((v) => (v.k === 'none' ? { k: 'idle' } : v));
      setTick((n) => n + 1);
    }, CLEAR_RECHECK_MS);
    return () => clearTimeout(id);
  }, [held, view, tick]);
  if (support === 'no') return null;
  const group = t('ask.recentActions');
  const plan = async () => {
    const rows = rowsKey;
    setView({ k: 'checking' });
    const p = await eng.planClear();
    if (!mounted.current) return;
    if (!p) return setView({ k: 'idle', said: { t: 'stale' } });
    setView(p.keys.length ? { k: 'confirm', plan: p } : { k: 'none', rows });
  };
  const run = async (p: ClearPlan) => {
    setView({ k: 'working' });
    // The popover closing drops the plan: `mounted` is read again inside the write, under the dock lock.
    const o = await eng.clearRecent(p, () => mounted.current);
    if (!mounted.current) return;
    setView(o.t === 'unconfirmed' ? { k: 'unsure', plan: { ...p, keys: o.keys } } : { k: 'idle', said: o });
  };
  const again = (p: ClearPlan) => { const o = eng.verifyClear(p); setView(o.t === 'unconfirmed' ? { k: 'unsure', plan: { ...p, keys: o.keys } } : { k: 'idle', said: o }); };
  const words = view.k === 'idle' && view.said ? clearWords(view.said) : view.k === 'unsure' ? clearWords({ t: 'unconfirmed', keys: [] }) : null;
  let footer: ReactNode;
  if (support === 'noLocks') footer = <div className={cx(menuFooterClass)} role="group" aria-label={group}><ReasonButton reason={t('ask.clearNoLocks')} size="sm">{t('ask.clearList')}</ReasonButton></div>;
  else if (view.k === 'checking') footer = <p className={s.clearNote} role="status">{t('ask.clearChecking')}</p>;
  else if (view.k === 'working') footer = <p className={s.clearNote} role="status">{t('ask.clearWorking')}</p>;
  else if (view.k === 'confirm') {
    const p = view.plan;
    footer = (
      <>
        <p className={s.clearNote} role="status">{t('ask.clearConfirm', { count: p.keys.length, computer })}</p>
        <MenuFooter label={group} actions={[{ id: 'clear-yes', label: t('ask.clearYes'), onPress: () => { void run(p); } }, { id: 'clear-no', label: t('ask.cancel'), onPress: () => setView({ k: 'idle' }) }]} />
      </>
    );
  } else if (view.k === 'unsure') footer = null;
  else if (noneNow || near === 0) footer = <div className={cx(menuFooterClass)} role="group" aria-label={group}><ReasonButton reason={t('ask.clearNone')} size="sm">{t('ask.clearList')}</ReasonButton></div>;
  else footer = <MenuFooter label={group} actions={[{ id: 'clear-list', label: t('ask.clearList'), onPress: () => { void plan(); } }]} />;
  return (
    <>
      {words && <p className={s.clearNote} role="status">{t(words.key as 'ask.clearSame', { count: words.count ?? 0 })}</p>}
      {view.k === 'unsure' && <p className={s.clearAgain}><TextButton onPress={() => again(view.plan)}>{t('ask.clearCheckAgain')}</TextButton></p>}
      {footer}
    </>
  );
}

// ---- states ----
/** A blocked view (exported for the New-while-sending test). */
export function Blocked({ b, eng, computer, agentUrl, t }: { b: NonNullable<Snapshot['blocked']>; eng: AskEngine; computer: string; agentUrl: string; t: T }) {
  const title = t(b.key as 'ask.unsupported', { computer });
  const agent = b.act === 'agent' && agentUrl ? <Link href={agentUrl} target="_blank" rel="noopener noreferrer" iconEnd="external">{t('ask.openAgent')}</Link> : null;
  // A hidden page gives no control at all, so the state draws no empty action row.
  const computersOn = usePageTarget('computers', computersLinks.list) !== null;
  const guideOn = usePageTarget('guide', guideLinks.section('ask')) !== null;
  const guide = guideOn ? <ToPageButton page="guide" path={guideLinks.section('ask')} label={t('ask.guideLink')} /> : undefined;
  // ErrorState's own body speaks of a network failure: each blocked view passes the body that fits its title.
  if (b.key === 'ask.computerFailed') return <ErrorState size="sm" title={title} body={t('ask.blockedBody.failed')} secondary={computersOn ? <ToPageButton page="computers" path={computersLinks.list} label={t('ask.openComputers')} /> : undefined} />;
  if (b.key === 'ask.gone') return <EmptyState icon="info" size="sm" title={title} action={<NewConversation eng={eng} t={t} />} />;
  if (b.act === 'retry') return <ErrorState size="sm" title={title} body={t(b.key === 'ask.accessRefused' ? 'ask.blockedBody.refused' : 'ask.blockedBody.retry')} onRetry={() => eng.open()} secondary={agent ?? guide} />;
  return <EmptyState icon={b.tone === 'bad' ? 'error' : 'info'} size="sm" title={title} action={agent ?? undefined} secondary={guide} />;
}

function Provisioning({ computer, t }: { computer: string; t: T }) {
  return (
    <div className={s.prov}>
      <p>{t('ask.provisioning', { computer })}</p>
      <Meter indeterminate size="fill" label={t('ask.provisioning', { computer })} />
    </div>
  );
}

/** The status line under the column (exported for the clock test). */
export function StatusLine({ snap, t }: { snap: Snapshot; t: T }) {
  const tb = C.current(snap.conv);
  const live = snap.status === 'working';
  const now = useNow(live);
  // A send whose outcome is unknown has no turn to report on yet (its own line says so).
  const unsure = !!tb && !tb.s.turnId && tb.users.some((id) => snap.conv.users[id]?.state === 'unknown');
  if (!snap.status || snap.status === 'lost' || unsure) return <div className={s.status} aria-live="polite" />;
  const since = tb?.startedAt ?? null;
  const time = since ? duration(now - since) : '';
  const step = tb ? [...tb.s.steps].reverse().find((x) => x.ok === null) : undefined;
  // The step's words as its trail row shows them: keys hidden, then cleaned and cut.
  const doing = step ? clean(scrubSecrets(step.summary || step.name), 200).text : '';
  const text = snap.status === 'working'
    ? (doing ? t('ask.status.workingStep', { step: doing, time }) : t('ask.status.working', { time }))
    : t(`ask.status.${snap.status}`);
  return (
    <div className={cx(s.status, snap.status === 'waiting' && s.statusWait)} aria-live="polite">
      {snap.status === 'waiting' ? <span className={s.accentDot} aria-hidden="true" /> : <Spinner />}
      <span className={s.statusText}>{text}</span>
    </div>
  );
}
function duration(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  return sec < 60 ? `${sec} s` : `${Math.floor(sec / 60)} m ${sec % 60} s`;
}

export function FirstUse({ computer, path, onPick, t }: { computer: string; path: string; onPick: (text: string) => void; t: T }) {
  const sg = suggestionsFor(path);
  const hidden = useWelcomeHidden();
  const toPage = useToPage();
  return (
    <div className={s.first}>
      <h2 className={s.firstTitle}>{t('ask.firstTitle', { computer })}</h2>
      <p className={s.firstBody}>{t('ask.firstBody')}</p>
      <ItemList label={t('ask.suggestions')} items={sg.list.map((k) => ({ id: k, title: t(`ask.s.${k}.l`), leading: sg.icon, onOpen: () => onPick(t(`ask.s.${k}.p`)) }))} />
      {/* The welcome note: once dismissed it stays hidden on this browser; the same link stays in the target popover. */}
      {!hidden && (
        <aside className={s.tip} aria-label={t('ask.welcomeLabel')}>
          <Notice>{t('ask.welcome')}</Notice>
          <p className={s.tipActions}>
            {toPage('guide', guideLinks.section('connect'), t('ask.welcomeLink'), { variant: 'nav' })}
            <TextButton onPress={hideWelcome}>{t('ask.welcomeHide')}</TextButton>
          </p>
        </aside>
      )}
    </div>
  );
}
