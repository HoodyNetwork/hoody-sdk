// One record of a project's memory: read with getMemoryItem in the realm shown, with Edit (memories: content,
// type, strength; lessons and slots: content; observations are not editable) and Delete behind a question.
// Both are sent once (C9). An edit of a memory's content or type makes a new record (a new id, the old one kept as
// history): a saved edit opens the id the agent answered. A lost edit answer is held until a fresh record read shows
// every value sent, the edited record's or its successor's (parent = the edited id, same realm and project); a lost delete
// answer until the record read answers not found while a status read of the same realm answers (a realm this login no
// longer serves is "not found" too, so the record's 404 alone proves nothing), or the person stops waiting.
// A failed read wins over what was read before: a 404 shows the record missing, any other failure says the shown
// record may be out of date and turns Edit and Delete off (the held controls stay).
import {
  Band, Button, ConfirmDialog, DetailPage, Disclosure, Drawer, EmptyState, ErrorState, Facts, FormFooter, Outcome, Section, Select, Skeleton,
  TextField, formatDateTime, formatPercent, useStrings, type Fact,
} from '@kit';
import { refusal } from '@core';
import { useEffect, useRef, useState } from 'react';
import { type MemoryAt, useDelete, useEdit, useMemoryStatus, useOtherDeleteThan, useRecord, useSuccessors, writable } from './data';
import { MAX_TTL_DAYS, MEMORY_TIERS, MEMORY_TYPES, deleteProved, editShownBy, heldEditKey, editable, editProblem, listOf, strengthOf, type EditFields, type Kind, type MemoryRecord } from './logic';
import { StrengthBar } from './Library';
import { FormBlock } from '../../parts/raw';
import strings from './Memory.strings.en.json';
import s from './Memory.module.css';

type T = ReturnType<typeof useStrings<typeof strings>>;

export interface DetailProps {
  at: MemoryAt;
  project: string;
  kind: Kind;
  id: string;
  realm: string;
  /** Closes the record (it was not found). */
  onGone: () => void;
  /** Opens another record of this store: the new version an edit made. */
  onMoved: (id: string) => void;
}

