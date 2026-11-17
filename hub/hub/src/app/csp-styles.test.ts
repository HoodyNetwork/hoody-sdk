// csp-styles: only React Aria's two run-time rules become constructable sheets; every other
// <style> (unknown text, url( or @import, a foreign id, a nonce) reaches <head> untouched.
// happy-dom has no constructable stylesheets, so CSSStyleSheet and adoptedStyleSheets are stubbed.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adoptInjectedStyles } from './csp-styles';

class StubSheet {
  text = '';
  replaceSync(css: string): void {
    this.text = css;
  }
}

const PRESS = `
@layer {
  [data-react-aria-pressable] {
    touch-action: pan-x pan-y pinch-zoom;
  }
}
    `.trim();
const OVERSCROLL = `@layer {
  * {
    overscroll-behavior: contain;
  }
}`;

const realSheet = globalThis.CSSStyleSheet;
let sheets: StubSheet[] = [];

function style(css: string, o: { id?: string; nonce?: string } = {}): HTMLStyleElement {
  const el = document.createElement('style');
  if (o.id) el.id = o.id;
  if (o.nonce) el.nonce = o.nonce;
  el.textContent = css;
  return el;
}

beforeEach(() => {
  sheets = [];
  (globalThis as { CSSStyleSheet: unknown }).CSSStyleSheet = StubSheet;
  Object.defineProperty(document, 'adoptedStyleSheets', {
    configurable: true,
    get: () => sheets,
    set: (v: StubSheet[]) => {
      sheets = v;
    },
  });
  adoptInjectedStyles(document);
});

afterEach(() => {
  const head = document.head as unknown as Record<string, unknown>;
  delete head.prepend;
  delete head.removeChild;
  delete (document as unknown as Record<string, unknown>).adoptedStyleSheets;
  (globalThis as { CSSStyleSheet: unknown }).CSSStyleSheet = realSheet;
  document.head.innerHTML = '';
});

describe('adoptInjectedStyles', () => {
  it('adopts usePress\'s rule and leaves a <meta> with its id, so React Aria does not inject again', () => {
    const el = style(PRESS, { id: 'react-aria-pressable-style' });
    document.head.prepend(el);
    expect(document.head.querySelector('style')).toBeNull();
    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.text).toBe(PRESS);
    expect(document.getElementById('react-aria-pressable-style')?.tagName).toBe('META');
  });

  it('adopts usePreventScroll\'s rule for as long as the element lives', () => {
    const el = style(OVERSCROLL);
    document.head.prepend(el);
    expect(document.head.querySelector('style')).toBeNull();
    expect(sheets).toHaveLength(1);
    el.remove();
    expect(sheets).toHaveLength(0);
    expect(document.head.querySelector('meta[data-hub-adopted-style]')).toBeNull();
  });

  it('removeChild of an adopted style drops its sheet too', () => {
    const el = style(OVERSCROLL);
    document.head.prepend(el);
    document.head.removeChild(el);
    expect(sheets).toHaveLength(0);
  });

  const untouched: [string, () => HTMLStyleElement][] = [
    ['an unknown rule', () => style('body { color: red; }')],
    ['a known rule plus url(', () => style(`${OVERSCROLL}\n.x { background: url(https://example.invalid/a.png); }`)],
    ['an @import', () => style(`@import "https://example.invalid/a.css";\n${OVERSCROLL}`)],
    ['the pressable rule under a foreign id', () => style(PRESS, { id: 'someone-else' })],
    ['a style with a nonce', () => style(OVERSCROLL, { nonce: 'abc' })],
  ];
  for (const [name, make] of untouched) {
    it(`passes ${name} through untouched`, () => {
      const el = make();
      document.head.prepend(el);
      expect(el.parentNode).toBe(document.head);
      expect(sheets).toHaveLength(0);
    });
  }

  it('leaves appendChild and non-style nodes alone', () => {
    const el = style(OVERSCROLL);
    document.head.appendChild(el);
    expect(el.parentNode).toBe(document.head);
    const meta = document.createElement('meta');
    document.head.prepend(meta, 'text');
    expect(meta.parentNode).toBe(document.head);
    expect(sheets).toHaveLength(0);
  });
});
