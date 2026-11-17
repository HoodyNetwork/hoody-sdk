// The Files page: browse the folders of any computer of the realm, two panes side by
// side when the page region has room for both at a usable width, otherwise one with a From / To switch. The choice
// follows the room the page has (the sidebar and the Ask dock take width too), never the viewport alone. Changes
// (New folder, Rename, Delete, Copy / Move to the other side) go through data.ts useFilesChange (core's C9 lock).
//
// Each pane picks a computer of the selected realm (its handle in `a` / `b`) and a folder (`ap` / `bp`). Its table
// is the kit data view under the pane's letter, so its search, Kind filter, sort, page and open row stay in the URL
// beside the other pane's. Every state says one thing and offers one way on: no computer, stopped, no address,
// access rules, a refused or missing folder, no answer, an empty folder, a listing too big, a folder too deep or a
// name core cannot send yet.
import {
  ActionMenu, AgentHint, Band, Button, ComputerPicker, ComputerRequired, DataTable, DropArea, EmptyState, ErrorState, Icon, IconButton, SegmentedControl, Skeleton, Stack, TablePage, TextButton, ToolbarScope, UnreachableState,
  Tabs, Breadcrumbs, copyKeyName, countryFlag, createColumnHelper, followPageLink, formatBytes, formatDateTime, useContainerNarrow, useDataView, useMedia, useGo, useIsPhone, useLiveRoute, usePageLink, usePresentation, useRefuseStrayFiles, usePathname, useSearch, useShellData, useStrings,
  type ComputerChoice, type DropTarget, type Presentation, type RowActionEntry, type RowDrag, type ShellRealm,
} from '@kit';
import { ALL_PAGES_MAX, computerHandle, useAgentScopeFacts, useCurrentComputer } from '@core';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFolderKeys } from './folderKeys';
import { useBoardAddEntry } from '../board/links';
import { useShareEntry } from './shares/entry';
import { links as computersLinks } from '../computers/links';
import { hasAddress, stateOf, useCanChange, useFilesComputers, useFolder, type ChangeIdentity, type FilesComputer, type FilesComputers } from './data';
import { HeldBand, NameDialog } from './changes';
import { DeletePlanner } from './DeletePlanner';
import { BAR_WIDTHS } from './bar';
import { pageFaq } from './faq';
import { fileKind, KIND_ICON, middleName } from './kind';
import { panesHref, panesMode, usePanesChoice, type PanesMode } from './viewmode';
import { sideBlock, transferBlock, type DeleteItem } from './plan';
import { TransferDialog, type TransferKind } from './Transfer';
import { RestDialog } from './Rest';
import { SeveralDialog } from './Several';
import transferStrings from './Transfer.strings.en.json';
import { useComputerById } from './byId';
import { PaneAskRun, useReadActions } from './ReadActions';
import { UploadButton, UploadDialog } from './Upload';
import { LinkBand } from './link/LinkBand';
import { LinkDialog } from './link/LinkDialog';
import linkStrings from './link/link.strings.en.json';
import { Transfers } from './transfers/Transfers';
import transfersStrings from './transfers/transfers.strings.en.json';
import { PcPanel } from './pc/PcPanel';
import { StoragePanel } from './StoragePanel';
import { useRememberRoutes } from './transfers/routes';
import pcStrings from './pc/pc.strings.en.json';
import { draggingRows, dropHow, endRowDrag, endRowDragFrom, FILES_ROW, rowPayloadOf, rowsNoGo, sameDrag, startRowDrag, type DragSource, type RowPayload } from './rowdrag';
import {
  blockedPath, crumbsOf, displayName, entryOk, findByHandle, handleShared, handleUnique, joinPath, paneComputer, paneHref, paneTarget, panesOf, parentOf, problemOf, startHref, type Entry, type PaneKey,
} from './logic';
import { TwoPanes } from './twoPanes';
import { PANE_MIN } from './twoPanes.pure';
import s from './files.module.css';
import strings from './strings.en.json';

const col = createColumnHelper<Entry>();
// The pane's Show choices (List is the default; Cards is not offered).
const SHOW: readonly Presentation[] = ['list', 'icons'];

/** The computer as the Board's Put on Board takes it. */
const boardComputer = (c: FilesComputer) => ({ id: c.id, project: c.project_id, server: c.server_name });

/** Crumbs shown in full up to the computer and three folders; deeper paths fold (Folder). */
const CRUMBS_MAX = 4;

/** The page region two panes need: both minima, the splitter, and the page's side insets. */
const TWO_PANES_MIN = 2 * PANE_MIN + 80;

