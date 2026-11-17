// Vitest: a held copy whose source a fresh, whole listing
// proves gone (or no longer the kind that was copied) can never be checked, and it holds every change on its computer.
// Only then does its line offer Stop tracking: asked first (it may have gone through), it frees that one shown send
// (core dismissOne bound to its hold) and, only when this press freed it, leaves a note that the copy was not checked.
// It sends nothing and claims nothing. "Fresh" is an answer to a read this line saw start: an answer that arrives
// later to a read already running is not a proof. Until the source is proved gone, nothing changes.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { act, render, screen, userEvent, within } from '@app/testing';
import type * as Data from './data';
import { HeldBand } from './changes';
import ts from './Transfer.strings.en.json';

interface Read { entries: { name: string; dir: boolean }[]; whole?: boolean; at: number; error?: boolean; kept?: boolean; fetching?: boolean }
interface Only { hold?: string; transition?: { own: boolean } }
const h = vi.hoisted(() => ({
  held: [] as unknown[], read: [] as string[], stopped: [] as { identity: unknown; only: Only | undefined }[],
  /** what the core free answers: freed by this call, freed already elsewhere (true, not own), or nothing */
  free: 'own' as 'own' | 'elsewhere' | 'none', folders: {} as Record<string, Read>,
}));
vi.mock('./data', async (importOriginal) => {
  const m = await importOriginal<typeof Data>();
  return {
    ...m,
    useHeldOn: (id: string) => h.held.filter((x) => (x as { identity: { computer: string } }).identity.computer === id),
    useFilesChange: (kind: string) => ({
      readBack: () => { h.read.push(kind); return Promise.resolve(true); },
      dismissOne: (identity: unknown, only?: Only) => {
        h.stopped.push({ identity, only });
        if (h.free === 'none') return Promise.resolve(false);
        if (h.free === 'own' && only?.transition) only.transition.own = true;
        h.held = h.held.filter((x) => (x as { identity: unknown }).identity !== identity);
        return Promise.resolve(true);
      },
    }),
    verdictOf: () => undefined,
    useFolder: (_c: unknown, path: string) => {
      const r = h.folders[path];
      if (!r) return { data: undefined, isError: false, isFetching: false, dataUpdatedAt: 0 };
      const data = r.error && !r.kept ? undefined : { entries: r.entries, ...(r.whole !== undefined ? { whole: r.whole } : {}) };
      return { data, isError: !!r.error, isFetching: !!r.fetching, dataUpdatedAt: data ? r.at : 0 };
    },
    useFileHash: () => ({ data: undefined }),
    useCopyCheck: () => ({ walk: { state: 'reading', need: [] }, compare: null }),
  };
});

const ATLAS = { id: 'c-atlas', name: 'atlas' } as unknown as Data.FilesComputer;
const held = (kind: string, path: string, more: Record<string, unknown> = {}) => ({ hold: `${kind}:${path}#1`, at: 1, identity: { kind, computer: 'c-atlas', name: 'atlas', path, dir: false, size: 1, modified: 1, op: `op:${path}`, ...more } });
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const folderCopy = held('copy', '/home/ada/projects', { dir: true, dest: '/tmp/projects' });
const fileCopy = held('copy', '/home/ada/a.txt', { dest: '/tmp/a.txt' });
const stopButton = () => screen.queryByRole('button', { name: ts['held.stop'] });
const gone = (name = 'projects') => screen.queryByText(fill(ts['held.sourceGone'], { name, folder: '/home/ada' }), { exact: false });
/** A new element each draw: React skips a rerender of the very same element, so the mocked reads would not be seen. */
const band = (): ReactElement => <HeldBand c={ATLAS} />;

/** A read of /home/ada this line sees start, then its answer (`r`), drawn after each step. */
function readFresh(rerender: (ui: ReactElement) => void, r: Omit<Read, 'at' | 'fetching'>) {
  const before = h.folders['/home/ada'] ?? { entries: [], at: 0 };
  h.folders['/home/ada'] = { ...before, fetching: true };
  act(() => rerender(band()));
  h.folders['/home/ada'] = { ...r, at: Date.now() + 1_000, fetching: false };
  act(() => rerender(band()));
}

