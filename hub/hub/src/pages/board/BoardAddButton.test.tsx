// BoardAddButton: "Put on Board" beside a page's open-in-a-new-tab, through the Board's own Add link (links.ts
// boardAddPath), only where this Hub serves the Board and the Board can show that program of that computer.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Kit from '@kit';
import type * as Links from './links';

const S = vi.hoisted(() => ({ went: [] as string[], boardLink: { kind: 'hub' } as unknown, fits: true as boolean | 'real', asked: [] as Array<[string, number]> }));
vi.mock('@kit', async (orig) => {
  const real = await orig<typeof Kit>();
  return { ...real, useGo: () => (to: string) => void S.went.push(to), usePageLink: (id: string) => (id === 'board' ? S.boardLink : real.usePageLink(id)) };
});
vi.mock('./links', async (orig) => {
  const real = await orig<typeof Links>();
  return {
    ...real,
    tileHostFits: (...a: Parameters<typeof real.tileHostFits>) => { S.asked.push([a[0], a[1]]); return S.fits === 'real' ? real.tileHostFits(...a) : S.fits; },
  };
});

const { BoardAddButton, useBoardAddEntry } = await import('./BoardAddButton');
const realFits = (await vi.importActual<typeof Links>('./links')).tileHostFits;
const { renderHook } = await import('@testing-library/react');

const CID = 'b'.repeat(24);
const box = { id: CID, project: 'a'.repeat(24), server: 'n1' };

beforeEach(() => {
  S.went = [];
  S.boardLink = { kind: 'hub' };
  S.fits = true;
  S.asked = [];
});

