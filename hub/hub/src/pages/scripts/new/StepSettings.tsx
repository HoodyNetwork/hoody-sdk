// "Script settings" on the write-it-myself step (manual mode keeps the magic-comment controls). The fields
// are the computer's own list (parseSchema, read-only reuse of magic.ts, as the script's settings panel draws them), filled
// from exec's own reading of the code's header (magic-comments/parse). An edit goes into the code by exec's own serializer
// (magic-comments/print, answered as line edits the page applies and checks against print's verify), before Check: the
// code that is checked and written is the code that carries them. Secrets (the caller key is placed on its own) and the
// schedule (step 2 writes it) are not here. print and parse change nothing anywhere, so a lost answer changes nothing:
// the code here stays as it was and the person can try again.
import { Band, Disclosure, ErrorState, InlineActions, Select, SettingRow, Skeleton, Stack, SubSection, Switch, TextField, useStrings } from '@kit';
import { useEffect, useRef, useState } from 'react';
import { labelOf, categoryOf, settingsFields, commentsOf } from './StepSettings.pure';
export { settingsFields, printReplyOf, applyEdits, verifiedText, commentsOf, putInCode } from './StepSettings.pure';
export type { PrintEdit, PrintReply, PutNote, Put } from './StepSettings.pure';
import type { PutNote } from './StepSettings.pure';
import type { MutationResult } from '@core';
import { effectiveBool, helpOf, textOf, withEdit, type Draft, type Field, type Problem, type Raw, type Schema } from '../magic';
import strings from '../strings.en.json';
import f from './Flow.module.css';

/** The page's strings by key, for a field's help (helpOf). */
const table = strings as Record<string, string>;

/** The fields show only once exec's reading of the header is in (state 'read' below), so a category is ready when drawn. */
const READ = { kind: 'ready' } as const;

// ── the disclosure ──────────────────────────────────────────────────────────────────────

type Read = { state: 'reading' } | { state: 'read'; comments: Record<string, unknown>; of: string } | { state: 'unread'; error?: unknown };

export interface StepSettingsProps {
  schema: Schema | null;
  schemaState: 'pending' | 'error' | 'ready';
  schemaError?: unknown;
  onRetrySchema: () => void;
  code: string;
  draft: Draft;
  onDraft: (d: Draft) => void;
  parse: (text: string) => Promise<MutationResult<unknown> | null>;
  /** Put the draft into the code now (the flow's own put, which Continue runs too). */
  onPut: () => void;
  putting: boolean;
  problems: Record<string, Problem>;
  note: { note: PutNote; key: string | null } | null;
}

export function StepSettings(p: StepSettingsProps) {
  const t = useStrings(strings);
  const [open, setOpen] = useState(Object.keys(p.draft).length > 0);
  const [read, setRead] = useState<Read>({ state: 'reading' });
  const [again, setAgain] = useState(0);
  const seq = useRef(0);
  const { parse, code } = p;

  // exec's reading of the header, again whenever the code changes while the settings are open; a later answer wins.
  useEffect(() => {
    if (!open || p.schemaState !== 'ready' || !p.schema) return;
    const n = ++seq.current;
    const timer = setTimeout(() => {
      void parse(code).catch(() => null).then((r) => {
        if (n !== seq.current) return;
        const comments = r?.outcome === 'done' ? commentsOf(r.data) : null;
        setRead(comments ? { state: 'read', comments, of: code } : { state: 'unread', error: r?.error });
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [open, code, again, parse, p.schema, p.schemaState]);

  const dirty = Object.keys(p.draft).length > 0;
  const body = () => {
    if (p.schemaState === 'pending') return <Skeleton rows={3} />;
    if (p.schemaState === 'error') return <ErrorState size="sm" error={p.schemaError} onRetry={p.onRetrySchema} />;
    if (!p.schema) return <p className={f.note}>{t('magic.noSchemaBody')}</p>;
    if (read.state === 'unread') return <ErrorState size="sm" title={t('flow.settings.unread')} error={read.error} onRetry={() => setAgain((x) => x + 1)} />;
    // Fields stay hidden until the header is read: a blank field must never stand for "not set" when it is.
    if (read.state === 'reading') return <Skeleton rows={3} />;
    const stored = read.comments;
    const fields = settingsFields(p.schema);
    const cats = p.schema.categories.filter((c) => fields.some((x) => x.category === c));
    const edit = (x: Field, raw: Raw) => p.onDraft(withEdit(p.draft, x, stored, raw));
    const row = (x: Field) => {
      const label = labelOf(x.key);
      const raw = p.draft[x.key];
      const bad = p.problems[x.key];
      const err = bad ? t(`magic.problem.${bad}` as never) : p.note?.key === x.key ? t('flow.settings.refusedField') : undefined;
      const value = typeof raw === 'string' ? raw : raw === null ? '' : textOf(x, stored);
      let control;
      if (x.kind === 'bool') {
        const on = effectiveBool(x, stored, p.draft);
        control = <Switch aria-label={label} label={t(on ? 'magic.on' : 'magic.off')} isSelected={on} isDisabled={p.putting} onChange={(v) => edit(x, v)} />;
      } else if (x.kind === 'enum') {
        control = <Select aria-label={label} value={value} isDisabled={p.putting} options={[{ value: '', label: t('magic.default') }, ...x.enums.map((e) => ({ value: e, label: e }))]} onChange={(v) => edit(x, v === '' ? null : v)} />;
      } else {
        control = (
          <TextField
            aria-label={label}
            value={value}
            isDisabled={p.putting}
            errorMessage={err}
            mono={x.kind !== 'text' || x.key === 'cors'}
            placeholder={x.fallback === undefined || x.fallback === null ? undefined : String(x.fallback)}
            onChange={(v) => edit(x, v)}
          />
        );
      }
      return (
        <SettingRow key={x.key} label={label} help={helpOf(x, table) || undefined} wide={x.kind === 'text' || x.kind === 'list'}>
          {control}
        </SettingRow>
      );
    };
    return (
      <Stack gap={3}>
        {cats.map((c) => (
          <SubSection key={c} title={categoryOf(c)} state={READ}>
            <Stack gap={2}>{fields.filter((x) => x.category === c).map(row)}</Stack>
          </SubSection>
        ))}
        {p.note ? <Band tone="danger" size="table" /* noDetails: why the settings were not put into the code; print changes nothing anywhere */>{t(`flow.settings.${p.note.note}` as never)}</Band> : null}
        <InlineActions
          size="md"
          label={t('flow.settings.actions')}
          // One primary per screen: the wizard's foot holds Continue, so Put in the code is an ordinary action.
          actions={[
            { id: 'put', label: t('flow.settings.put'), busy: p.putting, disabledReason: !dirty ? t('flow.settings.unchanged') : undefined, onPress: p.onPut },
            { id: 'discard', label: t('magic.discard'), disabledReason: !dirty ? t('flow.settings.unchanged') : p.putting ? t('flow.settings.putting') : undefined, onPress: () => p.onDraft({}) },
          ]}
        />
      </Stack>
    );
  };

  return (
    <Disclosure
      title={t('flow.settings.title')}
      description={dirty ? t('flow.settings.pending') : t('flow.settings.body')}
      isExpanded={open}
      onExpandedChange={setOpen}
    >
      {open ? body() : null}
    </Disclosure>
  );
}
