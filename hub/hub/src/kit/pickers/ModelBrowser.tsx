// ModelBrowser: the model chooser's four views: Ready, Directory ("Set up a provider"),
// a provider's (or the ensembles', or Claude Code's) drill-in, and search results in place of the Ready or Directory
// body. Presentational: the caller (ModelChooser) owns the reads, the setup step and the save; this view owns only
// navigation, paging, search and the consent bar.
//
// Contract:
//   - `evidence` is the newest accepted evidence (null: none yet; with `noComputer`, "Choose a computer first.").
//     Readiness is read from it at render and again at activation, never cached.
//   - Activation: ready → onChoose(ready); the Agent's default → onChoose(inherit); unknown (and a fallback row
//     after a settled failure) → the consent bar, whose Use it anyway → onChoose(unknown, consent); needs setup →
//     onSetup(provider, spec, 'choose') and never onChoose; an ensemble that needs setup lists its known members.
//   - `setup`, when set, draws in place of the view body (the caller's setup step); clearing it returns to the same
//     view, query and focus.
//   - Each view has an h3 (tabIndex -1) that takes focus on a view change; Back returns focus to the control that
//     opened the view, by stored id, or to the heading.
//   - Every section pages with replacement pages; no view draws more than VIEW_ROWS rows (modelPaging.ts).
import { providers } from '@core';
import { type ReactNode, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../controls/Button';
import { ListItemButton } from '../controls/ListItemButton';
import { fold as kitFold } from '../data/DataTableViewLogic';
import { SearchField } from '../forms/fields';
import { Band } from '../states/Band';
import { EmptyState, ErrorState, Skeleton } from '../states/States';
import { useStrings } from '../strings';
import { buildIndex, indexIdentity, searchIndex, type Group, type ModelIndex } from './modelIndex';
import { ModelListbox, ModelPager, optionId, type ListGroup, type ListOption } from './ModelListbox';
import { usePickerFocus, useRowFocusKeeper } from './pickerFocus.web';
import { PAGE, pageOf, pager } from './modelPaging';
import {
  agentPart,
  drillRows,
  ensembleSetup,
  fallbackRows,
  heldRow,
  howOf,
  isClaudeSpec,
  midSentence,
  modelLabel,
  providerLabel,
  readyView,
  rowOf,
  rowReady,
  startSentence,
  type DrillKind,
  type FallbackRow,
  type ModelGroup,
  type ModelRow,
  type ViewOptions,
} from './modelViews';
import { ageText, NO_PAGES, ProviderDirectory, type DirPages } from './ProviderDirectory';
import { ProviderMark } from './ProviderMark';
import strings from './ModelChooser.strings.en.json';
import s from './ModelChooser.module.css';

type Evidence = providers.Evidence;
type Choice = providers.Choice;
type T = ReturnType<typeof useStrings<typeof strings>>;

/** A setup the browser asks the caller for: the provider, the model it is for (intent choose), or browse. */
export interface SetupRequest {
  provider: string;
  spec?: string;
  intent: 'choose' | 'browse';
}

export type OtherWayOrAi = providers.OtherWay | 'ai';

export interface ModelBrowserProps {
  /** Id prefix for every control (one browser per id). */
  id?: string;
  evidence: Evidence | null;
  /** No computer chosen (New Bot): nothing is read and nothing can be chosen. */
  noComputer?: boolean;
  /** The computer's name, for "Can't tell if {model} runs on {computer}". */
  computerName?: string;
  /** The caller's value: a spec, or '' (the Agent's default when `rules.inherit`). */
  value: string;
  rules: providers.JudgeRules;
  purpose: providers.Purpose;
  defaultSpec?: string | null;
  offer?: { endpoint?: boolean; claude?: boolean };
  fallback?: readonly FallbackRow[];
  /** The caller's generic word for a provider without a public label. */
  providerWord?: string;
  /** The caller is saving: the listbox is locked, link-outs are disabled. */
  locked?: boolean;
  onChoose: (c: Choice) => void;
  onSetup: (req: SetupRequest) => void;
  onOtherWay: (way: OtherWayOrAi) => void;
  onRetry: () => void;
  /** The read a press of Try again asked for is still running: the button shows pending. */
  retrying?: boolean;
  /** A background read failed after `evidence` was accepted ("Checked {age} ago. Couldn't check again."). */
  backgroundFailed?: boolean;
  /** The caller's setup step, drawn in place of the view body. */
  setup?: ReactNode;
  /** While `setup` is drawn, the person changed the view anyway (this Back, or a search): the caller ends its step. */
  onSetupView?: () => void;
  /** Open a provider's drill-in from outside (the setup step's Choose a model, a restored trip): each new token opens it
   *  once, over the current view, with focus on its heading. */
  openProvider?: { pid: string; token: number } | null;
  /** Facts per option (Explain's price estimate). */
  facts?: (spec: string) => string | null;
  /** Test seams. */
  now?: () => number;
  fold?: (s: string) => string;
  renderProbe?: (spec: string) => void;
}

type View = { v: 'ready' } | { v: 'directory' } | { v: 'drill'; kind: DrillKind; pid: string };
interface Frame {
  view: View;
  /** The control that opened the next view (focus returns there on Back). */
  opener: string | null;
  query: string;
  page: number;
}

type Bar =
  | { kind: 'consent'; spec: string; label: string; from: string }
  | {
      kind: 'ensemble';
      spec: string;
      label: string;
      members: string[];
      from: string;
    }
  | null;

/** A key event as the bar's buttons give it (React Aria's or the DOM's). */
type BarKey = {
  key: string;
  preventDefault: () => void;
  stopPropagation: () => void;
};

const LIVE_DELAY_MS = 500;
/** Element Timing for the perf evidence: each final query paints a new count line. */
const RESULTS_TIMING = { elementtiming: 'mc-results' } as Record<string, string>;

/** The search index of one catalogue, built after the first paint in time slices; an obsolete build stops. */
function useModelIndex(ev: Evidence | null, urgent: boolean, modelWord: string): ModelIndex | null {
  const snap = ev && ev.catalogue.state === 'ok' ? ev.catalogue.value : null;
  const scopeKey = ev ? `${ev.scope.account}|${ev.scope.realm}|${ev.scope.computer}|${ev.scope.gen}|${ev.scope.boot}` : '';
  const identity = snap ? `${scopeKey}#${snap.sig}` : '';
  // The index's identity hashes the whole catalogue: once per catalogue object and scope, never per render (a keystroke).
  const cat = snap?.cat ?? null;
  const want = useMemo(() => (cat ? `${indexIdentity(scopeKey, cat)}|${modelWord}` : ''), [scopeKey, cat, modelWord]);
  const [ix, setIx] = useState<ModelIndex | null>(null);
  const urgentRef = useRef(urgent);
  urgentRef.current = urgent;
  const gen = useRef(0);
  useEffect(() => {
    if (!snap) return;
    const mine = ++gen.current;
    const id = want;
    let cancelled = false;
    void buildIndex(snap.cat, id, {
      modelWord,
      isCurrent: () => !cancelled && gen.current === mine,
      urgent: () => urgentRef.current,
    }).then((built) => {
      if (built && !cancelled && gen.current === mine) setIx(built);
    });
    return () => {
      cancelled = true;
    };
    // The identity covers the catalogue's indexed fields and the scope, and the word covers the hidden names' label (a locale
    // switch on a mounted browser); readiness never rebuilds.
  }, [identity, modelWord]); // eslint-disable-line react-hooks/exhaustive-deps -- rebuilt only when the identity or the word changes
  return ix && snap && ix.identity === want ? ix : null;
}

export function ModelBrowser(p: ModelBrowserProps) {
  const t = useStrings(strings);
  const base = p.id ?? 'mc';
  const fold = p.fold ?? kitFold;
  const word = p.providerWord ?? t('mc.provider');
  const modelWord = t('mc.anyModel');
  // Pending belongs to the press: the same read also fires on a return to the tab, which must stay silent. Clearing whenever no
  // read runs also clears a press whose read never started, so it cannot light up on a later silent read.
  const retrying = !!p.retrying;
  const ev = p.evidence;
  const value = p.value;
  const factsOf = p.facts;
  const cat = ev && ev.catalogue.state === 'ok' ? ev.catalogue.value.cat : null;
  const o: ViewOptions = useMemo(
    () => ({
      rules: p.rules,
      purpose: p.purpose,
      value: p.value,
      defaultSpec: p.defaultSpec,
      offer: p.offer,
      providerWord: word,
      modelWord,
      fallback: p.fallback,
    }),
    [p.rules, p.purpose, p.value, p.defaultSpec, p.offer, word, modelWord, p.fallback],
  );

  const [stack, setStack] = useState<Frame[]>([{ view: { v: 'ready' }, opener: null, query: '', page: 0 }]);
  const frame = stack[stack.length - 1]!;
  const view = frame.view;
  const query = frame.query;
  const deferred = useDeferredValue(query);
  const [bar, setBar] = useState<Bar>(null);
  const [dirPages, setDirPages] = useState<DirPages>(NO_PAGES);
  const [searchPages, setSearchPages] = useState({
    providers: 0,
    ready: 0,
    unknown: 0,
    setup: 0,
  });
  const [focusAsk, setFocusAsk] = useState<{
    token: number;
    spec: string | null;
    target: 'list' | 'heading' | 'id' | 'within';
    id?: string;
    /** With target 'list' and no spec: the first option of this group ('' = the first group that is not the Agent's
     *  default or the fallback rows; a trailing '-' matches by prefix), resolved on the render that draws the new page. */
    group?: string;
  }>({ token: 0, spec: null, target: 'heading' });
  const [live, setLive] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Focus by a control's id (pickerFocus.web.ts: the document on the web, the focus scope in the terminal).
  const pf = usePickerFocus(rootRef);
  const first = useRef(true);

  const scopeKey = ev ? `${ev.scope.account}|${ev.scope.realm}|${ev.scope.computer}|${ev.scope.gen}|${ev.scope.boot}` : '';
  // A scope change closes the consent bar; the views stay.
  useEffect(() => setBar(null), [scopeKey]);

  const ix = useModelIndex(ev, query !== '', modelWord);
  const searching = query !== '' && view.v !== 'drill';

  const patch = (f: Partial<Frame>) => setStack((st) => [...st.slice(0, -1), { ...st[st.length - 1]!, ...f }]);
  // Set when a view change here (Back, search) ends the caller's setup step: that change owns the focus, so the
  // step's close does not move it back to the step's opener.
  const viewEndsSetup = useRef(false);
  // While the caller saves with its setup step drawn (a key save in flight or unknown, C9), the search and Back that
  // would end that step wait, like every other control here.
  const setupHeld = !!p.setup && !!p.locked;
  const endSetupByView = () => {
    if (!p.setup) return;
    viewEndsSetup.current = true;
    p.onSetupView?.();
  };
  const setQuery = (q: string) => {
    if (setupHeld) return;
    // The caller's setup step stands in for the body: a search is a view change, which ends it.
    endSetupByView();
    patch({ query: q, page: 0 });
    setSearchPages({ providers: 0, ready: 0, unknown: 0, setup: 0 });
    setBar(null);
  };
  const ask = (target: 'list' | 'heading' | 'id' | 'within', spec: string | null = null, id?: string, group?: string) =>
    setFocusAsk((f) => ({ token: f.token + 1, spec, target, id, group }));
  const open = (next: View, opener: string | null, q = '') => {
    setBar(null);
    setStack((st) => [...st.slice(0, -1), { ...st[st.length - 1]!, opener }, { view: next, opener: null, query: q, page: 0 }]);
    ask('heading');
  };
  const back = () => {
    if (setupHeld) return;
    endSetupByView();
    setBar(null);
    const opener = stack.length > 1 ? stack[stack.length - 2]!.opener : null;
    setStack((st) => (st.length > 1 ? st.slice(0, -1) : st));
    ask(opener ? 'id' : 'heading', null, opener ?? undefined);
  };

  // Focus after a view change, Back, or a closed setup step.
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (focusAsk.target === 'heading') pf.toEl(headingRef.current);
    else if (focusAsk.target === 'id' && focusAsk.id) {
      if (!pf.toId(focusAsk.id)) pf.toEl(headingRef.current);
    }
    // A page of buttons (Directory sections, search providers): its first control, once the new page is drawn.
    else if (focusAsk.target === 'within' && focusAsk.id) {
      if (!pf.toFirst(focusAsk.id, 'button:not([disabled])')) pf.toEl(headingRef.current);
    }
  }, [focusAsk, pf]);
  const opened = useRef(0);
  const openAsk = p.openProvider ?? null;
  useEffect(() => {
    if (!openAsk || openAsk.token === opened.current) return;
    opened.current = openAsk.token;
    open({ v: 'drill', kind: 'provider', pid: openAsk.pid }, null);
  }, [openAsk?.token]); // eslint-disable-line react-hooks/exhaustive-deps -- each token opens once
  // The control that asked for the setup step; closing the step returns focus there, else to the view's heading.
  const setupFrom = useRef<string | null>(null);
  // Every Set up path comes here; none starts while the caller is saving (C9: the save's answer is not in yet).
  const setupFor = (req: SetupRequest, fromId: string | null) => {
    if (p.locked) return;
    setupFrom.current = fromId;
    p.onSetup(req);
  };
  const hadSetup = useRef(false);
  useLayoutEffect(() => {
    const byView = viewEndsSetup.current;
    viewEndsSetup.current = false;
    if (p.setup) hadSetup.current = true;
    else if (hadSetup.current) {
      hadSetup.current = false;
      const back = setupFrom.current;
      setupFrom.current = null;
      if (!byView && !pf.toId(back)) pf.toEl(headingRef.current);
    }
  }, [p.setup, pf]); // runs when the setup step opens or closes
  // A focused control that leaves hands the focus to the row after it, else to the view heading. After the
  // view-change, setup-close and listbox restores above, which own the focus they move.
  const keep = useRowFocusKeeper(pf, rootRef, headingRef);

  const say = useCallback((text: string) => setLive(text), []);

  const choose = useCallback(
    (spec: string, consent: boolean, readiness: 'ready' | 'unknown') => {
      if (!ev) return;
      setBar(null);
      p.onChoose({
        kind: 'model',
        spec,
        readiness,
        consent,
        scope: ev.scope,
        seq: ev.seq,
      });
    },
    [ev, p],
  );

  /** One activation, judged from the evidence at the press. */
  const activate = useCallback(
    (spec: string, fromId: string) => {
      if (p.locked) return;
      if (spec === '') {
        setBar(null);
        p.onChoose({ kind: 'inherit' });
        return;
      }
      if (!ev) return;
      const part = agentPart(ev, spec);
      if (part === 'failed') {
        if (p.rules.fallback.has(spec))
          setBar({
            kind: 'consent',
            spec,
            label: labelFor(spec),
            from: fromId,
          });
        return;
      }
      if (part !== 'ok' || !p.rules.eligible(spec, ev)) return;
      const r = rowReady(ev, spec);
      if (r === 'ready') return choose(spec, false, 'ready');
      if (r === 'gone') return;
      if (r === 'unknown')
        return setBar({
          kind: 'consent',
          spec,
          label: labelFor(spec),
          from: fromId,
        });
      // needs setup: never chosen by this press (the attempt decides).
      if (providers.prefixOf(spec) === 'fusion')
        return setBar({
          kind: 'ensemble',
          spec,
          label: labelFor(spec),
          members: ensembleSetup(ev, spec),
          from: fromId,
        });
      setBar(null);
      // Claude Code is set up on the AI page (its own way), never as a provider step.
      if (isClaudeSpec(spec)) return p.onOtherWay('claude');
      const pid = cat?.byPrefix[providers.prefixOf(spec)]?.id ?? providers.prefixOf(spec);
      setupFor({ provider: pid, spec, intent: 'choose' }, fromId);
    },
    // labelFor reads cat; the press reads the newest props.
    [ev, p, cat, choose], // eslint-disable-line react-hooks/exhaustive-deps -- labelFor is derived from cat
  );

  /**
   * Use it anyway: judged again on the newest evidence, rules and lock. Only a spec that is still unknown (or a
   * fallback spec after a settled failure) is chosen with consent; otherwise the bar closes and the press is judged
   * afresh (ready chooses, needs setup asks for setup, gone or ineligible does nothing and focus goes back).
   */
  function confirmConsent(spec: string, from: string) {
    if (p.locked || !ev) return;
    const v = providers.judge({ kind: 'model', spec, readiness: 'unknown', consent: true, scope: ev.scope, seq: ev.seq }, spec, ev, ev.scope, p.rules);
    if (v.ok && v.readiness === 'unknown') return choose(spec, true, 'unknown');
    setBar(null);
    if (v.ok || v.why === 'needs_setup') return activate(spec, from);
    pf.toId(from);
  }

  function labelFor(spec: string): string {
    return rowOf(ev!, o, spec)?.label ?? fallbackRows(o, cat).find((r) => r.spec === spec)?.label ?? modelLabel(cat, spec, modelWord);
  }

  // No answer yet (every read starts with no evidence): only what is real shows, never the fallback rows.
  const loading = !ev || ev.catalogue.state === 'loading';

  // ── option rows ───────────────────────────────────────────────────────────────────────

  const optionOf = useCallback(
    (r: ModelRow, extra: Partial<ListOption> = {}): ListOption => {
      const tags: string[] = [];
      if (r.current) tags.push(t('mc.current'));
      if (r.recommended) tags.push(t('mc.recommended'));
      let state: string | undefined;
      let hint: string | undefined;
      if (r.fallback && loading) tags.push(t('read.checking'));
      else if (r.ready === 'unknown') state = t('unk.cantTell');
      else if (r.ready === 'needs_key') {
        if (r.provider === 'fusion') state = t('search.setup');
        else {
          const name = cat ? providerLabel(cat, r.provider, word) : word;
          const how = t(`dir.how.${cat ? howOf(cat, r.provider) : 'ai'}`);
          state = t('setup.needs', { how });
          hint = t('setup.enter', { provider: name });
        }
      }
      const facts = factsOf?.(r.spec) ?? undefined;
      return {
        spec: r.spec,
        label: r.label || (r.provider === 'claude-code' ? t('mc.claudeDefault') : r.spec),
        tags,
        state,
        hint,
        facts,
        selected: r.spec === value,
        isDisabled: r.fallback && ev?.catalogue.state !== 'failed' ? true : undefined,
        tone: r.ready === 'needs_key' ? 'warn' : undefined,
        ...extra,
      };
    },
    [t, ev, loading, cat, word, value, factsOf],
  );

  // ── the Ready view ────────────────────────────────────────────────────────────────────

  // The Ready frame is always the stack's bottom; its page survives a drill-in and Back without a rebuild.
  const readyPage = stack[0]!.page;
  const rv = useMemo(() => (ev && ev.catalogue.state === 'ok' ? readyView(ev, o, readyPage) : null), [ev, o, readyPage]);
  const fb = useMemo(() => fallbackRows(o, cat), [o, cat]);
  // The directory scans the whole catalogue: once per evidence, never per render (a page or a drill-in re-renders).
  const needConnect = view.v === 'drill' && view.kind === 'provider';
  const chooseDir = useMemo(
    () =>
      ev && ev.catalogue.state === 'ok'
        ? providers.directory(ev, {
            purpose: p.purpose,
            verb: 'choose',
            current: p.value,
            defaultSpec: p.defaultSpec,
            offer: p.offer,
          })
        : null,
    [ev, p.purpose, p.value, p.defaultSpec, p.offer],
  );
  const connectDir = useMemo(() => (ev && needConnect && ev.catalogue.state === 'ok' ? providers.directory(ev, { purpose: p.purpose, verb: 'connect' }) : null), [ev, needConnect, p.purpose]);

  const groupHead = (g: ModelGroup): ReactNode => {
    const name = g.kind === 'fusion' ? t('mc.ensembles') : g.kind === 'claude' ? t('mc.claude') : g.kind === 'fallback' ? t('mc.cantTell') : g.label;
    const facts: string[] = [];
    if (g.pay) facts.push(t(`mc.via.${g.pay}`));
    if (g.kind === 'ready' && g.readyCount < g.total) facts.push(t('mc.partReady', { ready: g.readyCount, total: g.total }));
    if (g.kind === 'unknown') facts.push(t('mc.cantTell'));
    return (
      <>
        {g.kind !== 'fusion' && g.kind !== 'claude' && g.kind !== 'fallback' && <ProviderMark id={g.id} name={name} />}
        <span className={s.groupName} aria-hidden="true">
          {name}
        </span>
        {facts.length > 0 && (
          <span className={s.groupFacts} aria-hidden="true">
            {facts.join(' · ')}
          </span>
        )}
        <span className={s.srOnly}>{[name, ...facts].join(' · ')}</span>
      </>
    );
  };

  const readyGroups: ListGroup[] = useMemo(() => {
    const out: ListGroup[] = [];
    if (p.rules.inherit)
      out.push({
        id: '__inherit',
        header: null,
        label: t('mc.inherit'),
        options: [
          {
            spec: '',
            label: t('mc.inherit'),
            state: t('mc.inheritDesc'),
            selected: p.value === '',
          },
        ],
      });
    if (loading) {
      const held = heldRow(o, cat);
      if (held) out.push({ id: 'held', header: null, label: t('mc.current'), options: [optionOf(held)] });
      return out;
    }
    if (!ev || ev.catalogue.state !== 'ok') {
      if (fb.length)
        out.push({
          id: 'fallback',
          header: groupHead({
            id: 'fallback',
            kind: 'fallback',
            label: '',
            pay: null,
            readyCount: 0,
            total: fb.length,
            options: [],
          }),
          options: fb.map((r) => optionOf(r)),
        });
      return out;
    }
    if (!rv) return out;
    for (const g of rv.groups)
      out.push({
        id: g.id,
        header: groupHead(g),
        options: g.options.map((r) => optionOf(r)),
      });
    if (rv.ensembles)
      out.push({
        id: 'fusion',
        header: groupHead(rv.ensembles),
        options: rv.ensembles.options.map((r) => optionOf(r)),
      });
    if (rv.claude)
      out.push({
        id: 'claude',
        header: groupHead(rv.claude),
        options: rv.claude.options.map((r) => optionOf(r)),
      });
    return out;
  }, [ev, loading, o, cat, rv, fb, p.rules.inherit, p.value, optionOf, t]); // eslint-disable-line react-hooks/exhaustive-deps -- groupHead is pure over t

  // ── the drill-in ──────────────────────────────────────────────────────────────────────

  const drillWords = useMemo(() => (view.v === 'drill' ? fold(deferred).trim().split(/\s+/).filter(Boolean) : []), [view, deferred, fold]);
  const drillAll = useMemo(() => (ev && view.v === 'drill' ? drillRows(ev, o, view.kind, view.pid, drillWords, fold) : []), [ev, o, view, drillWords, fold]);
  const drillPg = pager(drillAll.length, PAGE.drillIn, view.v === 'drill' ? frame.page : 0);
  const drillGroups: ListGroup[] = useMemo(() => {
    if (view.v !== 'drill') return [];
    const rows = pageOf(drillAll, PAGE.drillIn, drillPg.page);
    return [
      {
        id: 'drill',
        header: null,
        label: drillName(),
        options: rows.map((r, i) => optionOf(r, { posinset: drillPg.from + i, setsize: drillAll.length })),
      },
    ];
  }, [view, drillAll, drillPg.page, drillPg.from, optionOf]); // eslint-disable-line react-hooks/exhaustive-deps -- drillName reads view and cat

  function drillName(): string {
    if (view.v !== 'drill') return '';
    if (view.kind === 'fusion') return t('mc.ensembles');
    if (view.kind === 'claude') return t('mc.claude');
    return cat ? providerLabel(cat, view.pid, word) : word;
  }

  // ── search ────────────────────────────────────────────────────────────────────────────

  const eligibleProviders = useMemo(() => {
    const set = new Set<string>();
    if (!ev || !cat) return set;
    for (const m of cat.models) {
      if (!p.rules.eligible(m.spec, ev)) continue;
      const pr = cat.byPrefix[providers.prefixOf(m.spec)];
      if (pr) set.add(pr.id);
    }
    return set;
  }, [ev, cat, p.rules]);

  const result = useMemo(() => {
    if (!searching || !ix || !ev || deferred === '') return null;
    const group = (spec: string): Group => {
      const r = rowReady(ev, spec);
      return r === 'ready' ? 'ready' : r === 'needs_key' ? 'needs_key' : 'unknown';
    };
    return searchIndex(ix, deferred, searchPages, {
      readiness: group,
      eligible: (spec) => p.rules.eligible(spec, ev) && rowReady(ev, spec) !== 'gone',
      showProvider: (id) => eligibleProviders.has(id),
      fold,
    });
  }, [searching, ix, ev, deferred, searchPages, p.rules, eligibleProviders, fold]);

  const searchGroups: ListGroup[] = useMemo(() => {
    if (!result || !ev) return [];
    const out: ListGroup[] = [];
    const rowsOf = (specs: readonly string[]) =>
      specs
        .map((sp) => rowOf(ev, o, sp))
        .filter((r): r is ModelRow => r !== null)
        .map((r) => optionOf(r));
    if (result.ready.length)
      out.push({
        id: 's-ready',
        header: (
          <span className={s.groupName}>
            {t('search.count', {
              group: t('search.ready'),
              total: result.totals.ready,
            })}
          </span>
        ),
        options: rowsOf(result.ready),
      });
    if (result.unknown.length)
      out.push({
        id: 's-unknown',
        header: (
          <span className={s.groupName}>
            {t('search.count', {
              group: t('search.unknown'),
              total: result.totals.unknown,
            })}
          </span>
        ),
        options: rowsOf(result.unknown),
      });
    for (const h of result.setup) {
      const name = h.providerId === 'fusion' ? t('mc.ensembles') : cat ? providerLabel(cat, h.providerId, word) : word;
      out.push({
        id: `s-setup-${h.providerId}`,
        header: (
          <>
            {h.providerId !== 'fusion' && <ProviderMark id={h.providerId} name={name} />}
            <span className={s.groupName} aria-hidden="true">
              {name}
            </span>
            <span className={s.groupFacts} aria-hidden="true">
              {t('search.count', { group: t('search.setup'), total: h.n })}
            </span>
            <span className={s.srOnly}>{[name, t('search.count', { group: t('search.setup'), total: h.n })].join(' · ')}</span>
          </>
        ),
        options: rowsOf(h.specs),
      });
    }
    return out;
  }, [result, ev, o, optionOf, cat, word, t]);

  // The live region: the final results, LIVE_DELAY_MS after they commit, never on every key.
  useEffect(() => {
    if (!result) return;
    const models = result.totals.ready + result.totals.unknown + result.totals.setup;
    const shown = searchGroups.reduce((n, g) => n + g.options.length, 0) + result.providers.length;
    const timer = setTimeout(() => say(`${t('search.live', { models: t('search.liveModels', { count: models }), providers: t('search.liveProviders', { count: result.totals.providers }) })} ${t('mc.showing', { shown, total: models + result.totals.providers })}`), LIVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [result, searchGroups, say, t]);

  // ── keyboard bridges ──────────────────────────────────────────────────────────────────

  const focusSearch = () => void pf.toFirst(searchRef.current, 'input');
  const onType = (ch: string) => {
    setQuery(query + ch);
    focusSearch();
  };
  const onEscape = () => {
    if (!query) return false;
    setQuery('');
    focusSearch();
    return true;
  };
  const onActivateList = (spec: string) => {
    const from = optionId(`${base}-list`, spec);
    // The pressed option is the one a consent bar gives the focus back to.
    pf.mark(from);
    activate(spec, from);
  };

  /** A page change: the range is said and focus moves to the first row of the new page. `first` names that row:
   *  a spec, a listbox group (see focusAsk.group) or the element whose first button it is. */
  const pageTo = (page: number, total: number, size: number, first: { spec?: string | null; group?: string; within?: string }, k?: keyof typeof searchPages, words: 'page.live' | 'page.groupsLive' = 'page.live') => {
    const pg = pager(total, size, page);
    if (k) setSearchPages((x) => ({ ...x, [k]: pg.page }));
    else patch({ page: pg.page });
    say(t(words, { from: pg.from, to: pg.to, total }));
    if (first.within) ask('within', null, first.within);
    else ask('list', first.spec ?? null, undefined, first.group);
  };

  // ── drawing ───────────────────────────────────────────────────────────────────────────

  const listId = `${base}-list`;
  const countId = `${base}-count`;
  // What this render draws (set while the body is built, read by the head after it): the search field names only a
  // list and a count line that exist (aria-controls / aria-describedby must point at elements on the page); while the
  // caller's setup step stands in for the body, neither is drawn.
  const shown = { list: false, count: false };
  const markCount = () => {
    shown.count = true;
    return countId;
  };
  const headingId = `${base}-h`;

  const heading = (text: string) => (
    <h3 id={headingId} ref={headingRef} tabIndex={-1} className={s.title}>
      {text}
    </h3>
  );

  const search = (label: string) => (
    <div className={s.searchRow} ref={searchRef}>
      <SearchField
        className={s.searchField}
        label={label}
        placeholder={label}
        value={query}
        onChange={setQuery}
        isDisabled={setupHeld}
        aria-controls={shown.list && !p.setup ? listId : undefined}
        aria-describedby={shown.count && !p.setup ? countId : undefined}
      />
    </div>
  );

  const listbox = (groups: readonly ListGroup[], describedBy = countId) => {
    shown.list = true;
    return (
      <ModelListbox
        id={listId}
        labelledBy={headingId}
        describedBy={describedBy}
        groups={groups}
        locked={p.locked}
        onActivate={onActivateList}
        onType={onType}
        onEscape={onEscape}
        focusSpec={focusAsk.target === 'list' ? (focusAsk.spec ?? firstOfGroup(groups, focusAsk.group)) : null}
        focusToken={focusAsk.target === 'list' ? focusAsk.token : undefined}
        renderProbe={p.renderProbe}
      />
    );
  };

  const liveRegion = (
    <div role="status" aria-live="polite" className={s.srOnly}>
      {live}
    </div>
  );

  // Escape in the consent bar: back to the option, nothing chosen.
  const barKeys = (e: BarKey) => {
    if (e.key === 'Escape' && bar) {
      e.preventDefault();
      e.stopPropagation();
      const from = bar.from;
      setBar(null);
      pf.toId(from);
    }
  };

  const consentBar = bar && (
    <div role="group" aria-labelledby={`${base}-bar`} className={s.consent} data-mc-bar="">
      {bar.kind === 'consent' ? (
        <>
          <p id={`${base}-bar`} className={s.consentText}>
            {t('unk.ask', {
              model: midSentence(t, bar.label),
              computer: p.computerName || t('mc.computer'),
            })}
          </p>
          <ConsentButtons
            t={t}
            base={base}
            onKeys={barKeys}
            locked={p.locked}
            onUse={() => confirmConsent(bar.spec, bar.from)}
            onOther={() => {
              const from = bar.from;
              setBar(null);
              pf.toId(from);
            }}
          />
        </>
      ) : (
        <>
          <p id={`${base}-bar`} className={s.consentText}>
            {t('ens.known')}
          </p>
          {memberList(bar.members, `${base}-bar`)}
          <p className={s.state}>{t('ens.maybeMore')}</p>
        </>
      )}
    </div>
  );

  /** An ensemble's members known to need setup, each with Set up; `idBase` keeps the buttons' ids unique. */
  function memberList(members: readonly string[], idBase: string) {
    return (
      <ul className={s.memberList}>
        {members.map((m) => {
          const name = m === 'claude-code' ? t('mc.claude') : cat ? providerLabel(cat, m, word) : word;
          const id = `${idBase}-m-${m.replace(/[^\w-]/g, '_')}`;
          return (
            <li key={m} className={s.member}>
              <span>{name}</span>
              <Button
                variant="secondary"
                size="sm"
                id={id}
                isDisabled={p.locked}
                aria-label={t('dir.setupFor', { provider: name })}
                onPress={() => (m === 'claude-code' ? p.onOtherWay('claude') : setupFor({ provider: m, intent: 'browse' }, id))}
              >
                {t('dir.setup')}
              </Button>
            </li>
          );
        })}
      </ul>
    );
  }

  if (p.noComputer) {
    return (
      <div className={s.browser}>
        {heading(t('mc.ready'))}
        <p className={s.state}>{t('mc.noComputer')}</p>
      </div>
    );
  }

  const bands = ev && ev.catalogue.state === 'ok' && (
    <>
      {ev.catalogue.value.ready === 'failed' && (
        <Band
          tone="warn"
          size="table"
          actions={
            <Button variant="secondary" size="sm" onPress={p.onRetry} busy={retrying}>
              {t('read.retry')}
            </Button>
          }
        >
          {t('read.readyFailed')}
        </Band>
      )}
      {ev.catalogue.value.ready === 'legacy' && (
        <Band tone="neutral" size="table">
          {t('read.legacy')}
        </Band>
      )}
      {p.backgroundFailed && (
        <Band
          tone="warn"
          size="table"
          actions={
            <Button variant="secondary" size="sm" onPress={p.onRetry} busy={retrying}>
              {t('read.retry')}
            </Button>
          }
        >
          {t('read.age', { age: ageText(t, (p.now ?? Date.now)() - ev.at) })}
        </Band>
      )}
    </>
  );

  const backButton = (label: string) => (
    <Button variant="ghost" size="sm" icon="arrow-left" id={`${base}-back`} className={s.back} isDisabled={setupHeld} onPress={back}>
      {label}
    </Button>
  );

  let body: ReactNode;
  // One head shape for every view (Back, heading, extras, search at fixed places), so typing never remounts the field.
  let backLabel: string | null = null;
  let title = t('mc.ready');
  let mark: ReactNode = null;
  let extras: ReactNode = null;
  let searchLabel = t('mc.search');

  // Back belongs to the view, not the read: a retained drill-in or Directory can be left during a wait.
  if (view.v === 'directory') backLabel = t('dir.back');
  else if (view.v === 'drill') backLabel = stack.length > 1 && stack[stack.length - 2]!.view.v === 'directory' ? t('prov.back') : t('dir.back');

  if (view.v === 'drill' && !loading) {
    const name = drillName();
    const dp = view.kind === 'provider' && cat ? cat.byId[view.pid] : undefined;
    const dirState = dp ? connectDir : null;
    const row = dirState ? [...dirState.attention, ...dirState.connected, ...dirState.suggested, ...dirState.all].find((x) => x.id === view.pid) : undefined;
    const state = row ? drillStateWords(t, cat!, row) : null;
    const canSetup = !!row && (row.state === 'needs_key' || row.state === 'unknown' || row.state === 'not_checked' || row.state === 'stored');
    title = name;
    mark = view.kind === 'provider' ? <ProviderMark id={view.pid} name={name} size="md" /> : null;
    extras = (
      <>
        {state && <p className={s.state}>{state}</p>}
        {canSetup && (
          <span>
            <Button variant="primary" size="md" id={`${base}-drill-setup`} isDisabled={p.locked} onPress={() => setupFor({ provider: view.pid, intent: 'browse' }, `${base}-drill-setup`)}>
              {t('dir.setupFor', { provider: name })}
            </Button>
          </span>
        )}
      </>
    );
    if (view.kind === 'provider') searchLabel = t('prov.search', { provider: name });
    body = (
      <>
        <p id={markCount()} className={s.count}>
          {drillAll.length
            ? t('page.live', {
                from: drillPg.from,
                to: drillPg.to,
                total: drillAll.length,
              })
            : t('search.none', { q: query })}
        </p>
        {listbox(drillGroups)}
        {drillPg.pages > 1 && (
          <ModelPager
            pg={drillPg}
            navLabel={t('page.nav', {
              section: t('prov.models', { provider: name }),
            })}
            range={t('page.range', {
              from: drillPg.from,
              to: drillPg.to,
              total: drillAll.length,
            })}
            prev={t('page.prev')}
            next={t('page.next')}
            idBase={`${base}-drill`}
            onPage={(pg) => pageTo(pg, drillAll.length, PAGE.drillIn, { spec: drillAll[pager(drillAll.length, PAGE.drillIn, pg).page * PAGE.drillIn]?.spec ?? null })}
          />
        )}
      </>
    );
  } else {
    // A computer change keeps the open drill-in or Directory: they wait here and come back when the read answers.
    if (loading) title = t('read.wait');
    else if (view.v === 'directory') title = t('dir.title');
    if (searching) body = searchBody();
    else if (view.v === 'directory' && !loading)
      body = ev ? (
        <ProviderDirectory
          evidence={ev}
          purpose={p.purpose}
          verb="choose"
          current={p.value}
          defaultSpec={p.defaultSpec}
          offer={p.offer}
          providerWord={word}
          locked={p.locked}
          idBase={`${base}-dir`}
          pages={dirPages}
          onPages={setDirPages}
          onSetup={(pid, from) => setupFor({ provider: pid, intent: 'browse' }, from)}
          onOpen={(pid, from) => open({ v: 'drill', kind: 'provider', pid }, from)}
          onOtherWay={p.onOtherWay}
        />
      ) : null;
    else body = readyBody();
  }

  const head = (
    <>
      {backLabel !== null ? backButton(backLabel) : null}
      <div className={s.head}>
        {mark}
        {heading(title)}
      </div>
      {extras}
      {search(searchLabel)}
    </>
  );

  function searchBody(): ReactNode {
    // A failed read has nothing to search, and never will: its own view, not a wait that never ends.
    if (ev?.catalogue.state === 'failed') return readyBody();
    if (!ix || !result) return <Skeleton rows={3} />;
    const total = result.totals.ready + result.totals.unknown + result.totals.setup + result.totals.providers;
    if (total === 0)
      return (
        <div className={s.section}>
          <p id={markCount()} className={s.count} {...RESULTS_TIMING} key={deferred}>
            {t('search.none', { q: deferred })}
          </p>
          <ul className={s.actions}>
            <li data-mc-row="">
              <Button
                variant="secondary"
                size="sm"
                onPress={() => {
                  setQuery('');
                  focusSearch();
                }}
              >
                {t('search.clear')}
              </Button>
            </li>
            {p.offer?.endpoint !== false && (
              <li data-mc-row="">
                <Button variant="secondary" size="sm" isDisabled={p.locked} onPress={() => p.onOtherWay('endpoint')}>
                  {t('dir.endpoint')}
                </Button>
              </li>
            )}
          </ul>
        </div>
      );
    const shown = searchGroups.reduce((n, g) => n + g.options.length, 0) + result.providers.length;
    const sp = (k: keyof typeof searchPages, tot: number, size: number, title: string) =>
      tot > size ? (
        <ModelPager
          pg={pager(tot, size, searchPages[k])}
          navLabel={t('page.nav', { section: title })}
          range={t('page.range', {
            from: pager(tot, size, searchPages[k]).from,
            to: pager(tot, size, searchPages[k]).to,
            total: tot,
          })}
          prev={t('page.prev')}
          next={t('page.next')}
          idBase={`${base}-sp-${k}`}
          onPage={(pg) => pageTo(pg, tot, size, k === 'providers' ? { within: `${base}-sp-rows` } : { group: k === 'setup' ? 's-setup-' : `s-${k}` }, k)}
        />
      ) : null;
    return (
      <>
        <p id={markCount()} className={s.count} {...RESULTS_TIMING} key={deferred}>
          {t('mc.showing', { shown, total })}
        </p>
        {result.providers.length > 0 && (
          <section className={s.section} aria-labelledby={`${base}-sh-p`}>
            <h4 id={`${base}-sh-p`} className={s.sectionTitle}>
              {t('search.count', {
                group: t('search.providers'),
                total: result.totals.providers,
              })}
            </h4>
            <ul className={s.rows} id={`${base}-sp-rows`}>
              {result.providers.map((pid) => {
                const name = cat ? providerLabel(cat, pid, word) : word;
                const bid = `${base}-sp-open-${pid.replace(/[^\w-]/g, '_')}`;
                return (
                  <li key={pid} data-mc-row="">
                    <ListItemButton id={bid} leading={<ProviderMark id={pid} name={name} />} onPress={() => open({ v: 'drill', kind: 'provider', pid }, bid)}>
                      {name}
                    </ListItemButton>
                  </li>
                );
              })}
            </ul>
            {sp('providers', result.totals.providers, PAGE.searchProviders, t('search.providers'))}
          </section>
        )}
        {searchGroups.length > 0 && listbox(searchGroups)}
        {sp('ready', result.totals.ready, PAGE.searchReady, t('search.ready'))}
        {sp('unknown', result.totals.unknown, PAGE.searchUnknown, t('search.unknown'))}
        {result.setup.some((h) => h.n > h.specs.length) && (
          <ul className={s.actions}>
            {result.setup
              .filter((h) => h.n > h.specs.length)
              .map((h) => {
                const name = h.providerId === 'fusion' ? t('mc.ensembles') : cat ? providerLabel(cat, h.providerId, word) : word;
                const bid = `${base}-sp-more-${h.providerId.replace(/[^\w-]/g, '_')}`;
                return (
                  <li key={h.providerId} data-mc-row="">
                    <Button
                      variant="ghost"
                      size="sm"
                      iconEnd="chevron-right"
                      id={bid}
                      onPress={() =>
                        open(
                          h.providerId === 'fusion'
                            ? { v: 'drill', kind: 'fusion', pid: 'fusion' }
                            : {
                                v: 'drill',
                                kind: 'provider',
                                pid: h.providerId,
                              },
                          bid,
                          query,
                        )
                      }
                    >
                      {t('search.moreIn', {
                        count: h.n - h.specs.length,
                        provider: name,
                      })}
                    </Button>
                  </li>
                );
              })}
          </ul>
        )}
        {sp('setup', result.setupProviders, PAGE.searchSetupProviders, t('search.setup'))}
      </>
    );
  }

  function readyBody(): ReactNode {
    if (!ev || ev.catalogue.state === 'loading')
      return (
        <>
          {readyGroups.length > 0 && listbox(readyGroups, headingId)}
          <Skeleton rows={3} />
        </>
      );
    const failedRows = readyGroups.reduce((n, g) => n + g.options.length, 0);
    if (ev.catalogue.state === 'failed')
      return (
        <>
          <ErrorState size="sm" title={t('read.failed')} onRetry={p.onRetry} retrying={retrying} error={ev.catalogue.err} />
          <p id={markCount()} className={s.count}>
            {t('mc.showing', { shown: failedRows, total: failedRows })}
          </p>
          {readyGroups.length > 0 && listbox(readyGroups)}
          <div className={s.more}>
            <span>
              <Button variant="secondary" size="md" isDisabled={p.locked} onPress={() => p.onOtherWay('ai')} data-mc-row="">
                {t('mc.openAi')}
              </Button>
            </span>
          </div>
        </>
      );
    if (!rv) return null;
    if (rv.empty)
      return (
        <EmptyState
          size="sm"
          title={t('mc.empty')}
          action={
            <Button variant="secondary" isDisabled={p.locked} onPress={() => p.onOtherWay('ai')}>
              {t('mc.openAi')}
            </Button>
          }
        />
      );
    const dir = chooseDir!;
    const shown = readyGroups.reduce((n, g) => n + g.options.length, 0);
    const allButtons: ReactNode[] = [];
    const groupsWithMore = [...rv.groups, ...(rv.ensembles ? [rv.ensembles] : []), ...(rv.claude ? [rv.claude] : [])].filter((g) => g.total > g.options.length);
    for (const g of groupsWithMore) {
      const bid = `${base}-all-${g.id.replace(/[^\w-]/g, '_')}`;
      const text = g.kind === 'fusion' ? t('mc.allEnsembles', { count: g.total }) : g.kind === 'claude' ? t('mc.allClaude') : t('mc.all', { count: g.total, provider: g.label });
      const next: View =
        g.kind === 'fusion' ? { v: 'drill', kind: 'fusion', pid: 'fusion' } : g.kind === 'claude' ? { v: 'drill', kind: 'claude', pid: 'claude-code' } : { v: 'drill', kind: 'provider', pid: g.id };
      allButtons.push(
        <li key={g.id} data-mc-row="">
          <Button variant="ghost" size="sm" iconEnd="chevron-right" className={s.allButton} id={bid} onPress={() => open(next, bid)}>
            {text}
          </Button>
        </li>,
      );
    }
    const inUse = rv.inUse;
    return (
      <>
        {inUse && (
          <div className={s.inUse} data-mc-row="">
            <span className={s.sectionTitle}>{t('mc.inUse')}</span>
            <p className={s.reason}>
              {inUse.why === 'gone'
                ? t('mc.gone', { model: midSentence(t, inUse.label) })
                : inUse.why === 'unlisted'
                  ? t('mc.unlisted', { model: startSentence(t, inUse.label) })
                  : inUse.why === 'needs_key'
                    ? t('mc.inUseSetup', { model: startSentence(t, inUse.label) })
                    : t('mc.inUseUnknown', {
                        model: midSentence(t, inUse.label),
                        computer: p.computerName || t('mc.computer'),
                      })}
            </p>
            {inUse.why === 'needs_key' && inUse.provider === 'fusion' && ev && (
              <>
                <p className={s.consentText}>{t('ens.known')}</p>
                {memberList(ensembleSetup(ev, inUse.spec), `${base}-inuse`)}
                <p className={s.state}>{t('ens.maybeMore')}</p>
              </>
            )}
            {inUse.why === 'needs_key' && inUse.provider === 'claude-code' && (
              <span>
                <Button variant="secondary" size="sm" id={`${base}-inuse`} isDisabled={p.locked} onPress={() => p.onOtherWay('claude')}>
                  {t('dir.setupFor', { provider: t('mc.claude') })}
                </Button>
              </span>
            )}
            {inUse.why === 'needs_key' && inUse.provider !== 'fusion' && inUse.provider !== 'claude-code' && (
              <span>
                <Button
                  variant="secondary"
                  size="sm"
                  id={`${base}-inuse`}
                  isDisabled={p.locked}
                  onPress={() =>
                    setupFor(
                      {
                        provider: inUse.provider,
                        spec: inUse.spec,
                        intent: 'choose',
                      },
                      `${base}-inuse`,
                    )
                  }
                >
                  {t('dir.setupFor', {
                    provider: inUse.providerLabel || word,
                  })}
                </Button>
              </span>
            )}
            {(inUse.why === 'unknown' || inUse.why === 'unlisted') && (
              <span>
                <Button
                  variant="secondary"
                  size="sm"
                  id={`${base}-inuse`}
                  isDisabled={p.locked}
                  onPress={() => {
                    pf.mark(`${base}-inuse`);
                    setBar({
                      kind: 'consent',
                      spec: inUse.spec,
                      label: inUse.label,
                      from: `${base}-inuse`,
                    });
                  }}
                >
                  {t('unk.use')}
                </Button>
              </span>
            )}
          </div>
        )}
        <p id={markCount()} className={s.count}>
          {t('mc.showing', { shown, total: shown })}
        </p>
        {readyGroups.length > 0 && listbox(readyGroups)}
        {rv.readyTotal === 0 && <p className={s.state}>{t('mc.nothing')}</p>}
        {allButtons.length > 0 && <ul className={s.actions}>{allButtons}</ul>}
        {rv.groupPager.pages > 1 && (
          <ModelPager
            pg={rv.groupPager}
            navLabel={t('page.nav', { section: t('mc.ready') })}
            range={t('page.groups', {
              from: rv.groupPager.from,
              to: rv.groupPager.to,
              total: rv.groupPager.total,
            })}
            prev={t('page.prev')}
            next={t('page.next')}
            idBase={`${base}-groups`}
            onPage={(pg) => pageTo(pg, rv.groupPager.total, PAGE.readyGroups, { group: '' }, undefined, 'page.groupsLive')}
          />
        )}
        <section className={s.more} aria-labelledby={`${base}-more`}>
          <h4 id={`${base}-more`} className={s.sectionTitle}>
            {t('mc.more')}
          </h4>
          <p className={s.cardFacts}>{t('mc.moreLine')}</p>
          {/* One wrapping row: the suggested providers, then the whole directory. */}
          <ul className={s.actions}>
            {dir.suggested.map((sp) => {
              const name = sp.label || word;
              const bid = `${base}-sug-${sp.id.replace(/[^\w-]/g, '_')}`;
              return (
                <li key={sp.id} data-mc-row="">
                  {/* The name alone: a letter mark in the button's mono capitals reads as a count ('0 OPENAI'). */}
                  <Button variant="secondary" size="sm" id={bid} onPress={() => open({ v: 'drill', kind: 'provider', pid: sp.id }, bid)}>
                    {name}
                  </Button>
                </li>
              );
            })}
            <li data-mc-row="">
              <Button variant={rv.readyTotal === 0 ? 'primary' : 'secondary'} size="sm" id={`${base}-open-dir`} onPress={() => open({ v: 'directory' }, `${base}-open-dir`)}>
                {t('mc.setupOpen')}
              </Button>
            </li>
          </ul>
        </section>
      </>
    );
  }

  return (
    <div ref={rootRef} className={s.browser} onFocus={keep.onFocus} onBlur={keep.onBlur}>
      {head}
      {bands}
      {p.setup ?? body}
      {!p.setup && consentBar}
      {liveRegion}
    </div>
  );
}

function ConsentButtons({ t, base, locked, onUse, onOther, onKeys }: { t: T; base: string; locked?: boolean; onUse: () => void; onOther: () => void; onKeys: (e: BarKey) => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  const pf = usePickerFocus();
  // Focus moves to Use it anyway when the bar opens.
  useLayoutEffect(() => {
    pf.toFirst(ref.current, 'button');
  }, [pf]);
  return (
    <>
      <span ref={ref}>
        <Button variant="secondary" size="sm" id={`${base}-use`} isDisabled={locked} onPress={onUse} onKeyDown={onKeys}>
          {t('unk.use')}
        </Button>
      </span>
      <Button variant="ghost" size="sm" onPress={onOther} onKeyDown={onKeys}>
        {t('unk.other')}
      </Button>
    </>
  );
}

/** The first option of the named group (focusAsk.group), or null when none is named or drawn. */
function firstOfGroup(groups: readonly ListGroup[], group: string | undefined): string | null {
  if (group === undefined) return null;
  const g = groups.find((x) => (group === '' ? x.id !== '__inherit' && x.id !== 'fallback' && x.id !== 'held' && x.options.length > 0 : group.endsWith('-') ? x.id.startsWith(group) : x.id === group));
  return g?.options[0]?.spec ?? null;
}

function drillStateWords(t: T, cat: providers.Catalogue, row: providers.DirProvider): string {
  if (row.state === 'not_checked') return t('dir.notChecked');
  if (row.state === 'stored') return t('dir.keyStored');
  if (row.state === 'unknown') return t('prov.state.unknown');
  if (row.state === 'needs_key')
    return t('prov.state.needs_key', {
      how: t(`dir.how.${howOf(cat, row.id)}`),
    });
  return row.pay
    ? t('prov.state.readyVia', {
        via: t(`mc.via.${row.pay === 'ai_credit' ? 'included' : row.pay}`),
      })
    : t('prov.state.ready');
}
