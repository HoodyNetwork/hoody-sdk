// AI → Knowledge → Memory: what agents remember in this realm on this computer. The realm band
// says where the realm's memory is kept and whether it is on; the library lists a project's memories, lessons, slots and
// observations, with one record's detail, edit and delete, and the lessons and slots kept for every project of the realm
// (the realm-wide row, ?wide=1). Memory is per realm: with All realms nothing is read. Global is a store of its own: the
// page's "Memory of" choice shows it (?realm=global), whatever the top bar's realm.
// The status read decides what the library may show: rows only when a store resolved; an off realm, a store that cannot
// be read, a realm whose memory is not connected and a failed read each say so, never an empty library (the agent lists
// an off realm as an empty page). Mounted at /ai/knowledge/memory (tab.tsx): the host gives the computer's name.
import {
  Band, Button, ComputerRequired, ConfirmDialog, DataTable, EmptyState, ErrorState, ListDetailPage, Outcome, SegmentedControl, SettingGroup, SettingRow, SettingSwitch, Skeleton, Stack, Row,
  Facts, SubSection, type Fact, createColumnHelper, formatNumber, useDataView, useGo, useSearchParam, useStrings, RealmBand, When,
} from '@kit';
import { isRealmId, realmLabel, refusal, useCurrentComputer, useRealms } from '@core';
import { useAiRealm } from '../../aiRealm';
import { links } from '../../links';
import { useMemo, useState, type ReactNode } from 'react';
import { AdminBar, UseSelfAction } from './Admin';
import { useAdmin } from './admin';
import { type MemoryAt, useDataHost, useEnable, useGlobalOpen, useMemoryAt, useMemoryStatus, useProjects, manageable, writable } from './data';
import { bandHost, hostName, libraryState, type DataHost, type HostState, type LibraryState, type MemoryStatus, type ProjectRow } from './logic';
import { Library } from './Library';
import strings from './Memory.strings.en.json';
import s from './Memory.module.css';

export type T = ReturnType<typeof useStrings<typeof strings>>;

export interface MemoryViewProps {
  /** The computer's name, as the top bar shows it. */
  computer: string;
}

/** A realm's name for words: its alias, else its short id. */
export function realmWord(id: string): string {
  const n = realmLabel(id);
  return n.kind === 'alias' || n.kind === 'short' ? n.text : id;
}

/** The page's store choice: the top bar's realm, or Global (?realm=global). */
const globalOf = (v: unknown) => v === 'global';

/** "Memory of": the page's realm (the top bar's, or under All realms the computer's own one realm, aiRealm.ts) or Global.
 *  A change opens the chosen store's project list (a project, search or open record of one store means nothing in
 *  another); Back goes back to the other. With no one realm to tell only Global can be read: the realm choice stays,
 *  disabled, and the page asks for a realm or offers Global (MemoryView). */
function ScopePicker({ global }: { global: boolean }) {
  const t = useStrings(strings);
  const go = useGo();
  const selected = useAiRealm().realm;
  const open = useGlobalOpen();
  const one = isRealmId(selected);
  return (
    <SegmentedControl
      label={t('scope.label')}
      showLabel
      value={global ? 'global' : 'realm'}
      onChange={(v) => go(v === 'global' ? `${links.memory}?realm=global` : links.memory)}
      items={[
        { id: 'realm', label: one ? t('scope.realm', { realm: realmWord(selected) }) : t('scope.allRealms'), isDisabled: !one },
        { id: 'global', label: t('scope.global'), isDisabled: !open },
      ]}
    />
  );
}

