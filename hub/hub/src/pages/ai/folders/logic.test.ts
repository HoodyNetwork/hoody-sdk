// The agent's repository answers → what the Repository tab draws. Unclear answers throw (the read fails, never a
// guess); account failures need the agent's github_ code.
import { describe, expect, it } from 'vitest';
import { STAGED_DIFF, UNSTAGED_DIFF } from './fixtures';
import { ACCOUNT_FAILURES, TRUNCATED, accountFailureOf, branchesOf, diffOf, identityOf, logOf, statusOf } from './logic';

describe('statusOf', () => {
  it('a work tree: its branch, counts and the time the Hub read it (the answer names no fetch time)', () => {
    expect(statusOf({ status: 'ok', cloned: true, branch: 'main', detached: false, ahead: 1, behind: 2, changed: 3, untracked: 4, conflicts: 5 }, 1234))
      .toEqual({ kind: 'repo', branch: 'main', detached: false, ahead: 1, behind: 2, changed: 3, untracked: 4, conflicts: 5, readAt: 1234 });
  });
  it('cloned:false is not a repository', () => {
    expect(statusOf({ status: 'ok', cloned: false }, 1)).toEqual({ kind: 'none' });
  });
  it('a detached head says so', () => {
    expect(statusOf({ status: 'ok', cloned: true, branch: '', detached: true }, 1)).toMatchObject({ kind: 'repo', detached: true, ahead: 0 });
    expect(statusOf({ status: 'ok', cloned: true, branch: 'm', detached: 'yes' }, 1)).toMatchObject({ detached: false });
  });
  it('anything else throws: no status, a missing cloned, a non-object', () => {
    for (const raw of [null, [], 'ok', { status: 'error', cloned: true }, { status: 'ok' }, { status: 'ok', cloned: 'yes' }]) expect(() => statusOf(raw, 1)).toThrow('NOT_A_STATUS');
  });
  it('a count that is not a whole number ≥ 0 reads as 0', () => {
    expect(statusOf({ status: 'ok', cloned: true, branch: 'm', ahead: -1, behind: 1.5, changed: '3', untracked: 2 }, 1)).toMatchObject({ ahead: 0, behind: 0, changed: 0, untracked: 2 });
  });
});

