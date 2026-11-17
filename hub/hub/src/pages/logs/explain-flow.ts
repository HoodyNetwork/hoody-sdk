// The Explain drawer's state machine. It wraps one
// explain.ts session: "will read exactly this" (the scrubbed payload), the model it will use and
// what that costs, one Ask that sends exactly one request, and the outcome in words.
//
// C9: Ask sends one request per press and never resends. An outcome of "lost" (no answer came
// back) stays on screen until the person asks again; a new model list that arrives while a request
// is out waits for its outcome and never rewrites it.
//
// The model: readiness comes from the evidence the drawer's chooser reads
// (setEvidence), never from a name. Ask judges the pick first (providers.judge with the Explain rules: an output cap,
// no ensembles) against the newest accepted evidence of today's scope and the held choice; when the judgement is not
// ok the reason is the outcome and nothing is sent. Consent ("Use it anyway") is per model and per scope: a scope
// change drops the held choice.
import { providers } from '@core';
import * as E from './explain';

type Choice = providers.Choice;
type Why = Extract<providers.Verdict, { ok: false }>['why'];

export interface ExplainView {
  subject: string;
  name: string | null;
  /** What the helper will read, scrubbed. */
  text: string;
  /** The instructions sent with it. */
  system: string;
  /** Set when the payload was cut to fit: the newest `shown` of `total` entries (or last lines of output). */
  fewer: { output: boolean; shown: number; total: number } | null;
  /** The model list is being read. */
  loading: boolean;
  /** The page's rows, readiness from the evidence (E.explainRows). */
  rows: E.ModelRow[];
  pick: string | null;
  /** The label of the picked model, '' for a generic one. */
  label: string;
  /** The pick's readiness from the evidence ('unknown' before any); null without a pick. */
  ready: E.Readiness | null;
  /** The held choice (the chooser's, or a consent given here); null for a pick the page resolved. */
  choice: Choice | null;
  /** The rules the chooser and Ask share: Explain's, with the page's rows and the pick as fallback specs. */
  rules: providers.JudgeRules;
  /** The configured default agent's own model, when it resolved the pick (the chooser's "default" tag). */
  defaultSpec: string | null;
  /** Cost line key and values (`explain.cost.*`), null without a pick. */
  cost: ReturnType<typeof E.costLine> | null;
  /** What the model list read has to say, apart from a request's outcome: 'model.failed' | 'unlisted' | null. */
  note: 'model.failed' | 'unlisted' | null;
  picker: boolean;
  busy: boolean;
  asked: boolean;
  out: ExplainOut | null;
  closed: boolean;
}

export type ExplainOut =
  | { kind: 'asking' }
  | { kind: 'answer'; text: string; cut: boolean }
  | { kind: 'choose' }
  /** Ask judged the pick and sent nothing. */
  | { kind: 'judge'; why: Why }
  | { kind: 'lost' | 'busy' | 'old' | 'refused' | 'empty' | 'declined' | 'notSent' };

export interface ExplainFlow {
  get(): ExplainView;
  subscribe(fn: () => void): () => void;
  start(): void;
  /** The chooser handed a choice (ready, or unknown with consent). */
  choose(c: Choice): void;
  /** "Use it anyway": consent for the pick in today's scope. */
  consent(): void;
  /** The chooser's newest accepted evidence and today's scope (null = none yet / no computer). */
  setEvidence(ev: providers.Evidence | null, scope: providers.Scope | null): void;
  /** The cost line of a spec, for the chooser's facts. */
  costOf(spec: string): ReturnType<typeof E.costLine>;
  togglePicker(): void;
  /**
   * Ask. `at` is the evidence and scope the drawer shows at the moment of the press: the judgement uses exactly that
   * snapshot (never a copy the flow was given earlier), and it becomes the flow's evidence before the send.
   */
  ask(at?: { ev: providers.Evidence | null; scope: providers.Scope | null }): void;
  close(): void;
  readonly session: E.ExplainSession;
}

