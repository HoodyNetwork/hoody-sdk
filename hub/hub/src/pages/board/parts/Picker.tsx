// The program picker: Computer › Program › Session in one panel.
//
// Contract, in plain words:
//   - Step 1 lists "Recent" (up to 5 full picks: one click finishes), then the realm's computers (searchable; a
//     stopped computer can be picked, its tile shows the placeholder). Nothing sits below
//     the computers: "Web address" is offered here only while the list holds no computer (none, still reading, or a
//     read that failed), and otherwise at step 2. A search that is itself a web address (webUrl) also offers it as a
//     row that finishes at once.
//   - "Web address" is a small form: the address (http or https only, kept as typed) and an optional name.
//   - "Connect over SSH" is SshForm: a terminal on one of your running computers that runs ssh to a host;
//     offered at step 2 of a running computer, with that computer chosen in the form (if it leaves the list while the
//     form is open, none is chosen and Connect asks for one; a Connect over SSH link's own values apply only to the
//     form the link opened).
//   - Step 2 is everything one computer offers, in one frame under one search field (it keeps the rows whose name
//     or line has the words, and the Apps search them too): "Hoody Kit", the tile programs (TILE_PROGRAMS; one with a
//     single instance, files or sqlite, finishes at once); then, in the same
//     list: "More" (VS Code extension, Virtual machine, Conversation), a running computer's own programs' HTTP ports
//     and its Exec scripts (extras.ts; nothing shows while they are read or when they cannot be; a port or a script
//     finishes at once); "Bots": a running computer's Bots (core useComputerBots), only while this Hub serves the
//     Bots page, whose tile view draws a Bot tile (none while read; a failed read is one Try again row); picking one
//     adds a Bot tile {project, computer, realm, bot}; then "External address": "Web address" (a web tile is tied to no computer) and, for a
//     running computer, "Connect over SSH". Their forms go back to this step. Last, under the list: "Apps", the apps
//     launcher itself (below).
//   - Step 3 lists the sessions known for that computer and program (on any Board or in recents, at least program-1),
//     "New session" (the next free number) and "Open by number" (a form with the number, prefilled with that
//     next number, and an optional name; the tile is exactly the number typed, within sessionNumber.ts's rules; a
//     typed number that is a live ssh session keeps its destination, as its row does, offered as a row or not). A session already on this Board is marked "On this Board" and can still be picked.
//     For a terminal on a running computer it also reads the computer's live sessions (termSessions.ts):
//     each one it lists joins the rows with its facts (shell or ssh, folder, open windows, last activity), and every
//     number it holds, a program's own terminal included, counts for the next free number. While that read runs or
//     when it fails, the step shows what the Boards know.
//   - For a browser on a running computer, step 3 also offers "New browser with options": BrowserForm, on the
//     next free number the Board may start (core's BOARD_BROWSER_IDS); it goes back to step 3. Its tile is the new
//     browser's display. A computer that stops while the form is open: the form says so (Back stays).
//   - Notes asks first: "Whole app" finishes at once; "Choose a page" (a running computer only)
//     lists its notebooks, then the chosen one's pages (notesPages.ts: a search field over the pages read, "More
//     pages" reads the next ones); "Paste a page address" takes a page's address from Notes. A page is a Notes tile
//     on the view 'node' with {userId, nodeId} and the notebook sidebar hidden (links.ts openTile),
//     named after the page. With programsOnly, Notes finishes at once as before.
//   - "Conversation" sits in "More" of a running computer's step 2 while a conversation provider can list chats
//     (kit useConversationList; ask/ registers it): the step lists that computer's chats in the Board's realm, newest first
//     (in All realms those in Global, and it says so); a pick adds the chat's web tile (links.ts convTile: its canonical
//     link, named after its title), which the Board draws as the live chat. Reading shows the loading rows, a failed read
//     one Try again, never "no chats"; a computer or realm change never shows the old one's rows.
//   - Keys: ↑/↓ move (through the list of step 2; its Apps are reached with Tab), Enter picks, Backspace in an empty
//     search goes back one step,
//     Esc closes (the host's). In a form, Enter adds and the keys are the field's; the Apps' own fields and buttons
//     keep theirs. The crumbs name the way here only (never a step still ahead); each one before the current is a
//     button that goes back to its step.
//   - Each computer row at step 1 also names the Hoody Kit programs (the step-2 Kit rows) in one small line. It is
//     text only: the whole row is one target and opens the computer's step 2, which lists them all (hidden from
//     assistive tech: the same line on every row; step 2 lists the programs themselves).
//     The Computers group says how many computers there are ("N of M" while searching), and past the first step the first
//     crumb reads "All computers" (it goes back to the whole list) while the next one names the computer chosen.
//   - onPick gets a Tile: a program tile {project, computer, program, session, name?}, plus the program's explicit
//     start view for a new pick of a program with several views (files, code: 'root'), a Recent pick as kept; a port
//     tile {project, computer, protocol, port, path?}; or a web tile {url, name?}.
//   - The computers come from the Board's one read; the panel itself reads only the chosen computer's extras.
//   - "Apps" at step 2 of a running computer is the apps launcher (loaded on demand) in place: the coding agents
//     and Install from GitHub with nothing typed; the programs one press installs show only as results of the
//     step's own field. "From GitHub" is a kind of its own (the launcher's GitHub pane: the library and any
//     repository's address); there the head's field is the library's box, and a GitHub address typed in the step's
//     field on any other kind is the first result (its press opens that repository's Ready step).
//     Opening an app's Options or a launch shows the launcher
//     alone (step 'app', one more crumb; Back, or the computer's crumb, returns to the step); the launch
//     is added as its terminal, display or web port tile once its Open is answered, never sent twice.
//     A computer that is not running shows there its Start or Resume (the Board's power, as on its tiles) or why apps
//     cannot launch on it; a held change shows the tiles' card (Check again, the warned Dismiss).
//   - "VS Code extension" sits in "More" of a running computer's step 2: it lists
//     the extensions the computer's editor has installed or staged (codeExtensions.ts; searchable; one staged but not
//     installed yet, or one that failed to install, says so) and, always, "Other extension…", a form for a typed
//     PUBLISHER.NAME and an optional name. Either adds a code tile (code-1) on the extension-only view through the
//     catalogue's own checks (extensionParams), named after the extension (its NAME part for a typed id). Nothing is
//     installed from here. A computer that stops while the list is open says so; the typed form stays.
import { AnatomySection, CardGrid, PickCard, SideTabs, StatusPill, Tabs, useIsPhone, useMedia } from '@kit';
import { TileMark } from './TileMark';
import { FrameBody } from './FrameBody';
import { Band, Button, ComputerMark, EmptyState, ErrorState, formatRelative, Icon, matchesSearch, Notice, NumberField, Outcome, SearchField, Skeleton, TextField, showToast, useContributions, type IconName, openOutside as openInBrowser } from '@kit';
import { useConversationList } from '@kit';
import { BOARD_BROWSER_IDS, computerState, errorInfo, useComputerBots, useRealms } from '@core';
import { lazy, Suspense, useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { githubKey, loadLauncher, type FindOutcome, type Placement } from '../../apps/links';
import { convTile, hubOrigin, openTile } from '../links';
import { CATALOG, oneSession, startView, TILE_PROGRAMS, type TileProgram } from '../embed/catalog';
import { handleOf, type BoardComputer } from '../computers';
import { useComputerExtras } from '../extras';
import { nextFree, sshOfSession, useLiveSessions, type SshTo, type TermSession } from '../termSessions';
import { notesLink, useNotebooks, useNotesPages, type Notebook } from '../notesPages';
import { extensionParams, useCodeExtensions } from '../codeExtensions';
import { cleanName, NAME_MAX, webUrl, type Tile, type TileRef } from '../model/boards';
import { numberProblem, sessionMax } from '../sessionNumber';
import { BrowserForm } from './BrowserForm';
import { browserUp } from './browserStart';
import { OUTSIDE_BROWSER, framedHere, openOutside, outsideHost } from './outside';
import { VmCard, vmRowDesc } from './VmCard';
import { SshForm, type SshPrefill } from './SshForm';
import type { Power } from './lifecycle';
import { HeldCard, type HeldFromLink } from './Tile';
import { TileCard } from './TileCard';
import { NotesNew } from './NotesNew';
import { useT, type T } from './text';
import s from './board.module.css';

export type PickerStep = 'computer' | 'program' | 'session' | 'link' | 'name' | 'ssh' | 'notes' | 'notebook' | 'page' | 'notesLink' | 'notesNew' | 'app' | 'browser' | 'extension' | 'extensionId' | 'vm' | 'conv';

const AppLauncher = lazy(() => loadLauncher().then((m) => ({ default: m.AppLauncher })));

export interface PickerProps {
  computers: readonly BoardComputer[] | null;
  failed: boolean;
  /** The rows are the whole list (useBoardComputers().complete). Left out: they are. False: a computer missing from them, or none, is not "no match". */
  complete?: boolean;
  onRetry: () => void;
  recents: readonly TileRef[];
  /** Every tile on any Board of this realm (known sessions). */
  known: readonly TileRef[];
  /** Tiles on the Board the pick goes to ("On this Board"). */
  onBoard: readonly TileRef[];
  /** The canonical links (links.ts convTileUrl) of the chats on that Board: a listed chat among them reads "On this Board". */
  onBoardChats?: readonly string[];
  start?: { step: PickerStep; computer?: string; program?: TileProgram; ssh?: SshPrefill };
  /** The selected realm's name, or null in All realms (the no-computers text). */
  realmName: string | null;
  /** Goes to the Computers page; null when this load cannot get there. */
  onComputers: (() => void) | null;
  onPick: (t: Tile) => void;
  /** Program tiles only (a page that opens one program): no web address, ports, scripts or named session. */
  programsOnly?: boolean;
  /** The Board's Start / Resume of a computer (lifecycle.ts useBoardPower), for the Apps of one not running. */
  power?: (c: BoardComputer | null) => Power | null;
  /** The page that sent a held change, as the tiles link it (computerLinks.ts). */
  heldFrom?: (pw: Power | null, c: BoardComputer | null) => HeldFromLink | null;
  /** The host is the wide Add a program dialog: a computer's kinds stand in a rail beside their groups. Left out (a
   * narrower dialog): they are a strip over them. */
  roomy?: boolean;
  /** Removing one Recent entry and clearing them all. Left out: Recent shows picks only. */
  onRecent?: { drop: (t: TileRef) => void; clear: () => void };
}

/** The programs a tile can open, each with the view a new tile starts on: one with none is not offered. */
const OFFERED = TILE_PROGRAMS.flatMap((p) => { const view = startView(CATALOG, p); return view === undefined ? [] : [{ program: p, view }]; });
const viewOf = (p: TileProgram): string | undefined => OFFERED.find((o) => o.program === p)?.view;

const PROGRAM_ICON: Record<TileProgram, IconName> = { agent: 'agent', terminal: 'terminal', display: 'display', files: 'files', browser: 'browser', code: 'scripts', sqlite: 'database', notes: 'hoody-notes' };

/** `color`: a computer row's colour as the API keeps it, drawn only through ComputerMark (which normalises it), after the icon. */
interface Row { id: string; name: string; meta?: string; tone?: 'ok'; desc?: string; icon?: IconName; color?: string; act: () => void; remove?: () => void; kit?: boolean }
/** The kinds a computer's step shows one at a time ('all': every kind's hits while searching). */
type BrowseTab = 'all' | 'programs' | 'ports' | 'bots' | 'addresses' | 'apps' | 'recent' | 'github';
interface Group { title?: string; rows: Row[]; cat?: BrowseTab; key?: string }

export function Picker({ computers, failed, complete = true, onRetry, recents, known, onBoard, onBoardChats, start, realmName, onComputers, onPick, programsOnly = false, power, heldFrom, onRecent, roomy }: PickerProps) {
  const t = useT();
  const listId = useId();
  const [step, setStep] = useState<PickerStep>(start?.step ?? 'computer');
  const [computerId, setComputerId] = useState<string | undefined>(start?.computer);
  const [program, setProgram] = useState<TileProgram | undefined>(start?.program);
  // Web address and Connect over SSH opened from step 2: the handle of the computer they were opened from,
  // kept as picked (not looked up again), so their crumbs and Back return there and SSH runs from that computer
  // only: if it leaves the list, the form selects none and asks. null when opened from step 1 or a link.
  const [extFrom, setExtFrom] = useState<string | null>(null);
  const extFromComputer = extFrom !== null;
  // The Apps panel of a computer's step: a new key drops the launch or Options it was showing (leaving the 'app' step).
  const [appKey, setAppKey] = useState(0);
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const [tab, setTab] = useState<BrowseTab>('programs');
  const [appCounts, setAppCounts] = useState<{ apps: number; recent: number; ready: number | null; outcome: FindOutcome; q: string } | null>(null);
  // From GitHub: the repository its Ready step shows (a pasted address's, or the one picked in the library).
  const [ghKey, setGhKey] = useState<string | undefined>(undefined);
  // From GitHub's one box (the library's words or an address), drawn in the head where the search stands on the
  // other kinds, and the library's size once read.
  const [ghText, setGhText] = useState('');
  const [ghCount, setGhCount] = useState<number | null>(null);
  const browseEl = useRef<HTMLDivElement>(null);
  const railVariant = !!roomy;
  const phone = useMedia('(max-width: 639px)');
  // A phone's full-screen sheet (the kit's own judgement): the frame takes its whole height.
  const sheet = useIsPhone();
  const computer = computers?.find((c) => c.id === computerId) ?? null;
  // The last read failed over no rows (none read yet, or the empty list an earlier read left): whether any computer
  // is there now is not known, so it says the read failed (Try again), never "no computers".
  const unread = failed && !computers?.length;
  const nameOf = (id: string) => computers?.find((c) => c.id === id)?.name ?? t('tile.unknownComputer');
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  // The number "Open by number" opens (NaN while the field is empty).
  const [num, setNum] = useState(1);
  const [tried, setTried] = useState(false);
  const extras = useComputerExtras(step === 'program' && !programsOnly ? computer : null);
  // The live terminal list: the terminal's session facts, and for Open by number of a terminal, the launch-band
  // numbers that run now (sessionNumber.ts: the only terminals of 8001-9999 opened by number; displays there never).
  const liveRead = useLiveSessions((step === 'session' || step === 'name') && program === 'terminal' ? computer : null);
  const live = program === 'terminal' ? liveRead?.rows ?? null : null;
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  // The pasted address names the notebook, not the viewer's user id in it: the notebooks give that.
  const notebooks = useNotebooks(step === 'notebook' || step === 'notesLink' ? computer : null);
  const notesPages = useNotesPages(step === 'page' ? computer : null, step === 'page' ? notebook?.id ?? null : null);
  const codeExt = useCodeExtensions(step === 'extension' || step === 'extensionId' ? computer : null);
  const running = !!computer && computerState(computer.status) === 'running';
  // Bots: a running computer's Bots, offered only while this Hub serves the Bots page (its tile view draws them).
  const botsServed = useContributions().tileViews.some((v) => v.pageId === 'bots' && v.id === 'bot');
  const botsOf = step === 'program' && !programsOnly && running && botsServed && computer ? computer : null;
  const bots = useComputerBots(botsOf ? { project: { id: botsOf.project_id }, container: { id: botsOf.id, server_name: botsOf.server_name } } : null);
  // Apps: the launcher under a computer's own programs (step 'program'), and alone while it shows an app's Options or
  // a launch (step 'app'). It runs on a running computer with no held lifecycle change; otherwise the step says why.
  const appsAt = (step === 'program' || step === 'app') && !!computer && !programsOnly;
  const appPower = appsAt && computer ? power?.(computer) ?? null : null;
  const appsLive = appsAt && running && !(appPower?.pending && appPower.heldOp);
  // Conversation: the Board's realm, or Global in All realms (a chat reference names one realm).
  const selectedRealm = useRealms().selected;
  const chatRealm = selectedRealm === 'all' ? 'global' : selectedRealm;
  const convAt = step === 'conv' && running && computer ? { project: computer.project_id, id: computer.id, name: computer.name, ...(computer.server_name ? { server: computer.server_name } : {}) } : null;
  const convs = useConversationList(convAt, chatRealm);
  const go = (next: PickerStep) => { if (step === 'app') setAppKey((k) => k + 1); setStep(next); setCursor(0); setTab('programs'); setQ(''); setUrl(''); setLabel(''); setTried(false); };

  // An ssh session picked by number keeps its destination (host, user and port as the computer lists them), so the
  // tile is gated like one made by Connect over SSH. An ssh session the computer lists without a user cannot be
  // checked that way; it stays a plain terminal tile named by its number.
  const pickTile = (c: { id: string; project_id: string }, p: TileProgram, session: number, name?: string, to?: SshTo | null) => {
    const view = viewOf(p);
    const ssh = p === 'terminal' ? sshOfSession(to) : null;
    onPick({ project: c.project_id, computer: c.id, program: p, session, ...(view !== undefined ? { view } : {}), ...(ssh ? { ssh } : {}), ...(name ? { name } : {}) });
  };
  // One Notes page: the view 'node' with its ids and the notebook sidebar hidden (openTile: the
  // Board's default for one page, as a page put on the Board from Notes gets), named after the page (cut to the name
  // limit). Ids openTile does not take keep the pick, as the ids alone.
  const pickPage = (c: { id: string; project_id: string }, userId: string, nodeId: string, title: string) => {
    const name = title.length <= NAME_MAX ? title : title.slice(0, NAME_MAX - 1) + '…';
    const params = openTile('notes', { view: 'node', userId, nodeId })?.params ?? { userId, nodeId };
    onPick({ project: c.project_id, computer: c.id, program: 'notes', session: 1, view: 'node', params, ...(name ? { name } : {}) });
  };
  // A code tile on one extension (extension-only view), named after it; nothing for an id the catalogue refuses.
  const pickExtension = (c: { id: string; project_id: string }, id: string, title: string) => {
    const params = extensionParams(id);
    if (!params) return;
    const name = title.length <= NAME_MAX ? title : title.slice(0, NAME_MAX - 1) + '…';
    onPick({ project: c.project_id, computer: c.id, program: 'code', session: 1, view: 'extension', params, ...(name ? { name } : {}) });
  };
  const typedUrl = programsOnly ? null : webUrl(q);

  // Outside links: an address the Hub cannot frame opens in a running computer's own
  // browser, as a new tab, on a press that names its host and the computer. The computer: the one Web address was
  // opened from at step 2 when it runs; at step 1 the realm's only running computer. With none (or a host that is
  // never sent: local, private, not http/https) the pick stays a web tile, which shows its card (New tab, Copy link);
  // an address the Hub frames itself (a computer's own proxy address) stays a web tile too.
  // A lost answer is never sent again: the browser tile is placed and a notice says the page may not have opened.
  const outsidePc = ((): BoardComputer | null => {
    if (programsOnly) return null;
    if (step === 'link') return extFromComputer && running ? computer : null;
    const up = (computers ?? []).filter((c) => computerState(c.status) === 'running');
    return up.length === 1 ? up[0]! : null;
  })();
  const outsideTo = (raw: string | null): { host: string; pc: BoardComputer } | null => {
    const host = raw ? outsideHost(raw) : null;
    return host && outsidePc && !framedHere(raw!) ? { host, pc: outsidePc } : null;
  };
  const [outsideBusy, setOutsideBusy] = useState(false);
  const openWeb = (raw: string, name?: string) => {
    const to = outsideTo(raw);
    if (!to) { onPick({ url: raw, ...(name ? { name } : {}) }); return; }
    if (outsideBusy) return;
    const { host, pc } = to;
    setOutsideBusy(true);
    void openOutside(pc, raw).then((r) => {
      setOutsideBusy(false);
      const tile: TileRef = { project: pc.project_id, computer: pc.id, program: 'browser', session: OUTSIDE_BROWSER, view: 'display', ...(name ? { name } : {}) };
      if (r === 'opened') { onPick(tile); return; }
      const v = { host, computer: pc.name };
      if ('pending' in r) {
        // The browser tile shows the computer's browser, where the page shows if it opened; Check reads the browser back.
        showToast({
          title: r.pending === 'start' ? t('outside.pending.start', v) : t('outside.pending.open', v),
          tone: 'unknown' /* noDetails: the answer was lost on its way back; there is no rejection to show */,
          action: { label: t('outside.check'), onAction: () => browserUp(pc, OUTSIDE_BROWSER).then((u) => u === 'up') },
        });
        onPick(tile);
        return;
      }
      // Nothing opened: the web tile's card is placed, and the toast opens the address in a new tab of this browser.
      const newTab = { label: t('tile.openNew'), onAction: () => { openInBrowser(raw); } };
      showToast(r.cause !== undefined
        ? {
          title: r.failed === 'read' ? t('outside.failed.read', v) : r.failed === 'start' ? t('outside.failed.start', v) : t('outside.failed.open', v),
          tone: 'error',
          details: errorInfo(r.cause),
          action: newTab,
        }
        : {
          title: r.failed === 'read' ? t('outside.failed.read', v) : r.failed === 'start' ? t('outside.failed.start', v) : t('outside.failed.open', v),
          tone: 'error' /* noDetails: a failed browser read keeps no cause to show (browserUp answers null) */,
          action: newTab,
        });
      onPick({ url: raw, ...(name ? { name } : {}) });
    });
  };
  // A launch, once answered: its terminal or display as a program tile, its web page as an http port tile.
  const placeApp = (p: Placement) => {
    if (!computer) return;
    if (p.kind === 'port') onPick({ project: computer.project_id, computer: computer.id, protocol: 'http', port: p.port, ...(p.path ? { path: p.path } : {}) });
    else pickTile(computer, p.kind, p.session);
  };

  const groups = useMemo((): Group[] => {
    if (step === 'computer') {
      const list = (computers ?? []).filter((c) => matchesSearch([c.name], q));
      const rec = q ? [] : recents.slice(0, 5).filter((r) => computers?.some((c) => c.id === r.computer));
      return [
        ...(typedUrl ? [{ key: 'typed', title: t('picker.web'), rows: [{ id: 'u:typed', name: outsideTo(typedUrl) ? t('picker.openOutside', { host: outsideTo(typedUrl)!.host, computer: outsideTo(typedUrl)!.pc.name }) : t('picker.openUrl', { url: typedUrl }), icon: 'globe' as IconName, act: () => openWeb(typedUrl) }] }] : []),
        ...(rec.length ? [{ key: 'recent', title: t('picker.recent'), rows: [
          ...rec.map((r): Row => ({ id: 'r:' + r.computer + r.program + r.session, name: t('tile.name', { program: r.program, session: r.session }), desc: t('tile.label', { name: t('program.' + r.program), computer: nameOf(r.computer) }), icon: PROGRAM_ICON[r.program], act: () => onPick(r), ...(onRecent ? { remove: () => onRecent.drop(r) } : {}) })),
          // Clear is an option of the list (a listbox holds options only), after the picks.
          ...(onRecent ? [{ id: 'r:clear', name: t('picker.recentClear'), icon: 'trash' as IconName, act: () => onRecent.clear() }] : []),
        ] }] : []),
        { key: 'computers', title: q ? t('picker.computersOf', { n: list.length, count: computers?.length ?? 0 }) : t('picker.computersCount', { count: computers?.length ?? 0 }), rows: list.map((c) => ({ id: 'c:' + c.id, name: c.name, meta: t('state.' + computerState(c.status)), ...(computerState(c.status) === 'running' ? { tone: 'ok' as const } : {}), icon: 'computer' as IconName, ...(c.color ? { color: c.color } : {}), kit: true, act: () => { setComputerId(c.id); go('program'); } })) },
        // With no computer to choose, a web tile (tied to none) is still a pick here; otherwise it is at step 2.
        ...(!programsOnly && !computers?.length ? [{ key: 'other', title: t('picker.other'), rows: [{ id: 'o:web', name: t('picker.web'), desc: t('picker.webDesc'), icon: 'globe' as IconName, act: () => { setExtFrom(null); go('link'); } }] }] : []),
      ];
    }
    if (step === 'link' || step === 'name' || step === 'ssh' || step === 'notesLink' || step === 'app' || step === 'browser' || step === 'extensionId' || step === 'vm') return [{ rows: [] }];
    if (step === 'conv') {
      if (!computer || !running) return [{ rows: [] }];
      if (convs.failed) return [{ rows: [{ id: 'v:retry', name: t('picker.convFailed'), desc: t('picker.botsRetry'), icon: 'reload' as IconName, act: convs.retry }] }];
      const origin = hubOrigin();
      return [{ rows: (convs.rows ?? []).flatMap((r): Row[] => {
        const name = r.title ?? t('picker.convUntitled');
        const tile = convTile(origin, r.ref, name);
        return tile ? [{ id: 'v:' + r.ref.sid, name, ...(r.at !== null ? { desc: formatRelative(r.at) } : {}), ...(onBoardChats?.includes(tile.url) ? { meta: t('picker.onBoard') } : {}), icon: 'hoody-ai' as IconName, act: () => onPick(tile) }] : [];
      }) }];
    }
    if (step === 'extension') {
      if (!computer) return [{ rows: [] }];
      const list = Array.isArray(codeExt.rows) ? codeExt.rows.filter((e) => matchesSearch([e.name, e.publisher, e.id], q)) : [];
      return [{
        rows: [
          ...list.map((e) => ({ id: 'e:' + e.id, name: e.name, desc: e.publisher, meta: e.note ? t('picker.ext.' + e.note) : undefined, icon: 'scripts' as IconName, act: () => pickExtension(computer, e.id, e.name) })),
          // Typing an id stays possible whatever the list says (still reading, failed, empty, or the one not listed).
          { id: 'e:other', name: t('picker.extensionOther'), desc: t('picker.extensionOtherDesc'), icon: 'pen' as IconName, act: () => go('extensionId') },
        ],
      }];
    }
    if (step === 'notes') {
      if (!computer) return [{ rows: [] }];
      return [{
        rows: [
          { id: 'n:whole', name: t('picker.notes.whole'), desc: t('picker.notes.wholeDesc'), icon: 'hoody-notes' as IconName, act: () => pickTile(computer, 'notes', 1) },
          ...(running ? [{ id: 'n:page', name: t('picker.notes.page'), desc: t('picker.notes.pageDesc'), icon: 'notes' as IconName, act: () => go('notebook') }] : []),
          { id: 'n:link', name: t('picker.notes.link'), desc: t('picker.notes.linkDesc'), icon: 'link' as IconName, act: () => go('notesLink') },
          // A new page created in this computer's Notes, then added as its page tile (NotesNew).
          ...(running ? [{ id: 'n:new', name: t('picker.notes.new'), desc: t('picker.notes.newDesc'), icon: 'plus' as IconName, act: () => go('notesNew') }] : []),
        ],
      }];
    }
    if (step === 'notebook') {
      if (!computer || !Array.isArray(notebooks.rows)) return [{ rows: [] }];
      return [{ rows: notebooks.rows.map((b) => ({ id: 'b:' + b.id, name: b.name || t('picker.untitledNotebook'), act: () => { setNotebook(b); go('page'); } })) }];
    }
    if (step === 'page') {
      if (!computer || !notebook) return [{ rows: [] }];
      const list = notesPages.pages.filter((p) => matchesSearch([p.name || t('picker.untitled')], q));
      return [{
        rows: [
          ...list.map((p) => ({ id: 'g:' + p.id, name: p.name || t('picker.untitled'), act: () => pickPage(computer, notebook.userId, p.id, p.name || t('picker.untitled')) })),
          ...(notesPages.hasMore ? [{ id: 'g:more', name: t('picker.morePages'), icon: 'chevron-down' as IconName, act: () => notesPages.more() }] : []),
        ],
      }];
    }
    if (step === 'program') {
      // A program with one instance per computer (files, sqlite) has no sessions: picking it finishes (<program>-1).
      const progs = { rows: OFFERED.map(({ program: p }) => ({ id: 'p:' + p, name: t('program.' + p), desc: t('program.' + p + '.desc'), icon: PROGRAM_ICON[p], act: () => {
        if (p === 'notes' && computer && !programsOnly) { setProgram(p); go('notes'); }
        else if (oneSession(CATALOG, p) && computer) pickTile(computer, p, 1);
        else { setProgram(p); go('session'); }
      } })) };
      if (!computer) return [progs];
      const at = { project: computer.project_id, computer: computer.id };
      // This computer's Bots once read (none while reading; a failed read is one Try again row, never "no Bots").
      const botRows: Row[] = !botsOf ? [] : bots.failed
        ? [{ id: 'q:retry', name: t('picker.botsFailed'), desc: t('picker.botsRetry'), icon: 'reload' as IconName, act: bots.retry }]
        : (bots.bots ?? []).map((b) => ({ id: 'q:' + b.realm + '~' + b.id, name: b.name, desc: t('picker.botDesc'), icon: 'hoody-bots' as IconName, act: () => onPick({ ...at, realm: b.realm, bot: b.id }) }));
      const ports = extras.ports ?? [];
      const scripts = extras.scripts ?? [];
      const isRunning = computerState(computer.status) === 'running';
      // More: one of the editor's extensions on its own (a running computer); Virtual machine: what this
      // computer's server allows, running or not, nothing launches from it yet; Conversation: a running computer's
      // chats, while a provider can list them.
      const more: Row[] = programsOnly ? [] : [
        ...(isRunning ? [{ id: 'a:extension', name: t('picker.extension'), desc: t('picker.extensionDesc'), icon: 'scripts' as IconName, act: () => { setProgram(undefined); go('extension'); } }] : []),
        { id: 'a:vm', name: t('picker.vm'), desc: vmRowDesc(computer.vm, t), icon: 'server' as IconName, act: () => { setProgram(undefined); go('vm'); } },
        ...(isRunning && convs.available ? [{ id: 'o:conv', name: t('picker.conv'), desc: t('picker.convDesc'), icon: 'hoody-ai' as IconName, act: () => { setProgram(undefined); go('conv'); } }] : []),
      ];
      const external: Row[] = programsOnly ? [] : [
        { id: 'o:web', name: t('picker.web'), desc: t('picker.webDesc'), icon: 'globe' as IconName, act: () => { setExtFrom(handleOf(computer)); go('link'); } },
        // ssh runs from a running computer: this one, chosen in the form.
        ...(isRunning ? [{ id: 'o:ssh', name: t('picker.ssh'), desc: t('picker.sshDesc'), icon: 'terminal' as IconName, act: () => { setExtFrom(handleOf(computer)); go('ssh'); } }] : []),
      ];
      // The one search field of this step keeps the rows whose name or line has the words (the Apps search them too).
      const all: Group[] = [
        programsOnly ? progs : { ...progs, title: t('picker.kit'), cat: 'programs', key: 'kit' },
        { title: t('picker.more'), rows: more, cat: 'programs', key: 'more' },
        { title: t('picker.ports'), cat: 'ports', key: 'ports', rows: ports.map((x) => ({ id: 'h:' + x.port, name: t('tile.port', { port: x.port }), desc: x.name || t('picker.portDesc'), icon: 'link' as IconName, act: () => onPick({ ...at, protocol: 'http' as const, port: x.port }) })) },
        { title: t('picker.scripts'), cat: 'ports', key: 'scripts', rows: scripts.map((path) => ({ id: 'x:' + path, name: path, desc: t('picker.scriptDesc'), icon: 'scripts' as IconName, act: () => onPick({ ...at, protocol: 'exec' as const, port: 1, path }) })) },
        { title: t('picker.bots'), rows: botRows, cat: 'bots', key: 'bots' },
        { title: t('picker.external'), rows: external, cat: 'addresses', key: 'external' },
      ];
      // A GitHub address in the field: installing that repository is the first result (a running computer's launcher).
      const repo = appsLive ? githubKey(q) : null;
      const fromGitHub: Group = { title: t('browse.tab.github'), cat: 'github', key: 'github', rows: repo ? [{ id: 'gh:address', name: t('browse.github.install', { repo }), desc: t('browse.github.installDesc', { computer: computer.name }), icon: 'github' as IconName, act: () => { setQ(''); setCursor(0); setGhText(''); setGhKey(repo); setTab('github'); } }] : [] };
      return q ? [fromGitHub, ...all.map((g) => ({ ...g, rows: g.rows.filter((r) => matchesSearch([r.name, r.desc ?? ''], q)) }))] : all;
    }
    if (!computer || !program) return [{ rows: [] }];
    const mine = (x: TileRef) => x.computer === computer.id && x.program === program;
    const facts = new Map((live ?? []).filter((x) => x.offered).map((x) => [x.n, x]));
    // A program's or a short-lived terminal is never a row, whichever list names its number (it still counts as taken).
    const kept = new Set((live ?? []).filter((x) => !x.offered).map((x) => x.n));
    const sessions = [...new Set([1, ...known.filter(mine).map((x) => x.session), ...recents.filter(mine).map((x) => x.session), ...facts.keys()])].filter((n) => !kept.has(n)).sort((a, b) => a - b);
    const next = nextSession();
    return [{
      key: 'sessions',
      title: t('picker.sessions'),
      rows: [
        ...sessions.map((n) => ({ id: 's:' + n, name: t('tile.name', { program, session: n }), desc: factsLine(facts.get(n)), icon: PROGRAM_ICON[program], meta: onBoard.some((x) => mine(x) && x.session === n) ? t('picker.onBoard') : undefined, act: () => pickTile(computer, program, n, undefined, facts.get(n)?.sshTo) })),
        ...(next === null ? [] : [{ id: 's:new', name: t('picker.newSession'), desc: t('picker.newSessionDesc', { name: t('tile.name', { program, session: next }) }), icon: 'plus' as IconName, act: () => pickTile(computer, program, next) }]),
        // A new browser with options: a running computer only, and a number the Board may start.
        ...(program === 'browser' && running && !programsOnly && browserNext(computer.id) !== null ? [{ id: 's:browser', name: t('picker.newBrowser'), desc: t('picker.newBrowserDesc'), icon: 'sliders' as IconName, act: () => go('browser') }] : []),
        ...(programsOnly ? [] : [{ id: 's:named', name: t('picker.byNumber'), desc: t('picker.byNumberDesc'), icon: 'pen' as IconName, act: () => { go('name'); setNum(next ?? 1); } }]),
      ],
    }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, computers, q, recents, known, onBoard, onBoardChats, computer, program, t, extras.ports, extras.scripts, botsOf, bots.bots, bots.failed, bots.retry, programsOnly, live, notebooks.rows, notebook, notesPages.pages, notesPages.hasMore, running, codeExt.rows, convs.available, convs.rows, convs.failed, convs.retry, appsLive]);

  // The next free session number, for "New session" and the named form: after every number the Boards, the recents
  // and the computer's live sessions hold (termSessions nextFree); null when none is left.
  function nextSession(): number | null {
    if (!computer || !program) return 1;
    const mine = (x: TileRef) => x.computer === computer.id && x.program === program;
    return nextFree([1, ...known.filter(mine).map((x) => x.session), ...recents.filter(mine).map((x) => x.session), ...(live ?? []).map((x) => x.n)]);
  }
  function numBad() { return step === 'name' && program ? numberProblem(CATALOG, program, num, liveRead?.band ?? null) : null; }
  // One live session's facts as one line (undefined for a session the computer did not list).
  function factsLine(x: TermSession | undefined): string | undefined {
    if (!x) return undefined;
    const parts = [
      x.ssh ? t('picker.sess.ssh', { to: x.ssh }) : x.shell,
      x.cwd,
      x.viewers ? t('picker.sess.viewers', { count: x.viewers }) : null,
      !x.running ? t('picker.sess.ended') : x.lastActivity !== null ? t('picker.sess.last', { when: formatRelative(x.lastActivity) }) : null,
    ].filter((p): p is string => !!p);
    return parts.length ? parts.join(' · ') : undefined;
  }
  // The pasted page address as ids, or why not: 'bad' (no page address), 'reading' (the notebooks are still being
  // read), 'noBook' (a notebook this person cannot open on this computer, or the notebooks could not be read).
  function linkProblem(): 'bad' | 'reading' | 'noBook' | null {
    const ids = notesLink(url);
    if (!ids) return 'bad';
    if ('userId' in ids) return null;
    if (notebooks.rows === null) return running ? 'reading' : 'noBook';
    return notebooks.rows !== 'failed' && notebooks.rows.some((b) => b.id === ids.notebookId) ? null : 'noBook';
  }
  function linkIds(): { userId: string; nodeId: string } | null {
    const ids = notesLink(url);
    if (!ids || linkProblem()) return null;
    if ('userId' in ids) return ids;
    const b = Array.isArray(notebooks.rows) ? notebooks.rows.find((x) => x.id === ids.notebookId) : undefined;
    return b ? { userId: b.userId, nodeId: ids.nodeId } : null;
  }
  const named = label.trim() ? cleanName(label) : '';
  const nameBad = named === null;
  const urlOk = webUrl(url);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (nameBad) return;
    if (step === 'link') { if (urlOk) openWeb(urlOk, named || undefined); }
    // A typed extension id, named after its NAME part unless the person named it.
    else if (step === 'extensionId') { const id = url.trim(); if (computer && extensionParams(id)) pickExtension(computer, id, named || id.slice(id.indexOf('.') + 1)); }
    else if (step === 'notesLink') { const ids = linkIds(); if (ids && computer) pickPage(computer, ids.userId, ids.nodeId, named || ''); }
    // A typed number that is a live ssh session keeps its destination, as picking its row does.
    else if (computer && program) { if (!numBad()) pickTile(computer, program, num, named || undefined, (live ?? []).find((x) => x.n === num)?.sshTo); }
  };

  const rows = groups.flatMap((g) => g.rows);
  const rowsCount = rows.length;
  // The note under the list of the extension and Chats steps: the extension step's empty or no-match sentence; the Chats
  // step's All-realms note (only Global's chats are listed) or its empty sentence (one sentence saying both, in All realms).
  const listNote = step === 'extension'
    ? (running && Array.isArray(codeExt.rows) && rowsCount === 1 && (q || !codeExt.incomplete) ? (q ? t('picker.noExtensionMatch', { q }) : t('picker.noExtensions')) : null)
    : step === 'conv' && running && computer
      ? (convs.rows !== null && !rowsCount
        ? (selectedRealm === 'all' ? t('picker.convNoneGlobal', { computer: computer.name }) : t('picker.convNone', { computer: computer.name, realm: realmName ?? t('realm.global') }))
        : selectedRealm === 'all' ? t('picker.convGlobal') : null)
      : null;
  // The steps with a search field: it keeps the focus, and the arrows move through the list from it.
  // A computer's step: one field over its rows and its Apps; its list takes the focus too (the field takes none by
  // itself, so a touch keyboard does not cover the step), and the arrows move through the list from either.
  const merged = step === 'program' && !programsOnly;
  // A computer's frame: its step, and the launcher alone inside it (an app's Options, a launch being followed).
  const framed = merged || (step === 'app' && !!computer && !programsOnly);
  // The first step in the same frame (the full picker): the search in its head, the computers as tiles.
  const framed1 = step === 'computer' && !programsOnly;
  // A program's sessions, and the ways to add Notes, in the same frame: the crumbs in its head, the choices as tiles.
  const framedS = !programsOnly && !!computer && ((step === 'session' && !!program) || step === 'notes');
  const gridStep = merged || framed1 || framedS;
  // From GitHub: the head's field is the library's box there (same place, same size: nothing moves between kinds).
  const onGitHub = merged && tab === 'github' && appsLive && !q.trim();
  const searched = step === 'computer' || step === 'page' || step === 'extension' || merged;
  // Entering the page step (from the notebook list, which had the focus) or the extension step puts the focus in its
  // search field, once: typing then searches. The computer step keeps the focus where the picker's host put it.
  const searchEl = useRef<HTMLDivElement | null>(null);
  const focusSearch = useCallback((el: HTMLDivElement | null) => {
    searchEl.current = el;
    if (el && (step === 'page' || step === 'extension') && !el.contains(document.activeElement)) el.querySelector('input')?.focus();
  }, [step]);
  const computerRows = groups.some((g) => g.rows.some((r) => r.id.startsWith('c:')));
  const at = Math.min(cursor, Math.max(0, rows.length - 1));
  // The groups that hold a row: one list (at a computer's step its Apps come after it).
  const mainGroups = groups.filter((g) => g.rows.length);
  const appEl = useRef<HTMLDivElement>(null);
  const activeId = rows[at] ? listId + rows[at].id : undefined;
  const removeHint = listId + '-remove';
  // The search field keeps the focus while the arrows move through the list, so the field (a searchbox, a textbox role)
  // carries the list: it controls the listbox and names its active option (aria-activedescendant), and on a Recent
  // option it points to the Delete instruction. The listbox carries the active option only where it has the focus.
  // The steps past a program's own choice (its sessions, its forms, Notes' steps): their crumbs name that program.
  const PROGRAM_STEPS: PickerStep[] = ['session', 'name', 'browser', 'notes', 'notebook', 'page', 'notesLink', 'notesNew'];
  const BACK: Partial<Record<PickerStep, PickerStep>> = { name: 'session', browser: 'session', session: 'program', notes: 'program', notebook: 'notes', page: 'notebook', notesLink: 'notes', notesNew: 'notes', app: 'program', extension: 'program', extensionId: 'extension', vm: 'program', conv: 'program' };
  const back = () => go((step === 'link' || step === 'ssh') && extFromComputer ? 'program' : BACK[step] ?? 'computer');
  const form = step === 'link' || step === 'name' || step === 'ssh' || step === 'notesLink' || step === 'extensionId';
  // New page draws its own form (NotesNew): its fields keep their keys, as a form step's do.
  const ownForm = form || step === 'notesNew';
  // The browser numbers the Boards and recents hold on a computer (a new browser skips them).
  function browsersOn(id: string): number[] { return [...known, ...recents].filter((x) => x.computer === id && x.program === 'browser').map((x) => x.session); }
  // The number a new browser with options would take (BrowserForm takes it on the same rule): null when the browser range is full.
  function browserNext(id: string): number | null { return nextFree([1, ...browsersOn(id)], BOARD_BROWSER_IDS[1]); }
  // The terminal sessions the Boards and recents hold on a computer (Connect over SSH skips them).
  const terminalsOn = (id: string) => [...known, ...recents].filter((x) => x.computer === id && x.program === 'terminal').map((x) => x.session);

  // The arrows: the option comes into view (a computer's step scrolls: its Apps follow the list). Found from the
  // list's own element (a ref, never a global: with no list drawn there is nothing to scroll).
  const listEl = useRef<HTMLUListElement | null>(null);
  const moveTo = (n: number) => {
    setCursor(n);
    if (rows[n]) listEl.current?.ownerDocument.getElementById(listId + rows[n].id)?.scrollIntoView?.({ block: 'nearest' });
  };
  // A computer's step: a typed character goes to the search field from the rail or a tile too. Their own key handlers
  // keep keys to themselves, so this one runs first (capture), moves the focus before the key's own input, and keeps
  // the tiles' type-ahead from taking the focus back. Fields keep their keys.
  const onTypeAnywhere = (e: KeyboardEvent) => {
    if (!gridStep || framedS || e.key.length !== 1 || e.key === ' ' || e.ctrlKey || e.metaKey || e.altKey) return;
    const on = e.target as HTMLElement;
    if (on.closest('input, textarea, select, [contenteditable]')) return;
    searchEl.current?.querySelector('input')?.focus();
    e.stopPropagation();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    // The launcher's own fields and buttons keep their keys.
    if (ownForm || step === 'app' || step === 'browser' || appEl.current?.contains(e.target as Node)) return;
    // The VM card has buttons only: they keep Enter and Space; Backspace still goes back a step, as on a list.
    if (step === 'vm') {
      if (e.key === 'Backspace') { e.preventDefault(); back(); }
      return;
    }
    // A computer's step opens with the focus on its list (no touch keyboard): a typed character goes to the search
    // field all the same. The focus moves there before the key's own input, so the field takes the character.
    if (merged && e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey && !searchEl.current?.contains(e.target as Node)) {
      searchEl.current?.querySelector('input')?.focus();
      return;
    }
    if (gridStep) {
      const inSearch = !!searchEl.current?.contains(e.target as Node);
      const first = () => browseEl.current?.querySelector<HTMLElement>('[data-card-key]');
      if (inSearch && e.key === 'ArrowDown') { e.preventDefault(); first()?.focus(); }
      else if (inSearch && e.key === 'Enter') { e.preventDefault(); first()?.click(); }
      else if (inSearch && e.key === 'Backspace' && q === '' && merged && !(onGitHub && ghText !== '')) { e.preventDefault(); back(); }
      // The sessions step has no search field: Backspace on a tile goes back a step, as on a list.
      else if (framedS && e.key === 'Backspace') { e.preventDefault(); back(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveTo(Math.min(rows.length - 1, at + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveTo(Math.max(0, at - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); rows[at]?.act(); }
    else if (e.key === 'Delete' && rows[at]?.remove) { e.preventDefault(); rows[at]?.remove?.(); }
    else if (e.key === 'Backspace' && q === '' && step !== 'computer') { e.preventDefault(); back(); }
  };

  const NOTES_ORDER: Partial<Record<PickerStep, PickerStep[]>> = { notes: ['computer', 'program', 'notes'], notebook: ['computer', 'program', 'notes', 'notebook'], page: ['computer', 'program', 'notes', 'notebook', 'page'], notesLink: ['computer', 'program', 'notes', 'notesLink'], notesNew: ['computer', 'program', 'notes', 'notesNew'], app: ['computer', 'program', 'app'], extension: ['computer', 'program', 'extension'], extensionId: ['computer', 'program', 'extension', 'extensionId'], vm: ['computer', 'program', 'vm'], conv: ['computer', 'program', 'conv'] };
  const order: PickerStep[] = NOTES_ORDER[step] ?? (step === 'link' || step === 'ssh' ? (extFromComputer ? ['computer', 'program', step] : ['computer', step]) : step === 'name' || step === 'browser' ? ['computer', 'program', 'session', step] : ['computer', 'program', 'session']);
  const crumbLabel: Record<PickerStep, string> = {
    // Past the first step, its crumb goes back to the whole list, so it says so; the computer chosen is
    // named by the next crumb (its own step), with the program chosen there when there is one.
    computer: step === 'computer' ? t('picker.computer') : t('picker.allComputers'),
    // The external forms belong to no program: their middle crumb is the computer's step itself.
    program: (() => {
      // Only the steps that belong to the program chosen name it (a program picked earlier and left stays in state).
      const prog = program && PROGRAM_STEPS.includes(step) ? t('program.' + program) : null;
      if (!computer) return prog ?? t('picker.program');
      return step !== 'program' && prog ? t('picker.crumbProgram', { computer: computer.name, program: prog }) : computer.name;
    })(),
    session: t('picker.session'),
    link: t('picker.web'),
    name: t('picker.byNumber'),
    browser: t('picker.browserStep'),
    ssh: t('picker.ssh'),
    notes: t('program.notes'),
    notebook: step === 'page' && notebook ? notebook.name || t('picker.untitledNotebook') : t('picker.notebook'),
    page: t('picker.pageStep'),
    notesLink: t('picker.notes.link'),
    notesNew: t('picker.notes.new'),
    app: t('picker.app'),
    extension: t('picker.extensionStep'),
    extensionId: t('picker.extensionIdLabel'),
    vm: t('picker.vm'),
    conv: t('picker.conv'),
  };
  // The way here only: the steps a pick may still ask for are not named ahead (an app, a Bot or a page has no session).
  const crumbs = order.slice(0, order.indexOf(step) + 1).map((k): [PickerStep, string] => [k, crumbLabel[k]]);
  // Focus on the views that are a notice in place of a list or form: the
  // Virtual machine card, a computer gone from under an app, its extensions or a new browser, a stopped computer's
  // browser, an app's computer not running, the chooser without its list, and a list read again (its Try again went
  // with its press). It moves only after a press that changes the view (to the new view's title, the current step in
  // the crumbs), or when the control that held it was removed: then to the notice's first button, else the notice
  // itself when it takes focus, else the step's search field, else the title (the Virtual machine step: its title).
  // A render never moves it otherwise, except from the title it was parked on for a notice with nothing to take it,
  // once that notice has a button, or its list or form comes back (`parked`; it ends when the focus leaves the
  // title, so a title the person comes back to is theirs). `inside`: the focus is in this panel (cleared whenever it leaves,
  // a click on the empty Board included; a control React removes in a commit gets no blur, so its removal is not leaving,
  // even when the focus was on it).
  const notice = step === 'vm'
    || (step === 'browser' && !!computer && !running)
    || (step === 'app' && (computer ? !(running && !(appPower?.pending && appPower.heldOp)) : computers !== null))
    || ((step === 'extension' || step === 'browser') && !computer && computers !== null)
    // A list that is read again (Try again, or a read that went back to loading): its Try again is gone with its press.
    || (step === 'computer' && (computers === null || unread))
    || (step === 'notebook' && !Array.isArray(notebooks.rows))
    || (step === 'page' && !notesPages.pages.length && (notesPages.loading || notesPages.failed))
    || (step === 'extension' && running && !Array.isArray(codeExt.rows))
    // The chats read (again: its Try again went with its press), or a computer that stopped under them.
    || (step === 'conv' && !!computer && (!running || (convs.rows === null && !convs.failed)))
    // A step of one computer while that computer is not in the list (still reading, or gone): what it draws may have
    // nothing to take the focus (a crumb pressed to it, or its form gone with a loading read), so the title holds it.
    || (!!computerId && !computer && step !== 'computer' && step !== 'link' && step !== 'ssh');
  const head = useRef<HTMLSpanElement>(null);
  const noticeEl = useRef<HTMLDivElement>(null);
  const headNext = useRef(false);
  const parked = useRef(false);
  const inside = useRef(false);
  // The form's first field and the list (on the steps without a search field) take the focus when their step opens
  // (BrowserForm and SshForm too, through `mayFocus`).
  // Later in the step they come back only after a notice stood in their place: then they take it only when it was lost
  // (inside the panel and fallen to the page) or parked on the title, never from a crumb or anything else the person focused.
  // Stable per step, so a Board read never re-runs them. `seen` is the step of the last commit: on the commit
  // that enters a step it still names the one before (the refs attach before the layout effect below sets it).
  const seen = useRef<PickerStep | null>(null);
  const opening = useCallback(() => {
    const on = document.activeElement;
    return seen.current !== step || (inside.current && (on === null || on === document.body)) || (parked.current && on !== null && on === head.current);
  }, [step]);
  const focusForm = useCallback((el: HTMLFormElement | null) => {
    if (el && !el.contains(document.activeElement) && opening()) el.querySelector('input')?.focus();
  }, [opening]);
  const focusList = useCallback((el: HTMLUListElement | null) => {
    listEl.current = el;
    if (el && (!searched || merged) && document.activeElement !== el && !el.contains(document.activeElement) && !searchEl.current?.contains(document.activeElement) && opening()) el.focus();
  }, [opening, searched, merged]);
  useLayoutEffect(() => {
    seen.current = step;
    const on = document.activeElement;
    const lost = notice && inside.current && (on === null || on === document.body);
    const stillParked = parked.current && notice && on !== null && on === head.current;
    if (!stillParked) parked.current = false;
    if (!headNext.current && !lost && !stillParked) return;
    const el = headNext.current || step === 'vm' ? null : noticeEl.current;
    const target = el?.querySelector('button') ?? (el?.hasAttribute('tabindex') ? el : null) ?? (headNext.current ? null : searchEl.current?.querySelector('input') ?? null);
    if (!headNext.current && !lost && !target) return;
    parked.current = !headNext.current && step !== 'vm' && !target;
    headNext.current = false;
    (target ?? head.current)?.focus();
  });

  // The Hoody Kit programs by name, as a computer row of step 1 lists them (the names step 2 gives its Kit rows).
  const kitLine = OFFERED.map(({ program }) => t('program.' + program)).join(' · ');
  // A group's title: of a list's group (which names itself with it, aria-label), and of a computer's Apps.
  const groupTitle = (text: string) => <div className={s.groupTitle} role="presentation">{text}</div>;
  // The step's list of options (one per step; a computer's step puts its Apps under it).
  const list = (gs: Group[], id: string, label: string) => {
    if (!gs.length) return null;
    return (
      <ul
        id={id}
        role="listbox"
        aria-label={label}
        aria-activedescendant={!searched || merged ? activeId : undefined}
        tabIndex={searched && !merged ? -1 : 0}
        className={merged ? `${s.list} ${s.listFlow}` : s.list}
        // The list takes focus on the steps without a search field (the search field keeps it on the others).
        ref={focusList}
      >
        {gs.map((g, gi) => (
          <li key={gi} role="presentation">
            {g.title && groupTitle(g.title)}
            <ul role="group" aria-label={g.title} className={s.list}>
              {g.rows.map((r) => {
                const i = rows.indexOf(r);
                return (
                  // A listbox option: picked by click or by Enter from the panel's key handler.
                  // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                  <li key={r.id} id={listId + r.id} role="option" aria-selected={i === at} aria-keyshortcuts={r.remove ? 'Delete' : undefined} aria-describedby={r.remove ? removeHint : undefined} className={s.option} onClick={r.act} onPointerMove={() => i !== at && setCursor(i)}>
                    {r.icon && <Icon name={r.icon} />}
                    <ComputerMark color={r.color} />
                    <span className={s.optionText}>
                      <span className={s.optionName}>{r.name}</span>
                      {r.desc && <span className={s.optionDesc}>{r.desc}</span>}
                      {/* A computer's row: the Hoody Kit programs by name (the row's step lists them). */}
                      {r.kit && <span className={`${s.optionDesc} ${s.optionProgs}`} aria-hidden="true">{kitLine}</span>}
                    </span>
                    {r.meta && <span className={s.optionMeta}>{r.meta}</span>}
                    {/* The pointer's remove; keys use Delete on the option (an option holds no button). */}
                    {r.remove && <span className={s.optionRemove} aria-hidden="true" title={t('picker.recentRemove')} onClick={(e) => { e.stopPropagation(); r.remove?.(); }}><Icon name="x" /></span>}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    );
  };

  // A computer's step: the kinds as tabs (or a rail), the open kind's groups as section cards of tiles. While
  // searching, "Results" holds every kind's hits and each kind's tab its own.
  const searching = q.trim() !== '';
  const ownOf = (c: BrowseTab) => mainGroups.filter((g) => g.cat === c);
  const nOf = (c: BrowseTab) => ownOf(c).reduce((k, g) => k + g.rows.length, 0);
  const appN = appsLive ? appCounts?.apps ?? 0 : 0;
  const recentN = appsLive ? appCounts?.recent ?? 0 : 0;
  const ownN = nOf('programs') + nOf('ports') + nOf('bots') + nOf('addresses') + nOf('github');
  // How far the search for the words got, for the sentence an empty Results says: the computer's ports and scripts
  // and its Bots (when asked), and the apps' own outcome for the words now in the field.
  // An outcome judged for other words than the field's (the launcher reports a render later) is still looking.
  const appOutcome = !appsLive ? undefined : appCounts && appCounts.q !== q ? 'looking' : appCounts?.outcome;
  const ownLooking = extras.read === 'loading' || (!!botsOf && !bots.failed && bots.bots === undefined);
  const noneLooking = ownLooking || appOutcome === 'looking';
  const noneIncomplete = extras.read === 'failed' || extras.read === 'partial' || (!!botsOf && bots.failed) || appOutcome === 'unanswered' || appOutcome === 'partial';
  const noneShort = appOutcome === 'short';
  const kinds = ([
    { id: 'all', count: ownN + appN, show: searching },
    { id: 'programs', count: nOf('programs'), show: !searching || nOf('programs') > 0 },
    // Apps and From GitHub stand right after Programs: in view at once on a phone's strip too.
    { id: 'apps', count: appN, show: appsAt && (!searching || appN > 0) },
    { id: 'github', count: 0, show: appsLive && !searching },
    { id: 'ports', count: nOf('ports'), show: nOf('ports') > 0 },
    { id: 'bots', count: nOf('bots'), show: nOf('bots') > 0 },
    { id: 'addresses', count: nOf('addresses'), show: nOf('addresses') > 0 },
    { id: 'recent', count: recentN, show: recentN > 0 && !searching },
  ] as { id: BrowseTab; count: number; show: boolean }[]).filter((k) => k.show);
  // The launcher alone (an app's Options, a launch): the rail keeps the kinds the step showed.
  const kindsAtStep = useRef(kinds);
  if (step === 'program') kindsAtStep.current = kinds;
  const railKinds = step === 'program' ? kinds : kindsAtStep.current;
  const cur: BrowseTab = kinds.some((k) => k.id === tab) ? tab : kinds[0]?.id ?? 'programs';
  const browseShow: 'apps' | 'recent' | 'all' | 'github' = cur === 'recent' ? 'recent' : cur === 'all' ? 'all' : cur === 'github' ? 'github' : 'apps';
  const appsShown = cur === 'apps' || cur === 'recent' || cur === 'all' || cur === 'github';

  // launch. One keyed element in the same fragment slot for both steps, so the launcher (and a launch it follows)
  // survives the change of step.
  const apps = appsAt && computer ? (
        <div key="apps" ref={appEl} role="group" aria-label={t('picker.apps')} className={s.pickerApps}>
          {appsLive ? (
            <Suspense fallback={<Skeleton rows={3} />}>
              <AppLauncher
                key={appKey}
                target={{ project: { id: computer.project_id }, container: { id: computer.id, server_name: computer.server_name } }}
                onPlaced={placeApp}
                q={q}
                cards={framed ? { show: browseShow, mark: (icon) => <TileMark icon={icon} />, letter: (name) => <TileMark name={name} />, grid: s.browseGrid ?? '', onCounts: setAppCounts, gh: ghKey, onGh: setGhKey, ghText, onGhText: setGhText, onLibraryCount: setGhCount, toGitHub: () => { setGhKey(undefined); setTab('github'); } } : undefined}
                onDetail={(open) => setStep((now) => (open ? (now === 'program' ? 'app' : now) : now === 'app' ? 'program' : now))}
              />
            </Suspense>
          ) : (
            // A held lifecycle change (a Stop, Pause or Restart whose answer was lost) is shown before any launch,
            // running or not. At step 'app' the card is the step's notice (the focus rules above).
            <div ref={step === 'app' ? noticeEl : undefined}><AppStart computer={computer} power={appPower} heldFrom={heldFrom ?? null} t={t} /></div>
          )}
        </div>
      ) : null;

  // The crumbs and the search field: over a step's list, or in the head of a computer's frame.
  const crumbsNav = (
      <nav className={s.crumbs} aria-label={t('picker.title')}>
        {crumbs.map(([k, label], i) => (
          <span key={k} className={s.crumbs}>
            {i > 0 && <Icon name="chevron-right" size="sm" />}
            {order.indexOf(k) < order.indexOf(step) ? (
              // The computer step takes no focus itself (its search field keeps the host's), so its title does.
              <Button variant="ghost" size="sm" onPress={() => { if (k === 'computer') headNext.current = true; go(k); }} aria-label={t('picker.back', { step: label })}>
                {label}
              </Button>
            ) : (
              <span ref={k === step ? head : undefined} tabIndex={k === step ? -1 : undefined} aria-current={k === step ? 'step' : undefined} onBlur={k === step ? () => { parked.current = false; } : undefined}>{label}</span>
            )}
          </span>
        ))}
      </nav>
  );
  const searchBox = searched && (
        <div ref={focusSearch} className={s.pickerSearch}>
        <SearchField
          label={onGitHub ? t('browse.github.search') : t(step === 'page' ? 'picker.searchPages' : step === 'extension' ? 'picker.searchExtensions' : merged ? (appsLive ? 'picker.searchPrograms' : 'picker.searchProgramsOnly') : 'picker.search')}
          placeholder={onGitHub ? t(phone ? 'browse.github.examplePhone' : 'browse.github.example') : t(step === 'page' ? 'picker.searchPages' : step === 'extension' ? 'picker.searchExtensions' : merged ? (appsLive ? (phone ? 'picker.searchProgramsPhone' : 'picker.searchPrograms') : 'picker.searchProgramsOnly') : 'picker.search')}
          value={onGitHub ? ghText : q}
          // On From GitHub the one field is the library's box: typing returns from a repository's Ready step to the
          // library, which the words search.
          onChange={(v) => { if (onGitHub) { setGhText(v); setGhKey(undefined); return; } if (v.trim() && !q.trim()) setTab('all'); if (!v.trim() && tab === 'all') setTab('programs'); setQ(v); setCursor(0); }}
          // The steps drawn as tiles have no list for the field to drive (their grid keeps its own focus).
          aria-controls={!onGitHub && !gridStep && rows.length > 0 ? listId : undefined}
          aria-activedescendant={onGitHub || gridStep ? undefined : activeId}
          aria-describedby={!onGitHub && !gridStep && rows[at]?.remove ? removeHint : undefined}
        />
        </div>
      );
  const tileCard = (r: Row) => (
    <PickCard title={r.name} mark={r.icon ? <TileMark icon={r.icon} /> : undefined} end={r.meta ? <StatusPill>{r.meta}</StatusPill> : undefined} note={r.desc} />
  );
  const headBar = (
    <div className={s.browseHead}>
      {crumbsNav}
      {searchBox}
      {/* What the field reaches, while nothing is typed: the programs one press installs, and any GitHub repository. */}
      {onGitHub ? (
        <p className={s.browseHint} data-browse-hint>{githubKey(ghText) ? t('browse.github.isAddress') : ghCount ? t('browse.github.hint', { count: ghCount }) : t('browse.github.hintPlain')}</p>
      ) : merged && appsLive && !q.trim() ? (
        <p className={s.browseHint} data-browse-hint>{appCounts?.ready ? t('browse.hint', { count: appCounts.ready }) : t('browse.hintPlain')}</p>
      ) : null}
    </div>
  );
  // What the first step says in place of its computers (still reading, not read, none, no match).
  const computersNote = step !== 'computer' ? null : computers === null && !failed ? <Skeleton rows={3} /> : unread ? (
    <div ref={noticeEl}><ErrorState title={t('picker.failed')} onRetry={onRetry} size="sm" /></div>
  ) : computers !== null && !computerRows ? (q ? (
    failed ? <ErrorState /* noDetails: the rows are the last answer; the read's own error is held by the Board, not this list */ title={t('picker.failed')} onRetry={onRetry} size="sm" /> : (
      // As a computer's own empty search (browse.none): the count stays said when nothing matches (its group, with no
      // rows, is not drawn); the way back to the whole list is the search field's own clear button, which the body names.
      <EmptyState size="sm" icon="search" title={t('picker.noMatchTitle', { q: q.trim() })} body={!complete ? t('picker.noMatchPartialBody') : t('picker.noMatchOfBody', { count: computers.length })} />
    )
  ) : !complete ? (
    <Notice>{t('picker.partial')}</Notice>
  ) : (
    <EmptyState
      size="sm"
      icon="computer"
      title={realmName === null ? t('picker.noneAll') : t('picker.none', { realm: realmName })}
      body={realmName === null ? t('picker.noneAllBody') : t('picker.noneBody')}
      action={onComputers ? <Button variant="secondary" onPress={onComputers}>{t('picker.goComputers')}</Button> : undefined}
    />
  )) : null;
  // The first step in the frame: the computers as tiles in one section card, Recent in a second.
  const computersFrame = () => {
    const body = (
      <FrameBody role="region" label={t('picker.computer')}>
        {computersNote}
        {mainGroups.map((g) => {
          const tiles = g.rows.filter((r) => r.id !== 'r:clear');
          const clear = g.rows.find((r) => r.id === 'r:clear');
          return (
            <AnatomySection key={g.key} id={'pick-' + g.key} title={g.key === 'computers' ? g.title ?? '' : t('browse.count', { title: g.title ?? '', count: tiles.length })} {...(clear ? { actions: { secondary: [{ id: 'clear', label: t('picker.recentClearShort'), name: t('picker.recentClear'), icon: 'trash' as IconName, onPress: clear.act }] as const } } : {})}>
              {/* Delete on a Recent tile removes it (a tile holds no button). */}
              {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
              <div onKeyDown={(e) => { if (e.key !== 'Delete') return; const k = (e.target as HTMLElement).closest<HTMLElement>('[data-card-key]')?.dataset.cardKey; const r = tiles.find((x) => x.id === k); if (r?.remove) { e.preventDefault(); r.remove(); } }}>
                <CardGrid
                  className={s.browseGrid}
                  label={g.title ?? ''}
                  items={tiles}
                  keyOf={(r) => r.id}
                  textOf={(r) => [r.name, r.meta, r.kit ? kitLine : r.desc, r.remove ? t('picker.recentRemoveHint') : ''].filter(Boolean).join(', ')}
                  onPick={(k) => tiles.find((r) => r.id === k)?.act()}
                  renderCard={(r) => (
                    <PickCard
                      title={r.name}
                      mark={r.icon ? <TileMark icon={r.icon} /> : <TileMark name={r.name} />}
                      end={r.meta || r.color ? <><ComputerMark color={r.color} />{r.meta ? <StatusPill {...(r.tone ? { tone: r.tone, dot: true } : {})}>{r.meta}</StatusPill> : null}</> : undefined}
                      note={r.kit ? kitLine : r.desc}
                    />
                  )}
                />
              </div>
            </AnatomySection>
          );
        })}
      </FrameBody>
    );
    return body;
  };
  // A program's sessions, or the ways to add Notes, in the frame: one section card of tiles. Sessions: the sessions
  // first, then New session (and a new browser with options) and Open by number; its count names the sessions only.
  // The first tile takes the focus as the step opens.
  const choicesFrame = () => {
    const g = mainGroups[0];
    const tiles = g?.rows ?? [];
    const sessions = step === 'session';
    const name = sessions ? t('picker.sessions') : t('picker.notesHow');
    const n = tiles.filter((r) => r.id !== 's:new' && r.id !== 's:browser' && r.id !== 's:named').length;
    return (
        <FrameBody role="region" label={name}>
          {g && (
            <AnatomySection id={sessions ? 'pick-sessions' : 'pick-notes'} title={sessions ? t('browse.count', { title: name, count: n }) : name}>
              <CardGrid className={s.browseGrid} label={name} items={tiles} focusKey={tiles[0]?.id} keyOf={(r) => r.id} textOf={(r) => [r.name, r.meta, r.desc].filter(Boolean).join(', ')} renderCard={tileCard} onPick={(k) => tiles.find((r) => r.id === k)?.act()} />
            </AnatomySection>
          )}
        </FrameBody>
    );
  };
  const browse = () => {
    const shown = step === 'app' ? [] : cur === 'all' ? mainGroups.filter((g) => g.cat) : ownOf(cur);
    const pick = (id: BrowseTab) => { if (step === 'app') { setAppKey((k) => k + 1); setStep('program'); } setGhKey(undefined); setTab(id); };
    const body = (
      <FrameBody role="region" label={t('browse.tab.' + cur)}>
        {shown.map((g, gi) => (
          <AnatomySection key={g.key} id={'pick-' + g.key} title={t('browse.count', { title: g.title ?? '', count: g.rows.length })}>
            <CardGrid className={s.browseGrid} label={g.title ?? ''} items={g.rows} focusKey={gi === 0 ? g.rows[0]?.id : undefined} keyOf={(r) => r.id} textOf={(r) => [r.name, r.desc].filter(Boolean).join(', ')} renderCard={tileCard} onPick={(k) => g.rows.find((r) => r.id === k)?.act()} />
          </AnatomySection>
        ))}
        <div className={s.browseApps} hidden={!appsShown && step !== 'app'}>{apps}</div>
        {step === 'program' && searching && ownN + appN === 0 && (!appsLive || appCounts !== null) && (
          // "No program named" only once every place was searched for these words: the computer's own lists answered,
          // and the apps' search (outcome) reached its end in full. Before that it is still looking; a place that did
          // not answer, or gave part of its list, scopes the sentence to the places that did; short words searched
          // only the apps ready to install.
          <EmptyState
            size="sm"
            icon="search"
            title={t(noneLooking ? 'browse.looking' : noneIncomplete ? 'browse.noneIncomplete' : 'browse.none', { q: q.trim() })}
            body={noneLooking ? undefined : t(noneIncomplete ? 'browse.noneIncompleteBody' : noneShort ? 'browse.noneShort' : appsLive ? 'browse.noneGitHub' : 'browse.noneBody', { computer: computer?.name ?? '' })}
            action={appsLive && !noneLooking ? <Button variant="secondary" icon="github" onPress={() => { setQ(''); setCursor(0); setGhKey(undefined); setTab('github'); }}>{t('browse.tab.github')}</Button> : undefined}
          />
        )}
      </FrameBody>
    );
    const label = (k: { id: BrowseTab; count: number }) => t('browse.tab.' + k.id);
    if (railVariant && !phone) {
      return (
          <div className={s.browseRail}>
            <SideTabs<BrowseTab> label={t('browse.kinds')} items={railKinds.map((k) => ({ id: k.id, label: searching ? t('browse.tabCount', { label: label(k), count: k.count }) : label(k) }))} value={step === 'app' ? 'apps' : cur} onChange={pick} />
            {body}
          </div>
      );
    }
    return (
        <div className={s.browseTabs}>
          <Tabs<BrowseTab> label={t('browse.kinds')} items={railKinds.map((k) => ({ id: k.id, label: label(k), ...(searching ? { badge: String(k.count) } : {}) }))} value={step === 'app' ? 'apps' : cur} onChange={pick} />
          {body}
        </div>
    );
  };

  // Every step of the full picker is one frame: the crumbs and any search in its head (the same element on every step,
  // so a crumb the person focused survives a step that changes under it), the step below. The other steps (forms,
  // notices, a notebook's pages) sit in its body at the width they were drawn for. A programs-only picker keeps its list.
  const inFrame = !programsOnly;
  const frameRest = inFrame && !framed && !framed1 && !framedS;
  const stepBody = (
    <>
      {step === 'notebook' && notebooks.rows === null && <Skeleton rows={3} />}
      {step === 'notebook' && notebooks.rows === 'failed' && <div ref={noticeEl}><ErrorState title={t('picker.notebooksFailed')} onRetry={notebooks.retry} size="sm" /></div>}
      {step === 'notebook' && Array.isArray(notebooks.rows) && !notebooks.rows.length && <Notice>{t('picker.noNotebooks')}</Notice>}
      {step === 'page' && notesPages.loading && !notesPages.pages.length && <Skeleton rows={3} />}
      {step === 'page' && notesPages.failed && !notesPages.pages.length && <div ref={noticeEl}><ErrorState title={t('picker.pagesFailed')} onRetry={notesPages.more} size="sm" /></div>}
      {step === 'page' && !notesPages.loading && !notesPages.failed && !rowsCount && <Notice>{q ? t('picker.noPageMatch', { q }) : t('picker.noPages')}</Notice>}
      {step === 'extension' && computer && !running && <Notice>{t('picker.extensionsStopped', { computer: computer.name })}</Notice>}
      {step === 'conv' && computer && !running && <Notice>{t('picker.convStopped', { computer: computer.name })}</Notice>}
      {running && ((step === 'extension' && codeExt.rows === null) || (step === 'conv' && convs.rows === null && !convs.failed)) && <Skeleton rows={3} />}
      {step === 'extension' && running && codeExt.rows === 'failed' && <div ref={noticeEl}><ErrorState /* noDetails: the read keeps only that it failed (useCodeExtensions), as the notebooks' does */ title={t('picker.extensionsFailed')} onRetry={codeExt.retry} size="sm" /></div>}
      {step === 'extension' && running && Array.isArray(codeExt.rows) && codeExt.incomplete && (
        // Part of the list could not be read (a section the kit reports unavailable): the rows it did read stay, and
        // the empty-list sentence below is never said for an answer that was not whole.
        <Band size="table" tone="warn" /* noDetails: the read keeps only that a part was missing (useCodeExtensions) */ actions={<Button variant="secondary" size="sm" onPress={codeExt.retry}>{t('picker.extensionsTryAgain')}</Button>}>
          {t('picker.extensionsIncomplete')}
        </Band>
      )}
      {listNote && <Notice>{listNote}</Notice>}
      {step === 'computer' && !framed1 && computers === null && !failed && <Skeleton rows={3} />}
      {step === 'computer' && !framed1 && unread && <div ref={noticeEl}><ErrorState title={t('picker.failed')} onRetry={onRetry} size="sm" /></div>}
      {step === 'browser' && computer ? (
        running ? (
          <BrowserForm computer={computer} taken={[1, ...browsersOn(computer.id)]} max={BOARD_BROWSER_IDS[1]} onPick={onPick} onBack={back} mayFocus={opening} />
        ) : (
          <TileCard hostRef={noticeEl} icon="computer" title={t('browser.stoppedTitle')} body={t('browser.stopped', { computer: computer.name })} actions={<Button variant="ghost" onPress={back}>{t('picker.backStep')}</Button>} />
        )
      ) : step === 'ssh' ? (
        <SshForm computers={computers} failed={failed} complete={complete} onRetry={onRetry} prefill={extFrom !== null ? { computer: extFrom } : start?.step === 'ssh' ? start.ssh : undefined} taken={terminalsOn} onPick={onPick} onBack={back} mayFocus={opening} />
      ) : step === 'vm' && computer ? (
        <VmCard vm={computer.vm ?? 'unknown'} computer={computer} t={t} onBack={back} />
      ) : step === 'vm' && computers !== null ? (
        // The computer left the list while its VM card was open: as for an app, say so (only a whole list that answered
        // knows it is gone) and offer the choice again. Focus: the step's title, only if the card held it (see head).
        <GoneCard failed={failed} complete={complete} onRetry={onRetry} text={complete ? t('picker.vmGone') : t('picker.appUnknown')} t={t} onAgain={() => { headNext.current = true; go('computer'); }} />
      ) : step === 'app' && computer ? (
        // The launcher alone in the computer's frame (the same element as at its step, so a launch it follows survives),
        // or the Start card of a computer that is not running.
        programsOnly ? <>{apps}</> : browse()
      ) : step === 'app' && computers !== null ? (
        // The computer left the list (removed, or moved to another realm): say so, and offer the choice again. Only a whole list
        // that answered says so; after a failed read, or on a first page of a longer list, it is not known.
        // Choose again: the computer step takes no focus itself, so its title does.
        <GoneCard hostRef={noticeEl} failed={failed} complete={complete} onRetry={onRetry} text={complete ? t('picker.appGone') : t('picker.appUnknown')} t={t} onAgain={() => { headNext.current = true; go('computer'); }} />
      ) : (step === 'extension' || step === 'browser') && !computer && computers !== null ? (
        // The computer left the list while its extensions or a new browser's form were open: as for an app, say so
        // (only a whole list that answered knows it is gone) and offer the choice again.
        <GoneCard hostRef={noticeEl} failed={failed} complete={complete} onRetry={onRetry} text={complete ? t(step === 'browser' ? 'picker.browserGone' : 'picker.extensionGone') : t('picker.appUnknown')} t={t} onAgain={() => { headNext.current = true; go('computer'); }} />
      ) : step === 'notesNew' && computer ? (
        <NotesNew key={computer.id} computer={computer} onAdd={(userId, nodeId, title) => pickPage(computer, userId, nodeId, title)} onBack={back} formRef={focusForm} />
      ) : form ? (
        <form className={s.pickerForm} onSubmit={submit} noValidate ref={focusForm}>
          {step === 'notesLink' && (
            <TextField
              label={t('picker.notesLinkLabel')}
              value={url}
              onChange={setUrl}
              mono
              errorMessage={tried && linkProblem() ? t('picker.notesLink.' + linkProblem(), { computer: computer?.name ?? '' }) : undefined}
            />
          )}
          {step === 'extensionId' && (
            <TextField
              label={t('picker.extensionIdLabel')}
              placeholder={t('picker.extensionIdPlaceholder')}
              value={url}
              onChange={setUrl}
              mono
              errorMessage={tried && !extensionParams(url.trim()) ? t('picker.extensionIdBad') : undefined}
            />
          )}
          {step === 'link' && (
            <TextField
              label={t('picker.urlLabel')}
              placeholder={t('picker.urlPlaceholder')}
              value={url}
              onChange={setUrl}
              mono
              errorMessage={tried && !urlOk ? t('picker.urlBad') : undefined}
            />
          )}
          {step === 'name' && program && (
            <NumberField
              label={t('picker.numberLabel', { program: t('program.' + program) })}
              description={t('picker.numberHint', { max: sessionMax(CATALOG, program) })}
              minValue={1}
              maxValue={sessionMax(CATALOG, program)}
              value={num}
              onChange={setNum}
              formatOptions={{ useGrouping: false, maximumFractionDigits: 0 }}
              errorMessage={tried && numBad() ? t('picker.number.' + numBad(), { max: sessionMax(CATALOG, program) }) : undefined}
            />
          )}
          <TextField
            label={t('picker.nameLabel')}
            value={label}
            onChange={setLabel}
            errorMessage={nameBad ? t('picker.nameBad', { max: NAME_MAX }) : undefined}
          />
          <div className={s.pickerFormActions}>
            <Button variant="ghost" onPress={back}>{t('picker.backStep')}</Button>
            <Button variant="primary" type="submit" busy={outsideBusy} literal={step === 'link' && !!outsideTo(urlOk)}>
              {step === 'link' && outsideTo(urlOk) ? t('picker.openOutside', { host: outsideTo(urlOk)!.host, computer: outsideTo(urlOk)!.pc.name }) : t('picker.add')}
            </Button>
          </div>
        </form>
      ) : merged ? (
        // A computer's own frame: its kinds, the open kind's groups as section cards of tiles, its Apps among them.
        browse()
      ) : framed1 ? (
        computersFrame()
      ) : framedS ? (
        choicesFrame()
      ) : (
        <>
          {step === 'computer' && computers !== null && !unread && !computerRows && (q ? (
            failed ? <ErrorState /* noDetails: the rows are the last answer; the read's own error is held by the Board, not this list */ title={t('picker.failed')} onRetry={onRetry} size="sm" /> : (
              // The count stays said when nothing matches (its group, with no rows, is not drawn); the way back to
              // the whole list is the search field's own clear button, which the sentence names (an action of the page's
              // own here would be a hand-built action row).
              <Notice>{!complete ? t('picker.noMatchPartial', { q }) : t('picker.noMatchOf', { q, count: computers.length })}</Notice>
            )
          ) : !complete ? (
            <Notice>{t('picker.partial')}</Notice>
          ) : (
            <EmptyState
              size="sm"
              icon="computer"
              title={realmName === null ? t('picker.noneAll') : t('picker.none', { realm: realmName })}
              body={realmName === null ? t('picker.noneAllBody') : t('picker.noneBody')}
              action={onComputers ? <Button variant="secondary" onPress={onComputers}>{t('picker.goComputers')}</Button> : undefined}
            />
          ))}
          {list(mainGroups, listId, crumbs[order.indexOf(step)]![1])}
          {/* The Delete instruction the Recent options and the search field point to (aria-describedby); Recent is at this step only. */}
          {rows.some((r) => r.remove) && <span id={removeHint} className={s.srOnly}>{t('picker.recentRemoveHint')}</span>}
        </>
      )}
    </>
  );
  return (
    // The keys of the list belong to this panel while it has focus (an element handler, not a window listener).
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className={s.picker}
      onKeyDown={onKeyDown}
      onKeyDownCapture={onTypeAnywhere}
      onFocus={() => { inside.current = true; }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) inside.current = false; }}
    >
      {inFrame ? (
        <div ref={browseEl} className={s.browse} data-sheet={sheet ? '' : undefined}>
          {headBar}
          {frameRest ? (
            <FrameBody>
              <div className={s.pickerCapped}>{stepBody}</div>
            </FrameBody>
          ) : stepBody}
        </div>
      ) : (
        <>
          {crumbsNav}
          {searchBox}
          {stepBody}
        </>
      )}
    </div>
  );
}

/** A step whose computer left the list (removed, or moved to another realm): the sentence that says so, or the failed
 *  read's own state when the list is not known, and Choose again. */
function GoneCard({ failed, complete, onRetry, text, t, onAgain, hostRef }: { failed: boolean; complete: boolean; onRetry: () => void; text: string; t: T; onAgain: () => void; hostRef?: Ref<HTMLDivElement> }) {
  const again = <Button variant="secondary" onPress={onAgain}>{t('picker.appChooseAgain')}</Button>;
  if (failed) return <TileCard hostRef={hostRef} note={<ErrorState /* noDetails: the rows are the last answer; the read's own error is held by the Board, not this list */ title={t('picker.failed')} onRetry={onRetry} size="sm" />} actions={again} />;
  return <TileCard hostRef={hostRef} icon="computer" title={t(complete ? 'picker.goneTitle' : 'picker.uncheckedTitle')} body={text} actions={again} />;
}

/** Launch an app on a computer that is not running: its Start or Resume as the Board's tiles offer it (lifecycle.ts),
 *  or why apps cannot launch there; a held change shows the tiles' card (Check again, the warned Dismiss). The first
 *  button takes the keys when the focus was lost (the picker's notice rule). The picker shows the launcher once the Board's read sees the computer running. */
function AppStart({ computer, power, heldFrom, t }: { computer: BoardComputer; power: Power | null; heldFrom: ((pw: Power | null, c: BoardComputer | null) => HeldFromLink | null) | null; t: T }) {
  if (power?.pending && power.heldOp) {
    return <HeldCard power={power} name={computer.name} computer={computer.name} actions={null} t={t} heldFrom={heldFrom?.(power, computer) ?? null} />;
  }
  const vars = { computer: computer.name };
  const paused = String(computer.status ?? '').toLowerCase() === 'paused';
  const card = (title: string, body: string, actions?: ReactNode) => <TileCard icon="computer" title={title} body={body} actions={actions || undefined} />;
  const state = computerState(computer.status);
  if (state === 'stopped') {
    if (power?.busy) return card(t(paused ? 'tile.resumingTitle' : 'tile.startingTitle', vars), t('picker.appStarting'));
    return card(t(paused ? 'tile.pausedTitle' : 'tile.stoppedTitle', vars), t(paused ? 'picker.appResume' : 'picker.appStart'), (power?.outcome || power?.op) && (
      <>
        {power.outcome && <Outcome outcome={power.outcome} />}
        {power.op && <Button variant="primary" onPress={power.run}>{t(power.op === 'resume' ? 'tile.resume' : 'tile.start')}</Button>}
      </>
    ));
  }
  if (state === 'starting') return card(t('tile.startingTitle', vars), t('picker.appStarting'));
  return card(t('tile.attentionTitle', vars), t('picker.appCannot'));
}
