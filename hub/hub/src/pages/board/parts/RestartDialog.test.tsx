// Vitest: Restart terminal on core's fixture transport. Restart sends once, naming the shell it read (its
// incarnation, and its shell when it is a Board shell); a shell started since answers "replaced" and nothing is reset;
// only a refusal before the reset is "not restarted"; an unknown outcome is read back (Check again never sends, and a
// malformed read settles nothing) and outlives the dialog (reopening, and the sticky notice's Check again); only a
// local shell is offered.
import { answers, boardFixtureRoute, bootFixtureCore, fixtureWorld, reply, type FixtureAnswer, type FixtureRequest } from '@core';
import { act, cleanup, screen, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BoardComputer } from '../computers';
import { SESSIONS_PATH } from '../termSessions';
import { RestartDialog, resetRestarts } from './RestartDialog';
import { afterRestart } from './shellChange';
import boardStrings from '../strings.en.json';
// Toast titles come from the strings file (a reworded or re-punctuated string needs no test edit).
const said = (k: keyof typeof boardStrings, v: Record<string, string>): string => boardStrings[k].replace(/\{\{(\w+)\}\}/g, (_, x: string) => v[x] ?? '');

const toasts: string[] = [];
const checks: Array<() => unknown> = [];
vi.mock('@kit/states/Toast', async (orig) => {
  const m = await orig<Record<string, unknown>>();
  return { ...m, showToast: (c: { title: string; action?: { onAction: () => unknown } }) => { toasts.push(c.title); if (c.action) checks.push(c.action.onAction); return 'toast-1'; }, closeToast: () => undefined };
});
afterEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 0));
  toasts.length = 0; checks.length = 0; resetRestarts(); vi.restoreAllMocks();
});

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const computer = { id: atlas.id, name: atlas.name, project_id: atlas.project_id, server_name: atlas.server_name, status: 'running' } as BoardComputer;
const INC_A = 'a'.repeat(32), INC_B = 'b'.repeat(32);
const sess = (o: Record<string, unknown>) => ({ terminal_id: '3', shell: 'bash', is_active: true, daemon_program: false, is_ephemeral: false, client_count: 1, incarnation: INC_A, ...o });

interface World { sessions: () => FixtureAnswer | Promise<FixtureAnswer>; restart: () => FixtureAnswer | Promise<FixtureAnswer> }
const sent: Array<{ method: string; query: Readonly<Record<string, string>>; body: unknown }> = [];
const log = (req: FixtureRequest) => { sent.push({ method: req.method, query: req.query, body: req.body }); };
const posts = () => sent.filter((x) => x.method === 'POST');

function open(w: Partial<World>) {
  sent.length = 0;
  const world: World = { sessions: () => answers.ok([sess({})]), restart: () => answers.ok({ terminal_id: '3', exit_code: 0, completion: 'marker' }), ...w };
  bootFixtureCore({
    rules: [
      reply(boardFixtureRoute('terminal', 'GET', SESSIONS_PATH), (req) => { log(req); return world.sessions(); }),
      reply(boardFixtureRoute('terminal', 'POST', '/api/v1/terminal/execute'), (req) => { log(req); return world.restart(); }),
    ],
  });
  const onClose = vi.fn(), onChanged = vi.fn();
  const target = { computer, session: 3, name: 'terminal-3' };
  const view = render(<RestartDialog target={target} onClose={onClose} onChanged={onChanged} />);
  const close = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    view.rerender(<RestartDialog target={null} onClose={onClose} onChanged={onChanged} />);
  };
  const reopen = () => view.rerender(<RestartDialog target={target} onClose={onClose} onChanged={onChanged} />);
  return { onClose, onChanged, world, close, reopen };
}
const dialog = () => screen.getByRole('alertdialog');
const press = async (user: ReturnType<typeof userEvent.setup>) => {
  const b = await within(dialog()).findByRole('button', { name: 'Restart' });
  await vi.waitFor(() => expect(b).not.toBeDisabled());
  await user.click(b);
};

describe('afterRestart: what a read back proves', () => {
  const before = { n: 3, offered: true, shell: 'bash', cwd: null, ssh: null, sshTo: null, viewers: 0, lastActivity: null, running: true, incarnation: INC_A };
  it('another incarnation = restarted; the same = same; listed without a shell = stopped; not listed = gone', () => {
    expect(afterRestart(3, before, [{ ...before, incarnation: INC_B }])).toBe('restarted');
    expect(afterRestart(3, before, [before])).toBe('same');
    expect(afterRestart(3, before, [{ ...before, incarnation: null }])).toBe('stopped');
    expect(afterRestart(3, before, [])).toBe('gone');
  });
});

