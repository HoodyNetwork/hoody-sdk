// The Workflows page: a list-detail page on useDataView.
// The list searches name and summary, filters by where a workflow comes from, sorts, pages, and keeps the open row
// in the URL (q, origin, sort, page, sel), so reload, Back and a deep link restore it. The open workflow's detail
// is beside it (Graph.tsx). A row the next read no longer lists says so instead of showing another one.
// From is the long origin word with a tip saying what it means, Steps reads "5 steps", and
// a list row's line 2 reads "Comes with the agent · 5 steps". A workflow hidden from the agent's list (known only with
// the agent's workflow_hidden capability) carries a Hidden tag.
// New workflow is the header's primary, and Make a copy… in a detail's "..." opens the same drawer (New.tsx) on a
// copy. A create whose answer was lost shows above the list as a warn Band until Check again proves it or it is no
// longer tracked; a create proved (answered or checked) opens its workflow.
// The header says what a workflow is and how one runs (wf.desc), on the list and under All realms, and the
// empty list says how to make one.
import { createColumnHelper, DataTable, EmptyState, ListDetailPage, Tag, useDataView, useSearchParam, useStrings } from '@kit';
import { isRealmOrGlobal, useCurrentComputer, useRealms } from '@core';
import { useMemo, useState } from 'react';
import { useAiRealm } from '../../aiRealm';
import { refreshWorkflows, useWorkflowList } from './data';
import { WorkflowDetail } from './Graph';
import { HeldCreates, NewWorkflow } from './New';
import newStrings from './New.strings.en.json';
import type { Origin, Workflow } from './logic';
import { AllRuns, RunsViewSwitch, type ChatHref } from './Runs';
import { useRunLeases, useRuns } from './runsData';
import strings from './strings.en.json';

const col = createColumnHelper<Workflow>();
const ORIGINS: readonly Origin[] = ['yours', 'project', 'system', 'customized'];

/** One computer's workflows in the realm shown (`realm` null) or the one named. `computer` names it in sentences;
 *  `chatHref` links a run to its chat (without it the run names the chat). */
export function Workflows({ computer, realm = null, chatHref }: { computer: string; realm?: string | null; chatHref?: ChatHref }) {
  const t = useStrings(strings);
  const target = useCurrentComputer();
  const shown = useRealms().selected;
  const ai = useAiRealm();
  const [mode] = useSearchParam('view');
  // The realm the list, a workflow's create and the drawers name: the one given, else under All realms the computer's own
  // (aiRealm.ts: Global for a computer in no realm, its one realm), else the realm shown (null). All runs keeps reading
  // the realm shown (every realm under All realms).
  const named = realm ?? (shown === 'all' && isRealmOrGlobal(ai.realm) ? ai.realm : null);
  // Workflows belong to one realm: with none to name under All realms (a computer in several realms) the list read is
  // refused before it is sent (AGENT_REALM_REQUIRED), so the page asks for a realm and reads nothing; while the computer's
  // realms are read it is loading. All runs reads every realm and stays reachable through the
  // view switch.
  const refused = named === null && !!target && !isRealmOrGlobal(shown);
  if (refused && mode !== 'runs') {
    const header = { title: t('wf.title'), subtitle: t('wf.desc'), actions: <RunsViewSwitch /> };
    if (ai.deciding) return <ListDetailPage mode="fill" header={header} state={{ kind: 'loading' }} list={null} detail={null} />;
    return <ListDetailPage mode="fill" header={header} state={{ kind: 'notHere', icon: 'realm', title: t('wf.allRealms.title'), body: t('wf.allRealms.body') }} list={null} detail={null} />;
  }
  return <WorkflowsIn computer={computer} realm={named} runsRealm={realm} chatHref={chatHref} listRead={!refused} />;
}

/** `listRead` false: the one-realm list read would be refused (only All runs gets here then), so it is not made.
 *  `runsRealm`: the realm the runs are read in (null: the realm shown), which `realm` may name more narrowly. */
