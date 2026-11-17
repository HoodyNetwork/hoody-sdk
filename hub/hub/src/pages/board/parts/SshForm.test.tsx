// Vitest: Connect over SSH's form: which computer ssh runs from when the list arrives after the form
// opened, and that a chosen computer is never swapped for another. The computer is the kit's ComputerPicker.
import { answers, boardFixtureRoute, bootFixtureCore, fixtureWorld, reply, type FixtureAnswer } from '@core';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleOf, type BoardComputer } from '../computers';
import { SESSIONS_PATH } from '../termSessions';
import { resetSshAttempts, SshForm } from './SshForm';
import { Toaster } from '@kit';
import boardStrings from '../strings.en.json';

const STARTED_NOT_ADDED = (n: number) => (boardStrings as Record<string, string>)['ssh.startedNotAdded']!.replace('{{name}}', 'ops@db.example.com').replace(/\{\{computer\}\}/g, 'atlas').replace(/\{\{n\}\}/g, String(n));

const pc = (id: string, name: string, status = 'running') => ({ id, name, project_id: 'p1', server_name: 'n12', status }) as BoardComputer;
const alpha = pc('c0000000000000000000a001', 'alpha');
const beta = pc('c0000000000000000000b002', 'beta');
const props = { failed: false, onRetry: vi.fn(), taken: () => [], onPick: vi.fn(), onBack: vi.fn() };
const picked = () => screen.getByRole('button', { name: /Connect from/ }).textContent ?? '';
const GONE = 'The chosen computer is not running or not listed now. Pick one to connect from.';
const GONE_NONE = 'The chosen computer is not running or not listed now, and none of your computers is running. Start one on the Computers page first.';
const NONE = 'ssh runs from one of your computers, and none is running. Start one on the Computers page first.';
// The kit computer picker: rows are picked by name inside its list.
const pick = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(screen.getByRole('button', { name: /Connect from/ }));
  await user.click(within(await screen.findByRole('dialog', { name: /Connect from/ })).getByText(name));
};

beforeEach(() => { bootFixtureCore({ rules: [] }); });

