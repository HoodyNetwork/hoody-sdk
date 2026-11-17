// Vitest: Connect over SSH on core's fixture transport: the field rules agree with core's Board route,
// the number taken, a number someone opened first, and an unknown outcome (never resent; read back).
import { answers, boardFixtureRoute, boardSend, bootFixtureCore, fixtureWorld, reply, type FixtureAnswer, type FixtureRequest } from '@core';
import { describe, expect, it } from 'vitest';
import type { BoardComputer } from '../computers';
import { SESSIONS_PATH } from '../termSessions';
import { sshLabel, sshOf, sshProblems } from '../sshRules';
import { checkSsh, connectSsh, TRIES } from './sshConnect';

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const computer = { id: atlas.id, name: atlas.name, project_id: atlas.project_id, server_name: atlas.server_name, status: 'running' } as BoardComputer;
const ssh = { host: 'db.example.com', user: 'ops', port: 2222 };

const creates: unknown[] = [];
let reads = 0;
function world(sessions: () => FixtureAnswer, start: (req: FixtureRequest) => FixtureAnswer) {
  creates.length = 0;
  reads = 0;
  bootFixtureCore({
    rules: [
      reply(boardFixtureRoute('terminal', 'GET', SESSIONS_PATH), () => { reads++; return sessions(); }),
      reply(boardFixtureRoute('terminal', 'POST', '/api/v1/terminal/create'), (req) => { creates.push(req.body); return start(req); }),
    ],
  });
}
const row = (n: number, o: Record<string, unknown> = {}) => ({ terminal_id: String(n), shell: 'bash', is_active: true, daemon_program: false, is_ephemeral: false, ...o });

describe('sshProblems / sshOf', () => {
  it('names the empty or wrong field; a whole draft is trimmed and sent as numbers', () => {
    expect(sshProblems({ host: '', user: ' ', port: '22' })).toEqual({ host: 'empty', user: 'empty' });
    expect(sshProblems({ host: '-oProxyCommand=x', user: '-l', port: '0' })).toEqual({ host: 'bad', user: 'bad', port: 'bad' });
    expect(sshProblems({ host: 'a b', user: 'o\tps', port: '65536' })).toEqual({ host: 'bad', user: 'bad', port: 'bad' });
    expect(sshProblems({ host: '[::1]', user: 'a.b_c-d', port: '1' })).toEqual({});
    expect(sshProblems({ host: 'h', user: 'u', port: '2.5' })).toEqual({ port: 'bad' });
    expect(sshOf({ host: ' db.example.com ', user: ' ops', port: ' 2222 ' })).toEqual(ssh);
    expect(sshOf({ host: 'h', user: '', port: '22' })).toBeNull();
  });

  it('agrees with core\'s Board route: a draft the form accepts is never refused unsent, one it refuses always is', async () => {
    world(() => answers.ok([]), () => answers.ok({ success: true }));
    const drafts = [
      { host: 'db.example.com', user: 'ops', port: '22' }, { host: '10.0.0.5', user: 'root', port: '65535' }, { host: '[fe80::1]', user: '_x', port: '1' },
      { host: 'h'.repeat(253), user: 'u'.repeat(64), port: '22' }, { host: 'h'.repeat(254), user: 'u', port: '22' }, { host: 'h', user: 'u'.repeat(65), port: '22' },
      { host: '-h', user: 'u', port: '22' }, { host: 'h', user: '-u', port: '22' }, { host: 'h;id', user: 'u', port: '22' }, { host: 'h', user: 'u@x', port: '22' },
      { host: 'h', user: 'u', port: '0' }, { host: 'h', user: 'u', port: '70000' }, { host: 'h\u0000', user: 'u', port: '22' },
    ];
    for (const d of drafts) {
      const body = { terminal_id: 5, exclusive: true, ssh_host: d.host.trim(), ssh_user: d.user.trim(), ssh_port: Number(d.port) };
      const refused = await boardSend({ kit: 'terminal', index: 5 }, 'POST', '/api/v1/terminal/create', { target: { project: { id: computer.project_id }, container: { id: computer.id, server_name: computer.server_name } }, query: { terminal_id: 5 }, body }).then(() => false, (e: { code?: string }) => e.code === 'ROUTE_REFUSED');
      expect([d, sshOf(d) === null]).toEqual([d, refused]);
    }
  });

  it('labels user@host, adding the port only when it is not 22', () => {
    expect([sshLabel('ops', 'h', 22), sshLabel('ops', 'h', 2222)]).toEqual(['ops@h', 'ops@h:2222']);
  });
});

