// The New and Edit drawer: step 1 chooses what to create, step 2 is the form (or, for an agent timer or loop, the words for the
// agent). The command is never loaded on edit (empty keeps the saved one). The preview is computed from the fields themselves
// (logic.nextRuns), so it can never disagree with them; the kit is asked only for what that cannot read.
import {
  Band, Button, Checkbox, ConfirmDialog, useWipeOn, Drawer, Form, FormFooter, ItemList, NumberField, PickCard, Row, SegmentedControl, Select, Stack, TextButton, TextField, TimeField, Verdict, normalizeTime, useStrings,
  type AskStartOutcome, type OutcomeLike, type Option,
} from '@kit';
import scheduleAsk from '@kit/scheduleAsk.strings.en.json';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDescribe } from '../data';
import {
  type Draft, EVERY, MAX_COMMAND, MAX_NAME, type Kit, type Preset, type Preview, type SchedRow, draftExpr, draftFrom, emptyDraft, nextRuns, problem,
} from '../logic';
import strings from '../strings.en.json';
import s from './Editor.module.css';
import { type Zone, exprText, labelText, pad, runLine } from './words';

export interface EditorProps {
  /** 'new' opens the chooser; a row edits that row. */
  target: 'new' | SchedRow;
  now: number;
  zone: Zone;
  busy: boolean;
  outcome: OutcomeLike | undefined;
  /** Check again; none for an earlier save no read can confirm. */
  onCheck?: () => void;
  checking: boolean;
  /** A check found nothing: the person may release the held save and edit again. */
  stuck?: boolean;
  /** An earlier send of this save's lock is held (READ_BACK_FIRST): Check can't confirm it, so the person may release it.
   *  For a cron edit that is this entry's lock (a save or turning it on or off); for a web request's time, an earlier
   *  save of it; for a new one, any create on the computer, this same one included. */
  earlier?: boolean;
  /** Releases exactly the held save `held` named when the question was opened (nothing when another took its place). */
  onForget?: (held: unknown) => void;
  /** The held save shown now (any value naming it: the page's record of that send); a change closes an open question. */
  held?: unknown;
  onSave: (draft: Draft, expr: string, row: SchedRow | null) => void;
  onClose: () => void;
  onScripts?: () => void;
  onChat?: () => void;
  /** Only while Ask is on (both or neither): the agent choice is the drawer's own step. Send starts a NEW Agent conversation
   *  with the words and tells each outcome change (C9) to `onStart`, which answers whether this drawer still showed it (false
   *  once it closed: the page then says a start that did not leave). The other puts the words in the Agent panel's composer,
   *  not sent. Without them the agent choice opens this computer's Bots (onChat), the only way to the agent then. */
  onAskSend?: (text: string, onStart: (o: AskStartOutcome) => boolean) => void;
  onAskPanel?: (text: string) => void;
  /** The web request choice opens Programs. Its text never names a stopped Curl: adding a web-request schedule starts it. */
  onPrograms?: () => void;
}

/** The example asks under the agent step's box (the shared table AI's New chat reads too): "Schedule " and its words. */
export const ASK_EXAMPLES = ['backups', 'disk', 'logs'] as const;

/** An example after the words there, once: an untouched start (empty or just the prompt) becomes the example, and so does a
 *  last paragraph that is just the prompt; other words stay and the example follows on a new paragraph. */
export function withAsk(text: string, prompt: string, example: string): string {
  const full = `${prompt}${example}`;
  if (text.includes(full)) return text;
  const kept = text.replace(/\s+$/, '');
  const last = kept.split(/\n[ \t]*\n/).pop() ?? '';
  if (last.trim() === '' || last.trim() === prompt.trim()) return kept.slice(0, kept.length - last.length) + full;
  return `${kept}\n\n${full}`;
}

const KINDS: Preset['k'][] = ['every', 'hourly', 'daily', 'weekdays', 'weekly', 'monthly', 'reboot', 'custom'];

