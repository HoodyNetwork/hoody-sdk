// The bots page: every Bot on the realm's running computers in a searchable table, and one Bot's
// page beside it. Selection, tabs, settings and drawers live in the URL (?sel=, ?tab=,
// ?settings=, ?drawer=), so Back works and every state deep-links.
import {
  AgentHint,
  Button,
  CHAT_SLOTS,
  ChatNames,
  ComputerMark,
  DataTable,
  EmptyState,
  ConfirmDialog,
  FaqLink,
  ErrorState,
  Icon,
  InfoTip,
  Spinner,
  ListDetailPage,
  Monogram,
  StatStrip,
  SrOnly,
  TextButton,
  usePresentation,
  type Stat,
  Skeleton,
  StatusPill,
  Tooltip,
  createColumnHelper,
  formatDateTime,
  formatRelative,
  useGo,
  useDataView,
  useSearchParam,
  useSelection,
  useStrings,
  GroupNotes,
  type DataTableProps,
  type GroupNote,
  type RowActionEntry,
  OutcomeBanner,
  Tag,
  HeldFromLink,
  ComputerLink,
  PageLinkTo,
  followPageLink,
  usePageLink,
  usePageShortcuts,
} from '@kit';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { queuedLabel } from './parts/queuedLabel';
import { links as computerLinks } from '../computers/links';
import { type BotRow, type Computer, useBotAction, useBotModelLabels, useBots, useComputers, useLinkOffer, useLinkUrls, useModels, useRealms, useShownComputer, useStartComputer, type HeldSend, type RunOutcome, type StartHold } from './data';
import { alive, capture, computerHandle, filterComputer, hostEnv, useAgentScopeFacts, useCore, type Ctx } from '@core';
import { AgentSignIn, useAgentSignIn, type SignInComp } from '@app/AgentSignIn';
import { BOT_STATUSES, STATUS_RANK, botTint, compareBots, listSummary, needsYou, parseBotKey } from './logic';
import { botLinks } from './links';
import { pageFaq } from './faq';
import { BotPane } from './parts/BotPane';
import { GuideConnectLink, STATUS_TONE, useComputerGoes } from './parts/Bits';
import { GoneCreates } from './parts/GoneCreates';
import { NewBotDrawer } from './parts/NewBotDrawer';
import { RailLine, railStatus } from './parts/RailLine';
import p from './parts/pane.module.css';
import strings from './strings.en.json';

const col = createColumnHelper<BotRow>();
type TableGroup = NonNullable<DataTableProps<BotRow>['groups']>[number];

/** What marks a locked Bot: its lock, before its name (a table and a rail alike). */
// A row's state is its status pill alone (no dot beside it saying the same, and no lead column left empty).
const botMark = (r: BotRow) => (r.locked ? <Icon name="lock" size="sm" className={p.lockIcon} /> : null);

