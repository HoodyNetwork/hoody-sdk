// Vitest: Files launch plans, templates, execution policy and words, pure.
//   - every purpose's request is a fixed script and the path rides only as the staged value (golden);
//   - the template table names no shell, interpreter or eval flag, only absolute programs;
//   - Run needs a regular file with an x bit and is never a default or a remembered choice;
//   - the words say only what was observed (wordsFor, the strings lint).
import { describe, expect, it } from 'vitest';
import type { Item, OpenApp } from '../../logic';
import { ARG0, CMD_MAX_BYTES, DIR_VAR, FILE_VAR, PRE_CMD_DIR, PRE_CMD_FILE, SCRIPTS, SCRIPT_DIR, SCRIPT_FILE, SCRIPT_HERE, SCRIPT_RUN, launchablePath } from './argv';
import { HANDOFF_KEYS, owText, proves, wordsFor } from './facts';
import { planFor, rememberable, scriptOf, toLaunch, type LaunchPlan, type ScriptPlan } from './plan';
import strings from './strings.en.json';
import { DEFAULT_ORDER, TEMPLATES, forFolders } from './templates';

const LAUNCHER = { candidateId: 'system:bash-1', setId: 'set1', path: '/usr/bin/bash' };
const SUBJECT = '0123456789abcdef0123456789abcdef';
const ok = (p: ReturnType<typeof planFor>): LaunchPlan => {
  if (!p.ok) throw new Error(`refused: ${p.reason}`);
  return p.plan;
};
const file = (path: string, exec: boolean | null = false) => ({ path, type: 'file' as const, exec });
const dir = (path: string) => ({ path, type: 'dir' as const });

