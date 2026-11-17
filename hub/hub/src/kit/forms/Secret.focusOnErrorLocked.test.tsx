// Vitest: SecretInput `focusOnError` when the error appears while the field is still disabled (a Form's lock lifts one
// commit after its footer's busy; AI's connect key step): the focus is owed and taken once the field is enabled, and
// only once. Before, the focus() on the disabled input was lost and the person had to find the field again.
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

describe('SecretInput focusOnError while locked', () => {
  it('an error that appears on a disabled field moves the focus in once the field is enabled', () => {
    // The person was in the field; the lock (a send) dropped its focus; the refusal arrives while still locked.
    const { rerender } = render(<Form focusOnError />);
    field().focus();
    rerender(<Form focusOnError isDisabled />);
    (document.activeElement as HTMLElement | null)?.blur();
    rerender(<Form focusOnError isDisabled errorMessage="Not accepted." />);
    rerender(<Form focusOnError errorMessage="Not accepted." />);
    expect(document.activeElement).toBe(field());
  });

  it('no steal: focus the person moved elsewhere during the lock stays there', () => {
    const { rerender } = render(<Form focusOnError isDisabled />);
    other().focus();
    rerender(<Form focusOnError isDisabled errorMessage="Not accepted." />);
    rerender(<Form focusOnError errorMessage="Not accepted." />);
    expect(document.activeElement).toBe(other());
  });

  it('owed only once: moving away and a later re-render with the same error leave the focus alone', () => {
    const { rerender } = render(<Form focusOnError isDisabled errorMessage="Not accepted." />);
    rerender(<Form focusOnError errorMessage="Not accepted." />);
    expect(document.activeElement).toBe(field());
    other().focus();
    rerender(<Form focusOnError isDisabled errorMessage="Not accepted." />);
    rerender(<Form focusOnError errorMessage="Not accepted." />);
    expect(document.activeElement).toBe(other());
  });

  it('an error gone before the field is enabled owes nothing', () => {
    const { rerender } = render(<Form focusOnError isDisabled />);
    other().focus();
    rerender(<Form focusOnError isDisabled errorMessage="Not accepted." />);
    rerender(<Form focusOnError isDisabled />);
    rerender(<Form focusOnError />);
    expect(document.activeElement).toBe(other());
  });
});