export function Detail({ at, project, kind, id, realm, onGone, onMoved }: DetailProps) {
  const t = useStrings(strings);
  const where = { ...at, project, kind, id };
  const q = useRecord(where);
  const status = useMemoryStatus(at, project);
  const edit = useEdit(at, project, kind, id);
  const del = useDelete(at, project, kind, id);
  // Another delete of this store out or held (deletes of one store run one at a time, so a second delete of a record
  // the first may have deleted is never sent): this record's Delete waits, and says why.
  const inMany = useOtherDeleteThan(at, project, kind, id);
  const [editing, setEditing] = useState(false);
  // The edit form's draft lives here, not in the form: the form moves when a read finds the record gone (it then stays
  // open beside the missing state), and a remount must not lose what the person wrote.
  const [draft, setDraft] = useState<Draft | null>(null);
  const openEdit = (r: MemoryRecord) => { setDraft(draftOf(r)); setEditing(true); };
  const closeEdit = () => { setEditing(false); setDraft(null); };
  const [asking, setAsking] = useState(false);
  const rec = q.data;
  const delHeld = del.outcome?.kind === 'pending';
  const editHeld = edit.outcome?.kind === 'pending';
  const busy = edit.busy || del.busy || delHeld || editHeld;

  // The new version a saved edit answered, opened once the edit form has closed (an open, changed form guards
  // against leaving it).
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (!moveTo || editing || moved.current) return;
    moved.current = true;
    onMoved(moveTo);
  }, [moveTo, editing, onMoved]);
  // A held edit of a memory the read shows superseded: its possible successors are read, and the first one showing
  // the edit is checked once (a read-back, nothing sent); a proved edit opens it.
  const successors = useSuccessors(at, project, rec, editHeld);
  const shownBy = editHeld ? successors.map((r) => editShownBy(edit.held, r.data)).find((x): x is string => x !== null) ?? null : null;
  // Kept past the proof: a proved edit frees the hold, and the successor reads stop with it.
  const shownRef = useRef<string | null>(null);
  if (shownBy) shownRef.current = shownBy;
  const checkEdit = async (): Promise<boolean> => {
    const ok = await edit.check();
    const to = shownRef.current;
    if (ok && to && to !== id) {
      closeEdit();
      setMoveTo(to);
    }
    return ok;
  };
  const tried = useRef<string | null>(null);
  useEffect(() => {
    if (!shownBy || tried.current === shownBy) return;
    tried.current = shownBy;
    void checkEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per successor found
  }, [shownBy]);
  const send = async (fields: EditFields) => {
    const r = await edit.run({ ...where, fields });
    const to = (r.data as { id?: unknown } | undefined)?.id;
    if (r.outcome === 'done' && typeof to === 'string' && to !== id) setMoveTo(to);
    return r;
  };

  // Check again of a held delete: read the record and the realm's status now; only both together prove it.
  // A proved delete frees the hold (the runner shows nothing then): the page says Deleted itself.
  const [proved, setProved] = useState(false);
  const checkDelete = async (): Promise<boolean> => {
    const ok = await del.prove(async () => {
      const [r, st] = await Promise.all([q.refetch(), status.refetch()]);
      return deleteProved({ ok: r.isSuccess, error: r.error ? { kind: r.error.kind, code: r.error.code } : null }, { ok: st.isSuccess });
    });
    if (ok) setProved(true);
    return ok;
  };

  const notice = (
    <>
      {delHeld && <Held text={t(del.elsewhere ? 'del.heldElsewhere' : 'del.held')} readOnly={del.elsewhere !== null} onCheck={checkDelete} onDismiss={del.dismiss} />}
      {editHeld && <Held text={t(heldEditKey(edit.held, Boolean(edit.elsewhere), rec))} readOnly={edit.elsewhere !== null} onCheck={checkEdit} onDismiss={edit.dismiss} />}
      {del.outcome && del.outcome.kind !== 'pending' && <Outcome outcome={del.outcome} doneText={t('del.done')} error={refusal(del.outcome)} />}
      {proved && !del.outcome && <Outcome outcome={{ kind: 'done' }} doneText={t('del.done')} /* noDetails: a proved delete, not a rejection */ />}
      {inMany && !busy && writable(at) && <Band tone="neutral" size="table" /* noDetails: a delete waiting for another, nothing refused */>{t('del.waits')}</Band>}
    </>
  );

  const missing = q.error?.kind === 'not_found';
  // The record the edit form was opened on, kept so a read that finds it gone (after a conflict's Reload, say) leaves the
  // form and its draft open, Save off.
  const lastRec = useRef<MemoryRecord | null>(null);
  if (rec && !missing) lastRec.current = rec;
  if (!rec || missing) {
    const body = !q.error && q.isPending ? (
      <Skeleton variant="detail" />
    ) : missing ? (
      <EmptyState icon="warn" size="sm" title={t('d.missing', { realm })} action={<Button onPress={onGone}>{t('d.close')}</Button>} />
    ) : (
      <ErrorState title={t('d.error')} error={q.error} onRetry={() => void q.refetch()} />
    );
    const keep = editing && missing && writable(at) && lastRec.current;
    return (
      <DetailPage header={{ title: t(`kind.${kind}`) }} notice={notice}>
        {body}
        {keep && draft && <EditDrawer rec={keep} kind={kind} blocked="missing" draft={draft} onDraft={setDraft} runner={edit} onSend={send} onCheck={checkEdit} onReload={() => q.refetch()} onClose={closeEdit} t={t} />}
      </DetailPage>
    );
  }

  // Shown from an earlier read while the latest one failed: may be out of date, so nothing is changed from it.
  const stale = q.error !== null;
  const older = rec.latest === false;
  // What blocks a change from this view: guarded where it is sent too, so a drawer or question already open when a
  // refresh fails (or finds the record replaced) sends nothing. An older version is not deleted either: the agent's
  // delete takes its whole lineage, the newer versions included.
  const blocked: Blocked = stale ? 'stale' : older ? 'older' : null;
  // Edit and delete are offered wherever data.ts writable says (a realm and Global alike).
  const canWrite = writable(at);
  const title = rec.title || rec.name || firstLine(rec.content) || rec.id;
  return (
    <DetailPage
      header={{
        title,
        actions: (
          <>
            {canWrite && editable(kind) && <Button size="sm" icon="pen" isDisabled={busy || blocked !== null} onPress={() => openEdit(rec)}>{t('edit')}</Button>}
            {canWrite && <Button size="sm" icon="trash" isDisabled={busy || inMany || blocked !== null} onPress={() => setAsking(true)}>{t('del')}</Button>}
          </>
        ),
      }}
      notice={
        <>
          {notice}
          {stale && <Band tone="warn" size="table" error={q.error} actions={<Button size="sm" onPress={() => void q.refetch()}>{t('retry')}</Button>}>{t('d.stale')}</Band>}
          {older && !editHeld && <Band tone="neutral" size="table" /* noDetails: a fact of the record read, not a failure */>{t('d.older')}</Band>}
        </>
      }
    >
      {rec.subtitle && <p className={s.subtitle}>{rec.subtitle}</p>}
      {rec.content && (
        <Section title={t('d.content')}>
          <p className={s.content}>{rec.content}</p>
        </Section>
      )}
      {rec.facts.length > 0 && (
        <Section title={t('d.obsFacts')}>
          <ul className={s.facts}>
            {rec.facts.map((f, n) => <li key={n}>{f}</li>)}
          </ul>
        </Section>
      )}
      {rec.context && (
        <Section title={t('d.context')}>
          <p className={s.content}>{rec.context}</p>
        </Section>
      )}
      <Section title={t('d.facts')}>
        <Facts items={factsOf(rec, t)} columns={1} />
      </Section>
      <ConfirmDialog
        isOpen={asking && blocked === null && !inMany && canWrite}
        onOpenChange={setAsking}
        title={t('del.title')}
        body={t('del.body')}
        confirmLabel={t('del.go')}
        tone="danger"
        onConfirm={() => {
          setAsking(false);
          if (blocked !== null || inMany || !canWrite) return;
          void del.run({ ...where });
        }}
      />
      {editing && canWrite && draft && <EditDrawer rec={rec} kind={kind} blocked={blocked} draft={draft} onDraft={setDraft} runner={edit} onSend={send} onCheck={checkEdit} onReload={() => q.refetch()} onClose={closeEdit} t={t} />}
    </DetailPage>
  );
}

