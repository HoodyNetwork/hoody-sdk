// One Bot's page: a header with its facts as links, the waiting card pinned above the tabs, and
// four tabs (Activity, Link and keys, Chat apps, Work). Settings and the other forms are drawers
// that live in the URL (?settings=, ?drawer=), so Back closes them. Every fact is a link to where
// it lives.
import {
  Button,
  ComputerLink,
  ConfirmDialog,
  DetailHeader,
  EmptyState,
  ErrorState,
  formatDateTime,
  Band,
  Icon,
  IconButton,
  Link,
  NotifyHint,
  OutcomeBanner,
  PageLinkTo,
  Popover,
  Skeleton,
  StatusPill,
  Tabs,
  TextButton,
  useSearchParam,
  useSelection,
  useStringParts,
  useStrings,
  type GateEntry,
  type MenuEntry,
  Tag,
  useDrawerParam,
  useGo,
  usePageShortcuts,
  usePathname,
  useSearch,
  useWipeOn,
} from '@kit';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  useBotAction,
  DELETE_BOT_CODES,
  useBotLink,
  useBotView,
  useChannelChange,
  useChannelsPause,
  useChannels,
  useCreateLink,
  useDecideGate,
  useDelegates,
  useFinishedDelegates,
  useKeyChange,
  useLinkOffer,
  useLoadOlder,
  useLog,
  useMintKey,
  usePanic,
  useKeyRevokeAll,
  usePatchLink,
  useRepoint,
  useRotateKey,
  useSaveGuardrails,
  useSaveSettings,
  useStopDelegate,
  useStopTurn,
  useFrozenTurn,
  useFrozenUid,
  useBotModelLabel,
  computerTarget,
  type BotRow,
  type HeldSend,
  type Computer,
  type ModelRow,
  type RealmInfo,
  type LogRow,
} from '../data';
import { badgeCount } from '../chatFlow';
import { botLinks } from '../links';
import { computerHandle, computerHref, hostEnv } from '@core';
import { links as computerLinks } from '../../computers/links';
import { useBotSource, usePageLink, type BotHome } from '@kit';
import { chatLink } from '../../ai/links';
import { dialogOwnOutcome, heldAfter, withOlder, parseBotKey, primaryOf, rowPlace, settingsSectionOf, statusOf, tabOf, type BotTab } from '../logic';
import strings from '../strings.en.json';
import { ActivityTab, bringTopIntoView, type RowPlaceView } from './ActivityTab';
import { HeldDangerConfirm, STATUS_TONE, useComputerGoes } from './Bits';
import { ChatAppsTab } from './ChatAppsTab';
import { queuedLabel } from './queuedLabel';
import { focusGate, GateCard } from './GateCard';
import { detailsPanel, detailsToggle, focusLost, hiddenByPage, holdsFocus, keyboardHeld, moreTrigger, onDocumentFocus, openerNow, overlayOpen } from './paneFocus';
import { gateViewOf } from '../model-adapters';
import { useGateSent } from './gate-sent';
import { ArchiveDrawer } from './ArchiveDrawer';
import { GiveLinkDrawer, KeyDrawer, LimitsDrawer, RepointDrawer } from './LinkDrawers';
import { MessageTaskHost, PendingMessages, openTaskOf } from './MessageTask';
import { keysCueFor, LinkTab, type FreshKey, type KeysCue } from './LinkTab';
import { AutoApprove, AutoApproveNote } from './AutoApprove';
import { SettingsDrawer, type SettingsLastSave } from './SettingsDrawer';
import { Say } from './Say';
import { WorkTab } from './WorkTab';
import s from './pane.module.css';

interface Props {
  row: BotRow | undefined;
  botKey: string;
  computers: readonly Computer[];
  realms: readonly RealmInfo[];
  models: readonly ModelRow[];
  listLoaded: boolean;
}

type Confirm = 'stop' | 'reset' | 'forget' | 'purge' | 'delete';
const CONFIRMS: readonly string[] = ['stop', 'reset', 'forget', 'purge', 'delete'];

/** Where a Bot's own session lives (its computer, as the shown record and handle, and the Bot's realm); null until known. */
function botHome(key: string, computer: Computer | undefined): BotHome | null {
  const k = parseBotKey(key);
  if (!k || !computer || computer.id !== k.computerId) return null;
  const t = computerTarget(k.computerId);
  if (t.project.id === '') return null;
  const server = t.container.server_name;
  return { computer: computerHandle(computer), realm: k.realm, at: { project: t.project.id, id: computer.id, name: computer.name, ...(server ? { server } : {}) } };
}

