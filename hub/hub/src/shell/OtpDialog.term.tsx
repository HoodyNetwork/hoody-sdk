// The two-step code prompt in a terminal (the web's OtpDialog: core's useOtpPrompt over the kit's ConfirmDialog). Same
// rules: every new prompt and every close starts from an empty field (and a wipe clears it), the field has the focus
// whenever a code is asked for, Confirm (or Enter in the field) sends exactly six digits, the wrong-code and checking
// lines come from the prompt's state, Cancel / Esc cancels the prompt. The field is the kit OtpField (the web's).
import { useEffect, useRef, useState } from 'react';
import type * as Web from './OtpDialog';
import { ConfirmDialog } from '@kit/overlays/Dialog';
import { OtpField } from '@kit/forms/OtpField';
import { useWipeOn } from '@kit/forms/wipe';
import { useStrings } from '@kit/strings';
import { useOtpPrompt } from '@core/shell';
import strings from './strings.en.json';
import { useKeys } from '../term/prim';

// The code is the kit OtpField, as on the web: one secret implementation (its digits never reach the semantics tree,
// a credential), digits only, wiped on resetKey. Enter in the dialog answers (the web's keydown on the wrapper).
function EnterSubmits({ submit }: { submit: () => void }): null {
  const live = useRef(submit);
  live.current = submit;
  useKeys((k) => {
    if (k.name !== 'return' && k.name !== 'linefeed') return false;
    live.current();
    return true;
  });
  return null;
}

export const OtpDialog: typeof Web.OtpDialog = () => {
  const t = useStrings(strings);
  const prompt = useOtpPrompt();
  const [code, setCode] = useState('');
  const field = useRef<HTMLInputElement | null>(null);
  const asking = prompt.open && !prompt.checking;
  useEffect(() => { setCode(''); }, [prompt.id, prompt.open]);
  useWipeOn(() => setCode(''), prompt.id);
  // The code field takes the focus whenever a code is asked for (after the dialog's own first focus, as the web's rAF).
  useEffect(() => {
    if (!asking) return;
    const id = setTimeout(() => field.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [asking, prompt.id]);
  const submit = () => {
    const c = code;
    if (!asking || c.length !== 6) return;
    setCode('');
    prompt.submit(c);
  };
  const cancel = () => {
    setCode('');
    prompt.cancel();
  };
  return (
    <ConfirmDialog
      isOpen={prompt.open}
      onOpenChange={(open) => !open && cancel()}
      title={t('otp.title')}
      body={t('otp.body')}
      confirmLabel={t('otp.confirm')}
      confirmDisabled={!asking || code.length !== 6}
      onConfirm={submit}
    >
      <EnterSubmits submit={submit} />
      <OtpField
        label={t('otp.label')}
        value={code}
        onChange={setCode}
        resetKey={prompt.id}
        isDisabled={!asking}
        autoFocus
        inputRef={field}
        errorMessage={prompt.retry && asking ? t('otp.wrong') : undefined}
        description={prompt.checking ? t('otp.checking') : t('otp.help')}
      />
    </ConfirmDialog>
  );
};
