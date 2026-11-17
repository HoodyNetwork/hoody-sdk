// Vitest: the held-changes band. Each change on this computer that may have gone through gets its own line with
// Check again, which only reads; there is no Dismiss (the kit offers none on "may have gone through", C9).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent, within } from '@app/testing';
import type * as Data from './data';
import { HeldBand } from './changes';
import strings from './strings.en.json';
import ts from './Transfer.strings.en.json';

const h = vi.hoisted(() => ({ held: [] as unknown[], read: [] as string[], verdicts: {} as Record<string, { verdict: string; there?: boolean }>, folders: {} as Record<string, { name: string; dir: boolean }[]>, compare: null as unknown, copyOn: [] as boolean[] }));
vi.mock('./data', async (importOriginal) => {
  const m = await importOriginal<typeof Data>();
  return {
    ...m,
    useHeldOn: (id: string) => h.held.filter((x) => (x as { identity: { computer: string } }).identity.computer === id),
    useFilesChange: (kind: string) => ({ readBack: () => { h.read.push(kind); return Promise.resolve(true); } }),
    verdictOf: (id: { op?: string }) => (id.op ? h.verdicts[id.op] : undefined),
    // A held copy or move mounts its reads; here they answer nothing (the band's own words are under test).
    useFolder: (_c: unknown, path: string) => ({ data: h.folders[path] ? { entries: h.folders[path] } : undefined, isError: false }),
    useFileHash: () => ({ data: undefined }),
    useCopyCheck: (_c: unknown, _src: string, _dest: string, on: boolean) => { h.copyOn.push(on); return { walk: { state: 'reading', need: [] }, compare: h.compare }; },
  };
});

const ATLAS = { id: 'c-atlas', name: 'atlas' } as unknown as Data.FilesComputer;
const held = (kind: string, computer: string, path: string, at: number, more: Record<string, unknown> = {}) => ({ hold: `${kind}${at}`, at, identity: { kind, computer, name: computer, path, dir: false, size: 1, modified: 1, ...more } });
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');

beforeEach(() => { h.held = []; h.read = []; h.verdicts = {}; h.folders = {}; h.compare = null; h.copyOn = []; });

