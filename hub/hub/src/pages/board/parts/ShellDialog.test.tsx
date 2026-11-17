// Vitest: Change shell on core's fixture transport. What is sent and in which order, each send at most
// once, how an unknown outcome is read back (never resent, and Check again never sends; an unknown ending is never
// settled as "did not"),
// and that it outlives the dialog (reopening, and the sticky notice's Check again).
import { answers, boardFixtureRoute, bootFixtureCore, fixtureWorld, reply, type FixtureAnswer, type FixtureRequest } from '@core';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, Suspense, use, useState, useTransition } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BoardComputer } from '../computers';
import { SESSIONS_PATH } from '../termSessions';
import { afterEnd, afterStart, sameTerminal, started, tilesShowing } from './shellChange';
import { resetShellChanges, ShellDialog } from './ShellDialog';
import { commit, generation, reserve, type Held } from './shellChanges';
import boardStrings from '../strings.en.json';
// Toast titles come from the strings file (a reworded or re-punctuated string needs no test edit).
const said = (k: keyof typeof boardStrings, v: Record<string, string>): string => boardStrings[k].replace(/\{\{(\w+)\}\}/g, (_, x: string) => v[x] ?? '');

// Every toast, the kit's own sticky notice included (its Check again is kept to press).
const toasts: string[] = [];
const checks: Array<() => unknown> = [];
vi.mock('@kit/states/Toast', async (orig) => {
  const m = await orig<Record<string, unknown>>();
  return { ...m, showToast: (c: { title: string; action?: { onAction: () => unknown } }) => { toasts.push(c.title); if (c.action) checks.push(c.action.onAction); return 'toast-1'; }, closeToast: () => undefined };
});
afterEach(async () => {
  // Unmount first: a dialog left on an unknown outcome posts its sticky notice a tick later.
  cleanup();
  await new Promise((r) => setTimeout(r, 0));
  toasts.length = 0; checks.length = 0; resetShellChanges(); vi.restoreAllMocks();
});

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const computer = { id: atlas.id, name: atlas.name, project_id: atlas.project_id, server_name: atlas.server_name, status: 'running' } as BoardComputer;
const INC_A = 'a'.repeat(32), INC_B = 'b'.repeat(32);
const sess = (o: Record<string, unknown>) => ({ terminal_id: '3', shell: 'bash', is_active: true, daemon_program: false, is_ephemeral: false, client_count: 1, incarnation: INC_A, ...o });

interface World { sessions: () => FixtureAnswer | Promise<FixtureAnswer>; end: FixtureAnswer | Promise<FixtureAnswer>; start: FixtureAnswer | Promise<FixtureAnswer> }
const sent: Array<{ method: string; path: string; query: Readonly<Record<string, string>>; body: unknown }> = [];
const log = (req: FixtureRequest) => { sent.push({ method: req.method, path: req.path, query: req.query, body: req.body }); };
const methods = () => sent.filter((x) => x.method !== 'GET').map((x) => x.method);

function open(w: Partial<World>) {
  sent.length = 0;
  const world: World = { sessions: () => answers.ok([sess({})]), end: answers.ok({ success: true }), start: answers.ok({ success: true, incarnation: INC_B }), ...w };
  bootFixtureCore({
    rules: [
      reply(boardFixtureRoute('terminal', 'GET', SESSIONS_PATH), (req) => { log(req); return world.sessions(); }),
      reply(boardFixtureRoute('terminal', 'DELETE', '/api/v1/terminal/3'), (req) => { log(req); return world.end; }),
      reply(boardFixtureRoute('terminal', 'POST', '/api/v1/terminal/create'), (req) => { log(req); return world.start; }),
    ],
  });
  const onClose = vi.fn(), onChanged = vi.fn();
  const target = { computer, session: 3, name: 'terminal-3' };
  const view = render(<ShellDialog target={target} onClose={onClose} onChanged={onChanged} />);
  // The person closes it (Cancel), and the page drops the target as BoardView does.
  const close = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    view.rerender(<ShellDialog target={null} onClose={onClose} onChanged={onChanged} />);
  };
  const reopen = () => view.rerender(<ShellDialog target={target} onClose={onClose} onChanged={onChanged} />);
  return { onClose, onChanged, world, close, reopen, unmount: view.unmount };
}
const dialog = () => screen.getByRole('dialog');
async function pick(user: ReturnType<typeof userEvent.setup>, shell: string) {
  await user.click(await screen.findByRole('radio', { name: shell }));
  await user.click(within(dialog()).getByRole('button', { name: 'End it and change' }));
}

describe('shellChange: which frames a settled change reloads', () => {
  const tile = (computer: string, session: number, o: Record<string, unknown> = {}) => ({ project: 'p1', computer, program: 'terminal' as const, session, ...o });
  it('only plain terminal tiles of that computer and number; an ssh tile, another number, computer or program is left alone', () => {
    const tiles = {
      a: tile('c1', 3), b: tile('c1', 4), c: tile('c2', 3), d: tile('c1', 3, { program: 'files' }),
      e: tile('c1', 3, { ssh: { host: 'db.example.com', user: 'ops', port: 22 } }), f: null, g: tile('c1', 3, { name: 'mine' }),
    };
    expect(tilesShowing(tiles, { computer: 'c1', session: 3 })).toEqual(['a', 'g']);
    expect(tilesShowing(tiles, { computer: 'c9', session: 3 })).toEqual([]);
  });
  it('a program view still shows it only on the same computer and number', () => {
    expect(sameTerminal({ computer: 'c1', session: 3 }, { computer: 'c1', session: 3 })).toBe(true);
    expect(sameTerminal({ computer: 'c1', session: 4 }, { computer: 'c1', session: 3 })).toBe(false);
    expect(sameTerminal({ computer: 'c2', session: 3 }, { computer: 'c1', session: 3 })).toBe(false);
    expect(sameTerminal(null, { computer: 'c1', session: 3 })).toBe(false);
  });
});

