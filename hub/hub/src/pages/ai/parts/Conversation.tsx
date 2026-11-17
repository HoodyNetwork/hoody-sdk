// The open chat on /ai/c/<sid>. Its source comes from the chat's own reference
// (computer handle, realm, session id; never the top bar) through kit/agent/conversations, so a reload or a hand-off from
// New chat looks the same. The kit's ConversationView draws it: the header, the transcript with its gates, Details
// (Activity, Edits, Usage) taking the pane's place at m and l. The source is the ACTIVE one (through
// kit/agent/conversationsActive), so Send, Stop and the gate card's buttons act, each only when the capability table allows
// and otherwise saying why. An outcome without proof stays "may have gone through" and nothing sends it again (C9).
// Without a source (the chat is on a computer the top bar does not show, or none can be opened) the chat's header says
// so; nothing is drawn as another computer's chat.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from 'react';
import { agent, agentBaseFor, isRealmOrGlobal, useCore, useRealms, type Target } from '@core';
import { attach as A, readFiles, revoke } from '@ask/io';
import {
  AllowEverythingConfirm, ApprovalMode, GateAllowAll, allowEverythingOffered, useApproval, useApprovalModeNote,
  Button, Composer, ConfirmDialog, ConversationView, copyReply, IconButton, useModelCatalogue, PauseBand, RateLimitChip, ShellJobRows, SplitLayout, TextButton, composerPlain, createUsageStore, forkItems, forkWholeItems, formatBytes, formatNumber, shownShellJobs,
  CONV_AUTO as AUTO, CONV_MAX as MAX, ChatLinkHost, StepPictureHost, type StepPictureReader, readSessionImage, queuedIsCommand, queuedOf, setQueued, useQueuedSend, usePageLink, type LinkTarget, useActiveConversationHold, useConvComposer, useGo, useNow, useShellData, useSizeClass, useStrings, useWhy, useWindowTitleDetail,
  type ActiveSource, type ComposerFiles, type ComposerNote, type ConvRef, type ConvSnapshot, type DraftFile, type ForkHost, type ForkOutcome, type PendingRef, type ShellJobStops, type ShellJobStopsSnapshot,
  type DetailsTab, type ShownComputer,
} from '@kit';
import { linkBoardAddPath } from '../../board/links';
import { chatAgentLink, chatLink, links } from '../links';
import { forkOrigins, type ForkAt } from './forkOrigins';
import { keyOf } from './chats.logic';
import { useAutoApproveTurn } from './autoApproveTurn';
import { attemptTarget, attemptsOf, takeBackToDraft } from './conversationAttempts';
import { ChatHead } from './Main';
import { ConvMenu, type MenuAsk } from './ConvMenu';
import { SessionPanel } from './SessionPanel';
import { UsageTurns } from './usageTurns';
import { attemptKey, type ChatId } from './closeAttempts';
import { listShows } from './RowChat';
import { useAiChats, useAiPause, useRealmName } from './Pane';
import { useTrimMenu, type TrimNow } from './trimItems';
import { useSlashCommands, type HostRuns, type SlashAt, type SlashCommand } from './slashCommands';
import { SlashTurns, turnArg, type TurnAsk, type TurnAskOf, type TurnProviders } from './slashTurns';
import { chatAgent, hasNoTools } from './capability';
import { useAgents } from '../agents/data';
import { useMentionFiles, type MentionAt } from './mentionFiles';
import { fromOf } from './attachOrigin';
import { AttachDialogs, useAttachSources, type AttachDialogsShown } from './attachSources';
import { pageFaq } from '../faq';
import aiStrings from '../strings.en.json';
import strings from './Conversation.strings.en.json';
import s from './Conversation.module.css';
import { FILE_READ_MAX, readFileBytes } from '../../files/links';

/** What a chat's own "/" command asks the page for: a chat menu dialog, or a Details tab. */
type HostAsk = 'rename' | 'close' | 'usage' | 'session';

export interface ConversationProps {
  sid: string;
  /** The link's computer handle and realm (the chat's own reference). */
  computer: string;
  realm: string;
  /** The chat list, placed by the conversation's frame. */
  pane: ReactNode;
}

const NO_DRAFT: readonly DraftFile[] = [];
const NO_SOURCE = () => () => {};
/** The card's "Allow everything in this chat…" ask (kit GateAllowAll), under a plain name the page-anatomy walk reads as a provider. */
const AllowAllProvider = GateAllowAll.Provider;

interface Host { computer: string; realm: string; title: string | null; folder: string; agent: string; agentHref: string }

/** The source with the page's words: the computer's and realm's names, and the title and folder from the chat list. Every
 *  operation is the source's own, unchanged: a wrapper that dropped them would leave the gate cards read-only. */
function withHost(src: ActiveSource, host: Host): ActiveSource {
  let last: { inner: ConvSnapshot; view: ConvSnapshot } | null = null;
  const snapshot = (): ConvSnapshot => {
    const inner = src.snapshot();
    if (last && last.inner === inner) return last.view;
    const meta = inner.meta ? { ...inner.meta, computer: host.computer, realm: host.realm, ...(host.folder ? { folder: host.folder } : {}), ...(host.agent ? { agent: host.agent, ...(host.agentHref ? { agentHref: host.agentHref } : {}) } : {}) } : undefined;
    const view: ConvSnapshot = { ...inner, title: host.title?.trim() ? host.title : inner.title, ...(meta ? { meta } : {}) };
    last = { inner, view };
    return view;
  };
  return {
    kind: src.kind, ref: src.ref, snapshot, subscribe: (f) => src.subscribe(f), watch: (w, r) => src.watch(w, r), can: (a) => src.can(a),
    send: (d, o) => src.send(d, o), stop: (sc) => src.stop(sc), decide: (g, d) => src.decide(g, d), answer: (g, a) => src.answer(g, a),
    check: (q) => src.check(q), dismissDecision: (g) => src.dismissDecision(g), canDismiss: (g) => src.canDismiss(g),
    ...(src.shellJobs ? { shellJobs: () => src.shellJobs!() } : {}),
    // The Claude Code account's usage-limit reading: the source's own, only where it has an agent stream.
    ...(src.rateLimit ? { rateLimit: () => src.rateLimit!() } : {}),
    // Check again on a turn whose end could not be read (a read, never a send): the source's own, only where it has it.
    ...(src.recheckOutcome ? { recheckOutcome: () => src.recheckOutcome!() } : {}),
    // Row actions under a message: the source's own, only where it has them.
    ...(src.resend ? { resend: (p: PendingRef) => src.resend!(p) } : {}),
    ...(src.retry ? { retry: (p: PendingRef) => src.retry!(p) } : {}),
    ...(src.takeBack ? { takeBack: (p: PendingRef) => src.takeBack!(p) } : {}),
    ...(src.withdraw ? { withdraw: (p: PendingRef, then: 'remove' | 'edit') => src.withdraw!(p, then) } : {}),
    // The files the host holds for the next message (a message taken back brings its files there): the source's own, only where it has them.
    ...(src.draftFiles ? { draftFiles: () => src.draftFiles!() } : {}),
    ...(src.dropDraftFile ? { dropDraftFile: (id: string) => src.dropDraftFile!(id) } : {}),
    // Fork from a reply: the source's own, only where it has it.
    ...(src.fork ? { fork: (o?: { turn: number; pin?: number }) => src.fork!(o) } : {}),
    // A fork left pending is recovered through the same source (Check the fork, the list of unconfirmed forks).
    ...(src.checkFork ? { checkFork: (k1: string) => src.checkFork!(k1) } : {}),
    ...(src.hideFork ? { hideFork: (k1: string) => src.hideFork!(k1) } : {}),
    ...(src.forks ? { forks: () => src.forks!() } : {}),
    // Allow everything goes through the source's own switch (the engine's), and a change of it is told to the source: only where it has them.
    ...(src.setAutoApprove ? { setAutoApprove: (want: boolean, at?: Parameters<NonNullable<ActiveSource['setAutoApprove']>>[1]) => src.setAutoApprove!(want, at) } : {}),
    ...(src.approvalChanged ? { approvalChanged: () => src.approvalChanged!() } : {}),
  };
}

