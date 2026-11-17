// The vault page (list/detail): one partition at a time, set by the top bar's realm like every other page: a realm
// shows its own entries, "All realms" the Global ones (the vault has no 'all' partition), with a line pointing at
// the top bar. The page has no picker of its own; an old link's ?in= is dropped once, never obeyed (pages never
// switch the realm).
// The list shows names and metadata only; a value is read only from an entry's own Show value (parts/Entry).
//
// Changing the partition closes the open entry and the drawer and moves the page's epoch, so a write that was
// getting ready sends nothing. Held changes of every partition show on top (parts/Holds).
import {
  ActionMenu,
  AgentHint,
  Band,
  Button,
  DataTable,
  EmptyState,
  ListDetailPage,
  NoAccessState,
  Stack,
  StatStrip,
  StatusPill,
  statusPillMetrics,
  createColumnHelper,
  formatBytes,
  formatDateTime,
  useDataView,
  useDrawerParam,
  useSearchParam,
  useShellData,
  useStrings,
} from '@kit';
import { hostEnv, realmLabel, useAgentScopeFacts, useRealms } from '@core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { moveEpoch, problemOf, takeLeftImportReports, useIsAccount, useVaultHolds, useVaultList, useVaultStats, type Change } from './data';
import { GLOBAL, isHoodyKey, keyProblem, looksEncrypted, partitionOf, type Partition, type VaultRow } from './logic';
import { ClearDialog } from './parts/ClearDialog';
import { pageFaq } from './faq';
import { ExportDialog } from './parts/ExportDialog';
import { ImportDialog } from './parts/ImportDialog';
import { EditDrawer } from './parts/EditDrawer';
import { Entry } from './parts/Entry';
import { Holds } from './parts/Holds';
import { changeText, rateUntil, useCountdown } from './parts/words';
import strings from './strings.en.json';

const col = createColumnHelper<VaultRow>();
const REPLACE = 'replace:';

/** The way out of a blocked state: the shell's own Sign out (the account menu's), or nothing when the shell has none. */
function SignOutAction() {
  const t = useStrings(strings);
  const { signOut } = useShellData();
  if (!signOut) return null;
  return (
    <Button icon="logout" onPress={signOut}>
      {t('access.signOut')}
    </Button>
  );
}

/** A partition's name as people see it: "Global", or the realm's nickname (else its short id). */
function useNameOf(): (p: Partition) => string {
  const t = useStrings(strings);
  useRealms(); // re-render when a nickname changes
  return (p) => {
    if (p === GLOBAL) return t('partition.global');
    const n = realmLabel(p);
    return 'text' in n ? n.text : p;
  };
}

export default function VaultPage() {
  const t = useStrings(strings);
  const isAccount = useIsAccount();
  const agentFacts = useAgentScopeFacts(null);
  if (!isAccount) {
    return (
      <ListDetailPage
        header={{ title: t('title'), subtitle: t('subtitle'), actions: <AgentHint page="vault" facts={agentFacts} /> }}
        list={<NoAccessState title={t('token.title')} body={t('token.body')} action={<SignOutAction />} />}
        detail={null}
      />
    );
  }
  return <AccountVault />;
}

