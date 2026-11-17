// Vitest: the SSH tile's gate on core's fixture transport. Connect again goes once; its unknown outcome is
// kept per computer, session and destination (a reload of the tile or a remount keeps the lock), and Check again
// reads back: the ssh there opens the frame, nothing there gives the action back (a second create is safe).
import { answers, boardFixtureRoute, bootFixtureCore, fixtureWorld, reply, type FixtureAnswer, type FixtureRequest } from '@core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BoardComputer } from '../computers';
import { SESSIONS_PATH } from '../termSessions';
import { resetSshGates, SshGate } from './SshGate';

vi.mock('@kit/states/Toast', async (orig) => {
  const m = await orig<Record<string, unknown>>();
  return { ...m, showToast: () => 'toast-1', closeToast: () => undefined };
});
afterEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 0));
  resetSshGates();
});

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const computer = { id: atlas.id, name: atlas.name, project_id: atlas.project_id, server_name: atlas.server_name, status: 'running' } as BoardComputer;
const ssh = { host: 'db.example.com', user: 'ops', port: 2222 };
const sshRow = { terminal_id: '5', shell: 'bash', is_active: true, daemon_program: false, is_ephemeral: false, is_ssh: true, client_count: 0, ssh_host: 'db.example.com', ssh_user: 'ops', ssh_port: 2222 };

const sent: string[] = [];
const bodies: unknown[] = [];
interface World { sessions: () => FixtureAnswer; create: FixtureAnswer }
function mount(w: World) {
  sent.length = 0;
  bodies.length = 0;
  const log = (req: FixtureRequest) => { sent.push(req.method); if (req.method === 'POST') bodies.push(req.body); };
  bootFixtureCore({
    rules: [
      reply(boardFixtureRoute('terminal', 'GET', SESSIONS_PATH), (req) => { log(req); return w.sessions(); }),
      reply(boardFixtureRoute('terminal', 'POST', '/api/v1/terminal/create'), (req) => { log(req); return w.create; }),
    ],
  });
  const el = (reloadKey: number) => (
    <SshGate computer={computer} session={5} ssh={ssh} name="ops@db.example.com:2222" reloadKey={reloadKey} actions={null}>
      <p>the frame</p>
    </SshGate>
  );
  const view = render(el(0));
  return { rerender: (k: number) => view.rerender(el(k)), unmount: view.unmount, again: () => render(el(0)) };
}
const posts = () => sent.filter((m) => m === 'POST').length;