const noJobs = (): (() => void) => () => undefined;
const noJobsSnap = (): ShellJobStopsSnapshot | null => null;

/** The chat's shell jobs under Activity → Running now: the source's own store, drawn only while it has a row to show,
 *  so the panel's "nothing is running" words stay right. Ages are read at each render; the clock only redraws once a minute
 *  while the chat has a store (its value is never used, so a new store or a render between ticks never shows an old time). */
function useShellJobs(source: ActiveSource | null): ReactNode {
  const stops: ShellJobStops | null = useMemo(() => source?.shellJobs?.() ?? null, [source]);
  const snap = useSyncExternalStore(stops ? stops.subscribe : noJobs, stops ? stops.snapshot : noJobsSnap);
  useNow(stops !== null, 60_000);
  const now = Date.now();
  return stops && snap && shownShellJobs(snap).length > 0 ? <ShellJobRows stops={stops} now={now} /> : undefined;
}

/** The chat's model as its agent reports it, read each time the header shows it with Details closed (Details › Session holds the
 *  live switch and its own read, so the chip never keeps a model a switch made there has replaced). Null until read, and when the
 *  read fails or names none: the chip is then not drawn. An earlier read is dropped as soon as Details opens (or the chat or computer
 *  changes), so closing Details shows no chip until a fresh read answers. */
function useHeadModel(target: Target | null, sid: string): { spec: string | null } {
  const k = target ? `${target.project.id}|${target.container.id}|${target.container.server_name ?? ''}|${sid}` : '';
  const [read, setRead] = useState<{ k: string; model: string | null } | null>(null);
  useEffect(() => {
    setRead(null);
    if (!target) return;
    let mounted = true;
    void agent.readLive(agent.liveApi(target), sid).then((r) => { if (mounted && !r.stale) setRead({ k, model: r.live?.model ?? null }); }, () => undefined);
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `k` names the target and the chat
  }, [k]);
  return { spec: read && read.k === k ? read.model : null };
}

/** A trim cut the chat's history on its computer, and the open source still holds the transcript it had. Opening the chat again (the hold is
 *  released, a new one is taken) reads it as it is now: the page is shown again under a new key. */
export function Conversation(props: ConversationProps) {
  const [again, setAgain] = useState(0);
  return <ConversationOpen key={again} {...props} onReload={() => setAgain((n) => n + 1)} />;
}

/** The most one step picture's read takes (the files route's own bound, at most 16 MiB). */
const STEP_PICTURE_MAX = Math.min(FILE_READ_MAX, 16 * 1024 * 1024);

