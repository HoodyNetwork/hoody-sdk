// Vitest: SecretInput `focusOnError` (TextField's rule): focus moves into the field when `errorMessage` appears, not
// while it stays and not without the option; a multiline field's textarea takes it the same way.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { boot } from '@core/test/env';
import { Form as KitForm, FormFooter } from './Form';
import { SecretInput, type SecretInputProps } from './Secret';

beforeEach(() => {
  boot();
});

const field = () => document.querySelector('[data-secret-input]') as HTMLElement;
const other = () => screen.getByRole('button', { name: 'Elsewhere' });
const Form = (p: Partial<SecretInputProps>) => (
  <>
    <button type="button">Elsewhere</button>
    <SecretInput label="Password" value="hunter2" onChange={() => undefined} {...p} />
  </>
);

describe('SecretInput focusOnError', () => {
  it('focus moves into the field when the error appears', () => {
    const { rerender } = render(<Form focusOnError />);
    other().focus();
    rerender(<Form focusOnError errorMessage="Wrong password." />);
    expect(document.activeElement).toBe(field());
    expect(field().tagName).toBe('INPUT');
  });

  it('not again while the error stays; again once it has gone and come back', () => {
    const { rerender } = render(<Form focusOnError errorMessage="Wrong password." />);
    expect(document.activeElement).toBe(field());
    other().focus();
    rerender(<Form focusOnError errorMessage="Wrong password." value="hunter3" />);
    rerender(<Form focusOnError errorMessage="Still wrong." />);
    expect(document.activeElement).toBe(other());
    rerender(<Form focusOnError />);
    expect(document.activeElement).toBe(other());
    rerender(<Form focusOnError errorMessage="Wrong password." />);
    expect(document.activeElement).toBe(field());
  });

  it('without the option an error moves no focus', () => {
    const { rerender } = render(<Form />);
    other().focus();
    rerender(<Form errorMessage="Wrong password." />);
    expect(document.activeElement).toBe(other());
  });

  it('multiline: the textarea takes it', () => {
    const { rerender } = render(<Form multiline focusOnError />);
    other().focus();
    rerender(<Form multiline focusOnError errorMessage="Not a key." />);
    expect(field().tagName).toBe('TEXTAREA');
    expect(document.activeElement).toBe(field());
  });

  // A send: the footer's busy locks the field (and the browser drops its focus); the refusal arrives in the same
  // render that ends busy, while the lock the footer reports still holds for one more effect. Focus waits for it.
  it('an error that arrives as a send ends: focus lands once the field unlocks', () => {
    const Sent = ({ busy, error }: { busy: boolean; error?: string }) => (
      <KitForm onSubmit={() => undefined}>
        <button type="button">Elsewhere</button>
        <SecretInput label="API key" value="" onChange={() => undefined} focusOnError {...(error ? { errorMessage: error } : {})} />
        <FormFooter dirty={false} busy={busy} submitLabel="Save" />
      </KitForm>
    );
    const { rerender } = render(<Sent busy={false} />);
    rerender(<Sent busy />);
    rerender(<Sent busy={false} error="Not accepted." />);
    expect(document.activeElement).toBe(field());
    // Refocused, still empty and masked: nothing of the refused key comes back.
    expect((field() as HTMLInputElement).value).toBe('');
  });

  it('no steal: the person moved focus elsewhere while the field was locked; it stays there', () => {
    const Sent = ({ busy, error }: { busy: boolean; error?: string }) => (
      <KitForm onSubmit={() => undefined}>
        <button type="button">Elsewhere</button>
        <SecretInput label="API key" value="" onChange={() => undefined} focusOnError {...(error ? { errorMessage: error } : {})} />
        <FormFooter dirty={false} busy={busy} submitLabel="Save" />
      </KitForm>
    );
    const { rerender } = render(<Sent busy={false} />);
    rerender(<Sent busy />);
    other().focus();
    rerender(<Sent busy={false} error="Not accepted." />);
    expect(document.activeElement).toBe(other());
  });
});
