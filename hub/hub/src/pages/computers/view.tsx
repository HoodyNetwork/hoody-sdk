// The computers page: a list/detail layout. The list is a DataTable; the selection (a short
// handle, never the full id) and the tab live in the URL, so Back and deep links work. The Servers
// view is the second half of the page.
import { AgentHint, Button, EmptyState, ErrorState, ListDetailPage, OutcomeBanner, TablePage, useGo, useSearchParam, usePageShortcuts, useStrings, useSubPath, ConfirmDialog, type PageHeaderProps, type ToolbarAction, useContainerNarrow, openOutside } from '@kit';
import { chooseComputer, hostEnv, useAgentScopeFacts, useCan } from '@core';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAllUsage, useCaps, useComputers, useCurrentComputerId, useProjects, useProjectsById, useRealms, useServers, useShownRealm, useSubscriptions } from './data';
import { allowedOps, allows, findByHandle, handleOf, missingProjectIds, projectsInView, serverKey, serverLabel } from './logic';
import { useOut } from './parts/useOut';
import strings from './strings.en.json';
import type { Computer, Project } from './types';
import { programUrl } from './urls';
import { ComputersList } from './parts/ComputersList';
import { CreateDrawer } from './parts/CreateDrawer';
import { ColourDialog, DeleteComputer, MakeCurrentConfirm, RenameDialog, StopConfirm } from './parts/Dialogs';
import { DetailView } from './parts/DetailView';
import type { PortsOverlay } from './parts/Ports';
import { useProgramOps } from './parts/programOps';
import { AliasDrawer, CopyDrawer, ImportDrawer, RealmsDrawer, RemoveAlias, SshDrawer } from './parts/Drawers';
import { AliasEditDrawer } from './parts/AliasEdit';
import { DomainDrawer } from './parts/DomainDrawer';
import { serverOf } from './parts/upgrade';
import type { ComputerAction } from './parts/menu';
import { useLifecycleOps } from './parts/ops';
import { ProjectDrawer } from './parts/ProjectDrawers';
import { ProjectsView } from './parts/ProjectsView';
import { ServersView } from './parts/ServersView';
import { StatStrip } from './parts/StatStrip';
import { useViewSwitch } from './parts/ViewSwitch';
import { ZeroState } from './parts/ZeroState';
import s from './parts/parts.module.css';
import { pageFaq } from './faq';

// 'create' and 'newProject' may carry the computer Get a computer is copying, so New project returns to that copy.
type Overlay = { kind: 'create' | 'newProject' | 'import'; from?: Computer } | { kind: PortsOverlay | 'removeAlias' | 'copyNewProject'; c: Computer; port?: number; alias?: string; add?: string; expired?: boolean } | { kind: 'stop' | 'restart' | 'makeCurrent'; c: Computer } | null;

