// CodeEditor colours: with `lang`, an aria-hidden mirror under a transparent
// textarea draws the CodeBlock's colours as text, follows both scroll offsets, and is off above 64 KiB and under
// Performance mode; without `lang` the editor is the plain textarea it was. Layout (computed metrics, scroll limits,
// caller styles, widths) is a browser's: CodeEditor.colour.spec.ts.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import hl from '../data/Ids.module.css';
import { setPerf } from '../perf';
import { CodeEditor, EDITOR_COLOUR_MAX } from './CodeEditor';
import s from './CodeEditor.module.css';

const CODE = "const name = 'world';\nreturn name;\n";

function Ed({ initial = CODE, lang }: { initial?: string; lang?: 'ts' | 'json' }) {
  const [v, setV] = useState(initial);
  return <CodeEditor value={v} onChange={setV} lang={lang} />;
}
const area = () => screen.getByRole('textbox', { name: 'Code' }) as HTMLTextAreaElement;
const mirrorOf = () => document.querySelector('pre');

// jsdom does no layout, so an element's scroll offsets never move: keep what is written, as a browser does for a
// scrollable box, so the mirror's copy of the textarea's offsets can be read back.
const offsets = new WeakMap<Element, { top: number; left: number }>();
const real = {
  top: Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop'),
  left: Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft'),
};
const box = (e: Element) => offsets.get(e) ?? (offsets.set(e, { top: 0, left: 0 }), offsets.get(e)!);
beforeEach(() => {
  Object.defineProperty(Element.prototype, 'scrollTop', { configurable: true, get(this: Element) { return box(this).top; }, set(this: Element, v: number) { box(this).top = v; } });
  Object.defineProperty(Element.prototype, 'scrollLeft', { configurable: true, get(this: Element) { return box(this).left; }, set(this: Element, v: number) { box(this).left = v; } });
});
afterEach(() => {
  if (real.top) Object.defineProperty(Element.prototype, 'scrollTop', real.top);
  if (real.left) Object.defineProperty(Element.prototype, 'scrollLeft', real.left);
  act(() => {
    setPerf(false);
  });
});