const firstLine = (x: string) => x.split('\n')[0]?.slice(0, 120) ?? '';

function factsOf(r: MemoryRecord, t: T): Fact[] {
  const out: Fact[] = [];
  const at = (v: string) => (v ? formatDateTime(v) : t('unknown'));
  if (r.kind === 'slot') out.push({ label: t('f.name'), value: r.name, mono: true });
  if (r.kind === 'memory') {
    out.push({ label: t('f.type'), value: r.type || t('unknown') });
    out.push({ label: t('f.strength'), value: <StrengthBar n={r.strength} label={t('strength', { n: r.strength ?? 0 })} unknown={t('unknown')} /> });
    if (r.version !== null) out.push({ label: t('f.version'), value: String(r.version) });
    out.push({ label: t('f.forget'), value: r.forgetAfter ? formatDateTime(r.forgetAfter) : t('f.never') });
    out.push({ label: t('f.concepts'), value: r.concepts.length ? r.concepts.join(', ') : t('none') });
    out.push({ label: t('f.files'), value: r.files.length ? r.files.join('\n') : t('none'), mono: r.files.length > 0 });
  }
  if (r.kind === 'lesson') out.push({ label: t('f.confidence'), value: r.confidence === null ? t('unknown') : formatPercent(r.confidence) });
  if (r.kind === 'observation' && r.tool) out.push({ label: t('f.tool'), value: r.tool, mono: true });
  if (r.kind === 'observation') {
    out.push({ label: t('f.when'), value: at(r.created) });
    return out;
  }
  if (r.created) out.push({ label: t('f.created'), value: at(r.created) });
  out.push({ label: t('f.updated'), value: at(r.updated) });
  return out;
}

type Runner = ReturnType<typeof useEdit>;
/** Why this view may not change the record now: a failed refresh, an older version, or a record a read found gone
 *  while its edit form was open (the form stays, so the draft is not lost; nothing can be saved). */
type Blocked = 'stale' | 'older' | 'missing' | null;
const BLOCKED_TEXT = { stale: 'd.stale', older: 'd.older', missing: 'edit.gone' } as const;