export default function MemoryView({ computer }: MemoryViewProps) {
  const t = useStrings(strings);
  const target = useCurrentComputer();
  const [scope] = useSearchParam('realm');
  const ai = useAiRealm();
  const shown = useRealms().selected;
  // Under All realms a computer in no realm has Global as its own (aiRealm.ts): its memory is Global's, shown as Global.
  const global = globalOf(scope) || (shown === 'all' && ai.realm === 'global');
  const at = useMemoryAt(global);
  const open = useGlobalOpen();
  const header = { title: t('title'), subtitle: t('subtitle', { computer }) };
  if (!target) return <ComputerRequired state="none" header={header} />;
  // Under All realms, while the computer's realms are read: loading, not the realm question.
  if (!at && ai.deciding) return <ListDetailPage header={header} state={{ kind: 'loading' }} list={null} detail={null} />;
  if (!at) return <AllRealms header={header} closed={global && !open} />;
  // Keyed by computer and realm: nothing of one place (outcomes, open Details) is carried to another.
  return <MemoryAtView key={`${at.target.container.id}\u0000${at.realm}`} at={at} computer={computer} />;
}

/** Nothing to read here: All realms at the top (Global, a store of its own, can be read instead), or Global asked for by a
 *  token session, which reaches its own realm only (useGlobalOpen); its action goes back to that realm's memory. */
function AllRealms({ header, closed }: { header: { title: string; subtitle: string }; closed: boolean }) {
  const t = useStrings(strings);
  const go = useGo();
  const action = closed
    ? { id: 'memory-scope-realm', label: t('scope.showRealm'), onPress: () => go(links.memory) }
    : { id: 'memory-scope-global', label: t('scope.showGlobal'), onPress: () => go(`${links.memory}?realm=global`) };
  return <ListDetailPage header={header} state={{ kind: 'notHere', icon: 'realm', title: closed ? t('scope.closed.title') : t('allRealms.title'), body: closed ? t('scope.closed.body') : t('allRealms.body'), action }} list={null} detail={null} />;
}

function MemoryAtView({ at, computer }: { at: MemoryAt; computer: string }) {
  const t = useStrings(strings);
  const [project, setProject] = useSearchParam('project');
  const [wideParam, setWide] = useSearchParam('wide');
  // The realm-wide scope (key ''), opened only while no project is named.
  const wide = !project && wideParam === '1';
  const key = project || (wide ? '' : undefined);
  const realm = at.realm === 'global' ? t('scope.global') : realmWord(at.realm);
  const canWrite = writable(at);
  const canManage = manageable(at);
  const host = useDataHost(at);
  const status = useMemoryStatus(at, project);
  const state = libraryState(status);
  const projects = useProjects(at, state === 'ready');
  const admin = useAdmin(at, project ?? '');
  const row = key !== undefined ? projects.data?.find((p) => p.key === key) : undefined;
  const allProjects = () => (wide ? setWide(undefined) : setProject(undefined));
  const retry = () => {
    void host.refetch();
    void status.refetch();
    if (state === 'ready') void projects.refetch();
  };
  const band = (
    <>
    {/* The choice keeps its own width: the toolbar stretches its children, the start-aligned stack does not. */}
    <Stack align="start">
      <ScopePicker global={at.realm === 'global'} />
    </Stack>
    <RealmBand
      realm={realm}
      computer={computer}
      host={bandHost(host, (d: DataHost) => hostName(d, computer))}
      memory={status.data && !status.error ? status.data.enabled : null}
      onRetry={retry}
      action={canManage ? <UseSelfAction admin={admin} host={host.data ?? null} computer={computer} realm={realm} /> : undefined}
      details={<BandDetails at={at} canWrite={canWrite} computer={computer} realm={realm} project={project ?? undefined} host={host.error ? null : (host.data ?? null)} hostState={host.error ? 'failed' : host.data ? host.data.state : 'loading'} status={status.error ? null : (status.data ?? null)} />}
    />
    {canManage
      ? <AdminBar admin={admin} computer={computer} realm={realm} row={row ?? null} ready={state === 'ready'} />
      : <Band tone="neutral" size="table" /* noDetails: a fact of the page, not a failure */>{t('scope.noManage')}</Band>}
    </>
  );
  const back = <Button variant="ghost" size="sm" icon="arrow-left" onPress={allProjects}>{t('allProjects')}</Button>;
  const header = project
    ? {
      title: t('titleProject', { name: row?.name ?? project }),
      subtitle: row?.root ? t('subtitleProject', { root: row.root }) : t('subtitle', { computer }),
      actions: back,
    }
    : wide
      ? { title: t('titleProject', { name: t('p.wide') }), subtitle: t('subtitleWide', { realm }), actions: back }
      : { title: t('title'), subtitle: t('subtitle', { computer }) };

  if (state !== 'ready') {
    return <ListDetailPage header={header} toolbar={band} list={<NotReady state={state} status={status.data} error={status.error} realm={realm} computer={computer} onRetry={retry} />} detail={null} />;
  }
  const partial = status.data && status.data.degradedReads.length > 0 ? <Band tone="warn" size="table" /* noDetails: the status answer names counts it could not read; no rejection */>{t('st.partial')}</Band> : null;
  if (key === undefined) {
    return <Projects header={header} band={<>{band}{partial}</>} q={projects} realm={realm} onOpen={(k) => (k === '' ? setWide('1') : setProject(k))} />;
  }
  if (wide) {
    return <Library key="" at={at} project="" wide row={row ?? null} status={status.data as MemoryStatus} header={header} band={<>{band}{partial}</>} realm={realm} projectsError={projects.error} onRetryProjects={() => void projects.refetch()} />;
  }
  // A project the list no longer names (its last item erased, or another realm's) still opens its library: a held
  // edit or delete of one of its records stays reachable there (Check again, Stop waiting).
  const unknown = projects.data && !row ? (
    <Band tone="warn" size="table" /* noDetails: the project list answered without it; no rejection */ actions={<Button size="sm" onPress={allProjects}>{t('allProjects')}</Button>}>
      {t('p.unknown.band', { name: key })}
    </Band>
  ) : null;
  return <Library key={key} at={at} project={key} row={row ?? null} status={status.data as MemoryStatus} header={header} band={<>{band}{partial}{unknown}</>} realm={realm} projectsError={projects.error} onRetryProjects={() => void projects.refetch()} />;
}

