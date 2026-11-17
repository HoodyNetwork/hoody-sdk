// The focus-mode restore button
// sits bottom-right, above page content the page names (the Board's chips row);
// touch screens of any width keep it at full opacity (its 44 px press is the kit IconButton xs's own,
// shell/chromerestore.spec.ts; a narrow window draws it 44); entering and leaving focus mode is
// announced; Alt+R / Alt+C never take a character typed in a field, an open overlay's keys, or act on
// hidden chrome; F6 and Shift+F6 stay the browser's.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { ChromeRestore, restoreChrome, useChromeHidden } from './chrome';
import { useGlobalKeys } from './keys';
import { useCurrentPageShortcuts, usePageShortcuts } from './pageShortcuts';
import type { PageShortcut } from './pageShortcuts';

// The stylesheet as written (a CSS module import gives class names, not the rules).
const css = readFileSync(join(import.meta.dirname, 'chrome.module.css'), 'utf8');

const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(e);
  });
  return e;
};

function Shell({ children }: { children?: React.ReactNode }) {
  useGlobalKeys([] as PageManifest[], { palette: () => {}, shortcuts: () => {}, toggleSidebar: () => {}, toggleAsk: () => {}, go: () => {} });
  return (
    <>
      {children}
      <ChromeRestore />
    </>
  );
}

/** The block of the first rule whose selector is exactly `sel` (outside any media query). */
function rule(sel: string): string {
  const at = css.indexOf(`\n${sel} {`);
  expect(at).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf('}', at));
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  act(() => restoreChrome());
});

describe('restore button placement and size', () => {
  it('sits bottom-right at the 8 px inset plus the lift a page asks for, never top-right', () => {
    // On a coarse pointer the inset is at least the kit's --xs-press-out (11 px), so the whole xs press is on screen.
    const r = rule('.restore');
    expect(r).toContain('inset-inline-end: max(var(--sp-2), var(--xs-press-out))');
    expect(r).toMatch(/inset-block-end: calc\(max\(var\(--sp-2\), var\(--xs-press-out\)\) \+ var\(--restore-lift, 0px\)\)/);
    expect(r).not.toContain('inset-block-start');
  });

  it('touch screens of any width keep full opacity, not only narrow ones', () => {
    const media = css.match(/@media ([^{]+)\{/g) ?? [];
    expect(media.some((m) => m.includes('pointer: coarse') && m.includes('hover: none') && m.includes('width < 768px'))).toBe(true);
  });

  it('the lift is the largest any hiding page asked for (the Board: its chips row)', () => {
    render(<ChromeRestore />);
    const a = renderHook(() => useChromeHidden(true, undefined, { lift: 44 }));
    const b = renderHook(() => useChromeHidden(true));
    const box = document.querySelector<HTMLElement>('[data-hub-chrome-restore]');
    expect(box?.style.getPropertyValue('--restore-lift')).toBe('44px');
    a.unmount();
    expect(document.querySelector<HTMLElement>('[data-hub-chrome-restore]')?.style.getPropertyValue('--restore-lift')).toBe('0px');
    b.unmount();
  });
});

describe('focus mode is announced', () => {
  it('says so politely when it starts and ends, and stays quiet at first load', () => {
    render(<ChromeRestore />);
    const live = screen.getByRole('status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live.textContent).toBe('');
    const h = renderHook(() => useChromeHidden(true));
    expect(live.textContent).toMatch(/Focus mode on/);
    h.unmount();
    expect(live.textContent).toMatch(/Focus mode off/);
  });
});

describe('Alt+R / Alt+C stay behind the typing, overlay and IME guards', () => {
  function withSwitch() {
    const click = vi.fn();
    const btn = document.createElement('button');
    btn.dataset.hubSwitch = 'realm';
    btn.addEventListener('click', click);
    document.body.appendChild(btn);
    return click;
  }

  it('opens the switcher from the page body', () => {
    render(<Shell />);
    const click = withSwitch();
    const e = press('r', { code: 'KeyR', altKey: true });
    expect(click).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it('Option+R typed in a field is the field’s (® on macOS)', () => {
    render(<Shell />);
    const click = withSwitch();
    const input = document.createElement('input');
    document.body.appendChild(input);
    const e = press('®', { code: 'KeyR', altKey: true }, input);
    expect(click).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it('not while composing, under an open dialog, with Shift, or in focus mode', () => {
    render(<Shell />);
    const click = withSwitch();
    press('r', { code: 'KeyR', altKey: true, isComposing: true });
    press('R', { code: 'KeyR', altKey: true, shiftKey: true });
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    press('r', { code: 'KeyR', altKey: true });
    dialog.remove();
    const h = renderHook(() => useChromeHidden(true));
    press('r', { code: 'KeyR', altKey: true });
    h.unmount();
    expect(click).not.toHaveBeenCalled();
  });
});

describe('F6 is the browser’s', () => {
  it('a page can take neither F6 nor Shift+F6', () => {
    const run = vi.fn();
    const keys: PageShortcut[] = [
      { key: 'F6', label: 'f6', run },
      { key: 'F6', mods: ['shift'], label: 'shift f6', run },
      { key: 'n', label: 'New', run: () => {} },
    ];
    let listed: readonly PageShortcut[] = [];
    function Page() {
      usePageShortcuts(keys);
      listed = useCurrentPageShortcuts();
      return null;
    }
    render(
      <Shell>
        <Page />
      </Shell>,
    );
    expect(listed.map((s) => s.label)).toEqual(['New']);
    press('F6', { code: 'F6' });
    press('F6', { code: 'F6', shiftKey: true });
    expect(run).not.toHaveBeenCalled();
  });
});
