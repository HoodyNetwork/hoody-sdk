// Vitest: a computer's live terminal sessions as the picker reads them: what a row offers, which
// numbers count as taken, and the next free number.
import { describe, expect, it } from 'vitest';
import { bandOf, nextFree, sameSsh, sessionsOf, sshOfSession } from './termSessions';

const row = (o: Record<string, unknown>) => ({ daemon_program: false, is_ephemeral: false, is_active: true, client_count: 0, ...o });

describe('sessionsOf', () => {
  it('reads each session\'s facts: shell name, folder, ssh target, open windows, last use, shell ended', () => {
    expect(sessionsOf([
      row({ terminal_id: '3', shell: '/usr/bin/zsh', cwd: '/srv/app', client_count: 2, last_activity: 1000 }),
      row({ terminal_id: 1, shell: 'bash', is_ssh: true, ssh_host: 'db.example.com', ssh_user: 'ops', ssh_port: 2222, is_active: false }),
      row({ terminal_id: '2', is_ssh: true, ssh_host: 'h.example', ssh_user: null, ssh_port: '22' }),
    ])).toEqual([
      { n: 1, offered: true, shell: 'bash', cwd: null, ssh: 'ops@db.example.com:2222', sshTo: { host: 'db.example.com', user: 'ops', port: 2222 }, viewers: 0, lastActivity: null, running: false, incarnation: null },
      { n: 2, offered: true, shell: null, cwd: null, ssh: 'h.example', sshTo: { host: 'h.example', user: null, port: 22 }, viewers: 0, lastActivity: null, running: true, incarnation: null },
      { n: 3, offered: true, shell: 'zsh', cwd: '/srv/app', ssh: null, sshTo: null, viewers: 2, lastActivity: 1_000_000, running: true, incarnation: null },
    ]);
  });

  it('a program\'s terminal and a short-lived one hold their number but are not offered; one number listed twice is offered only if both rows are', () => {
    const got = sessionsOf([
      row({ terminal_id: '9', daemon_program: true }),
      row({ terminal_id: '8', is_ephemeral: true }),
      row({ terminal_id: '5' }),
      row({ terminal_id: '5', daemon_program: true }),
      row({ terminal_id: '6' }),
      row({ terminal_id: '6' }),
    ]);
    expect(got.map((s) => [s.n, s.offered])).toEqual([[5, false], [6, true], [8, false], [9, false]]);
  });

  it('skips rows without a Board number and facts that are not plain text; anything but a list is no sessions', () => {
    const got = sessionsOf([
      row({ terminal_id: '0' }), row({ terminal_id: '8001' }), row({ terminal_id: '15001' }), row({ terminal_id: '1.5' }), row({ terminal_id: '-2' }), row({ terminal_id: 'x' }), row({}),
      row({ id: '12', shell: 'bash\u001b[31m', cwd: 'a\nb', ssh_host: '  ', client_count: -1, last_activity: -5 }),
      row({ terminal_id: '8000', client_count: 1.5, last_activity: Number.NaN }),
      null, 'terminal-4', 7,
    ]);
    expect(got).toEqual([
      { n: 12, offered: true, shell: null, cwd: null, ssh: null, sshTo: null, viewers: 0, lastActivity: null, running: true, incarnation: null },
      { n: 8000, offered: true, shell: null, cwd: null, ssh: null, sshTo: null, viewers: 0, lastActivity: null, running: true, incarnation: null },
    ]);
    expect(sessionsOf({ sessions: [row({ terminal_id: '1' })] })).toEqual([]);
    expect(sessionsOf(null)).toEqual([]);
  });

  it('an ssh port is shown only when it is not 22 and a real port', () => {
    const ssh = (port: unknown) => sessionsOf([row({ terminal_id: '1', ssh_host: 'h', ssh_user: 'u', ssh_port: port })])[0]!.ssh;
    expect([ssh(22), ssh('2200'), ssh(70000), ssh('22x'), ssh(null)]).toEqual(['u@h', 'u@h:2200', 'u@h', 'u@h', 'u@h']);
  });
});

describe('sameSsh', () => {
  it('compares host, user and port each on its own: two targets with the same label are told apart', () => {
    const to = (port: unknown, host = '2001:db8::1') => sessionsOf([row({ terminal_id: '1', ssh_host: host, ssh_user: 'ops', ssh_port: port })])[0]!.sshTo;
    expect(sameSsh(to(2222), { host: '2001:db8::1', user: 'ops', port: 2222 })).toBe(true);
    // ops@2001:db8::1:2222 both ways: the label matches, the target does not.
    expect(sameSsh(to(22, '2001:db8::1:2222'), { host: '2001:db8::1', user: 'ops', port: 2222 })).toBe(false);
    expect(sameSsh(to(null), { host: '2001:db8::1', user: 'ops', port: 22 })).toBe(true);
    expect(sameSsh(null, { host: 'h', user: 'u', port: 22 })).toBe(false);
  });
});

describe('sessionsOf incarnation', () => {
  it('keeps a shell\'s incarnation only in its exact form', () => {
    const inc = (v: unknown) => sessionsOf([row({ terminal_id: '1', incarnation: v })])[0]!.incarnation;
    expect([inc('0123456789abcdef0123456789abcdef'), inc('0123456789ABCDEF0123456789abcdef'), inc('0123456789abcdef0123456789abcde'), inc(null)]).toEqual(['0123456789abcdef0123456789abcdef', null, null, null]);
  });
});

describe('nextFree', () => {
  it('is the number after the highest one held, at least 1, ignoring numbers outside the Board\'s', () => {
    expect(nextFree([])).toBe(1);
    expect(nextFree([1, 5, 3])).toBe(6);
    expect(nextFree([2, 20000, 0, 1.5])).toBe(3);
  });
  it('past the Board\'s last number it is the lowest free one, and null when every number is held', () => {
    expect(nextFree([1, 2, 8000])).toBe(3);
    expect(nextFree([8000])).toBe(1);
    const all = Array.from({ length: 8000 }, (_, i) => i + 1);
    expect(nextFree(all)).toBeNull();
    expect(nextFree(all.filter((n) => n !== 777))).toBe(777);
  });
  it('a listed ssh session as a tile destination: host, user and port; none without a user or without ssh', () => {
    expect(sshOfSession({ host: 'db.example.com', user: 'ops', port: 2222 })).toEqual({ host: 'db.example.com', user: 'ops', port: 2222 });
    expect(sshOfSession({ host: 'db.example.com', user: null, port: 22 })).toBeNull();
    expect(sshOfSession(null)).toBeNull();
    expect(sshOfSession(undefined)).toBeNull();
  });
});

describe('bandOf', () => {
  it('the launch-band numbers the list names (8001-9999), as a number or its exact decimal; nothing else', () => {
    expect([...bandOf([row({ terminal_id: 8502 }), row({ id: '9999', terminal_id: '9999' }), row({ terminal_id: '8000' }), row({ terminal_id: '15001' }), row({ terminal_id: '08600' }), row({ id: '8700', terminal_id: '8701' })])].sort()).toEqual([8502, 9999]);
    expect(bandOf({ sessions: [row({ terminal_id: 8502 })] }).size).toBe(0);
    expect(bandOf(null).size).toBe(0);
    expect(bandOf([null, 'x', [8502]]).size).toBe(0);
  });
});