/** What the edit form holds: the values shown, and which of them the person edited (the others follow the record).
 *  Lists are text, one entry per line; confidence is a percent; the expiry is a choice (keep it, never forget, or forget
 *  after a number of days) that never follows the record: it starts at keep. */
type Followed = 'content' | 'type' | 'strength' | 'concepts' | 'files' | 'tier' | 'context' | 'confidence';
type Expiry = 'keep' | 'never' | 'days';
interface Draft extends Record<Followed, string> {
  expiry: Expiry;
  days: string;
  edited: Record<Followed, boolean>;
}
const strengthText = (n: number | null) => (n === null ? '' : String(n));
const percentText = (c: number | null) => (c === null ? '' : String(Number((c * 100).toFixed(4))));
const followed = (r: MemoryRecord): Record<Followed, string> => ({
  content: r.content, type: r.type, strength: strengthText(r.strength), concepts: r.concepts.join('\n'), files: r.files.join('\n'),
  tier: r.tier, context: r.context, confidence: percentText(r.confidence),
});
const FOLLOWED: readonly Followed[] = ['content', 'type', 'strength', 'concepts', 'files', 'tier', 'context', 'confidence'];
const draftOf = (r: MemoryRecord): Draft => ({
  ...followed(r), expiry: 'keep', days: '',
  edited: { content: false, type: false, strength: false, concepts: false, files: false, tier: false, context: false, confidence: false },
});
/** A Select's options: the agent's list, and the record's value now when it is not on it (an older type), so the form
 *  shows what is stored; picking it again changes nothing. */
const choices = (list: readonly string[], now: string, t: T) => [
  ...(now && !list.includes(now) ? [{ value: now, label: t('edit.current', { value: now }) }] : []),
  ...list.map((v) => ({ value: v, label: v })),
];
const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, n) => x === b[n]);

/** The edit form. Only what the person changed is sent besides a memory's or slot's content: every other field goes only when edited
 *  here and different from the record now (lists compared entry by entry, in order). ttl_days goes only when the person
 *  chose an expiry: 0 for never (when the record has one), N for N days from now. A field not edited here follows the
 *  record as it reads again, so a newer value someone else wrote is shown and never written back.
 *  A memory_edit_conflict (another edit changed or replaced the version first; nothing of this one was written) offers
 *  Reload: it reads the record again (nothing is sent) and the draft stays. A replaced record then reads as an older
 *  version, which blocks Save; a record changed in place takes Save again against what it holds now; a record gone keeps
 *  the form open with Save off. */
