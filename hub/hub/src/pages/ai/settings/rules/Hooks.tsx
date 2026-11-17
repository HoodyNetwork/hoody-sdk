// AI → Settings → Rules & hooks → Hooks. Hooks are read on the settings chat (Session.ts), which
// opens when this section is shown and closes when the person leaves. Every change mints its own one-time permission on that chat
// and is sent once: turning a hook on or off, deleting it, and the kill switch of one settings file. What is said is what the
// agent answered; a lost answer is "outcome unknown": the person looks at the list and then stops tracking it; no read releases it and nothing is resent.
// A hook the agent turned off for hidden characters says so, with the class it named; its only change is Delete, by its place
// in the file (hooks.ts placeDeleteBody). Every hook text this section paints passes markHidden, so no hidden character is drawn raw.
import {
  Band, Button, ConfirmEffect, createColumnHelper, DataTable, Dialog, EmptyState, ErrorState, OutcomeBanner, Select, SettingGroup,
  SettingRow, Skeleton, Stack, StatusPill, TextButton, useDataView, useStrings, Widget, type RowActionEntry,
} from '@kit';
import { isRealmOrGlobal } from '@core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSettingsHold } from './data';
import { useFeatures } from './features.data';
import featureStrings from './strings.en.json';
import type { SettingsAt } from './Session';
import { useHooksList, useHookWrite, type HookChange } from './hooksData';
import { canChange, canRemoveHidden, HIDDEN_REASON, hidesText, killScopes, refOf, scopeOf, type HookPlace, type HookRow, type HooksBlock, type NoChange } from './hooks';
import { markHidden } from './hidden';
import { reviewOf, type Review } from './trust';
import { TrustDialog } from './Trust';
import { whenShown } from './Rules';
import { usePlace } from './Place';
import type { RuleScope } from './logic';
import strings from './Hooks.strings.en.json';
import editStrings from './HookEdit.strings.en.json';
import { HookEdit } from './HookEdit';
import { agentScopes, HookAskDialog, HookHowDialog } from './HookAsk';

type T = ReturnType<typeof useStrings<typeof strings>>;
const col = createColumnHelper<Row>();
const word = (t: T, k: string): string => t(k as never);

interface Row {
  id: string;
  hook: HookRow;
  scope: RuleScope | null;
  /** Whether this hook may be changed from this place, and if not why. */
  why?: NoChange;
  /** A hook the agent turned off: whether Delete (by place) may be pressed, and if not why. Absent for every other hook. */
  del?: { ok: true; place: HookPlace } | { ok: false; why: NoChange };
  /** A changeable hook whose text holds a hidden character (an older agent lists it raw and runs it): never toggled or edited here,
   *  only deleted (the triple names it by its real text). Absent otherwise. */
  editWhy?: NoChange;
}

export interface HooksSectionProps {
  /** The shown computer's name for words. */
  computer: string;
}

/** The hooks of the place chosen under the rules (Place.tsx). */
export function HooksSection({ computer }: HooksSectionProps) {
  const t = useStrings(strings);
  const { realm } = usePlace();
  // The section is a Widget: its states (loading, empty, error) come from the kit's state renderer inside it, never from the legacy Section.
  return isRealmOrGlobal(realm) ? <HooksBody computer={computer} /> : <Widget size="l" title={t('title')} description={t('description')}>{null}</Widget>;
}

/** The last answer of a change, kept until the next press. */
interface Res { outcome: 'done' | 'failed' | 'not_sent' | 'stale'; code?: string; status?: number; traceId?: string; route?: string }

