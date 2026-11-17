// AI → Settings → Rules & safety → Checked rules. The rules are READ with no session (the realm's
// rules, or a folder's with X-Hoody-Cwd); the first change opens the settings chat (Session.ts), mints a one-time permission on it
// and replaces ONE saved place's complete list. A place that cannot be shown whole is read only, with the reason. What is said is
// only what the agent answered: "saved" appears once a fresh read shows the new version; a lost answer is "may have gone through"
// with Check again (reads only) and Stop tracking, never a resend.
import { errorInfo, isRealmOrGlobal, type Target } from '@core';
import {
  AnatomySection, Band, Button, cleanAgentText, ConfirmEffect, createColumnHelper, DataTable, Dialog, EmptyState, errorSentence, Facts, FaqLink, OutcomeBanner,
  FormSection, Select, Stack, StatusPill, TextField, useDataView, useStrings, type OutcomeLike, type RowActionEntry, type SectionState,
} from '@kit';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KINDS, canEdit, capsOf, newRuleId, placed, ruleProblem, scopeRules,
  type NoEdit, type Read, type Rule, type RuleKind, type RuleProblem, type RuleRow, type RuleScope,
} from './logic';
import { confirmRead, useRules, useSaveRules, useSettingsHold, type SaveChange, type SettingsAt } from './data';
import { usePlace } from './Place';
import strings from './Rules.strings.en.json';
import { pageFaq } from '../../faq';
import aiStrings from '../../strings.en.json';
import { useAgents } from '../../agents/data';
import { useCatalogue } from '../../agents/toolsData';
import toolNames from '../../agents/toolNames.strings.en.json';
import { NamesPicker } from './NamesPicker';

type T = ReturnType<typeof useStrings<typeof strings>>;
const col = createColumnHelper<Row>();

interface Row {
  id: string;
  rule: Rule;
  /** Where the rule is saved (null: the agent did not say). */
  scope: RuleScope | null;
  /** Whether this rule's saved place may be changed now, and if not why. */
  editable: boolean;
  why?: NoEdit;
  /** The agent sent a condition this page cannot carry whole (the scope is read only). */
  whenBad: boolean;
}

const word = (t: T, k: string): string => t(k as never);

/** The words of a list, "a, b, c". */
const listText = (xs: readonly string[]): string => xs.join(', ');
/** A condition as one line of plain text: each part cleaned of control, direction and invisible characters, its line breaks made
 *  spaces, and cut for display only (the rule keeps and sends it verbatim). Shared with the hooks (Hooks.tsx). */
export const whenShown = (when: readonly string[]): string => when.map((a) => {
  const c = cleanAgentText(a, 200, { code: true });
  return c.text.replace(/[\t\n]+/g, ' ') + (c.cut > 0 ? '…' : '');
}).join(', ');

export interface RulesSectionProps {
  target: Target;
  realm: string;
}

/** The rules of the shown computer and one realm, as one card (RulesBody). It lives inside a PlaceProvider whose one bar chooses
 *  the place it shows (Settings.tsx: shared with the hooks), as HooksSection does. */
export function RulesSection({ target, realm }: RulesSectionProps) {
  if (!isRealmOrGlobal(realm)) return null;
  return <RulesBody key={`${target.container.id}\u0000${realm}`} target={target} realm={realm} />;
}

/** The Rules card: what rules are in one line, the list, the realm's counts as a note, and loading, failure, an unreadable answer
 *  and "choose a folder" as the card's own states. How the settings chat is used is the card's FAQ answer (faq.rulesHooks.a): the
 *  card's one explanation region (layout.explain, 150 characters) holds the description and the note, not an About as well. */
