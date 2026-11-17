// The plain rules of the Claude Code copies: a preview is read whole or not at all, consent is per path and only for
// files the target holds (or could not check), an expired plan is never applied, and an apply's answer maps to C9.
import { describe, expect, it } from 'vitest';
import { applyResultOf, expired, EXPIRY_MARGIN_MS, filesApplyable, filesDoneOf, filesPlanOf, loginApplyable, loginDoneOf, loginPlanOf, overwriteOf, pathOk, askedPath, onTheWay, refusalKey, eligibleOf, settleCopies, writesOf, writtenPathsOf, type UnknownCopy } from './transfer';

const login = { preview_token: 't1', expires_ms: 1_000_000, target_path: '/home/u/.claude/.credentials.json', target_state: 'present', bytes: 412, preview: '{…} #ab' };
const files = (rows: unknown[], extra: Record<string, unknown> = {}) => ({ preview_token: 't2', expires_ms: 1_000_000, mode: 'dir', file_count: rows.length, total_bytes: 30, files: rows, ...extra });
const row = (path: string, target_state: string, size = 10) => ({ path, size, target_state });
const err = (kind: 'failed' | 'pending' | 'stale' | 'not_sent', code = '', reason?: string) =>
  ({ ok: false as const, err: { kind, code, status: 0, retryAfter: null, details: reason ? { reason } : {} } });

describe('previews', () => {
  it('a sign-in preview is a plan only when it is whole', () => {
    expect(loginPlanOf(login)).toEqual({ token: 't1', expiresMs: 1_000_000, targetPath: login.target_path, targetState: 'present', bytes: 412, outline: '{…} #ab' });
    for (const k of ['preview_token', 'expires_ms', 'target_state', 'bytes', 'preview'] as const) {
      const { [k]: _gone, ...rest } = login;
      expect(loginPlanOf(rest)).toBeNull();
    }
    expect(loginPlanOf({ ...login, target_state: 'maybe' })).toBeNull();
    expect(loginPlanOf({ ...login, preview_token: '  ' })).toBeNull();
    expect(loginPlanOf({ ...login, bytes: -1 })).toBeNull();
    expect(loginPlanOf(null)).toBeNull();
  });

  it('a sign-in plan names where it goes; no destination path means no plan, so no consent is asked blind', () => {
    const { target_path: _gone, ...noPath } = login;
    expect(loginPlanOf(noPath)).toBeNull();
    for (const bad of ['', '   ', 42, null, ['/x']]) expect(loginPlanOf({ ...login, target_path: bad })).toBeNull();
  });

  it('a files preview with one unreadable or repeated row, or a count that disagrees, is no plan (consent built from part of it could miss a file)', () => {
    expect(filesPlanOf(files([row('.claude/a', 'absent'), row('.claude/b', 'present')]))?.files).toHaveLength(2);
    expect(filesPlanOf(files([row('.claude/a', 'absent'), { path: '.claude/b', size: 1 }]))).toBeNull();
    expect(filesPlanOf(files([row('.claude/a', 'absent'), row('.claude/a', 'present')]))).toBeNull();
    expect(filesPlanOf(files([row('.claude/a', 'absent')], { file_count: 2 }))).toBeNull();
    // A count that matches only the readable rows: the unreadable one still spoils the plan.
    expect(filesPlanOf(files([row('.claude/a', 'absent'), { path: '.claude/b', size: 1 }], { file_count: 1 }))).toBeNull();
    expect(filesPlanOf(files([row('.claude/a', 'absent')], { mode: 'tree' }))).toBeNull();
    expect(filesPlanOf(files([row('', 'absent')]))).toBeNull();
  });
});

