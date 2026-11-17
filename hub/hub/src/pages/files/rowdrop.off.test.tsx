// Vitest: dragging rows while this key can't change files (computers.actions.exec off): the folder's table takes no
// drop at all, neither rows nor files from the computer, and no row drags.
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen, waitFor, within } from '@app/testing';
import type * as Core from '@core';
import { resetFiles } from './fixtures';
import { FILES_ROW, startRowDrag } from './rowdrag';
import page from './page';
import strings from './strings.en.json';

vi.mock('@core', async (importOriginal) => {
  const m = await importOriginal<typeof Core>();
  return { ...m, useCan: (cap: string) => (cap === 'computers.actions.exec' ? false : m.useCan(cap)) };
});

function fire(el: Element, type: string, types: string[], store: Record<string, string> = {}, files: File[] = []) {
  const dt = { types, dropEffect: 'unset', items: [], files, getData: (t: string) => store[t] ?? '' };
  const e = new MouseEvent(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'dataTransfer', { value: dt });
  act(() => {
    el.dispatchEvent(e);
  });
  return dt;
}

describe('changes off', () => {
  it('takes no drop and drags no row', async () => {
    resetFiles();
    await renderPage(page, { path: `/files?a=atlas.00a1&ap=${encodeURIComponent('/home/ada')}&b=atlas.00a1&bp=${encodeURIComponent('/tmp')}` });
    const a = await screen.findByRole('region', { name: strings['pane.a'] });
    const notes = (await within(a).findByText('notes.txt')).closest('[data-row-id]') as HTMLElement;
    expect(notes.hasAttribute('draggable')).toBe(false);
    const b = await screen.findByRole('region', { name: strings['pane.b'] });
    await waitFor(() => expect(b.querySelector('[data-drop-frame]')).not.toBeNull());
    const frame = b.querySelector('[data-drop-frame]') as HTMLElement;
    const files = fire(frame, 'dragover', ['Files']);
    expect(files.dropEffect).toBe('none');
    fire(frame, 'drop', ['Files'], {}, [new File(['x'], 'x.txt')]);
    // atlas's id (rowdrop.flow's first test reads it off a real drag): only changes being off refuses this.
    const payload = startRowDrag({ pane: 'a', computer: 'c0a7150000000000000000a1', folder: '/home/ada', items: [{ path: '/home/ada/notes.txt', name: 'notes.txt', dir: false, size: 1, modified: null }] }, true, () => true);
    const rows = fire(frame, 'dragover', [FILES_ROW]);
    expect(rows.dropEffect).toBe('none');
    fire(frame, 'drop', [FILES_ROW], { [FILES_ROW]: JSON.stringify(payload) });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
