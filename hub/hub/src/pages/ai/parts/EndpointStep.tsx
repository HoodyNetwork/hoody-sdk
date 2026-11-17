// Your own endpoint: create (name, https address, models, protocol under Advanced) and edit. The id is
// planned before the first send; a lost create is replayed once with the same key and read back.
import { Button, Checkbox, ConfirmDialog, showToast, Disclosure, Form, FormFooter, HeldBand, Select, Skeleton, ErrorState, TextField, useStrings } from '@kit';
import { usePrefUpdate } from '@core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { checkEdit, sendEdit, stopEdit, useHeldEdit, type EditAt } from '../endpointEditHold';
import { checkCreated, createEndpoint, normUrl, parseEndpoint, planEndpoint, readEndpoint, WIRES, type BadField, type CreatePlan, type Saved } from '../flows-endpoint';
import { onlyOn, shownComputer } from '../shownGate';
import strings from '../strings.en.json';
import { useAi } from './ctx';
import { failedUi, type Ui } from './outcome';
import s from './parts.module.css';

const BAD: Record<BadField, string> = { display_name: 'ep.badName', base_url: 'ep.badAddress', models: 'ep.badModels' };

type HeldForm = { name: string; address: string; models: string; wire: string };
type HeldCreate = { plan: CreatePlan; form: HeldForm };
const ID = /^[A-Za-z0-9_.:-]{1,64}$/;
const text = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max;
/** A create whose answer is unknown, per computer, kept in core's account prefs (per account and realm): closing the
 *  drawer, leaving the page or switching realm must not free the plan (id and key) for a new one. */
/** Whether a value core could not store loses a hold: any hold in it, not only this computer's. Every computer of a
 *  realm shares one pending queue (account+realm), and core tells only the handler of the last update, which may be
 *  another computer's (as Notes). null: a change made through a callback of an earlier realm, not worked out. */
export const holdNotKeptWarns = (wanted: Record<string, unknown> | null): boolean => !wanted || Object.keys(wanted).length > 0;
// The longest list a hold can carry: the plan's own names, one per line (at most 500 of 200 bytes, so 200 UTF-16 units).
// A value too large for the store is refused there and said once (onUnsaved), never kept and then dropped by this read.
const HELD_MODELS = 500 * 200 + 499;
// More holds than the store can hold (VALUE_MAX 48,000 bytes; a hold is over 200 bytes), so this read never drops one.
const HELD_COMPUTERS = 256;
export const parseHolds = (raw: unknown): Record<string, HeldCreate> => {
  const out: Record<string, HeldCreate> = {};
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  for (const [id, v] of Object.entries(o).slice(0, HELD_COMPUTERS)) {
    const x = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
    const p = x.plan && typeof x.plan === 'object' ? (x.plan as Record<string, unknown>) : {};
    const b = p.body && typeof p.body === 'object' ? (p.body as Record<string, unknown>) : null;
    const f = x.form && typeof x.form === 'object' ? (x.form as Record<string, unknown>) : {};
    const okBody = !!b && text(b.id, 80) && text(b.model_prefix, 80) && text(b.display_name, 200) && text(b.wire_format, 40) && text(b.base_url, 600) && Array.isArray(b.models) && b.models.length <= 500 && b.models.every((m) => !!m && typeof m === 'object' && text((m as Record<string, unknown>).model, 200));
    if (!okBody || !ID.test(id) || !text(p.id, 80) || !text(p.idem, 100) || !b || !text(f.name, 200) || !text(f.address, 600) || !text(f.models, HELD_MODELS) || !text(f.wire, 40)) continue;
    out[id] = { plan: { id: p.id, idem: p.idem, replay: true, body: b as CreatePlan['body'] }, form: { name: f.name, address: f.address, models: f.models, wire: f.wire } };
  }
  return out;
};

/** A computer no shownComputer() value ever equals: every call pinned to it answers stale, nothing sent. */
const NOWHERE = '\u0000';

