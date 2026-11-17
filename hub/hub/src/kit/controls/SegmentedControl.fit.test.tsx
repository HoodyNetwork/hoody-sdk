// Vitest: a full-width SegmentedControl never cuts its labels. It measures its own box: when the segments'
// whole labels do not fit, the same choices show as a Select with the current one; when the box grows back, the
// segments return. A control that is not full width is unchanged (a toolbar fits it).
//
// jsdom has no layout: the control's box is `room`; the segments need SEG px each, a Select fits any box.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SegmentedControl } from './SegmentedControl';

const SEG = 120;
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
      if (this.classList.contains('track')) return this.querySelectorAll('button').length * SEG;
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

const ITEMS = [
  { id: 'ready', label: 'Ready to open' },
  { id: 'agents', label: 'Coding agents' },
  { id: 'github', label: 'From GitHub' },
] as const;

function Host({ full = true, seen }: { full?: boolean; seen?: string[] }) {
  const [v, setV] = useState<string>('ready');
  return (
    <SegmentedControl
      label="View"
      items={ITEMS}
      value={v}
      fullWidth={full}
      onChange={(x) => {
        seen?.push(x);
        setV(x);
      }}
    />
  );
}

describe('a full-width SegmentedControl fits its own width', () => {
  it('shows segments while the labels fit, a Select with the current choice when they do not, and segments again', () => {
    room = 400;
    render(<Host />);
    expect(screen.getByRole('radiogroup', { name: 'View' })).toBeInTheDocument();
    resize(320);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByRole('button', { name: /View/ })).toHaveTextContent('Ready to open');
    resize(400);
    expect(screen.getByRole('radiogroup', { name: 'View' })).toBeInTheDocument();
  });

  it('a pick in the Select reaches onChange once', async () => {
    room = 300;
    const seen: string[] = [];
    render(<Host seen={seen} />);
    await userEvent.click(screen.getByRole('button', { name: /View/ }));
    await userEvent.click(await screen.findByRole('option', { name: /From GitHub/ }));
    expect(seen).toEqual(['github']);
    expect(screen.getByRole('button', { name: /View/ })).toHaveTextContent('From GitHub');
  });

  it('a control that is not full width keeps its segments', () => {
    room = 100;
    render(<Host full={false} />);
    expect(screen.getByRole('radiogroup', { name: 'View' })).toBeInTheDocument();
  });
});