describe('consent and expiry', () => {
  const plan = filesPlanOf(files([row('.claude/a', 'absent'), row('.claude/b', 'present'), row('.claude/c', 'unknown'), row('.claude/d', 'present')]))!;

  it('overwrite holds only consented present/unknown paths, in plan order; an absent or foreign path is never sent', () => {
    expect(overwriteOf(plan, new Set())).toEqual([]);
    expect(overwriteOf(plan, new Set(['.claude/d', '.claude/c', '.claude/a', '.claude/zzz']))).toEqual(['.claude/c', '.claude/d']);
    expect(writesOf(plan, new Set())).toBe(1);
    expect(writesOf(plan, new Set(['.claude/b']))).toBe(2);
  });

  it('a plan writing nothing, or past its expiry margin, cannot be applied', () => {
    const allThere = filesPlanOf(files([row('.claude/b', 'present')]))!;
    expect(filesApplyable(allThere, new Set(), 0)).toBe(false);
    expect(filesApplyable(allThere, new Set(['.claude/b']), 0)).toBe(true);
    expect(filesApplyable(plan, new Set(), 1_000_000 - EXPIRY_MARGIN_MS - 1)).toBe(true);
    expect(filesApplyable(plan, new Set(), 1_000_000 - EXPIRY_MARGIN_MS)).toBe(false);
    expect(expired(plan, 2_000_000)).toBe(true);
    expect(filesApplyable(null, new Set(), 0)).toBe(false);
  });

  it('a sign-in on a target that holds one (or could not check) needs the tick; an absent target does not', () => {
    const p = loginPlanOf(login)!;
    expect(loginApplyable(p, false, 0)).toBe(false);
    expect(loginApplyable(p, true, 0)).toBe(true);
    expect(loginApplyable({ ...p, targetState: 'unknown' }, false, 0)).toBe(false);
    expect(loginApplyable({ ...p, targetState: 'absent' }, false, 0)).toBe(true);
    expect(loginApplyable(p, true, 1_000_000)).toBe(false);
  });

  it('a path is below home: no leading / or ~, no . .. or empty part', () => {
    for (const ok of ['.claude', '.claude/settings.json', 'notes/a b.md']) expect(pathOk(ok)).toBe(true);
    for (const bad of ['', ' ', '/etc/passwd', '~/.claude', '../x', '.claude/../x', 'a//b', './a', 'a/', 'a\0b']) expect(pathOk(bad)).toBe(false);
  });

  it('the path field\'s value: a folder drops its trailing "/", a file keeps it; a file path ending in "/" is on the way only when its folders are fine', () => {
    expect(askedPath('dir', '.claude/')).toBe('.claude');
    expect(askedPath('dir', '.claude//'), 'one "/" only: the rest is an empty part pathOk refuses').toBe('.claude/');
    expect(askedPath('file', '.claude/')).toBe('.claude/');
    expect(askedPath('file', 'notes.txt')).toBe('notes.txt');
    expect(onTheWay('file', '.claude/agents/')).toBe(true);
    for (const no of ['notes.txt', '', '/', '../', '~/', 'a//', '/etc/']) expect(onTheWay('file', no)).toBe(false);
    expect(onTheWay('dir', '.claude/')).toBe(false);
  });
});

describe('apply answers (C9)', () => {
  it('maps every answer: done, stale (reason), target changed, refused, pending, gone', () => {
    expect(applyResultOf({ ok: true, body: { imported: true, overwrote: true, prior_state: 'present', owner_only: false } }, loginDoneOf)).toEqual({ kind: 'done', body: { overwrote: true, ownerOnly: false } });
    expect(applyResultOf(err('failed', 'preview_stale', 'expired'), loginDoneOf)).toEqual({ kind: 'stale', why: 'expired' });
    expect(applyResultOf(err('failed', 'preview_stale', 'unknown'), loginDoneOf)).toEqual({ kind: 'stale', why: 'unknown' });
    expect(applyResultOf(err('failed', 'preview_stale', 'something'), loginDoneOf)).toEqual({ kind: 'stale', why: 'changed' });
    expect(applyResultOf(err('failed', 'target_exists'), loginDoneOf)).toEqual({ kind: 'stale', why: 'target' });
    expect(applyResultOf(err('failed', 'bad_request', 'overwrite_not_planned'), filesDoneOf)).toEqual({ kind: 'refused', code: 'bad_request', reason: 'overwrite_not_planned' });
    expect(applyResultOf(err('pending', 'outcome_unknown'), filesDoneOf)).toEqual({ kind: 'pending' });
    expect(applyResultOf(err('stale'), filesDoneOf)).toEqual({ kind: 'gone' });
  });

  it('a 200 that is not a whole receipt proves nothing: pending (may have copied), never done', () => {
    const login200 = { imported: true, overwrote: false, prior_state: 'absent', owner_only: true };
    expect(applyResultOf({ ok: true, body: login200 }, loginDoneOf)).toEqual({ kind: 'done', body: { overwrote: false, ownerOnly: true } });
    for (const body of [null, {}, 'ok', [], { ...login200, imported: false }, { ...login200, imported: 'yes' }, { ...login200, overwrote: 'no' }, { ...login200, owner_only: undefined }]) {
      expect(applyResultOf({ ok: true, body }, loginDoneOf)).toEqual({ kind: 'pending', unreadable: true });
    }
    const files200 = { files_written: 1, bytes: 4, written: ['.claude/a'], skipped: ['.claude/b'] };
    expect(applyResultOf({ ok: true, body: files200 }, filesDoneOf)).toEqual({ kind: 'done', body: { written: ['.claude/a'], skipped: ['.claude/b'], bytes: 4 } });
    for (const body of [null, {}, { files_written: 3, bytes: 42 }, { ...files200, written: ['.claude/a', 3], files_written: 2 }, { ...files200, skipped: 'x' }, { ...files200, files_written: 2 },
      { ...files200, files_written: '1' }, { ...files200, bytes: -1 }, { ...files200, written: '.claude/a' }]) {
      expect(applyResultOf({ ok: true, body }, filesDoneOf)).toEqual({ kind: 'pending', unreadable: true });
    }
  });

  it('refusal words: a known reason, an access refusal, anything else', () => {
    expect(refusalKey('source_unusable', 'source_empty')).toBe('why.source_empty');
    expect(refusalKey('bad_request', 'cross_realm')).toBe('why.cross_realm');
    expect(refusalKey('admin_required', '')).toBe('why.notAllowed');
    expect(refusalKey('unknown_agent', '')).toBe('why.other');
  });
});