/** The library cannot list anything: the status read says why, in words that never read as "nothing stored" unless the
 *  agent said the realm holds nothing (off and never stored). */
function NotReady({ state, status, error, realm, computer, onRetry }: { state: LibraryState; status?: MemoryStatus; error: unknown; realm: string; computer: string; onRetry: () => void }) {
  const t = useStrings(strings);
  // A section-sized state right under the band and its controls, not a page-sized one centred far below them.
  if (state === 'loading') return <Skeleton variant="table" />;
  if (state === 'cold') return <ErrorState size="sm" title={t('st.cold.title', { realm, computer })} body={t('st.cold.body', { computer })} error={error} onRetry={onRetry} />;
  if (state === 'unreachable') return <ErrorState size="sm" title={t('st.unreachable.title')} body={t('st.unreachable.body')} error={error} onRetry={onRetry} />;
  if (state === 'degraded') {
    return <ErrorState
        size="sm"
        title={t('st.degraded.title', { realm })}
        body={status?.remedy || t(status?.recoverable ? 'st.degraded.body' : 'st.degraded.bodyFixed')}
        onRetry={status?.recoverable ? onRetry : undefined}
        /* noDetails: the status read answered; the agent's remedy is the detail */
      />;
  }
  return status?.enabled
    ? <EmptyState size="sm" icon="database" title={t('st.empty.title', { realm })} body={t('st.empty.body')} />
    : <EmptyState size="sm" icon="database" title={t('st.off.title', { realm })} body={t('st.off.body')} />;
}

const pcol = createColumnHelper<ProjectRow>();

