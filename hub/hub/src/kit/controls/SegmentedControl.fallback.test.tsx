// Vitest: the Select a full-width SegmentedControl draws when its labels do not fit keeps the
// segments' accessibility contract: the help text stays associated, an option's name is its label alone and its count
// is read as its description. Keyboard focus moves with the presentation (segments <-> Select) when it was inside, and
// never when it had left. A change of count or size measures the segments again without waiting for a resize.
//
// jsdom has no layout: the control's box is `room`; a segment needs 10 px per character of its text plus 40.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SegmentedControl, type SegmentItem } from './SegmentedControl';

let room = 0;
const observers: Array<{ cb: () => void; el?: Element }> = [];

beforeEach(() => {
  observers.length = 0;
  room = 0;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    private o: { cb: () => void; el?: Element };
    constructor(cb: () => void) {
      this.o = { cb };
      observers.push(this.o);
    }
    observe(el: Element) {
      this.o.el = el;
    }
    unobserve() {}
    disconnect() {
      this.o.el = undefined;
    }
  };
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('fit') && this.isConnected ? room : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) {
      if (this.classList.contains('track')) return [...this.querySelectorAll('button')].reduce((n, b) => n + 40 + (b.textContent ?? '').length * 10, 0);
      return this.classList.contains('fit') ? room : Math.min(room, 200);
    },
  });
});

afterEach(() => {
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
});

function resize(w: number) {
  room = w;
  act(() => {
    for (const o of observers) if (o.el) o.cb();
  });
}

type Id = 'unread' | 'all';
const counted = (unread: number, all: number): SegmentItem<Id>[] => [
  { id: 'unread', label: 'Unread', count: unread },
  { id: 'all', label: 'All', count: all },
];

function Host({ items, describedBy }: { items: SegmentItem<Id>[]; describedBy?: string }) {
  const [v, setV] = useState<Id>('unread');
  return (
    <>
      <p id="help">Which notices to show</p>
      <SegmentedControl label="Box" items={items} value={v} onChange={setV} fullWidth aria-describedby={describedBy} />
      <button type="button">Elsewhere</button>
    </>
  );
}

// "Unread3" + "All12": (40 + 70) + (40 + 50) = 200 px of segments.
describe('the Select fallback keeps the segment contract', () => {
  it('keeps the help association on the Select', () => {
    room = 150;
    render(<Host items={counted(3, 12)} describedBy="help" />);
    const trigger = screen.getByRole('button', { name: /Box/ });
    expect(trigger.getAttribute('aria-describedby') ?? '').toContain('help');
  });

  it("names each option by its label alone and reads its count as the option's description", async () => {
    room = 150;
    render(<Host items={counted(3, 12)} />);
    await userEvent.click(screen.getByRole('button', { name: /Box/ }));
    const unread = await screen.findByRole('option', { name: 'Unread' });
    expect(unread).toHaveAccessibleDescription('3');
    expect(screen.getByRole('option', { name: 'All' })).toHaveAccessibleDescription('12');
  });
});

describe('focus moves with the presentation', () => {
  it('a focused segment hands focus to the Select when the control narrows', () => {
    room = 300;
    render(<Host items={counted(3, 12)} />);
    const seg = screen.getByRole('radio', { name: 'Unread' });
    act(() => seg.focus());
    expect(document.activeElement).toBe(seg);
    resize(150);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Box/ }));
  });

  it('a focused Select hands focus to the chosen segment when the control widens', () => {
    room = 150;
    render(<Host items={counted(3, 12)} />);
    const trigger = screen.getByRole('button', { name: /Box/ });
    act(() => trigger.focus());
    resize(300);
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Unread' }));
  });

  it('focus that left the control stays where it went', () => {
    room = 300;
    render(<Host items={counted(3, 12)} />);
    act(() => screen.getByRole('radio', { name: 'Unread' }).focus());
    const away = screen.getByRole('button', { name: 'Elsewhere' });
    act(() => away.focus());
    resize(150);
    expect(document.activeElement).toBe(away);
  });
});

describe('a change of what the segments hold measures them again', () => {
  it('counts that shrink bring the segments back with no resize', () => {
    room = 230;
    const { rerender } = render(<Host items={counted(3000, 12000)} />); // 40+90 + 40+70 = 240 > 230
    expect(screen.queryByRole('radiogroup')).toBeNull();
    rerender(<Host items={counted(3, 12)} />); // 200 fits
    expect(screen.getByRole('radiogroup', { name: 'Box' })).toBeInTheDocument();
  });

  it('counts that grow switch to the Select with no resize', () => {
    room = 230;
    const { rerender } = render(<Host items={counted(3, 12)} />);
    expect(screen.getByRole('radiogroup', { name: 'Box' })).toBeInTheDocument();
    rerender(<Host items={counted(3000, 12000)} />);
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });
});