function RulesBody({ target, realm }: { target: Target; realm: string }) {
  const t = useStrings(strings);
  const { byId } = pageFaq(useStrings(aiStrings));
  const { at } = usePlace();
  const rules = useRules(at ?? { target, realm }, at !== null);
  const hold = useSettingsHold(at);
  const change = useSaveRules(at);
  const [res, setRes] = useState<Res | null>(null);
  const [saved, setSaved] = useState<SavedMark | null>(null);
  // Stop tracking asks first; the ask is an overlay beside the card, never inside its notices.
  const [stopAsked, setStopAsked] = useState(false);
  const held = !!change.held;
  useEffect(() => { if (!held) setStopAsked(false); }, [held]);
  // What belonged to another place is not shown under this one.
  const placeKey = at ? `${at.realm}\u0000${at.cwd ?? ''}` : '';
  useEffect(() => { setRes(null); setSaved(null); }, [placeKey]);

  const read: Read | null = rules.data ?? null;
  const block = read?.block ?? null;
  const waiting = change.state !== 'free';
  const reload = () => void rules.refetch();

  const state: SectionState = at === null
    ? { kind: 'notHere', icon: 'files', title: t('place.noFolder.title'), body: t('place.noFolder') }
    : rules.isError
      ? { kind: 'failed', error: rules.error, onRetry: reload }
      : rules.isLoading
        ? { kind: 'loading', variant: 'table', rows: 4 }
        : block === null
          ? { kind: 'unknown', text: t('unreadable'), onRecheck: reload }
          : { kind: 'ready' };
  // The realm's counts are one line under the list; a folder lists each place it holds (Listing). Counted only from a whole list:
  // a list the agent says may be partial shows its warning and no number.
  const capsNote = state.kind === 'ready' && at !== null && at.cwd === undefined && block !== null && block.complete
    ? t('caps.note', capsOf(scopeRules(block, 'user', undefined)))
    : undefined;

  return (
    <>
      <AnatomySection
        id="ai-rules"
        title={t('title')}
        description={t('description')}
        notices={<HeldNotice change={change} t={t} onStop={() => setStopAsked(true)} />}
        state={state}
        note={capsNote}
      >
        <p><FaqLink item={byId.rulesHooks}>{t('more')}</FaqLink></p>
        {at !== null && block !== null && (
          <Listing
            key={placeKey}
            at={at}
            block={block}
            hold={hold}
            change={change}
            waiting={waiting}
            t={t}
            res={res}
            setRes={setRes}
            saved={saved}
            setSaved={setSaved}
            reload={reload}
          />
        )}
      </AnatomySection>
      <ConfirmEffect
        isOpen={stopAsked && held}
        onOpenChange={setStopAsked}
        title={t('stop.title')}
        effects={[t('stop.effect')]}
        confirmLabel={t('stop.confirm')}
        onConfirm={() => { setStopAsked(false); void change.stopWaiting(); }}
      />
    </>
  );
}

/** A write the agent answered with `revision`, awaiting a fresh complete read of that place that shows it. */
interface SavedMark { scope: RuleScope; revision: string; place: string }

/** A change a person made, as its last answer: shown when it is not a success, and cleared by the next press. */
interface Res { outcome: 'done' | 'failed' | 'not_sent' | 'stale'; code?: string; status?: number; traceId?: string; route?: string }

function HeldNotice({ change, t, onStop }: { change: SaveChange; t: T; onStop: () => void }) {
  const [checking, setChecking] = useState(false);
  const held = change.held;
  if (!held) return null;
  const scope = String((held.identity as { scope?: unknown } | undefined)?.scope ?? 'user') as RuleScope;
  const scopeText = word(t, scope === 'user' ? 'scope.userRealm' : `scope.${scope}`);
  return (
    <OutcomeBanner
      kind="pending" /* noDetails: no answer came back, so there is no rejection to show */
      body={t('held', { scope: scopeText })}
      onCheck={() => { setChecking(true); void change.check().finally(() => setChecking(false)); }}
      checking={checking}
      onDismiss={onStop}
      dismissWarned
    />
  );
}

interface ListingProps {
  at: SettingsAt;
  block: NonNullable<Read['block']>;
  hold: ReturnType<typeof useSettingsHold>;
  change: SaveChange;
  waiting: boolean;
  t: T;
  res: Res | null;
  setRes: (r: Res | null) => void;
  saved: SavedMark | null;
  setSaved: (s: SavedMark | null) => void;
  reload: () => void;
}

type Dlg = { kind: 'add' } | { kind: 'edit'; row: Row } | { kind: 'remove'; row: Row } | null;

