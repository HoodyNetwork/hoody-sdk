// ModelPickBody: the one model picker's body: one
// search, one filter bar with live counts and one virtualized list of every model the caller may pick, in place of
// ModelBrowser's four views and their paging. Presentational, with ModelBrowser's contract: ModelChooser owns the
// reads, the setup step and its attempt, and the trip; the caller owns the save.
//
// Contract:
//   - `evidence` is the newest accepted evidence (null: none yet; with `noComputer`, "Choose a computer first.").
//     Rows and their readiness are read from it (modelViews.pickBaseOf); every press is judged again from it at the
//     press (modelViews.activationOf): ready → onChoose(ready); the inherit row → onChoose(inherit); unknown (and a
//     fallback row after a settled failure) → the consent bar, whose Use it anyway judges once more and chooses with
//     consent; needs setup → onSetup(provider, spec, 'choose'), never onChoose; an ensemble that needs setup lists its
//     known members; a Claude Code row that needs setup → onOtherWay('claude').
//   - `setup`, when set, draws in place of the list (the caller's setup step); the search and the filters stay, and
//     using either ends the step (onSetupView), as in ModelBrowser.
//   - The filter bar: Show (Ready / Needs setup / All), Provider (any of), Can (thinks, reads images, calls tools,
//     favourites, recent), Window and List price, each value with its count over the current search and every other
//     filter (modelPickLogic.pickView). A chip whose field no row carries is absent. Readiness and the provider set are
//     remembered per account (`prefs`), never the search.
//   - Favourites live outside the list (no control inside an option): the star button acts on the
//     focused option, else the held value. Favourites the catalogue does not list are counted, with Remove them.
//   - The heading (h3, tabIndex -1) takes focus when the setup step closes and focus had nowhere to go.
import { providers } from '@core';
import { type FocusEvent, type ReactNode, useCallback, useDeferredValue, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../controls/Button';
import { FilterChips, type FilterChip, type FilterOption } from '../data/FilterChips';
import { fold as kitFold } from '../data/DataTableViewLogic';
import { SearchField } from '../forms/fields';
import { useIsPhone } from '../overlays/Overlays';
import { Band } from '../states/Band';
import { Skeleton } from '../states/States';
import { useStrings } from '../strings';
import type { OtherWayOrAi, SetupRequest } from './ModelBrowser';
import { optionId, type ListOption } from './ModelListbox';
import { ModelPickList, type HeadingItem, type OptionItem } from './ModelPickList';
import { usePickerFocus, useRowFocusKeeper } from './pickerFocus.web';
import {
  clearFilters,
  filtersOn,
  indexPick,
  NO_FILTERS,
  openingFilters,
  pickRows,
  pickView,
  PRICE_BANDS,
  recentList,
  rememberFilters,
  toggleFavourite,
  WINDOW_BANDS,
  type ModelPrefs,
  type PickFilters,
  type PickRow,
  type PriceBand,
  type WindowBand,
} from './modelPickLogic';
import { activationOf, fallbackRows, heldRow, inUseOf, midSentence, modelLabel, pickBaseOf, providerLabel, type FallbackRow, type ViewOptions } from './modelViews';
import { ageText } from './ProviderDirectory';
import { ProviderMark } from './ProviderMark';
import strings from './ModelPick.strings.en.json';
import mcStrings from './ModelChooser.strings.en.json';
import s from './ModelChooser.module.css';
import m from './ModelPick.module.css';

type Evidence = providers.Evidence;
type Choice = providers.Choice;

/** What the one picker adds to ModelBrowser's props. */
export interface PickExtras {
  /** The account's remembered favourites, recent picks and filters (useModelPrefs). */
  prefs: ModelPrefs;
  /** Changes the remembered value (favourites, filters). */
  onPrefs: (fn: (p: ModelPrefs) => ModelPrefs) => void;
  /** The models in use where the picker opened (the Recent section shows them first). */
  inUse?: readonly string[];
  /** The inherit row's words (rules.inherit): a short label, a detail line, the model it resolves to now. */
  inherit?: { label: string; detail?: string; resolved?: string | null } | null;
}

export interface ModelPickBodyProps {
  id?: string;
  evidence: Evidence | null;
  noComputer?: boolean;
  computerName?: string;
  /** The caller's value: a spec, or '' (the inherit row when `rules.inherit`). */
  value: string;
  rules: providers.JudgeRules;
  purpose: providers.Purpose;
  defaultSpec?: string | null;
  offer?: { endpoint?: boolean; claude?: boolean };
  fallback?: readonly FallbackRow[];
  providerWord?: string;
  locked?: boolean;
  onChoose: (c: Choice) => void;
  onSetup: (req: SetupRequest) => void;
  onOtherWay: (way: OtherWayOrAi) => void;
  onRetry: () => void;
  retrying?: boolean;
  backgroundFailed?: boolean;
  setup?: ReactNode;
  onSetupView?: () => void;
  /** Show one provider's models (the setup step's Choose a model, a restored trip): each new token filters the list to
   *  that provider once (every readiness, no search), with focus on the heading. */
  openProvider?: { pid: string; token: number } | null;
  facts?: (spec: string) => string | null;
  pick: PickExtras;
  /** Test seams. */
  now?: () => number;
  fold?: (s: string) => string;
  renderProbe?: (spec: string) => void;
}

type Bar = { kind: 'consent'; spec: string; label: string; from: string } | { kind: 'ensemble'; spec: string; label: string; members: string[]; from: string } | null;

const LIVE_DELAY_MS = 500;
const ROW_H = 44;
const ROW_H_TOUCH = 56;
const HEAD_H = 32;
const HAS = ['thinking', 'images', 'tools', 'favourites', 'recent'] as const;
type Has = (typeof HAS)[number];

/** "64K", "200K", "1M", "1.05M". */
export function windowText(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}
const money = (n: number): string => (n >= 10 ? String(Math.round(n)) : String(+n.toFixed(2)));

export function ModelPickBody(p: ModelPickBodyProps) {
  const t = useStrings(strings);
  const kt = useStrings(mcStrings);
  const autoId = useId();
  const base = p.id ?? `mp${autoId.replace(/[^A-Za-z0-9_-]/g, '')}`;
  const fold = p.fold ?? kitFold;
  const phone = useIsPhone();
  const word = p.providerWord ?? kt('mc.provider');
  const modelWord = kt('mc.anyModel');
  const ev = p.evidence;
  const cat = ev && ev.catalogue.state === 'ok' ? ev.catalogue.value.cat : null;
  const loading = !ev || ev.catalogue.state === 'loading';
  const failed = ev?.catalogue.state === 'failed';
  const prefs = p.pick.prefs;
  const onPrefs = p.pick.onPrefs;

  const o: ViewOptions = useMemo(
    () => ({ rules: p.rules, purpose: p.purpose, value: p.value, defaultSpec: p.defaultSpec, offer: p.offer, providerWord: word, modelWord, fallback: p.fallback }),
    [p.rules, p.purpose, p.value, p.defaultSpec, p.offer, word, modelWord, p.fallback],
  );
  const words = useMemo(() => ({ ensembles: kt('mc.ensembles'), claude: kt('mc.claude'), claudeDefault: kt('mc.claudeDefault') }), [kt]);

  // Rows and their index: once per evidence (readiness changes with it), never per keystroke. After a settled failure
  // the caller's fallback rows stand in (can't tell, usable with consent).
  // Claude Code's rows take a thinking level when its read lists efforts.
  const claudeEfforts = ev?.claude?.state === 'ok' ? ev.claude.value.efforts : undefined;
  const ix = useMemo(() => {
    if (!ev) return null;
    if (ev.catalogue.state === 'ok') return indexPick(pickRows(pickBaseOf(ev, o, words), cat, { claudeEfforts }), fold);
    if (ev.catalogue.state === 'failed')
      return indexPick(
        pickRows(
          fallbackRows(o, null).map((r) => ({ spec: r.spec, label: r.label, providerId: r.provider, providerLabel: word, ready: 'unknown' as const, source: 'provider' as const, recommended: r.recommended })),
          null,
        ),
        fold,
      );
    return null;
  }, [ev, cat, o, words, claudeEfforts, fold, word]);

  const [filters, setFiltersState] = useState<PickFilters | null>(null);
  // The search typed while a read is failed (null: none): it is the person's search after the next good read too, over
  // the filters they had, remembered opening ones included.
  const [failQuery, setFailQuery] = useState<string | null>(null);
  // The opening filters: the remembered readiness and providers, once the first index is in (readiness falls back to
  // All when nothing is ready); after that the person's.
  // After a failed read every row is the caller's own and can't-tell: only the search applies (the filter bar is not
  // drawn, so a kept filter would hide rows the person cannot see why). The person's filters come back with the next
  // good read.
  const kept: PickFilters = filters ?? (ix && !failed ? openingFilters(ix, prefs) : NO_FILTERS);
  const f: PickFilters = failed ? { ...NO_FILTERS, query: failQuery ?? filters?.query ?? '' } : failQuery !== null ? { ...kept, query: failQuery } : kept;
  const query = f.query;
  const deferredQuery = useDeferredValue(query);
  const [bar, setBar] = useState<Bar>(null);
  const [live, setLive] = useState('');
  const [focusAsk, setFocusAsk] = useState<{ token: number; spec: string | null }>({ token: 0, spec: null });
  const [focusedSpec, setFocusedSpec] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const scopeKey = ev ? `${ev.scope.account}|${ev.scope.realm}|${ev.scope.computer}|${ev.scope.gen}|${ev.scope.boot}` : '';
  // A scope change closes the consent bar; the filters stay.
  useEffect(() => setBar(null), [scopeKey]);

  const setupHeld = !!p.setup && !!p.locked;
  const endSetupByView = () => {
    if (p.setup) p.onSetupView?.();
  };
  /** Every filter change: ends the caller's setup step (a view change), closes the bar, remembers what is kept. */
  const setFilters = (next: PickFilters) => {
    if (setupHeld) return;
    endSetupByView();
    setBar(null);
    // After a failed read only the search is the person's to change; the rest of their filters are kept for the next read.
    if (failed) setFailQuery(next.query);
    else {
      setFailQuery(null);
      setFiltersState(next);
    }
    if (!failed && (next.readiness !== f.readiness || next.providers.join('\n') !== f.providers.join('\n'))) onPrefs((pr) => rememberFilters(pr, next));
  };
  const setQuery = (q: string) => setFilters({ ...f, query: q });

  const opened = useRef(0);
  const openAsk = p.openProvider ?? null;
  useEffect(() => {
    if (!openAsk || openAsk.token === opened.current) return;
    opened.current = openAsk.token;
    setBar(null);
    setFailQuery(null);
    setFiltersState({ ...NO_FILTERS, readiness: 'all', providers: [openAsk.pid] });
    headingRef.current?.focus();
  }, [openAsk?.token]); // eslint-disable-line react-hooks/exhaustive-deps -- each token opens once

  const recent = useMemo(() => recentList(prefs.recent, p.pick.inUse), [p.pick.inUse, prefs.recent]);
  const inheritLabel = p.pick.inherit?.label ?? kt('mc.inherit');
  const view = useMemo(
    () => (ix ? pickView(ix, { ...f, query: deferredQuery }, { current: p.value, favourites: prefs.fav, recent, inherit: p.rules.inherit ? { label: inheritLabel } : null, fold }) : null),
    // f is rebuilt each render from stable parts; its fields are the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ix, deferredQuery, f.readiness, f.providers, f.thinking, f.images, f.tools, f.window, f.price, f.favourites, f.recent, p.value, prefs.fav, recent, p.rules.inherit, inheritLabel, fold],
  );

  // The live region: the count once the results settle, LIVE_DELAY_MS after they commit, never on every key.
  useEffect(() => {
    if (!view) return;
    const timer = setTimeout(() => setLive(t('mp.countLive', { shown: view.matched.toLocaleString(), total: (ix?.rows.length ?? 0).toLocaleString() })), LIVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [view, ix, t]);

  // ── a press ───────────────────────────────────────────────────────────────────────────

  const rowBySpec = useMemo(() => new Map((ix?.rows ?? []).map((r) => [r.spec, r])), [ix]);
  const labelFor = useCallback((spec: string) => rowBySpec.get(spec)?.label ?? modelLabel(cat, spec, modelWord), [rowBySpec, cat, modelWord]);

  const choose = useCallback(
    (spec: string, consent: boolean, readiness: 'ready' | 'unknown') => {
      if (!ev) return;
      setBar(null);
      p.onChoose({ kind: 'model', spec, readiness, consent, scope: ev.scope, seq: ev.seq });
    },
    [ev, p],
  );

  const setupFor = (req: SetupRequest) => {
    if (p.locked) return;
    p.onSetup(req);
  };

  const activate = (spec: string, from: string) => {
    if (p.locked) return;
    const a = activationOf(ev, spec, p.rules);
    switch (a.do) {
      case 'inherit':
        setBar(null);
        return p.onChoose({ kind: 'inherit' });
      case 'choose':
        return choose(spec, false, 'ready');
      case 'consent':
        return setBar({ kind: 'consent', spec, label: labelFor(spec), from });
      case 'ensemble':
        return setBar({ kind: 'ensemble', spec, label: labelFor(spec), members: a.members, from });
      case 'claude':
        setBar(null);
        return p.onOtherWay('claude');
      case 'setup':
        setBar(null);
        return setupFor({ provider: a.provider, spec, intent: 'choose' });
      default:
        return;
    }
  };

  /** Use it anyway: judged again on the newest evidence, rules and lock (ModelBrowser.confirmConsent). */
  const confirmConsent = (spec: string, from: string) => {
    if (p.locked || !ev) return;
    const v = providers.judge({ kind: 'model', spec, readiness: 'unknown', consent: true, scope: ev.scope, seq: ev.seq }, spec, ev, ev.scope, p.rules);
    if (v.ok && v.readiness === 'unknown') return choose(spec, true, 'unknown');
    setBar(null);
    if (v.ok || v.why === 'needs_setup') return activate(spec, from);
    document.getElementById(from)?.focus();
  };

  // ── focus ─────────────────────────────────────────────────────────────────────────────

  const listId = `${base}-list`;
  const headingId = `${base}-h`;
  const countId = `${base}-count`;
  const hadSetup = useRef(false);
  useLayoutEffect(() => {
    if (p.setup) hadSetup.current = true;
    else if (hadSetup.current) {
      hadSetup.current = false;
      // Back from the step: the list, on the held value when it shows, else the heading.
      if (!document.activeElement || document.activeElement === document.body) {
        if (view && p.value !== '' && view.items.some((i) => i.kind === 'row' && i.row.spec === p.value)) setFocusAsk((a) => ({ token: a.token + 1, spec: p.value }));
        else headingRef.current?.focus();
      }
    }
  }, [p.setup]); // eslint-disable-line react-hooks/exhaustive-deps -- runs when the setup step opens or closes
  // The star's target leaves with its option: once a view no longer draws it, the held value is the star's again.
  useEffect(() => {
    if (focusedSpec && view && !view.items.some((i) => i.kind === 'row' && i.row.spec === focusedSpec)) setFocusedSpec(null);
  }, [view, focusedSpec]);
  const onListFocus = (e: FocusEvent<HTMLDivElement>) => {
    const sp = (e.target as HTMLElement).closest<HTMLElement>('[role="option"]')?.dataset.spec;
    if (sp !== undefined) setFocusedSpec(sp);
  };
  const focusSearch = () => searchRef.current?.querySelector('input')?.focus();
  // The ensemble bar takes focus when it opens, as the consent bar does (ConsentButtons), so the keyboard is in it.
  const barRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (bar?.kind === 'ensemble') barRef.current?.querySelector<HTMLElement>('button')?.focus();
  }, [bar]);
  // A control that leaves under the focus (Clear filters once the list is back, a band's button, the star bar) does not
  // drop the focus to the page body: it goes to the view heading, as in ModelBrowser. Runs after the restores above.
  const rootRef = useRef<HTMLDivElement>(null);
  const keep = useRowFocusKeeper(usePickerFocus(rootRef), rootRef, headingRef);

  // ── drawing ───────────────────────────────────────────────────────────────────────────

  const heading = (
    <h3 id={headingId} ref={headingRef} tabIndex={-1} className={s.title}>
      {loading && !p.noComputer ? kt('read.wait') : t('mp.title')}
    </h3>
  );

  if (p.noComputer)
    return (
      <div className={s.browser}>
        {heading}
        <p className={s.state}>{kt('mc.noComputer')}</p>
      </div>
    );

  const readyWord = (r: PickRow['ready']) => (r === 'ready' ? t('mp.ready') : r === 'needs_key' ? t('mp.setup') : t('mp.cantTell'));

  const factsOf = (r: PickRow): string => {
    const own = p.facts?.(r.spec);
    if (own) return own;
    const out: string[] = [];
    if (r.source === 'claude_code') out.push(t('mp.claudePlan'));
    if (r.members !== null) out.push(t('mp.members', { count: r.members }));
    if (r.window !== null) out.push(windowText(r.window));
    if (r.priceIn !== null && r.source === 'provider') out.push(r.priceIn === 0 && r.priceOut === 0 ? t('mp.free') : r.priceOut !== null ? t('mp.price', { in: money(r.priceIn), out: money(r.priceOut) }) : t('mp.priceIn', { in: money(r.priceIn) }));
    if (r.reasoning === true) out.push(t('mp.thinks'));
    if (r.images === true) out.push(t('mp.images'));
    return out.join(' · ');
  };

  const option = (it: OptionItem): ListOption => {
    if (it.kind === 'inherit') {
      const inh = p.pick.inherit;
      const detail = [inh?.detail ?? kt('mc.inheritDesc'), inh?.resolved].filter(Boolean).join(' · ');
      return { spec: '', label: inheritLabel, state: detail, selected: p.value === '' };
    }
    const r = it.row;
    const tags: string[] = [];
    if (it.current) tags.push(t('mp.current'));
    if (r.recommended) tags.push(t('mp.recommended'));
    if (it.favourite) tags.push(t('mp.starred'));
    let state: string | undefined;
    let hint: string | undefined;
    if (r.ready === 'needs_key') {
      state = t('mp.setupState', { provider: r.providerLabel });
      if (r.source === 'provider') hint = t('mp.setupHint', { provider: r.providerLabel });
    } else if (r.ready === 'unknown') state = t('mp.cantTell');
    return { spec: r.spec, label: r.label, tags, state, hint, facts: factsOf(r) || undefined, selected: r.spec === p.value, tone: r.ready === 'needs_key' ? 'warn' : undefined };
  };

  // What option() reads besides the item: the inherit row's words (the list caches drawn options by it).
  const optionKey = [inheritLabel, p.pick.inherit?.detail ?? '', p.pick.inherit?.resolved ?? ''].join('\u0000');

  const head = (it: HeadingItem): ReactNode => {
    if (!it.group) {
      const name = it.section === 'favourites' ? t('mp.favourites') : t('mp.recent');
      return <span className={s.groupName}>{name}</span>;
    }
    const g = it.group;
    const facts = [readyWord(g.ready), t('mp.groupCount', { count: g.count })].join(' · ');
    const named = [g.label, facts].join(' · ');
    return (
      <>
        {g.id !== 'fusion' && g.id !== 'claude-code' && <ProviderMark id={g.id} name={g.label} />}
        <span className={s.groupName} aria-hidden="true">
          {g.label}
        </span>
        <span className={s.groupFacts} aria-hidden="true">
          {facts}
        </span>
        <span className={s.srOnly}>{named}</span>
      </>
    );
  };

  // The filter bar (absent while the catalogue loads or after a failure: there is nothing to filter).
  let chips: FilterChip[] = [];
  if (view && ix && !failed) {
    const fc = view.facets;
    const has: Has[] = HAS.filter((h) => f[h]);
    const hasOptions: FilterOption[] = [{ value: 'thinking', label: t('f.has.thinking'), count: fc.thinking }];
    if (fc.images !== null) hasOptions.push({ value: 'images', label: t('f.has.images'), count: fc.images });
    if (fc.tools !== null) hasOptions.push({ value: 'tools', label: t('f.has.tools'), count: fc.tools });
    hasOptions.push({ value: 'favourites', label: t('f.has.favourites'), count: fc.favourites }, { value: 'recent', label: t('f.has.recent'), count: fc.recent });
    chips = [
      {
        id: 'readiness',
        label: t('f.readiness'),
        display: 'segmented',
        required: true,
        value: f.readiness,
        options: (['ready', 'setup', 'all'] as const).map((r) => ({ value: r, label: t(`f.r.${r}`), count: fc.readiness[r] })),
        onChange: (v) => setFilters({ ...f, readiness: v === 'setup' || v === 'all' ? v : 'ready' }),
      },
      {
        id: 'provider',
        label: t('f.provider'),
        kind: 'multi',
        value: f.providers.length ? f.providers.join(',') : undefined,
        options: fc.providers.map((pv) => ({ value: pv.id, label: pv.label, count: pv.count, mark: pv.id === 'fusion' || pv.id === 'claude-code' ? undefined : <ProviderMark id={pv.id} name={pv.label} /> })),
        onChange: (v) => setFilters({ ...f, providers: v ? v.split(',').filter(Boolean) : [] }),
      },
      {
        id: 'has',
        label: t('f.has'),
        kind: 'multi',
        value: has.length ? has.join(',') : undefined,
        options: hasOptions,
        onChange: (v) => {
          const on = new Set(v ? v.split(',') : []);
          setFilters({ ...f, thinking: on.has('thinking'), images: on.has('images'), tools: on.has('tools'), favourites: on.has('favourites'), recent: on.has('recent') });
        },
      },
      {
        id: 'window',
        label: t('f.window'),
        value: f.window ? String(f.window) : undefined,
        options: WINDOW_BANDS.map((w) => ({ value: String(w), label: t(`f.w.${w}`), count: fc.window[w] })),
        onChange: (v) => setFilters({ ...f, window: (v ? Number(v) : 0) as WindowBand }),
      },
      {
        id: 'price',
        label: t('f.price'),
        value: f.price || undefined,
        options: PRICE_BANDS.map((b) => ({ value: b, label: t(`f.p.${b}`), count: fc.price[b] })),
        onChange: (v) => setFilters({ ...f, price: (v ?? '') as PriceBand }),
      },
    ];
  }

  const bands = ev && ev.catalogue.state === 'ok' && (
    <>
      {ev.catalogue.value.ready === 'failed' && (
        <Band
          tone="warn"
          size="table"
          actions={
            <Button variant="secondary" size="sm" onPress={p.onRetry} busy={!!p.retrying}>
              {kt('read.retry')}
            </Button>
          }
        >
          {kt('read.readyFailed')}
        </Band>
      )}
      {ev.catalogue.value.ready === 'legacy' && (
        <Band tone="neutral" size="table">
          {kt('read.legacy')}
        </Band>
      )}
      {p.backgroundFailed && (
        <Band
          tone="warn"
          size="table"
          actions={
            <Button variant="secondary" size="sm" onPress={p.onRetry} busy={!!p.retrying}>
              {kt('read.retry')}
            </Button>
          }
        >
          {kt('read.age', { age: ageText(kt, (p.now ?? Date.now)() - ev.at) })}
        </Band>
      )}
    </>
  );

  const failedBand = failed && (
    <Band
      tone="warn"
      size="table"
      actions={
        <Button variant="secondary" size="sm" onPress={p.onRetry} busy={!!p.retrying}>
          {kt('read.retry')}
        </Button>
      }
    >
      {kt('read.failed')}
    </Band>
  );

  const barBack = () => {
    const from = bar?.from;
    setBar(null);
    if (from) document.getElementById(from)?.focus();
  };
  // Escape on any of the bar's buttons: back to the option, nothing chosen (the bar's own group takes no keys).
  const barKeys = (e: { key: string; preventDefault: () => void; stopPropagation: () => void }) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      barBack();
    }
  };
  const consentBar = bar && (
    <div ref={barRef} role="group" aria-labelledby={`${base}-bar`} className={s.consent} data-mc-bar="">
      {bar.kind === 'consent' ? (
        <>
          <p id={`${base}-bar`} className={s.consentText}>
            {kt('unk.ask', { model: midSentence(kt, bar.label), computer: p.computerName || kt('mc.computer') })}
          </p>
          <ConsentButtons base={base} locked={p.locked} onUse={() => confirmConsent(bar.spec, bar.from)} onOther={barBack} onKeys={barKeys} />
        </>
      ) : (
        <>
          <p id={`${base}-bar`} className={s.consentText}>
            {kt('ens.known')}
          </p>
          <ul className={s.memberList}>
            {bar.members.map((mid) => {
              const name = mid === 'claude-code' ? kt('mc.claude') : cat ? providerLabel(cat, mid, word) : word;
              const id = `${base}-bar-m-${mid.replace(/[^\w-]/g, '_')}`;
              return (
                <li key={mid} className={s.member}>
                  <span>{name}</span>
                  <Button variant="secondary" size="sm" id={id} isDisabled={p.locked} aria-label={kt('dir.setupFor', { provider: name })} onKeyDown={barKeys} onPress={() => (mid === 'claude-code' ? p.onOtherWay('claude') : setupFor({ provider: mid, intent: 'browse' }))}>
                    {kt('dir.setup')}
                  </Button>
                </li>
              );
            })}
          </ul>
          <p className={s.state}>{kt('ens.maybeMore')}</p>
          <Button variant="ghost" size="sm" onPress={barBack} onKeyDown={barKeys}>
            {kt('unk.other')}
          </Button>
        </>
      )}
    </div>
  );

  // The star acts on the focused option, else the held value; never on the inherit row.
  // A focused option the view no longer draws (a filter took it out) is not the star's.
  const focusedShown = focusedSpec !== null && focusedSpec !== '' && rowBySpec.has(focusedSpec) && !!view && view.items.some((i) => i.kind === 'row' && i.row.spec === focusedSpec);
  const starSpec = focusedShown ? focusedSpec : p.value && rowBySpec.has(p.value) ? p.value : null;
  const starred = starSpec !== null && prefs.fav.includes(starSpec);
  // "Your own endpoint" stays offered whatever the list shows (an empty search, a failed read).
  const listed = !failed && !!view;
  const endpointOn = p.offer?.endpoint !== false && !loading;
  const starBar = (listed || endpointOn) && (
    <div className={m.tools}>
      {listed && starSpec !== null && (
        <Button variant="ghost" size="sm" isDisabled={setupHeld} aria-label={t(starred ? 'star.remove' : 'star.add', { model: labelFor(starSpec) })} onPress={() => onPrefs((pr) => toggleFavourite(pr, starSpec))}>
          {t(starred ? 'star.removeShort' : 'star.addShort')}
        </Button>
      )}
      {listed && view.staleFavourites.length > 0 && (
        <span className={m.stale}>
          {t('stale', { count: view.staleFavourites.length })}
          <Button variant="ghost" size="sm" onPress={() => onPrefs((pr) => ({ ...pr, fav: pr.fav.filter((sp) => !view.staleFavourites.includes(sp)) }))}>
            {t('stale.remove')}
          </Button>
        </span>
      )}
      {endpointOn && (
        <Button variant="secondary" size="sm" id={`${base}-endpoint`} isDisabled={p.locked} onPress={() => p.onOtherWay('endpoint')}>
          {kt('dir.endpoint')}
        </Button>
      )}
    </div>
  );

  // The held value the list cannot show: one this computer does not list (it may still run: Use it anyway) or no
  // longer offers. A held value that needs setup or can't tell is in the list itself (pinned as current).
  const inUse = ev && !loading ? inUseOf(ev, o) : null;
  const inUseCard = inUse && (inUse.why === 'unlisted' || inUse.why === 'gone') && (
    <div className={s.consent} data-mp-inuse="">
      <p className={s.consentText}>{kt(inUse.why === 'gone' ? 'mc.gone' : 'mc.unlisted', { model: inUse.label })}</p>
      {inUse.why === 'unlisted' && (
        <Button variant="secondary" size="sm" id={`${base}-inuse`} isDisabled={p.locked} onPress={() => activate(inUse.spec, `${base}-inuse`)}>
          {kt('unk.use')}
        </Button>
      )}
    </div>
  );

  let body: ReactNode;
  if (p.setup) body = p.setup;
  else if (loading) {
    const held = heldRow(o, cat);
    body = (
      <>
        {held && (
          <p className={s.state}>
            {kt('mc.current')}: {held.label || kt('mc.claudeDefault')}
          </p>
        )}
        <Skeleton rows={3} />
      </>
    );
  } else if (!view || !ix) body = <Skeleton rows={3} />;
  else if (view.total === 0)
    body = (
      <div className={m.none}>
        <p id={countId} className={s.count}>
          {t('none.title')}
        </p>
        <span className={m.noneActions}>
          {filtersOn(f) && (
            <Button variant="secondary" size="sm" onPress={() => setFilters(clearFilters(f))}>
              {t('f.clear')}
            </Button>
          )}
          {f.readiness === 'ready' && (
            <Button variant="secondary" size="sm" onPress={() => setFilters({ ...f, readiness: 'all' })}>
              {t('none.all')}
            </Button>
          )}
        </span>
      </div>
    );
  else
    body = (
      <>
        <p id={countId} className={s.count}>
          {t('mp.count', { shown: view.matched.toLocaleString(), total: ix.rows.length.toLocaleString() })}
        </p>
        <div className={m.listBox} onFocus={onListFocus}>
          <ModelPickList
            id={listId}
            labelledBy={headingId}
            describedBy={countId}
            view={view}
            value={p.value}
            option={option}
            optionKey={optionKey}
            heading={head}
            rowHeight={phone ? ROW_H_TOUCH : ROW_H}
            headingHeight={HEAD_H}
            overscan={8}
            locked={p.locked}
            onActivate={(spec) => activate(spec, optionId(listId, spec))}
            onType={(ch) => {
              setQuery(query + ch);
              focusSearch();
            }}
            onEscape={() => {
              if (!query) return false;
              setQuery('');
              focusSearch();
              return true;
            }}
            focusSpec={focusAsk.spec}
            focusToken={focusAsk.token}
            renderProbe={p.renderProbe}
          />
        </div>
      </>
    );

  const listShown = !p.setup && !!view && view.total > 0;
  return (
    <div ref={rootRef} className={s.browser} data-mp="" onFocus={keep.onFocus} onBlur={keep.onBlur}>
      <div className={s.head}>{heading}</div>
      {bands}
      {failedBand}
      <div className={s.searchRow} ref={searchRef}>
        <SearchField
          className={s.searchField}
          label={t('mp.search')}
          placeholder={t('mp.search')}
          value={query}
          onChange={setQuery}
          isDisabled={setupHeld || loading}
          aria-controls={listShown ? listId : undefined}
          aria-describedby={listShown ? countId : undefined}
        />
      </div>
      {chips.length > 0 && <FilterChips filters={chips} onClearAll={() => setFilters(clearFilters(f))} />}
      {!p.setup && inUseCard}
      {consentBar}
      {body}
      {!p.setup && starBar}
      <div role="status" aria-live="polite" className={s.srOnly}>
        {live}
      </div>
    </div>
  );
}


function ConsentButtons({ base, locked, onUse, onOther, onKeys }: { base: string; locked?: boolean; onUse: () => void; onOther: () => void; onKeys: (e: { key: string; preventDefault: () => void; stopPropagation: () => void }) => void }) {
  const kt = useStrings(mcStrings);
  const ref = useRef<HTMLSpanElement>(null);
  // Focus moves to Use it anyway when the bar opens.
  useLayoutEffect(() => {
    ref.current?.querySelector('button')?.focus();
  }, []);
  return (
    <>
      <span ref={ref}>
        <Button variant="secondary" size="sm" id={`${base}-use`} isDisabled={locked} onPress={onUse} onKeyDown={onKeys}>
          {kt('unk.use')}
        </Button>
      </span>
      <Button variant="ghost" size="sm" onPress={onOther} onKeyDown={onKeys}>
        {kt('unk.other')}
      </Button>
    </>
  );
}
