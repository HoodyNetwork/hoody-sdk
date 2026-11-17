// The pull request and issue answers → what the views draw, a create's 200 → made or unknown, the title match a Check
// offers, and where every call goes (the folder's computer, realm and path; the lists also the repository).
import { fixtureWorld } from '@core';
import { describe, expect, it } from 'vitest';
import type { FolderAt } from './data';
import { OUTPUT_MAX, forgetOutputIf, forgetSent, heldOutput, issuesOf, madeOf, noteOutput, outputOf, prRoutes, prTable, pullsOf, safeUrl, sameTitle } from './pulls';

const C = fixtureWorld.computers.find((c) => c.name === 'borealis')!;
const AT: FolderAt = { target: { project: { id: C.project_id }, container: { id: C.id, server_name: C.server_name } }, realm: C.realm_ids[0]!, cwd: '/home/ada/shop' };

describe('pull requests and issues read as answers, never guesses', () => {
  it('a pull request list keeps number, title, display state, author, branch and an http(s) link', () => {
    expect(pullsOf({ status: 'ok', pulls: [
      { number: 12, title: 'T', state: 'open', author: 'ada', head: 'b', url: 'https://github.com/a/b/pull/12' },
      { number: 3, title: 'M', state: 'weird', merged: true, author: 'x', head: 'h', url: 'javascript:alert(1)' },
      { number: 0, title: 'no number' }, 'junk',
    ] }, 'Ada/Shop')).toEqual([
      { number: 12, title: 'T', state: 'open', author: 'ada', head: 'b', url: 'https://github.com/a/b/pull/12', repo: 'ada/shop' },
      { number: 3, title: 'M', state: 'merged', author: 'x', head: 'h', url: '', repo: 'ada/shop' },
    ]);
    expect(pullsOf({ status: 'ok', pulls: [] }, 'ada/shop')).toEqual([]);
    for (const bad of [null, {}, { status: 'ok' }, { status: 'error', pulls: [] }, { status: 'ok', pulls: {} }]) expect(() => pullsOf(bad, 'ada/shop')).toThrow();
  });
  it('an issue list keeps open/closed only', () => {
    expect(issuesOf({ status: 'ok', issues: [{ number: 5, title: 'I', state: 'closed', author: 'g', url: 'http://ghe.example/a/b/issues/5' }, { number: 6, title: 'J', state: 'odd' }] })).toEqual([
      { number: 5, title: 'I', state: 'closed', author: 'g', url: 'http://ghe.example/a/b/issues/5' },
      { number: 6, title: 'J', state: 'open', author: '', url: '' },
    ]);
    expect(() => issuesOf({ status: 'ok' })).toThrow();
  });
  it('safeUrl opens http(s) only', () => {
    expect(safeUrl('https://github.com/x')).toBe('https://github.com/x');
    for (const bad of ['javascript:x', 'data:text/html,x', '/relative', '', 42, null]) expect(safeUrl(bad)).toBe('');
  });
});

describe('a create answer', () => {
  it('a 200 that ran and succeeded is made, with the last link gh printed for its kind', () => {
    expect(madeOf({ status: 'ok', success: true, output: 'see https://github.com/a/b/issues/1\nhttps://github.com/a/b/issues/7\n' }, 'issues')).toEqual({ kind: 'made', url: 'https://github.com/a/b/issues/7', number: 7 });
    expect(madeOf({ status: 'ok', success: true, output: 'https://github.com/a/b/pull/13' }, 'pull')).toEqual({ kind: 'made', url: 'https://github.com/a/b/pull/13', number: 13 });
    // A pull link is not an issue link, and no link is still made (the list shows it).
    expect(madeOf({ status: 'ok', success: true, output: 'https://github.com/a/b/pull/13' }, 'issues')).toEqual({ kind: 'made', url: '', number: 0 });
  });
  it('a 200 that does not say the command succeeded proves nothing', () => {
    for (const raw of [{ status: 'ok' }, { status: 'ok', success: false }, { status: 'ok', success: true, timed_out: true }, null, 'x']) expect(madeOf(raw, 'issues')).toEqual({ kind: 'unknown' });
  });
  it('core settles a send only on a 200 saying gh ran to the end; any other 200 stays held (settles)', () => {
    const c = prTable.changes;
    const ok = { status: 'ok', success: true, timed_out: false, output: 'https://github.com/a/b/issues/3' };
    for (const raw of [{ status: 'ok' }, { status: 'ok', success: false }, { status: 'ok', success: true, timed_out: true }, null, 'x', []]) {
      expect(c.createIssue.settles(raw)).toBe(false);
      expect(c.createPull.settles(raw)).toBe(false);
      expect(c.checkoutPull.settles(raw)).toBe(false);
      expect(c.mergePull.settles(raw)).toBe(false);
    }
    expect(c.createIssue.settles(ok)).toBe(true);
    expect(c.createPull.settles({ ...ok, output: '' })).toBe(true);
    expect(c.checkoutPull.settles(ok)).toBe(true);
    expect(c.mergePull.settles({ success: true })).toBe(true);
  });
});

