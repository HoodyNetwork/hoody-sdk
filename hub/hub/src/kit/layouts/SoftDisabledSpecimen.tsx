// Gallery specimen: a disabled control that says why, as a form's submit button, a link and a popover trigger.
// kit/controls/softDisabled.spec.ts drives it; the gallery's controls tab mounts it.
import { useState, type ReactNode } from 'react';
import { Popover } from '../overlays/Popover';
import { Button, IconButton, LinkButton } from '../controls/Button';
import { TextButton } from '../controls/Link';
import s from './SoftDisabledSpecimen.module.css';

export interface SoftDisabledLabels {
  reason: string;
  button: string;
  input: string;
  popover: string;
}

/** One form with one input and one submit button, which counts what it is sent. kit/controls/softDisabled.spec.ts reads the count. */
function CountedForm({ name, label, children }: { name: string; label: string; children: ReactNode }) {
  const [sent, setSent] = useState(0);
  return (
    <form
      className={s.row}
      data-soft-form={name}
      data-sent={sent}
      onSubmit={(e) => {
        e.preventDefault();
        setSent((n) => n + 1);
      }}
    >
      <input aria-label={label} className={s.input} />
      {children}
    </form>
  );
}

/**
 * A disabled control that says why, in the places it must still do nothing: as a form's submit button (Enter in the form's
 * input is the browser's own path, and only a browser has it), as a link and as a popover's trigger. A measuring specimen,
 * kit-internal on purpose: it writes forms and rows by hand because those are what it tests.
 */
export function SoftDisabledSpecimen({ labels }: { labels: SoftDisabledLabels }) {
  const { reason, button, input, popover } = labels;
  return (
    <div className={s.stack}>
      <CountedForm name="enabled" label={input}>
        <Button type="submit" literal>{button}</Button>
      </CountedForm>
      <CountedForm name="button" label={input}>
        <Button type="submit" literal isDisabled disabledReason={reason}>{button}</Button>
      </CountedForm>
      <CountedForm name="icon" label={input}>
        <IconButton type="submit" icon="plus" label={button} isDisabled disabledReason={reason} />
      </CountedForm>
      <CountedForm name="text" label={input}>
        <TextButton type="submit" literal isDisabled disabledReason={reason}>{button}</TextButton>
      </CountedForm>
      <div className={s.row}>
        <Button literal isDisabled disabledReason={reason} data-soft-tip="">{button}</Button>
        <LinkButton literal href="#/account" isDisabled disabledReason={reason} data-soft-link="">{button}</LinkButton>
        <Popover label={popover} trigger={<Button literal isDisabled disabledReason={reason} data-soft-trigger="">{button}</Button>}>
          <p data-soft-popover="">{popover}</p>
        </Popover>
      </div>
      {/* The same link and trigger enabled: softDisabled.spec.ts proves the path works here before it proves the soft ones do nothing. */}
      <div className={s.row}>
        <LinkButton literal href="#/account" data-soft-link-on="">{button}</LinkButton>
        <Popover label={popover} trigger={<Button literal data-soft-trigger-on="">{button}</Button>}>
          <p data-soft-popover-on="">{popover}</p>
        </Popover>
      </div>
    </div>
  );
}
