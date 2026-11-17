// Projects: the groups computers live in. Each row has its colour, how many computers it holds (a link to them),
// its realms and its permissions; New, Rename and, for an empty project only, Delete. A project's id never
// reaches the URL: rows and links use its handle (name plus the id's last four). A project outside this realm (its
// computers here are in the realm, the project is not) shows with a tag saying so. A project read by id because the
// realm's list lacks it (outside, or only past the list's page) offers no Rename or Delete: that list, which does not
// hold it, is what proves a change. The Permissions column shows the project's own access rules (read from
// its document, never guessed from its computers) and its people; a row action opens the project's Permissions
// drawer. A shared-access (key) session reads neither.
import { useCan, useCore } from '@core';
import { ComputerMark, DataTable, EmptyState, Link, Tag, createColumnHelper, useDataView, useStrings } from '@kit';
import { useMachinesView } from './machinesView';
import { useMemo, useState } from 'react';
import { useMembers, useMyLevels, useProjectRules } from '../data';
import { handleOf } from '../logic';
import strings from '../strings.en.json';
import type { Computer, Project, Realm } from '../types';
import { OutsideTag, RealmChips } from './Bits';
import { DeleteProject, ProjectDrawer } from './ProjectDrawers';
import { ProjectPerms } from './ProjectPerms';
import { myLevel, peopleFact, projectActions, projectFact, rulesReadProblem, sharedWithMe } from './projectPerms.logic';
import s from './parts.module.css';

const col = createColumnHelper<Project>();

// The project's colour: the kit's colour mark (the kit owns the --computer property, so no inline style here).
function ProjectDot({ color }: { color: string | undefined }) {
  return <ComputerMark color={color} />;
}

/** The project's own access rules, read for this row only while it is shown: '—' while reading, a refusal (403, a
 *  member below Full control) says who may see them, a paused or failed read is "Couldn't check". */
function RulesFact({ project, account }: { project: Project; account: boolean }) {
  const t = useStrings(strings);
  const q = useProjectRules(project, account);
  if (account && !q.isError && q.fetchStatus !== 'paused' && !q.data) return <span className={s.faint}>—</span>;
  const f = projectFact(!account ? 'key' : q.isError ? rulesReadProblem(q.error) : q.fetchStatus === 'paused' ? 'failed' : q.data ?? 'failed');
  return <span className={f === 'pp.fact.rules.set' || f === 'pp.fact.rules.none' ? undefined : s.faint}>{t(f)}</span>;
}

/** The project's people, read for this row only while it is shown (a row not on the page sends nothing). */
function PeopleFact({ project, account }: { project: Project; account: boolean }) {
  const t = useStrings(strings);
  const q = useMembers(project, account);
  const uid = useCore().account;
  // A project shared with the caller shows their own level from their own row; without it, the count.
  const mine = account && !q.isError && q.fetchStatus !== 'paused' && sharedWithMe(project, uid) ? myLevel(project, q.data, uid) : 'unknown';
  if (mine !== 'unknown' && mine !== 'owner') return <span>{t('pp.sharedLevel', { level: t(`pp.lvl.${mine}`) })}</span>;
  // A read paused offline is not current: "Couldn't check", never the cached answer.
  const f = peopleFact(!account ? 'key' : q.isError || q.fetchStatus === 'paused' ? 'failed' : q.data);
  if (!f) return <span className={s.faint}>—</span>;
  if (f.key === 'pp.fact.people') return <span>{t(f.atLeast ? 'pp.fact.peopleAtLeast' : 'pp.fact.people', { count: f.count })}</span>;
  return <span className={f.key === 'pp.fact.onlyYou' ? undefined : s.faint}>{t(f.key)}</span>;
}

/** Shared with you: the project's owner is known and is another account. */
function SharedTag({ project }: { project: Project }) {
  const t = useStrings(strings);
  return sharedWithMe(project, useCore().account) ? <Tag>{t('pp.shared')}</Tag> : null;
}

type Open = { kind: 'new' } | { kind: 'rename' | 'delete' | 'perms'; p: Project } | null;

