// A program frame owns the keyboard. Keys whose target is an iframe, or anything inside an element
// marked data-hub-keys="frame" (the Board's entered program tile, its wrapper and header included), reach no global
// key and no page key; only a page chord marked whileTyping (the Board's Ctrl+Alt+B leave) still runs, as in a field.
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { frameOwnsKeys } from './keygate';
import { useGlobalKeys } from './keys';
import { type PageShortcut, usePageShortcuts } from './pageShortcuts';

const pages = [{ id: 'home', path: '/home' }] as unknown as PageManifest[];

const press = (key: string, init: KeyboardEventInit, target: EventTarget) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(e);
  });
  return e;
};

function Page({ keys }: { keys: PageShortcut[] }) {
  usePageShortcuts(keys);
  return null;
}
function Shell({ acts, keys }: { acts: Record<'palette' | 'shortcuts' | 'toggleSidebar' | 'toggleAsk' | 'go', () => void>; keys: PageShortcut[] }) {
  useGlobalKeys(pages, acts);
  return <Page keys={keys} />;
}

const mount = () => {
  const acts = { palette: vi.fn(), shortcuts: vi.fn(), toggleSidebar: vi.fn(), toggleAsk: vi.fn(), go: vi.fn() };
  const run = vi.fn();
  const leave = vi.fn();
  const keys: PageShortcut[] = [
    { key: 'x', label: 'Close tile', run },
    { key: 'Enter', label: 'Enter tile', run },
    { key: 'KeyZ', mods: ['mod'], label: 'Undo', run },
    { key: 'KeyB', mods: ['ctrl', 'alt'], whileTyping: true, label: 'Leave the frame', run: leave },
  ];
  render(<Shell acts={acts} keys={keys} />);
  return { acts, run, leave };
};

/** A Board-like tile: the marked root, its header button, and its frame. */
const tile = () => {
  const root = document.createElement('div');
  root.setAttribute('data-hub-keys', 'frame');
  const head = document.createElement('button');
  const frame = document.createElement('iframe');
  root.append(head, frame);
  document.body.append(root);
  return { root, head, frame };
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('a frame owns the keys', () => {
  it('keys typed on an entered tile (wrapper, header) or its iframe change nothing in the Hub', () => {
    const { acts, run } = mount();
    const t = tile();
    for (const target of [t.root, t.head, t.frame]) {
      for (const k of ['x', 'g', '/', '?', '[', 'Enter']) press(k, {}, target);
      press('h', {}, target); // after g: no jump
      press('k', { ctrlKey: true }, target);
      press('j', { ctrlKey: true }, target);
      press('z', { ctrlKey: true, code: 'KeyZ' } as KeyboardEventInit, target);
      press('r', { altKey: true, code: 'KeyR' } as KeyboardEventInit, target);
    }
    expect(run).not.toHaveBeenCalled();
    for (const f of Object.values(acts)) expect(f).not.toHaveBeenCalled();
  });

  it('the keys pressed there are left to the program (not claimed)', () => {
    mount();
    const t = tile();
    expect(press('x', {}, t.head).defaultPrevented).toBe(false);
    expect(press('k', { ctrlKey: true }, t.frame).defaultPrevented).toBe(false);
  });

  it('Escape on the entered tile reaches the Board\'s own leave handler, unclaimed', () => {
    const { acts, run } = mount();
    const t = tile();
    const seen: string[] = [];
    t.root.addEventListener('keydown', (e) => seen.push(e.key));
    for (const target of [t.root, t.head]) expect(press('Escape', {}, target).defaultPrevented).toBe(false);
    expect(seen).toEqual(['Escape', 'Escape']);
    expect(run).not.toHaveBeenCalled();
    for (const f of Object.values(acts)) expect(f).not.toHaveBeenCalled();
  });

  it('the Board\'s whileTyping leave chord still runs from inside the tile', () => {
    const { leave } = mount();
    const t = tile();
    press('b', { ctrlKey: true, altKey: true, code: 'KeyB' } as KeyboardEventInit, t.head);
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('outside a marked tile the same keys work as before', () => {
    const { acts, run } = mount();
    tile();
    press('x', {}, document.body);
    press('k', { ctrlKey: true }, document.body);
    expect(run).toHaveBeenCalledTimes(1);
    expect(acts.palette).toHaveBeenCalledTimes(1);
  });

  it('a bare iframe (no mark) keeps its keys too', () => {
    const { acts, run } = mount();
    const frame = document.createElement('iframe');
    document.body.append(frame);
    press('x', {}, frame);
    press('k', { ctrlKey: true }, frame);
    expect(run).not.toHaveBeenCalled();
    expect(acts.palette).not.toHaveBeenCalled();
  });

  it('a g pressed outside does not jump after a key the tile kept', () => {
    const { acts } = mount();
    const t = tile();
    press('g', {}, document.body);
    press('x', {}, t.head);
    press('h', {}, document.body);
    expect(acts.go).not.toHaveBeenCalled();
  });

  it('frameOwnsKeys: an iframe or anything under data-hub-keys="frame", nothing else', () => {
    const t = tile();
    const other = document.createElement('div');
    document.body.append(other);
    expect(frameOwnsKeys(t.frame)).toBe(true);
    expect(frameOwnsKeys(t.head)).toBe(true);
    expect(frameOwnsKeys(t.root)).toBe(true);
    expect(frameOwnsKeys(other)).toBe(false);
    expect(frameOwnsKeys(null)).toBe(false);
  });
});
