// Page chords: `mods` + a KeyboardEvent.code, so the keyboard layout does not matter.
// Exact modifiers; the shell's own chords are refused; only Ctrl+Alt+B may work while typing; on an
// AltGr layout a printed character in a field is not the chord; Enter, Space and arrows stay with a
// focused control.
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { useGlobalKeys } from './keys';
import { type PageShortcut, pageShortcutKeys, useCurrentPageShortcuts, usePageShortcuts } from './pageShortcuts';
import { ShortcutsSheet } from './ShortcutsSheet';

const pages = [{ id: 'logs', path: '/logs' }] as unknown as PageManifest[];

const press = (init: KeyboardEventInit, target: EventTarget = document.body) => {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(e);
  });
  return e;
};

function Shell({ keys }: { keys: PageShortcut[] }) {
  useGlobalKeys(pages, { palette: () => {}, shortcuts: () => {}, toggleSidebar: () => {}, toggleAsk: () => {}, go: () => {} });
  usePageShortcuts(keys);
  return null;
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('page chords', () => {
  it('Ctrl+Alt+B matches by code, whatever the layout prints', () => {
    const run = vi.fn();
    render(<Shell keys={[{ key: 'KeyB', mods: ['ctrl', 'alt'], label: 'Leave the tile', run }]} />);
    const e = press({ key: '∫', code: 'KeyB', ctrlKey: true, altKey: true });
    expect(run).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it('modifiers must match exactly; plain b and Ctrl+B are not Ctrl+Alt+B', () => {
    const run = vi.fn();
    render(<Shell keys={[{ key: 'KeyB', mods: ['ctrl', 'alt'], label: 'Leave', run }]} />);
    press({ key: 'b', code: 'KeyB' });
    press({ key: 'b', code: 'KeyB', ctrlKey: true });
    press({ key: 'B', code: 'KeyB', ctrlKey: true, altKey: true, shiftKey: true });
    expect(run).not.toHaveBeenCalled();
  });

  it('Shift+arrow and Alt+Shift+arrow are their own chords', () => {
    const swap = vi.fn();
    const grow = vi.fn();
    render(<Shell keys={[{ key: 'ArrowLeft', mods: ['shift'], label: 'Swap left', run: swap }, { key: 'ArrowLeft', mods: ['alt', 'shift'], label: 'Grow left', run: grow }]} />);
    press({ key: 'ArrowLeft', code: 'ArrowLeft', shiftKey: true });
    press({ key: 'ArrowLeft', code: 'ArrowLeft', shiftKey: true, altKey: true });
    expect(swap).toHaveBeenCalledTimes(1);
    expect(grow).toHaveBeenCalledTimes(1);
  });

  it('mod is Ctrl off Apple (Ctrl+Z undo), never inside a field', () => {
    const undo = vi.fn();
    render(<Shell keys={[{ key: 'KeyZ', mods: ['mod'], label: 'Undo', run: undo }]} />);
    press({ key: 'z', code: 'KeyZ', ctrlKey: true });
    const input = document.createElement('input');
    document.body.append(input);
    press({ key: 'z', code: 'KeyZ', ctrlKey: true }, input);
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('only Ctrl+Alt+B with whileTyping works in a field; whileTyping on any other chord is ignored', () => {
    const leave = vi.fn();
    const other = vi.fn();
    render(<Shell keys={[{ key: 'KeyB', mods: ['ctrl', 'alt'], label: 'Leave', run: leave, whileTyping: true }, { key: 'BracketLeft', mods: ['ctrl', 'alt'], label: 'Previous Board', run: other, whileTyping: true }]} />);
    const input = document.createElement('textarea');
    document.body.append(input);
    press({ key: 'b', code: 'KeyB', ctrlKey: true, altKey: true }, input);
    press({ key: '[', code: 'BracketLeft', ctrlKey: true, altKey: true }, input);
    expect(leave).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
  });

  it('AltGr: a printed character in a field other than the bound letter is not the chord', () => {
    const leave = vi.fn();
    render(<Shell keys={[{ key: 'KeyB', mods: ['ctrl', 'alt'], label: 'Leave', run: leave, whileTyping: true }]} />);
    const input = document.createElement('input');
    document.body.append(input);
    press({ key: '{', code: 'KeyB', ctrlKey: true, altKey: true }, input);
    expect(leave).not.toHaveBeenCalled();
  });

  it('the shell\'s own chords are refused: never run, never listed', () => {
    const run = vi.fn();
    const shell: PageShortcut[] = [
      { key: 'KeyK', mods: ['mod'], label: 'k', run },
      { key: 'KeyJ', mods: ['ctrl'], label: 'j', run },
      { key: 'KeyR', mods: ['alt'], label: 'r', run },
      { key: 'KeyC', mods: ['alt'], label: 'c', run },
      { key: '[', label: 'bracket', run },
      { key: 'g', label: 'g', run },
      { key: '?', label: 'q', run },
    ];
    render(<Shell keys={[...shell, { key: 'n', label: 'New', run: () => {} }]} />);
    const listed = (() => {
      let out: readonly PageShortcut[] = [];
      function Probe() {
        out = useCurrentPageShortcuts();
        return null;
      }
      render(<Probe />);
      return out;
    })();
    expect(listed.map((s) => s.label)).toEqual(['New']);
    press({ key: '[', code: 'BracketLeft' });
    expect(run).not.toHaveBeenCalled();
  });

  it('Enter, Space and arrows stay with a focused button or tab; on the page body they run', () => {
    const enter = vi.fn();
    const left = vi.fn();
    render(<Shell keys={[{ key: 'Enter', label: 'Enter the tile', run: enter }, { key: 'ArrowLeft', label: 'Left', run: left }]} />);
    const btn = document.createElement('button');
    const tab = document.createElement('div');
    tab.setAttribute('role', 'tab');
    document.body.append(btn, tab);
    expect(press({ key: 'Enter', code: 'Enter' }, btn).defaultPrevented).toBe(false);
    press({ key: 'ArrowLeft', code: 'ArrowLeft' }, tab);
    expect(enter).not.toHaveBeenCalled();
    expect(left).not.toHaveBeenCalled();
    press({ key: 'Enter', code: 'Enter' });
    press({ key: 'ArrowLeft', code: 'ArrowLeft' });
    expect(enter).toHaveBeenCalledTimes(1);
    expect(left).toHaveBeenCalledTimes(1);
  });

  it('the ? sheet shows a chord as its keys', () => {
    expect(pageShortcutKeys({ key: 'KeyB', mods: ['ctrl', 'alt'], label: 'x', run: () => {} })).toEqual(['Ctrl', 'Alt', 'B']);
    expect(pageShortcutKeys({ key: 'ArrowLeft', mods: ['alt', 'shift'], label: 'x', run: () => {} })).toEqual(['Alt', 'Shift', '←']);
    expect(pageShortcutKeys({ key: 'Escape', label: 'x', run: () => {} })).toEqual(['Esc']);
    render(<Shell keys={[{ key: 'KeyB', mods: ['ctrl', 'alt'], label: 'Leave the tile', run: () => {} }]} />);
    render(<ShortcutsSheet isOpen onOpenChange={() => {}} />);
    const row = screen.getByText('Leave the tile').closest('div');
    expect(row?.textContent).toContain('CtrlAltB');
  });
});