describe('ow_path_stays_in_staged_env: golden requests for every purpose', () => {
  const HOSTILE = [`/home/u/it's "q" $x.txt`, '/home/u/$(rm -rf ~).txt', '/home/u/`id`.txt', '/home/u/a;b.txt', '/home/u/-x', '/home/u/+1', '/home/u/ünï 文件 🎉.txt', '/home/u/abc‮txt.exe'];

  it.each(HOSTILE)('a template on %s: fixed script, program words, the path only in HUB_OPEN_FILE', (path) => {
    const plan = ok(planFor({ p: 'tpl', tpl: 'nano', entry: file(path), exe: '/usr/bin/nano' }));
    const l = toLaunch(plan, { launcher: LAUNCHER, label: 'Nano · x', subject: SUBJECT })!;
    expect(l.o).toEqual({ args: ['-c', SCRIPT_FILE, ARG0, '/usr/bin/nano'], env: { [FILE_VAR]: path }, opensIn: 'terminal', shell: 'bash' });
    expect(JSON.stringify([l.o.args, l.item])).not.toContain(path);
    expect(l.item).toMatchObject({ id: LAUNCHER.candidateId, setId: 'set1', app: 'bash', provider: 'system', p: 'tpl', subject: SUBJECT, name: 'Nano · x' });
  });

  it('every other purpose: its fixed script, and the staged value only', () => {
    const cases: [LaunchPlan, string[], Record<string, string>, string][] = [
      [ok(planFor({ p: 'tpl', tpl: 'emacs', entry: file('/a/b.txt'), exe: '/usr/bin/emacs' })), ['-c', SCRIPT_FILE, ARG0, '/usr/bin/emacs', '-nw'], { [FILE_VAR]: '/a/b.txt' }, 'terminal'],
      [ok(planFor({ p: 'tpl', tpl: 'less', entry: file('/a/b.txt'), exe: '/usr/bin/less' })), ['-c', SCRIPT_FILE, ARG0, '/usr/bin/less', '-L'], { [FILE_VAR]: '/a/b.txt' }, 'terminal'],
      [ok(planFor({ p: 'tpl', tpl: 'firefox', entry: file('/a/b.html'), exe: '/usr/bin/firefox-esr' })), ['-c', SCRIPT_FILE, ARG0, '/usr/bin/firefox-esr'], { [FILE_VAR]: '/a/b.html' }, 'screen'],
      [ok(planFor({ p: 'tpl', tpl: 'thunar', entry: dir('/a/d'), exe: '/usr/bin/thunar' })), ['-c', SCRIPT_DIR, ARG0, '/usr/bin/thunar'], { [DIR_VAR]: '/a/d/.' }, 'screen'],
      [ok(planFor({ p: 'tpl', tpl: 'mc', entry: dir('/'), exe: '/usr/bin/mc' })), ['-c', SCRIPT_DIR, ARG0, '/usr/bin/mc'], { [DIR_VAR]: '/.' }, 'terminal'],
      [ok(planFor({ p: 'cmd', text: 'python3 "$1" | less', entry: file('/a/b.py'), opens: 'terminal' })), ['-c', `${PRE_CMD_FILE}python3 "$1" | less`, ARG0], { [FILE_VAR]: '/a/b.py' }, 'terminal'],
      [ok(planFor({ p: 'cmd', text: 'ls "$1"', entry: dir('/a/d'), opens: 'screen' })), ['-c', `${PRE_CMD_DIR}ls "$1"`, ARG0], { [DIR_VAR]: '/a/d/.' }, 'screen'],
      [ok(planFor({ p: 'run', entry: file('/a/run.sh', true) })), ['-c', SCRIPT_RUN, ARG0], { [FILE_VAR]: '/a/run.sh' }, 'terminal'],
      [ok(planFor({ p: 'here', entry: dir('/a/d') })), ['-c', SCRIPT_HERE, ARG0], { [DIR_VAR]: '/a/d/.' }, 'terminal'],
    ];
    for (const [plan, args, env, opens] of cases) {
      const l = toLaunch(plan, { launcher: LAUNCHER, label: 'L', subject: SUBJECT })!;
      expect(l.o).toEqual({ args, env, opensIn: opens, shell: 'bash' });
    }
  });

  it('Launch an app here: the chosen app with its folder as cwd, nothing staged', () => {
    const item = { type: 'row', name: 'htop', id: 'nix:htop', app: 'htop', opensIn: 'terminal' } as Item;
    const plan = ok(planFor({ p: 'apphere', item, o: { opensIn: 'terminal' }, cwd: '/home/u/proj' }));
    const l = toLaunch(plan, { label: 'htop' })!;
    expect(l.o).toEqual({ opensIn: 'terminal', cwd: '/home/u/proj' });
    expect(l.item).toMatchObject({ id: 'nix:htop', app: 'htop', p: 'apphere' });
    expect(planFor({ p: 'apphere', item, o: {}, cwd: 'proj' })).toEqual({ ok: false, reason: 'not_absolute' });
  });

  it('the scripts are fixed text: none is built from data', () => {
    expect(SCRIPTS).toEqual([SCRIPT_FILE, SCRIPT_DIR, SCRIPT_RUN, SCRIPT_HERE]);
    for (const s of [...SCRIPTS, PRE_CMD_FILE, PRE_CMD_DIR]) expect(s).toMatch(/unset HUB_OPEN_(FILE|DIR)\n/);
  });
});