type Shown = { kind: 'runs'; runs: number[]; never: boolean } | { kind: 'error'; text: string } | { kind: 'text'; text: string } | { kind: 'wait' } | null;

export function Editor({ target, now, zone, busy, outcome, onCheck, checking, stuck, earlier, onForget, held, onSave, onClose, onScripts, onChat, onAskSend, onAskPanel, onPrograms }: EditorProps) {
  const t = useStrings(strings);
  const sa = useStrings(scheduleAsk);
  const row = target === 'new' ? null : target;
  const [step, setStep] = useState<'pick' | 'form' | 'agent'>(row ? 'form' : 'pick');
  // The agent step's words live here, so Back to the chooser and in again keeps them; the start's outcome is this drawer's (C9).
  const [words, setWords] = useState(() => sa('prompt'));
  const [sent, setSent] = useState<AskStartOutcome | 'sending' | null>(null);
  // Allowing another save lets the held one go: asked once more (the band's text is the warning, the question the second step).
  // The question keeps the held save it was opened for; it closes when that save is no longer the one shown (cleared, or another
  // took its place), so a confirm never lets a later send go.
  const [allowAsk, setAllowAsk] = useState<{ held: unknown } | null>(null);
  const shownHeld = stuck || earlier ? held : undefined;
  const showsBand = !!(stuck || earlier);
  useEffect(() => {
    setAllowAsk((a) => (a && (!showsBand || a.held !== shownHeld) ? null : a));
  }, [showsBand, shownHeld]);
  // The start's C9 line in the footer (one object per outcome, so the kit's outcome hooks see a change only when it changes).
  const agentOutcome = useMemo<OutcomeLike | undefined>(
    () => (sent === 'notSent' ? { kind: 'not_sent', message: t('new.agentNotSent') } : sent === 'unknown' ? { kind: 'pending', message: t('new.agentUnknown') } : undefined),
    [sent, t],
  );
  const asks = !!onAskSend && !!onAskPanel;
  // A start's later word reaches this drawer only while it is open (a closed one never closes the drawer opened after it).
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);
  // Focus follows the step: the box on entering the agent step (caret at the end), Name on entering a new schedule's form,
  // the choice the person came from on Back.
  const box = useRef<HTMLTextAreaElement>(null);
  const nameBox = useRef<HTMLInputElement>(null);
  const isNew = !row;
  const cmdChoice = useRef<HTMLButtonElement>(null);
  const agentChoice = useRef<HTMLButtonElement>(null);
  const backFrom = useRef<'form' | 'agent' | null>(null);
  useEffect(() => {
    if (step === 'agent') {
      const el = box.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    } else if (step === 'form' && isNew) {
      nameBox.current?.focus();
    } else if (step === 'pick' && backFrom.current) {
      (backFrom.current === 'agent' ? agentChoice : cmdChoice).current?.focus();
      backFrom.current = null;
    }
  }, [step, isNew]);
  const back = () => {
    backFrom.current = step === 'agent' ? 'agent' : 'form';
    setStep('pick');
  };
  const kit: Kit = row?.src === 'curl' ? 'curl' : 'cron';
  const name0 = row && 'name' in row.label && row.src !== 'timer' ? row.label.name : '';
  const initial = useMemo(() => (row ? draftFrom(row, name0) : emptyDraft()), [row, name0]);
  const [draft, setDraft] = useState<Draft>(initial);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  // The typed command may hold a secret: a context end clears it.
  useWipeOn(() => setDraft((d) => ({ ...d, command: '' })));
  const time0 = `${pad(initial.hour)}:${pad(initial.minute)}`;
  const [timeText, setTimeText] = useState(time0);
  const expr = draftExpr(kit, draft);
  const problemKey = problem(kit, draft, !row);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  // The form holds work: its fields, or a time typed but not yet a time (kept apart from the draft until it reads as one).
  const formWork = dirty || timeText !== time0;
  // The agent step holds work once its words go past the prompt.
  const empty = words.trim() === '' || words.trim() === sa('prompt').trim();
  // One thing is made here: going into one step while the other holds work asks first, and going on
  // drops that work, so a step that closes the drawer when it is done (sent, the Agent panel, Create) never drops the other's.
  const [leaving, setLeaving] = useState<'form' | 'agent' | null>(null);
  const enter = (to: 'form' | 'agent') => {
    if (to === 'agent' ? formWork : !empty) setLeaving(to);
    else setStep(to);
  };
  const leave = () => {
    if (leaving === 'agent') { setDraft(initial); setTimeText(time0); }
    else { setWords(sa('prompt')); setSent(null); }
    setStep(leaving ?? 'pick');
    setLeaving(null);
  };
  const locked = busy || outcome?.kind === 'pending';

  // What the fields mean, read here. Only an expression with names or macros asks the kit.
  const local: Preview | null = useMemo(() => (expr && kit === 'cron' && expr !== '@reboot' ? nextRuns(expr, now, zone.offset ?? 0, 5) : null), [expr, kit, now, zone.offset]);
  const describe = useDescribe();
  const [remote, setRemote] = useState<Shown>(null);
  const askKit = !!expr && kit === 'cron' && expr !== '@reboot' && local !== null && !local.ok && local.field === null;
  useEffect(() => {
    if (!askKit || !expr) {
      setRemote(null);
      return;
    }
    setRemote({ kind: 'wait' });
    let live = true;
    const id = setTimeout(() => {
      void describe(expr).then((p) => {
        if (!live) return;
        if (!p) setRemote({ kind: 'text', text: t('ed.previewFail') });
        else if (p.error) setRemote({ kind: 'error', text: t('pv.shape') });
        else setRemote({ kind: 'runs', runs: p.next.slice(0, 5), never: !!p.never });
      });
    }, 350);
    return () => {
      live = false;
      clearTimeout(id);
    };
    // describe is a fresh function each render; the expression is the only input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askKit, expr]);

  const fieldError = (f: NonNullable<Extract<Preview, { ok: false; field: string }>['field']>, min: number, max: number): string =>
    f === 'weekday' ? t('pv.errWeekday') : t('pv.err', { field: t(`pv.f.${f}` as 'pv.f.hour'), min, max });
  const shown: Shown = (() => {
    if (kit === 'curl') return { kind: 'text', text: t('e.checkedOnSave') };
    if (!expr) return { kind: 'text', text: t('e.incomplete') };
    if (expr === '@reboot') return { kind: 'text', text: t('p.reboot') };
    if (local?.ok) return { kind: 'runs', runs: local.runs, never: local.never };
    if (local && !local.ok && local.field !== null) return { kind: 'error', text: fieldError(local.field, local.min, local.max) };
    return remote;
  })();
  const exprError = shown?.kind === 'error' && draft.kind === 'custom' ? shown.text : undefined;

  // A typed expression in words ("Every 15 minutes"), above its next runs; none for shapes it cannot name.
  const meaning = draft.kind === 'custom' ? exprText(t, kit, draft.custom) : null;
  const title = row ? t('ed.title.edit', { name: labelText(t, row.label) }) : t('ed.title.new');
  const kindOptions: Option<Preset['k']>[] = KINDS.filter((k) => !(k === 'reboot' && kit === 'curl')).map((k) => ({ value: k, label: t(`ed.k.${k}`) }));
  const days = [0, 1, 2, 3, 4, 5, 6] as const;
  const needsTime = draft.kind === 'daily' || draft.kind === 'weekdays' || draft.kind === 'weekly' || draft.kind === 'monthly';
  const err = (k: typeof problemKey) => (problemKey === k && dirty ? t(k === 'name' ? 'e.badName' : k === 'command' ? 'e.badCmd' : k === 'curl' ? 'e.curlFields' : 'e.needWhen') : undefined);
  const onTime = (v: string) => {
    setTimeText(v);
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(normalizeTime(v));
    if (m) set({ hour: Number(m[1]), minute: Number(m[2]) });
  };
  const timeBad = needsTime && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(normalizeTime(timeText));
  const canSave = problemKey === null && !timeBad && shown?.kind !== 'error';
  // A new schedule opens with the command empty and Create off; the field's own error waits for a first edit, so until
  // then the footer says what Create waits for.
  const need = isNew && !dirty && problemKey === 'command' ? t('e.badCmd') : undefined;

  const picker = (
    <div className={s.choices}>
      <p className={s.lead}>{t('new.pick')}</p>
      {/* Each way to start is a kit PickCard; one that opens another place says where (its end words, the external mark). */}
      <PickCard ref={cmdChoice} title={t('new.cmd')} line={t('new.cmdBody')} onPress={() => enter('form')} />
      {onPrograms && <PickCard title={t('new.web')} line={t('new.webBody')} end={t('new.webGo')} endIcon="external" onPress={onPrograms} />}
      {onScripts && <PickCard title={t('new.script')} line={t('new.scriptBody')} end={t('new.scriptGo')} endIcon="external" onPress={onScripts} />}
      {asks ? (
        <PickCard ref={agentChoice} title={t('new.agent')} line={t('new.agentBody', { example: sa('prompt') + sa('ex.backups') })} onPress={() => enter('agent')} />
      ) : (
        onChat && <PickCard title={t('new.agent')} line={t('new.agentBody', { example: sa('prompt') + sa('ex.backups') })} end={t('new.agentGoBots')} endIcon="external" onPress={onChat} />
      )}
    </div>
  );

  // Send: one start at a time; 'sent' closes the drawer (the panel shows the conversation beside the list); 'notSent' keeps the
  // words; 'unknown' may have reached the agent (C9): the kit's pending line locks the footer, and its Check again opens the panel
  // on that conversation, never a second start. The drawer is never held while the start waits for the Agent panel (it may wait
  // minutes on a computer starting): Send says "Sending…", Back is gone, and closing is the person's (the page then tells a
  // start that did not leave). Back is gone while it may have reached the agent too, so the drawer stays on its line, and the
  // words it may have sent stay as sent (read-only, still copyable): closing then drops nothing the person typed after it.
  const send = () => {
    if (!onAskSend || empty || sent === 'sending' || sent === 'unknown') return;
    setSent('sending');
    onAskSend(words, (o) => {
      if (!live.current) return false;
      setSent(o);
      if (o === 'sent') onClose();
      return true;
    });
  };
  const agent = (
    <Form onSubmit={send} busy={sent === 'sending'}>
      <Stack gap={4}>
        <TextField
          label={t('new.agentWhat')}
          description={t('new.agentKinds')}
          value={words}
          onChange={(v) => { setWords(v); if (sent === 'notSent') setSent(null); }}
          multiline
          rows={4}
          isDisabled={sent === 'sending'}
          isReadOnly={sent === 'unknown'}
          inputRef={box}
        />
        {/* Home's Ask idea plates: a sentence that wraps inside its plate, so a long example never runs off a phone. */}
        <Row wrap gap={2}>
          {ASK_EXAMPLES.map((id) => (
            <Button key={id} variant="bubble" literal isDisabled={sent === 'sending' || sent === 'unknown'} onPress={() => setWords((w) => withAsk(w, sa('prompt'), sa(`ex.${id}`)))}>{sa(`ex.${id}`)}</Button>
          ))}
        </Row>
        {sent !== 'unknown' && <TextButton isDisabled={sent === 'sending'} onPress={() => onAskPanel?.(empty ? sa('prompt') : words)}>{t('new.agentPanel')}</TextButton>}
      </Stack>
    </Form>
  );

  const form = (
    <Form onSubmit={() => canSave && expr && onSave(draft, expr, row)} busy={busy} {...(outcome ? { outcome } : {})} {...(onCheck ? { onCheck } : {})}>
      <Stack gap={4}>
        {(stuck || earlier) && onForget && (
          <Band tone="warn" size="table" actions={<TextButton onPress={() => setAllowAsk({ held: shownHeld })}>{t('ed.stuck.go')}</TextButton>}>
            {t(earlier ? (!row ? 'ed.earlierNew' : kit === 'curl' ? 'ed.earlierCurl' : 'ed.earlier') : 'ed.stuck')}
          </Band>
        )}
        <TextField label={t('e.name')} value={draft.name} onChange={(v) => set({ name: v })} placeholder={t('ed.name.ph')} maxLength={MAX_NAME + 1} errorMessage={err('name')} isDisabled={kit === 'curl'} inputRef={nameBox} />
        {kit === 'cron' && (
          <TextField
            label={t('e.cmd')}
            description={row ? t('e.cmdKeep') : t('e.cmdHelp')}
            value={draft.command}
            onChange={(v) => set({ command: v })}
            placeholder={row ? t('e.keepCmd') : t('ed.cmd.ph')}
            mono
            maxLength={MAX_COMMAND + 1}
            errorMessage={err('command')}
          />
        )}
        {kit === 'cron' && !row && (
          <SegmentedControl
            label={t('e.user')}
            value={draft.runAs}
            onChange={(v) => set({ runAs: v as Draft['runAs'] })}
            isDisabled={locked}
            info={t('e.userTip')}
            description={draft.runAs === 'root' ? t('e.userRootHelp') : t('e.userMainHelp')}
            items={[
              { id: 'user', label: t('e.userMain') },
              { id: 'root', label: t('ed.runAsRoot') },
            ]}
          />
        )}
        <div className={s.when}>
          {/* Eight kinds of schedule: one Select, never a stack of radios. */}
          <Select label={t('ed.when')} options={kindOptions} value={draft.kind} onChange={(k) => set({ kind: k })} errorMessage={err('when')} />
          <div className={s.whenRow}>
            {draft.kind === 'every' && (
              <Select
                label={t('e.everyN')}
                options={EVERY.map((n) => ({ value: String(n), label: t('dur.min', { count: n }) }))}
                value={String(draft.every)}
                onChange={(v) => set({ every: Number(v) })}
              />
            )}
            {draft.kind === 'hourly' && <NumberField label={t('e.minute')} minValue={0} maxValue={59} value={draft.minute} onChange={(v) => set({ minute: Number.isFinite(v) ? v : 0 })} />}
            {needsTime && <TimeField label={t('ed.time')} value={timeText} onChange={onTime} errorMessage={timeBad ? t('ed.timeErr') : undefined} />}
            {draft.kind === 'monthly' && <NumberField label={t('e.dom')} minValue={1} maxValue={31} value={draft.dom} onChange={(v) => set({ dom: Number.isFinite(v) ? v : 1 })} />}
          </div>
          {draft.kind === 'weekly' && (
            <Row gap={3} wrap>
              {days.map((d) => (
                <Checkbox
                  key={d}
                  label={t(`ed.dowShort.${d}`)}
                  isSelected={draft.days.includes(d)}
                  onChange={(on) => set({ days: on ? [...draft.days, d].sort() : draft.days.filter((x) => x !== d) })}
                />
              ))}
            </Row>
          )}
          {draft.kind === 'custom' && (
            <TextField
              label={t('e.expr')}
              description={kit === 'curl' ? t('e.exprCurl') : t('e.exprCron')}
              placeholder={kit === 'curl' ? t('e.exprPhCurl') : t('e.exprPh')}
              value={draft.custom}
              onChange={(v) => set({ custom: v })}
              mono
              errorMessage={exprError ?? err('curl')}
            />
          )}
        </div>
        {/* What the schedule means and when it runs next, re-read as the fields change and announced politely. */}
        <div aria-live="polite">
          {shown?.kind === 'error' ? (
            <Band tone="danger" size="table" /* noDetails: the typed schedule is judged invalid (a field hint); there is no rejection */>{shown.text}</Band>
          ) : (
            <Verdict
              label={t('pv.runs')}
              {...(shown?.kind === 'runs' && !shown.never ? { next: kit === 'curl' ? t('e.zoneUtc') : t('pv.zoneComputer'), slot: <ItemList label={t('pv.runs')} items={shown.runs.map((at) => ({ id: String(at), title: runLine(t, at, now, zone) }))} /> } : {})}
            >
              {shown?.kind === 'runs' ? (shown.never ? t('pv.never') : (meaning ?? t('pv.runsLead'))) : shown?.kind === 'text' ? shown.text : t('ed.previewWait')}
            </Verdict>
          )}
        </div>
      </Stack>
    </Form>
  );

  return (
    <Drawer resizeKey="schedules-editor"
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={step === 'pick' ? t('new.title') : step === 'agent' ? t('new.agentTitle') : title}
      {...(step === 'form' ? { subtitle: kit === 'curl' ? t('ed.sub.curl') : t('ed.sub.cron') } : {})}
      size="md"
      // Closing asks while it would drop words: the form's, or the agent step's kept across Back (not ones on their way).
      dirty={formWork || (!empty && sent !== 'sending')}
      busy={step === 'agent' ? false : busy}
      {...((step === 'form' && !row) || (step === 'agent' && sent !== 'sending' && sent !== 'unknown') ? { onBack: back, backLabel: t('new.back') } : {})}
      {...(step === 'form'
        ? {
            footer: (
              <FormFooter
                dirty={dirty}
                requireDirty={!!row}
                submitDisabled={!canSave}
                {...(need ? { reason: need } : {})}
                busy={busy}
                {...(outcome ? { outcome } : {})}
                {...(onCheck ? { onCheck } : {})}
                checking={checking}
                submitLabel={row ? t('ed.save') : t('ed.create')}
                onSubmit={() => canSave && expr && onSave(draft, expr, row)}
              />
            ),
          }
        : step === 'agent'
          ? {
              footer: (
                <FormFooter
                  dirty={!empty && sent !== 'sending'}
                  requireDirty={false}
                  submitDisabled={empty || sent === 'sending'}
                  {...(agentOutcome ? { outcome: agentOutcome } : {})}
                  // The panel holds the conversation and says how it went: its Check again goes there, and closing the drawer
                  // leaves no toast (the panel keeps the unknown, C9).
                  // noDetails: a start's outcome carries no rejection (sent, notSent or unknown, kit startAgentConversation).
                  onCheck={() => onAskPanel?.('')}
                  toastOnLeave={false}
                  submitLabel={sent === 'sending' ? t('new.agentSending') : t('new.agentSend')}
                  onSubmit={send}
                />
              ),
            }
          : {})}
    >
      {step === 'pick' ? picker : step === 'agent' ? agent : form}
      <ConfirmDialog overlayId="schedules-allow-again"
        isOpen={allowAsk !== null && !!onForget && showsBand && allowAsk.held === shownHeld}
        onOpenChange={(o) => !o && setAllowAsk(null)}
        title={t('ed.stuck.go')}
        body={t('ed.stuck.body')}
        confirmLabel={t('ed.stuck.go')}
        tone="danger"
        onConfirm={() => {
          const a = allowAsk;
          setAllowAsk(null);
          if (a) onForget?.(a.held);
        }}
      />
      <ConfirmDialog overlayId="schedules-leave-step"
        isOpen={leaving !== null}
        onOpenChange={(o) => !o && setLeaving(null)}
        title={t(leaving === 'agent' ? 'new.leaveCmd' : 'new.leaveAgent')}
        body={t(leaving === 'agent' ? 'new.leaveCmdBody' : 'new.leaveAgentBody')}
        confirmLabel={t(leaving === 'agent' ? 'new.leaveCmdGo' : 'new.leaveAgentGo')}
        tone="danger"
        onConfirm={leave}
      />
    </Drawer>
  );
}
