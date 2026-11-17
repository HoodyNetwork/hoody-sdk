// Vitest: a controlled SegmentedControl whose value names none of its items shows no choice. It never
// shows the first item as chosen, because then pressing that item would do nothing (a chosen toggle sends no change) and
// the page could not get back to it. No value at all still means the first item, and a URL param keeps its fallback
// (the first item is the param's default; SegmentedControl.test.tsx).
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SegmentedControl, type SegmentItem } from './SegmentedControl';

type Id = 'all' | 'running' | 'stopped';
const items: SegmentItem<Id>[] = [
  { id: 'all', label: 'All' },
  { id: 'running', label: 'Running' },
  { id: 'stopped', label: 'Stopped' },
];

function Controlled({ start, onChange }: { start: string | undefined; onChange?: (v: Id) => void }) {
  const [v, setV] = useState<Id | undefined>(start as Id | undefined);
  return (
    <SegmentedControl<Id>
      label="State"
      items={items}
      value={v}
      onChange={(n) => {
        onChange?.(n);
        setV(n);
      }}
    />
  );
}

describe('SegmentedControl with a value outside its items (segments)', () => {
  it('shows no choice, and pressing the first item chooses it', () => {
    const onChange = vi.fn();
    render(<Controlled start="more" onChange={onChange} />);
    for (const name of ['All', 'Running', 'Stopped']) expect(screen.getByRole('radio', { name })).not.toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'All' }));
    expect(onChange).toHaveBeenCalledWith('all');
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
  });

  it('no value still shows the first item', () => {
    render(<Controlled start={undefined} />);
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
  });
});

// jsdom has no layout: a full-width control whose box is narrower than its segments draws the Select.
describe('SegmentedControl with a value outside its items (Select)', () => {
  beforeEach(() => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 10 });
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 1000 });
  });
  afterEach(() => {
    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
  });

  it('the Select names no choice, and picking the first item reports it', async () => {
    const onChange = vi.fn();
    render(<SegmentedControl<Id> label="State" items={items} value={'more' as Id} onChange={onChange} fullWidth />);
    const trigger = screen.getByRole('button', { name: /State/ });
    expect(trigger).not.toHaveTextContent('All');
    await userEvent.click(trigger);
    await act(async () => userEvent.click(screen.getByRole('option', { name: 'All' })));
    expect(onChange).toHaveBeenCalledWith('all');
  });
});