beforeEach(() => { h.held = []; h.read = []; h.stopped = []; h.free = 'own'; h.folders = {}; });

describe('a held copy whose source is gone: Stop tracking, asked first', () => {
  it('a fresh whole read without the source: Stop tracking, asked first; it frees exactly the shown send and notes it was not checked', async () => {
    h.held = [folderCopy, fileCopy];
    const { rerender } = render(band());
    readFresh(rerender, { entries: [{ name: 'a.txt', dir: false }], whole: true });
    // only the folder copy (its source is gone); the file copy's source is still there
    expect(screen.getAllByRole('button', { name: ts['held.stop'] })).toHaveLength(1);
    expect(gone()).toBeInTheDocument();
    await userEvent.click(stopButton()!);
    const dlg = await screen.findByRole('alertdialog', { name: ts['held.stopTitle'] });
    expect(dlg).toHaveTextContent(fill(ts['held.stopBody'], { dest: '/tmp/projects' }));
    expect(h.stopped).toEqual([]);
    await userEvent.click(within(dlg).getByRole('button', { name: ts['held.stop'] }));
    await vi.waitFor(() => expect(h.stopped).toHaveLength(1));
    // bound to the send this line showed, never a later send of the same identity
    expect(h.stopped[0]!.identity).toBe(folderCopy.identity);
    expect(h.stopped[0]!.only?.hold).toBe(folderCopy.hold);
    rerender(band());
    expect(await screen.findByText(fill(ts['held.unchecked'], { name: 'projects', dest: '/tmp/projects' }))).toBeInTheDocument();
    // nothing sent or read again; the file copy stays held, with no Stop tracking
    expect(h.read).toEqual([]);
    expect(screen.queryByText(fill(ts['held.copy'], { name: 'projects', dest: '/tmp/projects' }), { exact: false })).toBeNull();
    expect(screen.getByText(fill(ts['held.copy'], { name: 'a.txt', dest: '/tmp/a.txt' }), { exact: false })).toBeInTheDocument();
    expect(stopButton()).toBeNull();
  });

  it('cancelled: nothing is freed and the copy stays held', async () => {
    h.held = [folderCopy];
    const { rerender } = render(band());
    readFresh(rerender, { entries: [], whole: true });
    await userEvent.click(stopButton()!);
    const dlg = await screen.findByRole('alertdialog', { name: ts['held.stopTitle'] });
    await userEvent.click(within(dlg).getByRole('button', { name: /cancel/i }));
    expect(h.stopped).toEqual([]);
    expect(screen.getByText(fill(ts['held.copy'], { name: 'projects', dest: '/tmp/projects' }), { exact: false })).toBeInTheDocument();
  });

  it('the source turned into the other kind (a folder copy\'s source is now a file, a file copy\'s a folder): Stop tracking', () => {
    h.held = [folderCopy, fileCopy];
    const { rerender } = render(band());
    readFresh(rerender, { entries: [{ name: 'projects', dir: false }, { name: 'a.txt', dir: true }], whole: true });
    expect(screen.getAllByRole('button', { name: ts['held.stop'] })).toHaveLength(2);
    expect(screen.getByText(fill(ts['held.sourceChanged'], { name: 'projects', folder: '/home/ada' }), { exact: false })).toBeInTheDocument();
  });

  it('nothing proves it gone, so nothing changes: no Stop tracking', () => {
    h.held = [folderCopy];
    const fresh: Record<string, Omit<Read, 'at' | 'fetching'>> = {
      'still there': { entries: [{ name: 'projects', dir: true }], whole: true },
      'not whole': { entries: [], whole: false },
      'whole not stated': { entries: [] },
      'read failed': { entries: [], whole: true, error: true },
      // TanStack keeps the last answer when a later read fails: the newest read is not a proof
      'a later read failed (the earlier answer kept)': { entries: [], whole: true, error: true, kept: true },
    };
    for (const [why, r] of Object.entries(fresh)) {
      h.folders = {};
      const { rerender, unmount } = render(band());
      readFresh(rerender, r);
      expect(stopButton(), why).toBeNull();
      expect(gone(), why).toBeNull();
      unmount();
    }
  });

  it('an answer this line did not see asked for proves nothing: one cached before it showed, or one to a read already running', () => {
    h.held = [folderCopy];
    // cached (read before the line showed): absent and whole, but no read seen start
    h.folders = { '/home/ada': { entries: [], whole: true, at: Date.now() + 1_000 } };
    const a = render(band());
    expect(stopButton()).toBeNull();
    a.unmount();
    // a read already running when the line showed (it may have started before the send), answering later
    h.folders = { '/home/ada': { entries: [{ name: 'projects', dir: true }], whole: true, at: 0, fetching: true } };
    const b = render(band());
    h.folders = { '/home/ada': { entries: [], whole: true, at: Date.now() + 1_000 } };
    act(() => b.rerender(band()));
    expect(stopButton()).toBeNull();
    // a read it sees start that ends with no new answer (cancelled): the older answer is still not a proof
    h.folders = { '/home/ada': { entries: [], whole: true, at: 5, fetching: true } };
    act(() => b.rerender(band()));
    h.folders = { '/home/ada': { entries: [], whole: true, at: 5 } };
    act(() => b.rerender(band()));
    expect(stopButton()).toBeNull();
    // the next read it sees start, and its answer: now it proves it
    readFresh(b.rerender, { entries: [], whole: true });
    expect(stopButton()).not.toBeNull();
  });

  it('a read that ends with no new answer proves nothing, even when the older answer is from the very millisecond it started', () => {
    h.held = [folderCopy];
    const now = 50_000;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      h.folders = { '/home/ada': { entries: [], whole: true, at: now } };
      const { rerender } = render(band());
      h.folders = { '/home/ada': { entries: [], whole: true, at: now, fetching: true } };
      act(() => rerender(band()));
      h.folders = { '/home/ada': { entries: [], whole: true, at: now } };
      act(() => rerender(band()));
      expect(stopButton()).toBeNull();
      // a new answer (its time moved) to the next read it sees start does
      h.folders = { '/home/ada': { entries: [], whole: true, at: now, fetching: true } };
      act(() => rerender(band()));
      h.folders = { '/home/ada': { entries: [], whole: true, at: now + 1 } };
      act(() => rerender(band()));
      expect(stopButton()).not.toBeNull();
    } finally { clock.mockRestore(); }
  });

  it('a hold shown without its send token is never offered it (it could free a later send of the same copy)', () => {
    const { hold: _none, ...tokenless } = folderCopy;
    h.held = [tokenless];
    const { rerender } = render(band());
    readFresh(rerender, { entries: [], whole: true });
    expect(gone()).toBeInTheDocument();
    expect(stopButton()).toBeNull();
  });

  it('a move is never offered it (its read-back proves it either way)', () => {
    h.held = [held('move', '/home/ada/b.txt', { dest: '/tmp/b.txt' })];
    const { rerender } = render(band());
    readFresh(rerender, { entries: [], whole: true });
    expect(stopButton()).toBeNull();
  });

  for (const [why, free] of [['nothing was freed', 'none'], ['another tab freed it already (true, but not this press)', 'elsewhere']] as const) {
    it(`${why}: no note`, async () => {
      h.held = [folderCopy];
      h.free = free;
      const { rerender } = render(band());
      readFresh(rerender, { entries: [], whole: true });
      await userEvent.click(stopButton()!);
      const dlg = await screen.findByRole('alertdialog', { name: ts['held.stopTitle'] });
      await userEvent.click(within(dlg).getByRole('button', { name: ts['held.stop'] }));
      await vi.waitFor(() => expect(h.stopped).toHaveLength(1));
      await new Promise((r) => setTimeout(r, 20));
      rerender(band());
      expect(screen.queryByText(fill(ts['held.unchecked'], { name: 'projects', dest: '/tmp/projects' }))).toBeNull();
    });
  }
});
