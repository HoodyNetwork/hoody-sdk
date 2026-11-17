// A custom code: the check runs 400 ms after typing stops, on the code as the server stores it, once it has 4 or more
// characters, and only the latest answer shows; the API's answer decides the words (no local shape rule). Create needs
// no confirm (the press is the intent): its variables are computed once at the press, so the body, the lock and the
// proof read the same code. A refusal saying the account can't make codes now hides the form and reads `me` again. The
// code's shape rule is the InfoTip after Create (the visible explainer is one line). The label, the field and Create
// sit in the link rows' three columns (LinkCard), which is why Create is not the field's own action.
import { Button, ErrorDetails, InfoTip, TextField, useErrorInfo } from '@kit';
import { useEffect, useId, useRef, useState } from 'react';
import { useCheck, type Say, type Write } from '../data';
import { changeNote, checkRefusalWords, checkWords, createVars, normCode, type CheckWords } from '../logic';
import s from './parts.module.css';
import type { T } from './types';

const CHECK_MS = 400;
const ERROR_WORDS: ReadonlySet<CheckWords['k']> = new Set(['check.taken', 'check.invalid', 'check.reserved', 'check.failed']);

function useSettled(value: string): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), CHECK_MS);
    return () => clearTimeout(id);
  }, [value]);
  return v;
}

export function CodeForm({ t, create, onNote, onGone }: { t: T; create: Write<{ code: string }>; onNote: Say; onGone: () => void }) {
  const id = useId();
  const [field, setField] = useState('');
  const [gone, setGone] = useState(false);
  // A create refused for this code is a newer answer than the check's: the check's line steps aside until the field changes.
  const [refused, setRefused] = useState<string | null>(null);
  // A code made empties the field and turns Create off under the person's focus: the focus goes back to the field.
  const input = useRef<HTMLInputElement>(null);
  const code = normCode(field);
  const asked = useSettled(code.length >= 4 ? code : '');
  const check = useCheck(asked);
  const info = useErrorInfo(check.isError ? check.error : null);
  // Only the answer for the code in the field now: an older one never shows. A failed re-check wins over the answer
  // the query keeps from before (TanStack keeps `data` on an error), so "can't make codes now" is never hidden.
  const live = asked !== '' && asked === code && refused !== code;
  const words: CheckWords | null = !live ? null : check.isError ? (info ? checkRefusalWords(info) : null) : check.data !== undefined ? checkWords(check.data) : null;
  const reread = words?.reread === true;
  useEffect(() => {
    if (reread) {
      setGone(true);
      onGone();
    }
  }, [reread, onGone]);
  if (gone) return <p className={`${s.p} ${s.muted} ${s.small}`}>{t('codes.unavailable')}</p>;
  const press = async () => {
    const vars = createVars(field);
    if (!vars.code) return;
    onNote(null);
    const r = await create.run(vars);
    const n = changeNote('create', r);
    if (r.outcome === 'done') {
      setField('');
      input.current?.focus();
    }
    if (n?.kind === 'words' && n.reread) setGone(true);
    if (r.outcome === 'failed') setRefused(vars.code);
    onNote('create', r);
  };
  const said = words ? t(words.k) : undefined;
  return (
    <div className={s.form}>
      {/* The row's label sits in the code column: the create row shares the link rows' columns. */}
      <label className={s.formLabel} id={`${id}-l`} htmlFor={`${id}-f`}>
        {t('create.label')}
      </label>
      {/* The cell places the field in the link column; the field itself is the kit's, unstyled. */}
      <div className={s.formField}>
        <TextField
          id={`${id}-f`}
          aria-labelledby={`${id}-l`}
          inputRef={input}
          value={field}
          onChange={(v) => {
            setField(v);
            setRefused(null);
          }}
          mono
          maxLength={64}
          autoComplete="off"
          spellCheck="false"
          reserveError
          errorMessage={words && ERROR_WORDS.has(words.k) ? said : undefined}
          description={words && !ERROR_WORDS.has(words.k) ? said : undefined}
        />
      </div>
      <span className={s.formAct}>
        <Button variant="secondary" busy={create.running} isDisabled={!code} onPress={() => void press()}>
          {t('create.action')}
        </Button>
        <InfoTip text={t('tip.codeShape')} subject={t('tip.codeShape.subject')} />
      </span>
      {words?.k === 'check.failed' && <ErrorDetails error={info} mode="button" />}
    </div>
  );
}