export function ProjectsView({
  projects,
  computers,
  realms,
  loading,
  error,
  onRetry,
  newOpen,
  onNewClose,
  onDeleteExpired,
}: {
  projects: Project[] | undefined;
  computers: Computer[] | undefined;
  realms: Realm[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  /** The page header's New project was pressed. */
  newOpen: boolean;
  onNewClose: () => void;
  /** Opens the page's delete dialog for an expired computer of a project's Computers tab. */
  onDeleteExpired?: (c: Computer) => void;
}) {
  const t = useStrings(strings);
  // Cards or List, shared with the other machine lists (useMachinesView).
  const [present, setPresent] = useMachinesView();
  const canUpdate = useCan('projects.update');
  const canDelete = useCan('projects.delete');
  // The caller's place on each project: Rename and Delete only where it allows them.
  const levels = useMyLevels(projects, useCore().account, useCan('account'));
  // Exactly "not a shared-access (key) session": a key session reads no people (projectPerms.logic.ts).
  const account = useCan('account');
  const [open, setOpen] = useState<Open>(null);
  // Computers per project, from the list this page holds (it is a count to show and a link, never the delete check).
  const byProject = useMemo(() => {
    const m = new Map<string, Computer[]>();
    for (const c of computers ?? []) m.set(c.project_id, [...(m.get(c.project_id) ?? []), c]);
    return m;
  }, [computers]);

  const columns = useMemo(
    () => [
      col.accessor('name', {
        header: t('proj.col.name'),
        meta: { pinned: true, label: t('proj.col.name') },
        cell: (x) => (
          <span className={s.row}>
            <ProjectDot color={x.row.original.color} />
            <strong>{x.getValue()}</strong>
            {x.row.original.is_default ? <Tag>{t('proj.default')}</Tag> : null}
            {x.row.original.outside ? <OutsideTag /> : null}
            <SharedTag project={x.row.original} />
          </span>
        ),
      }),
      col.display({
        id: 'computers',
        header: t('proj.col.computers'),
        meta: { width: '140px', label: t('proj.col.computers') },
        cell: (x) => {
          if (!computers) return <span className={s.faint}>—</span>;
          const n = byProject.get(x.row.original.id)?.length ?? 0;
          return n === 0 ? (
            <span className={s.faint}>{t('count.computers', { count: 0 })}</span>
          ) : (
            <Link variant="nav" href={`/computers?project=${encodeURIComponent(handleOf(x.row.original))}`}>
              {t('count.computers', { count: n })} {t('nav.more')}
            </Link>
          );
        },
      }),
      col.display({
        id: 'realms',
        header: t('proj.col.realms'),
        meta: { width: '220px', priority: 3, label: t('proj.col.realms') },
        cell: (x) => <RealmChips ids={x.row.original.realm_ids ?? []} realms={realms} />,
      }),
      col.display({
        id: 'access',
        header: t('proj.col.perms'),
        meta: { width: '200px', label: t('proj.col.perms') },
        cell: (x) => (
          <span className={s.nowrapRow}>
            <RulesFact project={x.row.original} account={account} />
            <span className={s.faint} aria-hidden="true">·</span>
            <PeopleFact project={x.row.original} account={account} />
          </span>
        ),
      }),
    ],
    [t, computers, byProject, realms, account],
  );

  const view = useDataView<Project>({
    rows: projects,
    columns,
    getRowId: handleOf,
    isLoading: loading,
    error,
    search: ['name'],
    sort: 'name',
    param: 'p',
  });

  const deleteWhy = (p: Project): string | undefined => {
    if (p.is_default) return t('proj.deleteDefault');
    if (!computers) return t('proj.deleteLoading');
    const n = byProject.get(p.id)?.length ?? 0;
    return n > 0 ? t('proj.deleteHas', { count: n }) : undefined;
  };

  return (
    <>
      <DataTable
        label={t('proj.title')}
        countLabel={(n) => t('count.projects', { count: n })}
        view={view}
        columns={columns}
        onRetry={onRetry}
        onRefresh={onRetry}
        search={t('proj.search')}
        presentation={present === 'cards' ? 'cards' : 'auto'}
        // Header band: the name and the row menu share the card's top band.
        cardShape="band"
        presentChoice={{ value: present, onChange: setPresent }}
        fill={false}
        empty={<EmptyState icon="computer" title={t('proj.empty')} body={t('proj.emptyBody')} />}
        noViewMenu
        actions={(p) => {
          const may = projectActions(levels.get(p.id) ?? 'unknown');
          const why = deleteWhy(p);
          return [
            // Permissions only reads, so a read-only row offers it too.
            { id: 'perms', label: t('pp.open'), icon: 'lock' as const, opens: true, onAction: () => setOpen({ kind: 'perms', p }) },
            ...(p.readOnly ? [] : [
            ...(canUpdate && may.rename ? [{ id: 'rename', label: t('proj.rename'), icon: 'pen' as const, opens: true, onAction: () => setOpen({ kind: 'rename', p }) }] : []),
            ...(canDelete && may.delete
              ? [{ id: 'delete', label: t('proj.delete'), icon: 'trash' as const, tone: 'danger' as const, opens: true, isDisabled: why !== undefined, disabledReason: why, onAction: () => setOpen({ kind: 'delete', p }) }]
              : []),
            ]),
          ];
        }}
      />
      <ProjectDrawer
        isOpen={newOpen || open?.kind === 'rename'}
        project={open?.kind === 'rename' ? open.p : null}
        projects={projects}
        onClose={() => {
          setOpen(null);
          onNewClose();
        }}
        onDone={onRetry}
      />
      <DeleteProject project={open?.kind === 'delete' ? open.p : null} onClose={() => setOpen(null)} onDone={onRetry} />
      <ProjectPerms
        project={open?.kind === 'perms' ? open.p : null}
        computers={open?.kind === 'perms' ? byProject.get(open.p.id) ?? [] : []}
        onDeleteExpired={onDeleteExpired}
        onClose={() => setOpen(null)}
      />
    </>
  );
}