export default function FilesPage() {
  const t = useStrings(strings);
  const ts = useStrings(transfersStrings);
  const tp = useStrings(pcStrings);
  // A file from the computer dropped where no folder takes it is refused for the page's whole life, also while no
  // folder table is shown (a failed read, a stopped computer, a blocked path).
  useRefuseStrayFiles(true);
  const go = useGo();
  const computersPage = usePageLink('computers');
  const search = useSearch();
  const computers = useFilesComputers();
  // Transfers keeps the routes of computers something moves on, for after a realm switch (transfers/routes.ts).
  useRememberRoutes(computers.rows);
  // Two panes need the room of two usable panes (TWO_PANES_MIN) in the page region; a phone always gets one.
  const isPhone = useIsPhone();
  const narrow = useContainerNarrow(TWO_PANES_MIN);
  const phone = isPhone || narrow;
  const [remembered, remember] = usePanesChoice();
  const mode = panesMode(search, remembered);
  // Storage names the computer it shows (pane A's) in the page subtitle, not in a caption under the tab strip.
  const storageOf = search.tab === 'storage' ? paneComputer(computers.rows ?? [], panesOf(search).a) : undefined;
  // The agent's prompts name the computer pane A shows (the first pane, the one a link opens): its listed row, or the id a
  // link names when the list lacks that row (the pane reads such a computer alone by its id). Neither: the prompt asks.
  const paneA = panesOf(search).a;
  const agentFacts = useAgentScopeFacts(paneComputer(computers.rows ?? [], paneA)?.id ?? paneA.id ?? null);
  const hint = <AgentHint page="files" facts={agentFacts} />;
  const header = { title: t('title'), subtitle: storageOf ? ts('storage.for', { name: storageOf.name }) : t('subtitle') };
  // The page's questions (faq.ts) show under every tab of the loaded page.
  const { items: faqItems } = pageFaq(t);

  // The computer page's link (?computer=<handle>&path=) becomes pane A, in place: only while the browser still shows
  // this page's route (useLiveRoute), so a late run, after Back or a link already moved on, replaces no other entry.
  const route = usePathname();
  const live = useLiveRoute();
  const start = startHref(search);
  useEffect(() => { if (start && live() === route) go(start, { replace: true }); }, [start, go, live, route]);
  if (start) return null;

  // Tabs: Browse (the panes), Storage, Transfers and Use from your PC, the open one in `tab=`
  // (Browse leaves it clean). One strip for the loaded page and for the read before it.
  // The items stay a literal on the one <Tabs> below: the search index reads them there (scripts/search-index-gen.ts TAB_HOSTS).
  const strip = (body: ReactNode) => (
    <Tabs param="tab" label={ts('tabs.label')} items={[{ id: 'browse', label: ts('tab.browse') }, { id: 'storage', label: ts('tab.storage') }, { id: 'transfers', label: ts('tab.transfers') }, { id: 'pc', label: tp('tab.pc') }]}>
      {body}
    </Tabs>
  );
  // A page that shows no panes (the list failed with nothing kept, or the realm has none) drops a link's asks unacted.
  const dropAsks = (['a', 'b'] as const).map((k) => <PaneAskRun key={k} at="-" ask={{ pane: k, entries: undefined, settled: true, unsure: true }} />);
  // A failed read with nothing usable kept is the page's failure; with rows kept, a band says they may be old.
  if (computers.failed && (computers.rows === null || computers.rows.length === 0)) return <>{dropAsks}<ComputerRequired state="failed" header={header} title={t('list.failed')} body={t('list.failedBody')} onRetry={computers.retry} /></>;
  // The strip is drawn while the list is read too, so the header hands its line to it from the first frame. The one
  // page below serves both, so React keeps the same strip when the list arrives.
  const loading = computers.rows === null;
  // Transfers still opens in a realm without computers: transfers stay listed under their computer.
  if (computers.rows !== null && computers.rows.length === 0 && computers.complete && search.tab !== 'transfers') return <>{dropAsks}<ComputerRequired state="none" header={header} title={t('none.title')} body={t('none.body')} action={computersPage ? <Button onPress={() => (computersPage.kind === 'hub' ? go(computersLinks.list) : followPageLink(computersPage, go))}>{t('none.action')}</Button> : null} /></>;

  const side: PaneKey = search.side === 'b' ? 'b' : 'a';
  const panes = (['a', 'b'] as const).map((k) => <Pane key={k} pane={k} computers={computers} single={mode === 'one'} />);
  // A pane not drawn (another tab, pane B in one-pane view, the other side on a phone) drops its link's ask unacted, saying
  // so, so the ask never waits in the address to fire when the pane shows later. An id that is no id says it can't tell.
  const urls = panesOf(search);
  const otherTab = search.tab === 'storage' || search.tab === 'transfers' || search.tab === 'pc';
  const drawn: readonly PaneKey[] = otherTab ? [] : mode === 'one' ? ['a'] : phone ? [side] : ['a', 'b'];
  const hiddenAsks = (['a', 'b'] as const).filter((k) => !drawn.includes(k)).map((k) => <PaneAskRun key={k} at="-" ask={{ pane: k, entries: undefined, settled: true, unsure: urls[k].idBad, hidden: true }} />);
  // One pane or two: a direct toggle in the page header, where panes matter (Browse, and Transfers, which lists the
  // computers the panes show). One pane shows pane A alone at full width, on a phone too; pane B's address stays. Where
  // two panes do not fit side by side, Two panes shows one at a time with the From / To switch.
  const setMode = (m: PanesMode) => { remember(m); go(panesHref(search, m), { replace: true }); };
  const panesToggle = search.tab === 'storage' || search.tab === 'pc' ? undefined : (
    <SegmentedControl<PanesMode>
      label={t('view.label')}
      items={[{ id: 'one', label: t('view.one'), icon: 'pane-single' }, { id: 'two', label: t('view.two'), icon: 'pane-split' }]}
      iconOnly={isPhone}
      value={mode}
      onChange={setMode}
    />
  );
  return (
    <TablePage header={{ ...header, actions: <>{hint}{loading ? null : panesToggle}</>, tabsFollow: !computers.failed }} faq={{ items: faqItems }}>
      {loading ? [] : hiddenAsks}
      {computers.failed ? (
        <Band tone="warn" size="table" error={computers.error} actions={<TextButton onPress={computers.retry}>{t('list.retry')}</TextButton>}>
          {t('list.stale')}
        </Band>
      ) : null}
      {strip(
        loading ? (
          <Skeleton variant="table" rows={8} columns={4} />
        ) : /* The anatomy detector counts layout.explain for only the branch of this ternary with the most hits (Storage): a tab that grows past it shows up as new debt rows for its whole panel. */ search.tab === 'storage' ? (
          <StoragePanel computers={computers} />
        ) : search.tab === 'transfers' ? (
          <Transfers computers={computers} single={mode === 'one'} />
        ) : search.tab === 'pc' ? (
          <PcPanel computers={computers} />
        ) : mode === 'one' ? (
          <div className={s.onePane}>{panes[0]}</div>
        ) : phone ? (
          <div className={s.phone}>
            <SegmentedControl
              label={t('side.label')}
              fullWidth
              items={[{ id: 'a', label: t('side.a') }, { id: 'b', label: t('side.b') }]}
              value={side}
              onChange={(v) => go(sideHref(search, v), { replace: true })}
            />
            {panes[side === 'a' ? 0 : 1]}
          </div>
        ) : (
          <TwoPanes a={panes[0]} b={panes[1]} />
        ),
      )}
    </TablePage>
  );
}

