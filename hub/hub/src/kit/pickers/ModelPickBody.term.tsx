// ModelPickBody in the terminal (the web's ModelPickBody.tsx): the one model picker's body. The same reads, rules
// and presses as the web body: rows come from the evidence (modelViews.pickBaseOf, modelPickLogic.pickView), every
// press is judged again at the press (modelViews.activationOf), and Use it anyway judges once more. A change to those
// rules in ModelPickBody.tsx is made here too.
//   Choose a model
//   / Search models and providers
//   Show: Ready   Provider   Can   Window   List price, input
//   214 of 7,077 models
//   ›(•) GPT-5  Current                                        400K · $1.25 / $10
//   Previous  1–20 of 214  Next
// - The list is the terminal ModelListbox, one page of ROWS options at a time (the web draws one virtualized list): a
//   filter or a search starts at the first page.
// - A printable key in the list goes to the search, Escape there clears it, as on the web.
// - The star acts on the held value (the list does not report its focused option here).
// - The consent bar takes the focus when it opens; Escape or Choose another gives it back to the option pressed.
import { providers } from '@core';
import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type * as Web from './ModelPickBody';
import { Box, Text } from '../../term/prim';
import { Button } from '../controls/Button';
import { FilterChips, type FilterChip, type FilterOption } from '../data/FilterChips';
import { fold as kitFold } from '../data/DataTableViewLogic';
import { SearchField } from '../forms/fields';
import { Band } from '../states/Band';
import { Skeleton } from '../states/States';
import { useStrings } from '../strings';
import type { SetupRequest } from './ModelBrowser';
import { ModelListbox, ModelPager, optionId, type ListGroup, type ListOption } from './ModelListbox';
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
  type PickFilters,
  type PickItem,
  type PickRow,
  type PriceBand,
  type WindowBand,
} from './modelPickLogic';
import { pager } from './modelPaging';
import { activationOf, fallbackRows, heldRow, inUseOf, midSentence, modelLabel, pickBaseOf, providerLabel, type ViewOptions } from './modelViews';
import { usePickerFocus } from './pickerFocus.web';
import { ProviderMark } from './ProviderMark';
import strings from './ModelPick.strings.en.json';
import mcStrings from './ModelChooser.strings.en.json';

export type { PickExtras, ModelPickBodyProps } from './ModelPickBody';

type OptionItem = Extract<PickItem, { kind: 'row' | 'inherit' }>;
type HeadingItem = Extract<PickItem, { kind: 'heading' }>;
type Bar = { kind: 'consent'; spec: string; label: string; from: string } | { kind: 'ensemble'; spec: string; label: string; members: string[]; from: string } | null;

/** Options drawn at once. */
const ROWS = 20;
const HAS = ['thinking', 'images', 'tools', 'favourites', 'recent'] as const;
type Has = (typeof HAS)[number];

/** "64K", "200K", "1M", "1.05M". */
export const windowText: typeof Web.windowText = (n) => {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
};
const money = (n: number): string => (n >= 10 ? String(Math.round(n)) : String(+n.toFixed(2)));
/** The id of an ensemble member's set-up button in the bar. */
const barMemberId = (base: string, mid: string): string => `${base}-bar-m-${mid.replace(/[^\w-]/g, '_')}`;