describe('Restart terminal: one send, naming the shell it read', () => {
  it('confirms first; Restart sends once with reset and the read incarnation; the frames reload and it closes', async () => {
    const user = userEvent.setup();
    const { onClose, onChanged } = open({});
    expect(await within(dialog()).findByText(/ends everything running in terminal-3/)).toBeTruthy();
    expect(posts()).toHaveLength(0);
    await press(user);
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(posts()).toEqual([{ method: 'POST', query: { terminal_id: '3', reset: 'true', shell: 'bash' }, body: { command: 'true', incarnation: INC_A } }]);
    expect(onChanged).toHaveBeenCalledWith({ computer: computer.id, session: 3 });
    expect(toasts).toContain(said('restart.done', { name: 'terminal-3' }));
  });

  it('a shell started since the read: "replaced", nothing reset, it reads again and a new press names the new shell', async () => {
    const user = userEvent.setup();
    // Someone else started terminal-3 again just before our press landed: the terminal refuses, nothing is reset.
    const { world, onChanged } = open({});
    world.restart = () => { world.sessions = () => answers.ok([sess({ incarnation: INC_B })]); world.restart = () => answers.ok({}); return answers.refused(409, 'INCARNATION_MISMATCH'); };
    await press(user);
    expect(await within(dialog()).findByText(/no longer runs the shell this dialog read \(it was changed or it stopped\), so it was not restarted/)).toBeTruthy();
    expect(onChanged).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(sent.filter((x) => x.method === 'GET').length).toBeGreaterThanOrEqual(2));
    await press(user);
    await vi.waitFor(() => expect(posts()).toHaveLength(2));
    expect(posts()[1]!.body).toEqual({ command: 'true', incarnation: INC_B });
  });

  it('says which shell starts and that the folder and user go back to the defaults; a shell that is not a Board shell names none', async () => {
    const user = userEvent.setup();
    open({ sessions: () => answers.ok([sess({ shell: '/usr/bin/zsh' })]) });
    expect(await within(dialog()).findByText(/starts zsh there again\. Its start folder and user go back to this computer's defaults/)).toBeTruthy();
    cleanup();
    open({ sessions: () => answers.ok([sess({ shell: 'tmux' })]) });
    expect(await within(dialog()).findByText(/starts this computer's default shell there/)).toBeTruthy();
    await press(user);
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]!.query).toEqual({ terminal_id: '3', reset: 'true' });
  });

  it('a definite refusal shows why and gives Restart back', async () => {
    const user = userEvent.setup();
    open({ restart: () => answers.refused(409, 'EXECUTE_QUEUE_BUSY') });
    await press(user);
    expect(await within(dialog()).findByText(/could not be restarted \(EXECUTE_QUEUE_BUSY\)/)).toBeTruthy();
    expect(within(dialog()).getByRole('button', { name: 'Restart' })).not.toBeDisabled();
    expect(posts()).toHaveLength(1);
  });
});

describe('Restart terminal: a refusal that may come after the reset is unknown (C9)', () => {
  const cases: Array<[string, () => FixtureAnswer]> = [
    ['409 SHELL_REPLACED', () => answers.refused(409, 'SHELL_REPLACED')],
    ['429 EXECUTE_BACKLOG_FULL', () => answers.refused(429, 'EXECUTE_BACKLOG_FULL')],
    ['500 without a code', () => answers.refused(500, '')],
  ];
  for (const [what, restart] of cases) {
    it(`${what}: never "not restarted"; Restart stays locked and Check again reads back`, async () => {
      const user = userEvent.setup();
      open({ restart });
      await press(user);
      expect(await within(dialog()).findByText(/Restarting terminal-3 may have gone through/)).toBeTruthy();
      expect(within(dialog()).queryByText(/Nothing changed/)).toBeNull();
      expect(within(dialog()).getByRole('button', { name: 'Restart' })).toBeDisabled();
      expect(within(dialog()).getByRole('button', { name: /Check again/ })).toBeTruthy();
      expect(posts()).toHaveLength(1);
    });
  }
});

describe('Restart terminal: an unknown outcome (C9)', () => {
  it('locks Restart; Check again finding the same shell stays unknown and sends nothing', async () => {
    const user = userEvent.setup();
    open({ restart: () => answers.pending5xx() });
    await press(user);
    expect(await within(dialog()).findByText(/Restarting terminal-3 may have gone through/)).toBeTruthy();
    expect(within(dialog()).getByRole('button', { name: 'Restart' })).toBeDisabled();
    await user.click(within(dialog()).getByRole('button', { name: /Check again/ }));
    expect(await within(dialog()).findByText(/still runs the same shell, but the restart may still go through/)).toBeTruthy();
    expect(within(dialog()).getByRole('button', { name: 'Restart' })).toBeDisabled();
    expect(posts()).toHaveLength(1);
  });

  it('Check again finding a new shell: it runs a new shell now, the frames reload and the dialog closes; never sent twice', async () => {
    const user = userEvent.setup();
    const { world, onChanged, onClose } = open({ restart: () => answers.pending5xx() });
    await press(user);
    await within(dialog()).findByText(/Restarting terminal-3 may have gone through/);
    world.sessions = () => answers.ok([sess({ incarnation: INC_B })]);
    await user.click(within(dialog()).getByRole('button', { name: /Check again/ }));
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalledWith({ computer: computer.id, session: 3 }));
    expect(toasts).toContain(said('restart.newShell', { name: 'terminal-3' }));
    expect(toasts).not.toContain(said('restart.done', { name: 'terminal-3' }));
    expect(onClose).toHaveBeenCalled();
    expect(posts()).toHaveLength(1);
  });

  const settled: Array<[string, () => FixtureAnswer, string, RegExp]> = [
    ['not listed', () => answers.ok([]), 'terminal-3 is not running any more, so there is nothing left to restart.', /is not running, so there is nothing to restart/],
    ['listed with no shell running', () => answers.ok([sess({ incarnation: null })]), 'No shell runs in terminal-3 now, so there is nothing left to restart.', /No shell runs in terminal-3 now, so there is nothing to restart/],
    ['listed with no shell running, under both id fields (one a number)', () => answers.ok([sess({ id: 3, incarnation: null })]), 'No shell runs in terminal-3 now, so there is nothing left to restart.', /No shell runs in terminal-3 now, so there is nothing to restart/],
  ];
  for (const [what, back, toast, body] of settled) {
    it(`Check again finding terminal-3 ${what}: said as a fact (never failed or restarted), read again, no Restart`, async () => {
      const user = userEvent.setup();
      const { world, onChanged } = open({ restart: () => answers.pending5xx() });
      await press(user);
      await within(dialog()).findByText(/Restarting terminal-3 may have gone through/);
      world.sessions = back;
      await user.click(within(dialog()).getByRole('button', { name: /Check again/ }));
      await vi.waitFor(() => expect(toasts).toContain(toast));
      expect(await within(dialog()).findByText(body)).toBeTruthy();
      expect(within(dialog()).queryByRole('button', { name: 'Restart' })).toBeNull();
      expect(within(dialog()).queryByText(/didn't go through/i)).toBeNull();
      expect(onChanged).not.toHaveBeenCalled();
      expect(posts()).toHaveLength(1);
    });
  }

  const malformed: Array<[string, () => FixtureAnswer]> = [
    ['an object, not a list', () => answers.ok({ unexpected: true })],
    ['null', () => answers.ok(null)],
    ['a row naming no terminal', () => answers.ok([{ shell: 'bash' }])],
    ['a malformed incarnation', () => answers.ok([sess({ incarnation: 'nope' })])],
    ['a row without the incarnation field (it says nothing, never "no shell")', () => answers.ok([{ terminal_id: '3', shell: 'bash', is_active: true }])],
    ['a terminal number with leading zeros (never dropped as "not listed")', () => answers.ok([sess({ terminal_id: '000003' })])],
    ['id and terminal_id naming different terminals (never read as one of them)', () => answers.ok([sess({ id: '3', terminal_id: '4' })])],
    ['an id the terminal never writes beside a good terminal_id', () => answers.ok([sess({ id: '03', terminal_id: '3' })])],
  ];
  for (const [what, back] of malformed) {
    it(`Check again on ${what}: settles nothing, Restart stays locked, nothing sent again`, async () => {
      const user = userEvent.setup();
      const { world, onChanged } = open({ restart: () => answers.pending5xx() });
      await press(user);
      await within(dialog()).findByText(/Restarting terminal-3 may have gone through/);
      world.sessions = back;
      await user.click(within(dialog()).getByRole('button', { name: /Check again/ }));
      expect(await within(dialog()).findByText(/could not be read, so it is still not known whether the restart went through/)).toBeTruthy();
      expect(within(dialog()).getByRole('button', { name: 'Restart' })).toBeDisabled();
      expect(toasts).toHaveLength(0);
      expect(onChanged).not.toHaveBeenCalled();
      await user.click(within(dialog()).getByRole('button', { name: /Check again/ }));
      expect(posts()).toHaveLength(1);
    });
  }

  it('outlives the dialog: reopened it still shows the unknown outcome; the sticky notice\'s Check again settles it without a send', async () => {
    const user = userEvent.setup();
    const { world, close, reopen, onChanged } = open({ restart: () => answers.pending5xx() });
    await press(user);
    await within(dialog()).findByText(/Restarting terminal-3 may have gone through/);
    await close(user);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    reopen();
    expect(await within(dialog()).findByText(/Restarting terminal-3 may have gone through/)).toBeTruthy();
    expect(within(dialog()).getByRole('button', { name: 'Restart' })).toBeDisabled();
    await close(user);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(checks.length).toBeGreaterThan(0);
    world.sessions = () => answers.ok([sess({ incarnation: INC_B })]);
    await act(async () => { await checks[checks.length - 1]!(); });
    expect(onChanged).toHaveBeenCalledWith({ computer: computer.id, session: 3 });
    expect(posts()).toHaveLength(1);
  });
});

describe('Restart terminal: terminal-N listed twice settles nothing (C9)', () => {
  it('Check again on two rows for terminal-3 (no shell, then the same shell): still unknown, Restart locked, nothing sent again', async () => {
    const user = userEvent.setup();
    const { world, onChanged } = open({ restart: () => answers.pending5xx() });
    await press(user);
    await within(dialog()).findByText(/Restarting terminal-3 may have gone through/);
    world.sessions = () => answers.ok([sess({ incarnation: null }), sess({})]);
    await user.click(within(dialog()).getByRole('button', { name: /Check again/ }));
    expect(await within(dialog()).findByText(/terminal-3 is listed twice, so it is still not known whether the restart went through/)).toBeTruthy();
    expect(within(dialog()).getByRole('button', { name: 'Restart' })).toBeDisabled();
    expect(toasts).toHaveLength(0);
    expect(onChanged).not.toHaveBeenCalled();
    expect(posts()).toHaveLength(1);
  });
});

describe('Restart terminal: only a local shell is offered', () => {
  const cases: Array<[string, () => FixtureAnswer, RegExp]> = [
    ['an ssh session', () => answers.ok([sess({ shell: null, ssh_host: 'db.example.com', ssh_user: 'deploy' })]), /runs an ssh connection to deploy@db\.example\.com/],
    ['a program\'s own terminal', () => answers.ok([sess({ daemon_program: true })]), /a program's own terminal/],
    ['not listed', () => answers.ok([]), /is not running, so there is nothing to restart/],
    ['no incarnation known', () => answers.ok([sess({ incarnation: null })]), /No shell runs in terminal-3 now/],
  ];
  for (const [what, sessions, line] of cases) {
    it(`${what}: says why, no Restart, nothing sent`, async () => {
      open({ sessions });
      expect(await within(dialog()).findByText(line)).toBeTruthy();
      expect(within(dialog()).queryByRole('button', { name: 'Restart' })).toBeNull();
      expect(posts()).toHaveLength(0);
    });
  }
  it('a malformed first read is a failed read, never "not running"', async () => {
    open({ sessions: () => answers.ok({ unexpected: true }) });
    expect(await within(dialog()).findByText(/could not be read, so nothing can be restarted yet/)).toBeTruthy();
    expect(within(dialog()).queryByRole('button', { name: 'Restart' })).toBeNull();
  });
  it('a reopened dialog reads afresh: the last opening\'s read is never offered again', async () => {
    const user = userEvent.setup();
    const { world, close, reopen } = open({});
    await within(dialog()).findByRole('button', { name: 'Restart' });
    await close(user);
    world.sessions = () => new Promise<FixtureAnswer>(() => undefined);
    reopen();
    expect(await within(dialog()).findByText(/Reading what terminal-3 runs/)).toBeTruthy();
    expect(within(dialog()).getByRole('button', { name: 'Restart' })).toBeDisabled();
  });
  it('a failed read says so; Read again reads (and only reads), then offers Restart', async () => {
    const user = userEvent.setup();
    const { world } = open({ sessions: () => answers.refused(500, 'INTERNAL_ERROR') });
    expect(await within(dialog()).findByText(/could not be read, so nothing can be restarted yet/)).toBeTruthy();
    world.sessions = () => answers.ok([sess({})]);
    await user.click(within(dialog()).getByRole('button', { name: 'Read again' }));
    expect(await within(dialog()).findByRole('button', { name: 'Restart' })).toBeTruthy();
    expect(posts()).toHaveLength(0);
  });
});