export default function ComputersPage() {
  const t = useStrings(strings);
  const { items } = pageFaq(t);
  const go = useGo();
  const out = useOut();
  const sub = useSubPath('/computers');
  const view = sub[0] === 'servers' || sub[0] === 'projects' ? sub[0] : 'computers';
  const computers = useComputers();
  const projects = useProjects();
  const realms = { data: useRealms() };
  const servers = useServers();
  const narrow = useContainerNarrow(600);
  const subs = useSubscriptions();
  const caps = useCaps();
  const currentId = useCurrentComputerId();
  const [sel, select] = useSearchParam('sel');
  const [wantNew, setWantNew] = useSearchParam('new');
  const [wantGet, setWantGet] = useSearchParam('get');
  const [wantAlias, setWantAlias] = useSearchParam('alias');
  const [usageOn, setUsageOn] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  // Make current's spoken answer (its result shows in place, with no toast): one polite status line, kept mounted.
  const [said, setSaid] = useState('');
  const [newProject, setNewProject] = useState(false);
  const canNewProject = useCan('projects.create');
  // The same gate as the access drawer: Explain with the Agent reads the computers' access rules.
  const canAccess = useCan('resources.proxy_aliases');
  // A bulk confirm holds the ids it was opened on and the way to clear the list's selection; the rows it would act on are
  // read from the live list, so a row that left, or whose state or rights no longer allow the change, closes it.
  const [bulk, setBulk] = useState<{ op: 'stop' | 'restart'; ids: ReadonlySet<string>; clear: () => void } | null>(null);
  const usage = useAllUsage(usageOn);
  // A create, copy or delete moves a free slice's used/total (servers' computer_capacity): both lists re-read.
  const reload = useCallback(() => Promise.all([computers.refetch(), servers.refetch()]), [computers, servers]);
  const lifecycle = useLifecycleOps(reload);
  const programOps = useProgramOps();

  const list = computers.data;
  // A failed read keeps the last rows (TanStack): those rows prove nothing once the refetch failed, so the zero state, the
  // header's Get a computer and the detail's 'gone' all wait for a list that read.
  const listRead = list !== undefined && !computers.isError;
  const noComputers = listRead && list.length === 0;
  // The realm's projects list names only projects tagged with that realm; a listed computer's project it lacks is
  // read by id (only then), so Projects and a computer's Project fact show it.
  const shownRealm = useShownRealm();
  const missingIds = missingProjectIds(projects.data, list);
  const missingReads = useProjectsById(missingIds);
  const found = missingReads.map((q) => q.data).filter((p): p is Project => !!p);
  // Keyed on every answer's whole content (name, colour, realms), so a fresh answer for the same id is shown.
  const foundKey = JSON.stringify(found);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shownProjects = useMemo(() => projectsInView(projects.data, found, list, shownRealm === 'all' ? undefined : shownRealm), [projects.data, foundKey, list, shownRealm]);
  // Projects is known only once every list it is built from answered: the realm's, the computers' and each missing
  // project's read. Until then it loads, and while any of them is read again with nothing to show it loads too (a
  // kept empty answer is not shown as "No projects" before the fresh one); a failed one is an error with a retry.
  const projectsRefreshing = projects.isFetching || computers.isFetching || missingReads.some((q) => q.isFetching);
  const projectsLoading = projects.isPending || computers.isPending || missingReads.some((q) => q.isPending) || (projectsRefreshing && (shownProjects?.length ?? 0) === 0);
  const projectsError = projects.error ?? computers.error ?? missingReads.find((q) => q.isError)?.error ?? null;
  // Retry, Refresh and the refresh after a rename or delete: the realm's list and every by-id read are read again,
  // the computers list when it failed.
  const retryProjects = () => {
    void projects.refetch();
    if (computers.isError) void computers.refetch();
    for (const q of missingReads) void q.refetch();
  };
  // The link's name may be from before a rename: findByHandle then finds the computer by its id tail, and the URL
  // takes the current handle in place (no new history entry, the other keys kept). An ask in such a link (`alias=`,
  // `take=1`) is not carried over to the computer the tail found: the asks are dropped first and the detail waits for
  // that, so nothing opens ready to change a computer the link did not name.
  const named = findByHandle(list ?? [], sel);
  const namedHandle = named ? handleOf(named) : undefined;
  const byTail = named !== undefined && sel !== namedHandle && sel !== named.name;
  const [wantTake, setWantTake] = useSearchParam('take');
  const selected = byTail && (wantAlias !== undefined || wantTake !== undefined) ? undefined : named;
  useEffect(() => {
    if (sel === undefined || namedHandle === undefined || sel === namedHandle) return;
    if (byTail && wantAlias !== undefined) setWantAlias(undefined, { replace: true });
    if (byTail && wantTake !== undefined) setWantTake(undefined, { replace: true });
    select(namedHandle, { replace: true, keepScroll: true });
  }, [sel, namedHandle, byTail, wantAlias, wantTake, select, setWantAlias, setWantTake]);
  const serverOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of list ?? []) seen.set(serverKey(c), serverLabel(c).name);
    return [...seen].map(([key, name]) => ({ key, name }));
  }, [list]);
  // Free or paid: the computer's server in the servers list (by id, else by name); unknown until it loads.
  const planOf = useMemo(() => {
    const by = new Map<string, 'free' | 'paid'>();
    for (const x of servers.data ?? []) {
      by.set(x.id, x.free ? 'free' : 'paid');
      if (!by.has(x.name)) by.set(x.name, x.free ? 'free' : 'paid');
    }
    return (c: Computer) => by.get(serverKey(c)) ?? by.get(serverLabel(c).name);
  }, [servers.data]);

  const openOverlay = (o: Overlay) => setOverlay(o);
  const closeOverlay = () => setOverlay(null);

  const onAction = (c: Computer, a: ComputerAction) => {
    switch (a) {
      case 'start':
      case 'resume':
        void lifecycle.run(c, a);
        break;
      case 'stop':
      case 'restart':
        openOverlay({ kind: a, c });
        break;
      case 'makeCurrent':
        // Asked first (MakeCurrentConfirm, bound to this computer): the press alone chooses nothing.
        openOverlay({ kind: 'makeCurrent', c });
        break;
      case 'openTerminal': {
        const u = programUrl(c, 'terminal');
        if (u) openOutside(u);
        break;
      }
      case 'logs':
        out.logsOf(handleOf(c));
        break;
      case 'rename':
      case 'realms':
      case 'copy':
      case 'delete':
        openOverlay({ kind: a, c });
        break;
      case 'ssh':
        openOverlay({ kind: 'ssh', c });
        break;
      case 'snapshot':
        // The Backups tab's own Take drawer (one form, one hold): the tab opens it once its list is read.
        go(`/computers?sel=${encodeURIComponent(handleOf(c))}&tab=backups&take=1`);
        break;
    }
  };

  // A bulk change runs only on the rows whose state and this sign-in's rights allow it (allowedOps): a stopped computer
  // gets no Stop, a token without restart no Restart. The confirm counts those rows; none, nothing is asked.
  const onBulk = (op: 'start' | 'stop' | 'restart', rows: Computer[], clear: () => void) => {
    if (op === 'start') {
      for (const c of rows) {
        const ops = allowedOps(c, caps);
        const start = c.status === 'paused' ? 'resume' : 'start';
        if (ops.includes(start)) void lifecycle.run(c, start);
      }
      clear();
      return;
    }
    const fit = rows.filter((c) => allowedOps(c, caps).includes(op));
    if (fit.length > 0) setBulk({ op, ids: new Set(fit.map((c) => c.id)), clear });
  };
  const bulkRows = bulk ? (list ?? []).filter((c) => bulk.ids.has(c.id) && allowedOps(c, caps).includes(bulk.op)) : [];
  const bulkStale = bulk !== null && bulkRows.length !== bulk.ids.size;
  useEffect(() => {
    if (bulkStale) setBulk(null);
  }, [bulkStale]);
  // A one-computer confirm (Stop, Restart, Make current) acts on the live row: one that left the list, or whose state,
  // rights or current-ness no longer allow the change, closes it.
  // Before the first list read the opened row stands (nothing to compare it with yet).
  const liveOf = (c: Computer) => (list ? list.find((x) => x.id === c.id) : c);
  const stopOp = overlay?.kind === 'stop' || overlay?.kind === 'restart' ? overlay.kind : null;
  const stopRow = stopOp && overlay && 'c' in overlay && overlay.c ? liveOf(overlay.c) : undefined;
  const stopFor = stopOp && stopRow && allowedOps(stopRow, caps).includes(stopOp) ? stopRow : null;
  const currentRow = overlay?.kind === 'makeCurrent' ? liveOf(overlay.c) : undefined;
  const currentFor = currentRow && currentRow.id !== currentId ? currentRow : null;
  const confirmGone = (stopOp !== null && stopFor === null) || (overlay?.kind === 'makeCurrent' && currentFor === null);
  useEffect(() => {
    if (confirmGone) setOverlay(null);
  }, [confirmGone]);

  useEffect(() => {
    if (sub[0] && sub[0] !== 'servers' && sub[0] !== 'projects') go(`/computers?sel=${encodeURIComponent(sub[0])}`, { replace: true });
  }, [sub, go]);
  // links.create (`?new=1`) and links.get (`?get=1`, the shell's Get a computer link): another page, the shell or an
  // empty state asks for the Get a computer drawer. The key is dropped once read, so a reload does not reopen it.
  useEffect(() => {
    if (wantNew === undefined) return;
    setWantNew(undefined, { replace: true });
    if (allows(caps, 'create')) setOverlay({ kind: 'create' });
  }, [wantNew, setWantNew, caps]);
  useEffect(() => {
    if (wantGet === undefined) return;
    setWantGet(undefined, { replace: true });
    if (allows(caps, 'create')) setOverlay({ kind: 'create' });
  }, [wantGet, setWantGet, caps]);

  // links.alias (`?sel=<handle>&alias=<port>`): another page (Programs' per-port Create alias) asks for the alias drawer
  // for that port of the selected computer; `alias=new` asks for it with no port, where the person types one (an alias
  // needs nothing running). Read once the list has answered; the key is dropped either way, and any other value (a
  // port that is not one: 1-65535, digits only) or a computer the list does not hold opens nothing.
  useEffect(() => {
    if (wantAlias === undefined || (list === undefined && !computers.isError)) return;
    setWantAlias(undefined, { replace: true });
    const port = /^[0-9]{1,5}$/.test(wantAlias) ? Number(wantAlias) : 0;
    if (selected && wantAlias === 'new') setOverlay({ kind: 'alias', c: selected });
    else if (selected && port >= 1 && port <= 65535) setOverlay({ kind: 'alias', c: selected, port });
  }, [wantAlias, setWantAlias, list, computers.isError, selected]);

  const ops = allowedOps(selected, caps);
  const start = ops.find((o) => o === 'start' || o === 'resume');
  usePageShortcuts([
    { key: 'n', label: t('key.new'), run: () => setOverlay({ kind: 'create' }), enabled: allows(caps, 'create') },
    {
      key: 'Escape',
      label: t('key.back'),
      enabled: !!selected,
      run: () => {
        if (!selected) return;
        const handle = handleOf(selected);
        select(undefined);
        // A terminal has no frames and no document (the list-and-detail layout gives the row its focus back there).
        if (hostEnv().browserPage === true) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-row-id="${handle}"]`)?.focus());
      },
    },
    { key: 's', label: t('key.start'), run: () => selected && start && onAction(selected, start), enabled: !!selected && !!start },
    { key: 'x', label: t('key.stop'), run: () => selected && onAction(selected, 'stop'), enabled: !!selected && ops.includes('stop') },
    { key: 't', label: t('key.terminal'), run: () => selected && onAction(selected, 'openTerminal'), enabled: !!selected },
    // No copy key: a page key has no kit way to copy. The menus' Copy terminal URL copies the link (its item copies on
    // its own, then calls onAction, so onAction never copies).
  ]);

  const agentFacts = useAgentScopeFacts(null);
  const hint = <AgentHint page="computers" facts={agentFacts} />;
  // Computers | Servers | Projects: the kit's view tabs under the subtitle, in every layout the page draws.
  const views = useViewSwitch(view, (v) => go(v === 'computers' ? '/computers' : `/computers/${v}`));
  const header: PageHeaderProps = {
    title: t('title'),
    subtitle: view === 'computers' ? t('subtitle') : t(`subtitle.${view}`),
    actions: hint,
    // The page's one primary: the floating button at phone width; with a detail open it turns secondary.
    ...(allows(caps, 'create') && !noComputers
      ? sel === undefined
        ? { primary: { label: t('action.get'), icon: 'plus' as const, onPress: () => openOverlay({ kind: 'create' }) } }
        : {
            actions: (
              <>
                {hint}
                <Button variant="secondary" icon="plus" onPress={() => openOverlay({ kind: 'create' })}>{t('action.get')}</Button>
              </>
            ),
          }
      : {}),
  };

  const overlays = (
    <>
      <span className={s.srOnly} role="status">{said}</span>{/* spoken result of Make current, which answers in place with no toast */}
      <CreateDrawer
        isOpen={overlay?.kind === 'create'}
        servers={servers.data}
        serversError={servers.isError}
        projects={projects.data}
        realms={realms.data}
        computers={list}
        canCopy={allows(caps, 'copy')}
        startFrom={overlay?.kind === 'create' ? overlay.from : undefined}
        projectsBusy={projects.isFetching}
        projectsError={projects.isError ? (projects.error ?? true) : undefined}
        onProjectsRetry={() => void projects.refetch()}
        onNewProject={(from) => openOverlay({ kind: 'newProject', from })}
        onClose={closeOverlay}
        onDone={() => void reload()}
      />
      {/* New project from Get computer: back to Get computer after (the same copy, when it was copying), which reads the new list. */}
      <ProjectDrawer isOpen={overlay?.kind === 'newProject'} project={null} projects={projects.data} onClose={() => openOverlay({ kind: 'create', from: overlay?.kind === 'newProject' ? overlay.from : undefined })} onDone={() => void projects.refetch()} />
      {/* New project from Copy: back to the same computer's Copy after, which reads the new list. */}
      <ProjectDrawer isOpen={overlay?.kind === 'copyNewProject'} project={null} projects={projects.data} onClose={() => (overlay?.kind === 'copyNewProject' ? openOverlay({ kind: 'copy', c: overlay.c }) : closeOverlay())} onDone={() => void projects.refetch()} />
      <StopConfirm c={stopFor} op={overlay?.kind === 'restart' ? 'restart' : 'stop'} onClose={closeOverlay} onConfirm={(c) => void lifecycle.run(c, overlay?.kind === 'restart' ? 'restart' : 'stop')} />
      {/* No toast after it: the result shows where the action was (the detail's Current computer, the row's Current
          chip, the top bar), shown inline first. */}
      <MakeCurrentConfirm c={currentFor} onClose={closeOverlay} onConfirm={(c) => { if (chooseComputer(c)) setSaid(t('said.current', { name: c.name })); }} />
      <ConfirmDialog overlayId="computers-view-confirm-dialog"
        isOpen={bulk !== null}
        onOpenChange={(o) => !o && setBulk(null)}
        title={bulk ? t(`bulk.${bulk.op}.title`, { count: bulkRows.length }) : ''}
        body={t('bulk.body')}
        confirmLabel={bulk ? t(`menu.${bulk.op}`) : ''}
          onConfirm={() => {
          if (bulk) {
            for (const c of bulkRows) void lifecycle.run(c, bulk.op);
            bulk.clear();
          }
          setBulk(null);
        }}
      />
      <RenameDialog c={overlay?.kind === 'rename' ? overlay.c : null} onClose={closeOverlay} onDone={() => void reload()} />
      <ColourDialog c={overlay?.kind === 'colour' ? overlay.c : null} onClose={closeOverlay} onDone={() => void reload()} />
      {/* One delete dialog for the page: a project's Computers tab opens it for an expired computer too (expired: the base
          host's delete). Keyed by that, so a mount never switches its change. */}
      <DeleteComputer key={overlay?.kind === 'delete' && overlay.expired ? 'expired' : 'live'} c={overlay?.kind === 'delete' ? overlay.c : null} expired={overlay?.kind === 'delete' && overlay.expired === true} onClose={closeOverlay} onDone={() => { select(undefined); void reload(); }} />
      <SshDrawer c={overlay?.kind === 'ssh' ? overlay.c : null} onClose={closeOverlay} onDone={() => void reload()} />
      <RealmsDrawer c={overlay?.kind === 'realms' ? overlay.c : null} realms={realms.data} add={overlay?.kind === 'realms' ? overlay.add : undefined} onClose={closeOverlay} onDone={() => void reload()} />
      {/* A computer from another realm, then the Realms drawer with the realm shown now ticked. */}
      <ImportDrawer isOpen={overlay?.kind === 'import'} realms={realms.data} onClose={closeOverlay} onPick={(c) => openOverlay({ kind: 'realms', c, add: shownRealm })} />
      <CopyDrawer c={overlay?.kind === 'copy' ? overlay.c : null} projects={projects.data} projectsError={projects.isError ? (projects.error ?? true) : undefined} projectsBusy={projects.isFetching} onProjectsRetry={() => void projects.refetch()} servers={servers.data} onClose={closeOverlay} onDone={() => void reload()} onNewProject={overlay?.kind === 'copy' ? () => openOverlay({ kind: 'copyNewProject', c: overlay.c }) : undefined} />
      <AliasDrawer c={overlay?.kind === 'alias' ? overlay.c : null} port={overlay?.kind === 'alias' ? (overlay.port ?? null) : null} onClose={closeOverlay} onDone={() => undefined} />
      <RemoveAlias c={overlay?.kind === 'removeAlias' ? overlay.c : null} alias={overlay?.kind === 'removeAlias' ? (overlay.alias ?? null) : null} onClose={closeOverlay} onDone={() => undefined} />
      <AliasEditDrawer c={overlay?.kind === 'editAlias' ? overlay.c : null} alias={overlay?.kind === 'editAlias' ? (overlay.alias ?? null) : null} onClose={closeOverlay} />
      <DomainDrawer c={overlay?.kind === 'domain' ? overlay.c : null} alias={overlay?.kind === 'domain' ? (overlay.alias ?? null) : null} onClose={closeOverlay} />
    </>
  );

  // The page has one FAQ root: the table views are rendered here, and the list beside a selected computer
  // (ListDetailPage, below) shows the same questions in its list pane. The views are exclusive, so one Questions section shows.
  const tableRoot = (tableHeader: PageHeaderProps, body: ReactNode, extra: { notice?: ReactNode; stats?: ReactNode } = {}) => (
    <>
      <TablePage faq={{ items }} header={tableHeader} views={views} notice={extra.notice} stats={extra.stats}>
        {body}
      </TablePage>
      {overlays}
    </>
  );

  if (view === 'projects') {
    // The header keeps the title (the switch is the page's view tabs); its primary is New project, never Get a computer. A note about
    // projects outside the realm goes in the page's notice slot, never flush against the table.
    const outside = shownProjects?.some((p) => p.outside) ?? false;
    return tableRoot(
      { title: header.title, subtitle: header.subtitle, actions: hint, ...(canNewProject ? { primary: { label: t('proj.new'), icon: 'plus' as const, onPress: () => setNewProject(true) } } : {}) },
      <ProjectsView
        projects={projectsLoading && (shownProjects?.length ?? 0) === 0 ? undefined : shownProjects}
        computers={list}
        realms={realms.data}
        loading={projectsLoading}
        error={projectsError}
        onRetry={retryProjects}
        newOpen={newProject}
        onNewClose={() => setNewProject(false)}
        onDeleteExpired={(c) => openOverlay({ kind: 'delete', c, expired: true })}
      />,
      { notice: outside ? <p className={s.help}>{t('proj.outsideNote')}</p> : undefined },
    );
  }

  if (view === 'servers') {
    return tableRoot(
      out.has.market ? { ...header, primary: { label: t('srv.market'), onPress: () => out.market() } } : header,
      <ServersView servers={servers.data} subs={subs.data} computers={list} known={{ computers: !computers.isError, subs: !subs.isError }} loading={servers.isPending} error={servers.error} onRetry={() => void servers.refetch()} />,
    );
  }

  // The list's switches and actions sit in its toolbar while there is room and in the view menu when it is tight
  // (ComputersList adds Ask the Agent, at every width: the kit folds it into the view menu when the toolbar is tight).
  const canExplainAll = canAccess && list !== undefined && list.length > 0;
  const toolbarActions: ToolbarAction[] = [
    { id: 'usage', label: t('usage.show'), selected: usageOn, onSelectedChange: setUsageOn },
    ...(usageOn ? [{ id: 'usageReload', label: t('usage.reload'), icon: 'reload' as const, iconOnly: true, onPress: () => void usage.refetch() }] : []),
  ];

  if (noComputers) {
    return tableRoot(
      header,
      <div className={s.zeroWrap}>
        <ZeroState onDone={() => void reload()} onCreate={allows(caps, 'create') ? () => openOverlay({ kind: 'create' }) : undefined} onImport={allows(caps, 'realms') ? () => openOverlay({ kind: 'import' }) : undefined} realmCount={realms.data?.length ?? 0} />
      </div>,
    );
  }

  const listEl = (
    <ComputersList
      computers={list}
      projects={shownProjects}
      realms={realms.data}
      caps={caps}
      currentId={currentId}
      loading={computers.isPending}
      error={computers.error}
      onRetry={() => void computers.refetch()}
      ops={lifecycle.ops}
      usage={usageOn ? usage.data : undefined}
      servers={serverOptions}
      planOf={servers.data ? planOf : undefined}
      serverFor={(c: Computer) => serverOf(c, servers.data)}
      onAction={onAction}
      onBulk={onBulk}
      toolbarActions={sel === undefined && !narrow ? toolbarActions : undefined}
      explainAll={sel === undefined && canExplainAll}
      usageFilter={sel === undefined && narrow ? { on: usageOn, onChange: setUsageOn } : undefined}
      empty={
        <EmptyState
          icon="computer"
          title={t('empty.title')}
          body={t('empty.body')}
          action={allows(caps, 'create') ? <Button icon="plus" onPress={() => openOverlay({ kind: 'create' })}>{t('action.get')}</Button> : undefined}
        />
      }
    />
  );

  if (sel === undefined) {
    return tableRoot(header, listEl, { stats: list && list.length > 0 ? <StatStrip computers={list} servers={servers.data} /> : undefined });
  }

  return (
    <>
      <ListDetailPage
        storageKey="computers"
        faq={{ items }}
        header={header}
        // On a phone with a computer open, only "< Computers" leads back (as Programs): no page tabs above it.
        views={narrow ? undefined : views}
        list={listEl}
        detail={
          selected ? (
            <DetailView
              c={selected}
              projects={shownProjects}
              realms={realms.data}
              caps={caps}
              current={selected.id === currentId}
              op={lifecycle.ops[selected.id]}
              usageOn={usageOn}
              onUsageOn={setUsageOn}
              onAction={onAction}
              onOverlay={(kind, extra) => openOverlay({ kind, c: selected, ...extra })}
              onCheck={() => void lifecycle.check(selected)}
              onDismiss={() => lifecycle.dismiss(selected)}
              onForget={() => lifecycle.forget(selected)}
              programOps={programOps}
            />
          ) : listRead && !named ? (
            <EmptyState icon="warn" title={t('detail.gone')} body={t('detail.goneBody')} action={<Button onPress={() => select(undefined)}>{t('detail.back')}</Button>} />
          ) : null
        }
      />
      {overlays}
    </>
  );
}

export { ErrorState, OutcomeBanner };