export default function BotsPage() {
  const t = useStrings(strings);
  const { items, byId } = pageFaq(t);
  const go = useGo();
  const computersLink = usePageLink('computers');
  const computerGoes = useComputerGoes();
  const computersQ = useComputers();
  const botsQ = useBots();
  const realmsQ = useRealms();
  const modelsQ = useModels();
  const offerQ = useLinkOffer();
  const urls = useLinkUrls();
  const start = useStartComputer();
  const resume = useBotAction();
  // The computer whose Resume was pressed last, with the context of that press: what a refused one names, only while that
  // context lives (another realm or account never sees it). One that may have gone through names its own (core holds it).
  const [resumedOn, setResumedOn] = useState<{ computerId: string; ctx: Ctx } | null>(null);
  const [selected] = useSelection();
  // Another Bot picked in the list beside an open Bot keeps every scroller where it is: the router would otherwise copy the
  // last Bot's scroll onto the new one after it is drawn, and its log, which opens at its end, would open where the last
  // reader stopped. The first Bot opened from the list alone (a phone, where the list is the screen and the page scrolls as
  // one) takes the router's own scroll, so the Bot never opens part way down the page.
  const [, setSel] = useSearchParam('sel');
  const select = (key: string) => setSel(key, selected ? { keepScroll: true } : undefined);
  const [drawer, setDrawer] = useSearchParam('drawer');
  const [initial] = useSearchParam('initial');

  const computers = useMemo(() => computersQ.data ?? [], [computersQ.data]);
  // The computer the top bar shows: New Bot starts on it.
  const shownComputer = useShownComputer(computers);
  const realms = useMemo(() => realmsQ.data ?? [], [realmsQ.data]);
  const models = useMemo(() => modelsQ.data ?? [], [modelsQ.data]);
  // A Bot that follows the AI page shows the model the AI page gives it, read once per computer and realm.
  const labeled = useBotModelLabels(botsQ.data);
  const bots = useMemo(() => labeled ?? [], [labeled]);
  const computerOf = (id: string): Computer | undefined => computers.find((c) => c.id === id);
  const running = computers.filter((c) => c.state === 'running');
  const stopped = computers.filter((c) => c.state === 'stopped');

  // The Bots that need the person first (a question, a pause at its limit, groups asking in), then by status and the latest
  // activity; the data view keeps this order until the user sorts a column.
  const ordered = useMemo(() => [...bots].sort((a, b) => Number(needsYou(b)) - Number(needsYou(a)) || compareBots(a, b)), [bots]);

  usePageShortcuts([{ key: 'n', label: t('shortcut.new'), run: () => setDrawer('new'), enabled: running.length > 0 }]);

  // The words the Link column shows for a row (its cell and its measured width share them).
  const linkWord = (v: BotRow['link']) => (v === 'active' ? t('ui.on') : v === 'none' ? t('ui.off') : t(`link.status.${v}`));

  // Measured columns: Computer, Model, Link and Last take their words' width (their declared widths
  // stay their floors); the name takes the rest. Status, Realm and Chat apps draw pills and tags, which the cell-font
  // measure cannot size: they keep their widths and cut with the cell tooltip.
  // Bots group by computer once they span more than one (a computer with only a note counts: its note lives in its group):
  // a row under its computer's header does not name it again, in the list or the table (no COMPUTER column then).
  const noted = computers.filter(hasNotes);
  const spanning = new Set([...bots.map((b) => b.computerId), ...noted.map((c) => c.id)]).size > 1;
  // Cards are one grid, the Bots needing the person first, each card naming its computer; the computers' notes then sit
  // above the grid. The table, and the list rows beside an open Bot, group by computer.
  const [present, setPresent] = usePresentation('bots', 'cards');
  const rail = !!selected;
  const grouped = spanning && (present !== 'cards' || rail);
  // The terminal's card rows (model on its own meta line, the reach foot under it) are the page's list only. Beside an
  // open Bot the rows are the rail's two lines, as on the web: a row of four lines showed 8 Bots where 16 fit, and the
  // foot in the rail's 36 cells wrapped the app names letter by letter beside a privacy note.
  const termCards = hostEnv().browserPage !== true && present === 'cards' && !rail;
  // The web's rail row is two lines of one height: the name, then its status and one cut line (what it is doing, its
  // realm, its chat apps' marks at the end). The terminal draws its rail from the fields themselves (its own two lines).
  const webRail = rail && hostEnv().browserPage === true;
  // The page's cards: a lead line (what the Bot is doing), what it is for, then its facts as label and value rows
  // (Computer, Realm, Model) on the card's shared value edge.
  const webCards = present === 'cards' && !rail && hostEnv().browserPage === true;
  // A realm on every row says something only when the Bots listed are not all in one (a realm chosen, or one realm in use).
  const realmsVary = new Set(bots.map((b) => b.realm)).size > 1;
  // A Bot's chat apps as one ChatNames text: each app's mark and name, a space between them.
  const appsText = (r: BotRow): string => r.chatApps.map((k) => CHAT_SLOTS[k]).join(' ');
  // What the Bot is doing, or when it last did something, in one plain line; a working Bot shows the kit's moving dots.
  const nowLine = (r: BotRow): ReactNode => {
    if (r.locked) return t('now.locked');
    // Groups asking a chat app to let them in come before work in progress: they wait on the person (Let in).
    if (r.chatsWaiting > 0) return t('list.chatsWaiting', { count: r.chatsWaiting });
    if (r.status === 'working')
      return (
        <>
          <Spinner />
          {/* The card line drops plain spaces between its parts (one flex row): a no-break space keeps the gap. */}
          {`\u00a0${t('now.working')}`}
        </>
      );
    if (r.status === 'waiting') return t('now.waiting');
    if (r.status === 'paused') return t('now.paused');
    if (r.status === 'queued') return t('now.queued', { count: r.queued });
    return r.lastActivityAt ? t('now.idle', { when: formatRelative(r.lastActivityAt) }) : t('now.new');
  };
  // The groups waiting (the table's Chat apps cell; a card says it on its "now" line) and the privacy note of a Bot's
  // chat apps. Privacy on is information, not a fault: quiet words that open what it means and how to turn it off (the
  // kit tip with the FAQ answer).
  const appNotes = (r: BotRow, waiting: boolean): ReactNode => (
    <>
      {waiting && r.chatsWaiting > 0 && (
        <>
          {' '}
          <Tag tone="warn">{t('list.chatsWaiting', { count: r.chatsWaiting })}</Tag>
        </>
      )}
      {r.privacyOn && (
        <>
          {' '}
          <InfoTip text={t('list.privacyTip')} subject={t('list.privacySubject')} faq={{ item: byId.telegramPrivacy, label: t('list.privacyFaq') }}>
            <ChatNames text={t('list.privacyOn', CHAT_SLOTS)} />
          </InfoTip>
        </>
      )}
    </>
  );

  // The web rail's line 2 after the status says only what the status does not: its realm first where the listed Bots
  // differ in it, then what it is doing (when it was last active, New before its first message, the groups waiting for a
  // Bot that holds Let in, another program for a locked one, the moving dots of one at work), then "Privacy on" beside
  // its chat apps' marks at the line's end (a row with its word, Answer, Write or Let in, ends with the word after them).
  // What is not drawn stays in the row's words (`hidden`, beside the status).
  const railParts = (r: BotRow): { now: ReactNode | null; realm: string | null; apps: string | null; privacy: boolean; hidden: ReactNode } => {
    const worded = !r.locked && (r.status === 'waiting' || r.status === 'paused' || r.chatsWaiting > 0);
    const letIn = worded && r.chatsWaiting > 0;
    const marks = r.chatApps.length > 0;
    const drawnPrivacy = marks && r.privacyOn;
    const idle = !r.locked && !worded && r.status === 'idle';
    const now: ReactNode | null = r.locked
      ? t('now.lockedShort')
      : letIn
        ? t('list.chatsWaiting', { count: r.chatsWaiting })
        : !worded && r.status === 'working'
          ? <Spinner />
          : idle
            ? (r.lastActivityAt ? formatRelative(r.lastActivityAt) : t('col.new'))
            : null;
    // The whole sentence where the line says less: a locked Bot's server, a working Bot's words, a worded Bot's state.
    const said = letIn || idle;
    // A Bot holding Let in says why first (its groups waiting): its realm then stays in its words, never pushing it out.
    const drawnRealm = realmsVary && !letIn;
    return {
      now,
      realm: drawnRealm ? r.realmName : null,
      apps: marks ? appsText(r) : null,
      privacy: drawnPrivacy,
      hidden: (
        <>
          {said ? null : <> · {nowLine(r)}</>}
          {drawnRealm ? null : ` · ${r.realmName}`}
          {r.privacyOn && !drawnPrivacy ? ` · ${t('list.privacyOn', { telegram: t('chan.kind.telegram'), slack: t('chan.kind.slack'), discord: t('chan.kind.discord') })}` : null}
        </>
      ),
    };
  };

  // One set of columns for three presentations. Cards (the default) and list rows read their roles: the Bot's mark
  // (lead), its name (primary), its status, then one line each for what it is doing now, what it is for, where it
  // lives and its model, and how to reach it in the card's foot. The table keeps its dense columns (Status, Computer,
  // Realm, Chat apps, Model, Link, Last active); the card-only fields never show there.
  // The web rail's status column: one width on every row (pane.module.css, nine characters of the status type), so the
  // line's words start at one x. Short words fit it: "Needs you", "3 queued"; the row's words keep the whole status. A
  // Bot waiting on the person (Needs you, Paused) keeps the status's box, so those rows stand out.
  const railStatusWord = (r: BotRow): string =>
    r.locked ? t('status.locked') : r.status === 'queued' ? t('status.queuedRail', { count: r.queued }) : r.status === 'waiting' ? t('status.needsYou') : t(`status.${r.status}`);
  const railStatusFull = (r: BotRow): string => (r.locked ? t('status.locked') : r.status === 'queued' ? queuedLabel(t, r.queued) : t(`status.${r.status}`));
  const columns = useMemo(
    () => [
      col.display({
        id: 'mark',
        header: t('col.mark'),
        meta: { list: 'lead', table: false },
        // lg marks a card; beside an open Bot the kit draws list rows, whose lead column holds a row mark (md).
        cell: (c) => <Monogram name={c.row.original.name} size={rail ? 'md' : 'lg'} tint={botTint(c.row.original.key)} />,
      }),
      col.accessor('name', {
        header: t('col.name'),
        meta: { pinned: true, size: 'fill', list: 'primary' },
        cell: (c) => {
          const r = c.row.original;
          const inner = (
            <span className={p.nameCell}>
              {/* In the rail, LOCKED on line 2 says it: no lock before the name, so every name starts at one x. */}
              {r.locked && !webRail && <span className={p.nameMark}>{botMark(r)}</span>}
              <span className={p.cellText}>{c.getValue()}</span>
            </span>
          );
          return r.locked ? <Tooltip content={t('row.locked')}>{<span className={p.lockedRow}>{inner}</span>}</Tooltip> : inner;
        },
      }),
      col.accessor('status', {
        header: t('col.status'),
        // Fits the longest full form, "99 messages waiting", after the pill's 8 px dot, inside the cell padding.
        meta: { width: '176px', list: 'status' },
        sortingFn: (a, b) => STATUS_RANK[a.original.status] - STATUS_RANK[b.original.status],
        cell: (c) => (
          <>
            {webRail ? (
              // The rail's status column: one width on every row; boxed only where the Bot waits on the person (Needs you, Paused).
              railStatus(railStatusWord(c.row.original), railStatusFull(c.row.original), c.row.original.locked ? 'neutral' : STATUS_TONE[c.getValue()], !c.row.original.locked && (c.getValue() === 'waiting' || c.getValue() === 'paused'))
            ) : c.row.original.locked ? (
              <StatusPill tone="neutral">{t('status.locked')}</StatusPill>
            ) : (
              <StatusPill tone={STATUS_TONE[c.getValue()]} dot>
                {c.getValue() === 'queued' ? queuedLabel(t, c.row.original.queued) : t(`status.${c.getValue()}`)}
              </StatusPill>
            )}
            {/* In the web rail, what its line 2 does not draw, as the row's words. */}
            {webRail && <SrOnly>{railParts(c.row.original).hidden}</SrOnly>}
          </>
        ),
      }),
      // What the Bot is doing or last did, in words; a working Bot shows the kit's moving dots (still under reduced motion).
      col.accessor('lastActivityAt', {
        id: 'now',
        header: t('col.now'),
        meta: { list: webRail ? false : 'meta', table: false },
        cell: (c) => nowLine(c.row.original),
      }),
      // In a rail the row has room for three fields after its status (now, where, chat apps): the role is left to the open Bot.
      col.accessor('role', { header: t('col.role'), meta: { list: rail ? false : 'meta', table: false, listWraps: true } }),
      // Where it lives: its computer (only when the list does not group by computer, whose header names it) and realm.
      col.accessor((r) => `${computerOf(r.computerId)?.name ?? ''} ${r.realmName}`, {
        id: 'where',
        header: t('col.where'),
        meta: { list: webRail || webCards ? false : 'meta', table: false },
        cell: (c) => {
          const r = c.row.original;
          const comp = grouped ? undefined : computerOf(r.computerId);
          if (!comp) return r.realmName;
          // The card line is one flex row that drops plain spaces between parts: the separator holds no-break spaces.
          return (
            <>
              <ComputerLink name={comp.name} handle={computerHandle(comp)} variant="inline" cut />
              {` · ${r.realmName}`}
            </>
          );
        },
      }),
      col.accessor((r) => computerOf(r.computerId)?.name ?? '', {
        id: 'computer',
        header: t('col.computer'),
        // 12 px narrower to give Status its dot room: the row's columns still fit where they did, and the name cuts with an ellipsis.
        // Fit: the flag and its gap sit before the name (fitPad).
        meta: { width: '154px', priority: 2, size: 'fit', list: webCards ? ('meta' as const) : false, listLabel: true, fitText: (r: BotRow) => computerOf(r.computerId)?.name ?? '', fitPad: 22, ...(spanning ? { table: false as const } : {}) },
        cell: (c) => {
          const comp = computerOf(c.row.original.computerId);
          // A card's fact is the name alone, on the value edge the other facts start on.
          if (webCards) return comp ? <ComputerLink name={comp.name} handle={computerHandle(comp)} variant="inline" cut /> : null;
          return comp ? (
            <span className={p.cell}>
              <span aria-hidden="true">{comp.flag}</span>
              {/* The link cuts its own name (cut), so no clipping wrapper hides its focus ring. inline, not nav: on a coarse
                  pointer a nav link is a 44 px box, taller than the row. */}
              <ComputerLink name={comp.name} handle={computerHandle(comp)} variant="inline" cut />
            </span>
          ) : null;
        },
      }),
      col.accessor('realmName', { header: t('col.realm'), meta: { width: '140px', priority: 3, list: webCards ? ('meta' as const) : false, listLabel: true }, cell: (c) => (webCards ? c.getValue() : <Tag>{c.getValue()}</Tag>) }),
      col.accessor((r) => r.chatApps.join(','), {
        id: 'chatApps',
        header: t('col.apps'),
        // A rail row's third field (each app as its mark); cards leave it out (their apps line is the card's own).
        meta: { width: '230px', priority: 3, list: rail && !webRail ? ('meta' as const) : false, card: false as const },
        // Each app's mark and name as small text (three fit the column whole), then its notes; in a rail each mark alone.
        // No app: the table shows a dash; a rail draws nothing (an empty field takes no place), so a row stays two lines.
        cell: (c) => {
          const r = c.row.original;
          if (r.chatApps.length === 0) return rail ? null : '—';
          return (
            <span className={`${p.cell} ${p.apps} ${p.help}`} data-meta-wraps="">
              <ChatNames text={appsText(r)} marksInRail />
              {appNotes(r, true)}
            </span>
          );
        },
      }),
      // The terminal draws a card as a list row: the model wraps onto its meta lines, past the list's three-field cap.
      // The page's cards too: the model is the card's fifth line, one more than a card keeps unless the field wraps.
      // The ways to reach the Bot are the card's foot there too (the kit draws a card row's foot under its meta lines).
      col.accessor('modelLabel', { header: t('col.model'), meta: { width: '140px', priority: 4, size: 'fit', list: webRail ? false : 'meta', listLabel: true, ...(termCards || webCards ? { listWraps: true } : {}) } }),
      // The web rail's line 2 after the status (RailLine): one field that fills the line (listFill), so every row is the
      // same two lines and its ⋯ sits at the same place.
      col.display({
        id: 'railLine',
        header: t('col.now'),
        meta: { list: webRail ? ('meta' as const) : false, table: false, card: false as const, listFill: true },
        cell: (c) => {
          const { now, realm, apps, privacy } = railParts(c.row.original);
          return <RailLine now={now} realm={realm} apps={apps} privacy={privacy ? t('list.privacySubject') : null} />;
        },
      }),
      col.accessor('link', {
        header: t('col.link'),
        meta: { width: '84px', priority: 3, size: 'fit', list: false, fitText: (r: BotRow) => linkWord(r.link) },
        cell: (c) => linkWord(c.getValue()),
      }),
      col.accessor('lastActivityAt', {
        id: 'lastActivityAt',
        header: t('col.last'),
        meta: { width: '110px', priority: 4, size: 'fit', list: false, fitText: (r: BotRow) => (r.lastActivityAt ? formatRelative(r.lastActivityAt) : t('col.new')) },
        cell: (c) =>
          c.getValue() ? (
            <Tooltip content={formatDateTime(c.getValue() as string)}>
              <span>{formatRelative(c.getValue() as string)}</span>
            </Tooltip>
          ) : (
            t('col.new')
          ),
      }),
      // How to reach it, in the card's foot: its chat apps (with the privacy note) and its public link.
      col.display({
        id: 'reach',
        header: t('col.reach'),
        // Not in the terminal's rail (see termCards): the open Bot's own page says how to reach it.
        meta: { list: false, table: false, card: rail && hostEnv().browserPage !== true ? (false as const) : ('foot' as const) },
        // Every way to reach the Bot besides the Hub, or that the Hub is the only one.
        cell: (c) => {
          const r = c.row.original;
          const link = r.link === 'active';
          // The two-line height in every card (chat apps with a link take two lines), the words centred in it: every
          // card's foot is then the same height, and the row menu sits at the same place.
          const ways: ReactNode =
            r.chatApps.length === 0 && !link ? (
              t('reach.hubOnly')
            ) : (
              <>
                {r.chatApps.length > 0 && <ChatNames text={appsText(r)} />}
                {link && (
                  <>
                    {' '}
                    {hostEnv().browserPage === true ? (
                      // A mark and its word, as the chat apps beside it.
                      <span className={p.reachLink}>
                        <Icon name="globe" size="sm" />
                        {t('reach.link')}
                      </span>
                    ) : (
                      <Tag>
                        <Icon name="globe" size="sm" />
                        {t('reach.link')}
                      </Tag>
                    )}
                  </>
                )}
                {appNotes(r, false)}
              </>
            );
          return (
            <span className={p.reach}>
              <span className={p.reachWays}>{ways}</span>
            </span>
          );
        },
      }),
    ],
    // computerOf reads `computers`; linkWord reads `t`
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, computers, spanning, grouped, rail, termCards, webRail, webCards, realmsVary],
  );

  const loading = computersQ.isPending || botsQ.isPending;
  // ?computer=<id> naming a computer that is not running: its Bots are not listed, so say why instead of a bare no-match;
  // one that names no computer here says so, whether or not anything runs (the raw id is never printed).
  // The param is the filter's own value, a computer id; Computers, Logs and Guide link with its handle (name.last4), which
  // reads as that computer at once and is rewritten to the id in place (an id that is also a handle never rewrites).
  const [rawParam, setRawParam] = useSearchParam('computer');
  const byHandle = rawParam && !computers.some((c) => c.id === rawParam) ? computers.find((c) => computerHandle(c) === rawParam) : undefined;
  const computerParam = byHandle?.id ?? rawParam;
  useEffect(() => {
    if (byHandle) setRawParam(byHandle.id, { replace: true });
  }, [byHandle, setRawParam]);
  const stoppedFilter = computerParam ? stopped.find((c) => c.id === computerParam) : undefined;
  const stoppedFilterName = stoppedFilter?.name;
  const unknownFilter = !!computerParam && !computers.some((c) => c.id === computerParam);
  // The agent prompt names the filtered computer, else the realm's computers. A filter the list cannot resolve is
  // never widened: a full id is named by that id, anything else asks which computer (filterComputer).
  const agentFilter = filterComputer(computerParam, computerParam && !unknownFilter ? computerParam : undefined);
  const agentFacts = useAgentScopeFacts(agentFilter.computer, agentFilter.ask);
  const view = useDataView<BotRow>({
    rows: loading ? undefined : ordered,
    columns,
    getRowId: (r) => r.key,
    search: (r) => [r.name, r.id, r.role, r.modelLabel, computerOf(r.computerId)?.name, r.realmName],
    filters: [
      { id: 'status', label: t('filter.status'), value: (r) => r.status, options: BOT_STATUSES.map((x) => ({ value: x, label: t(`status.${x}`) })) },
      { id: 'computer', label: t('filter.computer'), value: (r) => r.computerId, options: [...computers.map((c) => ({ value: c.id, label: c.name, mark: <ComputerMark color={c.color} /> })), ...(unknownFilter && computerParam ? [{ value: computerParam, label: t('filter.computer.unknown') }] : [])] },
      { id: 'realm', label: t('filter.realm'), value: (r) => r.realm, options: realms.map((r) => ({ value: r.id, label: r.name })) },
      { id: 'link', label: t('filter.link'), value: (r) => (r.link === 'active' ? 'on' : 'off'), options: [{ value: 'on', label: t('filter.link.on') }, { value: 'off', label: t('filter.link.off') }] },
      { id: 'apps', label: t('filter.apps'), value: (r) => (r.chatApps.length > 0 ? 'on' : 'off'), options: [{ value: 'on', label: t('filter.apps.on') }, { value: 'off', label: t('filter.apps.off') }] },
      // What the summary's "Need you" shows: a question waiting, a pause at its limit, or groups asking to be let in.
      { id: 'needs', label: t('filter.needs'), value: (r) => (needsYou(r) ? 'yes' : undefined), options: [{ value: 'yes', label: t('filter.needs.yes') }] },
    ],
    isLoading: loading,
    error: botsQ.error,
    pageSize: 20,
  });
  const rows = view.rows;

  // The summary above the list: how many Bots, how many are busy, how many need the person (Bots paused after a sign-in
  // change included), how many a chat app reaches. Each count's caption shows those Bots (a filter in the URL), or all again.
  const sum = listSummary(bots, computers.reduce((n, c) => n + c.suspended, 0));
  const showing = (id: string, value: string) => {
    const v = view.filterValue(id);
    return v?.kind === 'single' && v.value === value;
  };
  const shows = (id: string, value: string, name: string): ReactNode =>
    showing(id, value) ? (
      <TextButton onPress={() => view.setFilter(id, undefined)} aria-label={t('strip.showAllBots')}>
        {t('strip.showAll')}
      </TextButton>
    ) : (
      <TextButton onPress={() => view.setFilter(id, { kind: 'single', value })} aria-label={name}>
        {t('strip.show')}
      </TextButton>
    );
  const stats: Stat[] = [
    { label: t('strip.bots'), value: sum.bots, detail: t('strip.botsOn', { count: sum.computers }) },
    { label: t('strip.working'), value: sum.working, detail: sum.working > 0 ? shows('status', 'working', t('strip.showWorking')) : t('strip.workingNone') },
    {
      label: t('strip.needs'),
      value: sum.needs + sum.suspended,
      ...(sum.needs + sum.suspended > 0 ? { status: 'warn' as const } : {}),
      detail: sum.needs > 0 ? shows('needs', 'yes', t('strip.showNeeds')) : sum.suspended > 0 ? t('strip.suspended', { count: sum.suspended }) : t('strip.needsNone'),
    },
    { label: t('strip.inChat'), value: sum.inChat, detail: sum.inChat > 0 ? shows('apps', 'on', t('strip.showInChat')) : t('strip.inChatNone') },
  ];
  const summary = <StatStrip label={t('strip.label')} items={stats} />;
  // "more Bots than the list can show" is said only where it is true and useful: the computer has
  // rows, no search is narrowing them (a search finds only what was read), and the person has paged to the end of what was
  // read (before that, the pager still has rows to give).
  const moreSayable = view.q.trim() === '' && view.query.q.trim() === '' && view.page >= view.pages;
  const sayMore = (c: Computer): boolean => moreSayable && bots.some((b) => b.computerId === c.id);
  const notesNow = (c: Computer): boolean => hasNotes(c.hasMore && !sayMore(c) ? { ...c, hasMore: false } : c);
  // A computer with something to fix (Bots paused after a sign-in change, a read that failed) first, its note and its one
  // action at the top of the list; then the computer with a waiting Bot; a computer with only another note comes after
  // those with Bots. Each computer's own
  // notes (a failed read, paused Bots, more than listed, starting, another realm) are its group's first row, and paused
  // Bots also show as a count beside its name, which a collapsed group keeps.
  const groups: TableGroup[] = (() => {
    if (!grouped) return [];
    const ids = [...new Set([...rows.map((r) => r.computerId), ...computers.filter(notesNow).map((c) => c.id)])];
    const fix = (id: string) => computers.some((c) => c.id === id && (c.suspended > 0 || c.listState === 'failed'));
    const rank = (id: string) => (fix(id) ? -1 : Math.min(Number.MAX_SAFE_INTEGER, ...rows.filter((r) => r.computerId === id).map((r) => STATUS_RANK[r.status])));
    return ids
      .sort((a, b) => rank(a) - rank(b))
      .map((id) => {
        const c = computers.find((x) => x.id === id);
        const n = rows.filter((r) => r.computerId === id).length;
        return {
          id,
          label: c ? `${c.flag} ${c.name}` : id,
          // The count in words (countLabel): "2 Bots", and "No Bots" for a group that holds only its note.
          // Never a count that is not known or not true: a computer whose Bots could not be read says so, and one
          // whose only Bots are paused shows no count of them (its paused count says "1 paused").
          // Paused Bots are counted in the same quiet words, after it: "3 Bots · 1 paused", or "1 paused" alone.
          countLabel: [n > 0 ? t('list.count', { count: n }) : c?.listState === 'failed' ? t('group.countFailed') : c && c.suspended > 0 ? '' : t('group.countNone'), c && c.suspended > 0 ? t('group.paused', { count: c.suspended }) : ''].filter(Boolean).join(' · '),
          ...(c && notesNow(c) ? { note: <ComputerNotes computer={c} named={false} more={sayMore(c)} onRetry={() => refetch()} onResume={() => resumeOn(c.id)} resuming={resume.running} /> } : {}),
        };
      });
  })();


  // The press carries the paused count it saw: a later read counting none then proves the resume went through.
  const resumeOn = (computerId: string): void => {
    setResumedOn({ computerId, ctx: capture() });
    void resume.run({ action: 'resume', computerId, suspended: computers.find((c) => c.id === computerId)?.suspended });
  };
  const failed = computersQ.isError || botsQ.isError;
  const parsedSel = parseBotKey(selected);
  const refetch = () => {
    void computersQ.refetch();
    void botsQ.refetch();
  };

  const rowMenu = (r: BotRow): readonly RowActionEntry[] => {
    if (r.locked) return [];
    const url = urls.urlOf(r.key);
    const { openComputer, openLogs } = computerGoes(computerOf(r.computerId));
    // The one thing the Bot needs from the person, as the row's labelled button: answer it, write to it after its pause,
    // or see the groups asking to be let in. A Bot that needs nothing has none (the row itself opens it).
    const fix: RowActionEntry[] =
      r.status === 'waiting'
        ? [{ id: 'answer', label: t('row.answerName', { name: r.name }), short: t('row.answer'), inline: true, onAction: () => select(r.key) }]
        : r.status === 'paused'
          ? [{ id: 'write', label: t('row.writeName', { name: r.name }), short: t('row.write'), inline: true, onAction: () => select(r.key) }]
          : r.chatsWaiting > 0
            ? [{ id: 'groups', label: t('row.letInName', { name: r.name }), short: t('row.letIn'), inline: true, onAction: () => go(botLinks.tab(r.key, 'apps')) }]
            : [];
    return [
      ...fix,
      { id: 'open', label: t('action.open'), icon: 'chevron-right', onAction: () => select(r.key) },
      { id: 'settings', label: t('bot.settings'), icon: 'sliders', onAction: () => go(botLinks.settings(r.key)) },
      { id: 'copy', label: t('row.copyLink'), icon: 'copy', hover: true, isDisabled: url === null, ...(url ? { copy: url } : { disabledReason: t(urls.noAddress(r.key) ? 'row.noAddress' : 'row.addressUnread') }), onAction: () => undefined },
      ...(openComputer ? [{ id: 'computer', label: t('row.openComputer'), icon: 'computer' as const, onAction: openComputer }] : []),
      ...(openLogs ? [{ id: 'logs', label: t('row.logs'), icon: 'logs' as const, onAction: openLogs }] : []),
      ...(r.status === 'working' || r.status === 'waiting' ? [{ id: 'stop', label: t('bot.stopMenu'), icon: 'stop' as const, hover: true, onAction: () => go(botLinks.action(r.key, 'stop')) }] : []),
      // The conversation verbs (Restart, Clear, Delete the archive) are on the Bot's own ⋯, where their confirms
      // say what each does; the row keeps one destructive verb.
      '-',
      { id: 'delete', label: t('danger.delete'), icon: 'trash', tone: 'danger', onAction: () => go(botLinks.action(r.key, 'delete')) },
    ];
  };

  const notices = (
    <ComputerNotesStrip
      computers={grouped && bots.length > 0 && view.matched > 0 ? [] : computers}
      sayMore={sayMore}
      allComputers={computers}
      onRetry={refetch}
      rereadBots={computersQ.rereadBots}
      onResume={resumeOn}
      resuming={resume.running}
      resumed={{ outcome: resume.outcome, computerId: resumedOn && alive(resumedOn.ctx) ? resumedOn.computerId : null, held: () => resume.held(), onCheck: () => void resume.readBack(), onDismiss: (rows) => void resume.dismissShown(rows), onClose: () => resume.reset() }}
      starting={start.running}
      holds={start.holds}
      onCheckStart={() => start.readBack()}
      onDismissStart={(shown) => void start.dismiss(shown)}
    />
  );
  let tableDrawn = false;
  let list;
  if (loading) list = <Skeleton variant="table" rows={8} />;
  else if (failed) list = <ErrorState error={computersQ.error ?? botsQ.error} onRetry={refetch} />;
  else if (computers.length === 0)
    list = (
      <EmptyState
        icon="computer"
        title={t('list.noComputer.title')}
        body={t('list.noComputer.body')}
        action={
          computersLink ? (
            <Button onPress={() => (computersLink.kind === 'hub' ? go(computerLinks.list) : followPageLink(computersLink, go))}>{t('list.noComputer.action')}</Button>
          ) : undefined
        }
      />
    );
  else if (running.length === 0 && unknownFilter)
    list = (
      <EmptyState
        icon="computer"
        title={t('list.noMatchUnknown')}
        action={
          <Button variant="ghost" onPress={view.clearAll}>
            {t('list.stoppedComputer.all')}
          </Button>
        }
      />
    );
  else if (running.length === 0 && stoppedFilter)
    list = (
      <EmptyState
        icon="play"
        title={t('list.stoppedComputer.title', { name: stoppedFilter.name })}
        body={t('list.stoppedComputer.body', { name: stoppedFilter.name })}
        action={
          <Button busy={start.running} isDisabled={start.heldComputer(stoppedFilter.id)} onPress={() => void start.run({ computerId: stoppedFilter.id })}>
            {t('list.stoppedComputer.start')}
          </Button>
        }
        secondary={
          <Button variant="ghost" onPress={view.clearAll}>
            {t('list.stoppedComputer.all')}
          </Button>
        }
      />
    );
  else if (running.length === 0)
    list = (
      <EmptyState
        icon="play"
        title={t('list.noRunning.title')}
        body={t('list.noRunning.body')}
        action={
          <div className={p.stoppedList}>
            <DataTable
              bare
              fill={false}
              label={t('list.noRunning.title')}
              data={stopped.slice(0, 5)}
              getRowId={(c) => c.id}
              noViewMenu
              columns={[
                col2.accessor('name', { header: t('col.computer'), cell: (c) => `${c.row.original.flag} ${c.getValue()}` }),
                col2.display({
                  id: 'start',
                  // A visible header: never an empty header (axe empty-table-header).
                  header: t('list.startShort'),
                  // 136: Start as a small chip button (95.5 px, 105.5 on a coarse pointer) and the cell's padding;
                  // the name is in the next cell and in the button's name.
                  meta: { width: '136px' },
                  cell: (c) => (
                    <Button
                      size="sm"
                      busy={start.running}
                      isDisabled={start.heldComputer(c.row.original.id)}
                      onPress={() => void start.run({ computerId: c.row.original.id })}
                      aria-label={t('list.start', { name: c.row.original.name })}
                    >
                      {t('list.startShort')}
                    </Button>
                  ),
                }),
              ]}
            />
          </div>
        }
        secondary={stopped.length > 5 ? <PageLinkTo href={computerLinks.list} variant="nav" plain>{t('list.moreStopped', { count: stopped.length - 5 })}</PageLinkTo> : undefined}
      />
    );
  else {
    tableDrawn = true;
    list = (
      <DataTable
        storageKey="bots"
        toolbarNote={bots.length > 0 ? notices : undefined}
        label={t('title')}
        view={view}
        columns={columns}
        // Cards by default, each Bot with its mark, what it is doing and how to reach it; List is the dense table (the
        // choice is remembered on this device). Beside an open Bot the kit draws list rows either way.
        presentation={present === 'cards' ? 'cards' : 'auto'}
        presentChoice={{ value: present, onChange: setPresent }}
        countLabel={(n) => t('list.count', { count: n })}
        pagerNamed
        railTextWord
        onRefresh={refetch}
        onRowAction={(r) => !r.locked && select(r.key)}
        activeId={selected}
        groupBy={grouped ? (r) => r.computerId : undefined}
        groups={groups}
        actions={rowMenu}
        noMatch={stoppedFilterName ? t('list.noMatchStopped', { name: stoppedFilterName }) : unknownFilter ? t('list.noMatchUnknown') : undefined}
        empty={
          bots.length === 0 ? (
            <EmptyState
              icon="bot"
              title={t('empty.title')}
              body={
                <>
                  <span>
                    <ChatNames text={t('empty.body')} />
                  </span>{' '}
                  <FaqLink item={byId.whatIsBot}>{t('empty.more')}</FaqLink>
                </>
              }
              hint={<ChatNames text={t('empty.reach', CHAT_SLOTS)} />}
              action={
                <Button icon="plus" onPress={() => setDrawer('new')}>
                  {t('action.new')}
                </Button>
              }
              secondary={<GuideConnectLink />}
            />
          ) : undefined
        }
      />
    );
  }

  const subtitle = running.length === 0 && computers.length > 0 ? t('subtitle.noRunning') : t('subtitle');

  return (
    <>
      <ListDetailPage
        storageKey="bots"
        faq={{ items }}
        header={{
          title: t('title'),
          subtitle,
          actions: <AgentHint page="bots" facts={agentFacts} />,
          // The empty list's own New Bot is the one primary while it shows; an open Bot's pane has its own (a view has one primary action).
          primary: running.length === 0 || (tableDrawn && bots.length === 0) || parsedSel ? undefined : { label: t('action.new'), icon: 'plus', onPress: () => setDrawer('new') },
        }}
        toolbar={tableDrawn && bots.length > 0 ? (parsedSel ? undefined : summary) : notices}
        list={list}
        detail={parsedSel ? <BotPane row={bots.find((b) => b.key === selected)} botKey={selected as string} computers={computers} realms={realms} models={models} listLoaded={!loading} /> : null}
      />
      <NewBotDrawer
        open={drawer === 'new'}
        onClose={() => setDrawer(undefined)}
        computers={computers}
        realms={realms}
        bots={bots}
        models={models}
        offer={offerQ.data}
        initialComputer={initial}
        currentComputer={shownComputer}
        onOpenBot={(key, giveLink) => go(giveLink ? `${botLinks.tab(key, 'link')}&drawer=link` : botLinks.item(key))}
      />
      {/* A create held for a computer the list does not show: freed once that computer is proved gone. */}
      <GoneCreates listed={computersQ.data} />
    </>
  );
}

