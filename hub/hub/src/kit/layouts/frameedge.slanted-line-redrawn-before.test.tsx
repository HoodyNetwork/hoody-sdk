// Both writers of the slanted line (CutFrame, CardEdge) watch the frame itself and redraw the line inside the
// ResizeObserver callback, before the browser paints. A callback that updated React state would render after the
// paint, and the browser would show the line at its old size for a frame or more (a stray outline).
// The callbacks here run outside act() with the act environment off, as in the browser: a line that is not redrawn
// by the time the callback returns is a line the browser painted stale.
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardEdge } from './CardEdge';
import { CutFrame, cutFramePath } from './CutFrame';

const observers: { cb: () => void; targets: Element[] }[] = [];
let w = 420;
const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
let actEnv: boolean | undefined;

beforeEach(() => {
  observers.length = 0;
  w = 420;
  vi.stubGlobal('ResizeObserver', class {
    rec: { cb: () => void; targets: Element[] };
    constructor(cb: (e: unknown[]) => void) {
      this.rec = { cb: () => cb([]), targets: [] };
      observers.push(this.rec);
    }
    observe(el: Element) {
      this.rec.targets.push(el);
    }
    disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => w);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => 300);
  actEnv = env.IS_REACT_ACT_ENVIRONMENT;
});

afterEach(() => {
  env.IS_REACT_ACT_ENVIRONMENT = actEnv;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Resize, then run every observer callback the way the browser does: outside act(), with no flush after it. */
function resizeTo(width: number) {
  w = width;
  env.IS_REACT_ACT_ENVIRONMENT = false;
  for (const o of observers) o.cb();
}

describe('the slanted line is redrawn before paint', () => {
  it('CutFrame watches the frame itself and has its new line when the observer returns', () => {
    render(
      <CutFrame as="article" aria-label="plan">
        <p>inside</p>
      </CutFrame>,
    );
    const frame = document.querySelector('article')!;
    expect(observers.map((o) => o.targets)).toEqual([[frame]]);
    const path = () => frame.querySelector('[data-cut-edge] path')?.getAttribute('d');
    expect(path()).toBe(cutFramePath(420, 300, 16));
    resizeTo(512);
    expect(frame.querySelector('[data-cut-edge]')?.getAttribute('width')).toBe('512');
    expect(path()).toBe(cutFramePath(512, 300, 16));
  });

  it('CardEdge watches its card and has its new line when the observer returns', () => {
    render(
      <section data-card-cut="">
        <CardEdge />
      </section>,
    );
    const card = document.querySelector('section')!;
    expect(observers.map((o) => o.targets)).toEqual([[card]]);
    const svg = () => card.querySelector('[data-card-edge]')!;
    expect(svg().getAttribute('width')).toBe('420');
    resizeTo(260);
    expect(svg().getAttribute('width')).toBe('260');
    expect(svg().querySelector('path')?.getAttribute('d')).toBe(cutFramePath(260, 300, 16));
  });

  it('a card-table row edge watches its row', () => {
    render(
      <table>
        <tbody>
          <tr>
            <td>
              <CardEdge row />
            </td>
          </tr>
        </tbody>
      </table>,
    );
    expect(observers.map((o) => o.targets)).toEqual([[document.querySelector('tr')!]]);
    resizeTo(300);
    expect(document.querySelector('[data-card-edge]')?.getAttribute('width')).toBe('300');
  });
});
