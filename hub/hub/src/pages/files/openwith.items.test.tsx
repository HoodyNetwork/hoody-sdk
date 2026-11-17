// Vitest: Files' Open with items. A row's menu offers Open in ‹last›, Open
// with… and Run (a regular file with its execute bit only); a folder's offers Open terminal here, Launch an app here and
// Open with…; all only while the computer runs, disabled with a reason without the right to run programs. The drawer
// gets a safe label, never the raw name.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { RowActionEntry } from '@kit';
import type * as Links from '../apps/links';
import { useReadActions } from './ReadActions';
import type { FilesComputer } from './data';
import type { Entry } from './logic';

const S = vi.hoisted(() => ({ running: true, can: true, last: null as null | { kind: 'tpl'; name: string } | { kind: 'cmd' }, opened: [] as unknown[], closed: 0 }));
vi.mock('../apps/links', async (orig) => ({
  ...(await orig<typeof Links>()),
  useOpenWithEntry: ({ running }: { running: boolean }) => ({
    running: running && S.running,
    can: S.can,
    lastFor: () => S.last,
    open: (a: unknown) => void S.opened.push(a),
    close: () => void S.closed++,
    overlay: null,
    top: () => null,
    studio: () => '',
  }),
}));

const c: FilesComputer = { id: 'b'.repeat(24), name: 'box', project_id: 'a'.repeat(24), server_name: 'n1', status: 'running', rules: 'open' } as FilesComputer;
const entry = (o: Partial<Entry>): Entry => ({ name: 'a b.txt', dir: false, size: 1, modified: null, lossy: false, ...o });
const ids = (rows: RowActionEntry[]) => rows.map((r) => (r === '-' ? '-' : r.id));
const item = (rows: RowActionEntry[], id: string) => rows.find((r): r is Exclude<RowActionEntry, '-'> => r !== '-' && r.id === id)!;
const actions = (comp: FilesComputer = c) => renderHook(() => useReadActions({ c: comp, path: '/home/user', canChange: true, onMove: () => undefined })).result.current;

beforeEach(() => {
  S.running = true;
  S.can = true;
  S.last = null;
  S.opened = [];
  S.closed = 0;
});

describe("Files' Open with items", () => {
  it('a file: Open with… after a separator; Run only for a regular file with its execute bit', () => {
    const a = actions();
    expect(ids(a.rowActions(entry({ type: 'file', exec: false })))).toEqual(['preview', 'download', 'view', 'edit', '-', 'ow-with']);
    expect(ids(a.rowActions(entry({ type: 'file', exec: true })))).toEqual(['preview', 'download', 'view', 'edit', '-', 'ow-with', 'ow-run']);
    expect(ids(a.rowActions(entry({ exec: true })))).not.toContain('ow-run');
    expect(ids(a.rowActions(entry({ type: 'symlink', exec: true })))).not.toContain('ow-run');
    expect(ids(a.rowActions(entry({ type: 'file', exec: null })))).not.toContain('ow-run');
  });

  it('a remembered choice adds Open in ‹it› first', () => {
    S.last = { kind: 'tpl', name: 'Nano' };
    const rows = actions().rowActions(entry({ type: 'file' }));
    expect(item(rows, 'ow-last').label).toBe('Open in Nano');
    expect(ids(rows).slice(-2)).toEqual(['ow-last', 'ow-with']);
  });

  it('a folder: Open terminal here, Launch an app here, Open with…', () => {
    expect(ids(actions().rowActions(entry({ name: 'src', dir: true, type: 'dir', size: null })))).toEqual(['zip', 'find-in', '-', 'ow-here', 'ow-apphere', 'ow-with']);
  });

  it('nothing while the computer is not running', () => {
    S.running = false;
    const a = actions();
    expect(ids(a.rowActions(entry({ type: 'file', exec: true })))).toEqual(['preview', 'download', 'view', 'edit']);
    expect(a.runHereItems()).toEqual([]);
  });

  it('without the right to run programs: shown, disabled, with the reason', () => {
    S.can = false;
    const w = item(actions().rowActions(entry({ type: 'file' })), 'ow-with');
    expect(w.isDisabled).toBe(true);
    expect(w.disabledReason).toBe("This key can't start programs on this computer.");
  });

  it('a name the program made lossy: disabled with that reason', () => {
    const w = item(actions().rowActions(entry({ name: 'a�.txt', lossy: true, type: 'file' })), 'ow-with');
    expect(w.isDisabled).toBe(true);
  });

  it('Open with… hands the drawer the path, a safe one-line label and the Files actions for this browser', () => {
    const name = 'a‮txt.exe\nx';
    item(actions().rowActions(entry({ name, type: 'file', exec: false })), 'ow-with').onAction!();
    expect(S.opened).toHaveLength(1);
    const a = S.opened[0] as { kind: string; file: { path: string; name: string; label: string; type: string; exec: boolean }; browser: { id: string }[] };
    expect(a.kind).toBe('choose');
    expect(a.file).toEqual({ path: `/home/user/${name}`, name, label: 'a\\u202Etxt.exe\\x0Ax', type: 'file', exec: false });
    expect(a.browser.map((b) => b.id)).toEqual(['preview', 'download', 'view', 'edit']);
  });

  it('Run here is the first group of the pane bar\'s More menu for the folder shown', () => {
    expect(ids(actions().runHereItems())).toEqual(['ow-here', 'ow-apphere']);
  });
  it('chooser_preview_handoff_closes_drawer: In this browser > Preview closes the drawer and opens the preview', () => {
    const h = renderHook(() => useReadActions({ c, path: '/home/user', canChange: true, onMove: () => undefined }));
    act(() => item(h.result.current.rowActions(entry({ type: 'file' })), 'ow-with').onAction!());
    const a = S.opened[0] as { browser: { id: string; onPress: () => void }[] };
    act(() => a.browser.find((b) => b.id === 'preview')!.onPress());
    expect(S.closed).toBe(1);
    expect((h.result.current.overlay as ReactElement<{ file: { name: string } }>).props.file.name).toBe('a b.txt');
  });

  it('the Preview: Open with… while running; without exec it stays, off with the reason; not running, nothing', () => {
    const previewOf = () => {
      const h = renderHook(() => useReadActions({ c, path: '/home/user', canChange: true, onMove: () => undefined }));
      act(() => item(h.result.current.rowActions(entry({ type: 'file' })), 'preview').onAction!());
      return (h.result.current.overlay as ReactElement<{ openWith: (d: boolean) => { top: unknown; choose: unknown; off?: string } }>).props.openWith(false);
    };
    expect(previewOf().choose).toBeInstanceOf(Function);
    S.can = false;
    expect(previewOf()).toEqual({ top: null, choose: null, off: "This key can't start programs on this computer." });
    S.running = false;
    expect(previewOf()).toEqual({ top: null, choose: null });
  });
});
