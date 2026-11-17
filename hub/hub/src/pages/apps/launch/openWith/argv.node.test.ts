// @vitest-environment node
// Vitest (node): literal argv delivery. Each fixed script runs under the real
// /bin/bash exactly as the launch sends it (`bash -c SCRIPT open-with <words…>` with the path only in HUB_OPEN_FILE
// or HUB_OPEN_DIR), against real files with hostile names. A dump program records what it received: exactly one
// argument equal to the path, the staged variable gone from its environment, and its folder.
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ARG0, DIR_VAR, FILE_VAR, PRE_CMD_DIR, PRE_CMD_FILE, SCRIPT_DIR, SCRIPT_FILE, SCRIPT_HERE, SCRIPT_RUN, launchablePath } from './argv';
import { planFor, scriptOf } from './plan';

const BASH = '/bin/bash';
let root = '';
let dump = '';
let out = '';

// The dump: its arguments NUL-separated, then whether either staged variable reached it, then its folder.
const DUMP = `#!/bin/bash
{ printf '%s\\0' "$#" "$@"; printf '%s\\0' "\${HUB_OPEN_FILE-UNSET}" "\${HUB_OPEN_DIR-UNSET}" "$PWD"; } > "$OW_OUT"
`;
interface Dump { args: string[]; file: string; dir: string; cwd: string }
function read(): Dump {
  const parts = readFileSync(out, 'utf8').split('\0');
  const n = Number(parts[0]);
  return { args: parts.slice(1, 1 + n), file: parts[1 + n]!, dir: parts[2 + n]!, cwd: parts[3 + n]! };
}
function run(args: string[], env: Record<string, string>, extraPath = ''): void {
  rmSync(out, { force: true });
  execFileSync(BASH, args, { env: { PATH: `${extraPath}/usr/bin:/bin`, OW_OUT: out, HOME: root, ...env }, cwd: root, stdio: 'ignore', timeout: 10_000 });
}

// Hostile names: quotes, $(), backticks, ;, a leading -x and +1, emoji, right-to-left text, spaces, a glob.
const NAMES = ['a b.txt', `it's "q" $x.txt`, '$(touch pwned).txt', '`touch pwned`.txt', 'a;b.txt', '-x', '+1', 'ünï 文件 🎉.txt', 'abc‮txt.exe', '*.txt'];

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'ow-argv-'));
  dump = join(root, 'dump.sh');
  out = join(root, 'out.bin');
  writeFileSync(dump, DUMP);
  chmodSync(dump, 0o755);
  mkdirSync(join(root, 'files'));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('ow_path_stays_in_staged_env: literal argv delivery under real bash', () => {
  it.each(NAMES)('a program on a file gets exactly the path (%s)', (name) => {
    const path = join(root, 'files', name);
    writeFileSync(path, 'x');
    expect(launchablePath(path)).toBeNull();
    // The words as the plan builds them for a template, with the dump in the program's place.
    const s = scriptOf({ p: 'tpl', tpl: 'nano', target: 'file', path, opens: 'terminal', exe: '/usr/bin/nano' });
    expect(s.args.slice(0, 3)).toEqual(['-c', SCRIPT_FILE, ARG0]);
    expect(s.args).not.toContain(path);
    run(['-c', SCRIPT_FILE, ARG0, dump], { [s.name]: s.value });
    const d = read();
    expect(d.args).toEqual([path]);
    expect(d.file).toBe('UNSET');
    expect(d.cwd).toBe(join(root, 'files'));
    // Nothing in the name ran: no file made by a $() or backtick in it.
    expect(existsSync(join(root, 'files', 'pwned')) || existsSync(join(root, 'pwned'))).toBe(false);
  });

  it('a program on a folder gets the folder (`<dir>/.`) and runs in it', () => {
    const dir = join(root, 'files', `d $(x) 'q'`);
    mkdirSync(dir, { recursive: true });
    const s = scriptOf({ p: 'tpl', tpl: 'mc', target: 'dir', path: dir, opens: 'terminal', exe: '/usr/bin/mc' });
    expect(s.name).toBe(DIR_VAR);
    run(['-c', SCRIPT_DIR, ARG0, dump], { [s.name]: s.value });
    const d = read();
    expect(d.args).toEqual([`${dir}/.`]);
    expect(d.dir).toBe('UNSET');
    expect(d.cwd).toBe(dir);
  });

  it('Run in a terminal runs the file itself, with no argument, in its folder', () => {
    const path = join(root, 'files', `run $(id) 'it'.sh`);
    writeFileSync(path, DUMP);
    chmodSync(path, 0o755);
    run(['-c', SCRIPT_RUN, ARG0], { [FILE_VAR]: path });
    const d = read();
    expect(d.args).toEqual([]);
    expect(d.file).toBe('UNSET');
    expect(d.cwd).toBe(join(root, 'files'));
  });

  it("Other command: the person's text gets the path as $1 (file) and the folder as $1 (folder)", () => {
    const path = join(root, 'files', NAMES[1]!);
    writeFileSync(path, 'x');
    run(['-c', `${PRE_CMD_FILE}"${dump}" "$1"`, ARG0], { [FILE_VAR]: path });
    expect(read()).toMatchObject({ args: [path], file: 'UNSET', cwd: join(root, 'files') });
    const dir = join(root, 'files');
    run(['-c', `${PRE_CMD_DIR}"${dump}" "$1"`, ARG0], { [DIR_VAR]: `${dir}/.` });
    expect(read()).toMatchObject({ args: [`${dir}/.`], dir: 'UNSET', cwd: dir });
  });

  it('Open terminal here starts the login shell in the folder, the staged variable gone', () => {
    // getent answers a passwd line whose shell is the dump (the person's login shell).
    const bin = join(root, 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'getent'), `#!/bin/bash\necho "u:x:1000:1000::/home/u:${dump}"\n`);
    chmodSync(join(bin, 'getent'), 0o755);
    const dir = join(root, 'files');
    run(['-c', SCRIPT_HERE, ARG0], { [DIR_VAR]: `${dir}/.` }, `${bin}:`);
    expect(read()).toMatchObject({ args: ['-i'], dir: 'UNSET', cwd: dir });
  });

  it('a folder that cannot be entered ends with code 125, and nothing runs', () => {
    rmSync(out, { force: true });
    let code = 0;
    try {
      execFileSync(BASH, ['-c', SCRIPT_FILE, ARG0, dump], { env: { PATH: '/usr/bin:/bin', OW_OUT: out, [FILE_VAR]: join(root, 'missing', 'a.txt') }, stdio: 'ignore' });
    } catch (e) {
      code = (e as { status: number }).status;
    }
    expect(code).toBe(125);
    expect(() => readFileSync(out)).toThrow();
  });

  it('a newline or another control character in a name is refused before anything is built', () => {
    expect(planFor({ p: 'tpl', tpl: 'nano', entry: { path: '/x/a\nb.txt', type: 'file' }, exe: '/usr/bin/nano' })).toEqual({ ok: false, reason: 'control' });
    expect(planFor({ p: 'run', entry: { path: '/x/a\tb.sh', type: 'file', exec: true } })).toEqual({ ok: false, reason: 'control' });
  });
});
