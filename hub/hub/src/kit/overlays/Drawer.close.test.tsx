// Vitest: the Drawer's header has ONE close control in the DOM, never two of the same name hidden by a stylesheet:
// the × beside the title on a wide screen, the back arrow on a phone (under 600 px). While busy, whichever is drawn
// says why it waits.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Drawer } from './Overlays';
import strings from './strings.en.json';

function phoneViewport(phone: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (q: string) =>
      ({ matches: phone && q.includes('width < 600px'), media: q, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false }) as MediaQueryList,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

const header = () => document.querySelector('[role="dialog"] header') as HTMLElement;
const headerButtons = () => Array.from(header().querySelectorAll('button'));

describe('Drawer close control', () => {
  it.each([false, true])('phone %s: exactly one button named Close', (phone) => {
    phoneViewport(phone);
    render(
      <Drawer resizeKey="t-close-one" isOpen onOpenChange={() => undefined} title="Add a key">
        body
      </Drawer>,
    );
    expect(screen.getAllByRole('button', { name: strings.close })).toHaveLength(1);
  });

  it('wide: the close control is the × at the header end', () => {
    phoneViewport(false);
    render(
      <Drawer resizeKey="t-close-wide" isOpen onOpenChange={() => undefined} title="Add a key">
        body
      </Drawer>,
    );
    const close = screen.getByRole('button', { name: strings.close });
    expect(headerButtons().at(-1)).toBe(close);
  });

  it('phone: the close control is the back arrow at the header start', () => {
    phoneViewport(true);
    render(
      <Drawer resizeKey="t-close-phone" isOpen onOpenChange={() => undefined} title="Add a key">
        body
      </Drawer>,
    );
    const close = screen.getByRole('button', { name: strings.close });
    expect(headerButtons()[0]).toBe(close);
  });

  it.each([false, true])('phone %s, busy: the one close control keeps its name, stays reachable, says why and does not close', async (phone) => {
    phoneViewport(phone);
    const onOpenChange = vi.fn();
    render(
      <Drawer resizeKey="t-close-busy" isOpen onOpenChange={onOpenChange} title="Add a key" busy>
        body
      </Drawer>,
    );
    const close = screen.getByRole('button', { name: strings.close });
    // Soft-disabled: focusable, with its reason as its description, never a native disabled button that hides the reason.
    expect(close).not.toBeDisabled();
    expect(close).toHaveAttribute('aria-disabled', 'true');
    expect(close).toHaveAccessibleDescription(strings.busyHint);
    close.focus();
    expect(document.activeElement).toBe(close);
    await userEvent.click(close);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it.each([false, true])('phone %s: pressing the close control closes, and Escape does too', async (phone) => {
    phoneViewport(phone);
    const onOpenChange = vi.fn();
    const { unmount } = render(
      <Drawer resizeKey="t-close-press" isOpen onOpenChange={onOpenChange} title="Add a key">
        body
      </Drawer>,
    );
    await userEvent.click(screen.getByRole('button', { name: strings.close }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    unmount();
    const onEsc = vi.fn();
    render(
      <Drawer resizeKey="t-close-esc" isOpen onOpenChange={onEsc} title="Add a key">
        body
      </Drawer>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onEsc).toHaveBeenLastCalledWith(false);
  });
});
