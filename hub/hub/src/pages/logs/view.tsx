// The logs page: what happened on the selected computer, newest first. The URL holds the view
// (source, how it went, when, search, program, script) through the kit's data view, so Back,
// reload and deep links work; the controller (controller.ts) reads, pages and watches it live.
import {
  AgentHint, Band, Button, ComputerMark, EmptyState, FilterChips, FiltersButton, IconButton, ListDetailPage, TablePage, ComputerRequired, DateTimeField, SearchField, SegmentedControl, Select, Skeleton, Stack, Switch, Toolbar,
  ActionMenu, ConfirmDialog, createColumnHelper, showToast, useContainerNarrow, useDataView, useRowFit, type RowNeed, useGo, usePageLink, usePathname, usePageShortcuts, useShellData, followPageLink, useSearch, useStrings, type FilterChip, type FilterOption,
} from '@kit';
import { agentBaseFor, computerHandle, hostEnv, useAgentScopeFacts, useCore, useCurrentComputer } from '@core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { prefStore, useComputer, useLogs, useLogsApi, useSnapshot } from './data';
import type { Computer, Logs } from './controller';
import { createExplainFlow, type ExplainFlow } from './explain-flow';
import {
  DEFAULT_VIEW, MAIN, MORE, SEVERITIES, WINDOW_KEYS, filtersOff, hrefFor, shareLink, isData, isKit, searchFromView, sentence, shareSearch, sevFor, searchKind, sourceItems, viewFromSearch,
  type DataItem, type ViewState,
} from './logic';
import { programOptions, savePick, sortedViews } from './pickers';
import { ComputerPick } from './parts/ComputerPick';
import { rowLinks, sourceHome, type LinkPage } from './rowlinks';
import { handoffName } from '../scripts/links';
import { Notes, ProblemStrip, SpikeBand, StateBox } from './parts/Bands';
import { ExportDialog, SaveViewDialog } from './parts/Dialogs';
import { ExplainDrawer } from './parts/ExplainDrawer';
import { Inspector } from './parts/Inspector';
import { LogList } from './parts/LogList';
import s from './parts/Logs.module.css';
import { ProgramOutput } from './parts/ProgramOutput';
import { asTx, shortClock } from './parts/words';
import type { ProblemGroup } from './rules';
import strings from './strings.en.json';

const col = createColumnHelper<DataItem>();

/** The saved model pick lives in the account's record for this computer, beside the saved views (never a secret). */
function savedPick(computerId: string) {
  return {
    get: (): string | null => { const m = (prefStore(computerId).read() as { model?: unknown }).model; return typeof m === 'string' ? m : null; },
    set: (spec: string): boolean => { try { return savePick(prefStore(computerId), spec); } catch { return false; } },
  };
}

/** The bar's start needs the source segments' whole width on one line (the rest of the start wraps under them). */
const srcNeed: RowNeed = (el) => el.querySelector<HTMLElement>('[data-src-group]')?.scrollWidth ?? 0;

export default function LogsPage() {
  const t = useStrings(strings);
  const core = useCore();
  const computer = useComputer();
  const { api, pending } = useLogsApi();
  const c = computer.data;
  if (computer.isPending || (c && pending)) {
    return <TablePage header={{ title: t('title'), subtitle: t('subtitle') }}><Skeleton variant="table" rows={10} columns={5} /></TablePage>;
  }
  const header = { title: t('title'), subtitle: t('subtitle') };
  if (computer.isError || (c && !api)) return <ComputerRequired state="failed" header={header} {...(computer.isError && 'listUnknown' in computer && computer.listUnknown ? { title: t('comp.failed') } : {})} onRetry={() => void computer.refetch()} />;
  if (!c) return <ComputerRequired state="none" header={header} body={t('st.pick')} />;
  if (!c.running) return <ComputerRequired state="stopped" header={header} name={c.name} />;
  if (!api) return null;
  return <Loaded key={`${c.id}:${core.gen}`} computer={c} api={api} />;
}