export function EndpointCreate({ onCreated }: { onCreated: (id: string, label: string, rev: string | null) => void }) {
  const t = useStrings(strings);
  const { api, env, m } = useAi();
  const where = m.computer?.id ?? '';
  // Every call of a create (its plan read, the send, its replay and Check again, the leave toast's included) goes to this
  // step's own computer (where: its hold is stored under it), or nowhere (answered stale): never to another one core
  // shows. Each flow takes its pin as it starts (a render's value can be older than core in either direction: drawn
  // while another computer was shown, or before a switch), and keeps it to its end.
  const pinNow = () => {
    const shown = shownComputer();
    return onlyOn(api, where && shown.endsWith(`\n${where}`) ? shown : NOWHERE);
  };
  // A hold that is not stored (refused now or by the browser later, beaten by another tab more often than core applies
  // it again, or dropped because the account changed or its stored value stopped opening) is not kept: say so once.
  // Core keeps applying it after this step unmounts (Back, close), and says so then.
  const notKept = (wanted: Record<string, HeldCreate> | null) => { if (holdNotKeptWarns(wanted)) showToast({ title: t('ep.holdNotKept'), tone: 'warn' }); };
  const { value: holds, update: updateHolds } = usePrefUpdate('hub_ai_v1', parseHolds, { scope: 'account+realm', part: ID.test(m.realm ?? '') ? (m.realm as string) : 'x', onUnsaved: notKept });
  const held = ID.test(where) ? holds[where] : undefined;
  const [f, setF] = useState<HeldForm>(held?.form ?? { name: '', address: '', models: '', wire: WIRES[0] as string });
  /** Stores `h` for this computer, or (h null) lets go of the plan `gone` names: only while that plan is still the one
   *  stored. Another tab may have dismissed it and held a new create meanwhile; an old toast's proof never ends that one. */
  const hold = (h: HeldCreate | null, gone?: string) => {
    if (!ID.test(where)) return;
    const at = where;
    // A function of the stored holds: core applies it again on top of another tab's holds when that tab stored first.
    updateHolds((now) => {
      if (!h && (gone === undefined || now[at]?.plan.id !== gone)) return now;
      const { [at]: _old, ...rest } = now;
      return h ? { ...rest, [at]: h } : rest;
    });
  };
  const [bad, setBad] = useState<Partial<Record<BadField, string>>>({});
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Ui | null>(held ? { kind: 'pending', message: t('ep.notConfirmed') } : null);
  const plan = useRef<CreatePlan | null>(held?.plan ?? null);
  const drop = () => {
    const gone = plan.current?.id;
    plan.current = null;
    hold(null, gone);
  };
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  const submit = async () => {
    const pin = pinNow();
    const p = parseEndpoint(f);
    if ('bad' in p) {
      const m: Partial<Record<BadField, string>> = {};
      for (const k of Object.keys(p.bad) as BadField[]) m[k] = t(BAD[k] as never);
      return setBad(m);
    }
    setBad({});
    setOut(null);
    setBusy(true);
    // The plan (the id and the key) is made once; a retry after "not confirmed" reuses it.
    if (!plan.current) {
      const r = await planEndpoint(pin, p.def, env.newKey());
      if (!live.current || r.state === 'stale') return setBusy(false);
      if (r.state !== 'plan') {
        setBusy(false);
        // Nothing was sent yet (only the provider list was read): a read failure, never "may have gone through".
        return r.state === 'name_taken' ? setBad({ display_name: t('ep.nameTaken') }) : setOut({ kind: 'not_sent', message: t('err.notSent') });
      }
      plan.current = r.plan;
    }
    // Held before the send: whatever happens to the answer (Back, reload, a realm switch), the id and key stay with this computer.
    // The form is the plan's own definition, not the typed text (spaces, blank lines and repeats are gone): a retry
    // reuses that plan, and every valid value fits what parseHolds takes back.
    // The plan this send is for, kept past the await: a drop() while it is out empties plan.current.
    const sent = plan.current;
    const b = sent.body;
    hold({ plan: sent, form: { name: b.display_name, address: b.base_url, models: b.models.map((x) => x.model).join('\n'), wire: b.wire_format } });
    const r = await createEndpoint(pin, sent, () => live.current);
    setBusy(false);
    if (!live.current || r.state === 'stale') return;
    if (r.state === 'created') {
      hold(null, sent.id);
      return onCreated(sent.id, p.def.name, r.rev);
    }
    if (r.state === 'name_taken') {
      drop();
      return setBad({ display_name: t('ep.nameTaken') });
    }
    if (r.state === 'other_endpoint') {
      drop();
      return setBad({ display_name: t('ep.otherEndpoint') });
    }
    if (r.state === 'invalid') {
      drop();
      const k = (['display_name', 'base_url', 'models'] as const).find((x) => x === r.field || (x === 'models' && r.field.startsWith('models')));
      // An address this form's own check let through and the agent refused: its host does not resolve, or is not public.
      return k ? setBad({ [k]: k === 'base_url' ? t('ep.addressRefused') : t(BAD[k] as never) }) : setOut({ kind: 'failed', message: t('err.field') });
    }
    if (r.state === 'failed') {
      drop();
      return setOut(failedUi(r.err));
    }
    setOut({ kind: 'pending', message: t('ep.notConfirmed') });
  };

  // "Check again" only reads: the endpoint is compared with what was sent, nothing is written.
  const check = async (): Promise<boolean> => {
    const pl = plan.current;
    if (!pl) return false;
    const pin = pinNow();
    setBusy(true);
    const r = await checkCreated(pin, pl);
    setBusy(false);
    if (r.state === 'stale') return false;
    // The hold ends with the proof even when the drawer is gone (the toast's Check again).
    if (r.state === 'created') {
      hold(null, pl.id);
      if (live.current) onCreated(pl.id, f.name.trim(), r.rev);
      return true;
    }
    if (r.state === 'other_endpoint') {
      drop();
      if (live.current) {
        setOut(null);
        setBad({ display_name: t('ep.otherEndpoint') });
      }
      return true;
    }
    if (live.current) setOut({ kind: 'pending', message: t('ep.notConfirmed') });
    return false;
  };

  // A held create that never applied must not lock the form for good: sending it again reuses the same id and key
  // (the agent dedupes it); only the person's explicit "allow again" frees the plan for a new one.
  const [warn, setWarn] = useState(false);
  const allowAgain = () => {
    setWarn(false);
    drop();
    setOut(null);
  };
  const stuck = out?.kind === 'pending' && !busy && plan.current !== null;

  return (
    <>
      <Form onSubmit={() => void submit()} locked={busy || out?.kind === 'pending'}>
        <div className={s.stack}>
          <TextField label={t('ep.name')} value={f.name} onChange={set('name')} errorMessage={bad.display_name} isDisabled={busy} isRequired />
          <TextField label={t('ep.address')} description={t('ep.addressHint')} value={f.address} onChange={set('address')} errorMessage={bad.base_url} isDisabled={busy} mono placeholder={t('ep.placeholder')} isRequired />
          <TextField label={t('ep.models')} description={t('ep.modelsHint')} value={f.models} onChange={set('models')} errorMessage={bad.models} isDisabled={busy} multiline mono rows={4} isRequired />
          <Disclosure title={t('ep.advanced')} className={s.advanced}>
            <Select label={t('ep.protocol')} options={WIRES.map((w) => ({ value: w, label: t(`ep.wire.${w}` as never) }))} value={f.wire} onChange={set('wire')} isDisabled={busy} />
          </Disclosure>
          <FormFooter dirty={Boolean(f.name || f.address || f.models)} busy={busy} outcome={out ?? undefined} onCheck={check} submitLabel={t('ep.add')} />
        </div>
      </Form>
      {stuck && (
        <div className={s.stack}>
          <Button variant="secondary" onPress={() => void submit()}>
            {t('ep.sendAgain')}
          </Button>
          {/* Short words: the whole one fits no narrow drawer as a chip button; its dialog says allow creating again. */}
          <Button variant="secondary" onPress={() => setWarn(true)}>
            {t('ep.allowAgainShort')}
          </Button>
        </div>
      )}
      <ConfirmDialog isOpen={warn} onOpenChange={setWarn} title={t('ep.allowAgain')} body={t('ep.allowAgainBody')} confirmLabel={t('ep.allowAgainConfirm')} tone="danger" onConfirm={allowAgain} />
    </>
  );
}

