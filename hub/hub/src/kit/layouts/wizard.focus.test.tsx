// Focus moves only on a real step transition, to the step's
// [data-wizard-focus], else its first field, else its heading, with preventScroll. Never on the first mount, a
// re-render, typing, a check's answer or a note appearing (footNote is presentational).
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Select } from '../forms/more';
import { WizardPage } from './Layouts';

const steps = [
  { id: 'a', label: 'One' },
  { id: 'b', label: 'Two' },
  { id: 'c', label: 'Three' },
];

function Body({ step, check }: { step: number; check?: string }) {
  if (step === 0) return <input aria-label="Description" defaultValue="" />;
  if (step === 1)
    return (
      <>
        <input aria-label="Address" />
        <button type="button" data-wizard-focus="">
          Change the computer
        </button>
        {check && <p>{check}</p>}
      </>
    );
  return <h2>Check it</h2>;
}

function Page({ current, check, note }: { current: number; check?: string; note?: string }) {
  return (
    <WizardPage header={{ title: 'New script' }} steps={steps} current={current} footNote={note ? <h3>{note}</h3> : undefined}>
      <Body step={current} check={check} />
    </WizardPage>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('wizard_focus_moves_on_transition_only', () => {
  it('the first mount moves no focus', () => {
    render(<Page current={0} />);
    expect(document.activeElement).toBe(document.body);
  });
  it('a transition focuses [data-wizard-focus] first, with preventScroll', () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'focus');
    const { rerender } = render(<Page current={0} />);
    act(() => rerender(<Page current={1} />));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Change the computer' }));
    expect(spy).toHaveBeenCalledWith({ preventScroll: true });
  });
  it('else the first field', () => {
    const { rerender } = render(<Page current={2} />);
    act(() => rerender(<Page current={0} />));
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Description' }));
  });
  it("a kit Select step focuses the Select's visible trigger, never its hidden native select", () => {
    const Sel = ({ current }: { current: number }) => (
      <WizardPage header={{ title: 'New realm' }} steps={steps} current={current}>
        {current === 1 ? (
          <Select label="Region" value="sg" onChange={() => undefined} options={[{ value: 'sg', label: 'Singapore' }, { value: 'de', label: 'Germany' }]} />
        ) : (
          <h2>Other</h2>
        )}
      </WizardPage>
    );
    const { rerender } = render(<Sel current={0} />);
    act(() => rerender(<Sel current={1} />));
    const el = document.activeElement as HTMLElement;
    expect(el.tagName).not.toBe('SELECT');
    expect(el.closest('[aria-hidden="true"]')).toBeNull();
    expect(el.getAttribute('aria-haspopup')).toBe('listbox');
  });
  it('a field inside an aria-hidden, inert or hidden box is skipped for the next reachable one', () => {
    const Hid = ({ current }: { current: number }) => (
      <WizardPage header={{ title: 'New script' }} steps={steps} current={current}>
        {current === 1 ? (
          <>
            <div aria-hidden="true"><input aria-label="Ghost one" /></div>
            <div inert><input aria-label="Ghost two" /></div>
            <div hidden><input aria-label="Ghost three" /></div>
            <input aria-label="Real" />
          </>
        ) : (
          <h2>Other</h2>
        )}
      </WizardPage>
    );
    const { rerender } = render(<Hid current={0} />);
    act(() => rerender(<Hid current={1} />));
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Real');
  });
  it('else the step heading, made focusable', () => {
    const { rerender } = render(<Page current={0} />);
    act(() => rerender(<Page current={2} />));
    const h = screen.getByRole('heading', { name: 'Check it' });
    expect(document.activeElement).toBe(h);
    expect(h.getAttribute('tabindex')).toBe('-1');
  });
  it('typing, a check answer and a note appearing never move focus', () => {
    const { rerender } = render(<Page current={0} />);
    act(() => rerender(<Page current={1} />));
    const address = screen.getByRole('textbox', { name: 'Address' });
    act(() => address.focus());
    act(() => rerender(<Page current={1} check="weather.ts already uses this address" />));
    expect(document.activeElement).toBe(address);
    act(() => rerender(<Page current={1} check="free" note="Not sure it was sent" />));
    expect(document.activeElement).toBe(address);
  });
});