function HooksBody({ computer }: { computer: string }) {
  const t = useStrings(strings);
  const { at } = usePlace();
  const hold = useSettingsHold(at);
  const list = useHooksList(at, hold);
  const change = useHookWrite(at);
  const [res, setRes] = useState<Res | null>(null);
  const placeKey = at ? `${at.realm}\u0000${at.cwd ?? ''}` : '';
  useEffect(() => { setRes(null); }, [placeKey]);
  const block = list.read?.block ?? null;
  return (
    <Widget size="l" title={t('title')} description={t('description')}>
      <Stack gap={4}>
        <HeldNotice change={change} t={t} />
        {at === null ? (
          <EmptyState icon="files" title={t('title')} body={t('noFolder')} size="sm" />
        ) : list.sessionError ? (
          <EmptyState icon="warn" title={t('session.title')} body={word(t, `session.${list.sessionError.kind.toUpperCase()}`)} size="sm" />
        ) : list.error ? (
          <ErrorState size="compact" title={t('loadFailed')} error={list.error} onRetry={list.reload} />
        ) : list.loading ? (
          <Skeleton variant="table" rows={3} columns={3} />
        ) : list.unreadable || block === null ? (
          <EmptyState icon="warn" title={t('unreadable.title')} body={t('unreadable.body')} size="sm" />
        ) : (
          <Listing key={placeKey} at={at} block={block} hold={hold} change={change} t={t} res={res} setRes={setRes} reload={list.reload} computer={computer} fresh={list.fresh} />
        )}
        <SelfTrust />
      </Stack>
    </Widget>
  );
}

/** Trusting the agent's own low-risk hook edits (hooks_agent_self_trust, on this card beside
 *  the hooks it is about, not on the features card): the computer's value from GET /settings/features (the same read as that card), shown, never
 *  changed (features.logic WRITABLE). Nothing while that read is pending, failed or unreadable, a failed refresh after a good
 *  read included (the query keeps its last data then; the value it held is no longer known): the features card below says so
 *  for the same read. */
function SelfTrust() {
  const ft = useStrings(featureStrings);
  const { target } = usePlace();
  const q = useFeatures(target);
  const f = q.isError ? undefined : q.data?.find((r) => r.name === 'hooks_agent_self_trust');
  if (!f) return null;
  return (
    <SettingGroup label={ft('f.hooks_agent_self_trust')}>
      <SettingRow label={ft('f.hooks_agent_self_trust')} help={ft('f.hooks_agent_self_trust.help')}>
        <StatusPill tone={f.value ? 'ok' : 'neutral'}>{f.value ? ft('on') : ft('off')}</StatusPill>
      </SettingRow>
    </SettingGroup>
  );
}

function HeldNotice({ change, t }: { change: HookChange; t: T }) {
  const [checking, setChecking] = useState(false);
  const [asked, setAsked] = useState(false);
  const held = change.held;
  if (!held) return null;
  const op = String((held.identity as { op?: unknown } | undefined)?.op ?? 'toggle');
  return (
    <>
      <OutcomeBanner
        kind="pending" /* noDetails: no answer came back, so there is no rejection to show */
        body={t('held', { what: word(t, `what.${op}`) })}
        onCheck={() => { setChecking(true); void change.check().finally(() => setChecking(false)); }}
        checking={checking}
        onDismiss={() => setAsked(true)}
        dismissWarned
      />
      <ConfirmEffect
        isOpen={asked}
        onOpenChange={setAsked}
        title={t('stop.title')}
        effects={[t('stop.effect')]}
        confirmLabel={t('stop.confirm')}
        onConfirm={() => { setAsked(false); void change.stopWaiting(); }}
      />
    </>
  );
}

interface ListingProps {
  at: SettingsAt;
  computer: string;
  block: HooksBlock;
  hold: ReturnType<typeof useSettingsHold>;
  change: HookChange;
  t: T;
  res: Res | null;
  setRes: (r: Res | null) => void;
  reload: () => void;
  fresh: () => Promise<HooksBlock | null>;
}

type Dlg = { kind: 'delete'; row: Row } | { kind: 'disable' } | { kind: 'how' } | { kind: 'ask' } | { kind: 'edit'; row: Row | null } | { kind: 'trust'; review: Review } | null;

const scopeLabel = (s: RuleScope | null, t: T): string => (s === null ? t('scope.unknown') : word(t, `scope.${s}`));
const eventLabel = (e: string, t: T): string => { const k = `event.${e}`; return k in strings ? word(t, k) : markHidden(e); };
const whenText = (h: Pick<HookRow, 'event' | 'matcher'>, t: T): string => t('when', { event: eventLabel(h.event, t), matcher: h.matcher === '' ? t('any') : markHidden(h.matcher) });
/** The words for a class the agent named; one it does not know is "a character". */
const CLASSES: Readonly<Record<string, string>> = { 'control character': 'class.control', 'bidi control character': 'class.bidi', 'zero-width character': 'class.zeroWidth', 'soft hyphen': 'class.softHyphen' };
const classWord = (cls: string, t: T): string => word(t, Object.prototype.hasOwnProperty.call(CLASSES, cls) ? CLASSES[cls]! : 'class.unknown');

