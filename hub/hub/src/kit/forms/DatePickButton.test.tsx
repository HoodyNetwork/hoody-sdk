// DatePickButton, as used by DateTimeField: a calendar button beside the typed date. It opens a
// calendar popover; picking a day fills the date (the typed time stays) and moves focus to the time; Escape
// returns to the button; days outside minValue..maxValue cannot be picked; today is marked.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { DateTimeField } from './DateTimeField';
import { Form } from './more';

const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi, 0, 0).getTime();

function Host({ start, seen, minValue, maxValue, isDisabled }: { start: number | null; seen: Array<number | null>; minValue?: number; maxValue?: number; isDisabled?: boolean }) {
  const [v, setV] = useState<number | null>(start);
  return (
    <DateTimeField
      label="Around a time"
      value={v}
      minValue={minValue}
      maxValue={maxValue}
      isDisabled={isDisabled}
      onChange={(ms) => {
        seen.push(ms);
        setV(ms);
      }}
    />
  );
}

const date = () => screen.getByRole('textbox', { name: 'Date' });
const time = () => screen.getByRole('textbox', { name: 'Time' });
const pickButton = () => screen.getByRole('button', { name: 'Pick a date' });
const calendar = () => screen.getByRole('dialog', { name: 'Calendar' });
/** A day button of the open calendar by its day-of-month (the neighbouring months' days are rendered but marked outside). */
const days = (n: number) =>
  within(calendar())
    .getAllByRole('button', { name: new RegExp(`^(Today, )?\\w+, \\w+ ${n}, \\d{4}`) })
    .filter((b) => !b.hasAttribute('data-outside-month'));
const day = (n: number) => days(n)[0]!;

