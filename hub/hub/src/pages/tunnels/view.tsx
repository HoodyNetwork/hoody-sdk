// The Tunnels page: what is connected to the selected computer right now, read from its tunnel
// program. A list/detail page in side mode: the table lists every shared address grouped by session, a row opens an
// inspector beside it. States come before the table: no computer, computer stopped, overview not read, program
// not installed, program stopped (nothing read from it), read failed, not allowed. Status text never sits in a
// control row: a failed refresh's "as of" line is the table's note under the toolbar.
import { maskAddress, portAddress, useAgentScopeFacts, useCan } from '@core';
import {
  Band,
  Button,
  AgentHint,
  ComputerRequired,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  FaqLink,
  LOCALE,
  ListDetailPage,
  NoAccessState,
  PageFrame,
  PageHeader,
  Skeleton,
  Stack,
  StatusPill,
  TextButton,
  createColumnHelper,
  followPageLink,
  useDataView,
  useDrawerParam,
  useGo,
  usePageLink,
  useStrings,
  type PageLink,
  type RowActionEntry,
  type TableGroup,
} from '@kit';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { portViewPath } from '../board/links';
import { links as computersLinks } from '../computers/links';
import { links as keysLinks } from '../keys/links';
import { links as logsLinks } from '../logs/links';
import { firstSeen, useComputer, useTunnels } from './data';
import { useDisconnect, type SessionDisconnect } from './disconnect';
import { RECONNECTING, failOf, hostPort, joinRows, maskIp, portOf, shortSession, type DisconnectState, type Joined, type TunnelRow } from './logic';
import { pageFaq } from './faq';
import { Detail } from './parts/Detail';
import { Setup } from './parts/Setup';
import { placeKey } from './setup';
import s from './parts/Tunnels.module.css';
import strings from './strings.en.json';

const col = createColumnHelper<TunnelRow>();
/** A place on another page: inside this Hub its exact place, else the page itself. */
const follow = (link: PageLink, path: string, go: (to: string) => void) => (link.kind === 'hub' ? go(path) : followPageLink(link, go));
const clockFmt = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });
export const clock = (ms: number): string => clockFmt.format(new Date(ms));
/** The list pane width under which a session row names the session only (its full label would wrap in the kit's
 *  one-line group row): a phone, or a desktop narrowed by the sidebar, the inspector or the Ask dock. */
export const GROUP_LABEL_MIN = 640;

