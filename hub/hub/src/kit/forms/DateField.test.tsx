// DateField: one typed YYYY-MM-DD with the calendar button. The value is the text: '' while empty,
// the canonical day once real, the raw text while it is not (so a page's own check still sees it).
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { DateField } from './DateField';
import { Form } from './more';

function Host({ start = '', seen = [], minValue, maxValue, isDisabled, errorMessage }: { start?: string; seen?: string[]; minValue?: string; maxValue?: string; isDisabled?: boolean; errorMessage?: string }) {
  const [v, setV] = useState(start);
  return (
    <DateField
      label="Ends on"
      value={v}
      minValue={minValue}
      maxValue={maxValue}
      isDisabled={isDisabled}
      errorMessage={errorMessage}
      onChange={(x) => {
        seen.push(x);
        setV(x);
      }}
    />
  );
}

const input = () => screen.getByRole('textbox', { name: 'Ends on' });
const pickButton = () => screen.getByRole('button', { name: 'Pick a date' });
const calendar = () => screen.getByRole('dialog', { name: 'Calendar' });
const type = (text: string) => act(() => fireEvent.change(input(), { target: { value: text } }));
const day = (n: number) =>
  within(calendar())
    .getAllByRole('button', { name: new RegExp(`^(Today, )?\\w+, \\w+ ${n}, \\d{4}`) })
    .filter((b) => !b.hasAttribute('data-outside-month'))[0]!;

describe('DateField', () => {
  it('is a labelled text field showing the value, with a calendar button', () => {
    render(<Host start="2026-10-23" />);
    expect(input()).toHaveValue('2026-10-23');
    expect(pickButton()).toBeInTheDocument();
  });

  it('keeps only digits and dashes, at most ten characters, and reports each change as typed', () => {
    const seen: string[] = [];
    render(<Host seen={seen} />);
    type('2026-1a0-2399');
    expect(input()).toHaveValue('2026-10-23');
    expect(seen.at(-1)).toBe('2026-10-23');
  });

  it('blur completes a short or compact date to the canonical form', () => {
    const seen: string[] = [];
    render(<Host seen={seen} />);
    type('2026-3-5');
    fireEvent.blur(input());
    expect(input()).toHaveValue('2026-03-05');
    expect(seen.at(-1)).toBe('2026-03-05');
    type('20261231');
    fireEvent.blur(input());
    expect(input()).toHaveValue('2026-12-31');
  });

  it('text that is not a real day stays as typed (the page sees it) and the field says so once left', () => {
    const seen: string[] = [];
    render(<Host seen={seen} />);
    act(() => input().focus());
    type('2026-02-31');
    expect(screen.queryByText(/Use a date such as/)).toBeNull();
    fireEvent.blur(input());
    expect(input()).toHaveValue('2026-02-31');
    expect(seen.at(-1)).toBe('2026-02-31');
    expect(screen.getByText(/Use a date such as/)).toBeInTheDocument();
  });

  it('a page refusal about the format waits while the text is being typed, then shows', () => {
    render(<Host start="" errorMessage="Not a date." />);
    act(() => input().focus());
    type('2026-1');
    expect(screen.queryByText('Not a date.')).toBeNull();
    fireEvent.blur(input());
    expect(screen.getByText('Not a date.')).toBeInTheDocument();
  });

  it('Enter (a submit attempt) shows a page refusal at once while the field keeps focus, then typing hides it again', () => {
    render(<Host start="" errorMessage="Not a date." />);
    act(() => input().focus());
    type('2027-02-31');
    expect(screen.queryByText('Not a date.')).toBeNull();
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(input()).toHaveFocus();
    expect(screen.getByText('Not a date.')).toBeInTheDocument();
    expect(input()).toHaveAttribute('aria-invalid', 'true');
    type('2027-02-3');
    expect(screen.queryByText('Not a date.')).toBeNull();
  });

  it('a page refusal about a real day (not the format) shows at once, even while typing', () => {
    render(<Host start="2020-01-01" errorMessage="Pick a later day." />);
    act(() => input().focus());
    expect(screen.getByText('Pick a later day.')).toBeInTheDocument();
  });

  it('a page refusal replaces the field\'s own line', () => {
    render(<Host start="2026-02-31" errorMessage="Pick a later day." />);
    fireEvent.blur(input());
    expect(screen.getByText('Pick a later day.')).toBeInTheDocument();
    expect(screen.queryByText(/Use a date such as/)).toBeNull();
  });

  it('ArrowUp and ArrowDown step a day; from empty they start at today', () => {
    const seen: string[] = [];
    render(<Host start="2026-10-31" seen={seen} />);
    fireEvent.keyDown(input(), { key: 'ArrowUp' });
    expect(input()).toHaveValue('2026-11-01');
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    expect(input()).toHaveValue('2026-10-30');
  });

  it('opens on the typed day and a pick fills the field, closes and keeps focus on the button', async () => {
    const user = userEvent.setup();
    const seen: string[] = [];
    render(<Host start="2026-10-23" seen={seen} />);
    await user.click(pickButton());
    expect(day(23).closest('td')).toHaveAttribute('aria-selected', 'true');
    await user.click(day(27));
    expect(input()).toHaveValue('2026-10-27');
    expect(seen.at(-1)).toBe('2026-10-27');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(pickButton()).toHaveFocus();
  });

  it('days outside minValue..maxValue cannot be picked; typed text outside them is still accepted', async () => {
    const user = userEvent.setup();
    const seen: string[] = [];
    render(<Host start="2026-10-15" seen={seen} minValue="2026-10-10" maxValue="2026-10-20" />);
    await user.click(pickButton());
    expect(day(9).closest('td')).toHaveAttribute('aria-disabled', 'true');
    expect(day(21).closest('td')).toHaveAttribute('aria-disabled', 'true');
    expect(day(10).closest('td')).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(day(9));
    expect(seen).toEqual([]);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    type('2030-01-01');
    expect(input()).toHaveValue('2030-01-01');
  });

  it('a disabled field has a disabled calendar button', () => {
    render(<Host start="2026-10-23" isDisabled />);
    expect(input()).toBeDisabled();
    expect(pickButton()).toBeDisabled();
  });

  it('inside a locked Form the input and the calendar button are disabled; an unlocked Form is not', () => {
    const { unmount } = render(
      <Form locked onSubmit={() => undefined}>
        <Host start="2026-10-23" />
      </Form>,
    );
    expect(input()).toBeDisabled();
    expect(pickButton()).toBeDisabled();
    unmount();
    render(
      <Form onSubmit={() => undefined}>
        <Host start="2026-10-23" />
      </Form>,
    );
    expect(input()).toBeEnabled();
    expect(pickButton()).toBeEnabled();
  });
});