export const ModelPickBody: typeof Web.ModelPickBody = (p) => {
  const t = useStrings(strings);
  const kt = useStrings(mcStrings);
  const autoId = useId();
  const base = p.id ?? `mp${autoId.replace(/[^A-Za-z0-9_-]/g, '')}`;
  const fold = p.fold ?? kitFold;
  const word = p.providerWord ?? kt('mc.provider');
  const modelWord = kt('mc.anyModel');
  const ev = p.evidence;
  const cat = ev && ev.catalogue.state === 'ok' ? ev.catalogue.value.cat : null;
  const loading = !ev || ev.catalogue.state === 'loading';
  const failed = ev?.catalogue.state === 'failed';
  const prefs = p.pick.prefs;
  const onPrefs = p.pick.onPrefs;
  const focus = usePickerFocus();

  const o: ViewOptions = useMemo(
    () => ({ rules: p.rules, purpose: p.purpose, value: p.value, defaultSpec: p.defaultSpec, offer: p.offer, providerWord: word, modelWord, fallback: p.fallback }),
    [p.rules, p.purpose, p.value, p.defaultSpec, p.offer, word, modelWord, p.fallback],
  );
  const words = useMemo(() => ({ ensembles: kt('mc.ensembles'), claude: kt('mc.claude'), claudeDefault: kt('mc.claudeDefault') }), [kt]);

  // Rows and their index: once per evidence. After a settled failure the caller's fallback rows stand in (can't tell,
  // usable with consent).
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
  // The search typed while a read is failed (null: none): only the search applies then; the person's filters come back
  // with the next good read.
  const [failQuery, setFailQuery] = useState<string | null>(null);
  const kept: PickFilters = filters ?? (ix && !failed ? openingFilters(ix, prefs) : NO_FILTERS);
  const f: PickFilters = failed ? { ...NO_FILTERS, query: failQuery ?? filters?.query ?? '' } : failQuery !== null ? { ...kept, query: failQuery } : kept;
  const query = f.query;
  const deferredQuery = useDeferredValue(query);
  const [bar, setBar] = useState<Bar>(null);
  const [page, setPage] = useState(0);
  const [focusAsk, setFocusAsk] = useState<{ token: number; spec: string | null }>({ token: 0, spec: null });
  const searchRef = useRef<HTMLInputElement>(null);

  const scopeKey = ev ? `${ev.scope.account}|${ev.scope.realm}|${ev.scope.computer}|${ev.scope.gen}|${ev.scope.boot}` : '';
  // A scope change closes the consent bar; the filters stay.
  useEffect(() => setBar(null), [scopeKey]);

  const setupHeld = !!p.setup && !!p.locked;
  /** Every filter change: ends the caller's setup step (a view change), closes the bar, remembers what is kept. */
  const setFilters = (next: PickFilters) => {
    if (setupHeld) return;
    if (p.setup) p.onSetupView?.();
    setBar(null);
    setPage(0);
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
    setPage(0);
    setFailQuery(null);
    setFiltersState({ ...NO_FILTERS, readiness: 'all', providers: [openAsk.pid] });
  }, [openAsk?.token]); // eslint-disable-line react-hooks/exhaustive-deps -- each token opens once

  const recent = useMemo(() => recentList(prefs.recent, p.pick.inUse), [p.pick.inUse, prefs.recent]);
  const inheritLabel = p.pick.inherit?.label ?? kt('mc.inherit');
  const view = useMemo(
    () => (ix ? pickView(ix, { ...f, query: deferredQuery }, { current: p.value, favourites: prefs.fav, recent, inherit: p.rules.inherit ? { label: inheritLabel } : null, fold }) : null),
    // f is rebuilt each render from stable parts; its fields are the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ix, deferredQuery, f.readiness, f.providers, f.thinking, f.images, f.tools, f.window, f.price, f.favourites, f.recent, p.value, prefs.fav, recent, p.rules.inherit, inheritLabel, fold],
  );

  // ── a press ───────────────────────────────────────────────────────────────────────────

  const rowBySpec = useMemo(() => new Map((ix?.rows ?? []).map((r) => [r.spec, r])), [ix]);
  const labelFor = useCallback((spec: string) => rowBySpec.get(spec)?.label ?? modelLabel(cat, spec, modelWord), [rowBySpec, cat, modelWord]);

  const choose = (spec: string, consent: boolean, readiness: 'ready' | 'unknown') => {
    if (!ev) return;
    setBar(null);
    p.onChoose({ kind: 'model', spec, readiness, consent, scope: ev.scope, seq: ev.seq });
  };
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
        // The control just pressed has the focus: the bar gives it back there.
        focus.mark(from);
        return setBar({ kind: 'consent', spec, label: labelFor(spec), from });
      case 'ensemble':
        focus.mark(from);
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
  /** Use it anyway: judged again on the newest evidence, rules and lock. */
  const confirmConsent = (spec: string, from: string) => {
    if (p.locked || !ev) return;
    const v = providers.judge({ kind: 'model', spec, readiness: 'unknown', consent: true, scope: ev.scope, seq: ev.seq }, spec, ev, ev.scope, p.rules);
    if (v.ok && v.readiness === 'unknown') return choose(spec, true, 'unknown');
    setBar(null);
    if (v.ok || v.why === 'needs_setup') return activate(spec, from);
    focus.toId(from);
  };
  // The bar takes the focus as it opens, as on the web (ConsentButtons on mount; the ensemble bar on each bar). In the
  // terminal a Button's autoFocus lands only where nothing has the focus, and the row just pressed still has it. Asked
  // in an effect of the commit that draws the bar: its buttons register in their own effects, which run first, so toId
  // finds the button at once and leaves nothing owed for a later toEl.
  const barKind = bar?.kind ?? null;
  useEffect(() => {
    if (barKind === 'consent') focus.toId(`${base}-use`);
  }, [barKind, base, focus]);
  useEffect(() => {
    const first = bar?.kind === 'ensemble' ? bar.members[0] : undefined;
    if (first !== undefined) focus.toId(barMemberId(base, first));
  }, [bar, base, focus]);

  // Back from the setup step: the list, on the held value when it shows.
  const hadSetup = useRef(false);
  useEffect(() => {
    if (p.setup) hadSetup.current = true;
    else if (hadSetup.current) {
      hadSetup.current = false;
      if (view && p.value !== '' && view.items.some((i) => i.kind === 'row' && i.row.spec === p.value)) setFocusAsk((a) => ({ token: a.token + 1, spec: p.value }));
    }
  }, [p.setup]); // eslint-disable-line react-hooks/exhaustive-deps -- runs when the setup step opens or closes

  // ── drawing ───────────────────────────────────────────────────────────────────────────

  const listId = `${base}-list`;
  const headingId = `${base}-h`;
  const countId = `${base}-count`;
  const heading = (
    <Text bold sem={{ role: 'heading', level: 3, id: headingId }}>
      {loading && !p.noComputer ? kt('read.wait') : t('mp.title')}
    </Text>
  );

  if (p.noComputer)
    return (
      <Box dir="column" gap={1} shrink={0}>
        {heading}
        <Text colour="muted">{kt('mc.noComputer')}</Text>
      </Box>
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

  const head = (it: HeadingItem): ReactNode => {
    if (!it.group) return <Text bold>{it.section === 'favourites' ? t('mp.favourites') : t('mp.recent')}</Text>;
    const g = it.group;
    return (
      <>
        {g.id !== 'fusion' && g.id !== 'claude-code' && <ProviderMark id={g.id} name={g.label} />}
        <Text bold>{g.label}</Text>
        <Text colour="muted">{[readyWord(g.ready), t('mp.groupCount', { count: g.count })].join(' · ')}</Text>
      </>
    );
  };

  // One page of the view's options, each under the heading in force.
  const pg = pager(view?.total ?? 0, ROWS, page);
  const groups: ListGroup[] = [];
  if (view) {
    let at = 0;
    let heldHead: HeadingItem | null = null;
    let open: { key: string; options: ListOption[] } | null = null;
    for (const it of view.items) {
      if (it.kind === 'heading') {
        heldHead = it;
        open = null;
        continue;
      }
      at += 1;
      if (at < pg.from || at > pg.to) continue;
      if (!open) {
        const options: ListOption[] = [];
        open = { key: heldHead?.key ?? 'top', options };
        groups.push(heldHead ? { id: heldHead.key, header: head(heldHead), options } : { id: 'top', header: null, label: t('mp.title'), options });
      }
      open.options.push(option(it));
    }
  }
  const toPage = (n: number) => {
    setPage(n);
    // The cursor follows to the page's first option.
    setFocusAsk((a) => ({ token: a.token + 1, spec: '\u0000' }));
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
        options: fc.providers.map((pv) => ({ value: pv.id, label: pv.label, count: pv.count })),
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

  const retry = (
    <Button variant="secondary" size="sm" onPress={p.onRetry} busy={!!p.retrying}>
      {kt('read.retry')}
    </Button>
  );
  const age = (ms: number): string => {
    const min = Math.floor(ms / 60000);
    if (min < 1) return kt('age.now');
    if (min < 60) return kt('age.min', { count: min });
    return kt('age.hour', { count: Math.floor(min / 60) });
  };
  const bands = ev && ev.catalogue.state === 'ok' && (
    <>
      {ev.catalogue.value.ready === 'failed' && (
        <Band tone="warn" size="table" actions={retry}>
          {kt('read.readyFailed')}
        </Band>
      )}
      {ev.catalogue.value.ready === 'legacy' && (
        <Band tone="neutral" size="table">
          {kt('read.legacy')}
        </Band>
      )}
      {p.backgroundFailed && (
        <Band tone="warn" size="table" actions={retry}>
          {kt('read.age', { age: age((p.now ?? Date.now)() - ev.at) })}
        </Band>
      )}
    </>
  );
  const failedBand = failed && (
    <Band tone="warn" size="table" actions={retry}>
      {kt('read.failed')}
    </Band>
  );

  const barBack = () => {
    const from = bar?.from;
    setBar(null);
    if (from) focus.toId(from);
  };
  // Escape on any of the bar's buttons: back to the option, nothing chosen.
  const barKeys = (e: { key: string; preventDefault: () => void; stopPropagation: () => void }) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      barBack();
    }
  };
  // The words that name the bar: a Text's own id names nothing in the semantics tree (a Text with no role reads as plain
  // text), so they go in as a `text` node with that id, as SettingGroup's words do.
  const barWords = !bar ? '' : bar.kind === 'consent' ? kt('unk.ask', { model: midSentence(kt, bar.label), computer: p.computerName || kt('mc.computer') }) : kt('ens.known');
  const consentBar = bar && (
    <Box dir="column" gap={1} shrink={0} border padX={1} sem={{ role: 'group', labelledBy: `${base}-bar` }}>
      {bar.kind === 'consent' ? (
        <>
          <Text sem={{ id: `${base}-bar`, role: 'text', name: barWords }}>{barWords}</Text>
          <Box dir="row" gap={2} shrink={0}>
            <Button variant="secondary" size="sm" id={`${base}-use`} autoFocus isDisabled={p.locked} onPress={() => confirmConsent(bar.spec, bar.from)} onKeyDown={barKeys}>
              {kt('unk.use')}
            </Button>
            <Button variant="ghost" size="sm" onPress={barBack} onKeyDown={barKeys}>
              {kt('unk.other')}
            </Button>
          </Box>
        </>
      ) : (
        <>
          <Text sem={{ id: `${base}-bar`, role: 'text', name: barWords }}>{barWords}</Text>
          <Box dir="column" shrink={0} sem={{ role: 'list' }}>
            {bar.members.map((mid, i) => {
              const name = mid === 'claude-code' ? kt('mc.claude') : cat ? providerLabel(cat, mid, word) : word;
              return (
                <Box key={mid} dir="row" gap={2} shrink={0} sem={{ role: 'listitem' }}>
                  <Text>{name}</Text>
                  <Button variant="secondary" size="sm" id={barMemberId(base, mid)} autoFocus={i === 0} isDisabled={p.locked} aria-label={kt('dir.setupFor', { provider: name })} onKeyDown={barKeys} onPress={() => (mid === 'claude-code' ? p.onOtherWay('claude') : setupFor({ provider: mid, intent: 'browse' }))}>
                    {kt('dir.setup')}
                  </Button>
                </Box>
              );
            })}
          </Box>
          <Text colour="muted">{kt('ens.maybeMore')}</Text>
          <Box dir="row" shrink={0}>
            <Button variant="ghost" size="sm" onPress={barBack} onKeyDown={barKeys}>
              {kt('unk.other')}
            </Button>
          </Box>
        </>
      )}
    </Box>
  );

  // The star acts on the held value; never on the inherit row.
  const starSpec = p.value && rowBySpec.has(p.value) ? p.value : null;
  const starred = starSpec !== null && prefs.fav.includes(starSpec);
  // "Your own endpoint" stays offered whatever the list shows (an empty search, a failed read).
  const listed = !failed && !!view;
  const endpointOn = p.offer?.endpoint !== false && !loading;
  const starBar = (listed || endpointOn) && (
    <Box dir="row" wrap gapX={2} shrink={0}>
      {listed && starSpec !== null && (
        <Button variant="ghost" size="sm" isDisabled={setupHeld} aria-label={t(starred ? 'star.remove' : 'star.add', { model: labelFor(starSpec) })} onPress={() => onPrefs((pr) => toggleFavourite(pr, starSpec))}>
          {t(starred ? 'star.removeShort' : 'star.addShort')}
        </Button>
      )}
      {listed && view.staleFavourites.length > 0 && (
        <>
          <Text colour="muted">{t('stale', { count: view.staleFavourites.length })}</Text>
          <Button variant="ghost" size="sm" onPress={() => onPrefs((pr) => ({ ...pr, fav: pr.fav.filter((sp) => !view.staleFavourites.includes(sp)) }))}>
            {t('stale.remove')}
          </Button>
        </>
      )}
      {endpointOn && (
        <Button variant="secondary" size="sm" id={`${base}-endpoint`} isDisabled={p.locked} onPress={() => p.onOtherWay('endpoint')}>
          {kt('dir.endpoint')}
        </Button>
      )}
    </Box>
  );

  // The held value the list cannot show: one this computer does not list (it may still run: Use it anyway) or no
  // longer offers.
  const inUse = ev && !loading ? inUseOf(ev, o) : null;
  const inUseCard = inUse && (inUse.why === 'unlisted' || inUse.why === 'gone') && (
    <Box dir="column" shrink={0} border padX={1}>
      <Text>{kt(inUse.why === 'gone' ? 'mc.gone' : 'mc.unlisted', { model: inUse.label })}</Text>
      {inUse.why === 'unlisted' && (
        <Box dir="row" shrink={0}>
          <Button variant="secondary" size="sm" id={`${base}-inuse`} isDisabled={p.locked} onPress={() => activate(inUse.spec, `${base}-inuse`)}>
            {kt('unk.use')}
          </Button>
        </Box>
      )}
    </Box>
  );

  let body: ReactNode;
  if (p.setup) body = p.setup;
  else if (loading) {
    const held = heldRow(o, cat);
    body = (
      <>
        {held && (
          <Text colour="muted">
            {kt('mc.current')}: {held.label || kt('mc.claudeDefault')}
          </Text>
        )}
        <Skeleton rows={3} />
      </>
    );
  } else if (!view || !ix) body = <Skeleton rows={3} />;
  else if (view.total === 0)
    body = (
      <Box dir="column" gap={1} shrink={0}>
        <Text sem={{ id: countId, role: 'text', name: t('none.title') }}>{t('none.title')}</Text>
        <Box dir="row" wrap gapX={2} shrink={0}>
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
        </Box>
      </Box>
    );
  else {
    // The count describes the list (its words go in as a `text` node, as the bar's do).
    const count = t('mp.count', { shown: view.matched.toLocaleString(), total: ix.rows.length.toLocaleString() });
    body = (
      <>
        <Text colour="muted" sem={{ id: countId, role: 'text', name: count }}>
          {count}
        </Text>
        <ModelListbox
          id={listId}
          labelledBy={headingId}
          describedBy={countId}
          groups={groups}
          locked={p.locked}
          onActivate={(spec) => activate(spec, optionId(listId, spec))}
          onType={(ch) => {
            setQuery(query + ch);
            searchRef.current?.focus();
          }}
          onEscape={() => {
            if (!query) return false;
            setQuery('');
            searchRef.current?.focus();
            return true;
          }}
          focusSpec={focusAsk.spec}
          focusToken={focusAsk.token}
          renderProbe={p.renderProbe}
        />
        {pg.pages > 1 && (
          <ModelPager
            pg={pg}
            navLabel={kt('page.nav', { section: t('mp.title') })}
            range={kt('page.range', { from: pg.from.toLocaleString(), to: pg.to.toLocaleString(), total: pg.total.toLocaleString() })}
            prev={kt('page.prev')}
            next={kt('page.next')}
            onPage={toPage}
            idBase={`${base}-pg`}
          />
        )}
      </>
    );
  }

  return (
    <Box dir="column" gap={1} shrink={0}>
      {heading}
      {bands}
      {failedBand}
      <SearchField label={t('mp.search')} placeholder={t('mp.search')} value={query} onChange={setQuery} isDisabled={setupHeld || loading} inputRef={searchRef} />
      {chips.length > 0 && <FilterChips filters={chips} onClearAll={() => setFilters(clearFilters(f))} />}
      {!p.setup && inUseCard}
      {consentBar}
      {body}
      {!p.setup && starBar}
    </Box>
  );
};