describe('CodeEditor colours', () => {
  it('without a language the editor is what it was: no mirror, no wrapper, the textarea alone in its one class', () => {
    render(<Ed />);
    expect(mirrorOf()).toBeNull();
    const el = area();
    expect(el.className).toBe(s.text);
    // The textarea is still the body's own child, beside the gutter: no pane around it.
    expect(el.parentElement?.querySelector(':scope > [aria-hidden="true"]')).not.toBeNull();
    expect(document.querySelector(`.${s.pane}`)).toBeNull();
  });

  it('with a language: a hidden mirror holds the same text, coloured with the code block classes', () => {
    render(<Ed lang="ts" />);
    const pre = mirrorOf()!;
    expect(pre.getAttribute('aria-hidden')).toBe('true');
    // The trailing newline keeps its line in the mirror with one space after it.
    expect(pre.textContent).toBe(CODE + ' ');
    expect(pre.querySelector(`.${hl.hl_kw}`)?.textContent).toBe('const');
    expect(pre.querySelector(`.${hl.hl_str}`)?.textContent).toBe("'world'");
    expect(area().classList.contains(s.painted!)).toBe(true);
    // Textarea and mirror lay out their characters with one shared class (.text).
    expect(pre.classList.contains(s.text!)).toBe(true);
    expect(area().classList.contains(s.text!)).toBe(true);
  });

  it('the mirror follows what is typed, and code is never markup', () => {
    render(<Ed lang="ts" />);
    const evil = '<img src=x onerror="alert(1)"> // <b>bold</b>';
    fireEvent.change(area(), { target: { value: evil } });
    const pre = mirrorOf()!;
    expect(pre.textContent).toBe(evil);
    expect(pre.querySelector('img, b')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
  });

  it('a scroll of the textarea moves the mirror the same way on both axes', () => {
    render(<Ed lang="ts" />);
    const el = area();
    el.scrollTop = 40;
    el.scrollLeft = 120;
    fireEvent.scroll(el);
    const pre = mirrorOf()!;
    expect(pre.scrollTop).toBe(40);
    expect(pre.scrollLeft).toBe(120);
  });

  it('above 64 KiB the colours are off and the textarea shows its text; back under, they return', () => {
    const big = 'x'.repeat(EDITOR_COLOUR_MAX + 1);
    render(<Ed lang="ts" initial={big} />);
    expect(mirrorOf()).toBeNull();
    expect(area().classList.contains(s.painted!)).toBe(false);
    const before = area();
    fireEvent.change(before, { target: { value: 'const a = 1;' } });
    expect(mirrorOf()).not.toBeNull();
    // The same textarea throughout: the cap never remounts it (focus and undo are kept).
    expect(area()).toBe(before);
  });

  it('Performance mode turns the colours off', () => {
    render(<Ed lang="ts" />);
    expect(mirrorOf()).not.toBeNull();
    act(() => {
      setPerf(true);
    });
    expect(mirrorOf()).toBeNull();
    expect(area().classList.contains(s.painted!)).toBe(false);
  });

  it('typing keeps the textarea the one accessible node: the mirror stays aria-hidden and the name is kept', () => {
    render(<Ed lang="ts" />);
    const before = area();
    fireEvent.change(before, { target: { value: CODE + 'const more = 2;\n' } });
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(area()).toBe(before);
    expect(mirrorOf()!.getAttribute('aria-hidden')).toBe('true');
    expect(mirrorOf()!.textContent).toBe(CODE + 'const more = 2;\n ');
    // Nothing inside the mirror is reachable by role: every element under it is hidden with it.
    for (const e of mirrorOf()!.querySelectorAll('*')) expect(e.closest('[aria-hidden="true"]')).toBe(mirrorOf());
  });

  // An edit that changes the line count resynchronizes the mirror in the layout
  // effect. The mirror's own offsets are moved off first, so a kept copy cannot pass for a fresh sync.
  it('an edit that adds or removes lines puts the mirror back where the textarea is', () => {
    render(<Ed lang="ts" />);
    const el = area();
    el.scrollTop = 60;
    el.scrollLeft = 30;
    fireEvent.scroll(el);
    for (const next of [CODE + 'more();\nand();\n', 'one line']) {
      const pre = mirrorOf()!;
      pre.scrollTop = 0;
      pre.scrollLeft = 0;
      fireEvent.change(el, { target: { value: next } });
      expect(mirrorOf()!.scrollTop, next).toBe(60);
      expect(mirrorOf()!.scrollLeft, next).toBe(30);
    }
  });

  it('a mirror that appears (back under 64 KiB, or Performance mode off) starts where the textarea is scrolled', () => {
    render(<Ed lang="ts" initial={'x'.repeat(EDITOR_COLOUR_MAX) + '\ny'} />);
    expect(mirrorOf()).toBeNull();
    const el = area();
    el.scrollTop = 500;
    el.scrollLeft = 7;
    fireEvent.scroll(el);
    fireEvent.change(el, { target: { value: 'x\n'.repeat(100) } });
    expect(mirrorOf()!.scrollTop).toBe(500);
    expect(mirrorOf()!.scrollLeft).toBe(7);
    act(() => {
      setPerf(true);
    });
    expect(mirrorOf()).toBeNull();
    el.scrollTop = 120;
    fireEvent.scroll(el);
    act(() => {
      setPerf(false);
    });
    expect(mirrorOf()!.scrollTop).toBe(120);
  });

  it('a trailing newline keeps its last line in the mirror, typed or removed', () => {
    render(<Ed lang="ts" initial="a" />);
    fireEvent.change(area(), { target: { value: 'a\n' } });
    expect(mirrorOf()!.textContent).toBe('a\n ');
    fireEvent.change(area(), { target: { value: 'a' } });
    expect(mirrorOf()!.textContent).toBe('a');
  });
});