describe('launchable paths and the collision rule', () => {
  it('each refusal has its own reason', () => {
    expect(launchablePath('a/b')).toBe('not_absolute');
    expect(launchablePath('/a//b')).toBe('dot_part');
    expect(launchablePath('/a/./b')).toBe('dot_part');
    expect(launchablePath('/a/../b')).toBe('dot_part');
    expect(launchablePath('/a/b/')).toBe('dot_part');
    expect(launchablePath('/' + 'x'.repeat(4096))).toBe('too_long');
    expect(launchablePath('/a\nb')).toBe('control');
    expect(launchablePath('/a\u0085b')).toBe('control');
    expect(launchablePath('/a\u007fb')).toBe('control');
    expect(launchablePath('/a�b')).toBe('lossy');
    expect(launchablePath('/a\\b')).toBe('backslash');
    expect(launchablePath('/')).toBeNull();
    expect(launchablePath('/home/u/ünï 文件.txt')).toBeNull();
  });

  it("a path the core would find in the launch's own command is refused here first (collision)", () => {
    // The file's path is the program's own path: part of the command words.
    expect(planFor({ p: 'tpl', tpl: 'nano', entry: file('/usr/bin/nano'), exe: '/usr/bin/nano' })).toEqual({ ok: false, reason: 'collision' });
    // The same path with its quotes folded out is found too (the core's SHELL_QUOTING rule).
    expect(planFor({ p: 'cmd', text: 'cat /x/abcdefgh', entry: file(`/x/abc"defgh`), opens: 'terminal' })).toEqual({ ok: false, reason: 'collision' });
    // Inside the launcher's own path: refused unsent at toLaunch.
    const plan = ok(planFor({ p: 'run', entry: file('/opt/tools/run', true) }));
    expect(toLaunch(plan, { launcher: { ...LAUNCHER, path: '/opt/tools/run/bash' }, label: 'Run', subject: SUBJECT })).toBeNull();
    // A folder's staged value ends in "/.": no command contains it.
    expect(planFor({ p: 'cmd', text: 'ls /x/dddddddd', entry: dir('/x/dddddddd'), opens: 'terminal' }).ok).toBe(true);
  });

  it('Other command text: not empty, at most 1,024 bytes', () => {
    expect(planFor({ p: 'cmd', text: '  ', entry: file('/a/b'), opens: 'terminal' })).toEqual({ ok: false, reason: 'cmd_empty' });
    expect(planFor({ p: 'cmd', text: 'é'.repeat(CMD_MAX_BYTES / 2 + 1), entry: file('/a/b'), opens: 'terminal' })).toEqual({ ok: false, reason: 'cmd_too_long' });
    expect(planFor({ p: 'cmd', text: 'x'.repeat(CMD_MAX_BYTES), entry: file('/a/b'), opens: 'terminal' }).ok).toBe(true);
  });
});

describe('template table lint', () => {
  const SHELLS = /(^|\/)(ba|da|z|k|c|tc|fi|)sh$|(^|\/)(env|python\d*|perl|ruby|node|lua|php|busybox|xargs|sudo|su)$/;
  it('every row: absolute probes, no shell or interpreter, no eval-style flag, a reviewed target', () => {
    for (const t of TEMPLATES) {
      for (const p of t.probe) {
        expect(p.startsWith('/'), `${t.id} ${p}`).toBe(true);
        expect(SHELLS.test(p), `${t.id} ${p}`).toBe(false);
      }
      for (const f of t.flags) expect(/^(-c|-e|--eval|--command|-x|--execute)$/.test(f), `${t.id} ${f}`).toBe(false);
      expect(t.for.length).toBeGreaterThan(0);
      expect(forFolders(t) ? t.for : []).toEqual(forFolders(t) ? ['folder'] : []);
    }
  });
  it('ImageMagick refuses the names it would read itself; Less ignores LESSOPEN; Emacs stays in its terminal', () => {
    const plan = (path: string) => planFor({ p: 'tpl', tpl: 'imdisplay', entry: file(path), exe: '/usr/bin/display' });
    for (const n of ['/p/a[1].png', '/p/*.png', '/p/a?.png', '/p/{a}.png', '/p/a%d.png', '/p/@list']) expect(plan(n)).toEqual({ ok: false, reason: 'name_refused' });
    expect(plan('/p/a.png').ok).toBe(true);
    expect(TEMPLATES.find((t) => t.id === 'less')!.flags).toEqual(['-L']);
    expect(TEMPLATES.find((t) => t.id === 'emacs')!.flags).toEqual(['-nw']);
  });
  it('a template suits its target, and runs only the program its probe found', () => {
    expect(planFor({ p: 'tpl', tpl: 'nano', entry: dir('/a'), exe: '/usr/bin/nano' })).toEqual({ ok: false, reason: 'wrong_target' });
    expect(planFor({ p: 'tpl', tpl: 'mc', entry: file('/a/b'), exe: '/usr/bin/mc' })).toEqual({ ok: false, reason: 'wrong_target' });
    expect(planFor({ p: 'tpl', tpl: 'nano', entry: file('/a/b'), exe: '/tmp/nano' })).toEqual({ ok: false, reason: 'bad_program' });
    expect(planFor({ p: 'tpl', tpl: 'bash', entry: file('/a/b'), exe: '/bin/bash' })).toEqual({ ok: false, reason: 'no_template' });
    expect(planFor({ p: 'tpl', tpl: 'nano', entry: { path: '/a/l', type: 'symlink' }, exe: '/usr/bin/nano' })).toEqual({ ok: false, reason: 'wrong_target' });
  });
});