const col2 = createColumnHelper<Computer>();

/** The shown computer's Bots read, refused because its agent is signed out: the sign-in (the schedules way) that brings them back. */
function AgentOutNote({ computer: c, reread }: { computer: Computer; reread: (computerId: string) => Promise<boolean> }) {
  const comp = useMemo<SignInComp>(() => ({ id: c.id, name: c.name, agent: { writer: false, writerWhy: 'login', signIn: 'offer' } }), [c.id, c.name]);
  const state = useAgentSignIn(comp, null, () => reread(c.id));
  return <AgentSignIn comp={comp} state={state} place="own" />;
}

/** A computer has something to say about its Bots list: its read failed or serves another realm, it is starting, it has
 * more Bots than listed, or some of its Bots are paused. */
/** One notice of the strip in its own box (a rule under it). */
function NoticeBox({ children }: { children: ReactNode }) {
  return <div className={p.noticeBox}>{children}</div>;
}

const hasNotes = (c: Computer): boolean => c.listState !== 'ok' || c.suspended > 0 || c.hasMore || c.state === 'starting';

/** What reading one computer's Bots gave: one note each, with its one action, through the kit's shared GroupNotes
 * In the notices strip each names the computer; in the computer's own group (`named` false)
 * the header above already does, and each action's name says which computer it acts on. */
