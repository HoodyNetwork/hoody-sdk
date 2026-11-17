// Vitest: in the Options drawer a segmented row never cuts its labels. The Opens row and every `seg` parameter row
// show their choices as segments while every label fits whole, and as a Select of the same choices when not.
//
// jsdom has no layout: the row's box is `room`; a segment needs 10 px per character of its text plus 40 (as the kit's
// SegmentedControl fit tests measure it).
import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Catalog, TileProgram } from '../embed/catalog';
import catalog from '../embed/catalog.ui.json';
import { OptionsPanel } from './index';

const CAT = catalog as unknown as Catalog;
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

const resize = (w: number) => {
  room = w;
  act(() => {
    for (const o of observers) if (o.el) o.cb();
  });
};

function Host({ program, view }: { program: TileProgram; view?: string }) {
  const [open, setOpen] = useState(true);
  return <OptionsPanel isOpen={open} onOpenChange={setOpen} cat={CAT} onRetry={() => undefined} program={program} tileName={`${program}-2`} computerName="atlas" view={view} running onSave={() => undefined} />;
}

const row = (id: string) => {
  const el = screen.getByRole('dialog').querySelector<HTMLElement>(`[data-opt="${id}"]`);
  if (!el) throw new Error(`no row ${id}`);
  return el;
};
// By role in the DOM, not the accessibility tree: the terminal rows sit in a closed section.
const segments = (id: string) => [...row(id).querySelectorAll('[role="radio"]')].map((r) => r.textContent?.trim());
const select = (id: string) => row(id).querySelector<HTMLElement>('button[aria-haspopup="listbox"]');

describe('Options drawer: a segmented row shows whole labels or a Select', () => {
  it('the Opens row of a notes tile: a Select with the current choice when its labels do not fit, segments when they do', () => {
    room = 300;
    render(<Host program="notes" />);
    expect(segments('view')).toEqual([]);
    expect(select('view')).toHaveTextContent('Home');
    resize(2000);
    expect(segments('view')).toEqual(['Home', 'New notebook', 'Notebook', 'Page', 'Page by alias', 'Page over a page']);
    expect(select('view')).toBeNull();
  });

  it('a seg parameter row (terminal cursor style): a Select when its labels do not fit, segments when they do', () => {
    room = 120;
    render(<Host program="terminal" />);
    expect(segments('cursorStyle')).toEqual([]);
    expect(select('cursorStyle')).not.toBeNull();
    resize(2000);
    expect(segments('cursorStyle')).toHaveLength(4);
    expect(select('cursorStyle')).toBeNull();
  });
});