describe('Check offers the same title, never claims one', () => {
  it('the same words match whatever their case and spacing; anything else does not', () => {
    expect(sameTitle('Port is fixed', '  port   IS fixed ')).toBe(true);
    expect(sameTitle('Port is fixed', 'Port is fixed at 8080')).toBe(false);
    expect(sameTitle('', '')).toBe(false);
    expect(sameTitle('   ', ' ')).toBe(false);
  });
});

describe('where the calls go', () => {
  it('every route names the folder (cwd) and one realm', () => {
    for (const r of Object.values(prRoutes)) expect([r.cwd, r.realm]).toEqual([true, 'realm']);
  });
  it('the lists name the repository and the state; the sends carry only what the person wrote', () => {
    expect(prTable.reads.pulls.input({ ...AT, owner: 'ada', repo: 'shop', state: 'all' })).toEqual({ target: AT.target, realm: AT.realm, cwd: AT.cwd, query: { owner: 'ada', repo: 'shop', state: 'all' } });
    expect(prTable.changes.createIssue.input({ ...AT, title: '  Port  ', body: 'b' })).toEqual({ target: AT.target, realm: AT.realm, cwd: AT.cwd, body: { title: 'Port', body: 'b' } });
    expect(prTable.changes.createPull.input({ ...AT, title: 'T', body: '', base: ' ' }).body).toEqual({ title: 'T', body: '' });
    expect(prTable.changes.createPull.input({ ...AT, title: 'T', body: '', base: 'main' }).body).toEqual({ title: 'T', body: '', base: 'main' });
    expect(prTable.changes.mergePull.input({ ...AT, number: 12, method: 'squash', repo: 'ada/shop' }).body).toEqual({ number: 12, method: 'squash' });
  });
  it('a create is held per folder and title, an equal title (case, spacing) under the same lock; its body is never part of it', () => {
    const key = (title: string, body = '') => prTable.changes.createIssue.lockKey({ ...AT, title, body });
    expect(key(' Port  Bug ', 'secret-ish words')).toEqual({ computer: C.id, realm: AT.realm, cwd: AT.cwd, title: 'port bug' });
    expect(key('port bug')).toEqual(key('PORT   bug '));
    expect(key('port bug')).not.toEqual(key('port bugs'));
    expect(prTable.changes.createPull.lockKey({ ...AT, title: 'A  b', body: '', base: '' })).toEqual(prTable.changes.createPull.lockKey({ ...AT, title: 'a B', body: 'x', base: 'main' }));
    // What the band shows keeps the words as sent.
    expect(prTable.changes.createIssue.identity({ ...AT, title: ' Port  Bug ', body: '' })).toEqual({ computer: C.id, realm: AT.realm, cwd: AT.cwd, title: 'Port  Bug' });
  });
  it('a merge is proven only by a list of its own repository that reads it merged', () => {
    const proves = prTable.changes.mergePull.proves;
    const id = prTable.changes.mergePull.identity({ ...AT, number: 12, method: 'merge', repo: 'Ada/Shop' });
    expect(id).toMatchObject({ number: 12, repo: 'ada/shop' });
    expect(proves(id, [[[{ number: 12, state: 'merged', repo: 'ada/shop' }]]])).toBe('applied');
    // Another repository's merged #12 (another folder's list on the same computer) proves nothing.
    expect(proves(id, [[[{ number: 12, state: 'merged', repo: 'ada/other' }]]])).toBeUndefined();
    expect(proves(id, [[[{ number: 12, state: 'merged', repo: 'ada/other' }], [{ number: 12, state: 'open', repo: 'ada/shop' }]]])).toBeUndefined();
    expect(proves(id, [[[{ number: 12, state: 'open', repo: 'ada/shop' }]]])).toBeUndefined();
    expect(proves(id, [[[{ number: 9, state: 'merged', repo: 'ada/shop' }]]])).toBeUndefined();
    expect(proves({ ...id, repo: '' }, [[[{ number: 12, state: 'merged', repo: '' }]]])).toBeUndefined();
    expect(proves(id, [[]])).toBeUndefined();
  });
  it('the merge lock is the folder and number (the method and repository name are not a second merge)', () => {
    const k = (method: 'merge' | 'squash', repo: string) => prTable.changes.mergePull.lockKey({ ...AT, number: 12, method, repo });
    expect(k('merge', 'ada/shop')).toEqual(k('squash', 'Ada/Shop'));
  });
  it('a create and a checkout have no proof: only the person settles them', () => {
    expect('proves' in prTable.changes.createIssue).toBe(false);
    expect('proves' in prTable.changes.createPull).toBe(false);
    expect('proves' in prTable.changes.checkoutPull).toBe(false);
  });
  it('the four sends keep the agent\'s details (gh\'s output); outputOf reads only a string output', () => {
    for (const r of [prRoutes.createIssue, prRoutes.createPull, prRoutes.checkoutPull, prRoutes.mergePull]) expect(r.keepDetails).toBe(true);
    for (const r of [prRoutes.pulls, prRoutes.issues]) expect((r as { keepDetails?: unknown }).keepDetails).not.toBe(true);
    expect(outputOf({ details: { output: '  fatal: x\n' } })).toBe('fatal: x');
    for (const d of [undefined, {}, { output: 3 }, { output: ['x'] }, { output: '   ' }]) expect(outputOf(d === undefined ? undefined : { details: d as Record<string, unknown> })).toBe('');
  });
  it('gh\'s output is kept per held send (its hold token), only for a pending send with output', () => {
    forgetSent();
    noteOutput({ outcome: 'pending', hold: 'h1', details: { output: 'out1' } });
    noteOutput({ outcome: 'failed', hold: 'h2', details: { output: 'out2' } });
    noteOutput({ outcome: 'pending', details: { output: 'out3' } });
    noteOutput({ outcome: 'pending', hold: 'h4' });
    expect([heldOutput('h1'), heldOutput('h2'), heldOutput('h4'), heldOutput(undefined)]).toEqual(['out1', '', '', '']);
    forgetSent();
    expect(heldOutput('h1')).toBe('');
  });
  it('the outputs are bounded: a completed or dismissed hold drops its own entry (a refused call keeps it), and only the newest OUTPUT_MAX stay', () => {
    forgetSent();
    const note = (h: string) => noteOutput({ outcome: 'pending', hold: h, details: { output: 'out ' + h } });
    note('a'); note('b');
    expect(forgetOutputIf('a')(false)).toBe(false);
    expect(heldOutput('a')).toBe('out a');
    expect(forgetOutputIf('a')(true)).toBe(true);
    expect([heldOutput('a'), heldOutput('b')]).toEqual(['', 'out b']);
    forgetSent();
    for (let i = 0; i < OUTPUT_MAX + 3; i++) note('h' + i);
    expect(OUTPUT_MAX).toBe(16);
    expect([heldOutput('h0'), heldOutput('h1'), heldOutput('h2')]).toEqual(['', '', '']);
    expect(heldOutput('h3')).toBe('out h3');
    expect(heldOutput('h' + (OUTPUT_MAX + 2))).toBe('out h' + (OUTPUT_MAX + 2));
    // A hold noted again is the newest, not evicted first.
    note('h3');
    note('x');
    expect([heldOutput('h3'), heldOutput('h4')]).toEqual(['out h3', '']);
    forgetSent();
  });
  it('only an unreadable account store is a refusal; a ran-but-failed command and a timeout may have made it', () => {
    for (const r of [prRoutes.createIssue, prRoutes.createPull, prRoutes.checkoutPull, prRoutes.mergePull]) {
      expect(r.refuses).toEqual(['github_store_unavailable']);
      expect(r.idem).toBeFalsy();
    }
  });
});