/** A computer as the picker shows it: its realm (the first of its realms the shell knows), its state in words,
 *  where it runs, and its colour. Its id is the value: two computers can share a handle, never an id. */
function choiceOf(x: FilesComputer, realms: readonly ShellRealm[], t: ReturnType<typeof useStrings<typeof strings>>): ComputerChoice {
  const realm = realms.find((r) => x.realm_ids?.includes(r.id));
  const state = stateOf(x);
  return {
    id: x.id,
    name: x.name,
    ...(realm ? { realm: { name: realm.name, ...(realm.color ? { color: realm.color } : {}) } } : {}),
    running: state === 'running',
    state: t(`pick.${state}`),
    stateKind: state,
    place: [x.city, x.server_name].filter(Boolean).join(' · ') || undefined,
    flag: countryFlag(x.country) || undefined,
    ...(x.color ? { color: x.color } : {}),
  };
}

/** A pane's computer picker: in the pane's head while it shows no folder, else the root of its folder bar.
 *  Picking a computer opens its top folder in this pane. */
function PanePicker({ pane, computers, value }: { pane: PaneKey; computers: FilesComputers; value: string | undefined }) {
  const t = useStrings(strings);
  const go = useGo();
  const search = useSearch();
  const realms = useShellData().realms;
  const rows = computers.rows ?? [];
  return (
    <ComputerPicker
      // The kit names the picker by the words it shows (the computer, its realm, its state), then this (Label in Name).
      label={t('pick.label', { pane: t(pane === 'a' ? 'pane.a' : 'pane.b') })}
      className={s.picker}
      size="toolbar"
      placeholder={t('pick.placeholder')}
      computers={computers.rows === null ? undefined : rows.map((x) => choiceOf(x, realms, t))}
      value={value}
      onChange={(id) => { const x = rows.find((r) => r.id === id); if (x) go(paneHref(search, pane, paneTarget(rows, x, '/'))); }}
      status={computers.failed ? { error: computers.error, onRetry: computers.retry } : undefined}
    />
  );
}

function sideHref(search: Readonly<Record<string, string>>, side: PaneKey): string {
  const q = new URLSearchParams(search as Record<string, string>);
  if (side === 'b') q.set('side', 'b');
  else q.delete('side');
  const str = q.toString();
  return '/files' + (str ? '?' + str : '');
}

function Pane({ pane, computers, single = false }: { pane: PaneKey; computers: FilesComputers; single?: boolean }) {
  const t = useStrings(strings);
  const go = useGo();
  const search = useSearch();
  const current = useCurrentComputer();
  const url = panesOf(search)[pane];
  const rows = computers.rows ?? [];
  // Pane A starts on the computer the top bar shows (when this realm holds it), bound into the URL at once through
  // paneHref: a folder or filters the URL held for no named computer are dropped, and a later top bar or realm switch
  // never carries this pane's folder and filters to another computer. Pane B waits for a pick.
  const fallback = pane === 'a' && !url.handle ? rows.find((x) => x.id === current?.container.id) : undefined;
  const bindTo = fallback ? paneHref(search, 'a', paneTarget(rows, fallback, '/')) : null;
  // Only while the browser still shows this page's route, as the start move above.
  const route = usePathname();
  const live = useLiveRoute();
  useEffect(() => { if (bindTo && live() === route) go(bindTo, { replace: true }); }, [bindTo, go, live, route]);
  // A pane a link names by id (acid/bcid: a chat's path link) is that computer only: found among the rows Files holds, or
  // read alone by its id when they don't have it (a realm with more computers than Files reads). Otherwise by handle.
  const idRow = url.id ? rows.find((x) => x.id === url.id) : undefined;
  const byId = useComputerById(url.id && !idRow && computers.rows !== null ? url.id : null);
  const c = url.id ? (idRow ?? byId.computer ?? undefined) : url.handle ? findByHandle(rows, url.handle) : undefined;
  // A handle two listed computers share opens neither: the pane says so and its picker names the one picked by id.
  const twins = !url.id && handleShared(rows, url.handle);
  const handle = c ? computerHandle(c) : url.handle;
  // How the pane's computer is proven for a link's ask: by id, a row with that id or the latest read by id itself; by
  // handle, Files' own whole list with no other computer of that handle. An id that is no id proves nothing.
  const proof = url.idBad ? { proven: false, ready: true }
    : url.id ? (idRow ? { proven: true, ready: true } : { proven: byId.fresh, ready: byId.settled })
    : { proven: computers.complete && !computers.failed && handleUnique(rows, url.handle), ready: !computers.loading && !computers.more };
  const label = t(pane === 'a' ? 'pane.a' : 'pane.b');
  // The other side: where Copy / Move to the other side puts an item. One pane has none shown,
  // so nothing goes to a pane the viewer can't see.
  const otherUrl = single ? { handle: undefined, path: null } : panesOf(search)[pane === 'a' ? 'b' : 'a'];
  // A side named by id is that computer only, among the rows Files holds (one it can't find there takes nothing).
  const otherC = otherUrl.id ? rows.find((x) => x.id === otherUrl.id) : otherUrl.handle && !otherUrl.idBad ? findByHandle(rows, otherUrl.handle) : undefined;
  const move = (to: { handle?: string; path: string }) => go(paneHref(search, pane, { handle, ...to }));

  const picker = <PanePicker pane={pane} computers={computers} value={c?.id} />;

  let body;
  if (bindTo) body = null;
  else if (!c) {
    // A handle missing from a list not known to be whole is unknown, never gone: say why (pages still loading, a page that
    // failed, more computers than Files reads, or a list read in several pages, which can skip a computer).
    // A pane a link names by id whose computer is still being read by id says so, never that it is missing.
    // The first read of the list never gets here: the page shows its table skeleton until it answers.
    const reading = !!url.id && !url.idBad && !byId.settled;
    // A handle two listed computers share: the pane names the clash and the picker asks which one.
    const twinName = twins && url.handle ? url.handle.slice(0, url.handle.lastIndexOf('.')) : '';
    body = !twins && url.handle && !computers.complete && !reading
      ? <EmptyState size="sm" icon="warn" title={t('pick.unknown')}
          body={computers.more ? t('pick.unknownMore') : computers.failed ? t('pick.unknownFailed') : computers.capped ? t('pick.unknownCapped', { max: (ALL_PAGES_MAX * 100).toLocaleString('en') }) : t('pick.unknownUnproven')}
          action={!computers.more && !computers.failed && !computers.capped ? <TextButton onPress={computers.retry}>{t('action.checkAgain')}</TextButton> : undefined} />
      : <EmptyState size="sm" icon={reading ? 'clock' : 'computer'}
          title={twins ? t('pick.twins', { name: twinName }) : t(reading ? 'pick.readingId' : url.handle ? 'pick.gone' : 'pick.title')}
          body={twins ? t('pick.twinsBody') : reading ? undefined : t('pick.body')} />;
  } else if (url.path === null) {
    body = <EmptyState size="sm" icon="warn" title={t('path.bad')} action={<TextButton onPress={() => move({ path: '/' })}>{t('action.top')}</TextButton>} />;
  } else {
    // One folder view per computer: a pane that shows another computer (Back, Forward, the picker, a link) starts a new
    // view, so a dialog opened on the first computer (Upload, New folder, Rename, Delete, Copy / Move) closes and never
    // acts on the computer shown now.
    body = <Folder key={c.id} pane={pane} proof={proof} computer={c} computers={computers} path={url.path} other={{ computer: otherC, path: otherUrl.path, hidden: single }} onMove={(path) => move({ path })} hrefOf={(path) => paneHref(search, pane, { handle, path })} />;
  }

  // A pane that shows no folder (no such computer once the list is read, whole or not, or a bad path) drops a link's ask
  // unacted, so it never waits in the address for a later reload or list.
  const dropAsk = !bindTo && (!c ? (url.id ? computers.rows !== null && byId.settled : !computers.loading && !computers.more) : url.path === null);
  return (
    <section className={s.pane} aria-label={label}>
      {dropAsk && <PaneAskRun at={`-|${url.handle ?? ''}`} ask={{ pane, entries: undefined, settled: true, unsure: !c }} />}
      {/* The Files rail: the pane head, the folder bar and the table toolbar are one 32 px
          toolbar size (kit ToolbarScope / DataTable toolbarSize); 44 on a coarse pointer. A folder shown has no head: its
          bar starts with Up and the picker, which is the path's root. Mount on your device is on the
          Use from your PC tab. */}
      {!bindTo && c && url.path !== null ? null : (
        <ToolbarScope size="32">
          <div className={s.paneHead}>{picker}</div>
        </ToolbarScope>
      )}
      {body}
    </section>
  );
}