function Loaded({ computer, api }: { computer: Computer; api: NonNullable<ReturnType<typeof useLogsApi>['api']> }) {
  const t = useStrings(strings);
  const agentFacts = useAgentScopeFacts(computer.id);
  const tx = useMemo(() => asTx(t), [t]);
  const go = useGo();
  const computersLink = usePageLink('computers');
  const scriptsLink = usePageLink('scripts');
  const botsLink = usePageLink('bots');
  const programsLink = usePageLink('programs');
  const pageLinks = { computers: computersLink, scripts: scriptsLink, bots: botsLink, programs: programsLink };
  const openPlace = (page: LinkPage, path: string) => { const pl = pageLinks[page]; if (!pl) return; if (pl.kind === 'hub') go(path); else followPageLink(pl, go); };
  const onComputers = computersLink ? () => followPageLink(computersLink, go) : undefined;
  const onScripts = scriptsLink ? () => followPageLink(scriptsLink, go) : undefined;
  const search = useSearch();
  const initial = useRef<ViewState>(viewFromSearch(search)); // a bare /logs is the default view: nothing is restored from storage
  const core = useCore();
  const target = useCurrentComputer();
  const logs = useLogs(computer, api, tx, initial.current);
  const snap = useSnapshot(logs);
  const [flow, setFlow] = useState<ExplainFlow | null>(null);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  // Remove saved views asks first (it removes every one; nothing brings them back).
  const [clearAsk, setClearAsk] = useState(false);
  const [active, setActive] = useState<string | undefined>(undefined);
  const [aroundMs, setAroundMs] = useState<number | null>(() => Date.now());
  const [aroundOpen, setAroundOpen] = useState(false);
  const [stripOpenHere, setStripOpenHere] = useState(false);
  // The sources show as segments (with More) while they fit the bar's start, else as one Select: the kit row fit
  // measures the start group itself, never a fixed page width.
  const startRef = useRef<HTMLDivElement>(null);

  // ── The view in the URL (kit data view, server mode) ───────────────────────────────
  const columns = useMemo(() => [col.display({ id: 'what', header: t('col.what'), cell: () => null })], [t]);
  const items = snap?.items.filter(isData);
  const srcOptions: FilterOption[] = useMemo(() => [...MAIN, ...MORE].map((id) => ({ value: id, label: t(`src.${id}`) })), [t]);
  const view = useDataView<DataItem>({
    rows: items,
    columns,
    getRowId: (r) => r.k,
    search: false,
    filters: [
      { id: 'src', label: t('f.source'), value: () => '', options: srcOptions },
      { id: 'sev', label: t('f.severity'), value: () => '', options: SEVERITIES.map((v) => ({ value: v, label: t(`sev.${v}`) })) },
      { id: 'win', label: t('f.window'), value: () => '', options: WINDOW_KEYS.map((v) => ({ value: v, label: t(`win.${v}`) })) },
      // The same order as the Program picker: your programs, then the system programs (the chip menu has no headings).
      { id: 'program', label: t('prog.pick'), value: () => '', options: programOptions(snap?.programs?.list ?? [], t).map((o) => ({ value: o.value, label: o.label })) },
      // A dynamic or catch-all script is named as the Scripts page names it ("Users by id"), never by its bracket file name.
      { id: 'script', label: t('src.scripts'), value: () => '', options: search.script ? [{ value: search.script, label: handoffName(search.script) }] : [] },
      { id: 'computer', label: t('f.computer'), value: () => '', options: [{ value: search.computer || computer.name, label: computer.name, mark: <ComputerMark color={computer.color} /> }] },
    ],
    pageSize: 100,
    more: true,
    server: { total: snap?.rows ?? 0, hasMore: snap?.moreRows ?? false, isLoading: !snap || snap.loading, error: snap?.err },
  });
  const view0 = useMemo(() => viewFromSearch({ ...search, q: view.query.q }), [search, view.query.q]);

  // The URL is the one place the view lives; every control writes it in one step.
  // The search text is the one part that never goes there: the data view holds it, so a view naming a search
  // (a problem group, Reset, a saved view) hands it to view.setQ at once, in the same step as the URL (never through
  // the typing debounce), and a search still being typed is dropped by it.
  const setQ = view.setQ;
  const shownQ = view.query.q;
  const typedQ = view.q;
  const apply = useCallback((next: ViewState, opts?: { keepSel?: boolean; dropComputer?: boolean }) => {
    if (next.search !== shownQ || typedQ !== shownQ) setQ(next.search, { now: true });
    const sp = searchFromView(next);
    go(hrefFor('/logs', { ...sp, ...(search.computer && !opts?.dropComputer ? { computer: search.computer } : {}), ...(opts?.keepSel && search.sel ? { sel: search.sel } : {}) }), { replace: true });
  }, [go, search.computer, search.sel, setQ, shownQ, typedQ]);

  // The view follows the URL only: a bare /logs is the default view.
  const pathname = usePathname();
  const onLogsRoute = pathname === '/logs' || pathname.startsWith('/logs/');
  useEffect(() => {
    // Only a Logs path names a view (a page held on screen while the next one loads keeps its own location). Showing a
    // view stores nothing: the URL is the only place it is kept.
    if (logs && onLogsRoute) logs.setView(view0);
  }, [logs, view0, onLogsRoute]);
  const v = snap?.v ?? view0;
  const wide = useRowFit(startRef, 1, sourceItems(v.source).map((id) => t(`src.${id}`)).join('\n'), true, srcNeed) === 0;
  // A phone-sized page region (the kit's 600 px content line): Result and When fold into Filters and the search
  // takes its own line.
  const narrow = useContainerNarrow(600);
  const selected = search.sel;
  const current = useMemo(() => (snap && selected ? snap.items.find((x): x is DataItem => isData(x) && x.k === selected) : undefined), [snap, selected]);
  // A link naming a run (?exec=…) opens that run once its row is in the list.
  const execRow = snap && v.exec && !selected ? snap.items.find((x): x is DataItem => isData(x) && x.kind === 'script' && x.id === v.exec) : undefined;
  const execKey = execRow?.k;
  const execOpened = useRef<string | undefined>(undefined);
  useEffect(() => { if (execRow && execOpened.current !== execKey) { execOpened.current = execKey; select(execRow); } // once per run, never again after it is closed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execKey]);
  // A link straight to a script run (?sel=…) reads its output once the row is there.
  const currentKey = current?.k;
  useEffect(() => { if (logs && current && current.kind === 'script') logs.loadOutput(current); // once per opened row, never on each refresh of the list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, currentKey]);
  const select = useCallback((it: DataItem | undefined) => {
    const sp = searchFromView(view0);
    go(hrefFor('/logs', { ...sp, ...(search.computer ? { computer: search.computer } : {}), ...(it ? { sel: it.k } : {}) }), { replace: !it || !!search.sel });
  }, [go, view0, search.computer, search.sel]);

  // ── Explain ───────────────────────────────────────────────────────────────────────
  const aliveRef = useRef(true);
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);
  const explain = useCallback((o: { entries?: unknown[]; loaded?: number; snapshot?: string; name: string | null; subject: string }) => {
    if (!logs) return;
    const f = createExplainFlow({
      subject: o.subject, ...(o.entries ? { entries: o.entries } : {}), ...(o.loaded !== undefined ? { loaded: o.loaded } : {}), ...(o.snapshot !== undefined ? { snapshot: o.snapshot } : {}), name: o.name,
      call: logs.api.call, alive: () => aliveRef.current, target: target as { container?: { realm_ids?: unknown } } | null, realm: core.realm ?? null, saved: savedPick(computer.id), onClosed: () => setFlow(null),
    });
    setFlow(f);
    f.start();
  }, [logs, computer.id, target, core.realm]);
  const subjectOf = useCallback(() => (snap ? sentence({
    v, err: !!snap.err, loading: snap.loading, stats: snap.stats, kinds: snap.groups ? snap.groups.groups.length : null, rows: snap.rows, moreRows: snap.moreRows, t: tx, clock: shortClock,
  }) : ''), [snap, v, tx]);
  // The model chooser reads and sets up on the page's computer; the shell's selected computer is that one (Loaded's key).
  const explainTarget = target && target.container.id === computer.id ? target : null;
  // "Open the Agent app" on a private or blocked computer (StateBox): the shown computer's own Agent address, as
  // app/AgentSignIn.tsx builds it. None while the shell's computer is another one, or where no address is known (a terminal).
  const agentUrl = (explainTarget && agentBaseFor(explainTarget.project, explainTarget.container)) || null;
  const explainComputer = useMemo(() => (explainTarget
    ? { id: computer.id, name: computer.name, row: { id: computer.id, project_id: computer.projectId, ...(explainTarget.container.server_name !== undefined ? { server_name: explainTarget.container.server_name } : {}) } }
    : null), [explainTarget, computer.id, computer.name, computer.projectId]);
  const explainItem = useCallback((it: DataItem) => { if (logs) explain({ entries: logs.explainEntries([it]), name: computer.name, subject: subjectOf() }); }, [logs, explain, computer.name, subjectOf]);
  const explainView = useCallback(() => {
    if (!logs || !snap) return;
    const all = snap.items.filter(isData);
    explain({ entries: logs.explainEntries(all.slice(0, 200)), loaded: all.length, name: computer.name, subject: subjectOf() });
  }, [logs, snap, explain, computer.name, subjectOf]);
  const explainGroup = useCallback((g: ProblemGroup) => { if (logs) explain({ entries: logs.explainEntries([]).concat([g.newest as never]), name: computer.name, subject: subjectOf() }); }, [logs, explain, computer.name, subjectOf]);

  // ── Keys: declared with the shell (it skips typing and open overlays) ───────────────
  const dataKeys = useMemo(() => (snap ? snap.items.filter(isData).map((x) => x.k) : []), [snap]);
  const step = useCallback((d: 1 | -1) => {
    if (!dataKeys.length) return;
    const i = active ? dataKeys.indexOf(active) : -1;
    const n = dataKeys[Math.min(dataKeys.length - 1, Math.max(0, i < 0 ? (d === 1 ? 0 : dataKeys.length - 1) : i + d))];
    if (n) setActive(n);
  }, [dataKeys, active]);
  // Export ends in a file saved to the device, which only a web page can (core save): a terminal has neither the key
  // nor the menu item.
  const canSave = hostEnv().browserPage === true;
  usePageShortcuts([
    { key: 'j', label: t('key.next'), run: () => step(1) },
    { key: 'k', label: t('key.prev'), run: () => step(-1) },
    { key: 'l', label: t('act.live'), run: () => logs?.toggleLive(), enabled: !!logs },
    { key: 'r', label: t('act.refresh'), run: () => logs?.refresh(), enabled: !!logs },
    { key: 'p', label: t('key.strip'), run: () => { if (logs && snap) logs.setStrip(!snap.stripClosed); }, enabled: !!logs && !!snap },
    { key: 'e', label: t('act.explain'), run: () => { if (current) explainItem(current); }, enabled: !!current },
    { key: 'x', label: t('act.export'), run: () => setExporting(true), enabled: !!logs && canSave },
  ]);

  // ── Page pieces ───────────────────────────────────────────────────────────────────
  // The header primary is only "See what failed" / "Show all results", and only while something failed: Live is the bar's
  // switch alone (ActionBar rule: one control per action).
  const failed = !!snap && !!snap.stats && snap.stats.failed > 0;
  const primary = logs && snap && isKit(v.source) && failed
    ? v.severity === 'failed'
      ? { label: t('act.showingFailed'), onPress: () => apply({ ...v, severity: 'all' }) }
      : { label: t('act.seeFailed'), onPress: () => apply({ ...v, severity: 'failed' }) }
    : undefined;
  // A read that failed with no rows shows its error alone: no "Nothing to show right now." above it. With rows kept
  // (from before, or another source's) the header says only part could be read (sum.errSome): the list draws no error.
  const subtitle = snap?.err && !snap.items.length ? undefined : snap ? sentence({
    v, err: !!snap.err, loading: snap.loading, stats: snap.stats, kinds: snap.groups ? snap.groups.groups.length : null, rows: snap.rows, moreRows: snap.moreRows, t: tx, clock: shortClock,
    narrowed: view.chips.some((x) => (x.id === 'computer' || x.id === 'program' || x.id === 'script') && x.value !== undefined),
  }) : t('st.loading');

  // One source control: one radio group holding every source that can be chosen right now, the chosen
  // More source included as its own selected segment, and a More menu beside it for the rest. Exactly one item is
  // selected, and pressing Everything always goes back to everything.
  const sourceControl = wide ? (
    <div className={s.srcGroup} data-src-group>
      <SegmentedControl
        label={t('f.source')}
        variant="folder"
        value={v.source}
        onChange={(id) => apply({ ...v, source: id as ViewState['source'] })}
        items={sourceItems(v.source).map((id) => ({ id, label: t(`src.${id}`) }))}
      />
      <ActionMenu
        label={t('src.more')}
        trigger={<Button size="toolbar" variant="ghost" iconEnd="chevron-down">{t('src.more')}</Button>}
        // Plain actions that choose the group's value: the radio group alone shows what is selected.
        items={MORE.map((id) => ({ id, label: t(`src.${id}`), onAction: () => apply({ ...v, source: id }) }))}
      />
    </div>
  ) : (
    <Select
      aria-label={t('f.source')}
      options={[...MAIN, ...MORE, ...(MAIN.includes(v.source) || MORE.includes(v.source) ? [] : [v.source])].map((id) => ({ value: id, label: t(`src.${id}`) }))}
      value={v.source}
      onChange={(id) => apply({ ...v, source: id })}
    />
  );
  const home = sourceHome(v.source);
  const shell = useShellData();
  const winValue = typeof v.window === 'string' ? v.window : 'around';
  const savedItems = sortedViews(snap?.saved ?? []).map((x) => ({
    id: 'v-' + (x.name ?? ''),
    label: t('v.open', { name: x.name ?? '' }),
    onAction: () => apply({ ...DEFAULT_VIEW, source: x.source ?? 'everything', severity: x.severity ?? 'all', window: x.window ?? '1h', program: x.program ?? null, script: x.script ?? null }),
  }));
  const reset = () => { view.clearAll(); apply({ ...DEFAULT_VIEW }, { dropComputer: true }); };
  // Result and When are the kit filter chips (the control every list page uses); on a phone they fold into the
  // kit Filters button. When always has a value (default 1 hour), so its chip is required: no Any, no ×.
  const sevChip: FilterChip | null = sevFor(v.source)
    ? {
        id: 'sev',
        label: t('f.severity'),
        options: SEVERITIES.filter((x) => x !== 'all').map((x) => ({ value: x, label: t(`sev.${x}`) })),
        value: v.severity === 'all' ? undefined : v.severity,
        onChange: (x) => view.setFilter('sev', x === undefined || x === 'all' ? undefined : { kind: 'single', value: x }),
      }
    : null;
  const winChip: FilterChip | null = v.source !== 'programs'
    ? {
        id: 'win',
        label: t('f.window'),
        required: true,
        options: [...WINDOW_KEYS.map((x) => ({ value: x, label: t(`win.${x}`) })), { value: 'around', label: typeof v.window === 'object' ? t('when.around', { time: shortClock(v.window.around) }) : t('win.around') }],
        value: winValue,
        onChange: (x) => { if (x === undefined) return; if (x === 'around') setAroundOpen(true); else if (typeof v.window === 'object') apply({ ...v, window: x as ViewState['window'] }); else view.setFilter('win', x === '1h' ? undefined : { kind: 'single', value: x }); },
      }
    : null;
  const barChips = [sevChip, winChip].filter((x): x is FilterChip => x !== null);
  const filters = barChips.length === 0 ? null : narrow ? <FiltersButton filters={barChips} /> : <FilterChips filters={barChips} />;
  // The bar's ⋯: what you do with this view. Refresh stays the bar's own button at every width (one entry point).
  const at = hostEnv().pageAddress ?? null;
  const moreItems = [
    ...(canSave ? [{ id: 'export', label: t('act.export'), icon: 'download' as const, shortcut: 'X', opens: true, onAction: () => setExporting(true) }] : []),
    // Program output has its own Explain beside the output (it reads the lines shown there, not this list).
    ...(v.source === 'programs' ? [] : [{ id: 'explain', label: t('act.explain'), icon: 'sparkle' as const, shortcut: 'E', isDisabled: !snap || !snap.items.length, disabledReason: !snap ? t('act.explainWait') : !snap.items.length ? t('act.explainEmpty') : undefined, opens: true, onAction: explainView }]),
    '-' as const,
    { id: 'save', label: t('v.save'), opens: true, onAction: () => setSaving(true) },
    // A link needs the address this Hub is open at: a host without one (a terminal) has no such item.
    ...(at ? [{ id: 'link', label: t('v.copy'), description: t('v.copyDesc'), icon: 'link' as const, copy: shareLink(hrefFor('/logs', shareSearch(view0, search.computer || computerHandle(computer))), at), isDisabled: !shareLink('/logs', at), onAction: () => undefined }] : []),
    ...savedItems,
    ...(savedItems.length ? [{ id: 'clear', label: t('v.clear'), tone: 'danger' as const, opens: true, onAction: () => setClearAsk(true) }] : []),
  ];
  // What you look at, then what you do: Live, Refresh and ⋯ ride the start's wrap, pushed to its end,
  // so they sit on a line of controls (the kit end slot centres between wrapped lines). Clear all sits with the chips
  // under the bar, so the bar never changes width as filters come and go.
  const bar = (
    <Toolbar
      label={t('title')}
      className={s.bar}
      start={
        <div ref={startRef} className={s.barStart}>
          {sourceControl}
          <ComputerPick shell={shell} currentId={computer.id} onPick={(id) => { shell.setComputer?.(id); if (search.computer) apply(v, { dropComputer: true }); }} t={(k) => t(k)} />
          {filters}
          {searchKind(v.source) && (
            <SearchField
              className={narrow ? s.searchRow : s.search}
              size="toolbar"
              aria-label={t(v.source === 'programs' ? 'prog.title' : 'f.what')}
              value={view.q}
              onChange={(x) => view.setQ(x)}
            />
          )}
          <div className={s.barActs}>
            {isKit(v.source) && snap && <Switch isSelected={snap.liveOn} onChange={() => logs?.toggleLive()} label={t('act.live')} />}
            <IconButton icon="reload" size="toolbar" label={t('act.refresh')} shortcut="R" onPress={() => logs?.refresh()} />
            <ActionMenu size="toolbar" label={t('act.barMore')} items={moreItems} />
          </div>
        </div>
      }
    />
  );

  const around = aroundOpen && (
    <div className={s.around} role="group" aria-label={t('win.around')}>
      <DateTimeField label={t('win.around')} value={aroundMs} onChange={setAroundMs} />
      <Button size="sm" variant="primary" isDisabled={aroundMs === null} onPress={() => { if (aroundMs !== null) { apply({ ...v, window: { around: aroundMs } }); setAroundOpen(false); } }}>{t('act.around')}</Button>
      <Button size="sm" variant="secondary" onPress={() => setAroundOpen(false)}>{t('act.close')}</Button>
    </div>
  );

  const chips = view.chips.filter((x) => (x.id === 'computer' || x.id === 'program' || x.id === 'script') && x.value !== undefined);
  // "Clear all" (the old Reset filters) ends the chips row whenever the view is off its defaults; from two chips on the
  // kit FilterChips draws its own Clear all, with the same reset.
  const clearAll = filtersOff(v) && chips.length < 2 ? <Button size="sm" variant="ghost" onPress={reset}>{t('act.reset')}</Button> : null;

  let body: React.ReactNode;
  if (!logs || !snap) body = <Skeleton variant="table" rows={10} columns={5} immediate />;
  else if (v.source === 'programs') {
    body = snap.err && !snap.programs
      ? <StateBox t={t} err={snap.err} onRetry={() => logs.refresh()} onHome={onComputers} onAgentUrl={agentUrl} onScripts={onScripts} />
      : (
        <ProgramOutput
          t={t}
          state={snap.programs}
          channel={v.chan}
          port={v.port}
          find={view.q}
          onProgram={(id) => apply({ ...v, program: id, port: null })}
          onChannel={(ch) => apply({ ...v, chan: ch })}
          onPort={(p) => apply({ ...v, port: p })}
          onRefresh={() => logs.refresh()}
          onExplain={(lines, name) => explain({ snapshot: lines.join('\n'), name: computer.name, subject: name })}
        />
      );
  } else if (snap.err && !snap.items.length) {
    body = <div className={s.stateBox}><StateBox t={t} err={snap.err} onRetry={() => logs.refresh()} onHome={onComputers} onAgentUrl={agentUrl} onScripts={onScripts} /></div>;
  } else if (!snap.loading && !snap.items.length) {
    const filtered = v.severity !== 'all' || v.search !== '' || chips.length > 0;
    body = (
      <div className={s.stateBox}>
        <EmptyState
          icon={filtered ? 'search' : 'logs'}
          title={t(filtered ? 'st.emptyFiltered' : 'st.empty', { when: t(typeof v.window === 'object' ? 'when.around' : (`when.${v.window}` as never), typeof v.window === 'object' ? { time: shortClock(v.window.around) } : undefined) })}
          size="sm"
          {...(filtered
            ? { action: <Button onPress={() => { view.clearAll(); apply({ ...DEFAULT_VIEW, source: v.source, window: v.window }, { dropComputer: true }); }}>{t('clear')}</Button> }
            : home && pageLinks[home.page] ? { body: t('lk.empty'), action: <Button variant="secondary" onPress={() => openPlace(home.page, home.path)}>{t(home.label)}</Button> } : {})}
        />
      </div>
    );
  } else {
    body = (
      <LogList
        t={t}
        snap={snap}
        selected={selected}
        active={active}
        onActive={setActive}
        onSelect={(it) => select(it)}
        onOlder={() => logs.older()}
        onNewer={() => logs.newer()}
        onJump={() => logs.jumpToNewest()}
        onReading={(r) => logs.setReading(r)}
      />
    );
  }

  // On a phone-sized page the strip starts folded, so its chips never push the list below the fold.
  const stripClosed = !!snap && (snap.stripClosed || (narrow && !stripOpenHere));
  const strip = logs && snap && snap.groups && isKit(v.source) && (
    <ProblemStrip
      t={t}
      groups={snap.groups}
      closed={stripClosed}
      onToggle={(closed) => {
        // On a phone the strip opens for this visit only (it starts folded on the next one); opening it also drops a
        // stored close, as on a wide page.
        if (narrow) {
          setStripOpenHere(!closed);
          if (!closed && snap.stripClosed) logs.setStrip(false);
        } else logs.setStrip(closed);
      }}
      onGroup={(g: ProblemGroup) => apply({ ...v, severity: g.cls === '5xx' ? 'failed' : 'problems', search: g.path })}
      onAround={(g) => { if (typeof g.newest.tsMs === 'number') apply({ ...v, window: { around: g.newest.tsMs } }); }}
      onExplain={explainGroup}
    />
  );

  const list = (
    <Stack gap={2}>
      {bar}
      {around}
      {(chips.length > 0 || clearAll) && (
        <div className={s.chipRow}>
          {chips.length > 0 && <FilterChips filters={chips} onClearAll={reset} />}
          {clearAll}
        </div>
      )}
      {v.source === 'scripts' && v.script && (
        <Band size="table" actions={onScripts ? <Button size="sm" variant="secondary" onPress={onScripts}>{t('sc.back')}</Button> : undefined}>
          {t('sc.for', { script: handoffName(v.script) })}
        </Band>
      )}
      {logs && snap && <SpikeBand t={t} snap={snap} onAround={(ms) => apply({ ...v, window: { around: ms } })} />}
      {strip}
      {logs && snap && <Notes t={t} snap={snap} onRetry={() => logs.refresh()} onResume={() => logs.startLive()} onNewest={() => logs.jumpToNewest()} onVisits={() => apply({ ...v, source: 'visits' })} onAgentUrl={agentUrl} />}
      {body}
    </Stack>
  );

  return (
    <>
      <ListDetailPage
        mode="side"
        storageKey="logs"
        onClose={() => select(undefined)}
        inspectorWidth={480}
        header={{ title: t('title'), subtitle, actions: <AgentHint page="logs" facts={agentFacts} />, primaryAsFab: false, primaryQuiet: true, ...(primary ? { primary } : {}) }}
        list={list}
        detail={current && logs ? (
          <Inspector
            t={t}
            item={current}
            out={snap?.outs[current.k]}
            onAround={(ms) => apply({ ...v, window: { around: ms } })}
            onExplain={explainItem}
            onRetryOut={() => logs.loadOutput(current)}
            links={rowLinks(current, { handle: computerHandle(computer), script: v.script }).filter((l) => pageLinks[l.page]).map((l) => ({ id: l.id, label: t(l.label), onPress: () => openPlace(l.page, l.path) }))}
          />
        ) : null}
      />
      <ExplainDrawer t={t} flow={flow} onClose={() => { flow?.close(); setFlow(null); }} target={explainTarget} computer={explainComputer} />
      {logs && snap && <ExportDialog t={t} snap={snap} logs={logs} isOpen={exporting} onClose={() => setExporting(false)} />}
      <ConfirmDialog overlayId="logs-views-clear"
        isOpen={clearAsk}
        onOpenChange={setClearAsk}
        title={t('v.clearAsk', { count: savedItems.length, n: String(savedItems.length) })}
        body={t('v.clearAskBody')}
        confirmLabel={t('v.clearGo')}
        tone="danger"
        onConfirm={() => {
          setClearAsk(false);
          showToast(logs?.clearViews() ? { title: t('v.cleared') } : { title: t('v.clearFail'), tone: 'warn' /* noDetails: the browser did not remove the saved views; there is no rejection */ });
        }}
      />
      {logs && <SaveViewDialog t={t} logs={logs} isOpen={saving} onClose={() => setSaving(false)} onSaved={(name) => showToast({ title: t('v.done', { name }) })} />}
    </>
  );
}

export type { Logs };