describe('connectSsh', () => {
  it('takes the number after every one the Boards and the computer hold, and creates it with the ssh fields only', async () => {
    world(() => answers.ok([row(1), row(4), row(9, { daemon_program: true })]), () => answers.ok({ success: true }));
    expect(await connectSsh(computer, [6], ssh)).toEqual({ session: 10 });
    expect(creates).toEqual([{ terminal_id: 10, exclusive: true, ssh_host: 'db.example.com', ssh_user: 'ops', ssh_port: 2222 }]);
  });

  it('a number someone opened first is skipped and the next one tried, at most TRIES times', async () => {
    world(() => answers.ok([row(1)]), (req) => (req.n < 3 ? answers.ok({ success: true, code: 'already_active' }) : answers.ok({ success: true })));
    expect(await connectSsh(computer, [], ssh)).toEqual({ session: 4 });
    expect(creates.map((b) => (b as { terminal_id: number }).terminal_id)).toEqual([2, 3, 4]);
    world(() => answers.ok([]), () => answers.ok({ success: true, code: 'already_active' }));
    expect(await connectSsh(computer, [], ssh)).toEqual({ error: 'busy' });
    expect(creates).toHaveLength(TRIES);
  });

  it('sends nothing when the sessions cannot be read', async () => {
    world(() => answers.refused(500, 'SERVER_ERROR'), () => answers.ok({ success: true }));
    expect(await connectSsh(computer, [], ssh)).toEqual({ error: 'read' });
    expect(creates).toEqual([]);
  });

  it('a refusal is failed with its code; an unknown outcome is pending on its number and is not resent', async () => {
    world(() => answers.ok([]), () => answers.refused(400, 'INVALID_SSH_HOST'));
    expect(await connectSsh(computer, [], ssh)).toEqual({ error: 'failed', code: 'INVALID_SSH_HOST' });
    world(() => answers.ok([]), () => answers.pending5xx());
    expect(await connectSsh(computer, [], ssh)).toEqual({ pending: 1 });
    expect(creates).toHaveLength(1);
  });

  it('every Board number held: nothing is sent', async () => {
    world(() => answers.ok([]), () => answers.ok({ success: true }));
    expect(await connectSsh(computer, Array.from({ length: 15000 }, (_, i) => i + 1), ssh)).toEqual({ error: 'full' });
    expect(creates).toEqual([]);
  });
});

describe('checkSsh', () => {
  it('reads back: that ssh running, ended at once, nothing there, something else, or a failed read', async () => {
    world(() => answers.ok([row(3, { is_ssh: true, ssh_host: 'db.example.com', ssh_user: 'ops', ssh_port: 2222 })]), () => answers.ok({}));
    expect(await checkSsh(computer, 3, ssh)).toBe('started');
    expect(await checkSsh(computer, 3, { ...ssh, port: 22 })).toBe('other');
    expect(await checkSsh(computer, 4, ssh)).toBe('absent');
    world(() => answers.ok([row(3, { is_ssh: true, ssh_host: 'db.example.com', ssh_user: 'ops', ssh_port: 2222, is_active: false })]), () => answers.ok({}));
    expect(await checkSsh(computer, 3, ssh)).toBe('ended');
    // Same label (ops@2001:db8::1:2222), another target: not ours.
    world(() => answers.ok([row(3, { is_ssh: true, ssh_host: '2001:db8::1:2222', ssh_user: 'ops', ssh_port: 22 })]), () => answers.ok({}));
    expect(await checkSsh(computer, 3, { host: '2001:db8::1', user: 'ops', port: 2222 })).toBe('other');
    world(() => answers.ok([row(3)]), () => answers.ok({}));
    expect(await checkSsh(computer, 3, ssh)).toBe('other');
    world(() => answers.refused(500, 'SERVER_ERROR'), () => answers.ok({}));
    expect(await checkSsh(computer, 3, ssh)).toBeNull();
    expect(reads).toBe(1);
  });
});