function EditDrawer({ rec, kind, blocked, draft, onDraft, runner, onSend, onCheck, onReload, onClose, t }: { rec: MemoryRecord; kind: Kind; blocked: Blocked; draft: Draft; onDraft: (f: (d: Draft | null) => Draft | null) => void; runner: Runner; onSend: (f: EditFields) => Promise<{ outcome: string }>; onCheck: () => Promise<boolean>; onReload: () => Promise<unknown>; onClose: () => void; t: T }) {
  const { content, type, strength, concepts, files, tier, context, confidence, expiry, days, edited } = draft;
  const edit = (k: Followed, v: string) => onDraft((d) => (d ? { ...d, [k]: v, edited: { ...d.edited, [k]: true } } : d));
  const setExpiry = (k: 'expiry' | 'days', v: string) => onDraft((d) => (d ? { ...d, [k]: v } : d));
  // A field the person did not edit follows the record as it reads again.
  const now = followed(rec);
  const nowKey = JSON.stringify(now);
  useEffect(() => {
    onDraft((d) => {
      if (!d) return d;
      const next = { ...d };
      for (const k of FOLLOWED) if (!d.edited[k]) next[k] = now[k];
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the record's values decide (nowKey)
  }, [nowKey, onDraft]);
  const memory = kind === 'memory';
  const lesson = kind === 'lesson';
  const conceptList = listOf(concepts);
  const fileList = listOf(files);
  // Days: a whole number 1..MAX_TTL_DAYS (0 would clear the expiry: that is Never).
  const dayCount = /^\d+$/.test(days.trim()) ? Number(days.trim()) : NaN;
  const daysBad = memory && expiry === 'days' && !(dayCount >= 1 && dayCount <= MAX_TTL_DAYS);
  const percent = confidence.trim() === '' ? NaN : Number(confidence) / 100;
  const fields: EditFields = {
    // A lesson's content goes only when edited: the agent writes every lesson field sent (EditLessonPatch), so an
    // untouched one would put back text another writer has since replaced. A memory and a slot always carry it.
    ...(!lesson || (edited.content && content !== rec.content) ? { content } : {}),
    ...(memory && edited.type && type !== rec.type ? { type } : {}),
    ...(memory && edited.strength && strength !== '' && Number(strength) !== rec.strength ? { strength: Number(strength) } : {}),
    ...(memory && edited.concepts && !sameList(conceptList, rec.concepts) ? { concepts: conceptList } : {}),
    ...(memory && edited.files && !sameList(fileList, rec.files) ? { files: fileList } : {}),
    ...(memory && edited.tier && tier !== '' && tier !== rec.tier ? { tier } : {}),
    ...(memory && expiry === 'never' && rec.forgetAfter !== '' ? { ttl_days: 0 } : {}),
    ...(memory && expiry === 'days' && !daysBad ? { ttl_days: dayCount } : {}),
    ...(lesson && edited.context && context !== rec.context ? { context } : {}),
    ...(lesson && edited.confidence && percent !== rec.confidence ? { confidence: percent } : {}),
  };
  const problem = daysBad ? 'ttl' : editProblem(rec, fields);
  const held = runner.held !== null;
  const dirty = problem !== 'unchanged';
  const conflict = runner.outcome?.kind === 'failed' && runner.outcome.code === 'memory_edit_conflict';
  const [reloading, setReloading] = useState(false);
  // A memory's concepts, files, tier and forget date fold under More options: open from the start when one of them
  // holds something (a list, a forget date, a choice made before), and held open while one of them blocks Save, so a
  // refusal is never hidden (a fold opened that way stays open once the refusal goes; a close is ignored while it shows).
  const [more, setMore] = useState(() => conceptList.length > 0 || fileList.length > 0 || rec.forgetAfter !== '' || expiry !== 'keep' || edited.tier);
  const mustShow = daysBad || problem === 'tier';
  useEffect(() => {
    if (mustShow) setMore(true);
  }, [mustShow]);
  return (
    <Drawer resizeKey="ai-memory-edit"
      isOpen
      onOpenChange={(o) => !o && !runner.busy && onClose()}
      title={t('edit.title')}
      subtitle={t('edit.lede')}
      size="md"
      dirty={dirty && !held && !runner.busy}
      footer={
        held ? undefined : (
          <FormFooter
            dirty={dirty}
            requireDirty={false}
            submitDisabled={problem !== null || blocked !== null}
            // What Save waits for when no field says it: "N days from now" chosen with the count still empty.
            reason={daysBad && days.trim() === '' && !runner.busy ? t('edit.needDays') : undefined}
            busy={runner.busy}
            busyLabel={t('edit.busy')}
            outcome={runner.outcome}
            error={refusal(runner.outcome)}
            onCheck={onCheck}
            doneText={t('edit.done')}
            submitLabel={t('edit.go')}
            onSubmit={() => {
              if (problem !== null || held || blocked !== null) return;
              void onSend(fields).then((r) => { if (r.outcome === 'done') onClose(); });
            }}
          />
        )
      }
    >
      {held ? (
        <Held text={t(heldEditKey(runner.held, Boolean(runner.elsewhere), rec))} readOnly={runner.elsewhere !== null} onCheck={onCheck} onDismiss={runner.dismiss} />
      ) : (
        <div className={s.form}>
          {/* The draft stays; Save waits until the record reads again as the latest version. */}
          {blocked && <Band tone={blocked === 'older' ? 'neutral' : 'warn'} size="table" /* noDetails: the page's band carries the read's error */>{t(BLOCKED_TEXT[blocked])}</Band>}
          {conflict && !blocked && (
            <Band
              tone="warn"
              size="table"
              /* noDetails: the footer carries the refusal and its Details */
              actions={<Button size="sm" busy={reloading} onPress={() => { setReloading(true); void onReload().finally(() => setReloading(false)); }}>{t('edit.reload')}</Button>}
            >
              {t('edit.conflict')}
            </Band>
          )}
          <TextField label={t('edit.content')} value={content} onChange={(v) => edit('content', v)} multiline rows={8} errorMessage={problem === 'empty' ? t('edit.empty') : undefined} />
          {memory && (
            <Select label={t('edit.type')} value={type === '' ? undefined : type} onChange={(v) => edit('type', v)} options={choices(MEMORY_TYPES, rec.type, t)} />
          )}
          {memory && (
            <Select
              label={t('edit.strength')}
              description={t('edit.strengthHelp')}
              value={strength === '' ? undefined : strength}
              onChange={(v) => edit('strength', strengthOf(Number(v)) === null ? '' : v)}
              options={Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
            />
          )}
          {memory && (
            <Disclosure title={t('edit.more')} isExpanded={more || mustShow} onExpandedChange={(v) => setMore(v || mustShow)}>
              <FormBlock className={s.form}>
                <TextField label={t('edit.concepts')} value={concepts} onChange={(v) => edit('concepts', v)} multiline rows={3} />
                <TextField label={t('edit.files')} value={files} onChange={(v) => edit('files', v)} multiline rows={3} mono />
                <Select label={t('edit.tier')} value={tier === '' ? undefined : tier} onChange={(v) => edit('tier', v)} options={choices(MEMORY_TIERS, rec.tier, t)} />
                <Select<Expiry>
                  label={t('edit.forget')}
                  value={expiry}
                  onChange={(v) => setExpiry('expiry', v)}
                  options={[
                    { value: 'keep', label: rec.forgetAfter ? t('edit.forget.keep', { when: formatDateTime(rec.forgetAfter) }) : t('edit.forget.keepNever') },
                    { value: 'never', label: t('edit.forget.never') },
                    { value: 'days', label: t('edit.forget.days') },
                  ]}
                />
                {expiry === 'days' && (
                  <TextField label={t('edit.days')} value={days} onChange={(v) => setExpiry('days', v)} inputMode="numeric" errorMessage={daysBad && days.trim() !== '' ? t('edit.daysBad', { max: String(MAX_TTL_DAYS) }) : undefined} />
                )}
              </FormBlock>
            </Disclosure>
          )}
          {lesson && <TextField label={t('edit.context')} value={context} onChange={(v) => edit('context', v)} multiline rows={3} />}
          {lesson && (
            <TextField label={t('edit.confidence')} value={confidence} onChange={(v) => edit('confidence', v)} inputMode="decimal" errorMessage={problem === 'confidence' ? t('edit.confidenceBad') : undefined} />
          )}
        </div>
      )}
    </Drawer>
  );
}

/** A held change: what may have gone through, Open it (when `onOpen`: a record that shows it), Check again (reads
 *  only) and Stop waiting behind a question (its body `dismissBody`, by default a record's). */
export function Held({ text, readOnly, onCheck, onDismiss, onOpen, dismissBody }: { text: string; readOnly: boolean; onCheck: () => Promise<boolean>; onDismiss: () => Promise<boolean>; onOpen?: () => void; dismissBody?: string }) {
  const t = useStrings(strings);
  const [checking, setChecking] = useState(false);
  const [asked, setAsked] = useState(false);
  return (
    <>
      <Band
        tone="warn"
        size="table"
        /* noDetails: an unknown outcome has no rejection to show; Check again reads the record back */
        actions={
          <>
            {onOpen ? <Button size="sm" onPress={onOpen}>{t('held.open')}</Button> : null}
            <Button size="sm" busy={checking} onPress={() => { setChecking(true); void onCheck().finally(() => setChecking(false)); }}>{t('held.check')}</Button>
            {readOnly ? null : <Button size="sm" variant="ghost" onPress={() => setAsked(true)}>{t('held.dismiss')}</Button>}
          </>
        }
      >
        {text}
      </Band>
      <ConfirmDialog
        isOpen={asked && !readOnly}
        onOpenChange={setAsked}
        title={t('held.dismissTitle')}
        body={dismissBody ?? t('held.dismissBody')}
        confirmLabel={t('held.dismiss')}
        onConfirm={() => { setAsked(false); void onDismiss(); }}
      />
    </>
  );
}