describe('diffOf', () => {
  it('cuts the unstaged diff into files: a modification with its counts and a deletion under its old path', () => {
    const d = diffOf({ status: 'ok', diff: UNSTAGED_DIFF });
    expect(d.truncated).toBe(false);
    expect(d.files.map((f) => [f.path, f.kind, f.added, f.removed, f.binary, f.from])).toEqual([
      ['src/app.ts', 'M', 2, 1, false, null],
      ['docs/old.md', 'D', 0, 2, false, null],
    ]);
    expect(d.files[0]!.text.startsWith('diff --git a/src/app.ts')).toBe(true);
    expect(d.files[0]!.text).not.toContain('docs/old.md');
    expect(d.files[1]!.text.endsWith('-Gone.')).toBe(true);
  });
  it('a rename names both paths; a new binary file has no line counts and its name from the diff --git line', () => {
    const d = diffOf({ status: 'ok', diff: STAGED_DIFF });
    expect(d.files.map((f) => [f.path, f.kind, f.from, f.binary, f.added, f.removed])).toEqual([
      ['src/helpers.ts', 'R', 'src/util.ts', false, 1, 1],
      ['assets/logo.png', 'A', null, true, 0, 0],
    ]);
  });
  it('a pure rename (no hunks, no ---/+++) takes its new name from rename to', () => {
    const d = diffOf({ status: 'ok', diff: 'diff --git a/x b/y\nsimilarity index 100%\nrename from x\nrename to y\n' });
    expect(d.files).toEqual([expect.objectContaining({ path: 'y', from: 'x', kind: 'R', added: 0, removed: 0 })]);
  });
  it('names with spaces (a diff --git line that does not split): a rename takes rename to, a deletion its --- path', () => {
    const r = diffOf({ status: 'ok', diff: 'diff --git a/my notes b/our notes\nsimilarity index 100%\nrename from my notes\nrename to our notes\n' });
    expect(r.files.map((f) => [f.path, f.from, f.kind])).toEqual([['our notes', 'my notes', 'R']]);
    const d = diffOf({ status: 'ok', diff: 'diff --git a/old notes.md b/old notes.md\ndeleted file mode 100644\n--- a/old notes.md\n+++ /dev/null\n@@ -1 +0,0 @@\n-gone\n' });
    expect(d.files.map((f) => [f.path, f.kind, f.removed])).toEqual([['old notes.md', 'D', 1]]);
  });
  it('unquoted names with spaces and no ---/+++ lines (binary, empty new file, mode change) keep their file', () => {
    const bin = diffOf({ status: 'ok', diff: 'diff --git a/assets/my logo.png b/assets/my logo.png\nBinary files a/assets/my logo.png and b/assets/my logo.png differ\n' });
    expect(bin.files.map((f) => [f.path, f.kind, f.binary])).toEqual([['assets/my logo.png', 'M', true]]);
    const empty = diffOf({ status: 'ok', diff: 'diff --git a/new file.txt b/new file.txt\nnew file mode 100644\nindex 0000000..e69de29\n' });
    expect(empty.files.map((f) => [f.path, f.kind])).toEqual([['new file.txt', 'A']]);
    const gone = diffOf({ status: 'ok', diff: 'diff --git a/old file.txt b/old file.txt\ndeleted file mode 100644\nindex e69de29..0000000\n' });
    expect(gone.files.map((f) => [f.path, f.kind])).toEqual([['old file.txt', 'D']]);
    const mode = diffOf({ status: 'ok', diff: 'diff --git a/run me.sh b/run me.sh\nold mode 100644\nnew mode 100755\n' });
    expect(mode.files.map((f) => [f.path, f.kind])).toEqual([['run me.sh', 'M']]);
  });
  it('a section whose names cannot be read is kept under its header text, never dropped', () => {
    const d = diffOf({ status: 'ok', diff: 'diff --git a/x b/y z\nold mode 100644\nnew mode 100755\n' });
    expect(d.files).toHaveLength(1);
    expect(d.files[0]!.path).toBe('a/x b/y z');
    // Two halves of one length whose names differ cannot be paired without rename lines: no guess, the header text stays.
    expect(diffOf({ status: 'ok', diff: 'diff --git a/ab c b/xy z\nold mode 100644\nnew mode 100755\n' }).files[0]!.path).toBe('a/ab c b/xy z');
  });
  it('a combined conflict section (diff --cc) is a file of its own, kind U, with both columns counted', () => {
    const cc = [
      'diff --cc src/app.ts',
      'index 1111111,2222222..0000000',
      '--- a/src/app.ts',
      '+++ b/src/app.ts',
      '@@@ -1,1 -1,1 +1,5 @@@',
      '++<<<<<<< HEAD',
      ' +start(8080);',
      '++=======',
      '+ start(9090);',
      '++>>>>>>> theirs',
      ' - old();',
      'diff --cc assets/logo.png',
      'index 3333333,4444444..0000000',
      'Binary files differ',
      '',
    ].join('\n');
    const d = diffOf({ status: 'ok', diff: cc });
    expect(d.files.map((f) => [f.path, f.kind, f.added, f.removed, f.binary])).toEqual([
      ['src/app.ts', 'U', 5, 1, false],
      ['assets/logo.png', 'U', 0, 0, true],
    ]);
    expect(diffOf({ status: 'ok', diff: 'diff --combined a.txt\n@@@ -1 -1 +1 @@@\n++x\n' }).files.map((f) => [f.path, f.kind])).toEqual([['a.txt', 'U']]);
  });
  it('a mode change only takes its name from the diff --git line', () => {
    const d = diffOf({ status: 'ok', diff: 'diff --git a/run.sh b/run.sh\nold mode 100644\nnew mode 100755\n' });
    expect(d.files.map((f) => [f.path, f.kind])).toEqual([['run.sh', 'M']]);
  });
  it('lines starting --- or +++ inside a hunk are counted, never read as a header', () => {
    const d = diffOf({ status: 'ok', diff: 'diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1 +1 @@\n--- old dash line\n+++ new plus line\n' });
    expect(d.files[0]).toMatchObject({ path: 'a', added: 1, removed: 1 });
  });
  it('the cap marker is cut off and reported', () => {
    const d = diffOf({ status: 'ok', diff: UNSTAGED_DIFF + TRUNCATED + '\n' });
    expect(d.truncated).toBe(true);
    expect(d.files.at(-1)!.text).not.toContain(TRUNCATED);
  });
  it('CRLF reads like LF; an empty diff has no files', () => {
    expect(diffOf({ status: 'ok', diff: UNSTAGED_DIFF.replace(/\n/g, '\r\n') }).files.map((f) => f.path)).toEqual(['src/app.ts', 'docs/old.md']);
    const crlf = diffOf({ status: 'ok', diff: 'diff --git a/x b/y\r\nrename from x\r\nrename to y\r\n' });
    expect(crlf.files.map((f) => [f.path, f.from])).toEqual([['y', 'x']]);
    expect(diffOf({ status: 'ok', diff: UNSTAGED_DIFF.replace(/\n/g, '\r\n') }).files.every((f) => !f.text.includes('\r'))).toBe(true);
    expect(diffOf({ status: 'ok', diff: '' })).toEqual({ files: [], truncated: false });
  });
  it('quoted paths are unquoted', () => {
    const d = diffOf({ status: 'ok', diff: 'diff --git "a/sp ace" "b/sp ace"\n--- "a/sp ace"\n+++ "b/sp ace"\n@@ -1 +1 @@\n-a\n+b\n' });
    expect(d.files[0]!.path).toBe('sp ace');
  });
  it('a diff that is not a string throws', () => {
    for (const raw of [null, { status: 'ok' }, { status: 'ok', diff: 3 }, { status: 'no', diff: '' }]) expect(() => diffOf(raw)).toThrow('NOT_A_DIFF');
  });
});