describe('DateTimeField calendar picker', () => {
  it('has a calendar button beside the date that opens a named calendar', async () => {
    const user = userEvent.setup();
    render(<Host start={at(2026, 10, 23, 9, 5)} seen={[]} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(pickButton());
    expect(calendar()).toBeInTheDocument();
    expect(within(calendar()).getByRole('heading', { name: /October 2026/ })).toBeInTheDocument();
  });

  it('opens on the typed date, marked as the chosen day', async () => {
    const user = userEvent.setup();
    render(<Host start={at(2026, 10, 23, 9, 5)} seen={[]} />);
    await user.click(pickButton());
    expect(day(23).closest('td')).toHaveAttribute('aria-selected', 'true');
    expect(day(24).closest('td')).not.toHaveAttribute('aria-selected', 'true');
  });

  it('picking a day fills the date, keeps the typed time and closes', async () => {
    const user = userEvent.setup();
    const seen: Array<number | null> = [];
    render(<Host start={at(2026, 10, 23, 9, 5)} seen={seen} />);
    await user.click(pickButton());
    await user.click(day(27));
    expect(date()).toHaveValue('2026-10-27');
    expect(time()).toHaveValue('09:05');
    expect(seen.at(-1)).toBe(at(2026, 10, 27, 9, 5));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('picking a day moves focus to the time', async () => {
    const user = userEvent.setup();
    render(<Host start={at(2026, 10, 23, 9, 5)} seen={[]} />);
    await user.click(pickButton());
    await user.click(day(27));
    await waitFor(() => expect(time()).toHaveFocus());
  });

  it('with no time typed the pick fills the date and the value stays null until the time is typed', async () => {
    const user = userEvent.setup();
    const seen: Array<number | null> = [];
    render(<Host start={null} seen={seen} />);
    await user.click(pickButton());
    await user.click(day(1));
    expect(date().getAttribute('value')).toMatch(/^\d{4}-\d{2}-01$/);
    expect(seen.at(-1)).toBeNull();
    await waitFor(() => expect(time()).toHaveFocus());
  });

  it('marks today', async () => {
    const user = userEvent.setup();
    render(<Host start={null} seen={[]} />);
    await user.click(pickButton());
    const today = within(calendar()).getByRole('button', { name: /^Today, / });
    expect(today).toBeInTheDocument();
    // Drawn as today (the ring), and only that one cell is.
    expect(today.className).toMatch(/today/);
    expect(within(calendar()).getAllByRole('button').filter((b) => /today/.test(b.className))).toHaveLength(1);
  });

  it('works by keyboard: arrows move, Enter picks, PageDown moves a month', async () => {
    const user = userEvent.setup();
    const seen: Array<number | null> = [];
    render(<Host start={at(2026, 10, 23, 9, 5)} seen={seen} />);
    pickButton().focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(day(23)).toHaveFocus());
    await user.keyboard('{ArrowRight}{ArrowDown}');
    expect(day(31)).toHaveFocus();
    await user.keyboard('{PageDown}');
    await waitFor(() => expect(within(calendar()).getByRole('heading', { name: /November 2026/ })).toBeInTheDocument());
    await user.keyboard('{Enter}');
    expect(seen.at(-1)).toBe(at(2026, 11, 30, 9, 5));
  });

  it('Escape closes the calendar and returns focus to its button without changing the date', async () => {
    const user = userEvent.setup();
    const seen: Array<number | null> = [];
    render(<Host start={at(2026, 10, 23, 9, 5)} seen={seen} />);
    await user.click(pickButton());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(pickButton()).toHaveFocus();
    expect(date()).toHaveValue('2026-10-23');
    expect(seen).toEqual([]);
  });

  it('days outside minValue..maxValue are disabled and cannot be picked', async () => {
    const user = userEvent.setup();
    const seen: Array<number | null> = [];
    render(<Host start={at(2026, 10, 23, 9, 5)} seen={seen} minValue={at(2026, 10, 20, 0, 0)} maxValue={at(2026, 10, 25, 23, 59)} />);
    await user.click(pickButton());
    expect(day(19).closest('td')).toHaveAttribute('aria-disabled', 'true');
    expect(day(26).closest('td')).toHaveAttribute('aria-disabled', 'true');
    expect(day(20).closest('td')).not.toHaveAttribute('aria-disabled', 'true');
    expect(day(25).closest('td')).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(day(26));
    expect(seen).toEqual([]);
    expect(date()).toHaveValue('2026-10-23');
    await user.click(day(25));
    expect(seen.at(-1)).toBe(at(2026, 10, 25, 9, 5));
  });

  it('the bounds disable days only: a typed date outside them is still taken as typed', async () => {
    const user = userEvent.setup();
    const seen: Array<number | null> = [];
    render(<Host start={null} seen={seen} minValue={at(2026, 10, 20, 0, 0)} />);
    await user.type(date(), '2026-01-05');
    await user.type(time(), '10:00');
    expect(seen.at(-1)).toBe(at(2026, 1, 5, 10, 0));
  });

  it('a typed date that does not exist opens the calendar with nothing chosen', async () => {
    const user = userEvent.setup();
    render(<Host start={at(2026, 2, 1, 10, 0)} seen={[]} />);
    await user.clear(date());
    await user.type(date(), '2026-02-30');
    await user.click(pickButton());
    expect(within(calendar()).queryAllByRole('gridcell').filter((c) => c.getAttribute('aria-selected') === 'true')).toHaveLength(0);
  });

  it('inside a locked Form the calendar button is disabled like the typed parts', () => {
    render(
      <Form locked onSubmit={() => undefined}>
        <Host start={at(2026, 10, 23, 9, 5)} seen={[]} />
      </Form>,
    );
    expect(date()).toBeDisabled();
    expect(pickButton()).toBeDisabled();
  });

  it('a field disabled while its calendar is open closes the calendar and picks nothing', async () => {
    const user = userEvent.setup();
    const seen: Array<number | null> = [];
    const { rerender } = render(<Host start={at(2026, 10, 23, 9, 5)} seen={seen} />);
    await user.click(pickButton());
    expect(calendar()).toBeInTheDocument();
    rerender(<Host start={at(2026, 10, 23, 9, 5)} seen={seen} isDisabled />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(seen).toEqual([]);
    expect(date()).toHaveValue('2026-10-23');
  });

  it('a Form locked while its calendar is open closes it too', async () => {
    const user = userEvent.setup();
    const seen: Array<number | null> = [];
    const ui = (locked: boolean) => (
      <Form locked={locked} onSubmit={() => undefined}>
        <Host start={at(2026, 10, 23, 9, 5)} seen={seen} />
      </Form>
    );
    const { rerender } = render(ui(false));
    await user.click(pickButton());
    rerender(ui(true));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(seen).toEqual([]);
  });

  it('a disabled field disables the calendar button', () => {
    render(<Host start={null} seen={[]} isDisabled />);
    expect(pickButton()).toBeDisabled();
  });
});
