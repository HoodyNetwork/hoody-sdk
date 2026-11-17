// Vitest: SecretInput focusOnError while the field is disabled: the owed focus is never stolen back. A person who moved
// the focus elsewhere during the lock keeps it; with the focus left where it was (on the body), the field takes it.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { boot } from '@core/test/env';
import { SecretInput, type SecretInputProps } from './Secret';

beforeEach(() => {
  boot();
});

const field = () => document.querySelector('[data-secret-input]') as HTMLElement;
const other = () => screen.getByRole('button', { name: 'Elsewhere' });
const Form = (p: Partial<SecretInputProps>) => (
  <>
    <button type="button">Elsewhere</button>
    <SecretInput label="API key" value="" onChange={() => undefined} {...p} />
  </>
);

describe('SecretInput focusOnError: no steal', () => {
  it('focus moved elsewhere during the lock stays there on unlock', () => {
    const { rerender } = render(<Form focusOnError isDisabled />);
    (document.activeElement as HTMLElement | null)?.blur();
    rerender(<Form focusOnError isDisabled errorMessage="Not accepted." />);
    other().focus();
    rerender(<Form focusOnError errorMessage="Not accepted." />);
    expect(document.activeElement).toBe(other());
  });

  it('control: focus left on nothing during the lock goes into the field on unlock', () => {
    const { rerender } = render(<Form focusOnError isDisabled />);
    (document.activeElement as HTMLElement | null)?.blur();
    rerender(<Form focusOnError isDisabled errorMessage="Not accepted." />);
    rerender(<Form focusOnError errorMessage="Not accepted." />);
    expect(document.activeElement).toBe(field());
  });
});
