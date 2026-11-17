// Vitest: SecretInput across a lock that ends with no field error (a send whose answer is said in the step, not on the
// field; AI's connect key step, "the endpoint changed since this step opened"). The browser takes the focus from a
// disabled input, so the field that held it when the lock began takes it back at the unlock, and only then: never from
// a control the person moved to meanwhile, never when the field did not hold it.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { boot } from '@core/test/env';
import { SecretInput, type SecretInputProps } from './Secret';

beforeEach(() => {
  boot();
});

const field = () => document.querySelector('[data-secret-input]') as HTMLElement;
const other = () => screen.getByRole('button', { name: 'Elsewhere' });
const group = () => screen.getByRole('group', { name: 'Step' });
const Form = (p: Partial<SecretInputProps>) => (
  <>
    <button type="button">Elsewhere</button>
    <div role="group" aria-label="Step" tabIndex={-1}>
      <SecretInput label="API key" value="" onChange={() => undefined} {...p} />
    </div>
  </>
);
// What the browser does when a focused input is disabled: the focus is on nothing (the body). jsdom keeps a disabled
// input as the active element and its blur() does nothing there, so the focus is moved to a control that then leaves.
const dropFocus = () => {
  const gone = document.body.appendChild(document.createElement('button'));
  gone.focus();
  gone.remove();
  expect(document.activeElement).toBe(document.body);
};

describe('SecretInput focus across a lock with no error', () => {
  it('the field that held the focus at the lock takes it back at the unlock', () => {
    const { rerender } = render(<Form />);
    field().focus();
    rerender(<Form isDisabled />);
    dropFocus();
    rerender(<Form />);
    expect(document.activeElement).toBe(field());
  });

  it('a focus put on a container of the field during the lock goes back into the field', () => {
    const { rerender } = render(<Form />);
    field().focus();
    rerender(<Form isDisabled />);
    group().focus();
    rerender(<Form />);
    expect(document.activeElement).toBe(field());
  });

  it('no steal: a control the person moved to during the lock keeps the focus', () => {
    const { rerender } = render(<Form />);
    field().focus();
    rerender(<Form isDisabled />);
    other().focus();
    rerender(<Form />);
    expect(document.activeElement).toBe(other());
  });

  it('a field that did not hold the focus at the lock takes nothing at the unlock', () => {
    const { rerender } = render(<Form />);
    other().focus();
    rerender(<Form isDisabled />);
    dropFocus();
    rerender(<Form />);
    expect(document.activeElement).not.toBe(field());
  });

  it('owed once: a later lock the field did not hold gives nothing back', () => {
    const { rerender } = render(<Form />);
    field().focus();
    rerender(<Form isDisabled />);
    dropFocus();
    rerender(<Form />);
    other().focus();
    rerender(<Form isDisabled />);
    dropFocus();
    rerender(<Form />);
    expect(document.activeElement).not.toBe(field());
  });
});
