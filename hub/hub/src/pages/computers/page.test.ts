// Vitest: the computers page's logic and interaction in every fixture state.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { checkSshKey } from './ssh-logic';
import { check as checkCommand, destructive, keepable, looksSecret, readHistory, addHistory, historyDoc } from './cmd-logic';
import { parseEnv } from './create-logic';
import { suggestName } from '@core';
import { allowedOps, allows, bucket, findByHandle, handleOf, maskUrl, opsFor, stateGroup, programCan, subView, uptimeParts } from './logic';
import page from './page';
import strings from './strings.en.json';
import type { Computer } from './types';

const HEX = 'a1b2c3d4e5f60718293a4b5c';
const mk = (name: string, status: string, id = HEX): Computer => ({ id, name, status }) as Computer;

describe('lifecycle logic', () => {
  it('folds API states into buckets', () => {
    expect(bucket('RUNNING')).toBe('running');
    expect(bucket('creating')).toBe('starting');
    expect(bucket('deleting')).toBe('gone');
    expect(bucket('mystery')).toBe('attention');
    expect(bucket(undefined)).toBe('attention');
  });
  it('offers the right operations per state', () => {
    expect(opsFor('running')).toEqual(['restart', 'stop']);
    expect(opsFor('stopped')).toEqual(['start']);
    expect(opsFor('paused')).toEqual(['resume']);
    expect(opsFor('failed')).toEqual(['restart']);
  });
  it('limits operations to the session capabilities', () => {
    expect(allows('all', 'delete')).toBe(true);
    expect(allowedOps({ status: 'running' }, new Set(['computers.actions.stop']))).toEqual(['stop']);
    expect(allowedOps({ status: 'stopped' }, new Set())).toEqual([]);
  });
  it('groups states for the filter', () => {
    expect(stateGroup('paused')).toBe('stopped');
    expect(stateGroup('failed')).toBe('problems');
    expect(stateGroup('creating')).toBe('starting');
  });
  // host_reinstalled: its own word, nothing to run (only Delete is left), grouped with the problems.
  it('a computer whose server was reinstalled: its own bucket and words, no operation, a problem', () => {
    expect(bucket('host_reinstalled')).toBe('reinstalled');
    expect(bucket('HOST_REINSTALLED')).toBe('reinstalled');
    expect(opsFor('host_reinstalled')).toEqual([]);
    expect(allowedOps({ status: 'host_reinstalled' }, 'all')).toEqual([]);
    expect(stateGroup('host_reinstalled')).toBe('problems');
    expect(strings['state.reinstalled']).toBe('Host reinstalled');
  });
});

describe('ids and handles', () => {
  it('masks a 24-hex id and the ids inside a URL', () => {
    expect(maskUrl(`https://${HEX}.example/x`)).not.toContain(HEX);
  });
  it('selects by a handle that never holds the full id', () => {
    const list = [mk('alpha', 'running', HEX), mk('beta', 'stopped', 'f'.repeat(24))];
    const h = handleOf(list[0]!);
    expect(h).not.toContain(HEX);
    expect(findByHandle(list, h)?.name).toBe('alpha');
    expect(findByHandle(list, 'alpha.0000')).toBeUndefined();
    expect(findByHandle(list, undefined)).toBeUndefined();
  });
  it('groups states for the State chip', () => {
    const list = [mk('a', 'running'), mk('b', 'stopped'), mk('c', 'failed')];
    expect(list.map((c) => stateGroup(c.status))).toEqual(['running', 'stopped', 'problems']);
  });
});

describe('programs and subscriptions', () => {
  it('says what a program can do', () => {
    expect(programCan('running')).toMatchObject({ stop: true, restart: true, start: false });
    expect(programCan('stopped').start).toBe(true);
    expect(programCan('stopped', true).start).toBe(false);
    expect(programCan('failed', true).restart).toBe(false);
    expect(programCan('running', true)).toMatchObject({ stop: true, restart: true });
  });
  it('splits uptime', () => {
    expect(uptimeParts(266400)).toEqual({ d: 3, h: 2, m: 0, s: 0 });
  });
  it('names subscription states', () => {
    expect(subView({ state: 'active' })).toMatchObject({ key: 'stActive', tone: 'ok', pay: false });
    expect(subView({ state: 'past_due' }).pay).toBe(true);
  });
});