export function BotPane({ row, botKey, computers, realms, models, listLoaded }: Props) {
  const t = useStrings(strings);
  const tp = useStringParts(strings);
  const [, select] = useSelection();
  const [drawer, setDrawer] = useSearchParam('drawer');
  const [settings, setSettings] = useSearchParam('settings');
  const [tabParam, setTabParam] = useSearchParam('tab');
  const tab: BotTab = tabOf(tabParam);
  // The Activity tab's Details panel: toggled from the header, kept in the address so a reload or a shared link
  // keeps it; closed by default, as on the AI page. The toggle shows on the Activity tab only (the panel is that tab's).
  const [detailsParam, setDetailsParam] = useSearchParam('details');
  const detailsOpen = detailsParam === '1';
  const detailsGo = useRef<'panel' | 'toggle' | null>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const revealDetails = useRef<((el: HTMLElement | null) => void) | null>(null);
  const setDetails = useCallback((open: boolean, why: 'panel' | 'toggle' | null) => {
    detailsGo.current = why;
    // keepScroll: the router's scroll reset would move the reader off their place in the thread.
    setDetailsParam(open ? '1' : undefined, { replace: true, keepScroll: true });
  }, [setDetailsParam]);
  // The keyboard follows the panel the person opened or closed: into the panel on open, back to the Details button on close,
  // or to the ⋯ when Details is in it (the panel's own Close details included: nothing else would take the keyboard).
  useEffect(() => {
    const why = detailsGo.current;
    detailsGo.current = null;
    const root = paneRef.current;
    if (!root || !why) return;
    // Into the panel, its top brought on screen: above the log (a narrow pane) it may start above the reader's place in a
    // long thread. The log's reveal stops it following the end when that scroll leaves the end (its next resize would take
    // the reader back down); two frames later once more, for the panel's own late layout. A wide pane's panel is held on
    // screen (sticky): no scroll, and the log keeps following the end.
    if (why === 'panel') {
      const panel = detailsPanel(root);
      panel?.focus({ preventScroll: true });
      const reveal = () => (revealDetails.current ?? bringTopIntoView)(panel);
      reveal();
      // Frames are a web page's (the terminal has none: its layout is done when the effect runs).
      if (hostEnv().browserPage !== true) return undefined;
      let frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(reveal);
      });
      return () => cancelAnimationFrame(frame);
    }
    detailsToggle(root)?.focus({ preventScroll: true });
    return undefined;
  }, [detailsOpen]);
  const viewQ = useBotView(botKey);
  const linkQ = useBotLink(botKey);
  const offerQ = useLinkOffer();
  const delegatesQ = useDelegates(botKey);
  const [finishedParam] = useSearchParam('finished');
  const finishedQ = useFinishedDelegates(tab === 'work' ? botKey : undefined, finishedParam === '1');
  const logQ = useLog(botKey, { stream: true });
  const loadOlder = useLoadOlder(botKey);
  const [older, setOlder] = useState<{ key: string; rows: LogRow[]; hasOlder: boolean } | null>(null);
  const olderNow = older && older.key === botKey ? older : null;
  const logPage = logQ.page ? withOlder(logQ.page, olderNow) : undefined;
  const chanQ = useChannels(botKey);

  const bv = viewQ.bot;
  const ctx = { botKey, uid: bv?.uid ?? '', revision: bv?.guardrailRevision };
  const linkId = linkQ.link?.id ?? '';
  const decide = useDecideGate({ botKey, gate: bv?.gate ?? null }, [viewQ]);
  const stopTurn = useStopTurn({ botKey });
  const action = useBotAction({ botKey, uid: ctx.uid });
  // The warned Dismiss of a pending banner (C9): the sends the banner showed when Dismiss was pressed, freed only on confirm.
  const [dismissing, setDismissing] = useState<{ which: 'action' | 'stop'; rows: ReadonlyArray<HeldSend> } | null>(null);
  const [acted, setActed] = useState<string | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const runAction = (k: 'reset' | 'forget' | 'purge' | 'delete') => {
    setActed(k);
    return action.run({ action: k, ...(actUid !== undefined ? { uid: actUid } : {}) }).then((r) => {
      setHeld((h) => heldAfter(h, k, r.outcome));
      return r;
    });
  };
  // Why Delete Bot stopped, when it said (a link step: data.ts DELETE_BOT_CODES); shown on that failure's own line only.
  const deleteWhy = acted === 'delete' && action.outcome === 'failed' ? DELETE_BOT_CODES.find((c) => c === action.code) : undefined;
  const leaveAction = () => {
    setHeld(null);
    setConfirm(null);
  };
  const save = useSaveSettings(ctx);
  // The pill's own press (the same save as Settings, its own outcome): a refusal here is not the Settings form's.
  const autoSave = useSaveSettings(ctx);
  const saveRules = useSaveGuardrails(ctx);
  // Which of Settings' two saves was started last (the owner of a refusal they hold): kept beside them, for as long as their outcomes live.
  const [settingsLast, setSettingsLast] = useState<SettingsLastSave | null>(null);
  const createLink = useCreateLink(ctx);
  const patchLink = usePatchLink(linkId);
  const panic = usePanic(linkId);
  const revokeAll = useKeyRevokeAll(linkId, parseBotKey(botKey)?.computerId);
  const repoint = useRepoint({ ...ctx, linkId });
  const mint = useMintKey(linkId);
  const rotate = useRotateKey(linkId);
  const keyChange = useKeyChange(linkId);
  const stopDelegate = useStopDelegate(botKey, [delegatesQ]);
  const [msgParam, openMsg, closeMsg] = useDrawerParam('msg');
  const msgTask = openTaskOf(msgParam, delegatesQ.delegates);
  const chanChange = useChannelChange(botKey, bv?.uid ?? '');
  const chanPause = useChannelsPause({ botKey, uid: bv?.uid ?? '' });
  const deleteLink = useBotAction({ botKey, uid: ctx.uid, linkId });

  // A rotated key's secret, with the Bot it was made for: drawn only under that Bot (the wipe below runs after the commit).
  const [fresh, setFresh] = useState<(FreshKey & { bot: string }) | null>(null);
  // A first link made now: the Bot whose Link tab still owes the "make a key" cue (LinkTab marks its
  // keys part once and gives New key the keyboard, then clears this). Page state only: a reload never brings it back.
  const [keysCue, setKeysCue] = useState<KeysCue | null>(null);
  // Where the keyboard was as the link drawer opened (the drawer hands focus back there on close): read in the opening
  // frame, before the drawer takes focus, as the kit's useFocusReturn reads its invoker.
  const linkOpener = useRef<Element | null>(null);
  const linkWasOpen = useRef(false);
  if (drawer === 'link' && !linkWasOpen.current) linkOpener.current = openerNow();
  linkWasOpen.current = drawer === 'link';
  const go = useGo();
  const search = useSearch();
  const pathname = usePathname();
  // What the page shows now, read when a create answers (the answer can come after the person moved on, or after this
  // pane is gone: then `mounted` is false and the answer changes nothing).
  const live = useRef({ mounted: true, botKey, drawer, link: linkQ.link, search, pathname });
  useEffect(() => {
    live.current = { mounted: true, botKey, drawer, link: linkQ.link, search, pathname };
  });
  useEffect(
    () => () => {
      live.current.mounted = false;
    },
    [],
  );
  // The confirmations live in the URL too, so the list's row menu can open them (?do=reset).
  const [doParam, setDo] = useSearchParam('do');
  const confirm = (CONFIRMS.includes(doParam ?? '') ? doParam : null) as Confirm | null;
  const setConfirm = (c: Confirm | null) => setDo(c ?? undefined, { replace: true });
  // The turn the Stop confirm is for: the first turn the view reads while it is open, frozen while it is open, so Stop never names a
  // later one. Opened by the URL (?do=stop from the list included) before the view was read, it waits for that read: the pane draws
  // a skeleton until then, so the confirm opens on the first read's turn.
  // The confirm names when the Hub picked the turn it shows (not the turn's start, nor proof it still runs: the view may be a
  // cached read), and asks it to stop only if it still runs. A confirm that froze no turn and then sees one says so (stopLater):
  // that turn is stopped only from a Stop opened again on it. A frozen turn the view no longer shows (stopMoved) is still the one
  // Stop sends, so the body says later turns are not stopped.
  const stopFrozen = useFrozenTurn(confirm === 'stop', botKey, bv == null ? undefined : (bv.turnId ?? null));
  // The Bot a reset, forget, purge or Delete confirm is for: its uid when the confirm opened, sent by runAction, so a Bot
  // replaced under the same id while the confirm is open is refused by the agent rather than reset or deleted.
  const actUid = useFrozenUid(confirm !== null && confirm !== 'stop', `${botKey}|${confirm ?? ''}`, bv?.uid);
  const stopTurnId = stopFrozen?.turn ?? null;
  const stopLater = stopFrozen !== null && stopTurnId === null && bv?.turnId != null;
  const stopMoved = stopFrozen !== null && stopTurnId !== null && bv != null && (bv.turnId ?? null) !== stopTurnId;
  const stopBody = stopLater
    ? t('bot.stopLater')
    : stopFrozen !== null && stopTurnId !== null
      ? stopMoved
        ? t('bot.stopMoved', { time: formatDateTime(stopFrozen.at) })
        : t('bot.stopAt', { time: formatDateTime(stopFrozen.at) })
      : t('bot.stopBody');
  const gateRef = useRef<HTMLDivElement>(null);
  const bot = viewQ.bot;
  const hasGate = bot?.gate != null;
  const gateKey = bot?.gate ? `${bot.gate.id}:${bot.gate.generation ?? 0}` : '';
  // The decision sent for the open gate outlives a tab change's remount of the card, and ends with its gate (gate-sent.ts).
  const [cardSent, onCardSent] = useGateSent(botKey, gateKey, bot != null);
  const waiting: GateEntry | null = bot?.gate
    ? { key: gateKey, ref: { id: bot.gate.id, generation: bot.gate.generation ?? 0 }, gate: gateViewOf(bot.gate), helper: false, addressing: false, held: null, decision: null }
    : null;

  // A secret never outlives its Bot or the page; nor does a cue owed to another Bot. A cue not yet shown ends here (its
  // watch of the person's own moves with it); once shown, LinkTab holds it and ends it.
  const cueRef = useRef(keysCue);
  // The Bot on screen now. The pane stays mounted across a Bot change (view.tsx renders it unkeyed), so a rotate answered
  // after the person picked another Bot reaches onRotated below; it is shown only while its own Bot is on screen.
  const botRef = useRef(botKey);
  // The rotate hook still holds the answer it handed over (the key in `fresh`): each drop of the key shown below drops it
  // there too (its reset; a rotate that may have gone through stays held), so no copy of the key outlives the one drawn.
  const rotateReset = useRef(rotate.reset);
  useEffect(() => {
    cueRef.current = keysCue;
    botRef.current = botKey;
    rotateReset.current = rotate.reset;
  });
  const dropFresh = (): void => {
    setFresh(null);
    rotateReset.current();
  };
  useEffect(() => {
    setFresh(null);
    return () => {
      setFresh(null);
      cueRef.current?.end();
      setKeysCue(null);
    };
  }, [botKey]);
  // Leaving the Link tab drops a cue not yet shown (coming back later is not "now") and the key shown there, as a route
  // change does: coming back never shows its secret again.
  const prevTab = useRef(tab);
  useEffect(() => {
    if (prevTab.current === 'link' && tab !== 'link') {
      setFresh(null);
      rotateReset.current();
      cueRef.current?.end();
      setKeysCue(null);
    }
    prevTab.current = tab;
  }, [tab]);
  // A key held while its tab is not on screen (a rotate answered after the person left Link and keys shows on the way
  // back) still ends with the place: realm switch, sign-out, page hide. SecretField wipes only while it is mounted.
  useWipeOn(dropFresh, undefined, fresh !== null);

  // Opening a Bot that waits for you puts the keyboard on its card's first control (Allow once, or the answer), after the
  // list hands focus on, unless the person holds the keyboard by then (keyboardHeld): a card that arrives while they type,
  // with an overlay open or with focus elsewhere in the Hub leaves their focus where it is (else the rest of their letters
  // would reach the page's shortcuts).
  useEffect(() => {
    if (!hasGate) return;
    const id = setTimeout(() => {
      const card = gateRef.current;
      if (card && !hiddenByPage(card) && !keyboardHeld(card)) focusGate(card);
    }, 80);
    return () => clearTimeout(id);
  }, [botKey, hasGate]);

  // A newer gate replaces the card (its key changes): if the keyboard was on the old card, it goes to the new one;
  // focus anywhere else stays put (the replacement is not an arrival).
  const cardHadFocus = useRef(false);
  useEffect(() => {
    const on = (e: FocusEvent) => {
      cardHadFocus.current = e.target instanceof Node && (gateRef.current?.contains(e.target) ?? false);
    };
    return onDocumentFocus(on);
  }, []);
  // A header button that folds into the ⋯ while it has the keyboard (a running Bot starts to need a fix) leaves the
  // keyboard on the ⋯, where the button went. Any later commit checks: the fold has no event of its own.
  const foldFocused = useRef<Element | null>(null);
  useEffect(() => {
    const on = (e: FocusEvent) => {
      foldFocused.current = e.target instanceof Element ? e.target.closest('[data-header-fold]') : null;
    };
    // Focus that leaves the button for no element (a click on plain text: no focusin follows) forgets it, so a later
    // fold does not pull the keyboard to the ⋯. Checked after the commit's own work: a button the fold removed is no
    // longer connected and stays remembered.
    const off = (e: FocusEvent) => {
      const was = foldFocused.current;
      if (!was || !(e.target instanceof Node) || !was.contains(e.target)) return;
      queueMicrotask(() => {
        if (foldFocused.current === was && was.isConnected && !holdsFocus(was)) foldFocused.current = null;
      });
    };
    return onDocumentFocus(on, off);
  }, []);
  useEffect(() => {
    const was = foldFocused.current;
    if (!was || was.isConnected || !focusLost()) return;
    foldFocused.current = null;
    moreTrigger(paneRef.current)?.focus({ preventScroll: true });
  });
  useEffect(() => {
    if (gateKey === '') return;
    const id = setTimeout(() => {
      const card = gateRef.current;
      if (card && cardHadFocus.current && focusLost() && !hiddenByPage(card) && !overlayOpen()) focusGate(card);
    }, 80);
    return () => clearTimeout(id);
  }, [gateKey]);

  usePageShortcuts([{ key: 's', label: t('shortcut.settings'), run: () => setSettings('model') }]);

  const computer = computers.find((c) => c.id === row?.computerId);
  // The Activity tab reads the Bot through BotSource: the log page unchanged, and the live reply of the session the view names
  // now (never cached: a reset names another one). Off the Activity tab no session is held.
  const home = botHome(botKey, computer);
  // The newest Bot reply row the log holds: a finished live reply stays shown until a newer one arrives (its own row).
  const replyMark = (logPage?.rows ?? []).reduce((m, r) => (r.kind === 'bot' && r.seq > m ? r.seq : m), -1);
  const botSource = useBotSource(
    botKey,
    { page: logPage, sid: tab === 'activity' ? (bv?.sessionId ?? null) : null, turnId: bv?.turnId ?? null, mark: replyMark, onReplyEnd: () => void logQ.refetch() },
    home,
  );
  const tail = botSource.tail();
  // A runtime row joins its task by session id: the chat lives on the Bot's computer, in the Bot's realm.
  const aiLink = usePageLink('ai');
  const placeOf = (r: LogRow): RowPlaceView | null => {
    const p = computer ? rowPlace(r, delegatesQ.delegates, computer, computers) : null;
    if (!p) return null;
    // The reference needs only the computer's handle and the realm (BotSource's home also needs the computer's project).
    const realm = parseBotKey(botKey)?.realm;
    const path = computer && realm !== undefined && aiLink ? chatLink({ computer: computerHandle(computer), realm, sid: p.sid }) : '';
    return { ...p, href: path || null };
  };
  const realm = realms.find((r) => r.id === row?.realm);
  const computerGoes = useComputerGoes();
  // A Bot that follows the AI page names the model it gives: never a blank chip.
  const modelLabel = useBotModelLabel(botKey, bot);

  if (viewQ.isPending || (!row && !listLoaded)) return <Skeleton variant="detail" rows={6} />;
  if (viewQ.isError) return <ErrorState title={t('bot.loadError')} error={viewQ.error} onRetry={() => void viewQ.refetch()} />;
  if (!row || !bot)
    return (
      <EmptyState
        icon="warn"
        title={t('bot.gone')}
        body={t('bot.goneBody')}
        action={<Button onPress={() => select(undefined)}>{t('bot.backToList')}</Button>}
      />
    );

  // The waiting card, drawn once: at the end of the thread on the Activity tab, above the tabs on the others.
  const card = hasGate ? <GateCard key={gateKey} ref={gateRef} bot={bot} change={decide} sent={cardSent} onSent={onCardSent} hint={<NotifyHint kind="bot" />} /> : null;
  const status = statusOf(bot);
  // A paused chat app asks nothing (the Chat apps badge is hidden by the same fact), so its attention rows go while the channel settings
  // say paused: the Bot's view can be a refetch behind the pause (or a second writer's), and its Fix would open a tab with nothing to fix.
  const appsPaused = chanQ.chat?.settings?.paused === true;
  const attentionRows = appsPaused ? bot.attention.filter((a) => a.row !== 'channels') : bot.attention;
  const attention = attentionRows.length > 0;
  // The header's Give it a link shows only while links can be made; a closed door leaves the Link tab's reason. A door not read yet keeps it (the drawer says why).
  const primary = primaryOf(bot, attention, linkQ.link === null && (offerQ.data?.door ?? 'ready') === 'ready');
  const canExpect = bot.caps.botExpect;
  // ?drawer=key opens New key; ?drawer=key:<id> edits that key, and only that key: gone from the list, the drawer says so.
  const keyId = drawer?.startsWith('key:') ? drawer.slice(4) : undefined;
  const editingKey = linkQ.link?.keys.find((k) => k.id === keyId) ?? null;
  const openTasks = delegatesQ.delegates.filter((d) => d.state !== 'closed').length;
  // Things waiting on the person in the Bot's chat apps (a group asking to join, no owner, a refused token, Telegram privacy on).
  const appsWaiting = badgeCount(chanQ.chat?.channels, appsPaused);
  const fixInApps = attention && attentionRows.every((a) => a.row === 'channels');
  const closeDrawer = () => setDrawer(undefined);
  // The create of a link is done (Give it a link). A Bot with no key yet goes to the Link and keys tab in place of the
  // drawer's history entry (Back does not reopen the drawer), with the keys cue owed; keys already there close the
  // drawer as before. Nothing when the person has left this Bot or closed the drawer meanwhile.
  const linkDone = (forKey: string) => {
    const now = live.current;
    if (!now.mounted || now.botKey !== forKey || now.drawer !== 'link') return;
    if (now.link && now.link.keysKnown && now.link.keys.length > 0) {
      closeDrawer();
      return;
    }
    setKeysCue(keysCueFor(forKey, linkOpener.current));
    // The URL as it is now (the person may have changed a filter while the create ran): drawer out, tab=link, the rest kept.
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(now.search)) {
      if (k === 'drawer' || k === 'tab' || v === undefined) continue;
      next.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    next.set('tab', 'link');
    go(`${now.pathname}?${next.toString()}`, { replace: true });
  };

  const { openComputer, openLogs } = computerGoes(computer);
  // The Bot's own ⋯ holds its address and its computer too, and every conversation verb (the list's row menu
  // keeps only what is not about the conversation). Copy address is offered only once the Bot has one.
  const address = linkQ.link?.url || null;
  const goes: MenuEntry[] = [
    ...(address ? [{ id: 'copy', label: t('row.copyLink'), icon: 'copy' as const, copy: address, onAction: () => undefined }] : []),
    ...(openComputer ? [{ id: 'computer', label: t('row.openComputer'), icon: 'computer' as const, onAction: openComputer }] : []),
    ...(openLogs ? [{ id: 'logs', label: t('row.logs'), icon: 'logs' as const, onAction: openLogs }] : []),
  ];
  // A running Bot that needs a fix shows Stop and Fix, the two actions that
  // matter then. Bot settings and the Details toggle lead this ⋯ instead (the same words, the same ?details=1; s still opens
  // the settings, and the model chip links there), so the header keeps two rows at 1350 px with the list beside it: Details
  // alone left the meta line 32 px short.
  const actionsInMenu = bot.turnRunning && primary === 'fix';
  // One choice, two places: header buttons, or the ⋯'s first entries (never both).
  const settingsDetails: { settings: ReactNode; details: ReactNode; entries: MenuEntry[] } = actionsInMenu
    ? {
        settings: null,
        details: null,
        entries: [
          { id: 'settings', label: t('bot.settingsButton'), icon: 'sliders', shortcut: 's', onAction: () => setSettings('model') },
          ...(tab === 'activity'
            ? [{ id: 'details', label: detailsOpen ? t('details.close') : t('details.open'), icon: 'panel-right' as const, onAction: () => setDetails(!detailsOpen, detailsOpen ? 'toggle' : 'panel') }]
            : []),
          '-',
        ],
      }
    : {
        settings: <IconButton data-header-fold icon="sliders" shortcut="s" label={t('bot.settingsButton')} onPress={() => setSettings('model')} />,
        details:
          tab === 'activity' ? (
            <IconButton
              data-details-toggle
              data-header-fold
              icon="panel-right"
              label={detailsOpen ? t('details.close') : t('details.open')}
              pressed={detailsOpen}
              onPress={() => setDetails(!detailsOpen, detailsOpen ? 'toggle' : 'panel')}
            />
          ) : null,
        entries: [],
      };
  const menu: MenuEntry[] = [
    ...settingsDetails.entries,
    ...(goes.length > 0 ? [...goes, '-' as const] : []),
    { id: 'reset', label: t('conv.reset'), icon: 'reload', isDisabled: !canExpect, onAction: () => setConfirm('reset') },
    { id: 'forget', label: t('conv.forget'), icon: 'x', isDisabled: !canExpect, onAction: () => setConfirm('forget') },
    { id: 'purge', label: t('conv.purge'), icon: 'trash', isDisabled: !canExpect, onAction: () => setConfirm('purge') },
    '-',
    { id: 'delete', label: t('danger.delete'), icon: 'trash', tone: 'danger', isDisabled: !canExpect, onAction: () => setConfirm('delete') },
  ];

  // What the Fix button is for, on the header's first line: the first attention line of the place the button
  // opens (a chat app's for Chat apps, the model's or the checker's for the settings). A group asking to join names itself
  // on its button ("A group is waiting", "2 groups are waiting"), so it adds no line.
  const firstWhy = fixInApps ? attentionRows.find((a) => a.key === 'chatapp') : attentionRows.find((a) => a.key === 'provider' || a.key === 'checker');
  const why =
    primary !== 'fix' || !firstWhy
      ? null
      : firstWhy.key === 'chatapp'
        ? t(`bot.why.${firstWhy.why ?? 'auth_failed'}`)
        : firstWhy.key === 'provider' || firstWhy.key === 'checker'
          ? t(`bot.why.${firstWhy.key}`)
          : null;
  // With the reason said beside the name, the button says only "Fix" (its name keeps where it goes), so the header keeps its
  // two rows at 1350 px.
  // The label is drawn by t() inside the button; count is read only by the waiting-groups plural.
  const fixButton = (full: 'bot.primary.fix' | 'bot.primary.fixApps' | 'bot.primary.groupWaiting', onPress: () => void, count = 1) =>
    why ? (
      <Button onPress={onPress} aria-label={t(full, { count })}>
        {t('bot.primary.fixShort')}
      </Button>
    ) : (
      <Button onPress={onPress}>{t(full, { count })}</Button>
    );
  const primaryButton =
    // The waiting card is on screen: it is the one place to decide, so the header offers no second button.
    primary === 'fix' ? (
      // A chat app is fixed in the Chat apps tab (the model settings hold nothing for it); anything else in the settings.
      fixInApps ? (
        fixButton(
          attentionRows.every((a) => a.key === 'chatwait') ? 'bot.primary.groupWaiting' : 'bot.primary.fixApps',
          () => setTabParam('apps'),
          // One group or several: the count is the list row's, the number its Chat apps cell says (one until the list has it).
          Math.max(1, row?.chatsWaiting ?? 1),
        )
      ) : (
        fixButton('bot.primary.fix', () => setSettings('model'))
      )
    ) : primary === 'link' && tab !== 'link' ? (
      // The Link tab offers its own Give it a link: the header does not say it twice.
      <Button icon="link" onPress={() => setDrawer('link')}>
        {t('link.give')}
      </Button>
    ) : null;

  // The meta fits one line. Its computer, model and Auto-approve show; the server and the realm, which a
  // person reads less often, are behind "+N" with the words on where the Bot lives (the "+N" names them for a screen reader).
  const metaMore = [computer?.server || null, realm ? realm.name : null].filter((x): x is string => x !== null);
  const metaMoreBody = (
    <>
      {metaMore.length > 0 && (
        <span className={s.metaGroup}>
          {computer?.server ? (
            <PageLinkTo href={computerLinks.servers} variant="plain" plain>
              <Tag>
                <Icon name="server" size="sm" /> {computer.server}
              </Tag>
            </PageLinkTo>
          ) : null}
          {realm && (
            <Link href={botLinks.byRealm(realm.id)} variant="plain"><Tag><Icon name="realm" size="sm" /> {realm.name}</Tag></Link>
          )}
        </span>
      )}
      {computer && (
        <>
          <p className={s.help}>{tp('bot.hostingBody', { computer: <ComputerLink name={computer.name} handle={computerHandle(computer)} plain /> })}</p>
          <p className={s.help}>{t('bot.defaultHelp')}</p>
        </>
      )}
    </>
  );
  const metaMoreName = t('bot.metaMoreName', { count: metaMore.length, names: metaMore.join(', ') });
  const meta = (
    <>
      {computer && (
        <PageLinkTo href={computerHref(computerHandle(computer))} variant="plain" plain>
          <Tag>
            <Icon name="computer" size="sm" /> {computer.flag} {computer.name}
          </Tag>
        </PageLinkTo>
      )}
      <Link href={botLinks.settings(botKey)} variant="plain"><Tag><Icon name="ai" size="sm" /> {modelLabel}</Tag></Link>
      <AutoApprove bot={bot} save={autoSave} />
      {(computer || realm) && (
        <Popover
          label={t('bot.hostingTitle')}
          title={t('bot.hostingTitle')}
          trigger={
            metaMore.length > 0 ? (
              <TextButton aria-label={metaMoreName}>{t('bot.metaMore', { count: metaMore.length })}</TextButton>
            ) : (
              <IconButton icon="info" size="sm" label={t('bot.hostingTitle')} />
            )
          }
          className={s.hostingPopover}
        >
          {metaMoreBody}
        </Popover>
      )}
    </>
  );

  return (
    <div ref={paneRef} className={s.pane}>
      <DetailHeader
        className={s.head}
        title={bot.name}
        status={
          <>
            <StatusPill tone={STATUS_TONE[status]} dot>
              {status === 'queued' ? queuedLabel(t, bot.queued) : t(`status.${status}`)}
            </StatusPill>
            {/* Why the header offers Fix: on the name's line, the line the Fix button ends. */}
            {why && (
              <>
                {' '}
                <Tag tone="warn">{why}</Tag>
              </>
            )}
          </>
        }
        meta={meta}
        actions={
          <>
            {/* Short words, so the name, the meta and the actions fit two rows at 1350 px. */}
            {bot.turnRunning && (
              <Button icon="stop" onPress={() => setConfirm('stop')}>
                {t('bot.stop')}
              </Button>
            )}
            {settingsDetails.settings}
            {primaryButton}
            {settingsDetails.details}
          </>
        }
        menu={menu}
      />

      {((hasGate && tab !== 'activity') || bot.pausedAtLimit || !canExpect || action.outcome === 'pending' || stopTurn.outcome === 'pending' || (stopTurn.outcome === 'done' && stopTurn.data?.matched === false) || autoSave.outcome === 'pending' || autoSave.outcome === 'failed') && (
        <div className={s.pinned}>
          {tab !== 'activity' && card}
          {bot.pausedAtLimit && (
            <OutcomeBanner
              kind="stale"
              title={t('bot.pausedTitle')}
              body={bot.autonomy ? t('bot.pausedBodyCount', { used: bot.autonomy.used, max: bot.autonomy.max }) : t('bot.pausedBody')}
            />
          )}
          {!canExpect && (
            <Band size="table">{t('bot.needsUpdate')}</Band>
          )}
          {action.outcome === 'pending' && <OutcomeBanner kind="pending" onCheck={() => action.readBack()} onDismiss={() => setDismissing({ which: 'action', rows: action.held() ?? [] })} dismissWarned />}
          {stopTurn.outcome === 'pending' && <OutcomeBanner kind="pending" title={t('bot.stopUnknown')} onCheck={() => stopTurn.readBack()} onDismiss={() => setDismissing({ which: 'stop', rows: stopTurn.held() ?? [] })} dismissWarned />}
          {stopTurn.outcome === 'done' && stopTurn.data?.matched === false && <Band size="table">{t('bot.stopEnded')}</Band>}
          <AutoApproveNote save={autoSave} />
        </div>
      )}

      <PendingMessages botKey={botKey} tasks={delegatesQ.delegates} openId={msgTask?.sessionId} />

      <Tabs
        label={bot.name}
        param="tab"
        sticky
        className={s.tabsInset}
        items={[
          { id: 'activity', label: t('tab.activity') },
          { id: 'link', label: t('tab.link') },
          { id: 'apps', label: t('tab.apps'), badge: appsWaiting > 0 ? appsWaiting : undefined, badgeUnit: () => t('tab.appsUnit') },
          { id: 'work', label: t('tab.work'), badge: openTasks > 0 ? openTasks : undefined, badgeUnit: () => t('tab.workUnit') },
        ]}
      />

      <div className={s.paneBody}>
        {tab === 'activity' && (
          <ActivityTab
            // One Bot's thread: a Bot change remounts it, so it opens at the end whatever the last Bot's reader did.
            key={botKey}
            page={botSource.page()}
            tail={tail?.text ?? null}
            placeOf={placeOf}
            loading={logQ.isPending}
            error={logQ.isError}
            onRetry={() => void logQ.refetch()}
            loadingOlder={loadOlder.running}
            olderFailed={loadOlder.outcome === 'failed'}
            onOpenArchive={() => setDrawer('archive')}
            onLoadOlder={() => {
              const before = logPage?.rows[0]?.seq;
              if (before === undefined) return;
              void loadOlder.run({ before }).then((r) => {
                const got = r.data;
                if (r.outcome === 'done' && got) setOlder((cur) => ({ key: botKey, rows: [...got.rows, ...(cur && cur.key === botKey ? cur.rows : [])], hasOlder: got.hasOlder }));
              });
            }}
            bot={bot}
            row={row}
            link={linkQ.link}
            onOpenSettings={setSettings}
            onGiveLink={() => setDrawer('link')}
            onOpenLink={() => setTabParam('link')}
            tasks={delegatesQ.data ? delegatesQ.delegates : undefined}
            onMessageTask={(d) => openMsg(d.sessionId)}
            card={card ?? undefined}
            waiting={waiting}
            working={bot.turnRunning}
            details={detailsOpen}
            onDetails={(open) => setDetails(open, open ? 'panel' : 'toggle')}
            revealRef={revealDetails}
            composer={<Say key={botKey} bot={bot} botKey={botKey} rows={logPage?.rows} viewAt={viewQ.dataUpdatedAt} onOpenVoiceSettings={() => setSettings('voice')} />}
          />
        )}
        {tab === 'link' && (
          <LinkTab
            // One Bot's tab: a Bot change remounts it, so a cue taken for the last Bot (its mark, timer and focus job) ends there.
            key={botKey}
            bot={bot}
            link={linkQ.link}
            loading={linkQ.isPending}
            offer={offerQ.data}
            fresh={fresh !== null && fresh.bot === botKey ? fresh : null}
            onDropSecret={dropFresh}
            patch={patchLink}
            panic={panic}
            revokeAll={revokeAll}
            rotate={rotate}
            keyChange={keyChange}
            onOpenLinkDrawer={() => setDrawer('link')}
            onOpenLimits={() => setDrawer('linkset')}
            onOpenRepoint={() => setDrawer('repoint')}
            onNewKey={() => setDrawer('key')}
            onEditKey={(id) => setDrawer(`key:${id}`)}
            onRotated={(secret, name) => {
              // This render's Bot is the one the rotate was sent for; another Bot's page never shows its key.
              if (botRef.current === botKey) setFresh({ bot: botKey, secret, name });
            }}
            keysCue={keysCue !== null && keysCue.key === botKey ? keysCue : null}
            onKeysCueSeen={() => setKeysCue(null)}
          />
        )}
        {tab === 'apps' && <ChatAppsTab bot={bot} channels={chanQ.chat?.channels} settings={chanQ.chat?.settings} loading={chanQ.isPending} change={chanChange} pause={chanPause} />}
        {tab === 'work' && (
          <WorkTab
            delegates={delegatesQ.delegates}
            computers={computers}
            stop={stopDelegate}
            canStop
            finished={{ open: finishedParam === '1', ...finishedQ }}
            loading={!delegatesQ.data && !delegatesQ.error}
            error={delegatesQ.data ? undefined : delegatesQ.error}
            onRefresh={() => void delegatesQ.refetch()}
            onMessageTask={(d) => openMsg(d.sessionId)}
          />
        )}
      </div>

      <SettingsDrawer
        section={settings === undefined ? undefined : settingsSectionOf(settings)}
        onSection={setSettings}
        onClose={() => setSettings(undefined)}
        bot={bot}
        models={models}
        computers={computers}
        save={save}
        saveRules={saveRules}
        lastSave={settingsLast}
        onSaveStart={setSettingsLast}
      />
      <MessageTaskHost botKey={botKey} task={msgTask} onClose={closeMsg} reads={[logQ]} declines={hasGate} />
      <GiveLinkDrawer open={drawer === 'link'} onClose={closeDrawer} bot={bot} offer={offerQ.data} create={createLink} onDone={() => linkDone(botKey)} />
      <KeyDrawer open={drawer === 'key' || keyId !== undefined} onClose={closeDrawer} editing={editingKey} editId={keyId} known={linkQ.data !== undefined} mint={mint} edit={keyChange} url={linkQ.link?.url} taken={(linkQ.link?.keys ?? []).filter((k) => k.id !== keyId).map((k) => k.name)} />
      <LimitsDrawer open={drawer === 'linkset'} onClose={closeDrawer} link={linkQ.link} patch={patchLink} remove={deleteLink} />
      <RepointDrawer open={drawer === 'repoint'} onClose={closeDrawer} bot={bot} computers={computers} repoint={repoint} />
      <ArchiveDrawer open={drawer === 'archive'} onClose={closeDrawer} botKey={botKey} name={bot.name} />

      <ConfirmDialog
        overlayId="bots-pane-dismiss"
        isOpen={dismissing !== null}
        onOpenChange={(o) => !o && setDismissing(null)}
        title={t('start.dismissTitle')}
        body={t('start.dismissBody')}
        confirmLabel={t('start.dismissGo')}
        tone="danger"
        onConfirm={() => {
          if (dismissing) void (dismissing.which === 'action' ? action : stopTurn).dismissShown(dismissing.rows);
          setDismissing(null);
        }}
      />
      <ConfirmDialog
        overlayId="bots-pane-stop"
        isOpen={confirm === 'stop'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('bot.stopTitle')}
        body={stopBody}
        confirmLabel={t('bot.stopGo')}
        confirmDisabled={stopTurnId === null}
        busy={stopTurn.running}
        outcome={stopTurn.outcome === 'failed' || stopTurn.outcome === 'pending' ? { kind: stopTurn.outcome } : undefined}
        onCheck={() => stopTurn.readBack()}
        onConfirm={() => {
          if (stopTurnId !== null) void stopTurn.run({ turnId: stopTurnId }).then((r) => r.outcome === 'done' && setConfirm(null));
        }}
      />
      {(['reset', 'forget'] as const).map((k) => (
        <ConfirmDialog
          overlayId="bots-pane-conversation-confirm"
          key={k}
          isOpen={confirm === k}
          onOpenChange={(o) => !o && leaveAction()}
          title={t(`conv.${k}.title`)}
          body={[t(`conv.${k}.what`), t('conv.tasksKeep')].join(' ')}
          confirmLabel={t(`conv.${k}`)}
          confirmDisabled={held === k}
          busy={action.running}
          outcome={dialogOwnOutcome(action.outcome, acted, k)}
          onCheck={() => action.readBack()}
          onConfirm={() => void runAction(k).then((r) => r.outcome === 'done' && setConfirm(null))}
        />
      ))}
      <HeldDangerConfirm
        overlayId="bots-pane-purge"
        held={held === 'purge'}
        isOpen={confirm === 'purge'}
        onOpenChange={(o) => !o && leaveAction()}
        title={t('conv.purge.title')}
        body={t('conv.purge.what')}
        confirmText={bot.name}
        consequences={[t('conv.tasksKeep')]}
        confirmLabel={t('conv.purge')}
        busy={action.running}
        outcome={dialogOwnOutcome(action.outcome, acted, 'purge')}
        onCheck={() => action.readBack()}
        onConfirm={() => void runAction('purge').then((r) => r.outcome === 'done' && setConfirm(null))}
      />
      <HeldDangerConfirm
        overlayId="bots-pane-delete"
        held={held === 'delete'}
        isOpen={confirm === 'delete'}
        onOpenChange={(o) => !o && leaveAction()}
        title={t('danger.delete.title', { name: bot.name })}
        // The Bot's link goes first (data.ts deleteBotFlow): said before the press when the page knows of one, and as a
        // maybe while the links are not read (the flow reads them fresh either way).
        body={t(linkQ.link ? 'danger.delete.whatLink' : linkQ.data ? 'danger.delete.what' : 'danger.delete.whatLinkMaybe')}
        confirmText={bot.name}
        confirmLabel={t('danger.deleteGo')}
        busy={action.running}
        outcome={deleteWhy ? { kind: 'failed', message: t(`danger.delete.${deleteWhy}`) } : dialogOwnOutcome(action.outcome, acted, 'delete')}
        onCheck={() => action.readBack()}
        onConfirm={() =>
          void runAction('delete').then((r) => {
            if (r.outcome === 'done') {
              setConfirm(null);
              select(undefined);
            }
            // The link went and the Bot stayed: the Link tab shows it now, not at its next poll.
            else if (r.code === 'BOT_LINK_GONE_BOT_KEPT') void linkQ.refetch();
          })
        }
      />
    </div>
  );
}