function ConversationOpen({ sid, computer, realm, pane, onReload }: ConversationProps & { onReload: () => void }) {
  const t = useStrings(strings);
  // The AI FAQ's settle answer: the ⋯ menu's Rename, Close and Delete and a reply's Remove what follows link it while their change waits.
  const tp = useStrings(aiStrings);
  const { byId } = pageFaq(tp);
  const why = useWhy();
  const go = useGo();
  const c = useAiChats();
  const pause = useAiPause();
  const realmName = useRealmName();
  const { selected: shownRealm, pinned: realmPin } = useRealms();
  const account = useCore().account ?? '';
  const ref = useMemo<ConvRef>(() => ({ computer, realm, sid }), [computer, realm, sid]);
  // The computer the top bar shows, by name: without a name there is no handle, so nothing opens on a guess.
  const shown = useMemo<ShownComputer | null>(
    () => (c && c.computerName ? { project: c.at.target.project.id, id: c.at.target.container.id, name: c.computerName, server: c.at.target.container.server_name } : null),
    [c?.at.target.project.id, c?.at.target.container.id, c?.at.target.container.server_name, c?.computerName], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const { source: inner, opening } = useActiveConversationHold(ref, shown);
  const here = !!c && c.handle !== '' && c.handle === computer;
  // The computer list still being read (the only time a shown computer has no name yet): the chat is about to open, not unreadable.
  const listRead = useShellData().computersRead;
  const namesReading = !!c && c.handle === '' && listRead === 'loading';
  const row = here ? c.chats.rows?.find((r) => r.key === keyOf(realm, sid)) : undefined;
  const host: Host = { computer: here ? c.computerName : computer, realm: realmName(realm), title: row?.title ?? null, folder: row?.cwd ?? '', agent: row?.agent ?? '', agentHref: row?.agent ? chatAgentLink(row.agent, realm, shownRealm, realmPin !== null) : '' };
  const hostKey = `${host.computer}|${host.realm}|${host.title ?? ''}|${host.folder}|${host.agent}|${host.agentHref}`;
  // The terminal's window title names the open chat (term/shell/windowTitle.tsx; the web reads nothing from it).
  useWindowTitleDetail(host.title);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- hostKey names every word of the host
  const source = useMemo(() => (inner ? withHost(inner, host) : null), [inner, hostKey]);
  const jobsExtra = useShellJobs(source);
  // The reply's links read against this chat's computer and its realm's list; a chat on a computer the top bar
  // does not show has none, so its links read "Another computer".
  const linkChat = useMemo(() => (here ? shown : null), [here, shown]);
  const servesBoard = !!usePageLink('board');
  const boardAdd = useMemo(() => (servesBoard && linkChat ? (tg: LinkTarget) => linkBoardAddPath(linkChat, tg) : undefined), [servesBoard, linkChat]);
  // Ask the agent to fix it: into this chat's draft, as Edit puts a message taken back.
  const ask = useCallback((text: string) => takeBackToDraft(attemptTarget(account, computer, realm, sid), text), [account, computer, realm, sid]);

  const [detailsOpen, setDetailsOpen] = useState(false);
  // /clear's confirm: the composer asks with what Clear does; the dialog is drawn beside the view, never in its slots.
  const [clearRun, setClearRun] = useState<(() => void) | null>(null);
  const askClear = useCallback((run: () => void) => setClearRun(() => run), []);
  useEffect(() => { setClearRun(null); }, [account, computer, realm, sid]);
  // The chat's own "/" commands: /rename and /exit open the chat menu's Rename and Close, /usage the Usage tab, and
  // /effort and /verbosity the Session tab where they are set. The same dialogs and controls, never a copy.
  const [menuAsk, setMenuAsk] = useState<MenuAsk | null>(null);
  const askCount = useRef(0);
  const [tab, setTab] = useState<DetailsTab | undefined>(undefined);
  const askHost = useCallback((what: HostAsk, seed?: string) => {
    if (what === 'usage' || what === 'session') { setTab(what); setDetailsOpen(true); return; }
    askCount.current += 1;
    setMenuAsk({ what, n: askCount.current, ...(seed !== undefined ? { seed } : {}) });
  }, []);
  useEffect(() => { setMenuAsk(null); }, [account, computer, realm, sid]);
  // A message still queued is not sent from a chat the person left (another chat, another page): said when they come back.
  // The composer alone going away (the chat could not be shown for a moment) says its own words (LiveComposer).
  const queueKey = attemptTarget(account, computer, realm, sid);
  useEffect(() => () => { const q = queuedOf(queueKey); if (q === 'on' || q === 'gone') setQueued(queueKey, 'left'); }, [queueKey]);
  // A handled ask is dropped here, at page scope: a ConvMenu mounted again later sees none.
  const askDone = useCallback((n: number) => setMenuAsk((a) => (a && a.n === n ? null : a)), []);
  const [sizeRef, size] = useSizeClass<HTMLDivElement>('l');
  const target = c?.at.target ?? null;
  // The chat's computer's Agent app (hooks to trust, a card this Hub cannot answer): only for the computer this page shows.
  const agentUrl = here && target ? agentBaseFor(target.project, target.container) : '';
  // The pictures a step made are read from this chat's computer, one file per picture, bounded, only while their step is open.
  const picProject = target?.project.id ?? '', picComputer = target?.container.id ?? '', picServer = target?.container.server_name ?? '';
  const pictures = useMemo<StepPictureReader | null>(() => (here && picProject && picComputer && picServer ? {
    read: (path, signal) => readFileBytes({ id: picComputer, name: '', project_id: picProject, server_name: picServer, status: '', rules: 'unknown' }, path, { maxBytes: STEP_PICTURE_MAX, signal }),
    // A picture sent with a message of this chat, read back from the agent's record (a reopened chat).
    stored: (id, signal) => readSessionImage({ project: { id: picProject }, container: { id: picComputer, server_name: picServer } }, realm, sid, id, signal),
  } : null), [here, picProject, picComputer, picServer, realm, sid]);
  // The chat the stored-picture reads belong to (shared with the side dock showing the same chat).
  const pictureSession = `${picComputer}|${realm}|${sid}`;
  // One usage store per chat while it is open; a reference on another computer reads nothing (no source, no Usage).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one store per chat and computer (the target object may be rebuilt)
  const usage = useMemo(() => (target && here ? createUsageStore({ api: agent.usageApi(target), id: sid, realm }) : null), [here, target?.container.id, sid, realm]);

  // The chat's approval mode where the person types (kit ApprovalMode). What it shows is the approvals read of THIS chat on its
  // own computer. The mode is changed as Details → Session changes it; Allow everything is switched by the source (the engine's
  // own write, so its send guard keeps the choice), and only after the confirm drawn below. The approval card's "Allow
  // everything in this chat…" opens that same confirm.
  const ap = useApproval(here && source ? target : null, sid, realm);
  const [allAsk, setAllAsk] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the target follows the computer (the object may be rebuilt)
  const setYolo = useMemo(() => (source?.setAutoApprove && target ? (want: boolean) => source.setAutoApprove?.(want, target) ?? false : null), [source, target?.project.id, target?.container.id, target?.container.server_name]);
  const apNote = useApprovalModeNote(ap, () => source?.approvalChanged?.());
  // The approvals are read again whenever the chat's own state moves (a reply starts or ends, an approval arrives or goes, the
  // mode the source knows changes, auto-approve switched by any client): a switch made elsewhere, or lost with a restart of the
  // agent, shows at the next of those.
  const readModeSig = useCallback(() => {
    const f = source?.snapshot().facts;
    return f ? `${f.approval}|${f.turn}|${f.gate}|${f.queued}|${f.children}|${f.shells}|${f.asleep === true}|${String(f.auto)}` : '';
  }, [source]);
  const modeSig = useSyncExternalStore(source ? source.subscribe : NO_SOURCE, readModeSig, readModeSig);
  const apRetry = useRef(ap.retry);
  apRetry.current = ap.retry;
  const modeSeen = useRef(modeSig);
  useEffect(() => {
    if (modeSeen.current === modeSig) return;
    modeSeen.current = modeSig;
    apRetry.current();
  }, [modeSig]);
  const modeFacts = source?.snapshot().facts ?? null;
  const yoloCap = source?.can('setYolo');
  const allOpts = { setYolo, ...(yoloCap && !yoloCap.ok && yoloCap.reason === 'asleep' ? { yoloWhy: why(yoloCap) } : {}) };
  const allOffered = allowEverythingOffered(ap, allOpts);
  const apKey = ap.key;
  const askAll = useCallback(() => setAllAsk(apKey), [apKey]);

  // The chat this page shows NOW and whether it is still mounted: the dialog that carries a delete's answer outlives the menu (and this
  // render's props), so the answer is judged against these, never against the props of the render that built the menu.
  const showing = useRef({ computer, sid, realm, mounted: true });
  showing.current = { computer, sid, realm, mounted: showing.current.mounted };
  // The list this page reads NOW (the top bar's computer): a finished request judges the list by this, never by the one captured
  // when its menu was built, because the list's refresh reads the query refs of the moment, whatever context the callback holds.
  const listNow = useRef(c);
  listNow.current = c;
  useEffect(() => { showing.current.mounted = true; return () => { showing.current.mounted = false; }; }, []);
  // A finished rename, close or delete reloads the list only when it shows that chat (the same rule as the list's own rows). A delete
  // that was made for THIS chat also leaves it (Back to the list); one made for another chat (a late answer after navigating) never moves the page.
  const reload = (chat: ChatId) => { const cur = listNow.current; if (cur && listShows(cur.at.realm, cur.at.target.container.id, chat)) void cur.chats.refetch(); };
  const stillHere = (chat: ChatId) => showing.current.mounted && chat.computer === showing.current.computer && chat.sid === showing.current.sid && chat.realm === showing.current.realm;
  // The turn menu on a finished reply. Built once; every read goes through the refs, set each render.
  const menuTarget = here ? target : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the api follows the computer (the target object may be rebuilt)
  const trimCalls = useMemo(() => (menuTarget ? agent.sessionApi(menuTarget) : null), [menuTarget?.project.id, menuTarget?.container.id]);
  const trimNow = useRef<TrimNow | null>(null);
  trimNow.current = source
    ? { source, calls: trimCalls, chat: { key: attemptKey({ computer, realm, sid, target: menuTarget?.container.id ?? '' }), computer, realm, sid, target: menuTarget?.container.id ?? '' } }
    : null;
  // The container this page shows NOW: a finished trim reopens the chat only when it was made on it (the handle in the URL can outlive a
  // change of the top bar's computer, so the computer, realm and sid alone do not name where the trim went).
  const trimTarget = useRef('');
  trimTarget.current = menuTarget?.container.id ?? '';
  const trimDone = useRef<(chat: ChatId) => void>(() => undefined);
  trimDone.current = (chat) => { reload(chat); if (stillHere(chat) && chat.target !== '' && chat.target === trimTarget.current) onReload(); };
  // Fork from here, first in the same menu: the kit's item, on this chat's source. A fork is a keyed create in the chat's own
  // computer and realm, and the new chat opens through the AI tab's chat link (`chatLink`) ONLY once the create is settled (`opened`).
  // The answer of a fork or a Check can come after the page moved, and the kit keeps the source (and so a toast's Check again / Try again)
  // from the render that made the menu. So the chat an operation is made for is bound to the SOURCE that runs it (`sourceAt`, set when the
  // source is made), recorded by the new session id (forkOrigins), and the new chat is linked under THAT computer and realm only while that
  // chat is still the one shown and mounted (the same rule as a finished trim or delete above). Otherwise nothing opens and the kit says
  // the fork was made.
  const sourceAt = useRef(new WeakMap<object, ForkAt>());
  if (source && !sourceAt.current.has(source)) sourceAt.current.set(source, { computer, realm, sid });
  const forkLive = useRef({ source, go });
  forkLive.current = { source, go };
  const [forkMenus] = useState(() => {
    const track = async (at: ForkAt, run: () => Promise<ForkOutcome>): Promise<ForkOutcome> => {
      const o = await run();
      if (o.k !== 'opened') return o;
      forkOrigins.put(o.sid, at);
      const g = o.guard;
      // The kit asks the guard once, in the turn it acts: a moved account makes the outcome unknown and nothing opens, so the record goes.
      return g ? { ...o, guard: { ...g, still: () => { const ok = g.still(); if (!ok) forkOrigins.take(o.sid); return ok; } } } : o;
    };
    const host: ForkHost = {
      source: () => {
        const src = forkLive.current.source, at = src ? sourceAt.current.get(src) : undefined;
        if (!src || !at) return null;
        return {
          can: (a: Parameters<typeof src.can>[0]) => src.can(a),
          ...(src.fork ? { fork: (o?: { turn: number; pin?: number }) => track(at, () => src.fork!(o)) } : {}),
          ...(src.checkFork ? { checkFork: (k1: string) => track(at, () => src.checkFork!(k1)) } : {}),
          ...(src.forks ? { forks: () => src.forks!() } : {}),
        };
      },
      open: (newSid) => {
        const at = forkOrigins.take(newSid), now = showing.current;
        if (!at || !now.mounted || at.computer !== now.computer || at.realm !== now.realm || at.sid !== now.sid) return false;
        const to = chatLink({ computer: at.computer, realm: at.realm, sid: newSid });
        if (!to) return false;
        forkLive.current.go(to);
        return true;
      },
    };
    // One host for both items: a reply's Fork from here and the header menu's Fork this chat share the identity binding above.
    return { reply: forkItems(host), whole: forkWholeItems(host) };
  });
  const { turnMenu, providers: replyItems } = useTrimMenu({ now: () => trimNow.current!, onTrimmed: (chat) => trimDone.current(chat), faqItem: byId.settle, faqLabel: tp('settle.link') }, forkMenus.reply);
  // A typed /fork or /trim runs these same items.
  const turnItems = useMemo<TurnProviders>(() => ({ reply: replyItems, whole: forkMenus.whole }), [replyItems, forkMenus.whole]);
  const [turnAsk, setTurnAsk] = useState<TurnAsk | null>(null);
  // The add menu's dialogs (a file from a computer, notes) are drawn beside the view, like the confirmations: never in the composer's slot.
  const [attachShown, showAttach] = useState<AttachDialogsShown | null>(null);
  const turnAsks = useRef(0);
  const askTurn = useCallback((a: TurnAskOf) => { turnAsks.current += 1; setTurnAsk({ ...a, n: turnAsks.current }); }, []);
  useEffect(() => { setTurnAsk(null); }, [account, computer, realm, sid]);
  // The working bar's Stop (SessionView): the composer's own Stop, handed up by LiveComposer (one attempt, one set of C9 rules).
  const [workStop, setWorkStop] = useState<WorkStop | null>(null);
  // The header's capability line: said only when the computer's agent list shows this chat's agent with no tools at all.
  // Under All realms it is read in the chat's own realm: the context's is 'all' there, which GET /agents refuses unsent.
  // Otherwise in the realm shown, as before.
  const allShown = shownRealm === 'all';
  const chatRealm = allShown && isRealmOrGlobal(realm) ? realm : undefined;
  const agentList = useAgents(here && host.agent !== '' && (!allShown || chatRealm !== undefined), chatRealm);
  const capAgent = here ? chatAgent(agentList.rows, host.agent) : undefined;
  const chatOnly = !!capAgent && hasNoTools(capAgent);
  // The header's model chip: one press opens Details › Session, where the model and how hard it thinks are switched.
  const { spec: headSpec } = useHeadModel(here && !detailsOpen ? target : null, sid);
  // The header names it from the computer's catalogue; the chip waits for that read so it never shows the raw spec first. A
  // catalogue that cannot be read: named by the spec alone.
  const headWanted = useMemo(() => (headSpec ? [headSpec] : []), [headSpec]);
  const { evidence: headEvidence } = useModelCatalogue(headSpec ? target : null, { wanted: headWanted, claude: headSpec?.startsWith('claude-code') === true });
  const headPart = headEvidence?.catalogue;
  const headModel = headSpec && headPart && headPart.state !== 'loading'
    ? { spec: headSpec, catalogue: headPart.state === 'ok' ? headPart.value.cat : null }
    : null;
  if (!source) {
    return (
      <div ref={sizeRef} className={s.frame}>
        <SplitLayout
          size={size}
          detailsOpen={false}
          screen="conversation"
          pane={pane}
          main={(
            <div className={s.fallback}>
              <ChatHead sid={sid} computer={computer} realm={realm} />
              {/* Still opening, or the computer list still being read: reading, never "can't be read" for a chat about to open. A
                  computer that stays nameless (gone from the list, or the list could not be read) is not "reading" forever. */}
              <p className={s.why}>{opening || namesReading ? t('conv.reading') : c && c.handle !== '' && !here ? t('conv.elsewhere', { computer }) : t('conv.unavailable')}</p>
            </div>
          )}
        />
      </div>
    );
  }
  return (
    <div className={s.frame}>
      <ChatLinkHost value={{ chat: linkChat, realm, openHub: go, boardAdd, ask }}>
        <StepPictureHost value={pictures} session={pictureSession}>
        <AllowAllProvider value={allOffered ? askAll : null}>
        <ConversationView
          source={source}
          pane={pane}
          detailsOpen={detailsOpen}
          onDetails={setDetailsOpen}
          tab={tab}
          onTab={setTab}
          onBack={() => go(links.tab)}
          agentUrl={agentUrl}
          composer={<LiveComposer source={source} target={attemptTarget(account, computer, realm, sid)} computer={host.computer} approval={apKey ? <ApprovalMode data={ap} busy={modeFacts ? modeFacts.turn || modeFacts.gate !== 'none' || modeFacts.queued || modeFacts.children || modeFacts.shells : null} setAskFor={setAllAsk} onSent={apNote.sent} {...allOpts} /> : null} approvalNote={apNote.note} why={why} askClear={askClear} askHost={askHost} askTurn={askTurn} showAttach={showAttach} onStop={setWorkStop} slashAt={target && here ? { target, realm, cwd: host.folder, sid } : null} mentionAt={target && here && host.folder ? { target, folder: host.folder } : null} />}
          takeBackFiles={typeof source.draftFiles === 'function'}
          onTakeBack={(text) => takeBackToDraft(attemptTarget(account, computer, realm, sid), text)}
          usage={usage ? <UsageTurns source={source} store={usage} /> : undefined}
          activityExtra={jobsExtra}
          session={here && target ? <SessionPanel target={target} session={sid} computer={host.computer} realm={host.realm} realmId={realm} source={source} approval={ap} {...(setYolo ? { setYolo } : {})} /> : undefined}
          top={here && pause ? <PauseBand store={pause} computer={c.computerName} /> : undefined}
          turnMenu={turnMenu}
          stop={workStop}
          model={headModel}
          onModel={() => askHost('session')}
          capability={chatOnly ? { tag: t('conv.cap.chatTag'), text: t('conv.cap.chatText', { computer: host.computer }) } : null}
          actions={<ConvMenu source={source} target={here ? target : null} forkWhole={forkMenus.whole} ask={menuAsk} onAskDone={askDone} faqItem={byId.settle} faqLabel={tp('settle.link')} onRenamed={(_name, chat) => reload(chat)} onClosed={reload} onDeleted={(chat, how) => { reload(chat); if (how === 'deleted' && stillHere(chat)) go(links.tab); }} />}
        />
        </AllowAllProvider>
      </StepPictureHost>
      </ChatLinkHost>
      {/* Allow everything's confirm: asked by the composer's chip or the approval card, drawn here, outside both. */}
      <AllowEverythingConfirm data={ap} computer={host.computer} askFor={allAsk} setAskFor={setAllAsk} onSent={apNote.sent} {...allOpts} />
      {/* /clear's confirm: asked by the composer, drawn here, outside the composer slot. */}
      <ConfirmDialog
        overlayId="ai-chat-clear"
        isOpen={clearRun !== null}
        onOpenChange={(o) => { if (!o) setClearRun(null); }}
        tone="danger"
        title={t('slash.clear.title')}
        body={t('slash.clear.body')}
        confirmLabel={t('slash.clear.confirm')}
        onConfirm={() => { const run = clearRun; setClearRun(null); run?.(); }}
      />
      {/* A typed /fork or /trim: the reply menu's own item runs here, and what it opened stays up after the send. */}
      <SlashTurns ask={turnAsk} providers={turnItems} />
      <AttachDialogs show={attachShown} />
    </div>
  );
}

/** The working bar's Stop, as ConversationView takes it. */
type WorkStop = NonNullable<ComponentProps<typeof ConversationView>['stop']>;

/** Why the attached files cannot go with `typed` now: the dock's own rules (images wait for a turn; the message with its text files
 *  must fit 28 KB, the body with its images 7.5 MiB). Text files go as their own parts (Draft.files, ask/active.ts attachParts), so
 *  only the typed text counts against MAX. The engine checks the same rule again (AskEngine.send attBlock), so Send is never offered
 *  for a message sure to be refused. */
const attBlock = (typed: string, list: readonly A.Att[], via: 'turn' | 'command'): string | null => A.sendBlock(typed, list, via);

/** The chat's composer. Its send and Stop are the kit's (useConvComposer, kit/agent/convComposer.ts: the code that was here); its
 *  draft and its attempts live there too, bound to the chat (`target`) captured at the
 *  press: one send and one Stop at a time per chat (a second press, or the same chat opened again, while one is on its way does
 *  nothing), and an answer lands on the chat it was sent to. `done` clears the draft; a refusal keeps it and offers Send it now
 *  (a new send); an unknown or a throw clears the box and holds Send for that chat until the person dismisses it, having
 *  checked the chat: nothing sends that text a second time, and dismissing records nothing as failed (C9).
 *  Check is not offered: the source answers it only for decisions, and send() gives no key to read by.
 *  Files are read and checked by the dock's own rules (@ask/io attach, readFiles) and go with the send as Draft.images and
 *  Draft.files (each text file its own part); the source attaches them under that send's key. They live in this composer's memory only,
 *  never in the attempts, and every thumbnail URL is let go. The send's outcome decides them (C9): done, they leave; refused,
 *  they stay and Send it now sends the same bytes; unknown, they leave and are never put on another send (the row's key holds
 *  them). Leaving the chat lets them go.
 *  While a turn runs or an approval waits, nothing stops the person preparing the next message: files are added as at any time, and
 *  a message with an image (which cannot join a running turn: a follow-up carries text) is queued by Send instead of refused
 *  (kit/agent/queuedSend.ts). The queued message is the draft itself; it goes once, by this composer's own send, when the turn is over. */
function LiveComposer({ source, target, computer, approval, approvalNote, why, askClear, askHost, askTurn, showAttach, onStop, slashAt, mentionAt }: { source: ActiveSource; target: string; computer: string; approval: ReactNode; approvalNote: ComposerNote | null; why: ReturnType<typeof useWhy>; askClear: (run: () => void) => void; askHost: (what: HostAsk, seed?: string) => void; askTurn: (a: TurnAskOf) => void; showAttach: (dialog: AttachDialogsShown | null) => void; onStop: (s: WorkStop | null) => void; slashAt: SlashAt | null; mentionAt: MentionAt | null }) {
  const t = useStrings(strings);
  // The usage-limit chip after the add button: only a chat whose agent reported a reading shows it.
  const readLimit = useCallback(() => source.rateLimit?.() ?? null, [source]);
  const limit = useSyncExternalStore(source.subscribe, readLimit);
  // The files the host already holds for this chat's next message (a Not sent message taken back brings its files there): drawn as chips
  // the person can remove, so none goes with a send unseen. The same list until the host's draft changes.
  const readDraft = useCallback(() => source.draftFiles?.() ?? NO_DRAFT, [source]);
  const draftFiles = useSyncExternalStore(source.subscribe, readDraft, readDraft);
  const [files, setFiles] = useState('');
  // The attached files of THIS chat (cleared with it, below); attsRef is the list as it stands now, for reads that end later.
  const [atts, setAttsState] = useState<readonly A.Att[]>([]);
  const attsRef = useRef<readonly A.Att[]>(atts);
  const setAtts = useCallback((next: readonly A.Att[]) => { attsRef.current = next; setAttsState(next); }, []);
  const [attNotes, setAttNotes] = useState<readonly A.Refusal[]>([]);
  const [reading, setReading] = useState(0);
  // Reads in flight, counted as they start (not after a render): send() itself waits on it, whichever button called it.
  const readsRef = useRef(0);
  // Bumped when this chat's files are let go (another chat, or the composer leaving): a read that ends after that keeps nothing.
  const genRef = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // This send's files, asked at the press (the kit's send reads none): held while a read is on or the files cannot go with the text.
  const sendFiles = useMemo<ComposerFiles>(() => ({
    take(text, via) {
      const sent = attsRef.current;
      if (readsRef.current > 0 || attBlock(text, sent, via)) return null;
      const texts = sent.filter((x): x is A.TextFile => x.kind === 'text');
      const imgs = sent.filter((x): x is A.Img => x.kind === 'image');
      return {
        parts: {
          ...(imgs.length ? { images: imgs.map((i) => ({ name: i.name, mime: i.media, data: i.data })) } : {}),
          ...(texts.length ? { files: texts.map((f) => { const from = origins.current.get(f.id); return { name: f.name, text: f.text, ...(from ? { from } : {}) }; }) } : {}),
        },
        // Taken, or no proof either way: this send's files leave the composer (their thumbnails let go) and nothing puts them on another
        // send; a refusal keeps them for Send it now. Only this send's files: anything added since stays.
        drop: () => {
          const ids = new Set(sent.map((x) => x.id));
          const cur = attsRef.current;
          for (const x of cur) if (ids.has(x.id) && x.kind === 'image') revoke(x.url);
          if (cur.some((x) => ids.has(x.id))) setAtts(cur.filter((x) => !ids.has(x.id)));
        },
      };
    },
  }), [setAtts]);
  const { attempts: a, facts: f, action, cap, stopCap, plain, sending, held, canSendText, stopHeld, stopShown, setDraft, send, stop, dismiss } = useConvComposer(source, target, sendFiles);
  const via = action === 'followUp' ? 'command' as const : 'turn' as const;
  // The working bar draws this same Stop: the page holds it while the chat can stop its turn, nothing otherwise (no Stop while the
  // agent is only being caught up with: can('stopTurn') refuses then). `unknown`: a Stop whose answer never came (C9).
  const stopRef = useRef(stop);
  stopRef.current = stop;
  const stopOk = stopCap.ok;
  const stopUnknown = a.stop?.k === 'unknown';
  useEffect(() => { onStop(stopOk ? { busy: stopHeld, unknown: stopUnknown, onPress: () => stopRef.current() } : null); }, [onStop, stopOk, stopHeld, stopUnknown]);
  useEffect(() => () => onStop(null), [onStop]);
  // Why Send cannot take the attached files with this text now (images wait for the turn; the whole must fit; a read is still on).
  // A message with an image goes as a turn of its own, so while a turn runs or an approval waits it is judged as that turn and Send
  // queues it (below) instead of sending. Text files ride a follow-up, so a message without images goes at once as before.
  const queued = useQueuedSend(target);
  const waits = action === 'followUp' && (atts.some((x) => x.kind === 'image') || draftFiles.some((x) => x.kind === 'image'));
  const attWhy = reading > 0 ? 'ask.attReading' : attBlock(plain, atts, waits ? 'turn' : via);
  const canGo = canSendText && !attWhy;
  // Already queued and still waiting: a second press has nothing to add (the queued message is this draft).
  const canSend = canGo && !(waits && queued === 'on');
  // Adding a file is local, so a running turn never refuses it; only a chat that takes no message at all (closed, unreachable) does.
  const attach = source.can('attachImages');
  const attachNo = attach.ok || attach.reason === 'images_wait' ? '' : why(attach);
  const press = (pick?: typeof AUTO, only?: string) => {
    if (waits) { if (canGo) setQueued(target, 'on'); return; }
    setQueued(target, null);
    send(pick, only);
  };
  // The queued message goes once, when nothing runs and no approval waits any more, on facts that can tell: reachable, read, and
  // agreeing with the agent's own state read since this source opened (the rule that settles Stop; a reopened chat first shows its
  // stored record). A draft that became a command is never sent by itself: it stays, for the person's own press. The mark
  // is cleared before the send, so no later change of the facts sends it again; what became of the send is the send's own record
  // (C9). A read or an earlier send still on its way is waited for. When Send cannot take it, it stays in the box with the reason.
  const sendRef = useRef(send);
  sendRef.current = send;
  const readConfirmed = useCallback(() => source.snapshot().turnConfirmed === true, [source]);
  const confirmed = useSyncExternalStore(source.subscribe, readConfirmed, readConfirmed);
  const isCommand = queuedIsCommand(plain);
  const noWhy = isCommand ? t('conv.queued.no.command') : !cap.ok ? why(cap) : held ? t('conv.send.held') : plain.trim() === '' ? t('conv.queued.no.empty') : !canSendText ? t('conv.queued.no.long') : attWhy ? t('conv.att.tooLong') : '';
  const nothing = plain.trim() === '' && atts.length === 0 && draftFiles.length === 0;
  useEffect(() => {
    // The agent's own queue goes first: a message it holds starts the next turn right after this one, so a send now would meet
    // that turn (refused while it runs, read as "may have gone through"). Wait until its queue is empty too.
    if (queued !== 'on' || action !== 'send' || f.queued || f.reach !== 'ok' || f.state === 'loading' || !confirmed || sending || reading > 0) return;
    if (queuedOf(target) !== 'on') return;
    if (canGo && !isCommand) { setQueued(target, null); sendRef.current(); }
    else setQueued(target, nothing ? null : { no: noWhy });
  }, [queued, action, f.queued, f.reach, f.state, confirmed, sending, reading, canGo, isCommand, nothing, noWhy, target]);

  const aat = useAutoApproveTurn(f, canSend, action !== 'send', () => send(AUTO));
  // The "/" menu: the chat's skills as its folder sees them, and /compact while this chat can compact (ConvMenu's rule).
  const canCompact = source.can('compact').ok;
  const compactDesc = t('slash.compact');
  const builtins = useMemo<readonly SlashCommand[]>(() => (canCompact ? [{ name: 'compact', description: compactDesc }] : []), [canCompact, compactDesc]);
  // A built-in the agent runs only in its terminal app, picked or sent here: said in a note, nothing sent.
  const [termOnly, setTermOnly] = useState<string | null>(null);
  // /clear cannot be undone: it asks first, then sends "/clear" (exact, no files) through the active door, only
  // while nothing runs or waits (between turns) and no earlier message is unsettled. /memory consolidate and /memory wipe are
  // the Memory page's (the agent refuses them here): never sent, a note points there. Anything else goes to the agent as typed.
  const go = useGo();
  const [slashNote, setSlashNote] = useState<{ text: string; memory?: true } | null>(null);
  const clearing = useRef(false);
  const clearWhy = (): string => {
    const now = attemptsOf(target).send;
    if (now?.k === 'sending' || now?.k === 'unknown') return t('conv.send.held');
    const fs = source.snapshot().facts;
    if (fs.turn || fs.gate !== 'none' || fs.queued) return t('slash.clear.wait');
    // The source sends the files the chat's draft holds (a taken-back message's) with any text: /clear would not be "/clear" any
    // more, and the files would leave the draft. It waits until they are removed.
    if ((source.draftFiles?.() ?? []).length > 0) return t('slash.clear.files');
    const c = source.can('send');
    return c.ok ? '' : why(c);
  };
  const doClear = () => {
    const no = clearWhy();
    if (no) { setSlashNote({ text: no }); return; }
    if (clearing.current) return;
    clearing.current = true;
    setSlashNote(null);
    void source.send({ text: '/clear' }).then((o) => {
      if (o.k === 'refused') setSlashNote({ text: t('slash.clear.refused') });
      else if (o.k === 'unknown') setSlashNote({ text: t('slash.clear.unknown') });
    }, () => setSlashNote({ text: t('slash.clear.unknown') })).finally(() => { clearing.current = false; });
  };
  // The confirm calls the latest doClear (it reads the chat's state when Clear is pressed).
  const doClearRef = useRef(doClear);
  doClearRef.current = doClear;
  // /fork and /trim: an ask the page runs with the reply menu's own items (SlashTurns). A turn number the chat has
  // not finished is said here; a count not reported yet proves nothing, so the item decides. Its refusal comes back as a note.
  const turnRefused = useCallback((why: string) => setSlashNote({ text: why ? t('slash.turn.refused', { why }) : t('slash.turn.unavailable') }), [t]);
  const onTurn = useCallback((usage: 'slash.fork.usage' | 'slash.trim.usage', what: 'fork' | 'trim', args: string) => {
    setSlashNote(null);
    const n = turnArg(args);
    if (n === null) { setSlashNote({ text: t(usage) }); return; }
    const done = source.snapshot().facts.completedTurns;
    if (done !== undefined && n > done) { setSlashNote({ text: t('slash.turn.none', { n: String(n) }) }); return; }
    askTurn({ what, turn: n - 1, refused: turnRefused });
  }, [t, source, askTurn, turnRefused]);
  const runs = useMemo<HostRuns>(() => ({
    clear: (args) => {
      // Only the agent's own /clear: "/clear" alone on one line (spaces after are trimmed when sent, convComposer EXACT), or a pick
      // from the menu (the draft is still the "/cl" being typed). Words, or a line break, go to the agent as typed.
      if (args || /[\r\n]/u.test(composerPlain(attemptsOf(target).draft))) return false;
      setSlashNote(null);
      askClear(() => doClearRef.current());
    },
    memory: (args) => {
      const m = /^(consolidate|wipe)(?:\s|$)/iu.exec(args);
      if (!m) return false;
      setSlashNote({ text: t('slash.memoryNote', { what: (m[1] as string).toLowerCase() }), memory: true });
    },
    // The chat's own commands. Words after /exit or /usage are not the command: they go to the agent as typed.
    exit: (args) => { if (args) return false; setSlashNote(null); askHost('close'); },
    rename: (args) => { setSlashNote(null); askHost('rename', args === '--auto' ? '' : args || undefined); },
    usage: (args) => { if (args) return false; setSlashNote(null); askHost('usage'); },
    effort: () => { setSlashNote(null); askHost('session'); },
    verbosity: () => { setSlashNote(null); askHost('session'); },
    // /fork alone forks the whole chat (Fork this chat); /fork N and /trim N act on finished turn N's reply.
    fork: (args) => { if (!args) { setSlashNote(null); askTurn({ what: 'forkWhole', refused: turnRefused }); return; } onTurn('slash.fork.usage', 'fork', args); },
    trim: (args) => onTurn('slash.trim.usage', 'trim', args),
    // /copy [N]: a finished reply's text, as its own Copy copies it (the terminal app's command); nothing goes to the agent.
    copy: (args) => {
      setSlashNote(null);
      void copyReply(source.snapshot().blocks, args).then((o) => setSlashNote({ text:
        o.k === 'usage' ? t('slash.copy.usage') : o.k === 'none' ? t('slash.copy.none', { n: String(o.n) }) : o.k === 'empty' ? t('slash.copy.empty')
          : o.k === 'failed' ? t('slash.copy.failed') : o.n ? t('slash.copy.done', { n: String(o.n) }) : t('slash.copy.doneLast') }));
    },
  }), [t, askClear, askHost, target, askTurn, onTurn, turnRefused, source]);
  const slash = useSlashCommands(slashAt, builtins, setTermOnly, runs);
  // The "@" picker: files under the chat's folder.
  const mention = useMentionFiles(mentionAt);

  useEffect(() => { setFiles(''); }, [source]);
  // Keyed on the chat, never the source: the source is made again when the chat's row arrives (its title or folder), and a note
  // a /memory or /clear just gave (or the terminal-only note) must stay until the person closes it or leaves the chat.
  useEffect(() => { setSlashNote(null); setTermOnly(null); }, [target]);
  // Leaving the chat (or the page) lets every attached file go: thumbnails revoked, nothing carried to another chat.
  useEffect(() => () => {
    // A message still queued goes with its files: nothing is sent later. (Leaving the chat says so in its own words, at the page.)
    if (queuedOf(target) === 'on') setQueued(target, 'gone');
    genRef.current += 1;
    readsRef.current = 0;
    for (const x of attsRef.current) if (x.kind === 'image') revoke(x.url);
    attsRef.current = [];
    setAttsState([]);
    setAttNotes([]);
    setReading(0);
  }, [target]);
  const notes: ComposerNote[] = [];
  const sa = a.send, st = a.stop;
  if (sa?.k === 'notSent' && queued !== 'on') notes.push({ key: 'send', text: t('conv.send.notSent'), warn: true, status: true, sends: { label: t('conv.send.again'), onPress: () => (sa.auto ? press(AUTO, sa.text) : press()) } });
  if (sa?.k === 'unresolved') notes.push({ key: 'send', text: t('conv.send.unresolved'), warn: true, status: true });
  if (sa?.k === 'unknown') notes.push({ key: 'send', text: t('conv.send.unknown'), warn: true, status: true, end: <TextButton onPress={dismiss}>{t('conv.send.dismiss')}</TextButton> });
  if (sa?.k === 'dismissed') notes.push({ key: 'send', text: t('conv.send.dismissed'), status: true });
  // Said once: not when the transcript already says the Stop's answer never came (its line offers Check again).
  if (st?.k === 'unknown' && !stopShown) notes.push({ key: 'stop', text: t('conv.stop.unknown'), warn: true, status: true });
  if (st?.k === 'refused') notes.push({ key: 'stop', text: t('conv.stop.refused'), warn: true, status: true });
  if (files) notes.push({ key: 'files', text: files, status: true });
  if (termOnly) notes.push({ key: 'slash', text: t('slash.terminalNote', { name: termOnly }), status: true, end: <TextButton onPress={() => setTermOnly(null)}>{t('slash.noteDismiss')}</TextButton> });
  if (slashNote) {
    notes.push({
      key: 'slashRun', text: slashNote.text, status: true,
      end: slashNote.memory
        ? <TextButton onPress={() => { setSlashNote(null); go(links.memory); }}>{t('slash.memoryOpen')}</TextButton>
        : <TextButton onPress={() => setSlashNote(null)}>{t('slash.noteDismiss')}</TextButton>,
    });
  }
  const attLine = (r: A.Refusal) => t(`conv.att.${r.key.slice(7, 8).toLowerCase()}${r.key.slice(8)}` as 'conv.att.notText', { name: r.name, size: r.size === undefined ? '' : formatBytes(r.size) });
  if (attNotes.length > 0) notes.push({ key: 'attNotes', text: attNotes.map(attLine), warn: true, status: true, end: <IconButton icon="x" size="sm" label={t('conv.att.dismiss')} onPress={() => setAttNotes([])} /> });
  if (approvalNote) notes.push(approvalNote);
  // The queued note's own action is a row action at the kit's button size (it takes back a message, not a passing note's dismiss).
  const unqueue = <Button size="sm" variant="ghost" onPress={() => setQueued(target, null)}>{t(queued === 'on' ? 'conv.queued.cancel' : 'slash.noteDismiss')}</Button>;
  if (queued === 'on') notes.push({ key: 'queued', text: t(f.gate !== 'none' ? 'conv.queued.onGate' : 'conv.queued.on'), status: true, describes: true, end: unqueue });
  else if (queued === 'left' || queued === 'gone') notes.push({ key: 'queued', text: t(queued === 'left' ? 'conv.queued.left' : 'conv.queued.gone'), warn: true, status: true, end: unqueue });
  else if (queued) notes.push({ key: 'queued', text: [t('conv.queued.kept'), queued.no], warn: true, status: true, end: unqueue });
  else if (waits && canGo) notes.push({ key: 'queueHint', text: t(f.gate !== 'none' ? 'conv.queued.hintGate' : 'conv.queued.hint'), describes: true });
  // A message typed while an approval waits never declines it (the card's own Deny does): the agent reads it after the answer.
  // Only an approval card has Deny: a question waits for its answer.
  // A message the agent holds while an approval waits: said in the composer too (a status line tied to the box), since the queued
  // row itself sits after the card and can be out of view.
  else if (f.gate !== 'none' && f.queued) notes.push({ key: 'gateQueued', text: t(f.gate === 'question' ? 'conv.gate.queuedQuestion' : 'conv.gate.queued'), status: true, describes: true });
  else if (f.gate !== 'none' && canSend) notes.push({ key: 'gateWaits', text: t(f.gate === 'question' ? 'conv.gate.waitsQuestion' : 'conv.gate.waits'), describes: true });
  if (attWhy) notes.push({ key: 'attWhy', text: t(`conv.att.${attWhy.slice(7, 8).toLowerCase()}${attWhy.slice(8)}` as 'conv.att.tooLong'), warn: attWhy !== 'ask.attReading', status: true });
  // Read off the event, one pick after another; a read that ends after the chat changed (or the composer left) lets its files go
  // and adds nothing.
  const chain = useRef<Promise<void>>(Promise.resolve());
  // Where an attached file was read from (a computer and a path), by its id: shown on its chip.
  const origins = useRef(new Map<string, string>());
  const onAddFiles = useCallback((list: readonly File[]) => {
    if (attachNo) { setFiles(attachNo); return; }
    setFiles('');
    if (!list.length) return;
    const at = target;
    const gen = genRef.current;
    readsRef.current += 1;
    setReading((n) => n + 1);
    chain.current = chain.current.then(async () => {
      let read: A.Prepared[] = [];
      try {
        const have = attsRef.current;
        read = await readFiles(list, { imgs: A.IMG_MAX - have.filter((x) => x.kind === 'image').length, texts: A.TXT_MAX - have.filter((x) => x.kind === 'text').length });
        // A file read from a computer keeps where it came from, for its chip (readFiles answers one row per file, in order).
        read.forEach((p, i) => { const from = list[i] ? fromOf(list[i]) : undefined; if (p.ok && from) origins.current.set(p.att.id, from); });
      } catch { read = list.map((f) => ({ ok: false as const, why: { key: 'ask.attReadFail', name: A.safeName(f.name, 'file') } })); }
      const add = read.flatMap((p) => (p.ok ? [p.att] : []));
      if (genRef.current !== gen) { for (const x of add) if (x.kind === 'image') revoke(x.url); return; }
      const r = A.admit(attsRef.current, add, composerPlain(attemptsOf(at).draft));
      const kept = new Set(r.list.map((x) => x.id));
      for (const x of add) if (!kept.has(x.id) && x.kind === 'image') revoke(x.url);
      setAtts(r.list);
      setAttNotes([...read.flatMap((p) => (p.ok ? [] : [p.why])), ...r.refused]);
    }).finally(() => {
      if (genRef.current !== gen) return;
      readsRef.current = Math.max(0, readsRef.current - 1);
      setReading((n) => Math.max(0, n - 1));
    });
  }, [attachNo, target, setAtts]);
  const onRemoveAttachment = useCallback((id: string) => {
    // A file the host holds goes through the host (its draft); this composer's own through its own list.
    if (source.draftFiles?.().some((x) => x.id === id)) { source.dropDraftFile?.(id); return; }
    const cur = attsRef.current;
    for (const x of cur) if (x.id === id && x.kind === 'image') revoke(x.url);
    setAtts(cur.filter((x) => x.id !== id));
  }, [setAtts, source]);
  // The add menu's other sources (a file on a computer, a note's text): each hands its File to onAddFiles, so the rules above apply.
  const slashTarget = slashAt?.target, slashCwd = slashAt?.cwd;
  const sourcesAt = useMemo(() => (slashTarget ? { target: slashTarget, cwd: slashCwd ?? '' } : null), [slashTarget, slashCwd]);
  // Mention a file… writes at the end of the draft as it stands when the file is chosen.
  const draftNow = useRef(a.draft);
  draftNow.current = a.draft;
  const onInsert = useCallback((text: string) => {
    const d = draftNow.current;
    setDraft(`${d}${d === '' || /\s$/u.test(d) ? '' : ' '}${text} `);
  }, [setDraft]);
  const sources = useAttachSources({ chat: target, refused: attachNo, at: sourcesAt, textRoom: A.TXT_MAX - atts.filter((x) => x.kind === 'text').length, imageRoom: A.IMG_MAX - atts.filter((x) => x.kind === 'image').length, onAddFiles, onInsert, show: showAttach });
  return (
    <Composer
      draft={a.draft}
      setDraft={setDraft}
      inputRef={inputRef}
      placeholder={t('conv.placeholder')}
      max={MAX}
      canSend={canSend}
      onSend={() => press()}
      sendMenu={aat ? [aat] : null}
      sendWhy={!cap.ok ? why(cap) : held ? t('conv.send.held') : waits && queued === 'on' ? t('conv.queued.sendWhy') : ''}
      sendQuiet={!cap.ok || held || f.gate !== 'none'}
      notes={notes}
      attachments={[...draftFiles, ...atts.map((x): DraftFile => ({ id: x.id, kind: x.kind, name: x.name, url: x.kind === 'image' ? x.url : null, bytes: x.bytes, lines: x.kind === 'text' ? x.lines : 0, ...(x.kind === 'image' && x.resized ? { resized: x.resized } : {}) }))].map((x) => ({
        id: x.id,
        kind: x.kind,
        name: x.name,
        url: x.url,
        meta: [
          x.kind === 'text'
            ? t('conv.att.lines', { count: x.lines, n: formatNumber(x.lines) })
            : x.resized ? t('conv.att.resized', { from: formatBytes(x.resized.from), to: formatBytes(x.resized.to) }) : formatBytes(x.bytes),
          ...(origins.current.has(x.id) ? [t('conv.att.from', { from: origins.current.get(x.id) ?? '' })] : []),
        ].join(' · '),
      }))}
      onAddFiles={onAddFiles}
      addMenu={sources.menu}
      // A screenshot comes from the chat's own computer, known here only while it is the computer shown (as its "/" commands are).
      screenshot={{ chat: target, target: slashTarget ?? null, computer, room: A.IMG_MAX - atts.filter((x) => x.kind === 'image').length, max: A.IMG_MAX, refused: attachNo }}
      onRemoveAttachment={onRemoveAttachment}
      // Stop is drawn once, at the end of the working bar (or the Needs-you bar) under the transcript, from onStop above.
      stop={null}
      tools={limit || approval ? <>{limit ? <RateLimitChip reading={limit} /> : null}{approval}</> : undefined}
      flash={false}
      onTyping={() => {}}
      slash={slash}
      mention={mention}
    />
  );
}