function ComputersLink({ computer }: { computer: FilesComputer }) {
  const t = useStrings(strings);
  const go = useGo();
  const link = usePageLink('computers');
  if (!link) return null;
  return <TextButton onPress={() => (link.kind === 'hub' ? go(computersLinks.item(computerHandle(computer))) : followPageLink(link, go))}>{t('action.openComputers')}</TextButton>;
}

function Folder({ pane, proof, computer, computers, path, other, onMove, hrefOf }: { pane: PaneKey; proof: { proven: boolean; ready: boolean }; computer: FilesComputer; computers: FilesComputers; path: string; other: { computer: FilesComputer | undefined; path: string | null; hidden?: boolean }; onMove: (path: string) => void; hrefOf: (path: string) => string }) {
  const t = useStrings(strings);
  const tt = useStrings(transferStrings);
  const tl = useStrings(linkStrings);
  const state = stateOf(computer);
  const address = hasAddress(computer);
  const blocked = blockedPath(path);
  const running = state === 'running';
  const folder = useFolder(computer, path, running && address && !blocked);
  const atTop = path === '/';
  const canChange = useCanChange();
  const [dialog, setDialog] = useState<{ kind: 'mkdir' } | { kind: 'rename'; entry: Entry } | { kind: 'delete'; items: readonly DeleteItem[] } | { kind: 'transfer'; how: TransferKind; entry: Entry; dest: string; from?: string } | { kind: 'several'; how: TransferKind; items: readonly DeleteItem[]; dest: string; blocked: string | null } | { kind: 'upload'; files: readonly File[]; folder: string } | { kind: 'rest'; id: ChangeIdentity } | { kind: 'link' } | null>(null);
  // The other side's folder on this same computer, read (its names) only when an item could go there.
  const otherSame = other.computer?.id === computer.id && stateOf(computer) === 'running' && other.path !== null && !blockedPath(other.path);
  const otherFolder = useFolder(computer, other.path ?? '/', otherSame);
  const side = { computer: other.computer?.id, running: !!other.computer && stateOf(other.computer) === 'running', path: other.path, listed: otherSame && !!otherFolder.data && !otherFolder.isError };
  const listed = !!folder.data && !folder.isError;
  const takenNames = useMemo(() => folder.data?.entries.map((e) => e.name) ?? [], [folder.data]);
  // A link's one ask of this pane (startHref's aopen): answered once the folder has (read, failed, or not readable); its rows
  // reach the ask only while the folder is readable now (running, addressed, not blocked), never a listing kept from before.
  // The pane's computer is proven by its id (a link naming it), else only by Files' own whole list (findByHandle refuses a
  // handle it names twice); while that list is still read the ask waits, and one read in parts, failed or capped drops it
  // as "can't tell which computer" (Pane's proof).
  const read = useReadActions({ c: computer, path, canChange, onMove, taken: takenNames, ask: { pane, unsure: !proof.proven, entries: listed && running && address && !blocked ? folder.data!.entries : undefined, settled: proof.ready && (!running || !address || !!blocked || listed || folder.isError) } });
  const barRef = useRef<HTMLDivElement>(null);
  const widths = BAR_WIDTHS[useMedia('(pointer: coarse)') ? 'coarse' : 'fine'];
  const compact = useContainerNarrow(widths.labels, barRef);
  const uploadCompact = useContainerNarrow(widths.upload, barRef);
  const stacked = useContainerNarrow(widths.stack, barRef);
  const up = atTop ? null : <TextButton onPress={() => onMove(parentOf(path))}>{t('action.parent')}</TextButton>;
  const boardAdd = useBoardAddEntry();
  // Share with another computer: none while the Shared folders switch is off or the session cannot change shares.
  const shareEntry = useShareEntry();
  // Show: each pane's own List / Icons choice, remembered on this device.
  const [show, setShow] = usePresentation(`files-${pane}`, 'list', SHOW);
  const icons = show === 'icons';
  const showItems = useMemo(() => [
    { id: 'list' as const, label: t('show.list'), icon: 'menu' as const },
    { id: 'icons' as const, label: t('show.icons'), icon: 'apps' as const },
  ], [t]);

  const columns = useMemo(() => [
    // Icons only: the kind's icon, drawn large on the tile (a list row keeps the small icon in its name).
    ...(icons ? [col.display({ id: 'art', header: t('col.kind'), enableSorting: false, enableHiding: false, cell: (x) => <Icon name={KIND_ICON[fileKind(x.row.original)]} label={t(x.row.original.dir ? 'kind.folder' : 'kind.file')} />, meta: { list: 'lead' as const, table: false } })] : []),
    // Measured columns: Size, Modified and Kind take their words' width (their declared widths
    // stay their floors), the name takes the rest.
    col.accessor('name', {
      header: t('col.name'),
      meta: { pinned: true, size: 'fill' },
      cell: (x) => {
        const e = x.row.original;
        // A lossy name says so; a folder core cannot address yet says it can't open (the menu gives the reason).
        const note = !entryOk(e) ? t('row.lossy') : e.dir && blockedPath(joinPath(path, e.name)) ? t('row.closed') : null;
        // A tile: the name shortened in the middle, whole (with its note) in the tooltip.
        if (icons) return <span title={note ? `${displayName(e.name)} (${note})` : displayName(e.name)}>{middleName(displayName(e.name))}</span>;
        return (
          <span className={s.name}>
            <Icon name={e.dir ? 'files' : 'notes'} size="sm" />
            <span className={s.nameText}>{displayName(e.name)}</span>
            {note ? <span className={s.note}>{note}</span> : null}
          </span>
        );
      },
    }),
    col.accessor((e) => e.size ?? -1, { id: 'size', header: t('col.size'), cell: (x) => (x.row.original.size === null ? '' : formatBytes(x.row.original.size)), meta: { align: 'end', width: '104px', size: 'fit', fitText: (e) => (e.size === null ? '' : formatBytes(e.size)), priority: 3 } }),
    col.accessor((e) => e.modified ?? 0, { id: 'modified', header: t('col.modified'), cell: (x) => (x.row.original.modified === null ? '' : formatDateTime(x.row.original.modified)), meta: { width: '180px', size: 'fit', fitText: (e) => (e.modified === null ? '' : formatDateTime(e.modified)), priority: 2 } }),
    // Folders first: the kind column is the default sort, over rows already in name order.
    col.accessor((e) => (e.dir ? 0 : 1), { id: 'kind', header: t('col.kind'), cell: (x) => t(x.row.original.dir ? 'kind.folder' : 'kind.file'), meta: { width: '96px', size: 'fit', fitText: (e) => t(e.dir ? 'kind.folder' : 'kind.file'), priority: 4 } }),
  ], [t, path, icons]);

  const sorted = useMemo(() => (folder.data ? [...folder.data.entries].sort((a, b) => a.name.localeCompare(b.name)) : undefined), [folder.data]);
  const hidden = folder.data?.hidden ?? 0;
  const view = useDataView<Entry>({
    rows: sorted,
    columns,
    getRowId: (e) => e.name,
    search: (e) => [e.name],
    filters: [{ id: 'kind', label: t('filter.kind'), value: (e) => (e.dir ? 'folder' : 'file'), options: [{ value: 'folder', label: t('kind.folder') }, { value: 'file', label: t('kind.file') }] }],
    sort: 'kind',
    pageSize: 50,
    param: pane,
    context: `${computer.id}|${path}`,
    isLoading: folder.isPending && folder.fetchStatus !== 'idle',
  });

  // A deep folder folds to the computer, "…", the parent and the folder, so the row stays one line in a phone or split
  // pane; "…" opens the deepest folder it hides, and Up and the parent crumb still go one step.
  const trail = crumbsOf(path);
  const folded = trail.length > CRUMBS_MAX ? [trail[0]!, { ...trail[trail.length - 3]!, more: true }, ...trail.slice(-2)] : trail;
  const crumbs = <Breadcrumbs items={folded.map((x, i, all) => ({ label: 'more' in x ? t('crumbs.more') : x.name === '/' ? '/' : displayName(x.name), ...('more' in x ? { name: t('crumbs.moreName', { path: displayName(x.path) }) } : x.name === '/' ? { name: t('crumbs.top', { name: computer.name }) } : {}), ...(i < all.length - 1 ? { href: hrefOf(x.path) } : {}) }))} />;
  const newFolder = () => setDialog({ kind: 'mkdir' });
  // Upload: picked with the button, or files dropped on the folder; the dialog plans them first.
  const upload = (files: readonly File[], into: string | null = null) => setDialog({ kind: 'upload', files, folder: into ?? path });
  // A drop on a folder's row goes into that folder; on a file's row, or a folder core can't open, into this one.
  // A folder row takes the drop into itself; a folder that can't take files refuses it (false); a file row is the
  // folder shown (null).
  const dropInto = (name: string): string | false | null => {
    const e = folder.data?.entries.find((x) => x.name === name);
    if (!e?.dir) return null;
    const p = entryOk(e) ? joinPath(path, name) : null;
    return p && !blockedPath(p) ? p : false;
  };
  // The bar's More menu. Download from link: the computer downloads a pasted link into this folder, never the top
  // folder (it says why there). Put on Board for the folder shown: a files tile opened on it;
  // none where the Board cannot keep the path. The menu is its pane's, so its items need not name the pane.
  const runItems = listed ? read.runHereItems() : [];
  const linkOff = atTop ? tl('off.top') : !canChange ? t('changes.off') : null;
  const linkItem: RowActionEntry = { id: 'link', label: tl('action'), icon: 'download', opens: true, isDisabled: linkOff !== null, ...(linkOff ? { disabledReason: linkOff } : {}), onAction: () => setDialog({ kind: 'link' }) };
  const moreItems: RowActionEntry[] = [
    ...runItems,
    ...(runItems.length > 0 ? ['-' as const] : []),
    ...(listed ? [linkItem] : []),
    ...(listed ? boardAdd(boardComputer(computer), { program: 'files', open: { view: 'folder', path } }) : []),
    ...(listed ? shareEntry(computer, path, 'bar', computers.rows ?? []) : []),
  ];
  // Why the bar's New folder and Upload are off (both add to the folder shown).
  const barOff = !canChange ? t('changes.off') : !listed ? t('bar.notListed') : null;
  const barReason = barOff ? { disabledReason: barOff } : {};
  const bar = (
    <div className={stacked ? `${s.bar} ${s.barStacked}` : s.bar} ref={barRef}>
      <IconButton icon="arrow-up" size="toolbar" label={t('action.up')} isDisabled={atTop} onPress={() => onMove(parentOf(path))} />
      {/* The picker is the path's root: Up, the computer, then "/" (its top folder) and the folders. */}
      <PanePicker pane={pane} computers={computers} value={computer.id} />
      <div className={s.crumbs}>{crumbs}</div>
      {/* The folder's actions sit together at the bar's end, clear of the crumbs: Find, New folder and
          Upload, then More: Run here (a terminal or an app in the folder shown),
          Download from link and Put on Board, each with its own label. */}
      <div className={s.barActions}>
        {listed ? read.findButton(compact) : null}
        {compact
          ? <IconButton variant="secondary" icon="plus" label={t('action.newFolder')} isDisabled={!canChange || !listed} {...barReason} onPress={newFolder} />
          : <Button icon="plus" isDisabled={!canChange || !listed} {...barReason} onPress={newFolder}>{t('action.newFolder')}</Button>}
        <UploadButton compact={uploadCompact} isDisabled={!canChange || !listed} {...barReason} onFiles={(fs) => upload(fs)} />
        {/* Nothing to offer (the folder not listed yet, or a read that failed): no More, as no Find. */}
        {moreItems.length > 0 ? <ActionMenu size="toolbar" label={t('action.more')} items={moreItems} /> : null}
      </div>
    </div>
  );
  // A change is offered on an entry the Hub can name exactly and address; every delete goes to the planner.
  const changeable = (e: Entry) => canChange && entryOk(e) && !blockedPath(joinPath(path, e.name));
  const itemOf = (e: Entry): DeleteItem => ({ path: joinPath(path, e.name), name: e.name, dir: e.dir, size: e.size, modified: e.modified });
  const offWhy = (e: Entry) => (!canChange ? t('changes.off') : !entryOk(e) ? t('name.lossy') : t(`blocked.${blockedPath(joinPath(path, e.name)) ?? 'name'}`));

  // What a row drag from here asks while it lasts (rowdrag.ts DragSource): this view still on the same computer and
  // folder, its listing still holding every dragged item. Kept current after each commit (read only at drag events).
  // Not the row element: rows past 200 are virtual, so a row scrolled away mid-drag is not a row gone.
  const held = useRef({ computer: computer.id, path, names: new Set<string>() });
  useEffect(() => {
    held.current.computer = computer.id;
    held.current.path = path;
    held.current.names = new Set(listed ? folder.data!.entries.map((e) => e.name) : []);
  });
  const stillHeld = useRef<DragSource>((p) => {
    const h = held.current;
    return h.computer === p.computer && h.path === p.folder && p.items.every((x) => h.names.has(x.name));
  }).current;
  // This view unmounting ends its drag.
  useEffect(() => () => endRowDragFrom(stillHeld), [stillHeld]);

  // Drag and drop (kit/data/drag.tsx). Rows drag out as Files rows (rowdrag.ts); the table takes Files rows of
  // this computer and files from the computer (Upload), on a folder's row (into it) or anywhere else (the folder
  // shown); the whole folder view around the table (its bar, the room below a short listing) takes them as the folder
  // shown too (DropArea), so a drop anywhere in the other pane lands. Rows from this pane move (copy with the copy
  // key); rows from the other pane copy (move with the key), and from another computer are refused with words
  // (rowdrag.ts dropHow), as are rows the other pane can't take (already there, a folder into itself). A drop only
  // opens the same dialog the menus open.
  const rowDrag: RowDrag<Entry> = {
    type: FILES_ROW,
    canDrag: changeable,
    // A selection with a row that can't change drags, but no folder takes it (as Copy / Move selected is off).
    payload: (rows) => startRowDrag({ pane, computer: computer.id, folder: path, items: rows.map(itemOf) }, rows.every(changeable), stillHeld),
    text: (rows) => rows.map((e) => e.name).join('\n'),
    // What the pointer carries: the one name, or the count.
    preview: (rows) => (rows.length === 1 ? displayName(rows[0]!.name) : t('drop.items', { count: rows.length })),
    onEnd: endRowDrag,
  };
  const destOf = (over: Entry | null) => (over ? ((dropInto(over.name) as string | false | null) || path) : path);
  const placeName = (dest: string) => (dest === '/' ? computer.name : displayName(dest.slice(dest.lastIndexOf('/') + 1)));
  // What these rows' drop does here. Changes off or no listing: nothing.
  const howOf = (p: RowPayload, over: Entry | null, copyKey: boolean) => (canChange && listed ? dropHow(p, { pane, computer: computer.id, dest: destOf(over) }, copyKey) : null);
  const rowsHow = (over: Entry | null, drag: { types: readonly string[]; copy: boolean }) => {
    const p = drag.types.includes(FILES_ROW) ? draggingRows() : null;
    return p ? howOf(p, over, drag.copy) : null;
  };
  const drop: DropTarget<Entry> = {
    types: [FILES_ROW, 'Files'],
    // The folder view around the table (the DropArea below) takes the table's body: one outline for "this folder".
    bodyByArea: true,
    rowTarget: (e) => {
      const into = dropInto(e.name);
      return into === null ? 'body' : into === false ? 'none' : 'row';
    },
    accept: (over, drag) => {
      if (!canChange || !listed) return false;
      if (drag.types.includes(FILES_ROW)) {
        const how = rowsHow(over, drag);
        return how === 'copy' || how === 'move';
      }
      return drag.types.includes('Files');
    },
    copies: (over, drag) => (drag.types.includes(FILES_ROW) ? rowsHow(over, drag) === 'copy' : true),
    // Why a drop here is refused. On the rows' own pane nothing is said (every drag starts over its own folder).
    refusal: (over, drag) => {
      const p = drag.types.includes(FILES_ROW) ? draggingRows() : null;
      const how = p ? howOf(p, over, drag.copy) : null;
      if (how === 'otherComputer') return t('drop.otherComputer');
      if (!p || how !== null || p.pane === pane || !canChange || !listed) return null;
      const dest = destOf(over);
      const why = rowsNoGo(p, dest);
      return why === 'here' ? t('drop.here', { folder: placeName(dest) }) : why === 'intoItself' ? t('drop.intoItself') : why === 'blocked' ? t('drop.blocked', { folder: placeName(dest) }) : null;
    },
    hint: (over, drag) => {
      const folder = placeName(destOf(over));
      const p = drag.types.includes(FILES_ROW) ? draggingRows() : null;
      if (!p) return t('drop.upload', { folder });
      const what = p.items.length === 1 ? displayName(p.items[0]!.name) : t('drop.items', { count: p.items.length });
      const across = p.pane !== pane;
      if (howOf(p, over, drag.copy) === 'copy') return across ? t('drop.copyKey', { what, folder, key: copyKeyName() }) : t('drop.copy', { what, folder });
      return across ? t('drop.moveKey', { what, folder }) : t('drop.move', { what, folder, key: copyKeyName() });
    },
    onDrop: (over, data, drag) => {
      const dest = destOf(over);
      if (data.type === 'Files') {
        if (data.files?.length) upload(data.files, over ? dest : null);
        return;
      }
      // The dropped rows must be the drag this tab started, checked again whole (the payload came through the browser).
      const p = rowPayloadOf(data.payload);
      const cur = draggingRows();
      if (!p || !cur || !sameDrag(p, cur)) return;
      const judged = howOf(p, over, drag.copy);
      if (judged !== 'copy' && judged !== 'move') return;
      const how: TransferKind = judged;
      const one = p.items.length === 1 ? p.items[0]! : null;
      setDialog(one
        ? { kind: 'transfer', how, entry: { name: one.name, dir: one.dir, size: one.size, modified: one.modified, lossy: false }, dest, from: p.folder }
        : { kind: 'several', how, items: p.items, dest, blocked: null });
    },
  };

  // Backspace goes up while the pane's list has focus and no field does. A native listener: the folder box
  // is no control of its own, the key belongs to the list inside it.
  const box = useRef<HTMLDivElement>(null);
  const upKey = useRef<() => void>(() => undefined);
  upKey.current = () => { if (!atTop) onMove(parentOf(path)); };
  const newKey = useRef<() => void>(() => undefined);
  newKey.current = () => { if (canChange && listed) setDialog({ kind: 'mkdir' }); };
  useFolderKeys(box, upKey, newKey);

  let content;
  if (state === 'stopped') content = <EmptyState size="sm" icon="computer" title={t('st.stopped', { name: computer.name })} action={<ComputersLink computer={computer} />} />;
  else if (state === 'starting') content = <EmptyState size="sm" icon="clock" title={t('st.starting', { name: computer.name })} />;
  else if (state === 'attention') content = <EmptyState size="sm" icon="warn" title={t('st.attention', { name: computer.name })} action={<ComputersLink computer={computer} />} />;
  else if (!address) content = <EmptyState size="sm" icon="warn" title={t('st.noAddress')} action={<ComputersLink computer={computer} />} />;
  else if (blocked) content = <EmptyState size="sm" icon="warn" title={t(`blocked.${blocked}`)} action={up} />;
  else if (folder.isError) {
    const p = problemOf(folder.error, computer.rules);
    content = p === 'unreachable'
      ? <UnreachableState computer={computer.name} lastSeen={folder.dataUpdatedAt || undefined} error={folder.error} onRetry={() => void folder.refetch()} retrying={folder.isFetching} />
      : p === 'failed' || p === 'unreadable'
      ? <ErrorState title={t(`pr.${p}`)} body={t(`pr.${p}Body`)} error={folder.error} onRetry={() => void folder.refetch()} retrying={folder.isFetching} />
      : <EmptyState size="sm" icon={p === 'tooBig' ? 'search' : 'warn'} title={t(`pr.${p}`)} {...(p === 'access' || p === 'denied' ? { body: t(`pr.${p}Body`) } : {})} action={p === 'gone' || p === 'refused' ? up : p === 'access' || p === 'denied' ? <ComputersLink computer={computer} /> : undefined} />;
  } else {
    const actions = (e: Entry): readonly RowActionEntry[] => {
      const child = joinPath(path, e.name);
      const why = e.dir ? blockedPath(child) : null;
      return [
        ...(e.dir ? [{ id: 'open', label: t('action.open'), icon: 'arrow-right' as const, isDisabled: !!why, ...(why ? { disabledReason: t(`blocked.${why}`) } : {}), onAction: () => onMove(child) }] : []),
        ...read.rowActions(e),
        // Put on Board for this row: a folder tile, or the file in the editor tile. Not for a name the listing could not
        // read or a folder core cannot address; the Board hides it where it cannot keep the path.
        ...(entryOk(e) && !why ? boardAdd(boardComputer(computer), { program: 'files', open: { view: e.dir ? 'folder' : 'editor', path: child } }) : []),
        { id: 'copy-path', label: t('action.copyPath'), icon: 'copy' as const, isDisabled: !entryOk(e), ...(entryOk(e) ? { copy: child } : { disabledReason: t('name.lossy') }), onAction: () => undefined },
        ...(e.dir && entryOk(e) ? shareEntry(computer, child, 'row', computers.rows ?? []) : []),
        '-' as const,
        ...(['copy', 'move'] as const).map((how) => {
          // A folder copy walks the folder in its dialog first: the row offers it like a file's.
          const why = !changeable(e) ? null : transferBlock({ computer: computer.id, path: child, dir: e.dir }, side);
          const off = !changeable(e) ? offWhy(e) : why === 'noOther' && other.hidden ? t('view.twoFirst') : why ? tt(`block.${why}`) : null;
          return { id: how, label: tt(`action.${how}`), icon: how === 'copy' ? ('copy' as const) : ('arrow-right' as const), isDisabled: off !== null, ...(off ? { disabledReason: off } : {}), onAction: () => setDialog({ kind: 'transfer', how, entry: e, dest: side.path ?? '/' }) };
        }),
        { id: 'rename', label: t('action.rename'), icon: 'pen' as const, key: 'F2', isDisabled: !changeable(e), ...(changeable(e) ? {} : { disabledReason: offWhy(e) }), onAction: () => setDialog({ kind: 'rename', entry: e }) },
        { id: 'delete', label: t('action.delete'), icon: 'trash' as const, key: 'Delete', tone: 'danger' as const, isDisabled: !changeable(e), ...(changeable(e) ? {} : { disabledReason: offWhy(e) }), onAction: () => setDialog({ kind: 'delete', items: [itemOf(e)] }) },
      ];
    };
    content = (
      <>
      {hidden > 0 ? <Band tone="neutral" size="table">{t('hidden', { count: hidden })}</Band> : null}
      <DataTable
        label={t('table.label', { name: computer.name })}
        columns={columns}
        view={view}
        actions={actions}
        selectable
        bulkActions={(rows) => {
          // Copy / Move several: the dialog says why the other side can't take them (sideBlock), and
          // judges each item (taken names, folders into themselves, places, system paths) before the press.
          const off = sideBlock(computer.id, path, side);
          const blocked = off === null ? null : off === 'noOther' && other.hidden ? t('view.twoFirst') : tt(`block.${off}`);
          // Why Copy, Move and Delete are off: the first selected row that can't change says it.
          const stuck = rows.find((e) => !changeable(e));
          const bulkReason = stuck ? { disabledReason: offWhy(stuck) } : {};
          return (
            <>
              {(['copy', 'move'] as const).map((how) => (
                <Button key={how} size="sm" icon={how === 'copy' ? 'copy' : 'arrow-right'} isDisabled={!rows.every(changeable)} {...bulkReason} onPress={() => setDialog({ kind: 'several', how, items: rows.map(itemOf), dest: side.path ?? '/', blocked })}>{tt(how === 'copy' ? 'action.copySelected' : 'action.moveSelected')}</Button>
              ))}
              <Button size="sm" tone="danger" icon="trash" isDisabled={!rows.every(changeable)} {...bulkReason} onPress={() => setDialog({ kind: 'delete', items: rows.map(itemOf) })}>{t('action.deleteSelected')}</Button>
            </>
          );
        }}
        onRowAction={(e) => { if (!e.dir) read.onFile(e); else if (!blockedPath(joinPath(path, e.name))) onMove(joinPath(path, e.name)); }}
        onRefresh={() => void folder.refetch()}
        noMatch={t('noMatch')}
        countLabel={(n) => t('count', { count: n })}
        storageKey={`files-${pane}`}
        toolbarSize="32"
        presentation={icons ? 'icons' : 'auto'}
        presentChoice={{ value: show, onChange: setShow, items: showItems }}
        empty={<EmptyState size="sm" icon="files" title={t(hidden > 0 ? 'empty.hidden' : 'empty.title')} action={up} />}
        rowDrag={rowDrag}
        drop={drop}
      />
      </>
    );
  }

  return (
    <div ref={box} className={s.folder}>
      {/* The whole folder view takes a drop as the folder shown, where the table leaves it (its rows judge first). */}
      <DropArea drop={drop}>
      {/* The folder bar, its bands and the listing: one step of the kit scale apart, so the bar reads as its own row. */}
      <Stack gap={3}>
        <ToolbarScope size="32">{bar}</ToolbarScope>
        {!canChange && <p className={s.note}>{t('changes.off')}</p>}
        <HeldBand c={computer} onRest={(id) => setDialog({ kind: 'rest', id })} />
        <LinkBand key={`link:${computer.id}`} c={computer} />
        {content}
      </Stack>
      {dialog?.kind === 'mkdir' && <NameDialog c={computer} parent={path} taken={folder.data?.entries.map((e) => e.name) ?? []} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'rename' && <NameDialog c={computer} parent={path} entry={dialog.entry} taken={folder.data?.entries.map((e) => e.name) ?? []} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'delete' && <DeletePlanner c={computer} items={dialog.items} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'several' && <SeveralDialog kind={dialog.how} c={computer} items={dialog.items} destFolder={dialog.dest} blocked={dialog.blocked} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'rest' && <RestDialog c={computer} id={dialog.id} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'link' && <LinkDialog c={computer} folder={path} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'upload' && <UploadDialog c={computer} folder={dialog.folder} files={dialog.files} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'transfer' && <TransferDialog kind={dialog.how} c={computer} folder={dialog.from ?? path} entry={dialog.entry} destFolder={dialog.dest} onClose={() => setDialog(null)} />}
      {read.overlay}
      </DropArea>
    </div>
  );
}