function Projects({ header, band, q, realm, onOpen }: {
  header: { title: string; subtitle: string };
  band: ReactNode;
  q: ReturnType<typeof useProjects>;
  realm: string;
  onOpen: (key: string) => void;
}) {
  const t = useStrings(strings);
  // The realm-wide row has no name or folder of its own: it reads as what it holds.
  const wideName = t('p.wide');
  const rows = useMemo(() => q.data?.map((r) => (r.key === '' ? { ...r, name: wideName, root: t('p.wideRoot') } : r)), [q.data, wideName, t]);
  const columns = useMemo(
    () => [
      pcol.accessor('name', {
        header: t('p.col.name'),
        meta: { pinned: true },
        cell: (c) => (
          <span className={s.project}>
            <span>{c.row.original.name}</span>
            {c.row.original.root && <span className={s.root}>{c.row.original.root}</span>}
          </span>
        ),
      }),
      pcol.accessor('memories', { header: t('p.col.memories'), meta: { width: '120px', align: 'end', mono: true }, cell: (c) => formatNumber(c.getValue()) }),
      pcol.accessor('lessons', { header: t('p.col.lessons'), meta: { width: '110px', align: 'end', mono: true, priority: 2 }, cell: (c) => formatNumber(c.getValue()) }),
      pcol.accessor('observations', { header: t('p.col.observations'), meta: { width: '140px', align: 'end', mono: true, priority: 3 }, cell: (c) => formatNumber(c.getValue()) }),
      pcol.accessor('updatedAt', {
        header: t('p.col.updated'),
        meta: { width: '150px', priority: 4 },
        cell: (c) => (c.getValue() ? <When at={c.getValue()} /> : t('unknown')),
      }),
    ],
    [t],
  );
  const view = useDataView<ProjectRow>({
    rows,
    columns,
    // The realm-wide row's key is '' (a row id is never empty; the agent's project keys read 'v1:<hex>').
    getRowId: (r) => (r.key === '' ? '~wide' : r.key),
    search: ['name', 'root'],
    sort: '-memories',
    pageSize: 50,
    param: 'p',
    isLoading: q.isPending,
    error: q.error,
  });
  return (
    <ListDetailPage
      header={header}
      toolbar={band}
      list={
        <DataTable
          label={t('title')}
          view={view}
          columns={columns}
          search={t('p.search')}
          onRetry={() => void q.refetch()}
          onRefresh={() => void q.refetch()}
          onRowAction={(r) => onOpen(r.key)}
          noViewMenu
          countLabel={(n) => t('p.count', { count: n })}
          noMatch={t('p.noMatch')}
          empty={<EmptyState icon="database" title={t('st.empty.title', { realm })} body={t('st.empty.body')} />}
        />
      }
      detail={null}
    />
  );
}

/** Details under the band, one block under another: the on/off switch as a setting row with its help and outcome, the
 *  realm's memory hosts (state, computers, what the agent says) as Facts, then what the store keeps. */
