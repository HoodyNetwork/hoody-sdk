// A custom code in the terminal: the same check, create and refusal rules as CodeForm.tsx (the check runs 400 ms after
// typing stops, on the code as the server stores it, from 4 characters, and only the latest answer shows). The field's
// own label is the row's label ("a label element pointed at the field" has no meaning in cells), then Create and the
// code shape tip on a row under it.
import { Button, ErrorDetails, InfoTip, TextField, useErrorInfo } from '@kit';
import { Box, Text } from '@term/prim';
import { useEffect, useRef, useState } from 'react';
import { useCheck } from '../data';
import { changeNote, checkRefusalWords, checkWords, createVars, normCode, type CheckWords } from '../logic';
import type * as Web from './CodeForm';

const CHECK_MS = 400;
const ERROR_WORDS: ReadonlySet<CheckWords['k']> = new Set(['check.taken', 'check.invalid', 'check.reserved', 'check.failed']);
// A create refused for a reason about the code itself: said again under the field, where the person corrects it (the page
// note sits above the whole card, rows away from the field in a terminal).
const FIELD_REFUSALS: ReadonlySet<string> = new Set(['check.taken', 'check.invalid', 'check.reserved']);

function useSettled(value: string): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), CHECK_MS);
    return () => clearTimeout(id);
  }, [value]);
  return v;
}

export const CodeForm: typeof Web.CodeForm = ({ t, create, onNote, onGone }) => {
  const [field, setField] = useState('');
  const [gone, setGone] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [refusedK, setRefusedK] = useState<CheckWords['k'] | null>(null);
  // As on the web: a code made empties the field and turns Create off under the focus, which a terminal then drops to
  // nowhere (term/prim/focus.ts); the focus goes back to the field.
  const input = useRef<HTMLInputElement>(null);
  const code = normCode(field);
  const asked = useSettled(code.length >= 4 ? code : '');
  const check = useCheck(asked);
  const info = useErrorInfo(check.isError ? check.error : null);
  const live = asked !== '' && asked === code && refused !== code;
  const words: CheckWords | null = !live ? null : check.isError ? (info ? checkRefusalWords(info) : null) : check.data !== undefined ? checkWords(check.data) : null;
  const reread = words?.reread === true;
  useEffect(() => {
    if (reread) {
      setGone(true);
      onGone();
    }
  }, [reread, onGone]);
  if (gone) return <Text colour="muted">{t('codes.unavailable')}</Text>;
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
    if (r.outcome === 'failed') {
      setRefused(vars.code);
      setRefusedK(n?.kind === 'words' && FIELD_REFUSALS.has(n.k) ? (n.k as CheckWords['k']) : null);
    }
    onNote('create', r);
  };
  const said = words ? t(words.k) : undefined;
  const fieldRefusal = refusedK && refused === code ? t(refusedK) : undefined;
  return (
    <Box dir="column" shrink={0}>
      <TextField
        label={t('create.label')}
        inputRef={input}
        value={field}
        onChange={(v) => {
          setField(v);
          setRefused(null);
          setRefusedK(null);
        }}
        mono
        maxLength={64}
        autoComplete="off"
        spellCheck="false"
        reserveError
        errorMessage={fieldRefusal ?? (words && ERROR_WORDS.has(words.k) ? said : undefined)}
        description={fieldRefusal === undefined && words && !ERROR_WORDS.has(words.k) ? said : undefined}
      />
      <Box dir="row" gap={1} shrink={0}>
        <Button variant="secondary" busy={create.running} isDisabled={!code} onPress={() => void press()}>
          {t('create.action')}
        </Button>
        <InfoTip text={t('tip.codeShape')} subject={t('tip.codeShape.subject')} />
      </Box>
      {words?.k === 'check.failed' && <ErrorDetails error={info} mode="button" />}
    </Box>
  );
};