function WorkflowsIn({ computer, realm, runsRealm, chatHref, listRead }: { computer: string; realm: string | null; runsRealm: string | null; chatHref: ChatHref | undefined; listRead: boolean }) {
  const t = useStrings(strings);
  const tn = useStrings(newStrings);
  const read = useWorkflowList(realm, listRead);
  // The New workflow drawer: closed (null), blank ({}), or on a copy of a listed workflow.
  const [creating, setCreating] = useState<{ copyOf?: string } | null>(null);
  // The runs of every workflow, read once for the detail and for All runs; the running ones keep their chats open.
  const runs = useRuns(runsRealm);
  const pins = useRunLeases(runs.list?.runs, undefined, runs.readAt, runs.list?.skipped ?? 0);
  const [mode] = useSearchParam('view');
  const columns = useMemo(
    () => [
      col.accessor('name', {
        header: t('wf.col.name'),
        cell: (c) => (c.row.original.hidden ? <>{c.getValue()} <Tag tip={t('wf.hiddenTip')}>{t('wf.hidden')}</Tag></> : c.getValue()),
        meta: { pinned: true },
      }),
      col.accessor('origin', {
        header: t('wf.col.origin'),
        cell: (c) => <Tag tip={t(`wf.originTip.${c.getValue()}`)}>{t(`wf.originTag.${c.getValue()}`)}</Tag>,
        meta: { width: '240px', priority: 2, list: false },
      }),
      // Line 2 of a list row: where it comes from, in words (the table's From column holds the tag).
      col.accessor('origin', { id: 'from', header: t('wf.col.origin'), cell: (c) => t(`wf.originTag.${c.getValue()}`), enableSorting: false, meta: { table: false, list: 'meta' } }),
      col.accessor('stepCount', { header: t('wf.col.steps'), cell: (c) => t('wf.steps', { count: c.getValue() }), meta: { align: 'end', width: '96px', priority: 3, list: 'meta' } }),
      col.accessor('summary', { header: t('wf.col.summary'), enableSorting: false, meta: { priority: 4, list: false } }),
    ],
    [t],
  );
  const view = useDataView<Workflow>({
    rows: read.data as Workflow[] | undefined,
    columns,
    getRowId: (w) => w.name,
    search: ['name', 'summary'],
    filters: [{ id: 'origin', label: t('wf.filter.origin'), value: (w) => w.origin, options: ORIGINS.map((o) => ({ value: o, label: t(`wf.origin.${o}`) })) }],
    sort: 'name',
    pageSize: 50,
    isLoading: read.isPending,
    error: read.error,
  });
  const open = view.activeId === undefined ? undefined : read.data?.find((w) => w.name === view.activeId);
  if (mode === 'runs') return <AllRuns runs={runs} pins={pins} chatHref={chatHref} />;
  const created = (name: string) => { setCreating(null); view.open(name); };
  return (
    <>
    <ListDetailPage
      mode="fill"
      storageKey="ai-workflows"
      header={{ title: t('wf.title'), subtitle: t('wf.desc'), actions: <RunsViewSwitch />, primary: { label: tn('new.button'), icon: 'plus', onPress: () => setCreating({}) } }}
      toolbar={<HeldCreates computer={computer} realm={realm} onCreated={(name) => view.open(name)} />}
      list={
        <DataTable
          label={t('wf.title')}
          columns={columns}
          view={view}
          onRetry={read.refetch}
          onRefresh={refreshWorkflows}
          noMatch={t('wf.noMatch')}
          countLabel={(n) => t('wf.count', { count: n })}
          onRowAction={(w) => view.open(w.name)}
          storageKey="ai-workflows"
          empty={<EmptyState icon="reload" title={t('wf.empty.title')} body={t('wf.empty.body')} />}
        />
      }
      detail={
        view.activeId === undefined ? null : open ? (
          <WorkflowDetail workflow={open} readAt={read.readAt} computer={computer} runs={runs} chatHref={chatHref} onCopy={(name) => setCreating({ copyOf: name })} />
        ) : read.data ? (
          <EmptyState size="sm" title={t('wf.gone', { computer })} />
        ) : null
      }
    />
    {creating && (
      <NewWorkflow computer={computer} realm={realm} listed={read.data} {...(creating.copyOf ? { copyOf: creating.copyOf } : {})} onClose={() => setCreating(null)} onCreated={created} />
    )}
    </>
  );
}
