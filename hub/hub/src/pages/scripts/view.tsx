// The scripts page: a list/detail layout. The list is a DataTable of every script on every ready computer; the
// selection (computer handle ~ path) and the tab live in the URL, so Back and deep links work. New script is a
// wizard of steps, one URL per draft (new/Flow.tsx).
import { AgentHint, ComputerRequired, EmptyState, ErrorState, ListDetailPage, useGo, usePageShortcuts, useSearchParam, useStrings, useSubPath, type PageHeaderProps } from '@kit';
import { useEffect, useMemo, useState } from 'react';
import { EXEC_DEFAULT, useAgentScopeFacts } from '@core';
import { ExecFolderProvider, useExclusive, useExec, useHeldWrites, useOverview } from './data';
import { Building, openBuild, openChange, useBuildSource, useBuilds } from './parts/Building';
import { itemId, itemKey, newKeyEnabled } from './logic';
import { useRunScript } from './parts/runScript';
import { pageFaq } from './faq';
import { Detail, Gone } from './parts/Detail';
import { DeletedDrawer } from './parts/DeletedDrawer';
import { HeldWrites } from './parts/HeldWrites';
import { FolderAdvanced, FolderChip } from './parts/Folder';
import { ScriptsList, useScriptsView } from './parts/List';
import { DraftGone, Flow, NewScriptEntry, DRAFT_ID } from './new/Flow';
import s from './parts/parts.module.css';
import strings from './strings.en.json';

export default function ScriptsPage() {
  const { exec } = useExec();
  // Every part reads the folder the page shows from here (the per-script reads, New script).
  return (
    <ExecFolderProvider value={exec}>
      <ScriptsPageIn />
    </ExecFolderProvider>
  );
}

