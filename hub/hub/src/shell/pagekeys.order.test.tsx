// Page keys and global keys share one order, whatever the effect order: global keys and the g-jump
// first, page keys after. On a fresh mount the page's effect runs before the shell's (child first), so
// these tests mount both together, the way the shell does.
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { useGlobalKeys } from './keys';
import { type PageShortcut, usePageShortcuts } from './pageShortcuts';

const pages = [{ id: 'logs', path: '/logs' }, { id: 'bots', path: '/bots' }] as unknown as PageManifest[];

const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) => {
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
function Shell({ go, keys }: { go: (p: string) => void; keys: PageShortcut[] }) {
  useGlobalKeys(pages, { palette: () => {}, shortcuts: () => {}, toggleSidebar: () => {}, toggleAsk: () => {}, go });
  return <Page keys={keys} />;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('page keys after global keys (fresh mount)', () => {
  it('g l jumps to Logs; the page key l does not run', () => {
    const go = vi.fn();
    const live = vi.fn();
    render(<Shell go={go} keys={[{ key: 'l', label: 'Live', run: live }]} />);
    press('g');
    press('l');
    expect(go).toHaveBeenCalledWith('/logs');
    expect(live).not.toHaveBeenCalled();
    press('l');
    expect(live).toHaveBeenCalledTimes(1);
  });

  it('g then a key that is no jump is spent: the page key does not run', () => {
    const go = vi.fn();
    const find = vi.fn();
    render(<Shell go={go} keys={[{ key: 'f', label: 'Find', run: find }]} />);
    press('g');
    press('f');
    expect(find).not.toHaveBeenCalled();
    expect(go).not.toHaveBeenCalled();
  });

  it('a page can never take a global key (?, /, [, g)', () => {
    const run = vi.fn();
    render(<Shell go={() => {}} keys={['?', '/', '[', 'g'].map((key) => ({ key, label: key, run }))} />);
    for (const k of ['?', '/', '[']) press(k);
    expect(run).not.toHaveBeenCalled();
  });

  it('no page key behind the phone More drawer or an open Select/ComboBox list', () => {
    const run = vi.fn();
    render(<Shell go={() => {}} keys={[{ key: 'n', label: 'New', run }]} />);
    const drawer = document.createElement('div');
    drawer.setAttribute('data-hub-overlay', '');
    document.body.append(drawer);
    press('n');
    drawer.remove();
    const pop = document.createElement('div');
    pop.setAttribute('data-trigger', 'Select');
    pop.innerHTML = '<div role="listbox"></div>';
    document.body.append(pop);
    press('n');
    pop.remove();
    expect(run).not.toHaveBeenCalled();
    press('n');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('Shift+Escape, IME composition and contenteditable do not run page keys', () => {
    const esc = vi.fn();
    const n = vi.fn();
    render(<Shell go={() => {}} keys={[{ key: 'Escape', label: 'Close', run: esc }, { key: 'n', label: 'New', run: n }]} />);
    press('Escape', { shiftKey: true });
    press('n', { isComposing: true });
    const ed = document.createElement('div');
    ed.contentEditable = 'true';
    document.body.append(ed);
    press('n', {}, ed);
    expect(esc).not.toHaveBeenCalled();
    expect(n).not.toHaveBeenCalled();
    press('Escape');
    expect(esc).toHaveBeenCalledTimes(1);
  });

  it('a page that left takes no keys', () => {
    const run = vi.fn();
    const { rerender } = render(<Shell go={() => {}} keys={[{ key: 'n', label: 'New', run }]} />);
    rerender(<Shell go={() => {}} keys={[]} />);
    press('n');
    expect(run).not.toHaveBeenCalled();
  });
});

describe('two parts declaring the same key', () => {
  it('the first-mounted part has it, and it is run once', () => {
    const a = vi.fn();
    const b = vi.fn();
    render(<Shell go={() => {}} keys={[{ key: 'n', label: 'New A', run: a }]} />);
    render(<Page keys={[{ key: 'n', label: 'New B', run: b }]} />);
    press('n');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });
});

describe('a sticky toast does not hold the keyboard', () => {
  it('with an open error or unknown toast (an alertdialog in the toast region), g l and page keys still work', () => {
    const go = vi.fn();
    const n = vi.fn();
    render(<Shell go={go} keys={[{ key: 'n', label: 'New', run: n }]} />);
    const region = document.createElement('div');
    region.setAttribute('role', 'region');
    region.innerHTML = '<div role="alertdialog" data-outcome="pending"></div>';
    document.body.append(region);
    press('g');
    press('l');
    press('n');
    expect(go).toHaveBeenCalledWith('/logs');
    expect(n).toHaveBeenCalledTimes(1);
  });
});