describe('SshForm: the computer', () => {
  it('a link\'s computer is found once the list arrives after the form opened', () => {
    const v = render(<SshForm computers={null} prefill={{ computer: handleOf(beta), host: 'db.example.com' }} {...props} />);
    v.rerender(<SshForm computers={[alpha, beta]} prefill={{ computer: handleOf(beta), host: 'db.example.com' }} {...props} />);
    expect(picked()).toContain('beta');
    expect(screen.queryByText(GONE)).toBeNull();
  });

  it('with no link, the first running computer is chosen and nothing is said gone', () => {
    render(<SshForm computers={[alpha, beta]} {...props} />);
    expect(picked()).toContain('alpha');
    expect(screen.queryByText(GONE)).toBeNull();
  });

  it('a link naming no running computer selects none, and Connect asks for one instead of using another', async () => {
    const user = userEvent.setup();
    render(<SshForm computers={[alpha, beta]} prefill={{ computer: 'ghost.0000', host: 'db.example.com', user: 'ops' }} {...props} />);
    expect(picked()).not.toMatch(/alpha|beta/);
    expect(screen.getByText(GONE)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect((await screen.findAllByText('Pick a running computer')).length).toBeGreaterThan(0);
    expect(props.onPick).not.toHaveBeenCalled();
  });

  it('a computer the person picked that stops is not replaced by another', async () => {
    const user = userEvent.setup();
    const v = render(<SshForm computers={[alpha, beta]} {...props} />);
    expect(picked()).toContain('alpha');
    await pick(user, 'beta');
    expect(picked()).toContain('beta');
    expect(screen.queryByText(GONE)).toBeNull();
    v.rerender(<SshForm computers={[alpha, { ...beta, status: 'stopped' }]} {...props} />);
    expect(picked()).not.toMatch(/alpha|beta/);
    expect(screen.getByText(GONE)).toBeTruthy();
    // Choosing again clears it.
    await pick(user, 'alpha');
    expect(picked()).toContain('alpha');
    expect(screen.queryByText(GONE)).toBeNull();
  });

  // The chosen computer gone while none is running says so, never only the generic "none is running".
  it('a picked computer that stops while none is left running is named gone, with Back and no Connect', async () => {
    const user = userEvent.setup();
    const v = render(<SshForm computers={[alpha, beta]} {...props} />);
    await pick(user, 'beta');
    v.rerender(<SshForm computers={[{ ...alpha, status: 'stopped' }, { ...beta, status: 'stopped' }]} {...props} />);
    expect(screen.getByText(GONE_NONE)).toBeTruthy();
    expect(screen.queryByText(NONE)).toBeNull();
    expect(screen.getByRole('button', { name: /Back/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull();
  });

  it('a link naming a computer that is not listed, with none running, is named gone', () => {
    render(<SshForm computers={[{ ...alpha, status: 'stopped' }]} prefill={{ computer: handleOf(beta), host: 'db.example.com' }} {...props} />);
    expect(screen.getByText(GONE_NONE)).toBeTruthy();
    expect(screen.queryByText(NONE)).toBeNull();
  });

  it('a link naming a listed computer that is stopped, with none running, is named gone too', () => {
    render(<SshForm computers={[{ ...alpha, status: 'stopped' }, { ...beta, status: 'stopped' }]} prefill={{ computer: handleOf(beta), host: 'db.example.com' }} {...props} />);
    expect(screen.getByText(GONE_NONE)).toBeTruthy();
    expect(screen.queryByText(NONE)).toBeNull();
  });

  it('a chosen computer is never named gone before a read answered: reading says so, a failed read offers Try again', () => {
    const link = { computer: handleOf(beta), host: 'db.example.com' };
    const v = render(<SshForm computers={null} prefill={link} {...props} />);
    expect(screen.getByText('Reading your computers…')).toBeTruthy();
    expect(screen.queryByText(GONE_NONE)).toBeNull();
    v.rerender(<SshForm computers={[{ ...beta, status: 'stopped' }]} prefill={link} {...props} failed />);
    expect(screen.getByRole('button', { name: /Try again/ })).toBeTruthy();
    expect(screen.queryByText(GONE_NONE)).toBeNull();
    expect(screen.queryByText(NONE)).toBeNull();
  });

  it('no computer chosen and none running keeps the plain text; a partial list keeps its own text even with a chosen one gone', () => {
    const v = render(<SshForm computers={[{ ...alpha, status: 'stopped' }]} {...props} />);
    expect(screen.getByText(NONE)).toBeTruthy();
    expect(screen.queryByText(GONE_NONE)).toBeNull();
    v.rerender(<SshForm computers={[{ ...alpha, status: 'stopped' }]} complete={false} prefill={{ computer: handleOf(beta) }} {...props} />);
    expect(screen.getByText(/Only the first 100 computers were read/)).toBeTruthy();
    expect(screen.queryByText(GONE_NONE)).toBeNull();
  });

  it('User and Port share one row; Host keeps its own line', () => {
    render(<SshForm computers={[alpha, beta]} {...props} />);
    const rowOf = (label: string) => screen.getByRole('textbox', { name: label }).closest('[class*="j_start"]');
    expect(rowOf('User')).not.toBeNull();
    expect(rowOf('User')).toBe(rowOf('Port'));
    expect(rowOf('Host')).toBeNull();
  });

  it('the computer is the kit picker: running computers only, each with its state and place', async () => {
    const user = userEvent.setup();
    render(<SshForm computers={[alpha, beta, pc('c0000000000000000000c003', 'gamma', 'stopped')]} {...props} />);
    await user.click(screen.getByRole('button', { name: /Connect from/ }));
    const list = await screen.findByRole('dialog', { name: /Connect from/ });
    expect(within(list).getByText('beta')).toBeTruthy();
    expect(within(list).queryByText('gamma')).toBeNull();
    expect(within(list).getAllByText(/Running/).length).toBe(2);
    expect(within(list).getAllByText(/n12/).length).toBe(2);
  });
});

describe('SshForm: an unknown connect is tried again on its own number only', () => {
  const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
  const computer = { id: atlas.id, name: atlas.name, project_id: atlas.project_id, server_name: atlas.server_name, status: 'running' } as BoardComputer;
  const row = (n: number) => ({ terminal_id: String(n), shell: 'bash', is_active: true, daemon_program: false, is_ephemeral: false, is_ssh: true, client_count: 0, ssh_host: 'db.example.com', ssh_user: 'ops', ssh_port: 22 });
  const posts: number[] = [];
  let listed: number[] = [];
  let create: () => FixtureAnswer = () => answers.pending5xx();
  beforeEach(() => {
    posts.length = 0; listed = []; create = () => answers.pending5xx(); resetSshAttempts();
    bootFixtureCore({
      rules: [
        reply(boardFixtureRoute('terminal', 'GET', SESSIONS_PATH), () => answers.ok(listed.map(row))),
        reply(boardFixtureRoute('terminal', 'POST', '/api/v1/terminal/create'), (req) => { posts.push(Number((req.body as { terminal_id: number }).terminal_id)); return create(); }),
      ],
    });
  });
  afterEach(() => { cleanup(); resetSshAttempts(); });
  const fill = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByRole('textbox', { name: /Host/ }), 'db.example.com');
    await user.type(screen.getByRole('textbox', { name: /User/ }), 'ops');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
  };
  const fillIn = async (user: ReturnType<typeof userEvent.setup>, root: HTMLElement) => {
    await user.type(within(root).getByRole('textbox', { name: /Host/ }), 'db.example.com');
    await user.type(within(root).getByRole('textbox', { name: /User/ }), 'ops');
    await user.click(within(root).getByRole('button', { name: 'Connect' }));
  };

  it('after a second try finds someone else\'s session on that number, the next Connect takes another number', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<SshForm computers={[computer]} failed={false} onRetry={vi.fn()} taken={() => []} onPick={onPick} onBack={vi.fn()} />);
    await fill(user);
    await user.click(await screen.findByRole('button', { name: /Check again/ }));
    await screen.findByText(/but the first try may still land/);
    const first = posts[0]!;
    const other = { terminal_id: String(first), shell: 'bash', is_active: true, daemon_program: false, is_ephemeral: false, is_ssh: true, client_count: 0, ssh_host: 'other.example.com', ssh_user: 'x', ssh_port: 22 };
    let otherThere = true;
    bootFixtureCore({
      rules: [
        reply(boardFixtureRoute('terminal', 'GET', SESSIONS_PATH), () => answers.ok(otherThere ? [other] : [])),
        reply(boardFixtureRoute('terminal', 'POST', '/api/v1/terminal/create'), (req) => { const n = Number((req.body as { terminal_id: number }).terminal_id); posts.push(n); return n === first ? answers.refused(409, 'SESSION_EXISTS') : answers.ok({ success: true }); }),
      ],
    });
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText(/Someone else opened that terminal first/)).toBeInTheDocument();
    otherThere = true;
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(posts[posts.length - 1]).not.toBe(first);
    expect(onPick.mock.calls[0]![0]).not.toMatchObject({ session: first });
  });

  it('after a second try finds that ssh already ended on that number, the next Connect takes another number', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<SshForm computers={[computer]} failed={false} onRetry={vi.fn()} taken={() => []} onPick={onPick} onBack={vi.fn()} />);
    await fill(user);
    await user.click(await screen.findByRole('button', { name: /Check again/ }));
    await screen.findByText(/but the first try may still land/);
    const first = posts[0]!;
    bootFixtureCore({
      rules: [
        reply(boardFixtureRoute('terminal', 'GET', SESSIONS_PATH), () => answers.ok([{ ...row(first), is_active: false }])),
        reply(boardFixtureRoute('terminal', 'POST', '/api/v1/terminal/create'), (req) => { const n = Number((req.body as { terminal_id: number }).terminal_id); posts.push(n); return n === first ? answers.refused(409, 'SESSION_EXISTS') : answers.ok({ success: true }); }),
      ],
    });
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(posts).toHaveLength(2));
    await waitFor(() => expect(document.querySelector('[data-outcome]')?.getAttribute('data-outcome')).toBe('failed'));
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(posts[posts.length - 1]).not.toBe(first);
  });

  it('a form opened while the first create is still unanswered joins it: no second number, and its answer reaches the new form', async () => {
    const user = userEvent.setup();
    let release: (a: FixtureAnswer) => void = () => undefined;
    // The first create lands at once (listed) but its answer is held.
    create = () => { listed = [posts[posts.length - 1]!]; return new Promise<FixtureAnswer>((r) => { release = r; }) as unknown as FixtureAnswer; };
    const v = render(<SshForm computers={[computer]} failed={false} onRetry={vi.fn()} taken={() => []} onPick={vi.fn()} onBack={vi.fn()} />);
    await fill(user);
    await waitFor(() => expect(posts).toHaveLength(1));
    v.unmount();
    create = () => answers.refused(409, 'SESSION_EXISTS');
    const onPick = vi.fn();
    render(<SshForm computers={[computer]} failed={false} onRetry={vi.fn()} taken={() => []} onPick={onPick} onBack={vi.fn()} />);
    await fill(user);
    release(answers.ok({ success: true }));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(posts).toHaveLength(1);
    expect(onPick.mock.calls[0]![0]).toMatchObject({ session: posts[0] });
  });

  it('a second form settling the kept attempt leaves the first form trying that same number, never a new one', async () => {
    const user = userEvent.setup();
    const onPickA = vi.fn();
    const a = render(<SshForm computers={[computer]} failed={false} onRetry={vi.fn()} taken={() => []} onPick={onPickA} onBack={vi.fn()} />);
    await fillIn(user, a.container);
    await user.click(await within(a.container).findByRole('button', { name: /Check again/ }));
    await within(a.container).findByText(/but the first try may still land/);
    const first = posts[0]!;
    // Form B for the same destination connects on the kept number and settles it.
    create = () => answers.ok({ success: true });
    const onPickB = vi.fn();
    const b = render(<SshForm computers={[computer]} failed={false} onRetry={vi.fn()} taken={() => []} onPick={onPickB} onBack={vi.fn()} />);
    await fillIn(user, b.container);
    await waitFor(() => expect(onPickB).toHaveBeenCalledTimes(1));
    // Form A's Connect now: that number holds the ssh session; a new number would be a second connection.
    listed = [first];
    create = () => answers.refused(409, 'SESSION_EXISTS');
    await user.click(within(a.container).getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(onPickA).toHaveBeenCalledTimes(1));
    expect(new Set(posts)).toEqual(new Set([first]));
    expect(onPickA.mock.calls[0]![0]).toMatchObject({ session: first });
  });

  it('a form joining a second try that is then refused keeps the first try unknown too', async () => {
    const user = userEvent.setup();
    const v = render(<SshForm computers={[computer]} failed={false} onRetry={vi.fn()} taken={() => []} onPick={vi.fn()} onBack={vi.fn()} />);
    await fill(user);
    await user.click(await screen.findByRole('button', { name: /Check again/ }));
    await screen.findByText(/but the first try may still land/);
    let release: (a: FixtureAnswer) => void = () => undefined;
    create = () => new Promise<FixtureAnswer>((r) => { release = r; }) as unknown as FixtureAnswer;
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(posts).toHaveLength(2));
    v.unmount();
    render(<SshForm computers={[computer]} failed={false} onRetry={vi.fn()} taken={() => []} onPick={vi.fn()} onBack={vi.fn()} />);
    await fill(user);
    release(answers.refused(400, 'BAD_REQUEST'));
    expect(await screen.findByText(/The second try did not go through/)).toBeInTheDocument();
    expect(document.querySelector('[data-outcome]')?.getAttribute('data-outcome')).toBe('pending');
    expect(screen.getByRole('button', { name: /Check again/ })).toBeInTheDocument();
    expect(posts).toHaveLength(2);
  });

  it('a refused second try keeps the first try unknown: Check again stays, and the first create landing is adopted', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<SshForm computers={[computer]} failed={false} onRetry={vi.fn()} taken={() => []} onPick={onPick} onBack={vi.fn()} />);
    await fill(user);
    await user.click(await screen.findByRole('button', { name: /Check again/ }));
    await screen.findByText(/but the first try may still land/);
    create = () => answers.refused(400, 'BAD_REQUEST');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText(/The second try did not go through/)).toBeInTheDocument();
    expect(document.querySelector('[data-outcome]')?.getAttribute('data-outcome')).toBe('pending');
    expect(screen.queryByText(/didn't go through/i)).toBeNull();
    listed = [posts[0]!];
    await user.click(screen.getByRole('button', { name: /Check again/ }));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(onPick.mock.calls[0]![0]).toMatchObject({ session: posts[0] });
  });

  it('nothing listed after an unknown connect keeps it unknown; the first create landing late is adopted by the next Connect, never a second connection', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<SshForm computers={[computer]} failed={false} onRetry={vi.fn()} taken={() => []} onPick={onPick} onBack={vi.fn()} />);
    await fill(user);
    expect(await screen.findByText(/Starting the connection to .* may have gone through/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Check again/ }));
    expect(await screen.findByText(/No session is listed on that number now, but the first try may still land/)).toBeInTheDocument();
    expect(document.querySelector('[data-outcome]')?.getAttribute('data-outcome')).toBe('pending');
    expect(screen.queryByText(/didn't go through/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled();
    // The first create lands now; the next Connect tries that same number and finds it ours.
    listed = [posts[0]!];
    create = () => answers.refused(409, 'SESSION_EXISTS');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(posts).toEqual([posts[0], posts[0]]);
    expect(onPick.mock.calls[0]![0]).toMatchObject({ session: posts[0], ssh: { host: 'db.example.com', user: 'ops', port: 22 } });
  });

  it('a second try refused settles nothing about the first: the next Connect still tries that number', async () => {
    const user = userEvent.setup();
    render(<SshForm computers={[computer]} failed={false} onRetry={vi.fn()} taken={() => []} onPick={vi.fn()} onBack={vi.fn()} />);
    await fill(user);
    await user.click(await screen.findByRole('button', { name: /Check again/ }));
    await screen.findByText(/but the first try may still land/);
    create = () => answers.refused(400, 'BAD_REQUEST');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(posts).toHaveLength(2));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled());
    // The first create has landed meanwhile: a new number would make a second connection.
    listed = [posts[0]!];
    create = () => answers.ok({ success: true });
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(posts).toHaveLength(3));
    expect(new Set(posts).size).toBe(1);
  });

  it('a check finding someone else\'s session there settles the attempt: the next Connect takes a new number', async () => {
    const user = userEvent.setup();
    render(<SshForm computers={[computer]} failed={false} onRetry={vi.fn()} taken={() => []} onPick={vi.fn()} onBack={vi.fn()} />);
    await fill(user);
    await screen.findByText(/Starting the connection to .* may have gone through/);
    const first = posts[0]!;
    // Someone else's session on that number now (another destination).
    const other = { terminal_id: String(first), shell: 'bash', is_active: true, daemon_program: false, is_ephemeral: false, is_ssh: true, client_count: 0, ssh_host: 'other.example.com', ssh_user: 'x', ssh_port: 22 };
    bootFixtureCore({
      rules: [
        reply(boardFixtureRoute('terminal', 'GET', SESSIONS_PATH), () => answers.ok([other])),
        reply(boardFixtureRoute('terminal', 'POST', '/api/v1/terminal/create'), (req) => { posts.push(Number((req.body as { terminal_id: number }).terminal_id)); return answers.ok({ success: true }); }),
      ],
    });
    await user.click(screen.getByRole('button', { name: /Check again/ }));
    expect(await screen.findByText(/Someone else opened that terminal first/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]).not.toBe(first);
  });

  it("Check again has the focus and its check settles the attempt: the form's first control takes the focus, never the page (formFocus.ts)", async () => {
    const user = userEvent.setup();
    const { container } = render(<SshForm computers={[computer]} failed={false} onRetry={vi.fn()} taken={() => []} onPick={vi.fn()} onBack={vi.fn()} />);
    await fill(user);
    await screen.findByText(/Starting the connection to .* may have gone through/);
    const other = { terminal_id: String(posts[0]!), shell: 'bash', is_active: true, daemon_program: false, is_ephemeral: false, is_ssh: true, client_count: 0, ssh_host: 'other.example.com', ssh_user: 'x', ssh_port: 22 };
    bootFixtureCore({ rules: [reply(boardFixtureRoute('terminal', 'GET', SESSIONS_PATH), () => answers.ok([other]))] });
    const again = screen.getByRole('button', { name: /Check again/ });
    // A browser has already dropped the focus of the disabled Connect; jsdom keeps it there, so move it as a browser would.
    act(() => { again.focus(); });
    expect(again).toHaveFocus();
    await user.click(again);
    expect(await screen.findByText(/Someone else opened that terminal first/)).toBeInTheDocument();
    expect(again).not.toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('form')!.querySelector<HTMLElement>('input, button')).toHaveFocus());
  });

  it('a second try answered "already there" with someone else\'s session is theirs: no pick, Connect comes back', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<SshForm computers={[computer]} failed={false} onRetry={vi.fn()} taken={() => []} onPick={onPick} onBack={vi.fn()} />);
    await fill(user);
    await user.click(await screen.findByRole('button', { name: /Check again/ }));
    await screen.findByText(/but the first try may still land/);
    const first = posts[0]!;
    const other = { terminal_id: String(first), shell: 'bash', is_active: true, daemon_program: false, is_ephemeral: false, is_ssh: true, client_count: 0, ssh_host: 'other.example.com', ssh_user: 'x', ssh_port: 22 };
    bootFixtureCore({
      rules: [
        reply(boardFixtureRoute('terminal', 'GET', SESSIONS_PATH), () => answers.ok([other])),
        reply(boardFixtureRoute('terminal', 'POST', '/api/v1/terminal/create'), (req) => { posts.push(Number((req.body as { terminal_id: number }).terminal_id)); return answers.refused(409, 'SESSION_EXISTS'); }),
      ],
    });
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText(/Someone else opened that terminal first/)).toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('a later form for the same destination tries the kept number again, not a new one', async () => {
    const user = userEvent.setup();
    const v = render(<SshForm computers={[computer]} failed={false} onRetry={vi.fn()} taken={() => []} onPick={vi.fn()} onBack={vi.fn()} />);
    await fill(user);
    await screen.findByText(/Starting the connection to .* may have gone through/);
    v.unmount();
    const onPick = vi.fn();
    render(<SshForm computers={[computer]} failed={false} onRetry={vi.fn()} taken={() => []} onPick={onPick} onBack={vi.fn()} />);
    create = () => answers.ok({ success: true });
    await fill(user);
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(posts).toHaveLength(2);
    expect(posts[1]).toBe(posts[0]);
  });

  // The toast queue is the kit's, shared by every test in this file: each of these starts with none showing.
  const noToasts = async (user: ReturnType<typeof userEvent.setup>) => {
    for (const b of screen.queryAllByRole('button', { name: 'Dismiss' })) await user.click(b);
    await waitFor(() => expect(screen.queryAllByRole('button', { name: 'Dismiss' })).toHaveLength(0));
  };

  // The form gone (only the sticky notice left), its Check again finds the session started.
  // No tile can be added then, so the person is told it started and that no tile was added for it, with where it is.
  it('the sticky notice\'s Check again finding a started session, the form gone: says it started and no tile was added', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Toaster />);
    await noToasts(user);
    const v = render(<SshForm computers={[computer]} failed={false} onRetry={vi.fn()} taken={() => []} onPick={onPick} onBack={vi.fn()} />);
    await fill(user);
    await screen.findByRole('button', { name: /Check again/ });
    const n = posts[0]!;
    v.unmount();
    const notice = await screen.findByRole('button', { name: /Check again/ });
    listed = [n];
    await user.click(notice);
    expect(await screen.findByText(STARTED_NOT_ADDED(n))).toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
  });

  // A later form retried the same number and added its tile; the old notice's read then finds it
  // started, and that is no news: the attempt was settled (and shown) by the retry.
  it('the sticky notice\'s Check again after a later form started the same number and added its tile: no "not added" text', async () => {
    const user = userEvent.setup();
    render(<Toaster />);
    await noToasts(user);
    const v = render(<SshForm computers={[computer]} failed={false} onRetry={vi.fn()} taken={() => []} onPick={vi.fn()} onBack={vi.fn()} />);
    await fill(user);
    await screen.findByRole('button', { name: /Check again/ });
    const n = posts[0]!;
    v.unmount();
    const onPick = vi.fn();
    const w = render(<SshForm computers={[computer]} failed={false} onRetry={vi.fn()} taken={() => []} onPick={onPick} onBack={vi.fn()} />);
    create = () => answers.ok({ success: true });
    await fill(user);
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(posts[1]).toBe(n);
    w.unmount();
    const notice = await screen.findByRole('button', { name: /Check again/ });
    listed = [n];
    await user.click(notice);
    await waitFor(() => expect(screen.queryByRole('button', { name: /Check again/ })).toBeNull());
    expect(screen.queryByText(STARTED_NOT_ADDED(n))).toBeNull();
  });

  // A late read of a settled attempt settles only its own number. Form B's retry of A's number found
  // someone else's session there (settled), B's next Connect kept a new number; A's old notice then reads its number
  // and must leave B's attempt kept, so a later form still tries B's number, never a third.
  it('the sticky notice\'s Check again of a settled number leaves a later form\'s kept number for the same destination', async () => {
    const user = userEvent.setup();
    // Someone else's session on A's number, once A has left it unknown (the fixture is booted first: a boot later would
    // close A's notice as another context's).
    const theirs: { n?: number } = {};
    bootFixtureCore({
      rules: [
        reply(boardFixtureRoute('terminal', 'GET', SESSIONS_PATH), () => answers.ok(theirs.n === undefined ? [] : [{ ...row(theirs.n), ssh_host: 'other.example.com', ssh_user: 'x' }])),
        reply(boardFixtureRoute('terminal', 'POST', '/api/v1/terminal/create'), (req) => { const k = Number((req.body as { terminal_id: number }).terminal_id); posts.push(k); return k === theirs.n ? answers.refused(409, 'SESSION_EXISTS') : answers.pending5xx(); }),
      ],
    });
    render(<Toaster />);
    await noToasts(user);
    const a = render(<SshForm computers={[computer]} failed={false} onRetry={vi.fn()} taken={() => []} onPick={vi.fn()} onBack={vi.fn()} />);
    await fill(user);
    await screen.findByRole('button', { name: /Check again/ });
    const n = posts[0]!;
    a.unmount();
    theirs.n = n;
    const b = render(<SshForm computers={[computer]} failed={false} onRetry={vi.fn()} taken={() => []} onPick={vi.fn()} onBack={vi.fn()} />);
    await fillIn(user, b.container);
    expect(await within(b.container).findByText(/Someone else opened that terminal first/)).toBeInTheDocument();
    await user.click(within(b.container).getByRole('button', { name: 'Connect' }));
    await within(b.container).findByRole('button', { name: /Check again/ });
    const m = posts[posts.length - 1]!;
    expect(m).not.toBe(n);
    // A's notice (outside B's form) reads its own number: someone else's session, settled.
    const notices = screen.getAllByRole('button', { name: /Check again/ }).filter((x) => !b.container.contains(x));
    expect(notices).toHaveLength(1);
    await user.click(notices[0]!);
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Check again/ }).filter((x) => !b.container.contains(x))).toHaveLength(0));
    // B's attempt is still kept: a later form for the same destination tries m again. (Its board shows m as in use, so
    // a fresh connect would take another number: only the kept attempt sends m.)
    b.unmount();
    const c = render(<SshForm computers={[computer]} failed={false} onRetry={vi.fn()} taken={() => [m]} onPick={vi.fn()} onBack={vi.fn()} />);
    const before = posts.length;
    await fillIn(user, c.container);
    await waitFor(() => expect(posts.length).toBe(before + 1));
    expect(posts[posts.length - 1]).toBe(m);
  });

  it('the sticky notice\'s Check again finding nothing listed says nothing new: the notice stays unknown', async () => {
    const user = userEvent.setup();
    render(<Toaster />);
    await noToasts(user);
    const v = render(<SshForm computers={[computer]} failed={false} onRetry={vi.fn()} taken={() => []} onPick={vi.fn()} onBack={vi.fn()} />);
    await fill(user);
    await screen.findByRole('button', { name: /Check again/ });
    const n = posts[0]!;
    v.unmount();
    await user.click(await screen.findByRole('button', { name: /Check again/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Check again/ })).toBeInTheDocument());
    expect(screen.queryByText(STARTED_NOT_ADDED(n))).toBeNull();
  });
});