describe('execution policy', () => {
  it('run_requires_regular_file_with_x_bit: no x bit, an unknown x bit, a symlink or a folder: no Run', () => {
    expect(planFor({ p: 'run', entry: file('/a/s.sh', false) })).toEqual({ ok: false, reason: 'not_executable' });
    expect(planFor({ p: 'run', entry: file('/a/s.sh', null) })).toEqual({ ok: false, reason: 'not_executable' });
    expect(planFor({ p: 'run', entry: { path: '/a/s.sh', type: 'symlink', exec: true } })).toEqual({ ok: false, reason: 'not_executable' });
    expect(planFor({ p: 'run', entry: { path: '/a/d', type: 'dir', exec: true } })).toEqual({ ok: false, reason: 'not_executable' });
    expect(planFor({ p: 'run', entry: file('/a/s.sh', true) }).ok).toBe(true);
    expect(planFor({ p: 'here', entry: file('/a/s.sh') })).toEqual({ ok: false, reason: 'not_folder' });
  });

  it('run_never_default_or_remembered: only a template or a command on a file may be remembered', () => {
    expect(rememberable({ p: 'run', target: 'file' })).toBe(false);
    expect(rememberable({ p: 'here', target: 'dir' })).toBe(false);
    expect(rememberable({ p: 'apphere', target: 'dir' })).toBe(false);
    expect(rememberable({ p: 'tpl', target: 'dir' })).toBe(false);
    expect(rememberable({ p: 'cmd', target: 'dir' })).toBe(false);
    expect(rememberable({ p: 'tpl', target: 'file' })).toBe(true);
    expect(rememberable({ p: 'cmd', target: 'file' })).toBe(true);
    for (const order of Object.values(DEFAULT_ORDER)) expect(order).not.toContain('run');
  });
});

