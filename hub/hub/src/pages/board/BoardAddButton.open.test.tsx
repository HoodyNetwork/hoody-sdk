// Put on Board for one folder, file or note (the entry point Files' and Notes' rows use):
// BoardAddButton's `open` and useBoardAddEntry's `open` give the Board's Add link with that place; a place the tile
// cannot open, or `open` with a port or a new terminal, offers nothing.
import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Kit from '@kit';
import type { BoardOpen } from './links';

const S = vi.hoisted(() => ({ went: [] as string[] }));
vi.mock('@kit', async (orig) => {
  const real = await orig<typeof Kit>();
  return { ...real, useGo: () => (to: string) => void S.went.push(to), usePageLink: (id: string) => (id === 'board' ? { kind: 'hub' } : real.usePageLink(id)) };
});

const { BoardAddButton, useBoardAddEntry } = await import('./BoardAddButton');

const CID = 'b'.repeat(24);
const box = { id: CID, project: 'a'.repeat(24), server: 'n1' };
const USER = 'u0000000000000000000000a1';
const NODE = 'n0000000000000000000000b2';

beforeEach(() => { S.went = []; });

describe('Put on Board for one place', () => {
  it.each<[string, string, BoardOpen, string]>([
    ['a folder', 'files', { view: 'folder', path: '/srv/my app' }, `open=folder&at=%2Fsrv%2Fmy+app`],
    ['a file', 'files', { view: 'editor', path: '/etc/app.yml' }, `open=editor&at=%2Fetc%2Fapp.yml`],
    ['a note', 'notes', { view: 'node', userId: USER, nodeId: NODE }, `open=node&user=${USER}&node=${NODE}`],
  ])('%s: the button opens the Board with that place in its Add link', async (_, program, open, q) => {
    render(<BoardAddButton computer={box} program={program} open={open} what="It" />);
    await userEvent.click(screen.getByRole('button', { name: 'Put It on Board' }));
    expect(S.went).toEqual([`/board?add=${program}-1&cid=${CID}&${q}`]);
  });

  it('the row entry carries it too', () => {
    const h = renderHook(() => useBoardAddEntry());
    const [entry] = h.result.current(box, { program: 'notes', open: { view: 'node', userId: USER, nodeId: NODE } });
    entry!.onAction();
    expect(S.went).toEqual([`/board?add=notes-1&cid=${CID}&open=node&user=${USER}&node=${NODE}`]);
  });

  it.each<[string, { program?: string; session?: number | 'new'; port?: number; open: BoardOpen }]>([
    ['a note on a files tile', { program: 'files', open: { view: 'node', userId: USER, nodeId: NODE } }],
    ['a folder on a notes tile', { program: 'notes', open: { view: 'folder', path: '/srv' } }],
    ['a relative path', { program: 'files', open: { view: 'folder', path: 'srv' } }],
    ['a path with a line break', { program: 'files', open: { view: 'editor', path: '/srv/a\nb' } }],
    ['a path longer than the Board keeps', { program: 'files', open: { view: 'folder', path: '/' + 'a'.repeat(2100) } }],
    ['a note id that is not one', { program: 'notes', open: { view: 'node', userId: USER, nodeId: 'Not-An-Id' } }],
    ['a terminal', { program: 'terminal', open: { view: 'folder', path: '/srv' } }],
    ['a new terminal', { program: 'terminal', session: 'new', open: { view: 'folder', path: '/srv' } }],
    ['a web port', { port: 8080, open: { view: 'folder', path: '/srv' } }],
    ['files session 2', { program: 'files', session: 2, open: { view: 'folder', path: '/srv' } }],
  ])('%s: nothing is offered', (_, at) => {
    const h = renderHook(() => useBoardAddEntry());
    expect(h.result.current(box, at)).toEqual([]);
    const { container } = render(<BoardAddButton computer={box} {...at} what="It" />);
    expect(container.innerHTML).toBe('');
  });
});