export default function TunnelsPage() {
  const t = useStrings(strings);
  const { items, byId } = pageFaq(t);
  const go = useGo();
  const computer = useComputer();
  const agentFacts = useAgentScopeFacts();
  const c = computer.data;
  const target = computer.target;
  const on = !!c && c.running;
  const r = useTunnels(on, c?.id ?? '');
  // The connection address is for account sessions only; a shared-access session never sees it.
  const showPeer = useCan('account');
  // The kit's session row is one fixed line: where the list pane is narrow it names the session only (its address and
  // streams are in the inspector). Measured on the pane itself (a probe in the list), never the viewport.
  const [narrow, setNarrow] = useState(false);
  const paneObserver = useRef<ResizeObserver | null>(null);
  const probe = useCallback((el: HTMLDivElement | null) => {
    paneObserver.current?.disconnect();
    paneObserver.current = null;
    const pane = el?.parentElement;
    if (!pane || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setNarrow(e.contentRect.width < GROUP_LABEL_MIN);
    });
    ro.observe(pane);
    paneObserver.current = ro;
  }, []);
  const computersLink = usePageLink('computers');
  const boardLink = usePageLink('board');
  const logsLink = usePageLink('logs');
  const keysLink = usePageLink('keys');
  const [setupParam, openSetup, closeSetup] = useDrawerParam('setup');
  const setupOpen = setupParam !== undefined;

  const running = on && r.overview.data === 'running';
  const cid = c?.id ?? '';
  // The last complete read (all three answered and parsed), never a mix of a newer read with older ones.
  const snap = r.snap;
  // Disconnect: each session's state on this computer, and what the confirm asks about: the session, on the
  // computer it was asked on (another computer shown closes it), and for Disconnect again the hold it frees.
  const disc = useDisconnect({ computer: cid, target, snap: running ? snap : null, refresh: r.refresh });
  const [ask, setAsk] = useState<{ computer: string; id: string; hold?: string } | null>(null);
  useEffect(() => {
    setAsk((a) => (a && a.computer !== cid ? null : a));
  }, [cid]);
  const asked = ask && ask.computer === cid ? ask : null;
  const joined: Joined | undefined = useMemo(() => (running && snap ? joinRows(snap.tunnels, snap.sessions, snap.bindings.list) : undefined), [running, snap]);
  const readError = r.tunnels.error ?? r.sessions.error ?? r.bindings.error ?? null;
  const fail = readError ? failOf(readError) : null;
  const handle = c?.handle ?? '';
  // Places that appear after the Setup panel opened are marked New, until the computer changes. The baseline is
  // what was shown when it opened, or nothing when the program was stopped (nothing connected); a place keeps its key
  // (session + bind id) while it reconnects, so a drop or a resume never reads as new.
  const [before, setBefore] = useState<{ cid: string; ids: ReadonlySet<string> } | null>(null);
  const programStopped = r.overview.data === 'stopped';
  useEffect(() => {
    if (!setupOpen || before?.cid === cid) return;
    if (joined) setBefore({ cid, ids: new Set(joined.rows.map(placeKey)) });
    else if (programStopped) setBefore({ cid, ids: new Set() });
  }, [setupOpen, joined, programStopped, before, cid]);
  const marks = before?.cid === cid ? before.ids : null;

  // A session's disconnect state as a pill (the group row, a reconnecting row, the inspector's header); none when idle.
  const discPill = (state: DisconnectState, notSent?: boolean): ReactNode =>
    state === 'sending' || state === 'closing' ? (
      <StatusPill tone="warn" dot>{t('disc.closing')}</StatusPill>
    ) : state === 'still' ? (
      <StatusPill tone="warn">{t('disc.still')}</StatusPill>
    ) : state === 'pending' ? (
      <StatusPill tone="neutral">{t('disc.pending')}</StatusPill>
    ) : state === 'already' ? (
      <StatusPill tone="neutral">{t('disc.already')}</StatusPill>
    ) : state === 'failed' && notSent ? (
      <StatusPill tone="warn">{t('disc.notSent')}</StatusPill>
    ) : state === 'failed' ? (
      <StatusPill tone="danger">{t('disc.failed')}</StatusPill>
    ) : null;
  const pillOf = (d: SessionDisconnect): ReactNode => discPill(d.state, d.notSent);

  // The disconnect state of each session with a reconnecting row (its pill shows in the row: such a session has no group
  // row). The columns follow the states by their text, not by a fresh object each render.
  const heldStates: Record<string, { state: DisconnectState; notSent: boolean }> = {};
  for (const row of joined?.rows ?? []) {
    if (!row.reconnecting || !row.sessionId) continue;
    const d = disc.of(row.sessionId);
    heldStates[row.sessionId] = { state: d.state, notSent: !!d.notSent };
  }
  const heldSig = JSON.stringify(heldStates);

  const addressOf = (row: TunnelRow): string =>
    row.kind === 'expose' && row.port !== null && target ? portAddress(target.project, target.container, row.port) : row.kind === 'pull' && row.port !== null && row.addr ? hostPort(row.addr, row.port) : '';

  const columns = useMemo(
    () => [
      col.accessor((row) => t(`kind.${row.kind}`), {
        id: 'what',
        header: t('col.what'),
        // Wide enough for its longest label with its mark beside it ("Inside this computer" + New), so a mark never
        // drops to a line of its own.
        meta: { pinned: true, grow: 1, minWidth: 232 },
        cell: (x) => {
          const row = x.row.original;
          return (
            <span className={s.what}>
              {t(`kind.${row.kind}`)}
              {row.reconnecting && <span className={s.faint}>{t('seen', { time: clock(firstSeen(cid, row.id)) })}</span>}
              {marks && !marks.has(placeKey(row)) && <StatusPill tone="accent">{t('new')}</StatusPill>}
              {row.reconnecting && row.sessionId && discPill(heldStates[row.sessionId]?.state ?? 'idle', heldStates[row.sessionId]?.notSent)}
            </span>
          );
        },
      }),
      col.accessor((row) => addressOf(row), {
        id: 'address',
        header: t('col.address'),
        // The address is what a person reads and copies; Shared as is a short label: the address takes the larger share.
        meta: { priority: 1, minWidth: 240, grow: 2 },
        cell: (x) => {
          const v = x.getValue();
          return v ? <bdi dir="ltr" className={s.mono}>{maskAddress(v)}</bdi> : <span className={s.faint}>—</span>;
        },
      }),
      col.accessor((row) => portOf(row), {
        id: 'port',
        header: t('col.port'),
        meta: { align: 'end', width: '96px', priority: 2 },
        // Ascending first, as the list opens sorted by port: the first press on Port turns it, not off (a number column
        // otherwise starts descending, so a press from the default ascending order would clear the sort).
        sortDescFirst: false,
        cell: (x) => (x.row.original.port === null ? <span className={s.faint}>—</span> : <span className={s.mono}>{x.row.original.port}</span>),
      }),
    ],
    // addressOf reads the computer; cid and target change with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, cid, target, marks, heldSig],
  );

  const view = useDataView<TunnelRow>({
    rows: joined?.rows,
    columns,
    getRowId: (row) => row.id,
    search: (row) => [addressOf(row), row.port, t(`kind.${row.kind}`)],
    filters: [
      { id: 'kind', label: t('filter.kind'), value: (row) => row.kind, options: (['expose', 'pull'] as const).map((k) => ({ value: k, label: t(`kind.${k}`) })) },
    ],
    sort: 'port',
    pageSize: 50,
    isLoading: running && !joined && !readError,
  });

  // ── States before the list ──────────────────────────────────────────────────────────

  // Disconnects that may have gone through: every state names all of them, with or without their rows (a row may be
  // searched, filtered or paged out). Check again, and Disconnect again once offered, only where the program can be
  // read (the computer runs); the session row itself carries only its state.
  const heldBands = (ids: readonly string[], canCheck: boolean): ReactNode[] =>
    ids.map((id) => {
      const d = disc.of(id);
      const hold = d.again;
      return (
        <Band
          key={id}
          tone="neutral"
          size="table"
          actions={
            canCheck ? (
              <>
                <TextButton onPress={() => void disc.check(id)} isDisabled={d.checking}>
                  {t('disc.check')}
                </TextButton>
                {!!hold && <TextButton onPress={() => setAsk({ computer: cid, id, hold })}>{t('disc.again')}</TextButton>}
              </>
            ) : undefined
          }
        >
          {t('disc.pending.other', { id: shortSession(id) })}
        </Band>
      );
    });

  const baseHeader = { title: t('title') };
  if (!c) {
    return <ComputerRequired state="none" header={{ ...baseHeader, ...(computer.read ? {} : { subtitle: t('subtitle.none') }) }} title={t('st.title.noComputer')} body={t('st.pick')} />;
  }
  if (!c.running) {
    const stoppedNotes = heldBands(disc.held, false);
    if (!stoppedNotes.length) return <ComputerRequired state="stopped" name={c.name} header={baseHeader} body={t('st.computerStopped', { name: c.name })} />;
    // Held disconnects stand above the stopped state, full width, as on every other state (never inside its text).
    return (
      <PageFrame>
        <PageHeader {...baseHeader} />
        <div className={s.state}>
          <Stack gap={5}>
            <Stack gap={3}>{stoppedNotes}</Stack>
            <EmptyState
              icon="computer"
              title={t('st.title.computerStopped', { name: c.name })}
              body={t('st.computerStopped', { name: c.name })}
              action={computersLink ? <Button onPress={() => followPageLink(computersLink, go)}>{t('st.openComputers')}</Button> : undefined}
            />
          </Stack>
        </div>
      </PageFrame>
    );
  }

  const accessPath = handle ? computersLinks.ports(handle) : computersLinks.list;
  const openAccess = computersLink ? () => follow(computersLink, accessPath, go) : undefined;
  const links = {
    board: boardLink && handle ? (port: number) => follow(boardLink, portViewPath({ handle, protocol: 'http', port }), go) : undefined,
    visits: logsLink && handle ? () => follow(logsLink, logsLinks.computer(handle), go) : undefined,
    alias: computersLink && handle ? (port: number) => follow(computersLink, computersLinks.alias(handle, port), go) : undefined,
    access: openAccess,
    keys: keysLink ? () => follow(keysLink, keysLinks.list, go) : undefined,
  };
  // The Setup panel: once the overview first answered, everywhere but a computer it says has no tunnel program. A failed
  // overview read keeps it (and what was typed in it): the last answer stays, and an unreadable one is not "no program".
  const canSetup = !r.overview.isPending && r.overview.data !== 'none';
  // A refused read of the computer's programs is a refused read of the computer too: the password box starts ticked.
  const overviewForbidden = r.overview.isError && failOf(r.overview.error) === 'forbidden';
  // The one-line intro is the subtitle in every state of a running computer; the list adds its summary.
  // A computer the shell has no row for yet has no name to say: the sentences say "this computer".
  const shownName = c.name || t('computer.this');
  const intro = t('subtitle.on', { name: shownName });
  const started = r.health.data ?? null;
  const withSessions = joined
    ? `${intro} ${[t(snap?.tunnels.full === false ? 'summary.more' : 'summary', { count: joined.groups.length, name: shownName }), started ? t('summary.since', { time: clock(started) }) : ''].filter(Boolean).join(' · ')}`
    : intro;
  const header = {
    ...baseHeader,
    actions: <AgentHint page="tunnels" facts={agentFacts} />,
    ...(canSetup ? { primary: { label: t('setup.open'), icon: 'plus' as const, onPress: () => openSetup('new') } } : {}),
  };
  // What the confirm says the session shares (from the rows shown; a reconnecting listener of it counts too).
  const placesOf = (id: string): string => {
    const places = [...new Set((joined?.rows ?? []).filter((x) => x.sessionId === id && x.port !== null).map((x) => (x.kind === 'expose' ? t('disc.place.expose', { port: x.port as number }) : x.kind === 'pull' ? t('disc.place.pull', { port: x.port as number }) : ''))
        .filter(Boolean))];
    return places.length ? t('disc.body', { places: places.join(', ') }) : t('disc.bodyIdle');
  };
  const withSetup = (node: ReactNode) => (
    <>
      {node}
      {setupOpen && canSetup && <Setup isOpen onClose={closeSetup} computerId={cid} computerName={shownName} target={target} loginLikely={fail === 'forbidden' || overviewForbidden} access={links.access} keys={links.keys} />}
      {asked && (
        <ConfirmDialog overlayId="tunnels-disconnect"
          isOpen
          onOpenChange={(open) => !open && disc.of(asked.id).state !== 'sending' && setAsk(null)}
          title={asked.hold ? t('disc.again.title') : t('disc.title')}
          body={asked.hold ? t('disc.again.body') : placesOf(asked.id)}
          tone="danger"
          confirmLabel={asked.hold ? t('disc.again') : t('disc.action')}
          busy={disc.of(asked.id).state === 'sending'}
          onConfirm={() => {
            const a = asked;
            // One press, one request: the dialog closes on any answer; the session shows what happened. A press while that
            // request is out (a held Enter repeats before the dialog draws busy) sends nothing and keeps the dialog open
            // for its answer.
            if (disc.of(a.id).state === 'sending') return;
            const sent = a.hold ? disc.again(a.id, a.hold, a.computer) : disc.disconnect(a.id, a.computer);
            void sent.then(() => setAsk((x) => (x === a ? null : x)));
          }}
        />
      )}
    </>
  );
  // Every state of a running computer is the one list/detail page, so the questions sit under each of them, empty ones
  // too (one FAQ root a page): a state is the list pane's content, with no detail. `withSummary`: the line adds the
  // sessions summary (the list and the idle state); every other state shows the intro alone. With the summary the line is
  // the header's context row: the subtitle is a two-line clamp, which cut the summary off on a phone and up to 900 px.
  // `ownPrimary`: the list area shows its own primary (the empty state's), so the header draws none: one primary a screen.
  const page = (list: ReactNode, withSummary = false, detail: ReactNode = null, ownPrimary = false) =>
    withSetup(<ListDetailPage mode="side" storageKey="tunnels" faq={{ items }} header={{ ...(ownPrimary ? { ...baseHeader, actions: header.actions } : header), ...(withSummary ? { context: withSessions } : { subtitle: intro }) }} list={list} detail={detail} />);
  // An empty state's way to the first question (what a tunnel is for).
  const howLink = <FaqLink item={byId.what}>{t('setup.intro.more')}</FaqLink>;
  // A state without the list shows no session row: every held disconnect is named above it.
  const frameNotes = heldBands(disc.held, true);
  const frame = (body: ReactNode) =>
    page(
      <div className={s.state}>
        {frameNotes.length ? (
          <Stack gap={5}>
            <Stack gap={3}>{frameNotes}</Stack>
            {body}
          </Stack>
        ) : (
          body
        )}
      </div>,
    );

  if (r.overview.isPending) return frame(<Skeleton variant="table" rows={4} />);
  if (r.overview.isError && failOf(r.overview.error) === 'forbidden') {
    return frame(<NoAccessState title={t('st.title.forbidden')} body={t('st.forbiddenDaemon')} action={openAccess ? <Button onPress={openAccess}>{t('st.openAccess')}</Button> : undefined} />);
  }
  if (r.overview.isError) return frame(<ErrorState title={t('st.title.daemon')} body={t('st.daemon')} error={r.overview.error} onRetry={() => void r.refresh()} />);
  if (r.overview.data === 'none') {
    // No Connect here (Setup needs the program): what it needs, the way to the computer's programs, and the question.
    const openPrograms = computersLink && handle ? () => follow(computersLink, computersLinks.programs(handle), go) : undefined;
    const noneBody = [t('st.none'), t('st.none.alt', { name: c.name })].join(' ');
    return frame(
      <EmptyState
        icon="hoody-services"
        title={t('st.title.none')}
        body={noneBody}
        action={openPrograms ? <Button onPress={openPrograms}>{t('st.openPrograms')}</Button> : undefined}
        secondary={howLink}
      />,
    );
  }
  // The daemon could not read the program's state: neither running nor stopped, so nothing is read from it.
  if (r.overview.data === 'unknown') {
    return frame(
      <EmptyState icon="warn" title={t('st.title.daemon')} body={t('st.unknown')} action={<Button icon="reload" onPress={() => void r.refresh()}>{t('st.retry')}</Button>} />,
    );
  }
  if (r.overview.data === 'stopped') return frame(<EmptyState icon="hoody-services" title={t('st.title.stopped')} body={t('st.stopped')} secondary={howLink} />);

  // Running. Nothing kept and the read failed: the failure, never "nothing connected".
  if (!joined && fail === 'forbidden') {
    return frame(<NoAccessState title={t('st.title.forbidden')} body={t('st.forbidden')} action={openAccess ? <Button onPress={openAccess}>{t('st.openAccess')}</Button> : undefined} />);
  }
  if (!joined && fail === 'failed') {
    return frame(
      <ErrorState title={t('st.title.failed')} body={t('st.failed')} error={readError} onRetry={() => void r.refresh()} />,
    );
  }

  const stale = joined && snap && readError ? snap.at : null;
  const staleText = stale !== null ? t(fail === 'forbidden' ? 'st.staleForbidden' : 'st.stale', { time: clock(stale) }) : null;

  // The session row: its disconnect state only (the kit's group row is one fixed line, for status chips). What to do
  // about it is in each of its rows' ⋯ menu, the inspector, and the held and failed notes above the list.
  const groupExtra = (id: string): ReactNode => {
    const pill = pillOf(disc.of(id));
    return pill ? <span className={s.groupExtra}>{pill}</span> : undefined;
  };
  const streamsText = (g: Joined['groups'][number]) =>
    g.maxStreams !== null ? t('streams.of', { count: g.session.streams, max: g.maxStreams }) : t('streams', { count: g.session.streams });
  const groups: TableGroup[] = [
    ...(joined?.groups ?? []).map((g) => ({
      id: g.id,
      label: narrow
        ? t('group.sessionShort', { id: shortSession(g.id) })
        : showPeer && g.session.peer
          ? t('group.session', { id: shortSession(g.id), from: maskIp(g.session.peer), streams: streamsText(g) })
          : t('group.sessionHidden', { id: shortSession(g.id), streams: streamsText(g) }),
      extra: groupExtra(g.id),
    })),
    { id: RECONNECTING, label: t('group.reconnecting') },
  ];

  // A row's session: Check again (may have gone through, or still listed), Disconnect again (once offered), Disconnect.
  const sessionActions = (id: string): RowActionEntry[] => {
    const d = disc.of(id);
    const hold = d.again;
    const out: RowActionEntry[] = [];
    if (d.state === 'pending' || d.state === 'still') out.push({ id: 'check', label: t('disc.check'), icon: 'reload', isDisabled: d.checking, onAction: () => void disc.check(id) });
    if (hold) out.push({ id: 'again', label: t('disc.again'), icon: 'x', tone: 'danger', opens: true, onAction: () => setAsk({ computer: cid, id, hold }) });
    if (d.canSend) out.push({ id: 'disconnect', label: t('disc.menu'), icon: 'x', tone: 'danger', opens: true, onAction: () => setAsk({ computer: cid, id }) });
    return out.length ? ['-', ...out] : [];
  };
  const actions = (row: TunnelRow): readonly RowActionEntry[] => {
    const addr = addressOf(row);
    return [
      { id: 'open', label: t('action.open'), icon: 'arrow-right', onAction: () => view.open(row.id) },
      ...(addr ? [{ id: 'copy', label: t('action.copy'), icon: 'copy' as const, copy: addr, onAction: () => undefined }] : []),
      ...(row.kind === 'expose' && row.port !== null && links.board ? ['-' as const, { id: 'board', label: t('action.board'), icon: 'board' as const, onAction: () => links.board?.(row.port as number) }] : []),
      ...(row.sessionId ? sessionActions(row.sessionId) : []),
    ];
  };

  // A press that failed or was not sent: the session named with its details, here as well as in its inspector.
  const failNotes = disc.failed.map((id) => {
    const d = disc.of(id);
    return d.notSent ? (
      <Band key={`f-${id}`} tone="warn" size="table" error={d.error}>
        {t('disc.notSent.other', { id: shortSession(id) })}
      </Band>
    ) : (
      <Band key={`f-${id}`} tone="danger" size="table" error={d.error}>
        {t('disc.failed.other', { id: shortSession(id) })}
      </Band>
    );
  });
  const heldNotes = heldBands(disc.held, true);
  const mainNote =
    stale !== null ? (
      <Band tone="warn" size="table" error={readError} actions={<TextButton onPress={() => void r.refresh()}>{t('st.retry')}</TextButton>}>
        {staleText}
      </Band>
    ) : joined && joined.orphanNote > 0 ? (
      <Band tone="neutral" size="table">
        {t('orphans', { count: joined.orphanNote })}
      </Band>
    ) : undefined;
  const note =
    heldNotes.length || failNotes.length ? (
      <Stack gap={3}>
        {mainNote}
        {heldNotes}
        {failNotes}
      </Stack>
    ) : (
      mainNote
    );

  // Nothing connected: the page says so (the kit's empty state would drop the note with the toolbar).
  if (joined && joined.rows.length === 0) {
    return page(
      <div className={s.state}>
        <Stack gap={5}>
          {note}
          <EmptyState
            place="frame"
            icon="hoody-services"
            title={t('st.title.idle')}
            body={t('st.idle')}
            // The act the empty page waits for is its one primary (the header drops its own); Refresh stays beside it, quiet.
            action={
              <>
                {canSetup && <Button variant="primary" icon="plus" onPress={() => openSetup('new')}>{t('setup.open')}</Button>}
                <Button icon="reload" onPress={() => void r.refresh()}>{t('refresh')}</Button>
              </>
            }
            secondary={howLink}
          />
        </Stack>
      </div>,
      true,
      null,
      canSetup,
    );
  }

  const current = joined?.rows.find((x) => x.id === view.activeId);
  const group = current ? joined?.groups.find((g) => g.id === current.sessionId) : undefined;

  return page(
        <>
          <div ref={probe} className={s.probe} aria-hidden="true" />
          <DataTable
            className={stale !== null ? s.stale : undefined}
            label={t('title')}
            columns={columns}
            view={view}
            search={t('search')}
            noMatch={t('noMatch')}
            countLabel={(n) => t('count', { count: n })}
            onRetry={() => void r.refresh()}
            onRefresh={() => void r.refresh()}
            onRowAction={(row) => view.open(row.id)}
            actions={actions}
            toolbarNote={note}
            storageKey="tunnels"
            noViewMenu
            groupBy={(row) => row.group}
            groups={groups}
          />
        </>,
    true,
    view.activeId === undefined ? null : current ? (
          <Detail
            key={current.id}
            row={current}
            {...(group ? { group } : {})}
            address={addressOf(current)}
            seen={current.reconnecting ? firstSeen(cid, current.id) : null}
            showPeer={showPeer}
            links={links}
            resetKey={cid}
            clock={clock}
            stale={staleText !== null ? { text: staleText, error: readError, time: clock(stale ?? 0) } : null}
            onRetry={() => void r.refresh()}
            {...(current.sessionId
              ? {
                  disconnect: {
                    ...disc.of(current.sessionId),
                    onDisconnect: () => current.sessionId && setAsk({ computer: cid, id: current.sessionId }),
                    onAgain: (hold: string) => current.sessionId && setAsk({ computer: cid, id: current.sessionId, hold }),
                    onCheck: () => current.sessionId && void disc.check(current.sessionId),
                  },
                }
              : {})}
          />
        ) : joined ? (
          // A bare state has no inspector header, so no close: it offers the way back itself.
          <EmptyState icon="warn" title={t('detail.notFound')} size="sm" action={<Button onPress={() => view.open(undefined)}>{t('detail.back')}</Button>} />
        ) : null,
  );
}