function ScriptsPageIn() {
  const t = useStrings(strings);
  const agentFacts = useAgentScopeFacts();
  const { items: faqItems } = pageFaq(t);
  const go = useGo();
  const sub = useSubPath('/scripts');
  // The Exec folder shown (?exec=): every address this page goes to keeps it, so a script of folder 3 never opens as folder 1's.
  const { exec, bad } = useExec();
  const overview = useOverview(exec);
  const withExec = (url: string): string => (exec === EXEC_DEFAULT ? url : `${url}${url.includes('?') ? '&' : '?'}exec=${exec}`);
  const [deletedOpen, setDeletedOpen] = useState(false);
  const run = useRunScript();
  const heldWrites = useHeldWrites();

  const computers = useMemo(() => overview.data?.computers ?? [], [overview.data]);
  const items = overview.items;
  const { view, columns } = useScriptsView(items, computers, overview.isPending, overview.error);
  const sel = view.activeId;
  const select = (id: string | undefined) => view.open(id);
  const selected = items?.find((i) => i.id === sel);
  const comp = selected ? computers.find((c) => c.id === selected.compId) : undefined;
  const canCreate = computers.some((c) => c.state === 'on' && !c.err && c.caps?.revisions);
  // Read only for a folder other than 1 (no extra request on an ordinary visit), while the shown computer is on and readable.
  const exclusive = useExclusive(exec, exec !== EXEC_DEFAULT && computers.some((c) => c.state === 'on' && !c.err));
  const deletedCount = computers.reduce((n, c) => n + (c.deleted?.length ?? 0), 0);
  const reload = () => overview.refetch();
  // A delete request (`delete=1`) belongs to the script it was made for and is consumed by that script's page. When that script is not
  // shown (it is gone, or the person went back to the list), the request is dropped: it must not wait for the next script opened.
  const [deleteParam, setDeleteParam] = useSearchParam('delete');
  const detailShown = !!(selected && comp);
  useEffect(() => {
    if (deleteParam !== undefined && items && !detailShown) setDeleteParam(undefined, { replace: true });
  }, [deleteParam, items, detailShown, setDeleteParam]);

  usePageShortcuts([{ key: 'n', label: t('cmd.new'), run: () => go(withExec('/scripts/new')), enabled: newKeyEnabled(canCreate, sub) }]);
  // Being built: this browser's New script builds, shown on both views below (no computer ready, and the list)
  // and read only while one of them is shown.
  const buildsShown = sub[0] !== 'new';
  const buildSrc = useBuildSource(buildsShown);
  const builds = useBuilds(buildSrc.io, buildSrc.computers, buildsShown, buildSrc.refetch);
  const building = () => <Building view={builds} onOpen={(l) => openBuild(l, go)} onOpenChange={(a) => openChange(a, buildSrc.computers, go)} />;

  // New script as steps: /scripts/new mints a draft and replaces its URL; /scripts/new/<draftId> is the flow.
  if (sub[0] === 'new' && sub[1] === undefined) return <NewScriptEntry />;
  if (sub[0] === 'new' && DRAFT_ID.test(sub[1] ?? '')) {
    return (
      <Flow
        key={sub[1]}
        draftId={sub[1] as string}
        computers={computers}
        read={overview.data ? undefined : overview.isError ? { state: 'failed', error: overview.error, retry: () => void overview.refetch() } : overview.isPending ? { state: 'loading' } : undefined}
        taken={(items ?? []).map((i) => i.route)}
        onCancel={() => go(withExec('/scripts'))}
        onAnother={() => go(withExec('/scripts/new'))}
        onOpen={(handle, path, tab) => {
          reload();
          const sel = `sel=${encodeURIComponent(itemId(handle, path))}`;
          go(withExec(`/scripts?${sel}${tab ? `&tab=${tab}` : ''}`));
        }}
      />
    );
  }
  if (sub[0] === 'new') return <DraftGone onNew={() => go(withExec('/scripts/new'))} onScripts={() => go(withExec('/scripts'))} />;

  const header: PageHeaderProps = {
    title: t('title'),
    subtitle: t('subtitle'),
    actions: (
      <>
        <FolderChip exec={exec} />
        <AgentHint page="scripts" facts={agentFacts} />
      </>
    ),
    primary: canCreate && (items?.length ?? 0) > 0 ? { label: t('action.new'), icon: 'plus', onPress: () => go(withExec('/scripts/new')) } : undefined,
  };

  // A save whose answer was lost, on any computer: shown here whichever computer is on (Home's Check links here), and above
  // ComputerRequired too, where its Check reads the save's own computer and keeps it when that cannot answer.
  const heldBanner = heldWrites.rows.length + heldWrites.unnamed.length > 0 ? <HeldWrites held={heldWrites} computers={computers} /> : undefined;

  // Nothing to list without a computer that is on: the shell's state says so, with this page's header. A computer that is
  // on but did not answer is not "No computer selected": it says so, with Try again.
  if (!overview.isPending && !overview.error && !computers.some((c) => c.state === 'on' && !c.err)) {
    const silent = computers.filter((c) => c.state === 'on' && c.err === 'unreachable');
    return (
      <div className={s.page}>
        {silent.length > 0 ? (
          <ComputerRequired
            state="failed"
            header={{ title: t('title'), subtitle: t('subtitle') }}
            title={silent.length === 1 ? t('noAnswer.title', { name: silent[0]!.name }) : t('noAnswer.titleMany')}
            body={t('noAnswer.body')}
            onRetry={() => void overview.refetch()}
            top={heldBanner ? <>{heldBanner}{building()}</> : building()}
          />
        ) : (
          <ComputerRequired state={computers.some((c) => c.state !== 'on') ? 'stopped' : 'none'} header={{ title: t('title'), subtitle: t('subtitle') }} top={heldBanner ? <>{heldBanner}{building()}</> : building()} />
        )}
      </div>
    );
  }

  const list = (
    <ScriptsList
      view={view}
      columns={columns}
      items={items}
      computers={computers}
      onRetry={() => void overview.refetch()}
      canCreate={canCreate}
      deletedCount={deletedCount}
      onDeleted={() => setDeletedOpen(true)}
      onNew={() => go(withExec('/scripts/new'))}
      exec={exec}
      notice={bad !== null ? t('folder.bad', { name: bad }) : null}
      building={building()}
      foot={<FolderAdvanced exec={exec} bad={bad} exclusive={exclusive} onOpen={(n) => go(n === EXEC_DEFAULT ? '/scripts' : `/scripts?exec=${n}`)} />}
      onAction={(i, a) => {
        if (a === 'open') select(i.id);
        else if (a === 'test') go(withExec(`/scripts?sel=${encodeURIComponent(i.id)}&tab=test`));
        else if (a === 'toggle') go(withExec(`/scripts?sel=${encodeURIComponent(i.id)}&tab=settings`));
        else if (a === 'delete') go(withExec(`/scripts?sel=${encodeURIComponent(i.id)}&tab=settings&delete=1`));
        else if (a === 'ai') go(withExec(`/scripts?sel=${encodeURIComponent(i.id)}&ai=1`));
        else if (a === 'run') run(i);
      }}
    />
  );

  const drawer = <DeletedDrawer isOpen={deletedOpen} comps={computers} onClose={() => setDeletedOpen(false)} onRestored={reload} />;

  // No wrapper: ListDetailPage fills the main area's height itself (height: 100%), as on the other list/detail pages.
  // A wrapper without a height would let the page grow to its content, and the main area would scroll instead of the detail.
  return (
    <>
      <ListDetailPage
        storageKey="scripts"
        faq={{ items: faqItems }}
        header={header}
        // Saves not confirmed, whatever brought the person here (Home's Needs you, or this page on its own), each with its Check.
        banner={heldBanner}
        list={overview.isError && !items ? <div className={s.listWrap}>{building()}<ErrorState onRetry={() => void overview.refetch()} /></div> : list}
        detail={
          selected && comp ? (
            <Detail
              key={itemKey(selected)}
              item={selected}
              comp={comp}
              onChanged={reload}
              onDeleted={() => {
                select(undefined);
                reload();
              }}
            />
          ) : sel !== undefined && items ? (
            <Gone onBack={() => select(undefined)} />
          ) : null
        }
      />
      {drawer}
    </>
  );
}

export { EmptyState };