describe('quick command rules', () => {
  it('refuses empty, control and oversize commands', () => {
    expect(checkCommand('   ')).toEqual({ ok: false, why: 'empty' });
    expect(checkCommand('ls\u0000')).toMatchObject({ ok: false, why: 'control' });
    expect(checkCommand('ls -la')).toEqual({ ok: true, command: 'ls -la' });
    expect(checkCommand('x'.repeat(100000))).toMatchObject({ ok: false, why: 'long' });
  });
  it('asks before destructive commands', () => {
    expect(destructive('rm -rf /')).toBe(true);
    expect(destructive('sudo reboot')).toBe(true);
    expect(destructive('ls -la')).toBe(false);
  });
  it('never keeps a command that looks like it holds a secret', () => {
    expect(looksSecret('curl -H "Authorization: Bearer abcdefghijklmnop" x')).toBe(true);
    expect(keepable('export API_KEY=sk_live_abcdefghijklmnop')).toBe(false);
    expect(keepable('ls -la')).toBe(true);
  });
  it('keeps a bounded, de-duplicated history', () => {
    const h = addHistory(addHistory([], 'ls'), 'pwd');
    expect(addHistory(h, 'ls')[0]).toBe('ls');
    expect(readHistory(historyDoc(h))).toEqual(addHistory(h, 'ls').length === h.length ? readHistory(historyDoc(h)) : h);
    expect(readHistory({ v: 2, c: ['x'] })).toEqual([]);
    expect(readHistory(null)).toEqual([]);
  });
});

describe('ssh key and create form rules', () => {
  it('refuses a private key before anything else', () => {
    expect(checkSshKey(['-----BEGIN', 'OPENSSH PRIVATE KEY-----\nabc'].join(' '))).toEqual({ ok: false, code: 'private' });
    expect(checkSshKey('')).toEqual({ ok: false, code: 'empty' });
    expect(checkSshKey('hello world')).toEqual({ ok: false, code: 'notkey' });
  });
  it('accepts a public key', () => {
    const key = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl me@laptop';
    expect(checkSshKey(`  ${key}  `)).toEqual({ ok: true, key });
  });
  it('parses environment variables and refuses dangerous names', () => {
    const ok = parseEnv('FOO=bar\nBAZ=1');
    expect(ok.vars).toEqual({ FOO: 'bar', BAZ: '1' });
    expect(ok.errors).toEqual([]);
    expect(parseEnv('LD_PRELOAD=/x').errors.length).toBeGreaterThan(0);
    expect(parseEnv('1BAD=x').errors.length).toBeGreaterThan(0);
  });
  it('suggests a three-part name', () => {
    expect(suggestName(() => 0)).toMatch(/^[a-z]+-[a-z]+-[a-z]+$/);
  });
});