describe('held changes band', () => {
  it('one line per held change here, each with Check again that reads, and no Dismiss', async () => {
    h.held = [held('delete', 'c-atlas', '/home/ada/a.txt', 3), held('rename', 'c-atlas', '/home/ada/b.txt', 2, { to: 'c.txt' }), held('mkdir', 'c-bolt', '/srv/new', 1)];
    render(<HeldBand c={ATLAS} />);
    const lines = screen.getAllByRole('alert');
    expect(lines).toHaveLength(2);
    expect(within(lines[0]!).getByText(fill(strings['held.delete'], { name: 'a.txt' }))).toBeInTheDocument();
    expect(within(lines[1]!).getByText(fill(strings['held.rename'], { name: 'b.txt', to: 'c.txt' }))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull();
    await userEvent.click(within(lines[1]!).getByRole('button', { name: /check again/i }));
    expect(h.read).toEqual(['rename']);
  });

  it('nothing held here: no band', () => {
    h.held = [held('mkdir', 'c-bolt', '/srv/new', 1)];
    const { container } = render(<HeldBand c={ATLAS} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('a copy or move a read proved NOT made leaves a note, each on its own, whatever else stays held', async () => {
    const a = held('copy', 'c-atlas', '/home/ada/a.txt', 3, { dest: '/tmp/a.txt', op: 'op-a' });
    const b = held('move', 'c-atlas', '/home/ada/b.txt', 2, { dest: '/tmp/b.txt', op: 'op-b' });
    const c = held('copy', 'c-atlas', '/home/ada/c.txt', 1, { dest: '/tmp/c.txt', op: 'op-c' });
    h.held = [a, b, c];
    const { rerender } = render(<HeldBand c={ATLAS} />);
    // a proved not made (nothing there), c proved made: only a's note; b stays held.
    h.verdicts = { 'op-a': { verdict: 'not_applied', there: false }, 'op-c': { verdict: 'applied' } };
    h.held = [b];
    rerender(<HeldBand c={ATLAS} />);
    expect(await screen.findByText(fill(ts['verdict.copyNone'], { folder: '/tmp' }))).toBeInTheDocument();
    expect(screen.getByText(fill(ts['held.move'], { name: 'b.txt', dest: '/tmp/b.txt' }))).toBeInTheDocument();
    expect(screen.queryByText(/c\.txt/)).toBeNull();
    // b then proved not made too: a second note beside the first.
    h.verdicts['op-b'] = { verdict: 'not_applied' };
    h.held = [];
    rerender(<HeldBand c={ATLAS} />);
    expect(await screen.findByText(fill(ts['verdict.moveNone'], { name: 'b.txt', folder: '/home/ada' }))).toBeInTheDocument();
    expect(screen.getByText(fill(ts['verdict.copyNone'], { folder: '/tmp' }))).toBeInTheDocument();
  });

  it('notes and what the band showed belong to their computer: another computer starts with none', async () => {
    const a = held('copy', 'c-atlas', '/home/ada/a.txt', 3, { dest: '/tmp/a.txt', op: 'op-a' });
    h.held = [a];
    const { rerender, container } = render(<HeldBand c={ATLAS} />);
    h.verdicts = { 'op-a': { verdict: 'not_applied', there: false } };
    h.held = [];
    rerender(<HeldBand c={ATLAS} />);
    expect(await screen.findByText(fill(ts['verdict.copyNone'], { folder: '/tmp' }))).toBeInTheDocument();
    rerender(<HeldBand c={{ ...ATLAS, id: 'c-bolt', name: 'bolt' } as Data.FilesComputer} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('a held folder copy compares only while both ends list as folders, and checks again once per compare result', async () => {
    h.held = [held('copy', 'c-atlas', '/home/ada/projects', 3, { dir: true, dest: '/tmp/projects', op: 'op-p' })];
    h.folders = { '/home/ada': [{ name: 'projects', dir: true }], '/tmp': [{ name: 'projects', dir: false }] };
    const { rerender } = render(<HeldBand c={ATLAS} />);
    // A file where the copy went: no tree read of a folder that is not there.
    expect(h.copyOn.length).toBeGreaterThan(0);
    expect(h.copyOn.every((on) => !on)).toBe(true);
    h.folders = { ...h.folders, '/tmp': [{ name: 'projects', dir: true }] };
    rerender(<HeldBand c={ATLAS} />);
    expect(h.copyOn.at(-1)).toBe(true);
    expect(h.read).toEqual([]);
    // A result: one check, however often the band draws again; a new result: one more.
    h.compare = { state: 'differs', count: 3, missing: [], different: [] };
    rerender(<HeldBand c={ATLAS} />);
    rerender(<HeldBand c={ATLAS} />);
    rerender(<HeldBand c={ATLAS} />);
    await vi.waitFor(() => expect(h.read).toEqual(['copy']));
    // A later count (the copy kept going) waits for Check again: each check re-reads every SHA-256.
    h.compare = { state: 'differs', count: 2, missing: [], different: [] };
    rerender(<HeldBand c={ATLAS} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(h.read).toEqual(['copy']);
    h.compare = { state: 'equal' };
    rerender(<HeldBand c={ATLAS} />);
    rerender(<HeldBand c={ATLAS} />);
    await vi.waitFor(() => expect(h.read).toEqual(['copy', 'copy']));
    await new Promise((r) => setTimeout(r, 50));
    expect(h.read).toEqual(['copy', 'copy']);
  });

  it('a change settled where this tab saw no verdict leaves no note (never shown as done or not done)', () => {
    h.held = [held('copy', 'c-atlas', '/home/ada/a.txt', 3, { dest: '/tmp/a.txt', op: 'op-a' })];
    const { rerender, container } = render(<HeldBand c={ATLAS} />);
    h.held = [];
    rerender(<HeldBand c={ATLAS} />);
    expect(container).toBeEmptyDOMElement();
  });
});
