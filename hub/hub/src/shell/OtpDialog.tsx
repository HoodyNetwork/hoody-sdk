// The 2FA step-up dialog (core otp.ts). Core's api() asks for a code when a change
// answers OTP_REQUIRED; this host draws that ask: a 480 dialog with one code field, Cancel and
// Confirm. Enter confirms; Escape, the scrim and Cancel answer "no code", which rejects the change
// cleanly ({cancelled}). After Confirm the prompt stays open with `checking` until the change
// settles; a refused code asks again with `retry`, and the dialog says the code didn't work.
// Cancel while checking only closes the dialog (the change already went out and settles on its own).
// Security tier: the code lives only in this component's state, is never logged or stored, and is
// cleared on submit, on every close, on every new prompt, and when the context ends while the dialog
// is open (sign-out, account or realm switch, route change, page hide: the kit's useWipeOn).
import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '@kit/overlays/Overlays';
import { OtpField } from '@kit/forms/OtpField';
import { useWipeOn } from '@kit/forms/wipe';
import { useStrings } from '@kit/strings';
import { useOtpPrompt } from '@core/shell';
import strings from './strings.en.json';
import s from './OtpDialog.module.css';

export function OtpDialog() {
  const t = useStrings(strings);
  const prompt = useOtpPrompt();
  const [code, setCode] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const asking = prompt.open && !prompt.checking;

  // Every new prompt (and every close) starts from an empty field.
  useEffect(() => {
    setCode('');
  }, [prompt.id, prompt.open]);

  useWipeOn(() => setCode(''), prompt.id);

  // The code field takes focus whenever a code is asked for (the dialog would otherwise focus itself).
  useEffect(() => {
    if (!asking) return;
    const id = window.requestAnimationFrame(() => box.current?.querySelector('input')?.focus());
    return () => window.cancelAnimationFrame(id);
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
      {/* Enter confirms (no <form>: a native submit would navigate the page). */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- the key comes from the code input inside */}
      <div ref={box} className={s.form} data-hub-otp onKeyDown={(e) => e.key === 'Enter' && submit()}>
        <OtpField
          label={t('otp.label')}
          value={code}
          onChange={setCode}
          resetKey={prompt.id}
          isDisabled={!asking}
          errorMessage={prompt.retry && asking ? t('otp.wrong') : undefined}
          description={prompt.checking ? t('otp.checking') : t('otp.help')}
        />
      </div>
    </ConfirmDialog>
  );
}