function AccountVault() {
  const t = useStrings(strings);
  const { items } = pageFaq(t);
  const realms = useRealms();
  const agentFacts = useAgentScopeFacts(null);
  const nameOf = useNameOf();
  const [inParam, setIn] = useSearchParam('in');
  const partition: Partition = partitionOf(realms.selected) ?? GLOBAL;
  const allRealms = partitionOf(realms.selected) === null;
  const partitionName = nameOf(partition);

  const list = useVaultList(partition);
  const stats = useVaultStats(partition);
  const holds = useVaultHolds();
  // ?edit=new is New; ?edit=replace:<name> is Replace (':' is outside the name alphabet, so an entry named
  // `new` is never read as New). Anything else opens nothing.
  const [editing, openEdit, closeEdit] = useDrawerParam('edit');
  const editKey = editing?.startsWith(REPLACE) ? editing.slice(REPLACE.length) : undefined;
  const editOpen = editing === 'new' || (editKey !== undefined && keyProblem(editKey) === null);
  // A saved entry to open once its drawer has closed: the close may step back in history, which lands later, so
  // opening it at once would race the close (and the drawer's guard would ask to discard what was just saved).
  const [openAfterClose, setOpenAfterClose] = useState<string | null>(null);
  // Replace opened from an entry's "Encrypt…" row starts with "Encrypt with a password" ticked. Page state only (never in
  // the URL): a reload or a shared link opens the plain Replace form.
  const [encryptFirst, setEncryptFirst] = useState(false);
  useEffect(() => {
    // The drawer closed: the next Replace, however it opens, starts unticked.
    if (editing === undefined) setEncryptFirst(false);
  }, [editing]);
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Import: the kit Dialog closes itself at a context end (a realm switch), and a run cut short reports below.
  const [importing, setImporting] = useState(false);
  // What each import cut short by a close or a realm switch did (counts and names only). Kept across the switch, one
  // band per run: a late report of an earlier run adds its own, never replaces a newer one.
  const [importReports, setImportReports] = useState<readonly string[]>([]);
  const addImportReport = useCallback((text: string) => setImportReports((r) => [...r, text]), []);
  // One whose dialog was gone when its result came (the person left the page mid-run; ImportDialog keeps it in data.ts):
  // shown on return, or as it comes when the run settles after the person came back.
  useEffect(() => takeLeftImportReports(addImportReport), [addImportReport]);
  // The last export's file name and entry count (a name and a number only, never a value).
  const [exported, setExported] = useState<{ file: string; count: number } | null>(null);
  const [clearResult, setClearResult] = useState<Change | null>(null);
  // A 429 on Clear: Clear waits out the Retry-After (kept here, the dialog closes after a press).
  const [clearUntil, setClearUntil] = useState<number | null>(null);
  const clearLeft = useCountdown(clearUntil);
  // Keys this view has seen as an envelope (the lock hint): names only, for this partition only.
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());

  const columns = useMemo(
    () => [
      col.accessor('key', { header: t('col.name'), meta: { pinned: true } }),
      col.accessor((r) => (looksEncrypted(r, seen) ? 0 : 1), {
        id: 'lock',
        header: t('col.lock'),
        // Sized to its pill's words (as web and terminal draw them), not a fixed 150 px: the terminal then keeps Kind and Size.
        meta: { size: 'fit', fitText: (r: VaultRow) => (looksEncrypted(r, seen) ? t('lock.yes') : t('lock.no')), fitMetrics: statusPillMetrics(true), priority: 1 },
        cell: (c) => (looksEncrypted(c.row.original, seen) ? <StatusPill tone="ok">{t('lock.yes')}</StatusPill> : <StatusPill tone="neutral">{t('lock.no')}</StatusPill>),
      }),
      col.accessor((r) => (isHoodyKey(r.key) ? 0 : 1), {
        id: 'kind',
        header: t('col.kind'),
        meta: { size: 'fit', fitText: (r: VaultRow) => (isHoodyKey(r.key) ? t('kind.hoody') : t('kind.own')), priority: 3 },
        cell: (c) => (isHoodyKey(c.row.original.key) ? t('kind.hoody') : t('kind.own')),
      }),
      col.accessor('size_bytes', { header: t('col.size'), cell: (c) => formatBytes(c.getValue()), meta: { align: 'end', width: '104px', priority: 4 } }),
      col.accessor('updated_at', { header: t('col.updated'), cell: (c) => (c.getValue() ? formatDateTime(c.getValue()) : '—'), meta: { width: '200px', priority: 2 } }),
    ],
    [t, seen],
  );

  const problem = list.error ? problemOf(list.error) : null;
  const view = useDataView<VaultRow>({
    rows: list.data,
    columns,
    getRowId: (r) => r.key,
    search: ['key'],
    filters: [
      // Two questions, two filters: whether an entry is marked encrypted, and whose it is. One filter for both hid
      // every hoody.* entry from "Encrypted" and "Not marked". New ids, so a link holding the old combined value reads
      // no filter instead of an empty list.
      {
        id: 'lock',
        label: t('filter.lock'),
        value: (r) => (looksEncrypted(r, seen) ? 'encrypted' : 'plain'),
        options: [
          { value: 'encrypted', label: t('filter.encrypted') },
          { value: 'plain', label: t('filter.plain') },
        ],
      },
      {
        id: 'whose',
        label: t('filter.whose'),
        value: (r) => (isHoodyKey(r.key) ? 'hoody' : 'own'),
        options: [
          { value: 'own', label: t('kind.own') },
          { value: 'hoody', label: t('filter.hoody') },
        ],
      },
    ],
    sort: 'key',
    pageSize: 50,
    isLoading: list.isPending,
    error: list.error,
    context: partition,
  });

  // The page's old partition parameter: the top bar decides now, so a link carrying it loses it, once.
  useEffect(() => {
    if (inParam !== undefined) setIn(undefined, { replace: true });
  }, [inParam, setIn]);

  useEffect(() => {
    if (openAfterClose === null || editing !== undefined) return;
    setOpenAfterClose(null);
    view.open(openAfterClose);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the close has landed, not on every view change
  }, [openAfterClose, editing]);

  // A partition change (a realm switch in the top bar): the open entry, the drawer and anything
  // getting ready belong to the old one. Not on the first render: a drawer opened by the URL keeps its epoch.
  const shownPartition = useRef(partition);
  useEffect(() => {
    if (shownPartition.current === partition) return;
    shownPartition.current = partition;
    moveEpoch();
    setSeen(new Set());
    setClearResult(null);
    setClearUntil(null);
    setClearing(false);
    setExporting(false);
    setExported(null);
    setOpenAfterClose(null);
    closeEdit();
    view.open(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a partition change closes them
  }, [partition]);

  const current = list.data?.find((r) => r.key === view.activeId);
  // While a detail shows, every hold shows in it, the open entry's first: a narrow page (or Hide list) puts the
  // list and its toolbar off screen, and after a held save's drawer closes the banner is the hold's one place.
  const aboutOpen = (h: (typeof holds)[number]) => !!current && h.id.partition === partition && h.id.op !== 'clear' && h.id.key === current.key;
  const detailShown = view.activeId !== undefined && (!!current || !!list.data);
  const detailHolds = [...holds.filter(aboutOpen), ...holds.filter((h) => !aboutOpen(h))];
  const isEmpty = list.data?.length === 0;
  // One way into the import, from the More menu and from the empty vault alike: a new run starts with no old report.
  const openImport = () => {
    setImportReports([]);
    setImporting(true);
  };
  const s = stats.data;
  const clearRateOver = clearResult?.outcome === 'failed' && clearResult.problem.kind === 'rate' && clearLeft === 0;
  const clearText = clearResult && !clearRateOver ? changeText(t, clearResult, clearLeft) : null;

  // A 403 points at the top bar: the login may have the vault of another realm, or of Global ("All realms").
  if (problem?.kind === 'forbidden') {
    return (
      <ListDetailPage
        header={{ title: t('title'), subtitle: t('subtitle'), actions: <AgentHint page="vault" facts={agentFacts} /> }}
        toolbar={
          // Holds stay reachable here too: Stop watching needs no read of the refused partition.
          <Stack gap={2}>
            <p>{t('partition.pickOther')}</p>
            <Holds holds={holds} nameOf={nameOf} />
          </Stack>
        }
        list={<NoAccessState title={t('forbidden.title')} body={t('forbidden.body', { name: partitionName })} action={<SignOutAction />} />}
        detail={null}
      />
    );
  }

  return (
    <>
      <ListDetailPage
        storageKey="vault"
        faq={{ items }}
        header={{
          title: t('title'),
          subtitle: t('subtitle'),
          primary: isEmpty ? undefined : { label: t('action.new'), icon: 'plus', onPress: () => openEdit('new') },
          // The agent hint shows in every state, in the header's actions as on every page; More is the header's own ⋯
          // (PageHeader `menu`), apart from it and only while the vault has entries.
          actions: <AgentHint page="vault" facts={agentFacts} />,
          menu:
            list.data && list.data.length > 0 ? (
              <ActionMenu
                label={t('action.more')}
                items={[
                  // Export saves a file to the device (exportVault.ts saveExport: a download link). A terminal has no
                  // download, so the item is left out there rather than fail after every value was read.
                  ...(hostEnv().browserPage === true
                    ? [{ id: 'export', label: t('action.export'), icon: 'download' as const, opens: true, onAction: () => setExporting(true) }]
                    : []),
                  {
                    id: 'import',
                    label: t('action.import'),
                    icon: 'upload',
                    opens: true,
                    onAction: openImport,
                  },
                  {
                    id: 'clear',
                    label: t('action.clear'),
                    tone: 'danger',
                    opens: true,
                    isDisabled: clearLeft > 0,
                    disabledReason: t('problem.rateButton', { seconds: clearLeft }),
                    onAction: () => setClearing(true),
                  },
                ]}
              />
            ) : undefined,
        }}
        toolbar={
          <Stack gap={3}>
            {/* Beside a detail the rail keeps one line naming whose entries these are. */}
            <p>
              {partition === GLOBAL
                ? t(detailShown ? 'partition.lineGlobal' : 'partition.noteGlobal')
                : t(detailShown ? 'partition.lineRealm' : 'partition.noteRealm', { name: partitionName })}
            </p>
            {!detailShown && allRealms && <p>{t('partition.pickHint')}</p>}
            {s && !detailShown && (
              <StatStrip
                label={t('stats.label')}
                items={[
                  { label: t('stats.entries'), value: s.totalKeys },
                  { label: t('stats.size'), value: formatBytes(s.totalBytes) },
                  { label: t('stats.used'), value: `${Math.round(s.usedPercent)}%`, detail: t('stats.usedDetail', { limit: s.limitMb }) },
                ]}
              />
            )}
            {!detailShown && <Holds holds={holds} nameOf={nameOf} />}
            {clearText && <Band tone="warn" error={clearResult?.outcome === 'failed' ? clearResult.error : undefined} /* noDetails: only a failed clear (refused by the API, or by core before sending) carries a rejection; held and stale have none */>{clearText}</Band>}
            {exported && <Band tone="neutral">{t('export.done', { file: exported.file, count: exported.count })}</Band>}
            {importReports.map((text, i) => (
              // The list only grows or clears, so the index is each band's own.
              <Band key={i} tone="warn" /* noDetails: counts and names of a cut-short import */>
                {text}
              </Band>
            ))}
          </Stack>
        }
        list={
          <DataTable
            label={t('title')}
            columns={columns}
            view={view}
            onRetry={() => void list.refetch()}
            onRefresh={() => void list.refetch()}
            noMatch={t('noMatch')}
            countLabel={(n) => t('count', { count: n })}
            onRowAction={(r) => view.open(r.key)}
            storageKey="vault"
            empty={
              <EmptyState
                icon="lock"
                title={t('empty.title')}
                body={t('empty.body')}
                action={
                  <Button variant="primary" icon="plus" onPress={() => openEdit('new')}>
                    {t('action.new')}
                  </Button>
                }
                secondary={<Button variant="secondary" icon="upload" onPress={openImport}>{t('empty.import')}</Button>}
              />
            }
          />
        }
        detail={
          view.activeId === undefined ? null : current ? (
            <Entry
              key={`${partition}\u0000${current.key}`}
              row={current}
              partition={partition}
              partitionName={partitionName}
              seen={seen}
              holds={detailHolds}
              nameOf={nameOf}
              onSeenEncrypted={(k) => setSeen((prev) => (prev.has(k) ? prev : new Set(prev).add(k)))}
              onReplace={() => openEdit(`${REPLACE}${current.key}`)}
              onEncrypt={() => {
                setEncryptFirst(true);
                openEdit(`${REPLACE}${current.key}`);
              }}
              onDeleted={() => view.open(undefined)}
            />
          ) : list.data ? (
            <Stack gap={3}>
              <Holds holds={holds} nameOf={nameOf} />
              <EmptyState icon="warn" title={t('detail.notFound')} action={<Button onPress={() => view.open(undefined)}>{t('detail.back')}</Button>} />
            </Stack>
          ) : null
        }
      />
      {editOpen && (
        <EditDrawer
          key={`${partition}\u0000${editing}`}
          partition={partition}
          partitionName={partitionName}
          {...(editKey === undefined
            ? {}
            : // Unknown until the list answered (undefined), never "none": the drawer waits before offering to edit it.
              { entryKey: editKey, encryptFirst, ...(list.data ? { metadata: list.data.find((r) => r.key === editKey)?.metadata ?? null } : {}) })}
          onClose={closeEdit}
          onSaved={(k) => {
            setOpenAfterClose(k);
            closeEdit();
          }}
        />
      )}
      <ExportDialog
        isOpen={exporting}
        onOpenChange={setExporting}
        partition={partition}
        partitionName={partitionName}
        onSaved={(file, count) => setExported({ file, count })}
      />
      <ImportDialog isOpen={importing} onOpenChange={setImporting} partition={partition} partitionName={partitionName} onReport={addImportReport} />
      <ClearDialog
        isOpen={clearing && clearLeft === 0}
        onOpenChange={setClearing}
        partition={partition}
        partitionName={partitionName}
        rows={list.data ?? []}
        waiting={clearLeft > 0}
        onResult={(c) => {
          setClearResult(c);
          setClearUntil(rateUntil(c));
        }}
      />
    </>
  );
}