describe('shellChange: reading back an unknown outcome', () => {
  const row = (o: Partial<{ n: number; shell: string | null; ssh: string | null; offered: boolean; incarnation: string | null; running: boolean }>) => ({ n: 3, offered: true, shell: 'bash', cwd: null, ssh: null, viewers: 0, lastActivity: null, running: true, incarnation: INC_A, sshTo: null, ...o });
  it('an ending: gone, the same shell, another shell, or not known', () => {
    expect(afterEnd(3, row({}), [row({ n: 4 })])).toBe('gone');
    expect(afterEnd(3, row({}), [row({})])).toBe('same');
    expect(afterEnd(3, row({}), [row({ incarnation: INC_B })])).toBe('reopened');
    expect(afterEnd(3, row({ incarnation: null }), [row({})])).toBe('unknown');
    expect(afterEnd(3, null, [row({})])).toBe('unknown');
    expect(afterEnd(3, row({}), [row({ incarnation: null })])).toBe('unknown');
  });
  it('a start: that shell runs, nothing is there, or something else is (ssh, a program, another shell)', () => {
    expect(afterStart(3, 'zsh', [row({ shell: 'zsh' })])).toBe('started');
    expect(afterStart(3, 'zsh', [row({ n: 2, shell: 'zsh' })])).toBe('absent');
    expect(afterStart(3, 'zsh', [row({ shell: 'bash' })])).toBe('other');
    expect(afterStart(3, 'zsh', [row({ shell: 'zsh', ssh: 'u@h' })])).toBe('other');
    expect(afterStart(3, 'zsh', [row({ shell: 'zsh', offered: false })])).toBe('other');
    expect(afterStart(3, 'zsh', [row({ shell: 'zsh', running: false })])).toBe('ended');
  });
  it('a create answered "already there" did not start this shell; any other success did', () => {
    expect([started({ success: true, code: 'already_active' }), started({ success: true }), started(null), started({ code: 'created' })]).toEqual([false, true, true, true]);
  });
});

