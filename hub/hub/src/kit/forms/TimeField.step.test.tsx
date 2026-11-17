// TimeField and DateTimeField step a time by one rule: ↑/↓ go to the next mark of the step grid in that direction, so
// the same typed time gives the same answer in both fields (from 23:50, ↓ is 23:45 and ↑ wraps to 00:00).
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { DateTimeField } from './DateTimeField';
import { TimeField, stepClock } from './more';

function Host({ start, step }: { start: string; step?: number }) {
  const [value, setValue] = useState(start);
  return <TimeField label="At" value={value} onChange={setValue} step={step} />;
}

const press = (key: 'ArrowUp' | 'ArrowDown') => act(() => fireEvent.keyDown(screen.getByRole('textbox', { name: 'At' }), { key }));
const shown = () => (screen.getByRole('textbox', { name: 'At' }) as HTMLInputElement).value;

describe('TimeField steps to the next grid mark', () => {
  const cases: [string, 'ArrowUp' | 'ArrowDown', string][] = [
    ['23:50', 'ArrowDown', '23:45'],
    ['23:50', 'ArrowUp', '00:00'],
    ['09:07', 'ArrowDown', '09:00'],
    ['09:07', 'ArrowUp', '09:15'],
    ['09:00', 'ArrowDown', '08:45'],
    ['09:00', 'ArrowUp', '09:15'],
    ['00:00', 'ArrowDown', '23:45'],
  ];
  for (const [start, key, want] of cases)
    it(`${start} ${key} → ${want}`, async () => {
      render(<Host start={start} />);
      await press(key);
      expect(shown()).toBe(want);
    });

  it('an empty field starts from 00:00', async () => {
    render(<Host start="" />);
    await press('ArrowUp');
    expect(shown()).toBe('00:15');
  });
});

describe('one rule for both fields', () => {
  it('stepClock is the grid-mark rule (minutes of the day, wrapping)', () => {
    expect(stepClock(23 * 60 + 50, -1, 15)).toBe(23 * 60 + 45);
    expect(stepClock(23 * 60 + 50, 1, 15)).toBe(0);
    expect(stepClock(0, -1, 15)).toBe(23 * 60 + 45);
    expect(stepClock(7, 1, 5)).toBe(10);
  });

  it('DateTimeField gives the same answer as TimeField from 23:50', async () => {
    const at = new Date(2026, 11, 31, 23, 50).getTime();
    function Both() {
      const [ms, setMs] = useState<number | null>(at);
      return <DateTimeField label="When" value={ms} onChange={setMs} />;
    }
    render(
      <>
        <Host start="23:50" />
        <Both />
      </>,
    );
    await press('ArrowDown');
    const times = screen.getAllByRole('textbox').map((el) => (el as HTMLInputElement).value);
    expect(times).toContain('23:45');
    expect(shown()).toBe('23:45');
    const dtTime = screen.getAllByRole('textbox').find((el) => el !== screen.getByRole('textbox', { name: 'At' }) && /^\d\d:\d\d$/.test((el as HTMLInputElement).value)) as HTMLInputElement;
    await act(() => fireEvent.keyDown(dtTime, { key: 'ArrowDown' }));
    expect(dtTime.value).toBe('23:45');
  });
});

describe('a step that does not divide the day', () => {
  it('wraps onto the day\'s own grid at midnight (marks count from 00:00)', () => {
    // 7-minute marks: …, 23:48, 23:55, then 00:00 again.
    expect(stepClock(0, -1, 7)).toBe(1435);
    expect(stepClock(1435, 1, 7)).toBe(0);
    expect(stepClock(1437, 1, 7)).toBe(0);
    expect(stepClock(3, -1, 7)).toBe(0);
    // A step that divides the day is unchanged.
    expect(stepClock(0, -1, 15)).toBe(1425);
    expect(stepClock(1430, 1, 15)).toBe(0);
  });
});