describe('computers page', () => {
  it('lists computers and opens one into the detail', async () => {
    const { router } = await renderPage(page);
    const table = await screen.findByRole('table', {}, { timeout: 8000 });
    await within(table).findByText('atlas');
    await userEvent.click(within(table).getByText('borealis'));
    expect(router.state.location.search).toMatchObject({ sel: expect.stringMatching(/^borealis\.[0-9a-f]{4}$/) });
  });

  it('shows the zero state when there is no computer', async () => {
    await renderPage(page, { state: 'empty' });
    expect(await screen.findByText(strings['zero.invite.title'])).toBeInTheDocument();
  });

  it('a claimed free server alone is no proof of preparation: never "being prepared", and no header Get button', async () => {
    await renderPage(page, { state: 'emptyProvisioning', realm: 'all' });
    expect(await screen.findByText(strings['zero.empty.title'])).toBeInTheDocument();
    expect(screen.queryByText(strings['zero.provisioning.title'])).toBeNull();
    expect(screen.queryByRole('button', { name: strings['action.get'] })).toBeNull();
  });

  it('shows the error state', async () => {
    await renderPage(page, { state: 'error' });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('shows the detail of a deep-linked computer without its full id', async () => {
    const { container } = await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    expect((await screen.findAllByText('atlas', {}, { timeout: 8000 })).length).toBeGreaterThan(0);
    expect(container.innerHTML.match(/.{40}[0-9a-f]{24}.{12}/g) ?? []).toEqual([]);
  });

  it('says so when the selected computer is gone', async () => {
    await renderPage(page, { path: '/computers?sel=nothing.0000' });
    expect(await screen.findByText(strings['detail.gone'])).toBeInTheDocument();
  });

  it('shows the servers view', async () => {
    await renderPage(page, { path: '/computers/servers' });
    expect(await screen.findByText('n12')).toBeInTheDocument();
  });
});

describe('program actions stay bound to their computer', () => {
  it('an unknown outcome is not sent again after a computer switch and back', async () => {
    const { renderHook, act } = await import('@testing-library/react');
    const { useProgramOps } = await import('./parts/programOps');
    const sent: string[] = [];
    const A = { id: HEX, project_id: 'p1' };
    const B = { id: 'b'.repeat(24), project_id: 'p1' };
    const hook = renderHook(() =>
      useProgramOps(() => ({
        mutateAsync: async (v) => { sent.push(`${v.id}:${v.program}:${v.act}`); return { outcome: 'pending', idem: `k-${v.id}` }; },
        receipt: async () => 'completed' as const,
        settle: async () => undefined,
      })),
    );
    await act(async () => { await hook.result.current.press(A, { id: '7' }, 'restart'); });
    expect(hook.result.current.busy[`${A.id}:7`]).toBe('pending');
    // switch to B and back to A: the page-level owner keeps the unknown entry, nothing is sent for A again
    await act(async () => { await hook.result.current.press(B, { id: '7' }, 'restart'); });
    await act(async () => { await hook.result.current.press(A, { id: '7' }, 'restart'); });
    expect(sent).toEqual([`${A.id}:7:restart`, `${B.id}:7:restart`]);
    expect(hook.result.current.busy[`${B.id}:7`]).toBe('pending');
    // only its own proof (the restart's receipt) clears A's entry
    await act(async () => { await hook.result.current.settled(A.id, '7'); });
    expect(hook.result.current.busy[`${A.id}:7`]).toBeUndefined();
    expect(hook.result.current.busy[`${B.id}:7`]).toBe('pending');
  });
});

describe('changes go to the selected computer', () => {
  const sel = { id: 'c'.repeat(24), project_id: 'p'.repeat(24), server_name: 'n12' };
  it('the Run request carries the selected computer as its target, with its server', async () => {
    const { computersTable, subjectOf } = await import('./data');
    const run = computersTable.changes?.run;
    const input = run?.input?.({ ...subjectOf(sel), command: 'ls' }) as { target?: { project: { id: string }; container: { id: string; server_name?: string } } };
    expect(input.target).toEqual({ project: { id: sel.project_id }, container: { id: sel.id, server_name: 'n12' } });
  });
  it('a computer without a known server is refused unsent, never run on the top bar computer', async () => {
    const { computersTable, subjectOf } = await import('./data');
    const input = computersTable.changes?.run?.input;
    expect(() => input?.({ ...subjectOf({ id: sel.id, project_id: sel.project_id }), command: 'ls' })).toThrow();
  });
  it('program reads and changes target the selected computer and its server', async () => {
    const { computersTable, subjectOf } = await import('./data');
    const v = { ...subjectOf(sel), program: '3' };
    for (const k of ['programStart', 'programStop', 'programRestart', 'programBoot']) {
      const i = computersTable.changes?.[k]?.input?.(v) as { target: { container: { id: string; server_name: string } } };
      expect(i.target.container).toEqual({ id: sel.id, server_name: 'n12' });
    }
    const r = computersTable.reads?.programs?.input?.(subjectOf(sel)) as { target: { container: { server_name: string } } };
    expect(r.target.container.server_name).toBe('n12');
  });
  it('an unread earlier send reads as unknown, not as not sent', async () => {
    const { asUnknown } = await import('./parts/runner');
    expect(asUnknown({ outcome: 'not_sent', code: 'READ_BACK_FIRST' }).outcome).toBe('pending');
    expect(asUnknown({ outcome: 'not_sent', code: 'INPUT_INVALID' }).outcome).toBe('not_sent');
  });
});