function Listing({ at, block, hold, change, waiting, t, res, setRes, saved, setSaved, reload }: ListingProps) {
  const folderPlace = at.cwd !== undefined;
  // A folder's counts per place, only from a whole list (a partial one keeps its warning alone). The grants row is wide (its
  // own list) only beside those counts: alone, it is the labelled list's one row.
  const placeCounts = folderPlace && block.complete;
  const place = `${at.realm}\u0000${at.cwd ?? ''}`;
  const scopes: readonly RuleScope[] = folderPlace ? ['user', 'project', 'local'] : ['user'];
  const edit = useMemo(() => {
    const m = new Map<RuleScope, ReturnType<typeof canEdit>>();
    for (const s of scopes) m.set(s, canEdit(block, s, at.cwd));
    return m;
  }, [block, at.cwd, folderPlace]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows: Row[] = useMemo(
    () => block.rules.map((r: RuleRow) => {
      const scope = placed(block, r, at.cwd);
      return {
        id: `${scope ?? '?'}\u0000${r.id}`,
        rule: { id: r.id, text: r.text, kind: r.kind, tools: r.tools, agents: r.agents, when: r.when },
        scope,
        whenBad: r.whenBad,
        editable: scope !== null && edit.get(scope)?.ok === true,
        ...(scope === null ? { why: 'unplaced' as const } : edit.get(scope)?.ok === false ? { why: (edit.get(scope) as { why: NoEdit }).why } : {}),
      };
    }),
    [block, edit, at.cwd],
  );
  const [dlg, setDlg] = useState<Dlg>(null);

  const reasons = useMemo(() => {
    const seen = new Set<NoEdit>();
    for (const e of edit.values()) if (!e.ok) seen.add(e.why);
    return [...seen];
  }, [edit]);
  const addScopes = scopes.filter((s) => edit.get(s)?.ok === true);
  // An editor stays open only while the place it edits can still be shown whole.
  const dlgScope = dlg && dlg.kind !== 'add' ? dlg.row.scope : null;
  useEffect(() => {
    if (dlg === null) return;
    if (dlg.kind === 'add' ? addScopes.length === 0 : dlgScope === null || edit.get(dlgScope)?.ok !== true) setDlg(null);
  }, [dlg, addScopes.length, dlgScope, edit]);

  /** One write of a place's whole list. The dialog (when open) shows what came back; a success reloads the rules. */
  const save = useCallback(async (scope: RuleScope, next: (list: Rule[]) => Rule[]): Promise<'done' | 'held' | 'refused'> => {
    const revision = block.revisions[scope];
    if (!hold || revision === undefined) return 'refused';
    setRes(null);
    setSaved(null);
    // The list on screen may have changed under an open dialog (a reload after a conflict, a refresh): a place that can no longer
    // be shown whole is never replaced from it. Checked here, at the send boundary, against the block this write is built from.
    if (canEdit(block, scope, at.cwd).ok !== true) {
      setRes({ outcome: 'not_sent', code: 'NOT_EDITABLE' });
      return 'refused';
    }
    const r = await change.run({ ...at, hold, scope, revision, rules: next(scopeRules(block, scope, at.cwd)) });
    if (r.outcome === 'done' && r.data) {
      const mark: SavedMark = { scope, revision: r.data.revision, place };
      // "Saved" waits for a request this press sends now (confirmRead: the request's own answer, never the cache) that shows the revision the agent answered with: a revision that is the same as
      // before (an unchanged rule) is not proof of anything until that read is in.
      void confirmRead(at).then((fresh) => {
        if (fresh && fresh.block.complete && fresh.block.revisions[scope] === mark.revision) setSaved(mark);
      }, () => undefined);
      return 'done';
    }
    // A change that may have gone through is the page's hold banner (Check again, Stop tracking), not a dialog left open.
    if (r.outcome === 'pending') return 'held';
    const o: Res = {
      outcome: r.outcome === 'failed' || r.outcome === 'not_sent' || r.outcome === 'stale' ? r.outcome : 'failed',
      ...(r.code ? { code: r.code } : {}),
      ...(r.status !== undefined ? { status: r.status } : {}),
      ...(r.traceId ? { traceId: r.traceId } : {}),
      ...(r.route ? { route: r.route } : {}),
    };
    setRes(o);
    // A refused version means the list moved: read it again so the next try starts from what is there.
    if (r.code === 'revision_conflict') reload();
    return 'refused';
  }, [at, block, change, hold, place, reload, setRes, setSaved]);

  const hasWhen = rows.some((r) => r.rule.when.length > 0 || r.whenBad);
  const columns = useMemo(
    () => [
      col.display({
        // The rule text is pinned and the condition ranks first, so a narrow table drops other columns, and then
        // turns into the list, before it drops the condition; the Type pill takes the list's status slot, so adding the
        // condition does not push Saved in off a list row.
        id: 'rule', header: t('col.rule'), meta: { minWidth: 220, pinned: true },
        cell: (c) => c.row.original.rule.text,
      }),
      // The read-only condition, one plain line, in its own column only while some rule has one (or one the page cannot show).
      ...(hasWhen ? [col.display({
        id: 'when', header: t('col.when'), meta: { minWidth: 200, priority: 1 },
        cell: (c: { row: { original: Row } }) => {
          const r = c.row.original;
          return r.whenBad ? t('when.unreadable') : r.rule.when.length > 0 ? t('when.line', { atoms: whenShown(r.rule.when) }) : '';
        },
      })] : []),
      col.display({ id: 'kind', header: t('col.kind'), meta: { priority: 1, list: 'status' }, cell: (c) => <StatusPill tone="neutral">{word(t, `kind.${c.row.original.rule.kind}`)}</StatusPill> }),
      col.display({ id: 'applies', header: t('col.applies'), cell: (c) => appliesText(c.row.original.rule, t) }),
      ...(folderPlace ? [col.display({ id: 'scope', header: t('col.scope'), cell: (c: { row: { original: Row } }) => scopeText(c.row.original.scope, t) })] : []),
    ],
    [t, folderPlace, hasWhen],
  );
  const actions = (row: Row): readonly RowActionEntry[] => {
    const why = waiting ? t('waiting') : row.why ? word(t, `readonly.reasonShort.${row.why}`) : undefined;
    const off = waiting || !row.editable;
    return [
      { id: 'edit', label: t('edit'), icon: 'pen', isDisabled: off, ...(why ? { disabledReason: why } : {}), onAction: () => { setDlg({ kind: 'edit', row }); } },
      { id: 'remove', label: t('remove'), icon: 'trash', tone: 'danger', isDisabled: off, ...(why ? { disabledReason: why } : {}), onAction: () => { setDlg({ kind: 'remove', row }); } },
    ];
  };
  const view = useDataView({ rows, columns, getRowId: (r: Row) => r.id, search: [], param: 'rules' });
  const addReason = waiting ? t('waiting') : addScopes.length === 0 && reasons[0] ? word(t, `readonly.reasonShort.${reasons[0]}`) : undefined;
  const confirmed = saved !== null && saved.place === place && block.complete && block.revisions[saved.scope] === saved.revision;

  return (
    <Stack gap={3}>
      {reasons.map((why) => <Band key={why} tone="neutral" size="table">{word(t, `readonly.${why}`)}</Band>)}
      {block.warnings.slice(0, 3).map((w) => <Band key={w} tone="warn" size="table" /* noDetails: the agent's own warning about a file, not a rejection */>{t('warnings', { text: w })}</Band>)}
      {confirmed && <OutcomeBanner kind="done" /* noDetails: a success, nothing was rejected */ title={t('saved')} onDismiss={() => setSaved(null)} />}
      {res && dlg === null && <ResBanner res={res} t={t} onDismiss={() => setRes(null)} />}
      <DataTable<Row>
        label={t('title')}
        columns={columns}
        view={view}
        actions={actions}
        onRefresh={reload}
        noViewMenu
        presentation="auto"
        // A partial list says what it received, never a total, and never that there are no rules.
        countLabel={(n) => t(block.complete ? 'count' : 'count.partial', { count: n })}
        toolbarActions={[{ id: 'add', label: t('add'), icon: 'plus', isDisabled: addScopes.length === 0 || waiting || !hold, onPress: () => { setDlg({ kind: 'add' }); } }]}
        toolbarNote={addReason}
        // With no rule the table draws no toolbar, so the empty state carries Add a rule itself, off when the toolbar's is.
        empty={<EmptyState size="sm" icon={block.complete ? 'lock' : 'warn'} title={t(block.complete ? 'empty.title' : 'empty.partial.title')} body={t(block.complete ? 'empty.body' : 'empty.partial.body')} action={<Button icon="plus" isDisabled={addScopes.length === 0 || waiting || !hold} onPress={() => { setDlg({ kind: 'add' }); }}>{t('add')}</Button>} />}
      />
      {(placeCounts || block.execTrust.length > 0) && (
        <Facts
          columns={1}
          label={placeCounts ? t('caps.label') : t('grants.label')}
          items={[
            ...(placeCounts ? scopes.map((s) => ({ label: scopeText(s, t), value: capsText(scopeRules(block, s, at.cwd), t) })) : []),
            ...(block.execTrust.length > 0 ? [{ label: t('grants.label'), value: listText(block.execTrust.map((g) => g.name || g.containerId)), wide: placeCounts }] : []),
          ]}
        />
      )}
      {(dlg?.kind === 'add' || dlg?.kind === 'edit') && (
        <RuleDialog
          key={dlg.kind === 'edit' ? dlg.row.id : 'add'}
          t={t}
          block={block}
          realm={at.realm}
          mode={dlg}
          addScopes={addScopes}
          folderPlace={folderPlace}
          busy={change.state === 'running'}
          onClose={() => { setDlg(null); }}
          onSubmit={async (scope, rule, replaceId) => {
            // An edit sends the condition the rule has in the list this write is built from (the one its revision belongs to), never the
            // one captured when the dialog opened: a refresh under an open dialog cannot bring an older condition back.
            const ok = await save(scope, (list) => (replaceId === null ? [...list, rule] : list.map((x) => (x.id === replaceId ? { ...rule, when: [...x.when] } : x))));
            if (ok !== 'refused') setDlg(null);
          }}
          problemOf={(scope, rule, replaceId) => ruleProblem(scopeRules(block, scope).filter((x) => x.id !== replaceId), rule)}
          res={res}
          clearRes={() => setRes(null)}
        />
      )}
      {dlg?.kind === 'remove' && (
        <ConfirmEffect
          isOpen
          onOpenChange={(o) => { if (!o) setDlg(null); }}
          title={t('rm.title')}
          effects={[t('rm.effect', { scope: scopeText(dlg.row.scope, t, !folderPlace) }), t('rm.effect2')]}
          note={dlg.row.rule.text}
          confirmLabel={t('rm.confirm')}
          tone="danger"
          onConfirm={() => {
            const row = dlg.row;
            setDlg(null);
            if (row.scope) void save(row.scope, (list) => list.filter((x) => x.id !== row.rule.id));
          }}
        />
      )}
    </Stack>
  );
}

function capsText(list: readonly Rule[], t: T): string {
  const c = capsOf(list);
  return t('caps', { checked: c.checked, prompt: c.prompt });
}

function appliesText(r: Rule, t: T): string {
  const checkedKind = r.kind === 'limit' || r.kind === 'check_in';
  // A checked rule with no tools named covers the tool calls the checker judges (read-only tools are left out unless named);
  // guidance and playbooks are read as advice and are not tied to tools at all.
  const tools = r.tools.length ? t('applies.tools', { names: listText(r.tools) }) : checkedKind ? t('applies.judged') : '';
  const agents = r.agents.length ? t('applies.agents', { names: listText(r.agents) }) : t('applies.anyAgent');
  return [tools, agents].filter(Boolean).join('. ');
}

function scopeText(s: RuleScope | null, t: T, realmPlace = false): string {
  if (s === null) return t('scope.unknown');
  return s === 'user' && realmPlace ? t('scope.userRealm') : word(t, `scope.${s}`);
}

/** The refusal as this page words it; the kit words the rest. */
function resText(res: Res, t: T): string | undefined {
  if (res.outcome === 'failed' && res.code) {
    const k = `refused.${res.code}`;
    return k in strings ? word(t, k) : undefined;
  }
  if (res.outcome === 'not_sent' && res.code) {
    const k = `notsent.${res.code}`;
    return k in strings ? word(t, k) : undefined;
  }
  return undefined;
}

function ResBanner({ res, t, onDismiss }: { res: Res; t: T; onDismiss: () => void }) {
  const body = resText(res, t);
  return <OutcomeBanner kind={res.outcome} error={res} body={body} onDismiss={onDismiss} />;
}

interface DialogProps {
  t: T;
  block: NonNullable<Read['block']>;
  /** The realm whose agents the Agents list offers. */
  realm: string;
  mode: { kind: 'add' } | { kind: 'edit'; row: Row };
  addScopes: readonly RuleScope[];
  folderPlace: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (scope: RuleScope, rule: Rule, replaceId: string | null) => Promise<void>;
  problemOf: (scope: RuleScope, rule: Rule, replaceId: string | null) => RuleProblem | null;
  res: Res | null;
  clearRes: () => void;
}

// The shapes the rule's own check accepts for one name (ruleProblem: tool_name, agent_name).
const TOOL_NAME = /^[A-Za-z0-9_]{1,128}$/;
const AGENT_NAME = /^[a-z0-9][a-z0-9_-]{0,127}$/;
/** An answer that is not the whole list: the picker says it could not read the names (never "none here"). */
const NOT_A_LIST: object = Object.freeze({});

function RuleDialog({ t, block, realm, mode, addScopes, folderPlace, busy, onClose, onSubmit, problemOf, res, clearRes }: DialogProps) {
  const editing = mode.kind === 'edit' ? mode.row : null;
  const [text, setText] = useState(editing?.rule.text ?? '');
  const [kind, setKind] = useState<RuleKind>(editing?.rule.kind ?? 'check_in');
  const [tools, setTools] = useState<string[]>([...(editing?.rule.tools ?? [])]);
  const [agents, setAgents] = useState<string[]>([...(editing?.rule.agents ?? [])]);
  // A typed name the picker refused is still in its field: the rule is not saved without it (its field says why).
  const [toolsRefused, setToolsRefused] = useState(false);
  const [agentsRefused, setAgentsRefused] = useState(false);
  const [scope, setScope] = useState<RuleScope>(editing?.scope ?? addScopes[0] ?? 'user');
  const [touched, setTouched] = useState(false);
  const replaceId = editing?.rule.id ?? null;
  const scopeList = scopeRules(block, scope);
  const rule: Rule = {
    id: editing?.rule.id ?? newRuleId(scopeList),
    text: text.trim(),
    kind,
    tools: kind === 'limit' || kind === 'check_in' ? [...tools] : [],
    agents: [...agents],
    // The condition is never edited here: an edit keeps the rule's own, verbatim, as the current list has it (a kind it does not fit
    // is refused, when_prompt). The send takes it again from the list the write is built from (onSubmit).
    when: editing ? [...(scopeList.find((x) => x.id === editing.rule.id)?.when ?? editing.rule.when)] : [],
  };
  // The tools box is shown only for the kinds that use it; a hidden box holds nothing that could be sent.
  const problem = problemOf(scope, rule, replaceId);
  const showProblem = touched && problem !== null;
  // The last answer of this dialog's press, as its outcome line: the page's words for its own refusals, else the kit's, as the
  // banner gets them from error={res} (the demo's refusal among them).
  const said = res && res.outcome !== 'done' ? resText(res, t) ?? errorSentence(errorInfo(res)) : undefined;
  const outcome: OutcomeLike | null = res ? { kind: res.outcome === 'done' ? 'done' : res.outcome, ...(res.code ? { code: res.code } : {}), ...(said ? { message: said } : {}) } : null;
  const kindOptions = KINDS.map((k) => ({ value: k, label: word(t, `kind.${k}`), description: word(t, `kind.${k}.hint`) }));
  const isChecked = kind === 'limit' || kind === 'check_in';
  // What this computer reports, to pick from (read only): the realm's agents, and the agent's tool catalogue while the kind
  // takes tools. A name neither lists can still be typed.
  const agentsRead = useAgents(true, realm);
  const catalogue = useCatalogue(isChecked);
  const tn = useStrings(toolNames);
  const agentOptions = agentsRead.rows?.map((a) => ({ value: a.name, label: a.name }));
  const toolOptions = catalogue.data ? catalogue.data.map((x) => {
    const key = `name.${x.name}`;
    return { value: x.name, label: x.name, ...(key in toolNames ? { description: tn(key as keyof typeof toolNames) } : {}) };
  }) : undefined;
  const toolsFailed = !!catalogue.error || catalogue.data === null;
  return (
    <Dialog
      isOpen
      overlayId="ai-rule-edit"
      onOpenChange={(o) => { if (!o) { clearRes(); onClose(); } }}
      title={editing ? t('dlg.editTitle') : t('dlg.addTitle')}
      size="lg"
      primaryLabel={editing ? t('dlg.save') : t('dlg.add')}
      primaryDisabled={(problem !== null || agentsRefused || (isChecked && toolsRefused)) && touched}
      busy={busy}
      {...(outcome ? { outcome } : {})}
      onPrimary={() => {
        setTouched(true);
        if (problem !== null || agentsRefused || (isChecked && toolsRefused)) return;
        void onSubmit(scope, rule, replaceId);
      }}
    >
      <>
        <FormSection label={t('dlg.secRule')}>
        <TextField
          label={t('dlg.text')}
          description={t('dlg.textHint')}
          value={text}
          onChange={(v) => { setText(v); setTouched(true); }}
          multiline
          rows={3}
          errorMessage={showProblem && (problem === 'text_empty' || problem === 'text_long' || problem === 'text_lines' || problem === 'text_control' || problem === 'text_format') ? word(t, `problem.${problem}`) : undefined}
        />
        <Select label={t('dlg.kind')} options={kindOptions} value={kind} onChange={(v) => { setKind(v); setTouched(true); }} descriptionSlots />
        </FormSection>
        {isChecked && (
          <FormSection title={t('dlg.tools')} description={t('dlg.toolsHint')}>
          <NamesPicker
            label={t('dlg.toolsPick')}
            names={tools}
            onChange={(v) => { setTools(v); setTouched(true); }}
            noneText={t('dlg.toolsNone')}
            known={toolOptions}
            loading={catalogue.isPending}
            error={toolsFailed ? (catalogue.error ?? NOT_A_LIST) : undefined}
            onRetry={() => void catalogue.refetch()}
            hint={t('dlg.namesHint')}
            notFound={t('dlg.notFound')}
            valid={(n) => TOOL_NAME.test(n)}
            onRefusedChange={setToolsRefused}
            invalidText={t('problem.tool_name')}
            errorMessage={showProblem && (problem === 'tools_many' || problem === 'tool_name') ? word(t, `problem.${problem}`) : undefined}
          />
          </FormSection>
        )}
        <FormSection title={t('dlg.agents')} description={t('dlg.agentsHint')}>
        <NamesPicker
          label={t('dlg.agentsPick')}
          names={agents}
          onChange={(v) => { setAgents(v); setTouched(true); }}
          noneText={t('dlg.agentsNone')}
          known={agentOptions}
          loading={agentsRead.pending}
          error={agentsRead.failed ? (agentsRead.error ?? NOT_A_LIST) : undefined}
          onRetry={agentsRead.retry}
          hint={t('dlg.namesHint')}
          notFound={t('dlg.notFound')}
          valid={(n) => AGENT_NAME.test(n)}
          onRefusedChange={setAgentsRefused}
          invalidText={t('problem.agent_name')}
          errorMessage={showProblem && (problem === 'agents_many' || problem === 'agent_name') ? word(t, `problem.${problem}`) : undefined}
        />
        </FormSection>
        <FormSection kind="summary" label={t('dlg.where')}>
        {folderPlace && !editing && (
          <Select label={t('dlg.savedIn')} options={addScopes.map((s) => ({ value: s, label: word(t, `dlg.savedIn.${s}`) }))} value={scope} onChange={setScope} />
        )}
        {showProblem && problem !== null && !['text_empty', 'text_long', 'text_lines', 'text_control', 'text_format', 'tools_many', 'tool_name', 'agents_many', 'agent_name'].includes(problem) && (
          <Band tone="warn" size="table" /* noDetails: a check made on this page before anything is sent */>{word(t, `problem.${problem}`)}</Band>
        )}
        <Facts
          columns={1}
          layout="spec"
          label={t('caps.label')}
          items={[
            // Where it goes, said here unless the Saved in field above already shows it.
            ...(folderPlace && !editing ? [] : [{ label: t('dlg.savedIn'), value: scopeText(scope, t, !folderPlace) }]),
            { label: t('dlg.rulesThere'), value: capsText(scopeList, t) },
          ]}
        />
        </FormSection>
      </>
    </Dialog>
  );
}