function Listing({ at, block, hold, change, t, res, setRes, reload, computer, fresh }: ListingProps) {
  const et = useStrings(editStrings);
  const cwd = at.cwd;
  const waiting = change.state !== 'free';
  const rows: Row[] = useMemo(() => {
    const seen = new Map<string, number>();
    return block.hooks.map((h) => {
      const c = canChange(block, h, cwd);
      const scope = scopeOf(block, h);
      // Two rows may share an identity (an empty command repeated): the count keeps their ids apart.
      const base = `${scope ?? '?'}\u0000${h.event}\u0000${h.matcher}\u0000${h.command}`;
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      // A hook the agent turned off takes one change, Delete by its place, when it has one.
      const rm = h.agentOff !== '' ? canRemoveHidden(block, h, cwd) : null;
      const del = rm === null ? {} : { del: rm.ok && h.hidden ? { ok: true as const, place: h.hidden } : { ok: false as const, why: rm.ok ? 'hidden' as const : rm.why } };
      const edit = c.ok && hidesText(h) ? { editWhy: h.whenBad ? 'whenBad' as const : 'hiddenText' as const } : {};
      return { id: `${base}\u0000${n}`, hook: h, scope, ...(c.ok ? {} : { why: c.why }), ...del, ...edit };
    });
  }, [block, cwd]);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [killScope, setKillScope] = useState<RuleScope | ''>('');
  const kills = useMemo(() => killScopes(block, cwd), [block, cwd]);
  useEffect(() => { if (killScope === '' || !kills.includes(killScope)) setKillScope(kills[0] ?? ''); }, [kills, killScope]);
  // The set the agent holds for review now, read from the same listing the Band is drawn from; the dialog keeps it as it was opened.
  const review = useMemo(() => reviewOf(block), [block]);
  const switchedOff = block.files.filter((f) => f.setsDisableAll).map((f) => scopeLabel(f.scope, t));
  const killOn = killScope !== '' && block.files.find((f) => f.scope === killScope)?.setsDisableAll === true;
  // The places this person may change whose switch for all hooks is on: the kill switch then offers to turn hooks back on there
  // too, and its dialog opens on the first of them.
  const killOnScopes = useMemo(() => kills.filter((sc) => block.files.find((f) => f.scope === sc)?.setsDisableAll === true), [kills, block]);
  const anyKillOn = killOnScopes.length > 0;
  const openKill = () => { if (anyKillOn && !killOn) setKillScope(killOnScopes[0]!); setDlg({ kind: 'disable' }); };
  const killOff = kills.length === 0 || waiting || !hold;
  // Add hook…, from the toolbar or, with no hook, from the table's empty state.
  const addOff = waiting || !hold || kills.length === 0;
  // Add asks how first: with the Agent (a chat that writes it) or by hand (the hook editor).
  const openAdd = () => { setDlg({ kind: 'how' }); };

  /** One guarded write. The page hold banner shows a pending one; a definite answer is shown here. */
  const act = useCallback(async (v: { scope: RuleScope; op: 'toggle' | 'delete' | 'disable_all' | 'trust'; hook?: ReturnType<typeof refOf>; place?: HookPlace; disabled?: boolean; value?: boolean; review?: Review }): Promise<'done' | 'held' | 'refused'> => {
    setRes(null);
    if (!hold) return 'refused';
    const r = await change.run({ ...at, ...v, hold });
    if (r.outcome === 'done') { setRes({ outcome: 'done' }); reload(); return 'done'; }
    if (r.outcome === 'pending') return 'held';
    setRes({
      outcome: r.outcome === 'failed' || r.outcome === 'not_sent' || r.outcome === 'stale' ? r.outcome : 'failed',
      ...(r.code ? { code: r.code } : {}), ...(r.status !== undefined ? { status: r.status } : {}),
      ...(r.traceId ? { traceId: r.traceId } : {}), ...(r.route ? { route: r.route } : {}),
    });
    // A hook the agent could not find means the list moved: read it again. So does a trust that was not recorded: the set may have
    // changed (the agent refuses every ack with the same 400), and the Band then shows the set to review now.
    if (r.code === 'not_found' || (v.op === 'trust' && (r.code === 'TRUST_CHANGED' || r.code === 'bad_request'))) reload();
    return 'refused';
  }, [at, change, hold, reload, setRes]);

  const hasWhen = rows.some((r) => r.hook.when.length > 0 || r.hook.whenBad);
  const columns = useMemo(() => [
    col.display({
      // As on Rules: the hook is pinned, the condition ranks first and State takes the list's status slot, so
      // the condition is never the column a narrow table drops, and adding it does not push State off a list row.
      id: 'hook', header: t('col.hook'), meta: { minWidth: 220, pinned: true },
      cell: (c) => { const h = c.row.original.hook; return markHidden(h.label || h.command); },
    }),
    // Room for an event whole ("Before a tool runs") with Saved in and State still shown at 120 columns: the tool list after it is
    // what gets cut.
    col.display({ id: 'when', header: t('col.when'), meta: { minWidth: 200 }, cell: (c) => whenText(c.row.original.hook, t) }),
    // The read-only condition of a Stop hook, one plain line, in its own column only while some hook has one.
    ...(hasWhen ? [col.display({
      id: 'cond', header: t('col.cond'), meta: { minWidth: 200, priority: 1 },
      cell: (c: { row: { original: Row } }) => {
        const h = c.row.original.hook;
        return h.whenBad ? t('when.unreadable') : h.when.length > 0 ? t('when.line', { atoms: whenShown(h.when.map(markHidden)) }) : '';
      },
    })] : []),
    col.display({ id: 'where', header: t('col.where'), cell: (c) => scopeLabel(c.row.original.scope, t) }),
    col.display({
      id: 'state', header: t('col.state'), meta: { priority: 1, list: 'status' },
      cell: (c) => {
        const h = c.row.original.hook;
        if (h.agentOff !== '') return <StatusPill tone="warn">{t(h.agentOff === HIDDEN_REASON ? 'state.hidden' : 'state.agentOff')}</StatusPill>;
        return <StatusPill tone={h.disabled ? 'neutral' : 'ok'}>{t(h.disabled ? 'state.off' : 'state.on')}</StatusPill>;
      },
    }),
  ], [t, hasWhen]);
  const actions = (row: Row): readonly RowActionEntry[] => {
    const why = waiting ? t('waiting') : row.why ? word(t, `readonly.short.${row.why}`) : undefined;
    const off = waiting || row.why !== undefined || !row.scope;
    const reason = why ? { disabledReason: why } : {};
    // Text holding a hidden character: Turn on/off and Edit stay off; Delete (the triple, by its real text) stays as it is.
    const changeWhy = why ?? (row.editWhy ? word(t, `readonly.short.${row.editWhy}`) : undefined);
    const changeOff = off || row.editWhy !== undefined;
    const changeReason = changeWhy ? { disabledReason: changeWhy } : {};
    // A hook the agent turned off: Delete by its place is its one change (toggle and edit stay off with the reason above).
    const d = row.del;
    const delWhy = waiting ? t('waiting') : d && !d.ok ? word(t, `readonly.short.${d.why}`) : undefined;
    const delOff = d ? waiting || !d.ok || !row.scope : off;
    const delReason = d ? (delWhy ? { disabledReason: delWhy } : {}) : reason;
    return [
      {
        id: 'toggle', label: t(row.hook.disabled ? 'turnOn' : 'turnOff'), icon: row.hook.disabled ? 'play' : 'pause', isDisabled: changeOff, ...changeReason,
        onAction: () => { if (row.scope) void act({ scope: row.scope, op: 'toggle', hook: refOf(row.hook), disabled: !row.hook.disabled }); },
      },
      { id: 'edit', label: et('row.edit'), icon: 'pen', isDisabled: changeOff, ...changeReason, onAction: () => { setDlg({ kind: 'edit', row }); } },
      { id: 'delete', label: t('delete'), icon: 'trash', tone: 'danger', isDisabled: delOff, ...delReason, onAction: () => { setDlg({ kind: 'delete', row }); } },
    ];
  };
  const view = useDataView({ rows, columns, getRowId: (r: Row) => r.id, search: [], param: 'hooks' });
  // A hidden-characters hook has its own band (with the classes named), not the generic read-only one.
  // Each reason a row cannot be changed (or, for a hook the agent turned off, deleted) once, in words; a hidden hook's own state has its band.
  const readOnly = useMemo(() => [...new Set(rows.flatMap((r) => [r.why ?? r.editWhy, r.del && !r.del.ok ? r.del.why : undefined]).filter((w): w is NoChange => w !== undefined && w !== 'hidden'))], [rows]);
  const hiddenWhat = useMemo(() => [...new Set(rows.filter((r) => r.hook.agentOff === HIDDEN_REASON).map((r) => classWord(r.hook.hidden?.cls ?? '', t)))], [rows, t]);

  return (
    <Stack gap={3}>
      {hiddenWhat.length > 0 && <Band tone="warn" size="table" /* noDetails: the agent's own state of these hooks, not a rejection */>{t('hidden.band', { what: hiddenWhat.join(', ') })}</Band>}
      {readOnly.map((why) => <Band key={why} tone="neutral" size="table">{word(t, `readonly.${why}`)}</Band>)}
      {switchedOff.length > 0 && (
        <Band tone="warn" size="table" /* noDetails: what the settings say, not a rejection */ actions={anyKillOn ? <TextButton isDisabled={killOff} onPress={openKill}>{t('enableAll')}</TextButton> : undefined}>
          {t('killed', { where: switchedOff.join(', ') })}
        </Band>
      )}
      {block.stale && <Band tone="neutral" size="table">{t('stale')}</Band>}
      {block.trust.state === 'pending' && (
        <Band tone="warn" size="table" /* noDetails: the agent's own trust state */ actions={<TextButton isDisabled={waiting || !hold || !review} onPress={() => { if (review) setDlg({ kind: 'trust', review }); }}>{t('trust.action')}</TextButton>}>
          {t('trust.pending', { reason: block.trust.reason ? ` (${block.trust.reason})` : '' })}
        </Band>
      )}
      {block.trust.state === 'unavailable' && <Band tone="neutral" size="table">{t('trust.unavailable', { reason: block.trust.reason ? ` (${block.trust.reason})` : '' })}</Band>}
      {block.warnings.slice(0, 3).map((w) => <Band key={w} tone="warn" size="table" /* noDetails: the agent's own warning about a file, not a rejection */>{t('warnings', { text: w.slice(0, 500) })}</Band>)}
      {res?.outcome === 'done' && <OutcomeBanner kind="done" /* noDetails: a success, nothing was rejected */ title={t('done')} onDismiss={() => setRes(null)} />}
      {res && res.outcome !== 'done' && dlg === null && <ResBanner res={res} t={t} onDismiss={() => setRes(null)} />}
      <DataTable<Row>
        label={t('title')}
        columns={columns}
        view={view}
        actions={actions}
        onRefresh={reload}
        noViewMenu
        presentation="auto"
        countLabel={(n) => t('count', { count: n })}
        toolbarActions={[{ id: 'add', label: et('toolbar.add'), icon: 'plus', isDisabled: addOff, onPress: openAdd }, { id: 'disableAll', label: t(anyKillOn ? 'enableAll' : 'disableAll'), icon: anyKillOn ? 'play' : 'stop', isDisabled: killOff, onPress: openKill }]}
        toolbarNote={waiting ? t('waiting') : undefined}
        // With no hook the kit draws only this state, no toolbar: the first hook is added from here.
        // The kill switch is not offered here: with the switch off there is nothing for it to stop, and with it on the all-off
        // note above carries "Turn hooks back on…".
        empty={<EmptyState size="sm" icon="terminal" title={t('empty.title')} body={t('empty.body')} action={<Button icon="plus" isDisabled={addOff} onPress={openAdd}>{t('add')}</Button>} />}
      />
      {dlg?.kind === 'disable' && killScope !== '' && (
        <Dialog
          isOpen
          overlayId="ai-hooks-switch"
          onOpenChange={(o) => { if (!o) { setRes(null); setDlg(null); } }}
          title={killOn ? t('dis.titleOn') : t('dis.title')}
          body={killOn ? t('dis.bodyOn', { where: scopeLabel(killScope, t) }) : t('dis.body', { where: scopeLabel(killScope, t) })}
          tone={killOn ? 'default' : 'danger'}
          primaryLabel={killOn ? t('dis.confirmOn') : t('dis.confirm')}
          busy={change.state === 'running'}
          // The dialog always closes: a refusal is shown by the result banner below (it is not drawn while a dialog is open), never lost.
          onPrimary={() => { void act({ scope: killScope, op: 'disable_all', value: !killOn }).then(() => { setDlg(null); }); }}
        >
          {kills.length > 1 && (
            <Select label={t('dis.where')} options={kills.map((s) => ({ value: s, label: scopeLabel(s, t) }))} value={killScope} onChange={(v) => setKillScope(v)} />
          )}
        </Dialog>
      )}
      {dlg?.kind === 'trust' && (
        <TrustDialog
          review={dlg.review}
          computer={computer}
          busy={change.state === 'running'}
          when={(h) => whenText(h, t)}
          onClose={() => { setDlg(null); }}
          // The dialog always closes: a refusal is shown by the result banner (it is not drawn while a dialog is open), never lost.
          onTrust={() => { void act({ scope: 'user', op: 'trust', review: dlg.review }).then(() => { setDlg(null); }); }}
        />
      )}
      {dlg?.kind === 'delete' && (
        <ConfirmEffect
          isOpen
          onOpenChange={(o) => { if (!o) setDlg(null); }}
          title={t('del.title')}
          effects={[
            // A hook the agent turned off never ran: it is removed, it does not "stop running".
            dlg.row.del ? t('del.hiddenRemoved', { where: scopeLabel(dlg.row.scope, t) }) : t('del.effect', { when: whenText(dlg.row.hook, t), where: scopeLabel(dlg.row.scope, t) }),
            t(dlg.row.del?.ok ? 'del.hiddenEffect' : 'del.effect2'),
          ]}
          note={markHidden(dlg.row.hook.command)}
          confirmLabel={t('del.confirm')}
          tone="danger"
          onConfirm={() => {
            const row = dlg.row;
            setDlg(null);
            // A hook the agent turned off is deleted by its place only; it never falls back to the triple (that could name a look-alike).
            if (row.del) { if (row.scope && row.del.ok) void act({ scope: row.scope, op: 'delete', hook: refOf(row.hook), place: row.del.place }); return; }
            if (row.scope) void act({ scope: row.scope, op: 'delete', hook: refOf(row.hook) });
          }}
        />
      )}
      {dlg?.kind === 'how' && <HookHowDialog agentOff={agentScopes(kills, cwd !== undefined).length === 0} localByHand={cwd !== undefined && kills.includes('local')} onAgent={() => { setDlg({ kind: 'ask' }); }} onSelf={() => { setDlg({ kind: 'edit', row: null }); }} onClose={() => { setDlg(null); }} />}
      {dlg?.kind === 'ask' && <HookAskDialog at={at} computer={computer} scopes={kills} onClose={() => { setDlg(null); }} />}
      {dlg?.kind === 'edit' && hold && !dlg.row?.editWhy && <HookEdit at={at} hold={hold} block={block} change={change} computer={computer} hook={dlg.row?.hook ?? null} onClose={() => { setDlg(null); }} reload={reload} fresh={fresh} />}
    </Stack>
  );
}

function resText(res: Res, t: T): string | undefined {
  if (res.outcome === 'failed' && res.code) { const k = `refused.${res.code}`; return k in strings ? word(t, k) : undefined; }
  if (res.outcome === 'not_sent' && res.code) { const k = `notsent.${res.code}`; return k in strings ? word(t, k) : undefined; }
  return undefined;
}

function ResBanner({ res, t, onDismiss }: { res: Res; t: T; onDismiss: () => void }) {
  return <OutcomeBanner kind={res.outcome as 'failed' | 'not_sent' | 'stale'} error={res} body={resText(res, t)} onDismiss={onDismiss} />;
}