describe('unknown copies are settled path by path', () => {
  const ALL: ReadonlySet<number> = new Set([1]);
  const u = (paths: string[], o: Partial<UnknownCopy> = {}): UnknownCopy => ({ id: 1, op: 'files', to: 'b', realm: 'r', paths, unreadable: false, state: 'unknown', ...o });
  it('a known state settles that path only; unknown, uncovered, another computer or kind, a copy still out: kept', () => {
    expect(settleCopies([u(['a', 'b'])], { op: 'files', to: 'b', realm: 'r', rows: [{ path: 'a', targetState: 'present' }] }, ALL)).toEqual([u(['b'])]);
    expect(settleCopies([u(['a'])], { op: 'files', to: 'b', realm: 'r', rows: [{ path: 'a', targetState: 'unknown' }] }, ALL)).toEqual([u(['a'])]);
    expect(settleCopies([u(['a'])], { op: 'files', to: 'b', realm: 'r', rows: [{ path: 'z', targetState: 'absent' }] }, ALL)).toEqual([u(['a'])]);
    expect(settleCopies([u(['a'])], { op: 'files', to: 'c', realm: 'r', rows: [{ path: 'a', targetState: 'absent' }] }, ALL)).toEqual([u(['a'])]);
    expect(settleCopies([u(['a'])], { op: 'login', to: 'b', realm: 'r', rows: [{ path: 'a', targetState: 'absent' }] }, ALL)).toEqual([u(['a'])]);
    expect(settleCopies([u(['a'], { state: 'out' })], { op: 'files', to: 'b', realm: 'r', rows: [{ path: 'a', targetState: 'absent' }] }, ALL)).toEqual([u(['a'], { state: 'out' })]);
    expect(settleCopies([u(['a', 'b'])], { op: 'files', to: 'b', realm: 'r', rows: [{ path: 'a', targetState: 'absent' }, { path: 'b', targetState: 'present' }] }, ALL)).toEqual([u([], { state: 'settled' })]);
  });
  it('the paths an apply may write: absent ones plus the consented ones', () => {
    const plan = filesPlanOf(files([row('.claude/a', 'absent'), row('.claude/b', 'present'), row('.claude/c', 'unknown')]))!;
    expect(writtenPathsOf(plan, new Set(['.claude/c']))).toEqual(['.claude/a', '.claude/c']);
  });
});

describe('a preview settles only the copies unknown when it was sent', () => {
  const u = (id: number, o: Partial<UnknownCopy> = {}): UnknownCopy => ({ id, op: 'files', to: 'b', realm: 'r', paths: ['a'], unreadable: false, state: 'unknown', ...o });
  const read = { op: 'files' as const, to: 'b', realm: 'r', rows: [{ path: 'a', targetState: 'absent' as const }] };
  it('eligible: unknown copies of the kind to the computer, never one still out, another kind or computer', () => {
    expect([...eligibleOf([u(1), u(2, { state: 'out' }), u(3, { op: 'login' }), u(4, { to: 'c' }), u(5, { state: 'settled' }), u(6, { realm: 'q' })], 'files', 'b', 'r')]).toEqual([1]);
    // A read made in another realm never settles a copy sent in this one.
    expect(settleCopies([u(1)], { ...read, realm: 'q' }, new Set([1]))).toEqual([u(1)]);
  });
  it('a copy that turned unknown after the preview was sent stays unknown, whatever the read shows', () => {
    const sentWhileOut = eligibleOf([u(1, { state: 'out' })], 'files', 'b', 'r');
    expect(settleCopies([u(1)], read, sentWhileOut)).toEqual([u(1)]);
    expect(settleCopies([u(1), u(2)], read, new Set([2]))).toEqual([u(1), u(2, { paths: [], state: 'settled' })]);
  });
});