describe('BoardAddButton', () => {
  it.each([
    ['agent', 'agent-1'],
    ['files', 'files-1'],
    ['browser', 'browser-1'],
    ['terminal', 'terminal-1'],
    ['notes', 'notes-1'],
    // The Computers pages call the display "screen".
    ['screen', 'display-1'],
  ])('%s: the press opens the Board with its Add link', async (program, add) => {
    render(<BoardAddButton computer={box} program={program} what="It" />);
    await userEvent.click(screen.getByRole('button', { name: 'Put It on Board' }));
    expect(S.went).toEqual([`/board?add=${add}&cid=${CID}`]);
  });
  it('a session other than 1 is carried', async () => {
    render(<BoardAddButton computer={box} program="terminal" session={3} what="Terminal 3" />);
    await userEvent.click(screen.getByRole('button', { name: 'Put Terminal 3 on Board' }));
    expect(S.went).toEqual([`/board?add=terminal-3&cid=${CID}`]);
  });
  it('a web port opens the Board with its port Add link', async () => {
    render(<BoardAddButton computer={box} port={8080} what="Port 8080" />);
    await userEvent.click(screen.getByRole('button', { name: 'Put Port 8080 on Board' }));
    expect(S.went).toEqual([`/board?add=port-8080&cid=${CID}`]);
  });
  it("core's Target works as the computer", async () => {
    render(<BoardAddButton computer={{ project: { id: box.project }, container: { id: CID, server_name: 'n1' } }} program="agent" what="Agent" />);
    await userEvent.click(screen.getByRole('button', { name: 'Put Agent on Board' }));
    expect(S.went).toEqual([`/board?add=agent-1&cid=${CID}`]);
  });
  it('the labelled form says Put on Board', async () => {
    render(<BoardAddButton computer={box} program="terminal" what="Terminal" labelled />);
    await userEvent.click(screen.getByRole('button', { name: 'Put on Board' }));
    expect(S.went).toEqual([`/board?add=terminal-1&cid=${CID}`]);
  });
  it('the named form says what it puts, as text (several side by side stay apart)', async () => {
    render(<BoardAddButton computer={box} program="code" what="Code" named />);
    const b = screen.getByRole('button', { name: 'Put Code on Board' });
    expect(b).toHaveTextContent('Put Code on Board');
    await userEvent.click(b);
    expect(S.went).toEqual([`/board?add=code-1&cid=${CID}`]);
  });
  it('isDisabled keeps it shown and unpressable', () => {
    render(<BoardAddButton computer={box} program="agent" what="Agent" isDisabled />);
    expect(screen.getByRole('button', { name: 'Put Agent on Board' })).toBeDisabled();
  });
  it.each([
    ['no Board in this Hub (a classic link cannot add a tile)', () => { S.boardLink = { kind: 'classic', href: 'https://x.invalid/board' }; }, box, 'agent', 1],
    ['no Board link at all', () => { S.boardLink = null; }, box, 'agent', 1],
    ['no computer', () => {}, null, 'agent', 1],
    ['a program the Board has no tile for', () => {}, box, 'ssh', 1],
    ['a one-instance program past session 1', () => {}, box, 'files', 2],
    ['a terminal whose host the Board cannot address', () => { S.fits = false; }, box, 'terminal', 1],
    ['no program and no port', () => {}, box, undefined, 1],
    ['a display whose host the Board cannot address', () => { S.fits = false; }, box, 'screen', 1],
  ] as const)('nothing when %s', (_n, arrange, computer, program, session) => {
    arrange();
    const { container } = render(<BoardAddButton computer={computer} {...(program ? { program } : {})} session={session} what="It" />);
    expect(container).toBeEmptyDOMElement();
  });
  it.each([
    ['a port the Board would not keep', { port: 70000 }],
    ['a port and a program at once', { port: 8080, program: 'agent' }],
  ])('nothing for %s', (_n, at) => {
    const { container } = render(<BoardAddButton computer={box} {...at} what="It" />);
    expect(container).toBeEmptyDOMElement();
  });
  it("a new terminal opens the Board's terminal-new Add link, its host measured at the highest number the Board may pick", async () => {
    render(<BoardAddButton computer={box} program="terminal" session="new" what="a new terminal" labelled />);
    await userEvent.click(screen.getByRole('button', { name: 'Put on Board' }));
    expect(S.went).toEqual([`/board?add=terminal-new&cid=${CID}`]);
    expect(S.asked).toEqual([['terminal', 8000]]);
  });
  it.each([
    ['its host cannot take the highest number', () => { S.fits = false; }, { program: 'terminal' }],
    ['a program other than terminal', () => {}, { program: 'agent' }],
    ['the screen (display)', () => {}, { program: 'screen' }],
    ['a web port', () => {}, { port: 8080 }],
  ] as const)('a new terminal shows nothing when %s', (_n, arrange, at) => {
    arrange();
    const { container } = render(<BoardAddButton computer={box} {...at} session="new" what="It" />);
    expect(container).toBeEmptyDOMElement();
  });
  it('a host that fits terminal 1 but not terminal 8000 offers terminal 1 and no new terminal (real host rule)', () => {
    S.fits = 'real';
    // The host label is <project>-<computer>-<segment>: a longer computer id leaves less room for the session number.
    const at = (id: string) => ({ id, project_id: box.project, server_name: 'n1' });
    let id = 'b';
    while (id.length < 63 && realFits('terminal', 1, at(id + 'b'))) id += 'b';
    expect(realFits('terminal', 1, at(id))).toBe(true);
    expect(realFits('terminal', 8000, at(id))).toBe(false);
    const c = { ...box, id };
    const { container, unmount } = render(<BoardAddButton computer={c} program="terminal" session="new" what="It" />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    render(<BoardAddButton computer={c} program="terminal" what="Terminal" />);
    expect(screen.getByRole('button', { name: 'Put Terminal on Board' })).toBeInTheDocument();
  });
  it('a web port is never host-checked (the Board shows its own refusal)', async () => {
    S.fits = false;
    render(<BoardAddButton computer={box} port={3000} what="Port 3000" />);
    expect(screen.getByRole('button', { name: 'Put Port 3000 on Board' })).toBeInTheDocument();
  });
});

describe('useBoardAddEntry', () => {
  it('one Put on Board entry that opens the Board with the same Add link', () => {
    const { result } = renderHook(() => useBoardAddEntry());
    const entries = result.current(box, { program: 'notes' });
    expect(entries.map((e) => [e.id, e.label, e.icon])).toEqual([['board', 'Put on Board', 'board']]);
    entries[0]?.onAction();
    expect(S.went).toEqual([`/board?add=notes-1&cid=${CID}`]);
  });
  it('a port, and a session, as the button takes them', () => {
    const { result } = renderHook(() => useBoardAddEntry());
    result.current(box, { port: 8080 })[0]?.onAction();
    result.current(box, { program: 'terminal', session: 2 })[0]?.onAction();
    result.current(box, { program: 'terminal', session: 'new' })[0]?.onAction();
    expect(S.went).toEqual([`/board?add=port-8080&cid=${CID}`, `/board?add=terminal-2&cid=${CID}`, `/board?add=terminal-new&cid=${CID}`]);
  });
  it.each([
    ['no Board in this Hub', () => { S.boardLink = { kind: 'classic', href: 'https://x.invalid/board' }; }, box, { program: 'agent' }],
    ['no computer', () => {}, undefined, { program: 'agent' }],
    ['a program the Board has no tile for', () => {}, box, { program: 'ssh' }],
    ['a terminal whose host the Board cannot address', () => { S.fits = false; }, box, { program: 'terminal' }],
  ] as const)('no entry when %s', (_n, arrange, computer, at) => {
    arrange();
    const { result } = renderHook(() => useBoardAddEntry());
    expect(result.current(computer, at)).toEqual([]);
  });
});
