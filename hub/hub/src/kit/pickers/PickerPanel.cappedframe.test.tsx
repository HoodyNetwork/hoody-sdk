// PickerPanel maxRows draws its edge: a capped list has a line and a small inset, so it reads as a scroll
// area; the measured cap counts the inset and the line at its foot, so the next row still peeks by half inside the
// frame; an uncapped list has no frame.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PickerPanel, type PickerItem } from './PickerPanel';

afterEach(() => vi.restoreAllMocks());

const css = readFileSync(join(__dirname, 'PickerPanel.module.css'), 'utf8');
const rule = (sel: string) => new RegExp(`\\n${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`).exec(css)?.[1] ?? '';
const items = (n: number): PickerItem[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, label: `Realm ${i + 1}` }));

function Panel({ n }: { n: number }) {
  const [value, setValue] = useState<string[]>([]);
  return <PickerPanel label="Realms" mode="multi" items={items(n)} value={value} onChange={setValue} maxRows={2} />;
}

describe('PickerPanel capped frame', () => {
  it('a capped list draws a line and an inset, in tokens; the plain list draws none', () => {
    const capped = rule('.capped');
    expect(capped).toMatch(/border: var\(--bw\) solid var\(--hx-line\);/);
    expect(capped).toMatch(/padding: var\(--sp-1\);/);
    expect(capped).toMatch(/box-sizing: border-box;/);
    expect(capped).toMatch(/max-block-size: calc\(var\(--pp-rows\) \* var\(--ctl-h\) \+ 2 \* \(var\(--bw\) \+ var\(--sp-1\)\)\);/);
    expect(rule('.list')).not.toMatch(/border/);
  });

  it('the measured cap adds the inset and the line at the foot', () => {
    // Rows 40 px tall from 5 px (line + inset) under the list's top; the list's foot is the same 4 + 1.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const rows = [...(this.closest('[data-capped]')?.querySelectorAll('[role="checkbox"]') ?? [])];
      const i = rows.indexOf(this);
      const top = i < 0 ? 0 : 5 + i * 40;
      return { top, bottom: i < 0 ? 0 : top + 40, height: i < 0 ? 0 : 40, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    });
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, p?: string | null) => {
      const cs = real(el, p);
      if (!(el instanceof HTMLElement) || !el.hasAttribute('data-capped')) return cs;
      return new Proxy(cs, { get: (t, k) => (k === 'paddingBlockEnd' ? '4px' : k === 'borderBlockEndWidth' ? '1px' : Reflect.get(t, k)) });
    });
    render(<Panel n={5} />);
    // Second row's bottom 85, half the third 20, the foot 5.
    expect(screen.getByRole('group', { name: 'Realms' }).style.maxBlockSize).toBe('110px');
  });

  it('a scrolled list measured again keeps its cap: the scroll offset is added back', () => {
    // Viewport coordinates move up by the list's scrollTop; the cap must not shrink with them.
    let scrolled = 0;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const rows = [...(this.closest('[data-capped]')?.querySelectorAll('[role="checkbox"]') ?? [])];
      const i = rows.indexOf(this);
      const top = i < 0 ? 0 : 5 + i * 40 - scrolled;
      return { top, bottom: i < 0 ? 0 : top + 40, height: i < 0 ? 0 : 40, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    });
    const observers: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          observers.push(cb);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    try {
      render(<Panel n={5} />);
      const list = screen.getByRole('group', { name: 'Realms' });
      expect(list.style.maxBlockSize).toBe('105px');
      scrolled = 60;
      list.scrollTop = 60;
      act(() => observers.forEach((cb) => cb([], {} as ResizeObserver)));
      expect(list.style.maxBlockSize).toBe('105px');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