export function createExplainFlow(o: E.SessionOptions & { name?: string | null; onClosed?: () => void }): ExplainFlow {
  const s = E.session(o);
  const pl = s.payload;
  const fns = new Set<() => void>();
  let base: E.ModelRow[] = [];
  let rows: E.ModelRow[] = [];
  let pick: string | null = null;
  let via: E.ModelsResult['via'] = null;
  let ev: providers.Evidence | null = null;
  let scope: providers.Scope | null = null;
  let choice: Choice | null = null;
  let rules = providers.rulesFor('explain');
  let rulesKey = '';
  let loading = true;
  let note: ExplainView['note'] = null;
  let picker = false;
  let busy = false;
  let again = false;
  let asked = false;
  let closed = false;
  let askGen = 0;
  /** Counts the person's choices: a list read that began before one never replaces it (its rows and prices still apply). */
  let chosen = 0;
  let out: ExplainOut | null = null;
  let view: ExplainView | null = null;

  const find = (spec: string | null) => (spec ? rows.find((r) => r.spec === spec) || null : null);
  /**
   * The rules, rebuilt only when the fallback specs change (the chooser keeps one object while they hold). An ensemble
   * never enters the fallback: with the catalogue read failed, judge accepts a consented fallback spec without the
   * eligibility check, and a completion refuses ensembles (a configured `fusion/` default would otherwise be sent).
   */
  function syncRules(): void {
    const fb = [...base.map((r) => r.spec), ...(pick ? [pick] : [])].filter((spec) => providers.prefixOf(spec) !== 'fusion');
    const k = fb.join('\n');
    if (k !== rulesKey) { rulesKey = k; rules = providers.rulesFor('explain', { fallback: fb }); }
  }
  /** The pick's readiness: from its row, else (a pick the list does not hold) straight from the evidence. */
  function readiness(): E.Readiness | null {
    if (!pick) return null;
    const row = find(pick);
    if (row) return row.ready;
    return ev && ev.catalogue.state === 'ok' ? providers.readinessOf(ev, pick) : 'unknown';
  }
  function build(): ExplainView {
    const row = find(pick);
    const usd = s.estimate(row);
    return {
      subject: o.subject, name: o.name ? E.oneLine(o.name).slice(0, 80) : null, text: pl.text, system: s.system,
      fewer: pl.shown < pl.total ? { output: pl.output, shown: pl.shown, total: pl.total } : null,
      loading, rows, pick, label: pick ? (row ? row.label : E.unlistedNameOf(pick)) : '',
      ready: readiness(), choice, rules, defaultSpec: via === 'default' ? pick : null,
      cost: pick ? E.costLine(pick, usd) : null,
      note, picker, busy, asked, out, closed,
    };
  }
  function emit(): void { view = null; for (const f of [...fns]) f(); }

  /** A list read belongs to the Ask generation it began in: an answer from an earlier one never touches the dialog. */
  function load(prefer?: string | null): void {
    if (busy) { again = true; return; }
    const my = askGen;
    const mine = chosen;
    loading = true;
    emit();
    void s.models().then((r) => {
      if (closed || r.state !== 'ok') return;
      if (busy) { again = true; return; }
      if (my !== askGen) { load(prefer); return; }
      base = r.rows;
      rows = E.explainRows(base, ev);
      if (mine !== chosen) {
        // The person chose while this read was out: their pick, choice and its source stand.
        syncRules();
        loading = false;
        emit();
        return;
      }
      pick = prefer && find(prefer) ? prefer : r.pick;
      via = pick === r.pick ? r.via : 'saved';
      // The resolved model is not listed: the person picks.
      const unlisted = !!pick && r.listed === false;
      if (unlisted) pick = null;
      note = r.failed ? 'model.failed' : unlisted ? 'unlisted' : null;
      if (!pick && rows.length) picker = true;
      if (choice && choice.kind === 'model' && choice.spec !== pick) choice = null;
      syncRules();
      loading = false;
      emit();
    });
  }

  function ask(at?: { ev: providers.Evidence | null; scope: providers.Scope | null }): void {
    if (busy || !pick || closed) return;
    if (at) take(at.ev, at.scope);
    // The judgement at the final action: against the press's own snapshot, in its scope, nothing sent unless ok.
    const v = providers.judge(choice, pick, at ? at.ev : ev, at ? at.scope : scope, rules);
    if (!v.ok) {
      out = { kind: 'judge', why: v.why };
      if (v.why === 'ineligible' || v.why === 'gone' || v.why === 'needs_setup' || v.why === 'scope') picker = true;
      emit();
      return;
    }
    busy = true;
    asked = true;
    askGen++;
    out = { kind: 'asking' };
    emit();
    void s.run(pick).then((r) => {
      if (closed) return;
      if (r.state === 'closed' || r.state === 'stale') { close(); return; }
      busy = false;
      if (r.state === 'answer' || r.state === 'cut') {
        // The answer as the model wrote it: the drawer draws it as Markdown (kit Prose), so its lines are not split here.
        out = { kind: 'answer', text: r.text.trim(), cut: r.state === 'cut' };
      } else if (r.state === 'choose') {
        out = { kind: 'choose' };
        picker = true;
      } else out = { kind: r.state };
      emit();
      if (again) { again = false; load(null); }
    });
  }

  /** Takes the chooser's evidence and scope; false when nothing changed. */
  function take(next: providers.Evidence | null, now: providers.Scope | null): boolean {
    if (next === ev && now === scope) return false;
    // Consent is per scope: another computer, account, realm or generation drops the held choice.
    if (choice && choice.kind === 'model' && (!now || !providers.sameScope(choice.scope, now))) choice = null;
    ev = next;
    scope = now;
    rows = E.explainRows(base, ev);
    return true;
  }

  function close(): void {
    if (closed) return;
    closed = true;
    s.end();
    emit();
    if (o.onClosed) o.onClosed();
  }

  return {
    session: s,
    get: () => view || (view = build()),
    subscribe(fn) { fns.add(fn); return () => { fns.delete(fn); }; },
    start: () => { if (!closed) load(); },
    choose(c) {
      if (closed || busy || c.kind !== 'model') return;
      chosen++;
      pick = c.spec;
      choice = c;
      via = 'saved';
      s.choose(c.spec);
      note = null;
      out = null;
      picker = false;
      syncRules();
      emit();
    },
    consent() {
      if (closed || busy || !pick || !ev || !scope) return;
      choice = { kind: 'model', spec: pick, readiness: 'unknown', consent: true, scope, seq: ev.seq };
      out = null;
      emit();
    },
    setEvidence(next, now) {
      if (closed || !take(next, now)) return;
      emit();
    },
    costOf: (spec) => E.costLine(spec, s.estimate(find(spec))),
    togglePicker() { picker = !picker; emit(); },
    ask,
    close,
  };
}