export function EndpointEdit({ providerId, onSaved }: { providerId: string; onSaved: () => void }) {
  const t = useStrings(strings);
  const { m, api, reload } = useAi();
  const [before, setBefore] = useState<(Saved & { wire: string }) | null | 'failed'>(null);
  const [f, setF] = useState({ name: '', address: '', models: '' });
  const [ok, setOk] = useState(false);
  const [bad, setBad] = useState<Partial<Record<BadField, string>>>({});
  // Save refused a moved address without the send-key box. It is shown on Address only while the box is unticked and
  // the address is the one Save refused: a field error blocks the Form's submit, so a tick, editing the address or Reset must end it.
  const [askKey, setAskKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Ui | null>(null);
  // A save whose answer is unknown is core's hold of this computer and endpoint (endpointEditHold.ts), never this form's
  // state: the drawer closed and opened again (or the page left, or another tab) shows it with Check again over a locked
  // form, never a Save a second change could be sent from. `out` keeps only refusals and "Nothing was sent".
  const at = useMemo((): EditAt | null => (m.computer && m.target ? { project: m.target.project.id, computer: m.computer.id } : null), [m.computer, m.target]);
  const held = useHeldEdit(at, providerId);
  // Check again reads only from the computer this render shows (`on`), the one whose hold it draws.
  const on = shownComputer();
  const shown = busy ? null : held;
  // What the last Check again said while the hold stays.
  const [still, setStill] = useState(false);
  const live = useRef(true);
  const load = async () => {
    setBefore(null);
    // Reset puts the stored values back without the fields' onChange: their errors, the refusal and the tick go with them
    // (a field error left on would block every Save).
    setBad({});
    setAskKey(false);
    setOk(false);
    setOut(null);
    const r = await readEndpoint(api, providerId);
    if (!live.current || r.state === 'stale') return;
    if (r.state !== 'ok') return setBefore('failed');
    setBefore(r.def);
    setF({ name: r.def.name, address: r.def.base_url, models: r.def.models.join('\n') });
  };
  useEffect(() => {
    live.current = true;
    void load();
    return () => {
      live.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId]);

  if (before === null) return <Skeleton variant="rows" rows={3} />;
  if (before === 'failed') return <ErrorState size="compact" title={t('ep.loadFailed')} onRetry={() => void load()} />;
  const moved = normUrl(f.address.trim()) !== normUrl(before.base_url);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  const submit = async () => {
    if (held) return;
    const p = parseEndpoint({ ...f, wire: before.wire });
    if ('bad' in p) {
      const m: Partial<Record<BadField, string>> = {};
      for (const k of Object.keys(p.bad) as BadField[]) m[k] = t(BAD[k] as never);
      return setBad(m);
    }
    if (p.def.base_url !== normUrl(before.base_url) && !ok) {
      setBad({});
      return setAskKey(true);
    }
    setBad({});
    setOut(null);
    setStill(false);
    setBusy(true);
    const r = at ? await sendEdit(api, at, providerId, before, { name: p.def.name, base_url: p.def.base_url, models: p.def.models }, on) : ({ state: 'not_held' } as const);
    setBusy(false);
    // Not confirmed, a context that moved on, or already held: the hold shows it.
    if (!live.current || r.state === 'stale' || r.state === 'not_confirmed' || r.state === 'held') return;
    if (r.state === 'not_held') return setOut({ kind: 'not_sent', message: t('def.notHeld') });
    if (r.state === 'saved' || r.state === 'unchanged') {
      reload();
      return onSaved();
    }
    if (r.state === 'invalid') {
      // The agent names the refused field (422 provider_invalid, details.field): the error goes on that field, as on create.
      const k = (['display_name', 'base_url', 'models'] as const).find((x) => x === r.field || (x === 'models' && r.field.startsWith('models')));
      // An address this form's own check let through and the agent refused: its host does not resolve, or is not public.
      return k ? setBad({ [k]: k === 'base_url' ? t('ep.addressRefused') : t(BAD[k] as never) }) : setOut({ kind: 'failed', message: t('err.field') });
    }
    if (r.state === 'failed') setOut(failedUi(r.err));
  };
  const check = async () => {
    if (!shown) return;
    const r = await checkEdit(api, providerId, shown, on);
    if (!live.current) return;
    if (r === 'saved') {
      reload();
      return onSaved();
    }
    setStill(r === 'not_confirmed');
  };
  const stop = async () => {
    if (!shown) return;
    // Let go: the form starts again from the endpoint as the agent now stores it.
    if ((await stopEdit(shown)) && live.current) void load();
  };

  return (
    <Form onSubmit={() => void submit()} locked={busy || held !== null}>
      <div className={s.stack}>
        {shown && (
          <HeldBand
            text={t('err.notConfirmed')}
            readOnly={false}
            onCheck={check}
            onDismiss={stop}
            overlayId="ai-endpoint-edit-stop-tracking"
            note={still ? t('ep.stillNot') : undefined}
            inFlight={shown.inFlight}
          />
        )}
        <TextField label={t('ep.name')} value={f.name} onChange={set('name')} errorMessage={bad.display_name} isDisabled={busy} />
        <TextField label={t('ep.address')} value={f.address} onChange={(v) => { setAskKey(false); set('address')(v); }} errorMessage={bad.base_url ?? (askKey && !ok ? t('ep.addressMoved') : undefined)} isDisabled={busy} mono />
        {moved && <Checkbox label={t('ep.sendKey')} isSelected={ok} onChange={setOk} />}
        <TextField label={t('ep.models')} description={t('ep.modelsHint')} value={f.models} onChange={set('models')} errorMessage={bad.models} isDisabled={busy} multiline mono rows={4} />
        <FormFooter dirty busy={busy} outcome={out ?? undefined} submitLabel={t('ep.save')} />
        <Button variant="ghost" onPress={() => void load()} isDisabled={busy || held !== null}>
          {t('ep.reset')}
        </Button>
      </div>
    </Form>
  );
}