describe('SshForm: the host key caveat', () => {
  const hostKey = (boardStrings as Record<string, string>)['ssh.hostKey']!;
  const hostLabel = (boardStrings as Record<string, string>)['ssh.host']!;
  it('is an attached warn band under the Host field, which the field takes as its description, and never an alert', () => {
    render(<SshForm computers={[alpha, beta]} {...props} />);
    const field = screen.getByRole('textbox', { name: hostLabel });
    expect(field).toHaveAccessibleDescription(hostKey);
    const band = screen.getByText(hostKey).closest('[role="status"]')!;
    expect(band).not.toBeNull();
    expect(band.closest('[data-band-attach]')).toHaveAttribute('data-band-attach', 'warn');
    expect(field.compareDocumentPosition(band) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a Host error comes first in the description and the caveat follows it once', async () => {
    const user = userEvent.setup();
    render(<SshForm computers={[alpha, beta]} {...props} />);
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    const field = screen.getByRole('textbox', { name: hostLabel });
    const empty = (boardStrings as Record<string, string>)['ssh.host.empty']!;
    await waitFor(() => expect(field).toHaveAccessibleDescription(new RegExp(`^${empty}`)));
    const said = field.getAttribute('aria-describedby')!.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '');
    expect(said.filter((t) => t.includes(hostKey))).toHaveLength(1);
    expect(said.findIndex((t) => t.includes(empty))).toBeLessThan(said.findIndex((t) => t.includes(hostKey)));
  });

  it('stays in view while the Host field is locked by an unknown connect', async () => {
    resetSshAttempts();
    const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
    const computer = { id: atlas.id, name: atlas.name, project_id: atlas.project_id, server_name: atlas.server_name, status: 'running' } as BoardComputer;
    bootFixtureCore({
      rules: [
        reply(boardFixtureRoute('terminal', 'GET', SESSIONS_PATH), () => answers.ok([])),
        reply(boardFixtureRoute('terminal', 'POST', '/api/v1/terminal/create'), () => answers.pending5xx()),
      ],
    });
    const user = userEvent.setup();
    render(<SshForm computers={[computer]} {...props} />);
    await user.type(screen.getByRole('textbox', { name: hostLabel }), 'db.example.com');
    await user.type(screen.getByRole('textbox', { name: /User/ }), 'ops');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: hostLabel })).toBeDisabled());
    expect(screen.getByText(hostKey)).toBeVisible();
    expect(screen.getByRole('textbox', { name: hostLabel })).toHaveAccessibleDescription(hostKey);
    resetSshAttempts();
  });
});