function ComputerNotes({ computer: c, named = true, more = true, onRetry, onResume, resuming }: { computer: Computer; named?: boolean; more?: boolean; onRetry: () => void; onResume: () => void; resuming: boolean }) {
  const t = useStrings(strings);
  const notes: GroupNote[] = [
    // A computer's list keeps only that its read failed, not why; Try again reads it again.
    ...(c.listState === 'failed' ? [{ id: 'failed', tone: 'warn' as const, text: t('notice.failedShort'), action: { label: t('action.tryAgain'), onPress: onRetry } }] : []),
    ...(c.listState === 'other_realm' ? [{ id: 'realm', text: t('notice.otherRealm') }] : []),
    ...(c.state === 'starting' ? [{ id: 'starting', text: t('notice.starting') }] : []),
    ...(c.hasMore && more ? [{ id: 'more', text: t('notice.more') }] : []),
    ...(c.suspended > 0 ? [{ id: 'paused', icon: 'pause' as const, text: t('notice.paused', { count: c.suspended }), action: { label: t('notice.resume'), onPress: onResume, busy: resuming, kind: 'button' as const } }] : []),
  ];
  return <GroupNotes name={c.name} named={named} notes={notes} />;
}

/** What the list's Resume last did, for the notices: its outcome, the computer it was pressed on, and what frees one that may have gone through. */
export interface ResumeShown {
  outcome: RunOutcome;
  computerId: string | null;
  /** The sends this mount holds as "may have gone through", read now (undefined: fixture mode, where the hook's own note is
   *  what Stop tracking clears). */
  held: () => ReadonlyArray<HeldSend> | undefined;
  /** Reads the Bots again; sends nothing. */
  onCheck: () => void;
  /** The warned Dismiss of exactly the sends its warning showed. */
  onDismiss: (rows: ReadonlyArray<HeldSend>) => void;
  /** Closes a refusal's note. */
  onClose: () => void;
}

