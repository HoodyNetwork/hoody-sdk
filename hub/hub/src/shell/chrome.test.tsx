// Focus mode: a page hides the shell chrome with useChromeHidden. The shell always
// brings it back: its own restore button, Esc when the chrome has the keyboard, and the page leaving.
// The page hears about a restore (onRestore), but the chrome comes back even if it never answers.
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { ChromeRestore, restoreChrome, useChromeHidden, useChromeIsHidden } from './chrome';
import { useGlobalKeys } from './keys';
import { usePageShortcuts } from './pageShortcuts';

const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(e);
  });
  return e;
};

function Probe({ seen }: { seen: { hidden: boolean } }) {
  seen.hidden = useChromeIsHidden();
  return null;
}

function Shell({ children }: { children?: React.ReactNode }) {
  useGlobalKeys([] as PageManifest[], { palette: () => {}, shortcuts: () => {}, toggleSidebar: () => {}, toggleAsk: () => {}, go: () => {} });
  return (
    <>
      {children}
      <ChromeRestore />
    </>
  );
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  act(() => restoreChrome());
});

describe('useChromeHidden', () => {
  it('hides while on, and the chrome is back when the page turns it off or leaves', () => {
    const seen = { hidden: false };
    render(<Probe seen={seen} />);
    const { rerender, unmount } = renderHook(({ on }) => useChromeHidden(on), { initialProps: { on: true } });
    expect(seen.hidden).toBe(true);
    rerender({ on: false });
    expect(seen.hidden).toBe(false);
    rerender({ on: true });
    expect(seen.hidden).toBe(true);
    unmount();
    expect(seen.hidden).toBe(false);
  });

  it('the restore button is shown only while hidden; it tells the page and brings the chrome back even if the page keeps asking', () => {
    const onRestore = vi.fn();
    const seen = { hidden: false };
    render(
      <Shell>
        <Probe seen={seen} />
      </Shell>,
    );
    expect(screen.queryByRole('button', { name: /leave focus mode/i })).toBeNull();
    const page = renderHook(() => useChromeHidden(true, onRestore));
    expect(seen.hidden).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Leave focus mode' }));
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(seen.hidden).toBe(false);
    page.rerender();
    expect(seen.hidden).toBe(false);
  });

  it('Esc restores when the chrome has the keyboard, before any page Esc key; not from a field or under a dialog', () => {
    const onRestore = vi.fn();
    const pageEsc = vi.fn();
    const seen = { hidden: false };
    function Page() {
      useChromeHidden(true, onRestore);
      usePageShortcuts([{ key: 'Escape', label: 'Restore the tile', run: pageEsc }]);
      return null;
    }
    render(
      <Shell>
        <Probe seen={seen} />
        <Page />
      </Shell>,
    );
    const input = document.createElement('input');
    document.body.append(input);
    press('Escape', {}, input);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    press('Escape');
    dialog.remove();
    expect(seen.hidden).toBe(true);
    press('Escape');
    expect(seen.hidden).toBe(false);
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(pageEsc).not.toHaveBeenCalled();
    press('Escape');
    expect(pageEsc).toHaveBeenCalledTimes(1);
  });
});
