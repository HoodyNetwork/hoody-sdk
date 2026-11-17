// DateTimeField (logs "Around a time"): a date and a 24-hour time typed in the viewer's
// time zone, no browser datetime-local (its look and parsing differ per browser and locale). The value is
// epoch ms built from the parts (never parsed from a string), null while empty or invalid.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { DateTimeField, normalizeDate } from './DateTimeField';

const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi, 0, 0).getTime();

function Host({ start, seen }: { start: number | null; seen: Array<number | null> }) {
  const [v, setV] = useState<number | null>(start);
  return (
    <>
      <DateTimeField
        label="Around a time"
        value={v}
        onChange={(ms) => {
          seen.push(ms);
          setV(ms);
        }}
      />
      <button type="button" onClick={() => setV(at(2026, 1, 2, 3, 4))}>
        jump
      </button>
    </>
  );
}

const date = () => screen.getByRole('textbox', { name: 'Date' });
const time = () => screen.getByRole('textbox', { name: 'Time' });
const type = (el: HTMLElement, text: string) => act(() => fireEvent.change(el, { target: { value: text } }));

describe('DateTimeField', () => {
  it('is one named group showing the value as a date and a 24-hour time', () => {
    render(<Host start={at(2026, 10, 23, 9, 5)} seen={[]} />);
    expect(screen.getByRole('group', { name: 'Around a time' })).toBeInTheDocument();
    expect(date()).toHaveValue('2026-10-23');
    expect(time()).toHaveValue('09:05');
  });

  it('typed parts give the epoch ms of that local date and time', async () => {
    const seen: Array<number | null> = [];
    render(<Host start={null} seen={seen} />);
    await type(date(), '2026-10-23');
    await type(time(), '14:30');
    expect(seen.at(-1)).toBe(at(2026, 10, 23, 14, 30));
  });

  it('a date that does not exist gives null and says how to write one', async () => {
    const seen: Array<number | null> = [];
    render(<Host start={at(2026, 2, 1, 10, 0)} seen={seen} />);
    await type(date(), '2026-02-30');
    expect(seen.at(-1)).toBeNull();
    expect(screen.getByText('Use a date such as 2026-10-23.')).toBeInTheDocument();
  });

  it('arrow keys step the day and the time', async () => {
    const seen: Array<number | null> = [];
    render(<Host start={at(2026, 12, 31, 23, 50)} seen={seen} />);
    await act(() => fireEvent.keyDown(date(), { key: 'ArrowUp' }));
    expect(date()).toHaveValue('2027-01-01');
    await act(() => fireEvent.keyDown(time(), { key: 'ArrowDown' }));
    expect(time()).toHaveValue('23:45');
    expect(seen.at(-1)).toBe(at(2027, 1, 1, 23, 45));
  });

  it('a short date is written out in full when the field is left', async () => {
    render(<Host start={null} seen={[]} />);
    await type(date(), '2026-3-5');
    await act(() => fireEvent.blur(date()));
    expect(date()).toHaveValue('2026-03-05');
    expect(normalizeDate('20260305')).toBe('2026-03-05');
    expect(normalizeDate('2026-13-01')).toBe('2026-13-01');
  });

  it('follows a value set from outside (a click on a log line)', async () => {
    render(<Host start={at(2026, 10, 23, 9, 5)} seen={[]} />);
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'jump' })));
    expect(date()).toHaveValue('2026-01-02');
    expect(time()).toHaveValue('03:04');
  });

  it('a refusal of the whole value marks both parts invalid and is read with each', () => {
    render(<DateTimeField label="When" value={null} onChange={() => undefined} errorMessage="Pick a time in the past." />);
    const err = screen.getByText('Pick a time in the past.');
    expect(err.id).not.toBe('');
    for (const el of [date(), time()]) {
      expect(el).toHaveAttribute('aria-invalid', 'true');
      expect(el.getAttribute('aria-describedby')?.split(' ')).toContain(err.id);
    }
  });

  it('no refusal: the parts are not invalid and point at no error', () => {
    render(<DateTimeField label="When" value={null} onChange={() => undefined} />);
    for (const el of [date(), time()]) {
      expect(el).not.toHaveAttribute('aria-invalid', 'true');
    }
  });

  it('while a part is being typed, a parent that ignores null never overwrites it', async () => {
    function Keeps() {
      const [v, setV] = useState<number | null>(at(2026, 10, 23, 9, 5));
      return <DateTimeField label="When" value={v} onChange={(ms) => ms !== null && setV(ms)} />;
    }
    render(<Keeps />);
    await act(() => time().focus());
    await type(time(), '1');
    expect(time()).toHaveValue('1');
    await type(time(), '14:3');
    expect(time()).toHaveValue('14:3');
  });

  it('a part being typed says it is wrong only once it is left', async () => {
    render(<Host start={null} seen={[]} />);
    await act(() => date().focus());
    await type(date(), '2026');
    expect(screen.queryByText('Use a date such as 2026-10-23.')).toBeNull();
    await act(() => date().blur());
    expect(screen.getByText('Use a date such as 2026-10-23.')).toBeInTheDocument();
  });

  it('numeric keyboards on touch, and disabled disables both parts', () => {
    render(<DateTimeField label="When" value={null} onChange={() => undefined} isDisabled />);
    expect(date()).toHaveAttribute('inputmode', 'numeric');
    expect(time()).toHaveAttribute('inputmode', 'numeric');
    expect(date()).toBeDisabled();
    expect(time()).toBeDisabled();
  });
});
