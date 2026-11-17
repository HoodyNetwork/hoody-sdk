// The toast column lifts above the controls that sit at the foot of the page on a phone: a dialog's (as before), the
// page's floating action button ([data-hub-fab]) and the Bot composer ([data-say-dock]), so a toast never covers them.
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster, closeToast, showToast } from './Toast';

const BOXES = new Map<Element, DOMRect>();
const rect = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
let key = '';
beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    // The region sits 28 px above the foot, raised by the lift the toasts set (as the CSS does).
    if (this.matches('[data-hub-toasts]')) {
      const lift = parseFloat((this as HTMLElement).style.getPropertyValue('--toast-lift')) || 0;
      return rect(16, 680 - lift, window.innerWidth - 16, 740 - lift);
    }
    return BOXES.get(this) ?? rect(0, 0, 0, 0);
  });
});
afterEach(() => {
  act(() => closeToast(key));
  BOXES.clear();
  vi.restoreAllMocks();
});
const frame = async () => {
  await act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  });
};
async function liftWith(obstacle: React.ReactNode) {
  const view = render(
    <>
      {obstacle}
      <Toaster />
    </>,
  );
  for (const b of view.container.querySelectorAll('[data-obstacle]')) BOXES.set(b, rect(window.innerWidth - 80, 690, window.innerWidth - 24, 740));
  act(() => {
    key = showToast({ tone: 'ok', title: 'Saved' });
  });
  const region = document.querySelector<HTMLElement>('[data-hub-toasts]')!;
  region.style.insetInlineEnd = '16px';
  window.dispatchEvent(new Event('resize'));
  await frame();
  await frame();
  return parseFloat(region.style.getPropertyValue('--toast-lift')) || 0;
}

describe('Toast lifts above controls at the foot of the page', () => {
  it('a dialog button (unchanged)', async () => {
    expect(await liftWith(<div role="dialog"><button type="button" data-obstacle="">OK</button></div>)).toBeGreaterThan(0);
  });
  it('the floating action button', async () => {
    expect(await liftWith(<div data-hub-fab=""><button type="button" data-obstacle="">New</button></div>)).toBeGreaterThan(0);
  });
  it('the Bot composer', async () => {
    expect(await liftWith(<div data-say-dock=""><textarea aria-label="Say" data-obstacle="" /></div>)).toBeGreaterThan(0);
  });
});