describe('the words say only what was observed', () => {
  const row = (o: Partial<OpenApp>): OpenApp => ({ key: 'k', name: 'Nano · a b.txt', opensIn: 'terminal', state: 'running', terminal: 8003, handle: '', source: '', command: '', settings: [], urls: {}, startedAt: 0, p: 'tpl', ...o });
  const say = (o: Partial<OpenApp>, x: { ready?: boolean; exec?: boolean } = {}) => owText(wordsFor(row(o), x));

  it('wordsFor table', () => {
    expect(say({ state: 'starting' })).toBe('Opening Nano…');
    expect(say({ state: 'started' })).toBe('The computer accepted Nano. Waiting for it to start…');
    expect(say({ state: 'running' })).toBe('Nano is running · started with a b.txt');
    expect(say({ state: 'running', opensIn: 'screen', name: 'Mousepad · a b.txt' })).toBe("Mousepad is running. Its window hasn't appeared yet.");
    expect(say({ state: 'ready', opensIn: 'screen', name: 'Mousepad · a b.txt' })).toBe('Mousepad has a window on the display.');
    expect(say({ state: 'exited', exitCode: 0 })).toBe('Nano finished.');
    expect(say({ state: 'exited', exitCode: 0, opensIn: 'screen', name: 'Firefox · a b.txt' }, { ready: true })).toBe('Firefox closed.');
    expect(say({ state: 'exited', exitCode: 0, opensIn: 'screen', name: 'Firefox · a b.txt' })).toBe(
      'Firefox ended without a window here. If Firefox was already running on this computer, it may have passed a b.txt to that copy.',
    );
    expect(say({ state: 'exited', exitCode: 127 })).toBe("Nano ended with code 127. That usually means the program isn't on this computer.");
    expect(say({ state: 'exited', exitCode: 126 })).toContain('Usually it couldn');
    expect(say({ state: 'exited', exitCode: 125 })).toContain('code 125');
    expect(say({ state: 'exited', exitCode: 1 })).toBe('Nano ended with code 1. Show the terminal to see why.');
    expect(say({ state: 'exited' })).toBe("Nano ended. The computer didn't say how.");
    expect(say({ state: 'exited', signal: 'SIGTERM' })).toBe('Nano was stopped.');
    expect(say({ state: 'exited', signal: 'SIGKILL' })).toBe('Nano was ended by SIGKILL.');
    expect(say({ state: 'unknown', code: 'start_unconfirmed' })).toBe("Nano may still be starting. The computer didn't confirm it.");
    expect(say({ state: 'unknown', code: 'foreign_record' })).toBe("We can't tell whether this is the Nano that was started.");
    expect(say({ state: 'unknown', code: 'start_unconfirmed' }, { exec: false })).toBe('Nano may have started before this key lost permission.');
    expect(say({ state: 'not_started', code: 'exec_off' })).toBe('This key can no longer start programs on this computer, so nothing was started. Sign in with your account, or use a key that may start programs.');
    expect(say({ state: 'not_started', code: 'not_durable' })).toBe("This browser couldn't save its note that prevents opening twice, so nothing was started.");
    expect(say({ state: 'not_started', code: 'shell_unavailable' })).toBe("Files can't start programs on this computer: no bash program was found on it.");
    expect(say({ state: 'not_started', code: 'warming_manual' })).toBe('The computer is getting its program list ready. Try again in a moment.');
  });

  it('a ready window never says the file opened; 127 and 126 are never a definite cause', () => {
    const ready = say({ state: 'ready', opensIn: 'screen' });
    expect(ready).not.toMatch(/open(ed)?\b.*a b\.txt|a b\.txt.*open/i);
    for (const n of [126, 127]) expect(say({ state: 'exited', exitCode: n })).toMatch(/usually/i);
    expect(say({ state: 'exited', exitCode: 127 })).not.toMatch(/not installed/i);
  });

  it('ow_strings_observation_only: no string claims the file is open; a hedged hand-off only in its own keys', () => {
    const BANNED = /\bhas .* open\b|\bopened\b|\bis open\b|\balready has .* open\b/i;
    for (const [k, v] of Object.entries(strings)) {
      expect(BANNED.test(v), `${k}: ${v}`).toBe(false);
      if (!HANDOFF_KEYS.includes(k)) expect(/passed|hand(ed)? (it )?(off|to)/i.test(v), `${k}: ${v}`).toBe(false);
    }
    for (const k of HANDOFF_KEYS) expect(strings[k as keyof typeof strings]).toMatch(/may have passed/);
  });

  it('ow_running_duplicate_prompt_never_claims_file_open: the only prompt for a running launch', () => {
    const text = owText({ key: 'r.running', vars: { p: 'Nano', file: 'a b.txt' } });
    expect(text).toBe('Nano is already running, started with a b.txt.');
    expect(text).not.toMatch(/has a b\.txt open|already has/i);
  });

  it('proof names this launch: its tag, a running/ended/never-started record or its terminal replaced', () => {
    const h = (tag: string) => ({ launch_tag: tag }) as never;
    expect(proves({ ok: true, code: 'running', message: '', state: 'running', handle: h('t1') }, 't1')).toBe(true);
    expect(proves({ ok: true, code: 'started', message: '', state: 'started', handle: h('t1') }, 't1')).toBe(false);
    expect(proves({ ok: false, code: 'unknown', message: '', state: 'unknown', handle: h('t1') }, 't1')).toBe(false);
    expect(proves({ ok: true, code: 'running', message: '', state: 'running', handle: h('t2') }, 't1')).toBe(false);
    expect(proves({ ok: false, code: 'unknown', message: '', state: 'unknown', reason: 'foreign_record', handle: h('t1') } as never, 't1')).toBe(false);
    expect(proves({ ok: true, code: 'running', message: '', state: 'running', transient: true, handle: h('t1') } as never, 't1')).toBe(false);
    expect(proves({ ok: false, code: 'terminal_replaced', message: '', state: 'unknown', handle: h('t1') }, 't1')).toBe(true);
  });
});

// Keeps ScriptPlan's purposes in step with scriptOf (a new purpose fails to compile here).
const _all: Record<ScriptPlan['p'], true> = { tpl: true, cmd: true, run: true, here: true };
void _all;
void scriptOf;