function BandDetails({ at, canWrite, computer, realm, project, host, hostState, status }: { at: MemoryAt; canWrite: boolean; computer: string; realm: string; project?: string; host: DataHost | null; hostState: HostState | 'loading' | 'failed'; status: MemoryStatus | null }) {
  const t = useStrings(strings);
  const runner = useEnable(at);
  const [asked, setAsked] = useState(false);
  const [last, setLast] = useState<boolean | null>(null);
  const held = runner.outcome?.kind === 'pending';
  const sent = runner.held as { enabled?: unknown } | null;
  const heldState = sent && typeof sent.enabled === 'boolean' ? t(sent.enabled ? 'det.on' : 'det.off') : '';
  // The runner's own Dismiss frees only the hold this band shows (passed by reference, never a bare core settle).
  const stopWaiting = runner.dismiss;
  // The data-host read as label and value pairs: its state, the hosts it names (one per line) and what the agent says.
  const hostFacts: Fact[] = [
    { label: t('det.state'), value: t(`det.state.${hostState}`) },
    ...(host
      ? [{
          label: t('det.computers'),
          value: host.hosts.length > 0 ? (
            <ul className={s.hosts}>
              {host.hosts.map((h) => (
                <li key={h.id}>
                  {h.self ? computer : h.name || h.id}
                  {h.self ? ` · ${t('det.self')}` : ''}
                  {h.current ? ` · ${t('det.current')}` : ''}
                </li>
              ))}
            </ul>
          ) : t('det.noHosts'),
        }]
      : []),
    ...(host?.reason ? [{ label: t('det.reason'), value: host.reason }] : []),
  ];
  return (
    <Stack gap={5}>
      <Stack gap={2}>
        <SettingGroup title={t('det.capture')}>
          {status ? (
            <SettingSwitch
              label={t('det.switch', { realm })}
              help={t('det.switchNote', { realm, computer })}
              isSelected={status.enabled}
              isDisabled={!canWrite || runner.busy || held}
              onChange={(next) => { if (!canWrite) return; setLast(next); void runner.run({ ...at, enabled: next }); }}
            />
          ) : (
            <SettingRow label={t('det.switch', { realm })}>{t('det.unknown')}</SettingRow>
          )}
        </SettingGroup>
        <Outcome
          outcome={runner.outcome}
          onCheck={held ? runner.check : undefined}
          doneText={t((last ?? status?.enabled) ? 'det.done.on' : 'det.done.off')}
          detail={held ? (runner.elsewhere ? t('det.heldElsewhere') : heldState ? t('det.held', { state: heldState }) : undefined) : undefined}
          error={refusal(runner.outcome)}
        />
        {held && !runner.elsewhere && <Row><Button size="sm" variant="ghost" onPress={() => setAsked(true)}>{t('held.dismiss')}</Button></Row>}
        <ConfirmDialog
          isOpen={asked}
          onOpenChange={setAsked}
          title={t('held.dismissTitle')}
          body={t('held.dismissBody')}
          confirmLabel={t('held.dismiss')}
          onConfirm={() => { setAsked(false); void stopWaiting(); }}
        />
      </Stack>
      <SubSection title={t('det.hosts')}>
        <Facts layout="spec" columns={2} items={hostFacts} />
      </SubSection>
      {status && status.available && <Stored status={status} project={project} where={at.realm === 'global' ? t('det.where.global') : t('det.where.realm', { realm })} />}
    </Stack>
  );
}

/** What the store keeps, as the status read says: the whole store (every project and the realm-wide space; every
 *  version of a memory, superseded ones included), and with a project open, that project's sizes
 *  and how much of it is embedded for recall. A block the agent could not read says so, never 0. */
function Stored({ status, project, where }: { status: MemoryStatus; project?: string; where: string }) {
  const t = useStrings(strings);
  const fact = (label: SizeKey, n: number): Fact => ({ label: t(label), value: formatNumber(n), mono: true });
  const tot = status.totals;
  const cnt = status.counts;
  const cov = status.coverage;
  const embed: Fact = {
    label: t('det.embed.label'),
    value: !cov ? t('det.embed.unread') : cov.model === '' ? t('det.embed.off') : t('det.embed.on', { embedded: formatNumber(cov.embedded), total: formatNumber(cov.total), model: cov.model }),
  };
  return (
    <>
      <SubSection title={t('det.stored', { where })} description={tot ? t('det.totalsNote') : t('det.unread')}>
        {tot && <Facts layout="spec" columns={2} items={[fact('det.n.projects', tot.projects), fact('det.n.versions', tot.memories), fact('det.n.lessons', tot.lessons), fact('det.n.slots', tot.slots), fact('det.n.observations', tot.observations), fact('det.n.sessions', tot.sessions), fact('det.n.graph', tot.graph_nodes)]} />}
      </SubSection>
      {project ? (
        <SubSection title={t('det.inProject')} description={cnt ? undefined : t('det.unread')}>
          <Facts layout="spec" columns={2} items={[...(cnt ? [fact('det.n.memories', cnt.memories), fact('det.n.observations', cnt.observations), fact('det.n.sessions', cnt.sessions), fact('det.n.graph', cnt.graph_nodes), fact('det.n.edges', cnt.graph_edges)] : []), embed]} />
        </SubSection>
      ) : null}
    </>
  );
}

type SizeKey = 'det.n.projects' | 'det.n.versions' | 'det.n.memories' | 'det.n.lessons' | 'det.n.slots' | 'det.n.observations' | 'det.n.sessions' | 'det.n.graph' | 'det.n.edges';