describe('logOf, branchesOf, identityOf', () => {
  it('commits keep their fields; a row without a hex sha is dropped; an empty list is no commits yet', () => {
    expect(logOf({ status: 'ok', commits: [{ sha: 'abc1234', subject: 's', author: 'a', age: '1 day ago' }, { sha: 'zz', subject: 'x' }, 'no'] }))
      .toEqual([{ sha: 'abc1234', subject: 's', author: 'a', age: '1 day ago' }]);
    expect(logOf({ status: 'ok', commits: [] })).toEqual([]);
    expect(() => logOf({ status: 'ok' })).toThrow('NOT_A_LOG');
  });
  it('branches keep name, upstream and current (true only when true); a nameless row is dropped', () => {
    expect(branchesOf({ status: 'ok', branches: [{ name: 'main', upstream: 'origin/main', current: true }, { name: 'b', current: 'yes' }, { upstream: 'x' }] }))
      .toEqual([{ name: 'main', upstream: 'origin/main', current: true }, { name: 'b', upstream: '', current: false }]);
    expect(() => branchesOf({ status: 'ok', branches: {} })).toThrow('NOT_BRANCHES');
  });
  it('the identity is owner/repo, from full_name or both parts; anything else throws', () => {
    expect(identityOf({ status: 'ok', full_name: 'ada/shop' })).toEqual({ fullName: 'ada/shop' });
    expect(identityOf({ status: 'ok', owner: 'ada', repo: 'shop.v2' })).toEqual({ fullName: 'ada/shop.v2' });
    for (const raw of [{ status: 'ok' }, { status: 'ok', full_name: 'a/b/c' }, { status: 'ok', owner: 'ada' }]) expect(() => identityOf(raw)).toThrow('NOT_AN_IDENTITY');
  });
});

describe('accountFailureOf', () => {
  it('each github_ account code is its kind', () => {
    for (const k of ACCOUNT_FAILURES) expect(accountFailureOf(`github_${k}`)).toBe(k);
  });
  it('a bare kind, another github_ code, or no code is not an account failure', () => {
    for (const c of ['not_linked', 'github_login_expired', 'github_', 'bad_gateway', '', null, undefined]) expect(accountFailureOf(c)).toBeNull();
  });
});