/** The list's notices, one stack: a held start, the sign-in, then each computer's notes. In the table's `toolbarNote`, or above an empty state. */
export function ComputerNotesStrip({ computers, allComputers, holds, onRetry, rereadBots, onResume, resuming, resumed, starting, onCheckStart, onDismissStart, sayMore = () => true }: { computers: readonly Computer[]; allComputers: readonly Computer[]; holds: readonly StartHold[]; onRetry: () => void; sayMore?: (c: Computer) => boolean; rereadBots?: (computerId: string) => Promise<boolean>; onResume: (computerId: string) => void; resuming: boolean; resumed?: ResumeShown; starting: boolean; onCheckStart: () => void; onDismissStart: (shown: { computerId: string; hold: string }) => void }) {
  const t = useStrings(strings);
  const { target } = useCore();
  const [dismissing, setDismissing] = useState<{ computerId: string; hold: string } | null>(null);
  // C9: a Resume that may have gone through shows here with Check again (a read) and the warned Dismiss; a refused one says so.
  const resumeKind = resumed && (resumed.outcome === 'pending' || resumed.outcome === 'failed' || resumed.outcome === 'not_sent' || resumed.outcome === 'stale') ? resumed.outcome : null;
  const resumeRows = resumed && resumeKind === 'pending' ? resumed.held() : [];
  const resumeHeld = resumeRows ?? [];
  // Stop tracking frees only what this mount holds (fixture mode: its own note). A hold another mount or tab sent shows
  // with Check again only: its own page frees it.
  const resumeFreeable = resumeRows === undefined || resumeRows.length > 0;
  const heldOn = resumeHeld.length === 1 ? (resumeHeld[0]?.identity as { computerId?: unknown } | undefined)?.computerId : undefined;
  // Pending names only the computer of the one send this mount holds (fixture mode: the press's): a hold another mount or
  // tab sent may be another computer's.
  const resumeAt = resumeKind === 'pending' && resumeRows !== undefined ? (typeof heldOn === 'string' ? heldOn : null) : (resumed?.computerId ?? null);
  // The sends the warning showed when it armed: its confirm frees those, never one held after.
  const [resumeDismissing, setResumeDismissing] = useState<{ name: string | null; rows: ReadonlyArray<HeldSend> } | null>(null);
  // A sign-in acts only on the computer the Hub shows, so its box sits here whether or not that computer has a group row (which keeps the failed line).
  const signedOut = rereadBots ? allComputers.find((c) => c.agentOut === true && c.id === target?.container?.id) : undefined;
  // A computer's "more Bots" note counts only where the page says it now (sayMore).
  const rows = computers.filter((c) => hasNotes(c.hasMore && !sayMore(c) ? { ...c, hasMore: false } : c));
  if (rows.length === 0 && !starting && holds.length === 0 && !signedOut && resumeKind === null && resumeDismissing === null) return null;
  const nameOf = (id: string): string | null => allComputers.find((c) => c.id === id)?.name ?? null;
  const resumeName = resumeAt ? nameOf(resumeAt) : null;
  const dismissName = dismissing ? nameOf(dismissing.computerId) : null;
  return (
    <>
      {holds.map((h) => {
        const name = nameOf(h.computerId);
        const token = h.hold;
        return (
          <NoticeBox key={h.computerId}>
            <OutcomeBanner kind="pending" title={name ? t(h.op === 'start' ? 'start.heldTitle' : 'start.heldTitleOther', { name }) : undefined} onCheck={h.ours ? onCheckStart : undefined} onDismiss={h.ours && token !== null ? () => setDismissing({ computerId: h.computerId, hold: token }) : undefined} dismissWarned />
            {!h.ours && (
              <span className={p.note}>
                {t('start.elsewhere')} <HeldFromLink page={h.from?.page || 'computers'}>{t('start.elsewhereLink')}</HeldFromLink>
              </span>
            )}
          </NoticeBox>
        );
      })}
      {resumed && resumeKind === 'pending' && (
        <NoticeBox>
          <OutcomeBanner kind="pending" /* noDetails: an unknown outcome has no rejection to show */ title={resumeName ? t('notice.resumeHeld', { name: resumeName }) : t('notice.resumeHeldAny')} onCheck={resumed.onCheck} /* Stop tracking only when this mount holds sends it can free: another sender's hold is freed by its own page */ {...(resumeFreeable ? { onDismiss: () => setResumeDismissing({ name: resumeName, rows: resumed.held() ?? [] }), dismissWarned: true } : {})} />
        </NoticeBox>
      )}
      {resumed && resumeKind !== null && resumeKind !== 'pending' && (
        <NoticeBox>
          <OutcomeBanner kind={resumeKind} /* noDetails: the hook keeps the refusal's kind, not the rejection */ onDismiss={resumed.onClose} />
        </NoticeBox>
      )}
      <ConfirmDialog
        overlayId="bots-view-resume-dismiss"
        isOpen={resumeDismissing !== null}
        onOpenChange={(o) => !o && setResumeDismissing(null)}
        title={resumeDismissing?.name ? t('start.dismissTitleNamed', { name: resumeDismissing.name }) : t('start.dismissTitle')}
        body={t('start.dismissBody')}
        confirmLabel={t('start.dismissGo')}
        tone="danger"
        onConfirm={() => {
          if (resumeDismissing && resumed) resumed.onDismiss(resumeDismissing.rows);
          setResumeDismissing(null);
        }}
      />
      <ConfirmDialog
        overlayId="bots-view-start-dismiss"
        isOpen={dismissing !== null}
        onOpenChange={(o) => !o && setDismissing(null)}
        title={dismissName ? t('start.dismissTitleNamed', { name: dismissName }) : t('start.dismissTitle')}
        body={t('start.dismissBody')}
        confirmLabel={t('start.dismissGo')}
        tone="danger"
        onConfirm={() => {
          if (dismissing) onDismissStart(dismissing);
          setDismissing(null);
        }}
      />
      {signedOut && rereadBots ? <NoticeBox><AgentOutNote key={signedOut.id} computer={signedOut} reread={rereadBots} /></NoticeBox> : null}
      {rows.map((c) => (
        <ComputerNotes key={c.id} computer={c} more={sayMore(c)} onRetry={onRetry} onResume={() => onResume(c.id)} resuming={resuming} />
      ))}
    </>
  );
}