describe('ShellDialog', () => {
  it('says what runs now, offers the other shells, then ends terminal-3 and starts it on the pick: the tile reloads once', async () => {
    const user = userEvent.setup();
    const { onClose, onChanged } = open({});
    expect(await within(dialog()).findByText(/terminal-3 runs bash now\./)).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual(['zsh', 'fish', 'sh']);
    expect(within(dialog()).getByRole('button', { name: 'End it and change' })).toBeDisabled();
    await pick(user, 'zsh');
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(sent.filter((x) => x.method !== 'GET')).toEqual([
      { method: 'DELETE', path: expect.stringMatching(/\/api\/v1\/terminal\/3$/), query: { incarnation: INC_A }, body: null },
      { method: 'POST', path: expect.stringMatching(/\/api\/v1\/terminal\/create$/), query: { terminal_id: '3' }, body: { terminal_id: 3, exclusive: true, shell: 'zsh' } },
    ]);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(toasts).toEqual([said('shell.done', { name: 'terminal-3', shell: 'zsh' })]);
  });

  it('a program\'s own terminal has no shell to change: no action', async () => {
    open({ sessions: () => answers.ok([sess({ daemon_program: true, shell: null })]) });
    expect(await within(dialog()).findByText(/a program's own terminal/)).toBeInTheDocument();
    expect(within(dialog()).queryByRole('button', { name: 'End it and change' })).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('when the sessions cannot be read, every shell is offered; the change reads again and sends nothing until it names the shell it ends', async () => {
    const user = userEvent.setup();
    const { world, onClose } = open({ sessions: () => answers.refused(500, 'SERVER_ERROR') });
    await waitFor(() => expect(screen.getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual(['bash', 'zsh', 'fish', 'sh']));
    expect(within(dialog()).queryByText(/runs bash now/)).toBeNull();
    await pick(user, 'zsh');
    expect(await within(dialog()).findByText('The sessions on this computer could not be read, so nothing was sent. Try again.')).toBeInTheDocument();
    expect(methods()).toEqual([]);
    world.sessions = () => answers.ok([sess({})]);
    await user.click(within(dialog()).getByRole('button', { name: 'End it and change' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sent.filter((x) => x.method !== 'GET').map((x) => [x.method, x.query])).toEqual([['DELETE', { incarnation: INC_A }], ['POST', { terminal_id: '3' }]]);
  });

  it('terminal-3 not listed when the change reads again: nothing to end, only the start', async () => {
    const user = userEvent.setup();
    const { onClose } = open({ sessions: () => answers.ok([]) });
    await pick(user, 'zsh');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(methods()).toEqual(['POST']);
  });

  it('terminal-3 listed without a running shell (no incarnation): nothing is ended and nothing is sent', async () => {
    const user = userEvent.setup();
    const { onChanged } = open({ sessions: () => answers.ok([sess({ is_active: false, incarnation: null })]) });
    await pick(user, 'zsh');
    expect(await within(dialog()).findByText('No shell runs in terminal-3 now, so there is nothing to end and nothing was sent. Open a new terminal instead.')).toBeInTheDocument();
    expect(methods()).toEqual([]);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('the ending names the shell read at open: terminal-3 started again since then answers "replaced", nothing ends or starts, and it keeps what it runs', async () => {
    const user = userEvent.setup();
    const { onChanged, onClose } = open({ end: answers.refused(409, 'INCARNATION_MISMATCH') });
    await pick(user, 'zsh');
    expect(await within(dialog()).findByText('terminal-3 was started again since this opened, so it was not ended: it keeps the shell it has now.')).toBeInTheDocument();
    expect(sent.filter((x) => x.method !== 'GET').map((x) => [x.method, x.query])).toEqual([['DELETE', { incarnation: INC_A }]]);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    // It reads again (the shell read at open is gone), then gives the action back.
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: 'End it and change' })).toBeEnabled());
  });

  it('closing and opening again while the ending is unanswered: shown as unknown, no second ending can leave, and the late answer changes nothing the check settled', async () => {
    const user = userEvent.setup();
    let answer: (a: FixtureAnswer) => void = () => undefined;
    const { world, close, reopen, onClose } = open({ end: new Promise<FixtureAnswer>((r) => { answer = r; }) });
    await pick(user, 'zsh');
    await waitFor(() => expect(methods()).toEqual(['DELETE']));
    await close(user);
    reopen();
    expect(await within(dialog()).findByText(/Ending terminal-3 may have gone through/)).toBeInTheDocument();
    expect(within(dialog()).getByRole('button', { name: 'End it and change' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'zsh' })).toBeChecked();
    // Gone now: the ending names the old shell, so the start may go ahead on a press; the late answer is the old send's own.
    world.sessions = () => answers.ok([]);
    await user.click(within(dialog()).getByRole('button', { name: /Check again/ }));
    await user.click(await within(dialog()).findByRole('button', { name: 'Start zsh' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    answer(answers.ok({ success: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(methods()).toEqual(['DELETE', 'POST']);
  });

  it('a remount while the start is unanswered shows it as unknown: no second start can leave', async () => {
    const user = userEvent.setup();
    let answer: (a: FixtureAnswer) => void = () => undefined;
    const { close, reopen } = open({ start: new Promise<FixtureAnswer>((r) => { answer = r; }) });
    await pick(user, 'zsh');
    await waitFor(() => expect(methods()).toEqual(['DELETE', 'POST']));
    await close(user);
    reopen();
    expect(await within(dialog()).findByText(/Starting the new shell may have gone through/)).toBeInTheDocument();
    expect(within(dialog()).getByRole('button', { name: 'End it and change' })).toBeDisabled();
    expect(within(dialog()).queryByRole('button', { name: 'Start again' })).toBeNull();
    answer(answers.pending5xx());
    await new Promise((r) => setTimeout(r, 0));
    expect(methods()).toEqual(['DELETE', 'POST']);
  });

  it('a dialog mounted fresh while a start is unanswered shows it as unknown at once', async () => {
    const user = userEvent.setup();
    open({ start: new Promise<FixtureAnswer>(() => undefined) });
    await pick(user, 'zsh');
    await waitFor(() => expect(methods()).toEqual(['DELETE', 'POST']));
    cleanup();
    render(<ShellDialog target={{ computer, session: 3, name: 'terminal-3' }} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(await within(dialog()).findByText(/Starting the new shell may have gone through/)).toBeInTheDocument();
    expect(methods()).toEqual(['DELETE', 'POST']);
  });

  it('a start that fails late, after a check settled it, records nothing: the next dialog offers the change again', async () => {
    const user = userEvent.setup();
    let answer: (a: FixtureAnswer) => void = () => undefined;
    const { world, close, reopen, onClose } = open({ start: new Promise<FixtureAnswer>((r) => { answer = r; }) });
    await pick(user, 'zsh');
    await waitFor(() => expect(methods()).toEqual(['DELETE', 'POST']));
    await close(user);
    reopen();
    await within(dialog()).findByText(/Starting the new shell may have gone through/);
    world.sessions = () => answers.ok([sess({ shell: 'zsh', incarnation: INC_B })]);
    await user.click(within(dialog()).getByRole('button', { name: /Check again/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    // The page drops the target, as BoardView does on onClose.
    await close(user);
    answer(answers.pending5xx());
    // Let the late failure land (it crosses the transport's own timers).
    await new Promise((r) => setTimeout(r, 150));
    cleanup();
    render(<ShellDialog target={{ computer, session: 3, name: 'terminal-3' }} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(await within(dialog()).findByRole('button', { name: 'End it and change' })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 20));
    expect(within(dialog()).queryByText(/may have gone through/)).toBeNull();
    expect(dialog().querySelector('[data-outcome]')).toBeNull();
  });

  it('nothing to end (404): the start goes ahead', async () => {
    const user = userEvent.setup();
    const { onClose } = open({ end: answers.refused(404, 'SESSION_NOT_FOUND') });
    await pick(user, 'fish');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(methods()).toEqual(['DELETE', 'POST']);
  });

  it('an ending refused says why, starts nothing and gives the action back', async () => {
    const user = userEvent.setup();
    const { onChanged } = open({ end: answers.refused(409, 'SESSION_BUSY') });
    await pick(user, 'zsh');
    expect(await within(dialog()).findByText('terminal-3 could not be ended (SESSION_BUSY). Nothing changed.')).toBeInTheDocument();
    expect(methods()).toEqual(['DELETE']);
    expect(onChanged).not.toHaveBeenCalled();
    expect(within(dialog()).getByRole('button', { name: 'End it and change' })).toBeEnabled();
  });

  it('an ending whose outcome is unknown locks the action; Check again reads back the same shell: it stays locked (the ending may still land), however often, and nothing is resent', async () => {
    const user = userEvent.setup();
    open({ end: answers.pending5xx() });
    await pick(user, 'zsh');
    expect(await within(dialog()).findByText(/Ending terminal-3 may have gone through/)).toBeInTheDocument();
    expect(within(dialog()).getByRole('button', { name: 'End it and change' })).toBeDisabled();
    await user.click(within(dialog()).getByRole('button', { name: /Check again/ }));
    expect(await within(dialog()).findByText(/terminal-3 still runs the same shell, but the ending may still go through/)).toBeInTheDocument();
    expect(within(dialog()).getByRole('button', { name: 'End it and change' })).toBeDisabled();
    await user.click(within(dialog()).getByRole('button', { name: /Check again/ }));
    await waitFor(() => expect(sent.filter((x) => x.method === 'GET').length).toBeGreaterThanOrEqual(3));
    expect(within(dialog()).getByText(/the ending may still go through/)).toBeInTheDocument();
    expect(within(dialog()).getByRole('button', { name: 'End it and change' })).toBeDisabled();
    expect(methods()).toEqual(['DELETE']);
  });

  it('Check again after an unknown ending: terminal-3 is gone → Start comes back, the start is sent once on the press, and it is done', async () => {
    const user = userEvent.setup();
    const { world, onClose } = open({ end: answers.pending5xx() });
    await pick(user, 'zsh');
    await within(dialog()).findByText(/Ending terminal-3 may have gone through/);
    world.sessions = () => answers.ok([]);
    await user.click(within(dialog()).getByRole('button', { name: /Check again/ }));
    await user.click(await within(dialog()).findByRole('button', { name: 'Start zsh' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(methods()).toEqual(['DELETE', 'POST']);
  });

  it('Check again after an unknown ending: another shell runs there → someone opened it again; the tile reloads, nothing is started', async () => {
    const user = userEvent.setup();
    const { world, onChanged } = open({ end: answers.pending5xx() });
    await pick(user, 'zsh');
    await within(dialog()).findByText(/Ending terminal-3 may have gone through/);
    world.sessions = () => answers.ok([sess({ incarnation: INC_B })]);
    await user.click(within(dialog()).getByRole('button', { name: /Check again/ }));
    expect(await within(dialog()).findByText(/terminal-3 was opened again before the new shell started/)).toBeInTheDocument();
    expect(methods()).toEqual(['DELETE']);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('a start refused: the action only starts the shell again (terminal-3 is never ended twice)', async () => {
    const user = userEvent.setup();
    const { world, onClose } = open({ start: answers.refused(400, 'BAD_SHELL') });
    await pick(user, 'zsh');
    expect(await within(dialog()).findByText('terminal-3 ended, but the new shell did not start (BAD_SHELL). You can try to start it again.')).toBeInTheDocument();
    world.start = answers.ok({ success: true });
    await user.click(within(dialog()).getByRole('button', { name: 'Start zsh' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(methods()).toEqual(['DELETE', 'POST', 'POST']);
  });

  it('a start whose outcome is unknown: Check again finds nothing there → Start comes back; finds the shell → done', async () => {
    const user = userEvent.setup();
    const { world, onClose } = open({ start: answers.pending5xx() });
    await pick(user, 'zsh');
    expect(await within(dialog()).findByText(/Starting the new shell may have gone through/)).toBeInTheDocument();
    world.sessions = () => answers.ok([]);
    await user.click(within(dialog()).getByRole('button', { name: /Check again/ }));
    expect(await within(dialog()).findByText('terminal-3 ended, and no new shell is listed there now, but the first start may still land. Start again is safe: a second start never changes a session that is there.')).toBeInTheDocument();
    // Still unknown: never shown as failed, and Check again stays.
    expect(dialog().querySelector('[data-outcome]')?.getAttribute('data-outcome')).toBe('pending');
    expect(within(dialog()).queryByText(/didn't go through/i)).toBeNull();
    expect(within(dialog()).getByRole('button', { name: /Check again/ })).toBeInTheDocument();
    expect(methods()).toEqual(['DELETE', 'POST']);
    world.start = answers.pending5xx();
    await user.click(within(dialog()).getByRole('button', { name: 'Start again' }));
    await within(dialog()).findByText(/Starting the new shell may have gone through/);
    world.sessions = () => answers.ok([sess({ shell: 'zsh', incarnation: INC_B })]);
    await user.click(within(dialog()).getByRole('button', { name: /Check again/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(methods()).toEqual(['DELETE', 'POST', 'POST']);
    expect(toasts).toEqual([said('shell.done', { name: 'terminal-3', shell: 'zsh' })]);
  });

  it('a start answered "already there" is read back: our shell running is done, anything else is someone else\'s', async () => {
    const user = userEvent.setup();
    const first = open({ start: answers.ok({ success: true, code: 'already_active' }) });
    await within(dialog()).findByText(/runs bash now/);
    first.world.sessions = () => answers.ok([sess({ shell: 'zsh', incarnation: INC_B })]);
    await pick(user, 'zsh');
    await waitFor(() => expect(first.onClose).toHaveBeenCalled());
    expect(toasts).toEqual([said('shell.done', { name: 'terminal-3', shell: 'zsh' })]);
  });

  it('a start answered "already there" with another shell running: kept as it is, the tile reloads', async () => {
    const user = userEvent.setup();
    const { world, onChanged, onClose } = open({ start: answers.ok({ success: true, code: 'already_active' }) });
    await within(dialog()).findByText(/runs bash now/);
    world.sessions = () => answers.ok([sess({ incarnation: INC_B })]);
    await pick(user, 'zsh');
    expect(await within(dialog()).findByText(/terminal-3 was opened again before the new shell started/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(toasts).toEqual([]);
  });

  it('a start that ends at once is said so: nothing runs there, the action comes back', async () => {
    const user = userEvent.setup();
    const { world } = open({ start: answers.pending5xx() });
    await pick(user, 'zsh');
    await within(dialog()).findByText(/Starting the new shell may have gone through/);
    world.sessions = () => answers.ok([sess({ shell: 'zsh', is_active: false, incarnation: INC_B })]);
    await user.click(within(dialog()).getByRole('button', { name: /Check again/ }));
    expect(await within(dialog()).findByText('terminal-3 started zsh, but it ended at once. Nothing runs there now.')).toBeInTheDocument();
    expect(toasts).toEqual([]);
    expect(methods()).toEqual(['DELETE', 'POST']);
  });

  it('closing while an ending is unknown keeps it: reopened, the dialog is still locked on it, and Check again settles it', async () => {
    const user = userEvent.setup();
    const { world, close, reopen, onClose } = open({ end: answers.pending5xx() });
    await pick(user, 'zsh');
    await within(dialog()).findByText(/Ending terminal-3 may have gone through/);
    await close(user);
    reopen();
    expect(await within(dialog()).findByText(/Ending terminal-3 may have gone through/)).toBeInTheDocument();
    expect(within(dialog()).getByRole('button', { name: 'End it and change' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'zsh' })).toBeChecked();
    world.sessions = () => answers.ok([]);
    await user.click(within(dialog()).getByRole('button', { name: /Check again/ }));
    await user.click(await within(dialog()).findByRole('button', { name: 'Start zsh' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(methods()).toEqual(['DELETE', 'POST']);
  });

  it('the sticky notice\'s Check again after a close still reads back and settles: it records the answer and starts nothing', async () => {
    const user = userEvent.setup();
    const { world, close, reopen, onChanged } = open({ end: answers.pending5xx() });
    await pick(user, 'zsh');
    await within(dialog()).findByText(/Ending terminal-3 may have gone through/);
    await close(user);
    await waitFor(() => expect(checks).toHaveLength(1));
    world.sessions = () => answers.ok([]);
    expect(await checks[0]!()).toBe(true);
    expect(methods()).toEqual(['DELETE']);
    reopen();
    // The ending went through: the action only starts the shell.
    expect(await within(dialog()).findByRole('button', { name: 'Start zsh' })).toBeEnabled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('a check after a close finding someone else\'s terminal-3 reports it by computer and session (the page reloads only tiles that still show it)', async () => {
    const user = userEvent.setup();
    const { world, close, onChanged } = open({ end: answers.pending5xx() });
    await pick(user, 'zsh');
    await within(dialog()).findByText(/Ending terminal-3 may have gone through/);
    await close(user);
    await waitFor(() => expect(checks).toHaveLength(1));
    world.sessions = () => answers.ok([sess({ incarnation: INC_B })]);
    expect(await checks[0]!()).toBe(true);
    expect(onChanged).toHaveBeenCalledWith({ computer: computer.id, session: 3 });
    expect(methods()).toEqual(['DELETE']);
  });

  it('the start is exclusive: a terminal-3 someone else holds answers SESSION_EXISTS, nothing is changed, and it is read back as theirs', async () => {
    const user = userEvent.setup();
    const { world } = open({ start: answers.refused(409, 'SESSION_EXISTS') });
    world.sessions = () => answers.ok([sess({})]);
    await pick(user, 'zsh');
    world.sessions = () => answers.ok([sess({ is_ssh: true, ssh_host: 'db.example.com', ssh_user: 'ops', ssh_port: 22, is_active: false, incarnation: INC_B })]);
    expect(await within(dialog()).findByText(/terminal-3 was opened again before the new shell started/)).toBeInTheDocument();
    expect(sent.filter((x) => x.method === 'POST').map((x) => x.body)).toEqual([{ terminal_id: 3, exclusive: true, shell: 'zsh' }]);
  });
});

// b34f2: one record per change, reserved before any read, owned by the dialog that made it; every await is followed
// by an identity check; only the owner sends; Check again only records; a mismatch forces a fresh read.
describe('ShellDialog: one record per change', () => {
  const deferred = () => {
    const waiting: Array<(a: FixtureAnswer) => void> = [];
    let made = 0;
    return {
      next: () => new Promise<FixtureAnswer>((r) => { waiting.push(r); made++; }),
      all: (a: FixtureAnswer) => { waiting.splice(0).forEach((r) => r(a)); },
      /** Answer the newest read only (a fresh dialog's own read at open). */
      last: (a: FixtureAnswer) => { waiting.pop()?.(a); },
      get count() { return made; },
    };
  };
  const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
  const ends = () => sent.filter((x) => x.method === 'DELETE').map((x) => x.query.incarnation);

  it('(a) a Start again refused keeps the first start unknown: never shown as failed, Check again and Start again stay', async () => {
    const user = userEvent.setup();
    const { world } = open({ start: answers.pending5xx() });
    await pick(user, 'zsh');
    await within(dialog()).findByText(/Starting the new shell may have gone through/);
    world.sessions = () => answers.ok([]);
    await user.click(within(dialog()).getByRole('button', { name: /Check again/ }));
    world.start = answers.refused(400, 'BAD_SHELL');
    await user.click(await within(dialog()).findByRole('button', { name: 'Start again' }));
    expect(await within(dialog()).findByText(/the first start may still land/)).toBeInTheDocument();
    expect(dialog().querySelector('[data-outcome]')?.getAttribute('data-outcome')).toBe('pending');
    expect(within(dialog()).queryByText(/did not start \(BAD_SHELL\)/)).toBeNull();
    expect(within(dialog()).getByRole('button', { name: /Check again/ })).toBeInTheDocument();
    expect(within(dialog()).getByRole('button', { name: 'Start again' })).toBeInTheDocument();
    expect(methods()).toEqual(['DELETE', 'POST', 'POST']);
  });

  it('(b) closing and opening again during the read before the ending: one ending leaves, never two, and the old read answering last leaves it kept', async () => {
    const user = userEvent.setup();
    const { world, close, reopen } = open({ sessions: () => answers.refused(500, 'SERVER_ERROR'), end: new Promise<FixtureAnswer>(() => undefined) });
    await screen.findByRole('radio', { name: 'bash' });
    const d = deferred();
    world.sessions = d.next;
    await pick(user, 'zsh');
    await waitFor(() => expect(d.count).toBe(1));
    await close(user);
    reopen();
    await waitFor(() => expect(d.count).toBe(2));
    d.last(answers.refused(500, 'SERVER_ERROR'));
    await pick(user, 'zsh');
    await waitFor(() => expect(d.count).toBe(3));
    d.last(answers.ok([sess({})]));
    await waitFor(() => expect(ends()).toEqual([INC_A]));
    d.all(answers.ok([sess({})]));
    world.sessions = () => answers.ok([sess({})]);
    await tick(50);
    expect(ends()).toEqual([INC_A]);
    // The sent ending is still the kept one: opened again, it shows as unknown.
    await close(user);
    reopen();
    expect(await within(dialog()).findByText(/Ending terminal-3 may have gone through/)).toBeInTheDocument();
  });

  it('an ending answered after the dialog unmounted: the start is not sent by it, and the next dialog offers Start', async () => {
    const user = userEvent.setup();
    let answer: (a: FixtureAnswer) => void = () => undefined;
    const { unmount } = open({ end: new Promise<FixtureAnswer>((r) => { answer = r; }) });
    await pick(user, 'zsh');
    await waitFor(() => expect(methods()).toEqual(['DELETE']));
    unmount();
    answer(answers.ok({ success: true }));
    await tick(50);
    expect(methods()).toEqual(['DELETE']);
    render(<ShellDialog target={{ computer, session: 3, name: 'terminal-3' }} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(await within(dialog()).findByRole('button', { name: 'Start zsh' })).toBeEnabled();
  });

  it('(b) a remount during the read before the ending: the unmounted dialog sends nothing', async () => {
    const user = userEvent.setup();
    const { world, unmount } = open({ sessions: () => answers.refused(500, 'SERVER_ERROR') });
    await screen.findByRole('radio', { name: 'bash' });
    const d = deferred();
    world.sessions = d.next;
    await pick(user, 'zsh');
    await waitFor(() => expect(d.count).toBe(1));
    unmount();
    render(<ShellDialog target={{ computer, session: 3, name: 'terminal-3' }} onClose={vi.fn()} onChanged={vi.fn()} />);
    await waitFor(() => expect(d.count).toBe(2));
    d.last(answers.refused(500, 'SERVER_ERROR'));
    await pick(user, 'zsh');
    await waitFor(() => expect(d.count).toBe(3));
    d.all(answers.ok([sess({})]));
    await tick(50);
    expect(ends()).toEqual([INC_A]);
  });

  it('unmounting drops only an unsent read of its own; an ending already sent survives and shows on a fresh mount', async () => {
    const user = userEvent.setup();
    const { unmount } = open({ end: new Promise<FixtureAnswer>(() => undefined) });
    await pick(user, 'zsh');
    await waitFor(() => expect(methods()).toEqual(['DELETE']));
    unmount();
    render(<ShellDialog target={{ computer, session: 3, name: 'terminal-3' }} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(await within(dialog()).findByText(/Ending terminal-3 may have gone through/)).toBeInTheDocument();
    expect(within(dialog()).getByRole('button', { name: 'End it and change' })).toBeDisabled();
    await tick(20);
    expect(methods()).toEqual(['DELETE']);
  });

  it('two dialogs on the same terminal: the second one\'s change is refused while the first one\'s ending is kept', async () => {
    const user = userEvent.setup();
    open({ end: new Promise<FixtureAnswer>(() => undefined) });
    render(<ShellDialog target={{ computer, session: 3, name: 'terminal-3' }} onClose={vi.fn()} onChanged={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole('radio', { name: 'zsh' })).toHaveLength(2));
    // The later one is on top (the earlier one is inert behind it): it ends first, then the earlier one is pressed
    // directly.
    const [a, b] = screen.getAllByRole('dialog') as [HTMLElement, HTMLElement];
    await user.click(within(b).getByRole('radio', { name: 'zsh' }));
    await user.click(within(b).getByRole('button', { name: 'End it and change' }));
    await waitFor(() => expect(methods()).toEqual(['DELETE']));
    fireEvent.click(within(a).getByRole('radio', { name: 'zsh' }));
    await waitFor(() => expect(within(a).getByRole('radio', { name: 'zsh' })).toBeChecked());
    fireEvent.click(within(a).getByRole('button', { name: 'End it and change' }));
    await tick(20);
    expect(methods()).toEqual(['DELETE']);
  });

  it('(c) a start answered "already there" keeps its record while it reads back: reopened meanwhile, it shows as unknown', async () => {
    const user = userEvent.setup();
    const { world, close, reopen, onClose } = open({ start: answers.refused(409, 'SESSION_EXISTS') });
    await within(dialog()).findByText(/runs bash now/);
    const d = deferred();
    world.sessions = d.next;
    await pick(user, 'zsh');
    await waitFor(() => expect(d.count).toBe(1));
    await close(user);
    onClose.mockClear();
    reopen();
    expect(await within(dialog()).findByText(/Starting the new shell may have gone through/)).toBeInTheDocument();
    expect(within(dialog()).getByRole('button', { name: 'End it and change' })).toBeDisabled();
    d.all(answers.ok([sess({ shell: 'zsh', incarnation: INC_B })]));
    await tick(20);
    expect(methods()).toEqual(['DELETE', 'POST']);
    // Settled for the opening that sent it, which is gone: it only records, the dialog shown now is not closed.
    expect(onClose).not.toHaveBeenCalled();
    expect(toasts).toEqual([]);
  });

  it.each([['someone else\'s', 'bash'], ['the picked shell', 'zsh']])('(c) a late "already there" read back finding %s leaves a newer record alone', async (_, found) => {
    const user = userEvent.setup();
    const { world, close, reopen, onChanged } = open({ start: answers.refused(409, 'SESSION_EXISTS') });
    await within(dialog()).findByText(/runs bash now/);
    const d = deferred();
    world.sessions = d.next;
    await pick(user, 'zsh');
    await waitFor(() => expect(d.count).toBe(1));
    await close(user);
    reopen();
    await within(dialog()).findByText(/Starting the new shell may have gone through/);
    world.sessions = () => answers.ok([]);
    await user.click(within(dialog()).getByRole('button', { name: /Check again/ }));
    world.start = new Promise<FixtureAnswer>(() => undefined);
    await user.click(await within(dialog()).findByRole('button', { name: 'Start again' }));
    await waitFor(() => expect(methods()).toEqual(['DELETE', 'POST', 'POST']));
    d.all(answers.ok([sess({ shell: found, incarnation: INC_B })]));
    await tick(20);
    expect(within(dialog()).queryByText(/was opened again/)).toBeNull();
    expect(onChanged).not.toHaveBeenCalled();
    // The newer start is still the kept one: opened again, the dialog shows it as unknown.
    await close(user);
    reopen();
    expect(await within(dialog()).findByText(/Starting the new shell may have gone through/)).toBeInTheDocument();
    expect(within(dialog()).queryByRole('button', { name: 'Start again' })).toBeNull();
  });

  it('(d) Check again after an unknown ending finds terminal-3 gone: it records that, and only a press starts the shell', async () => {
    const user = userEvent.setup();
    const { world, onClose } = open({ end: answers.pending5xx() });
    await pick(user, 'zsh');
    await within(dialog()).findByText(/Ending terminal-3 may have gone through/);
    world.sessions = () => answers.ok([]);
    await user.click(within(dialog()).getByRole('button', { name: /Check again/ }));
    expect(await within(dialog()).findByRole('button', { name: 'Start zsh' })).toBeEnabled();
    expect(methods()).toEqual(['DELETE']);
    await user.click(within(dialog()).getByRole('button', { name: 'Start zsh' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(methods()).toEqual(['DELETE', 'POST']);
  });

  it('(d) the sticky notice\'s Check again after the same terminal is opened again never starts a shell', async () => {
    const user = userEvent.setup();
    const { world, close, reopen } = open({ end: answers.pending5xx() });
    await pick(user, 'zsh');
    await within(dialog()).findByText(/Ending terminal-3 may have gone through/);
    await close(user);
    await waitFor(() => expect(checks).toHaveLength(1));
    reopen();
    await within(dialog()).findByText(/Ending terminal-3 may have gone through/);
    world.sessions = () => answers.ok([]);
    await checks[0]!();
    await tick(20);
    expect(methods()).toEqual(['DELETE']);
  });

  it('(e) the read before the ending shows the picked shell already running: nothing is sent', async () => {
    const user = userEvent.setup();
    const { world, onChanged } = open({ sessions: () => answers.refused(500, 'SERVER_ERROR') });
    await screen.findByRole('radio', { name: 'bash' });
    world.sessions = () => answers.ok([sess({ shell: 'zsh' })]);
    await pick(user, 'zsh');
    expect(await within(dialog()).findByText('terminal-3 runs zsh already, so there is nothing to change and nothing was sent.')).toBeInTheDocument();
    expect(methods()).toEqual([]);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('(f) after "replaced" the dialog reads again: the next change ends the shell read now, never the old one', async () => {
    const user = userEvent.setup();
    const { world, onClose } = open({ end: answers.refused(409, 'INCARNATION_MISMATCH') });
    await within(dialog()).findByText(/runs bash now/);
    world.sessions = () => answers.ok([sess({ incarnation: INC_B })]);
    await pick(user, 'zsh');
    await within(dialog()).findByText(/was started again since this opened/);
    world.end = answers.ok({ success: true });
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: 'End it and change' })).toBeEnabled());
    await user.click(within(dialog()).getByRole('button', { name: 'End it and change' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(ends()).toEqual([INC_A, INC_B]);
  });

  it('(f) after a read back finds another shell, the next change ends that shell, never the old one', async () => {
    const user = userEvent.setup();
    const { world, onClose } = open({ end: answers.pending5xx() });
    await pick(user, 'zsh');
    await within(dialog()).findByText(/Ending terminal-3 may have gone through/);
    world.sessions = () => answers.ok([sess({ incarnation: INC_B })]);
    await user.click(within(dialog()).getByRole('button', { name: /Check again/ }));
    await within(dialog()).findByText(/was opened again/);
    world.end = answers.ok({ success: true });
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: 'End it and change' })).toBeEnabled());
    await user.click(within(dialog()).getByRole('button', { name: 'End it and change' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(ends()).toEqual([INC_A, INC_B]);
  });
});

// One store writes the kept changes (a compare-and-set); an opening owns its records from its mount effect to
// its cleanup, never by a render; a settle on a shell that is gone makes every dialog on it read again; a failed
// "already there" read back stays unknown; the warned Dismiss is the only release besides a read that proves it.
describe('ShellDialog: ownership in committed effects', () => {
  const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
  const ends = () => sent.filter((x) => x.method === 'DELETE').map((x) => x.query.incarnation);
  const t3 = { computer, session: 3, name: 'terminal-3' };

  it('(1) a mismatch answered after the dialog opened again: the dialog shown now reads again, and its change ends the shell there now', async () => {
    const user = userEvent.setup();
    let answer: (a: FixtureAnswer) => void = () => undefined;
    const { world, close, reopen, onClose } = open({ end: new Promise<FixtureAnswer>((r) => { answer = r; }) });
    await pick(user, 'zsh');
    await waitFor(() => expect(ends()).toEqual([INC_A]));
    await close(user);
    reopen();
    await within(dialog()).findByText(/Ending terminal-3 may have gone through/);
    world.sessions = () => answers.ok([sess({ incarnation: INC_B })]);
    world.end = answers.ok({ success: true });
    answer(answers.refused(409, 'INCARNATION_MISMATCH'));
    await waitFor(() => expect(within(dialog()).getByRole('radio', { name: 'zsh' })).toBeEnabled());
    await pick(user, 'zsh');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(ends()).toEqual([INC_A, INC_B]);
  });

  it('(1) another dialog\'s check finding another shell: this dialog reads again before its next change', async () => {
    const user = userEvent.setup();
    const { world } = open({ end: answers.pending5xx() });
    await pick(user, 'zsh');
    await within(dialog()).findByText(/Ending terminal-3 may have gone through/);
    const onClose2 = vi.fn();
    render(<ShellDialog target={t3} onClose={onClose2} onChanged={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(2));
    const [a, b] = screen.getAllByRole('dialog') as [HTMLElement, HTMLElement];
    world.sessions = () => answers.ok([sess({ incarnation: INC_B })]);
    world.end = answers.ok({ success: true });
    await user.click(within(b).getByRole('button', { name: /Check again/ }));
    await within(b).findByText(/was opened again/);
    await waitFor(() => expect(within(a).getByRole('radio', { name: 'zsh' })).toBeEnabled());
    fireEvent.click(within(a).getByRole('radio', { name: 'zsh' }));
    await waitFor(() => expect(within(a).getByRole('radio', { name: 'zsh' })).toBeChecked());
    fireEvent.click(within(a).getByRole('button', { name: 'End it and change' }));
    await waitFor(() => expect(ends()).toEqual([INC_A, INC_B]));
  });

  it('(2) under StrictMode, a render that never commits (a move to another terminal that suspends) leaves the shown dialog its owner: its start is sent', async () => {
    const user = userEvent.setup();
    let answer: (a: FixtureAnswer) => void = () => undefined;
    const first = open({ end: new Promise<FixtureAnswer>((r) => { answer = r; }) });
    first.unmount();
    const never = new Promise<never>(() => undefined);
    const Hang = (): null => { use(never); return null; };
    let go: (x: typeof t3) => void = () => undefined;
    const onClose = vi.fn();
    function Host() {
      const [tg, setTg] = useState(t3);
      const [, startT] = useTransition();
      go = (x) => startT(() => setTg(x));
      return <><ShellDialog target={tg} onClose={onClose} onChanged={vi.fn()} />{tg !== t3 && <Hang />}</>;
    }
    render(<StrictMode><Suspense fallback={null}><Host /></Suspense></StrictMode>);
    await pick(user, 'zsh');
    await waitFor(() => expect(methods()).toEqual(['DELETE']));
    act(() => go({ computer, session: 4, name: 'terminal-4' }));
    await tick(20);
    expect(within(dialog()).getByText(/terminal-3 runs bash now/)).toBeInTheDocument();
    answer(answers.ok({ success: true }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(methods()).toEqual(['DELETE', 'POST']);
  });

  it.each([['stays open', false], ['closes again', true]] as const)('(3) another dialog opening while the first reads before its ending (and %s): it shows it busy, and the first is not left busy', async (_, leave) => {
    const user = userEvent.setup();
    const { world, onClose } = open({ sessions: () => answers.refused(500, 'SERVER_ERROR') });
    await screen.findByRole('radio', { name: 'bash' });
    const waiting: Array<(a: FixtureAnswer) => void> = [];
    world.sessions = () => new Promise<FixtureAnswer>((r) => { waiting.push(r); });
    await pick(user, 'zsh');
    await waitFor(() => expect(waiting).toHaveLength(1));
    const other = render(<ShellDialog target={t3} onClose={vi.fn()} onChanged={vi.fn()} />);
    await waitFor(() => expect(waiting).toHaveLength(2));
    waiting[1]!(answers.ok([sess({})]));
    const b = (screen.getAllByRole('dialog') as HTMLElement[])[1]!;
    await waitFor(() => expect(within(b).getByRole('radio', { name: 'zsh' })).toBeDisabled());
    if (leave) other.unmount();
    world.sessions = () => answers.ok([sess({})]);
    waiting[0]!(answers.ok([sess({})]));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(methods()).toEqual(['DELETE', 'POST']);
  });

  it.each([['fails', () => answers.refused(500, 'SERVER_ERROR'), false], ['lists nothing', () => answers.ok([]), true]] as const)('(4) "already there" whose read back %s stays unknown: Check again, never failed', async (_, readBack, again) => {
    const user = userEvent.setup();
    const { world, onChanged } = open({ start: answers.refused(409, 'SESSION_EXISTS') });
    await within(dialog()).findByText(/runs bash now/);
    world.sessions = readBack;
    await pick(user, 'zsh');
    expect(await within(dialog()).findByText(again ? /no new shell is listed there now/ : /Starting the new shell may have gone through/)).toBeInTheDocument();
    expect(dialog().querySelector('[data-outcome]')?.getAttribute('data-outcome')).toBe('pending');
    expect(within(dialog()).getByRole('button', { name: /Check again/ })).toBeInTheDocument();
    expect(within(dialog()).queryByText(/was opened again/)).toBeNull();
    expect(within(dialog()).queryByRole('button', { name: 'Start again' }) !== null).toBe(again);
    expect(onChanged).not.toHaveBeenCalled();
    expect(methods()).toEqual(['DELETE', 'POST']);
  });

  it('Start again and Stop tracking share one start-aligned row with a gap', async () => {
    const user = userEvent.setup();
    const { world } = open({ start: answers.refused(409, 'SESSION_EXISTS') });
    await within(dialog()).findByText(/runs bash now/);
    world.sessions = () => answers.ok([]);
    await pick(user, 'zsh');
    const again = await within(dialog()).findByRole('button', { name: 'Start again' });
    const stop = within(dialog()).getByRole('button', { name: 'Stop tracking' });
    expect(again.parentElement).toBe(stop.parentElement);
    expect(again.parentElement?.className).toMatch(/j_start/);
    expect(again.parentElement?.className).toMatch(/g2/);
  });

  it('the warned Dismiss clears an unknown ending: it warns that the terminal may already have changed, sends nothing, and the dialog reads again', async () => {
    const user = userEvent.setup();
    const { world } = open({ end: answers.pending5xx() });
    await pick(user, 'zsh');
    await within(dialog()).findByText(/Ending terminal-3 may have gone through/);
    world.sessions = () => answers.ok([sess({ incarnation: INC_B })]);
    await user.click(within(dialog()).getByRole('button', { name: 'Stop tracking' }));
    const q = await screen.findByRole('alertdialog', { name: 'Stop tracking this?' }).catch(() => screen.findByRole('dialog', { name: 'Stop tracking this?' }));
    expect(within(q).getByText(/may already have ended, or be running the new shell/)).toBeInTheDocument();
    await user.click(within(q).getByRole('button', { name: 'Stop tracking anyway' }));
    await waitFor(() => expect(within(dialog()).queryByText(/may have gone through/)).toBeNull());
    world.end = answers.ok({ success: true });
    await waitFor(() => expect(within(dialog()).getByRole('radio', { name: 'zsh' })).toBeEnabled());
    expect(ends()).toEqual([INC_A]);
    await pick(user, 'zsh');
    await waitFor(() => expect(ends()).toEqual([INC_A, INC_B]));
  });

  it('Dismiss is offered only once the outcome is unknown: a send still unanswered (shown as unknown after reopening) has none', async () => {
    const user = userEvent.setup();
    const { close, reopen } = open({ end: new Promise<FixtureAnswer>(() => undefined) });
    await pick(user, 'zsh');
    await waitFor(() => expect(methods()).toEqual(['DELETE']));
    expect(within(dialog()).queryByRole('button', { name: 'Stop tracking' })).toBeNull();
    await close(user);
    reopen();
    await within(dialog()).findByText(/Ending terminal-3 may have gone through/);
    expect(within(dialog()).queryByRole('button', { name: 'Stop tracking' })).toBeNull();
  });
});

// The guards under the UI's own. The store's reserve refuses by itself, and a press callback kept from
// an earlier render (two presses in one batch, or one after a settle moved the read generation) sends nothing twice
// and never names a shell from a stale read: the disabled or hidden button is not what keeps them out.
describe('ShellDialog: the guards behind the button', () => {
  const k = computer.id + '/3';
  const rec = (phase: Held['phase'], o: Partial<Held> = {}): Held => ({ phase, before: null, shell: 'zsh', ...o });
  const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
  const ends = () => sent.filter((x) => x.method === 'DELETE').map((x) => x.query.incarnation);

  it('reserve keeps a record only where none is, over an ending that went through, or over an unknown start a read found nothing for', () => {
    const fresh = rec('ending');
    expect(reserve(k, fresh)).toBeUndefined();
    for (const p of ['reading', 'ending', 'starting', 'endUnknown', 'startUnknown'] as const) {
      resetShellChanges();
      const kept = rec(p);
      commit(k, undefined, kept);
      expect(reserve(k, rec('starting'))).toBeNull();
      expect(commit(k, kept, kept)).toBe(true);
    }
    for (const kept of [rec('start'), rec('startUnknown', { retry: true })]) {
      resetShellChanges();
      commit(k, undefined, kept);
      const next = rec('starting');
      expect(reserve(k, next)).toBe(kept);
      expect(commit(k, next, next)).toBe(true);
    }
  });

  it('two presses in one batch, before the dialog shows busy: one ending leaves', async () => {
    const user = userEvent.setup();
    let answer!: (a: FixtureAnswer) => void;
    const { onClose } = open({ end: new Promise<FixtureAnswer>((r) => { answer = r; }) });
    await user.click(await screen.findByRole('radio', { name: 'zsh' }));
    const go = within(dialog()).getByRole('button', { name: 'End it and change' });
    await waitFor(() => expect(go).toBeEnabled());
    act(() => { go.click(); go.click(); });
    await waitFor(() => expect(methods()).toEqual(['DELETE']));
    await tick(20);
    expect(ends()).toEqual([INC_A]);
    await act(async () => { answer(answers.ok({ success: true })); await tick(); });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(methods()).toEqual(['DELETE', 'POST']);
  });

  it('a press after a settle moved the read generation, before the dialog read again: it reads first and ends the shell there now', async () => {
    const user = userEvent.setup();
    const { world, onClose } = open({});
    await user.click(await screen.findByRole('radio', { name: 'zsh' }));
    const go = within(dialog()).getByRole('button', { name: 'End it and change' });
    await waitFor(() => expect(go).toBeEnabled());
    // Another opening's settle found a new shell on terminal-3 (its commit moves the generation); this dialog's
    // callback from the render before it is pressed at once.
    world.sessions = () => answers.ok([sess({ incarnation: INC_B })]);
    const g = generation(k);
    act(() => { commit(k, undefined, null, true); go.click(); });
    expect(generation(k)).toBe(g + 1);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(ends()).toEqual([INC_B]);
  });
});