describe('SshGate: Connect again', () => {
  it('a second Connect again answered "already there" keeps the first unknown while nothing is listed', async () => {
    const user = userEvent.setup();
    const w: World = { sessions: () => answers.ok([]), create: answers.pending5xx() };
    mount(w);
    await user.click(await screen.findByRole('button', { name: 'Connect again' }));
    await user.click(await screen.findByRole('button', { name: /Check again/ }));
    await screen.findByText(/but the first try may still land/);
    // Someone's session held the number for the create, and is gone by the read.
    w.create = answers.refused(409, 'SESSION_EXISTS');
    await user.click(screen.getByRole('button', { name: 'Connect again' }));
    await waitFor(() => expect(posts()).toBe(2));
    expect(await screen.findByText(/but the first try may still land/)).toBeInTheDocument();
    expect(document.querySelector('[data-outcome]')?.getAttribute('data-outcome')).toBe('pending');
    expect(screen.getByRole('button', { name: /Check again/ })).toBeInTheDocument();
  });

  it('a second Connect again that starts the session settles the kept unknown: a later reload shows no "may have gone through"', async () => {
    const user = userEvent.setup();
    const w: World = { sessions: () => answers.ok([]), create: answers.pending5xx() };
    const g = mount(w);
    await user.click(await screen.findByRole('button', { name: 'Connect again' }));
    await user.click(await screen.findByRole('button', { name: /Check again/ }));
    await screen.findByText(/but the first try may still land/);
    w.create = answers.ok({ success: true });
    w.sessions = () => answers.ok([sshRow]);
    await user.click(screen.getByRole('button', { name: 'Connect again' }));
    expect(await screen.findByText('the frame')).toBeInTheDocument();
    // Later the session ends: the gate says so, with nothing left unknown.
    w.sessions = () => answers.ok([]);
    g.rerender(1);
    expect(await screen.findByRole('button', { name: 'Connect again' })).toBeEnabled();
    expect(document.querySelector('[data-outcome]')).toBeNull();
  });

  it('a reload while a second Connect again is unanswered settles the kept unknown when its read finds the ssh', async () => {
    const user = userEvent.setup();
    let release: (a: FixtureAnswer) => void = () => undefined;
    const w: World = { sessions: () => answers.ok([]), create: answers.pending5xx() };
    const g = mount(w);
    await user.click(await screen.findByRole('button', { name: 'Connect again' }));
    await user.click(await screen.findByRole('button', { name: /Check again/ }));
    await screen.findByText(/but the first try may still land/);
    w.create = new Promise<FixtureAnswer>((r) => { release = r; }) as unknown as FixtureAnswer;
    await user.click(screen.getByRole('button', { name: 'Connect again' }));
    await waitFor(() => expect(posts()).toBe(2));
    // The first create has landed; the tile reloads and its read finds the ssh there.
    w.sessions = () => answers.ok([sshRow]);
    g.rerender(1);
    expect(await screen.findByText('the frame')).toBeInTheDocument();
    release(answers.refused(409, 'SESSION_EXISTS'));
    await new Promise((r) => setTimeout(r, 20));
    // Later the session ends: nothing is left unknown.
    w.sessions = () => answers.ok([]);
    g.rerender(2);
    expect(await screen.findByRole('button', { name: 'Connect again' })).toBeEnabled();
    expect(document.querySelector('[data-outcome]')).toBeNull();
  });

  it('a second Connect again that starts the session settles the kept unknown even when the read after it fails', async () => {
    const user = userEvent.setup();
    const w: World = { sessions: () => answers.ok([]), create: answers.pending5xx() };
    mount(w);
    await user.click(await screen.findByRole('button', { name: 'Connect again' }));
    await user.click(await screen.findByRole('button', { name: /Check again/ }));
    await screen.findByText(/but the first try may still land/);
    w.create = answers.ok({ success: true });
    w.sessions = () => answers.refused(400, 'BAD_REQUEST');
    await user.click(screen.getByRole('button', { name: 'Connect again' }));
    await waitFor(() => expect(posts()).toBe(2));
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(document.querySelector('[data-outcome]')).toBeNull();
  });

  it('a read that began before a newer Connect again leaves that newer unknown alone', async () => {
    const user = userEvent.setup();
    const w: World = { sessions: () => answers.ok([]), create: answers.pending5xx() };
    const g = mount(w);
    await user.click(await screen.findByRole('button', { name: 'Connect again' }));
    await user.click(await screen.findByRole('button', { name: /Check again/ }));
    await screen.findByText(/but the first try may still land/);
    // A second tile of the same destination starts a read that answers late, with the old session still listed.
    let release: (a: FixtureAnswer) => void = () => undefined;
    const late = new Promise<FixtureAnswer>((r) => { release = r; });
    let first = true;
    w.sessions = () => { if (first) { first = false; return late as unknown as FixtureAnswer; } return answers.ok([]); };
    g.again();
    await waitFor(() => expect(sent.filter((m) => m === 'GET').length).toBeGreaterThan(2));
    // Meanwhile the first tile connects again, and that outcome is unknown too.
    await user.click(screen.getByRole('button', { name: 'Connect again' }));
    await waitFor(() => expect(posts()).toBe(2));
    expect((await screen.findAllByText(/may have gone through/)).length).toBeGreaterThan(0);
    release(answers.ok([sshRow]));
    expect(await screen.findByText('the frame')).toBeInTheDocument();
    // The newer unknown is still kept: its Connect again stays locked.
    expect(screen.getByRole('button', { name: 'Connect again' })).toBeDisabled();
    expect(document.querySelector('[data-outcome]')?.getAttribute('data-outcome')).toBe('pending');
  });

  it('a Check again that began before a newer Connect again on another tile leaves that newer unknown alone', async () => {
    const user = userEvent.setup();
    const w: World = { sessions: () => answers.ok([]), create: answers.pending5xx() };
    const g = mount(w);
    await user.click(await screen.findByRole('button', { name: 'Connect again' }));
    await user.click(await screen.findByRole('button', { name: /Check again/ }));
    await screen.findByText(/but the first try may still land/);
    const t2 = g.again();
    await waitFor(() => expect(within(t2.container).getByRole('button', { name: 'Connect again' })).toBeEnabled());
    // The first tile's Check again reads late, with the session listed then.
    let release: (a: FixtureAnswer) => void = () => undefined;
    const late = new Promise<FixtureAnswer>((r) => { release = r; });
    let first = true;
    w.sessions = () => { if (first) { first = false; return late as unknown as FixtureAnswer; } return answers.ok([]); };
    const checks = screen.getAllByRole('button', { name: /Check again/ });
    await user.click(checks[0]!);
    // Meanwhile the second tile connects again: unknown too.
    await user.click(within(t2.container).getByRole('button', { name: 'Connect again' }));
    await waitFor(() => expect(posts()).toBe(2));
    await within(t2.container).findAllByText(/may have gone through/);
    release(answers.ok([sshRow]));
    await waitFor(() => expect(screen.getAllByText('the frame').length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 20));
    expect(within(t2.container).getByRole('button', { name: 'Connect again' })).toBeDisabled();
    expect(t2.container.querySelector('[data-outcome]')?.getAttribute('data-outcome')).toBe('pending');
  });

  it('a Check again that began before a newer Connect again and finds nothing listed leaves that newer unknown locked', async () => {
    const user = userEvent.setup();
    const w: World = { sessions: () => answers.ok([]), create: answers.pending5xx() };
    const g = mount(w);
    await user.click(await screen.findByRole('button', { name: 'Connect again' }));
    await user.click(await screen.findByRole('button', { name: /Check again/ }));
    await screen.findByText(/but the first try may still land/);
    const t2 = g.again();
    await waitFor(() => expect(within(t2.container).getByRole('button', { name: 'Connect again' })).toBeEnabled());
    let release: (a: FixtureAnswer) => void = () => undefined;
    const late = new Promise<FixtureAnswer>((r) => { release = r; });
    let first = true;
    w.sessions = () => { if (first) { first = false; return late as unknown as FixtureAnswer; } return answers.ok([]); };
    await user.click(screen.getAllByRole('button', { name: /Check again/ })[0]!);
    await user.click(within(t2.container).getByRole('button', { name: 'Connect again' }));
    await waitFor(() => expect(posts()).toBe(2));
    await within(t2.container).findAllByText(/may have gone through/);
    release(answers.ok([]));
    await new Promise((r) => setTimeout(r, 20));
    expect(within(t2.container).getByRole('button', { name: 'Connect again' })).toBeDisabled();
    expect(within(t2.container).getAllByText(/may have gone through/).length).toBeGreaterThan(0);
  });

  it('a reload while Connect again is unanswered does not leave the action busy: the next Connect again is sent', async () => {
    const user = userEvent.setup();
    let release: (a: FixtureAnswer) => void = () => undefined;
    const w: World = { sessions: () => answers.ok([]), create: new Promise<FixtureAnswer>((r) => { release = r; }) as unknown as FixtureAnswer };
    const g = mount(w);
    await user.click(await screen.findByRole('button', { name: 'Connect again' }));
    await waitFor(() => expect(posts()).toBe(1));
    w.sessions = () => answers.ok([sshRow]);
    g.rerender(1);
    expect(await screen.findByText('the frame')).toBeInTheDocument();
    release(answers.refused(409, 'SESSION_EXISTS'));
    await new Promise((r) => setTimeout(r, 20));
    w.sessions = () => answers.ok([]);
    w.create = answers.ok({ success: true });
    g.rerender(2);
    await user.click(await screen.findByRole('button', { name: 'Connect again' }));
    await waitFor(() => expect(posts()).toBe(2));
  });

  it('a second Connect again answered "already there" keeps the first unknown when the read fails', async () => {
    const user = userEvent.setup();
    const w: World = { sessions: () => answers.ok([]), create: answers.pending5xx() };
    mount(w);
    await user.click(await screen.findByRole('button', { name: 'Connect again' }));
    await user.click(await screen.findByRole('button', { name: /Check again/ }));
    await screen.findByText(/but the first try may still land/);
    w.create = answers.refused(409, 'SESSION_EXISTS');
    w.sessions = () => answers.refused(400, 'BAD_REQUEST');
    await user.click(screen.getByRole('button', { name: 'Connect again' }));
    await waitFor(() => expect(posts()).toBe(2));
    await waitFor(() => expect(document.querySelector('[data-outcome]')?.getAttribute('data-outcome')).toBe('pending'));
    expect(screen.getByRole('button', { name: /Check again/ })).toBeInTheDocument();
  });

  it('an unknown outcome stays locked across a reload of the tile and a remount; nothing is sent twice', async () => {
    const user = userEvent.setup();
    const w: World = { sessions: () => answers.ok([]), create: answers.pending5xx() };
    const g = mount(w);
    await user.click(await screen.findByRole('button', { name: 'Connect again' }));
    expect(await screen.findByText(/Connecting to ops@db.example.com:2222 may have gone through/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect again' })).toBeDisabled();
    g.rerender(1);
    await waitFor(() => expect(sent.filter((m) => m === 'GET').length).toBeGreaterThanOrEqual(2));
    expect(await screen.findByRole('button', { name: 'Connect again' })).toBeDisabled();
    expect(screen.getByText(/Connecting to ops@db.example.com:2222 may have gone through/)).toBeInTheDocument();
    g.unmount();
    g.again();
    expect(await screen.findByRole('button', { name: 'Connect again' })).toBeDisabled();
    expect(posts()).toBe(1);
  });

  it('Check again finding nothing there keeps it unknown (never failed), says nothing is listed now and gives the action back; finding the ssh opens the frame', async () => {
    const user = userEvent.setup();
    const w: World = { sessions: () => answers.ok([]), create: answers.pending5xx() };
    const g = mount(w);
    await user.click(await screen.findByRole('button', { name: 'Connect again' }));
    await screen.findByText(/Connecting to ops@db.example.com:2222 may have gone through/);
    await user.click(screen.getByRole('button', { name: /Check again/ }));
    expect(await screen.findByText('No session is listed on that number now, but the first try may still land. You can connect again: a second try never changes a session that is there.')).toBeInTheDocument();
    expect(document.querySelector('[data-outcome]')?.getAttribute('data-outcome')).toBe('pending');
    expect(screen.getByRole('button', { name: /Check again/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect again' })).toBeEnabled();
    // Kept across a remount too: still unknown, the action still offered.
    g.unmount();
    g.again();
    expect(await screen.findByText(/but the first try may still land/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Connect again' })).toBeEnabled();
    w.create = answers.ok({ success: true });
    w.sessions = () => answers.ok([sshRow]);
    await user.click(screen.getByRole('button', { name: 'Connect again' }));
    expect(await screen.findByText('the frame')).toBeInTheDocument();
    expect(posts()).toBe(2);
  });

  it('a second Connect again answered settles the kept unknown: someone else\'s session there shows no "may have gone through"', async () => {
    const user = userEvent.setup();
    const w: World = { sessions: () => answers.ok([]), create: answers.pending5xx() };
    mount(w);
    await user.click(await screen.findByRole('button', { name: 'Connect again' }));
    await user.click(await screen.findByRole('button', { name: /Check again/ }));
    await screen.findByText(/but the first try may still land/);
    w.create = answers.refused(409, 'SESSION_EXISTS');
    w.sessions = () => answers.ok([{ ...sshRow, ssh_host: 'other.example.com' }]);
    await user.click(screen.getByRole('button', { name: 'Connect again' }));
    expect(await screen.findByText(/no longer goes to/)).toBeInTheDocument();
    expect(document.querySelector('[data-outcome]')).toBeNull();
    expect(posts()).toBe(2);
  });

  it('Check again finding the ssh there settles the kept lock: a later mount frames it at once', async () => {
    const user = userEvent.setup();
    const w: World = { sessions: () => answers.ok([]), create: answers.pending5xx() };
    const g = mount(w);
    await user.click(await screen.findByRole('button', { name: 'Connect again' }));
    await screen.findByText(/Connecting to ops@db.example.com:2222 may have gone through/);
    w.sessions = () => answers.ok([sshRow]);
    await user.click(screen.getByRole('button', { name: /Check again/ }));
    expect(await screen.findByText('the frame')).toBeInTheDocument();
    g.unmount();
    w.sessions = () => answers.ok([]);
    g.again();
    expect(await screen.findByRole('button', { name: 'Connect again' })).toBeEnabled();
    expect(screen.queryByText(/Connecting to ops@db.example.com:2222 may have gone through/)).toBeNull();
    expect(posts()).toBe(1);
  });

  it('every create is exclusive; a number already held answers SESSION_EXISTS, changes nothing, and is read back', async () => {
    const user = userEvent.setup();
    const w: World = { sessions: () => answers.ok([]), create: answers.refused(409, 'SESSION_EXISTS') };
    mount(w);
    await user.click(await screen.findByRole('button', { name: 'Connect again' }));
    expect(bodies[0]).toEqual({ terminal_id: 5, exclusive: true, ssh_host: 'db.example.com', ssh_user: 'ops', ssh_port: 2222 });
    expect(await screen.findByRole('button', { name: 'Connect again' })).toBeEnabled();
    expect(screen.queryByText(/could not|did not start/)).toBeNull();
    expect(sent).toEqual(['GET', 'POST', 'GET']);
  });

  it('settling a kept outcome unlocks every gate shown for that destination', async () => {
    const user = userEvent.setup();
    const w: World = { sessions: () => answers.ok([]), create: answers.pending5xx() };
    mount(w);
    await user.click(await screen.findByRole('button', { name: 'Connect again' }));
    await screen.findAllByText(/Connecting to ops@db.example.com:2222 may have gone through/);
    // A second gate for the same destination (the tile opened again elsewhere) shows the same lock.
    render(<SshGate computer={computer} session={5} ssh={ssh} name="ops@db.example.com:2222" reloadKey={0} actions={null}><p>the frame</p></SshGate>);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Connect again' }).every((b) => (b as HTMLButtonElement).disabled || b.getAttribute('aria-disabled') === 'true')).toBe(true));
    await user.click(screen.getAllByRole('button', { name: /Check again/ })[0]!);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Connect again' }).every((b) => !(b as HTMLButtonElement).disabled && b.getAttribute('aria-disabled') !== 'true')).toBe(true));
    expect(sent.filter((m) => m === 'POST')).toHaveLength(1);
  });
});

// Item 36: a plain reattach of a listed ssh session whose ssh exited runs ssh to the same host again while the
// session is still there with no process (as the real hoody-terminal answers): the card states
// that rule (it is one read old, so never what this press will run), never "has ended", and opens only on Reconnect.
describe('SshGate: a stopped ssh session', () => {
  const stopped = { ...sshRow, is_active: false };
  it('says what the computer lists and the rule for what Reconnect opens, never ended or still connected, and frames only on Reconnect; nothing is sent', async () => {
    const user = userEvent.setup();
    const { rerender } = mount({ sessions: () => answers.ok([stopped]), create: answers.ok({ success: true }) });
    expect(await screen.findByText('ssh to ops@db.example.com:2222 is not running in terminal-5 now')).toBeInTheDocument();
    expect(screen.getByText(/Read the prompt before you type/)).toBeInTheDocument();
    expect(screen.getByText(/Reconnect opens it; if nothing runs in it then, ssh starts again\. Read the prompt before you type\./)).toBeInTheDocument();
    expect(screen.queryByText(/has ended/)).toBeNull();
    expect(screen.queryByText('the frame')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Connect again' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(await screen.findByText('the frame')).toBeInTheDocument();
    expect(posts()).toBe(0);
    // A reload reads again: still stopped, it asks again.
    rerender(1);
    expect(await screen.findByRole('button', { name: 'Reconnect' })).toBeInTheDocument();
    expect(screen.queryByText('the frame')).toBeNull();
  });
  it('a running ssh session still frames at once', async () => {
    mount({ sessions: () => answers.ok([sshRow]), create: answers.ok({ success: true }) });
    expect(await screen.findByText('the frame')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
  });
  it('a reload whose read finds the ssh session stopped settles a kept unknown Connect again', async () => {
    const user = userEvent.setup();
    const w: World = { sessions: () => answers.ok([]), create: answers.pending5xx() };
    const { rerender } = mount(w);
    await user.click(await screen.findByRole('button', { name: 'Connect again' }));
    await screen.findByText(/Connecting to ops@db.example.com:2222 may have gone through/);
    w.sessions = () => answers.ok([stopped]);
    rerender(1);
    expect(await screen.findByRole('button', { name: 'Reconnect' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Connecting to .* may have gone through/)).toBeNull());
    expect(posts()).toBe(1);
  });
  it('a stopped ssh session found by Check again settles a kept unknown Connect again (the create can no longer land)', async () => {
    const user = userEvent.setup();
    const w: World = { sessions: () => answers.ok([]), create: answers.pending5xx() };
    mount(w);
    await user.click(await screen.findByRole('button', { name: 'Connect again' }));
    await screen.findByText(/Connecting to ops@db.example.com:2222 may have gone through/);
    w.sessions = () => answers.ok([stopped]);
    await user.click(screen.getByRole('button', { name: /Check again/ }));
    expect(await screen.findByRole('button', { name: 'Reconnect' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Connecting to .* may have gone through/)).toBeNull());
    expect(posts()).toBe(1);
  });
});
