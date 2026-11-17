// The computer inventory over core's fixture transport: which template paths answer, the screen note, the bash
// launcher row, the 4-wide gate and 12 s budget, and what the cache keeps (found 10 min, absent 2 min, a failure
// only a 30 s floor). Box fixtures: basic (nano only), webview (+ xpra, xdpyinfo), desktop (+ screen programs).
import { act, renderHook } from '@testing-library/react';
import { FIXTURE_TARGET, bootFixtureCore, capture, queryClient, reply, type FixtureAnswer, type FixtureRequest, type FixtureRule, type Target } from '@core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchRoute } from '../../data';
import { LAUNCHER_TIMEOUT_MS, PROBE_TIMES, dropLauncherOn, launcherOf, reprobeOn, resetProbesForTests, startPass, useProbes, type PassState } from './probes';
import { PROBE_PATHS, statRoutes } from './routes';

const T: Target = FIXTURE_TARGET;
const OTHER: Target = { project: { id: T.project.id }, container: { id: 'other-computer', server_name: T.container.server_name } };
/** A row with a top-level `path` beside its argv plan (a kit that sends one: it must agree). The run kit's real rows are
 *  kitBash() below. */
const BASH = { candidate_id: 'system:bash-1', provider: 'system', title: 'bash', path: '/usr/bin/bash', execution_plan: { mode: 'argv', argv: ['/usr/bin/bash'] } };

const BASIC = ['/usr/bin/nano'];
const WEBVIEW = [...BASIC, '/usr/bin/xpra', '/usr/bin/xdpyinfo'];
const DESKTOP = [...WEBVIEW, '/usr/bin/mousepad', '/usr/bin/pluma', '/usr/bin/ristretto', '/usr/bin/eom', '/usr/bin/atril', '/usr/bin/firefox-esr', '/usr/bin/libreoffice', '/usr/bin/thunar', '/usr/bin/caja'];

const NOT_FOUND: FixtureAnswer = { status: 404, body: { success: false, error: 'File or directory not found' } };
const stat = (path: string, path_type = 'File'): FixtureAnswer => ({ status: 200, body: { name: path.split('/').pop(), path, path_type, size: 1, mtime: 0, permissions: '755', owner: 'root', group: 'root', is_symlink: path_type.startsWith('Symlink'), symlink_target: null } });

/** Every stat asked, by path, and the most requests out at once. */
let asked: string[] = [];
let launcherAsks = 0;
let out = 0, peak = 0;
const pathOf = (req: FixtureRequest) => req.path.replace(/^\/api\/v1\/files/, '').split('/').map(decodeURIComponent).join('/');

interface Box {
  files: readonly string[];
  /** Per path: an answer other than found / plain 404. */
  special?: Record<string, FixtureAnswer>;
  delayMs?: number;
  launcher?: FixtureAnswer;
}
function rules(b: Box): FixtureRule[] {
  const answer = async (req: FixtureRequest): Promise<FixtureAnswer> => {
    const p = pathOf(req);
    asked.push(p);
    out++; peak = Math.max(peak, out);
    try {
      // Decided when the request arrives: a box changed while it is out does not change this answer.
      const ans = b.special?.[p] ?? (b.files.includes(p) ? stat(p) : NOT_FOUND);
      if (b.delayMs) await new Promise((r) => setTimeout(r, b.delayMs));
      return ans;
    } finally { out--; }
  };
  return [
    ...statRoutes.map((r) => reply(r, answer)),
    reply(searchRoute, () => { launcherAsks++; return b.launcher ?? { status: 200, body: { set_id: 'set1', candidates: [kitBash()], warnings: [] } }; }),
  ];
}
function boot(b: Box) {
  bootFixtureCore({ rules: rules(b) });
}

/** Runs one pass to its end (nothing checking, screen and launcher decided) and returns its last report. */
async function pass(kind: Parameters<typeof startPass>[1], t: Target = T): Promise<PassState> {
  let last: PassState | null = null;
  const stop = startPass(t, kind, capture().gen, (s) => { last = s; });
  const ended = (s: PassState | null) => !!s && !s.checking && s.launcher !== 'checking' && s.screen !== 'checking';
  for (let i = 0; i < 2000 && !ended(last); i++) await vi.advanceTimersByTimeAsync(25);
  stop();
  expect(ended(last)).toBe(true);
  return last!;
}
const states = (s: PassState) => Object.fromEntries(s.rows.map((r) => [r.tpl, r.exe ? `${r.state}:${r.exe}` : r.state]));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  asked = []; launcherAsks = 0; out = 0; peak = 0;
  queryClient.clear();
  resetProbesForTests();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('probe rows', () => {
  it('probe_rows_follow_default_order: text on a basic box finds nano at its probed path, the rest absent', async () => {
    boot({ files: BASIC });
    const s = await pass('text');
    expect(s.rows.map((r) => r.tpl)).toEqual(['nano', 'mousepad', 'vim', 'nvim', 'micro', 'pluma', 'emacs', 'less']);
    expect(states(s)).toMatchObject({ nano: 'found:/usr/bin/nano', mousepad: 'absent', vim: 'absent', less: 'absent' });
    expect(s.launcher).toEqual({ candidateId: 'system:/usr/bin/bash', setId: 'set1', path: '/usr/bin/bash' });
    expect(s.screen).toBe('unconfirmed');
  });

  it('probe_second_path_only_after_absent: the second path answers vim; a failed first path asks nothing more', async () => {
    boot({ files: ['/usr/bin/vim.basic'] });
    expect(states(await pass('code')).vim).toBe('found:/usr/bin/vim.basic');
    expect(asked).toContain('/usr/bin/vim');
    queryClient.clear(); asked = [];
    boot({ files: ['/usr/bin/vim.basic'], special: { '/usr/bin/vim': { status: 503, body: { error: 'BAD_GATEWAY' } } } });
    expect(states(await pass('code')).vim).toBe('failed');
    expect(asked).not.toContain('/usr/bin/vim.basic');
  });

  it('dangling_symlink_reads_found and dir_at_probe_path_reads_absent: the type decides, a link is a hint', async () => {
    boot({ files: [], special: { '/usr/bin/nano': stat('/usr/bin/nano', 'SymlinkFile'), '/usr/bin/vim': stat('/usr/bin/vim', 'Dir'), '/usr/bin/vim.basic': stat('/usr/bin/vim.basic', 'SymlinkDir'), '/usr/bin/less': stat('/usr/bin/less', 'Fifo') } });
    const s = states(await pass('text'));
    expect(s.nano).toBe('found:/usr/bin/nano');
    expect(s.vim).toBe('absent');
    expect(s.less).toBe('absent');
  });

  it('reads only the files program\'s plain 404 as absent: a coded 404, a 403 or a cut answer is failed', async () => {
    boot({ files: [], special: {
      '/usr/bin/nano': { status: 404, body: { success: false, error: 'Not found', code: 'KIT_NOT_FOUND' } },
      '/usr/bin/mousepad': { status: 403, body: { success: false, error: 'Permission denied' } },
      '/usr/bin/vim': { network: true },
      '/usr/bin/nvim': { status: 200, body: { nothing: true } },
    } });
    const s = states(await pass('text'));
    expect(s).toMatchObject({ nano: 'failed', mousepad: 'failed', vim: 'failed', nvim: 'failed', micro: 'absent' });
  });

  it('asks only table paths: never the file, a listing or a folder', async () => {
    boot({ files: DESKTOP });
    await pass('image');
    await pass('folder');
    expect(asked.length).toBeGreaterThan(0);
    for (const p of asked) expect(PROBE_PATHS).toContain(p);
  });
});

describe('screen', () => {
  it('screen_negative_probe_keeps_launch_enabled: xpra 404 or a failed xdpyinfo is unconfirmed; both found confirmed', async () => {
    boot({ files: ['/usr/bin/xdpyinfo', '/usr/bin/ristretto'] });
    let s = await pass('image');
    expect(s.screen).toBe('unconfirmed');
    expect(states(s).ristretto).toBe('found:/usr/bin/ristretto');
    queryClient.clear();
    boot({ files: ['/usr/bin/xpra', '/usr/bin/ristretto'], special: { '/usr/bin/xdpyinfo': { status: 502, body: { error: 'BAD_GATEWAY' } } } });
    s = await pass('image');
    expect(s.screen).toBe('unconfirmed');
    expect(states(s).ristretto).toBe('found:/usr/bin/ristretto');
    queryClient.clear();
    boot({ files: DESKTOP });
    expect((await pass('image')).screen).toBe('confirmed');
  });

  it('asks each screen tool once per pass, and a cached screen answer sends nothing', async () => {
    boot({ files: WEBVIEW });
    await pass('text');
    expect(asked.filter((p) => p === '/usr/bin/xpra')).toHaveLength(1);
    expect(asked.filter((p) => p === '/usr/bin/xdpyinfo')).toHaveLength(1);
    expect((await pass('folder')).screen).toBe('confirmed');
    expect(asked.filter((p) => p === '/usr/bin/xpra')).toHaveLength(1);
  });
});

describe('launcher', () => {
  it('launcher_row_found_none_failed: system bash row, a complete search without one, and a failed or partial search', async () => {
    expect(launcherOf({ set_id: 's', candidates: [{ ...BASH, provider: 'nix', candidate_id: 'nix:bash-9', path: '/nix/store/x/bin/bash' }, BASH] })).toEqual({ launcher: { candidateId: 'system:bash-1', setId: 's', path: '/usr/bin/bash' } });
    expect(launcherOf({ set_id: 's', candidates: [{ ...BASH, title: 'zsh' }], warnings: [] })).toEqual({ launcher: null });
    expect(launcherOf({ set_id: 's', candidates: [], warnings: [{ code: 'source_warming' }] })).toEqual({ failed: true });
    expect(launcherOf({ set_id: 's', candidates: [], warnings: ['partial_results'] })).toEqual({ failed: true });
    expect(launcherOf({ set_id: 's', candidates: [{ ...BASH, path: 'bash' }] })).toEqual({ launcher: null });
    expect(launcherOf({ candidates: [BASH] })).toEqual({ failed: true });
    boot({ files: BASIC, launcher: { status: 503, body: { error: 'BAD_GATEWAY' } } });
    expect((await pass('text')).launcher).toBe('failed');
    queryClient.clear();
    boot({ files: BASIC, launcher: { status: 200, body: { set_id: 'set1', candidates: [], warnings: [] } } });
    expect((await pass('text')).launcher).toBeNull();
  });
});

// hoody-run's search answer as the kit serializes it: there is no
// top-level `path`; the system provider puts the absolute binary in run_plan.command and execution_plan.argv[0] (mode
// argv). Source warnings are upper-case SOURCE_* codes. The old fixtures invented `path`, so every computer
// read "no bash" in the real Hub while every test passed.
const kitBash = (abs = '/usr/bin/bash', o: Record<string, unknown> = {}) => ({
  candidate_id: `system:${abs}`, title: 'bash', description: `Local executable at ${abs}`, kind: 'any', version: null, homepage: null,
  tags: ['local', 'system', 'linux'], provider: 'system', source_id: 'system', score: 200, reasons: ['found in $PATH'], integrity: null,
  run_plan: { command: abs, env: {}, cwd: null },
  execution_plan: { mode: 'argv', argv: [abs], env: {}, cwd: null, side_effect_hints: [] },
  verified: false, ...o,
});
const kitWarn = (code: string) => ({ code, message: 'source system: ' + code.toLowerCase(), source_id: 'system' });

describe('the run kit\'s real search answer', () => {
  it('finds bash in the kit\'s own shape: an argv plan of the bash binary alone', () => {
    expect(launcherOf({ set_id: 's', candidates: [kitBash()], warnings: [] })).toEqual({ launcher: { candidateId: 'system:/usr/bin/bash', setId: 's', path: '/usr/bin/bash' } });
    expect(launcherOf({ set_id: 's', candidates: [kitBash('/usr/local/bin/bash', { path: '/usr/local/bin/bash' })], warnings: [] })).toEqual({ launcher: { candidateId: 'system:/usr/local/bin/bash', setId: 's', path: '/usr/local/bin/bash' } });
  });

  it('the plan that runs is the only source: no plan, a plan with arguments, a conflicting path or shell text is no launcher', () => {
    const none = { launcher: null };
    const one = (o: Record<string, unknown>) => launcherOf({ set_id: 's', candidates: [kitBash('/bin/bash', o)], warnings: [] });
    // No execution plan: run_plan.command is shell text, never a program path (even a plain one).
    expect(one({ execution_plan: undefined })).toEqual(none);
    expect(one({ execution_plan: undefined, run_plan: { command: '/bin/false;/bin/bash' } })).toEqual(none);
    expect(one({ execution_plan: undefined, run_plan: { command: '/$HOME/bash' } })).toEqual(none);
    // A top-level path never stands in for the plan, nor overrides it.
    expect(one({ path: '/bin/bash', execution_plan: { mode: 'argv', argv: ['/bin/zsh'] } })).toEqual(none);
    expect(one({ path: '/bin/bash', execution_plan: { mode: 'shell-inline', shell_command: 'bash' } })).toEqual(none);
    expect(one({ path: '/usr/bin/bash' })).toEqual(none);
    expect(one({ path: '/bin/bash', execution_plan: undefined })).toEqual(none);
    // Missing or non-array argv; argv already carrying arguments (Files' arguments would follow another command).
    expect(one({ execution_plan: { mode: 'argv' } })).toEqual(none);
    expect(one({ execution_plan: { mode: 'argv', argv: '/bin/bash' } })).toEqual(none);
    expect(one({ execution_plan: { mode: 'argv', argv: ['/bin/bash', '-c', 'printf WRONG'] } })).toEqual(none);
    expect(one({ execution_plan: { mode: 'argv', argv: [] } })).toEqual(none);
    // Shell text stays refused where a shell would read it (run_plan.command), whatever it says.
    for (const cmd of ['/bin/false;/bin/bash', '/$HOME/bash', '/a`b`/bash', '/x|/bash']) expect(one({ execution_plan: undefined, run_plan: { command: cmd } })).toEqual(none);
    // argv[0] must still be a literal absolute path whose last part is bash.
    for (const exe of ['bash', 'bin/bash', '/bash/', '/usr/bin/bashx', '/usr/bin/bash\0', '/a\0b/bash', 7, null]) expect(one({ execution_plan: { mode: 'argv', argv: [exe] } })).toEqual(none);
  });

  it('argv[0] is a literal path, no character allowlist: @, non-ASCII and spaces are paths', () => {
    for (const exe of ['/opt/x@1/bin/bash', '/home/élise/bin/bash', '/opt/my tools/bash', '/nix/store/abc-bash-5.2+p1/bin/bash', '/srv/日本/bash']) {
      expect(launcherOf({ set_id: 's', candidates: [kitBash(exe)], warnings: [] })).toEqual({ launcher: { candidateId: `system:${exe}`, setId: 's', path: exe } });
    }
  });

  it('never takes a path that is not an absolute bash: relative, another program, words, a shell-inline plan', () => {
    const none = { launcher: null };
    expect(launcherOf({ set_id: 's', candidates: [kitBash('bash')], warnings: [] })).toEqual(none);
    expect(launcherOf({ set_id: 's', candidates: [kitBash('/usr/bin/zsh')], warnings: [] })).toEqual(none);
    expect(launcherOf({ set_id: 's', candidates: [kitBash('/usr/bin/bash -l')], warnings: [] })).toEqual(none);
    expect(launcherOf({ set_id: 's', candidates: [kitBash('/usr/bin/bash', { run_plan: { command: 'bash -c x' }, execution_plan: { mode: 'shell-inline', shell_command: 'bash -c x' } })], warnings: [] })).toEqual(none);
    expect(launcherOf({ set_id: 's', candidates: [kitBash('/usr/bin/bash', { provider: 'nix' })], warnings: [] })).toEqual(none);
    // A shell-inline plan is words for a shell even when it lists argv; the argv plan is the one that
    // runs (run_plan.command is not read beside it); another program ending in bash.
    expect(launcherOf({ set_id: 's', candidates: [kitBash('/usr/bin/bash', { execution_plan: { mode: 'shell-inline', shell_command: 'bash', argv: ['/usr/bin/bash'] } })], warnings: [] })).toEqual(none);
    expect(launcherOf({ set_id: 's', candidates: [kitBash('/usr/bin/bash', { execution_plan: { mode: 'argv', argv: ['bash'] } })], warnings: [] })).toEqual(none);
    expect(launcherOf({ set_id: 's', candidates: [kitBash('/bin/bash', { run_plan: { command: '/usr/bin/bash' } })], warnings: [] })).toEqual({ launcher: { candidateId: 'system:/bin/bash', setId: 's', path: '/bin/bash' } });
    expect(launcherOf({ set_id: 's', candidates: [kitBash('/bin/bash', { run_plan: { command: '/bin/false;/bin/bash' } })], warnings: [] })).toEqual({ launcher: { candidateId: 'system:/bin/bash', setId: 's', path: '/bin/bash' } });
    expect(launcherOf({ set_id: 's', candidates: [kitBash('/usr/bin/rbash'), kitBash('/usr/bin/xbash')], warnings: [] })).toEqual(none);
    // A space inside argv[0] is part of one word (argv is never read by a shell): see o9-3 below.
  });

  it('a search the kit says timed out, failed, is warming or backing off, with no bash row, is "couldn\'t check", never "no bash"', () => {
    for (const code of ['SOURCE_TIMEOUT', 'SOURCE_FAILED', 'SOURCE_WARMING', 'SOURCE_BACKOFF']) {
      expect(launcherOf({ set_id: 's', candidates: [], warnings: [kitWarn(code)] })).toEqual({ failed: true });
    }
    // A warning about something else does not hide a real "no bash".
    expect(launcherOf({ set_id: 's', candidates: [], warnings: [kitWarn('SELECTOR_HINT_IGNORED')] })).toEqual({ launcher: null });
  });

  it('a computer whose run kit answers in its real shape has the launcher (the pass reads it, not noBash)', async () => {
    boot({ files: BASIC, launcher: { status: 200, body: { set_id: 'set1', candidates: [kitBash()], warnings: [] } } });
    const got = (await pass('text')).launcher;
    expect(got).not.toBeNull();
    expect(got).not.toBe('failed');
  });

  it('the run kit timing out its system source reads failed in the pass, never noBash', async () => {
    boot({ files: BASIC, launcher: { status: 200, body: { set_id: 'set1', candidates: [], warnings: [kitWarn('SOURCE_TIMEOUT')] } } });
    expect((await pass('text')).launcher).toBe('failed');
  });
});

describe('budget', () => {
  it('probe_timeout_gives_partial_list: at most 4 out at once, and at 12 s what has not answered is unchecked', async () => {
    boot({ files: DESKTOP, delayMs: 4500 });
    const s = await pass('text');
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBe(4);
    const unchecked = s.rows.filter((r) => r.state === 'unchecked');
    expect(unchecked.length).toBeGreaterThan(0);
    expect(s.rows.filter((r) => r.state !== 'unchecked').length).toBeGreaterThan(0);
    expect(s.checking).toBe(false);
    expect(s.screen).toBe('unconfirmed');
  });

  it('a request past the budget still fills the cache: the next pass reads it without sending', async () => {
    boot({ files: DESKTOP, delayMs: 4500 });
    const first = await pass('text');
    const missed = first.rows.filter((r) => r.state === 'unchecked').map((r) => r.tpl);
    expect(missed.length).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(10_000);
    const before = asked.length;
    const second = await pass('text');
    expect(second.rows.every((r) => r.state !== 'unchecked')).toBe(true);
    // Only what was never sent the first time is sent now.
    expect(asked.length - before).toBeLessThan(before);
  });
});

describe('cache', () => {
  it('probe_cache_times: found kept 10 min, absent 2 min, a failure re-asked only after 30 s', async () => {
    boot({ files: BASIC, special: { '/usr/bin/vim': { status: 502, body: { error: 'BAD_GATEWAY' } } } });
    await pass('text');
    const count = (p: string) => asked.filter((x) => x === p).length;
    expect([count('/usr/bin/nano'), count('/usr/bin/mousepad'), count('/usr/bin/vim')]).toEqual([1, 1, 1]);
    await vi.advanceTimersByTimeAsync(20_000);
    await pass('text');
    expect([count('/usr/bin/nano'), count('/usr/bin/mousepad'), count('/usr/bin/vim')]).toEqual([1, 1, 1]);
    await vi.advanceTimersByTimeAsync(PROBE_TIMES.retryFloor);
    await pass('text');
    expect(count('/usr/bin/vim')).toBe(2);
    expect(count('/usr/bin/mousepad')).toBe(1);
    await vi.advanceTimersByTimeAsync(PROBE_TIMES.absent);
    await pass('text');
    expect(count('/usr/bin/mousepad')).toBe(2);
    expect(count('/usr/bin/nano')).toBe(1);
    await vi.advanceTimersByTimeAsync(PROBE_TIMES.found);
    await pass('text');
    expect(count('/usr/bin/nano')).toBe(2);
  });

  it('generation_change_drops_answers: after a context bump nothing old is used', async () => {
    boot({ files: BASIC });
    await pass('text');
    const before = asked.length;
    boot({ files: BASIC }); // bootFixtureCore bumps the context
    await pass('text');
    expect(asked.length).toBe(before * 2);
  });

  it('no_file_path_in_keys: every ow-probe key names a table path or the launcher', async () => {
    boot({ files: DESKTOP });
    await pass('pdf');
    await pass('csv');
    const keys = queryClient.getQueryCache().findAll({ predicate: (q) => q.queryKey[0] === 'ow-probe' }).map((q) => q.queryKey);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(k).toHaveLength(5);
      expect([...PROBE_PATHS, 'launcher']).toContain(k[4]);
      expect([k[1], k[2], k[3]]).toEqual([capture().gen, T.project.id, T.container.id]);
    }
  });
});

describe('useProbes', () => {
  const settle = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(200); }); };

  it('disabled_sends_nothing: enabled false or no computer', async () => {
    boot({ files: BASIC });
    const { result, rerender } = renderHook((p: { computer: Target | null; enabled: boolean }) => useProbes({ ...p, kind: 'text' }), { initialProps: { computer: T as Target | null, enabled: false } });
    await settle();
    rerender({ computer: null, enabled: true });
    await settle();
    expect(asked).toEqual([]);
    expect(launcherAsks).toBe(0);
    expect(result.current.rows.every((r) => r.state === 'unchecked')).toBe(true);
    expect([result.current.screen, result.current.launcher, result.current.checking]).toEqual(['checking', 'checking', false]);
  });

  it('refresh_drops_all: every path asked again; another computer\'s answers kept', async () => {
    boot({ files: BASIC });
    const other = renderHook(() => useProbes({ computer: OTHER, kind: 'text', enabled: true }));
    await settle();
    const { result } = renderHook(() => useProbes({ computer: T, kind: 'text', enabled: true }));
    await settle();
    expect(result.current.rows[0]).toEqual({ tpl: 'nano', state: 'found', exe: '/usr/bin/nano' });
    const once = asked.length;
    act(() => result.current.refresh());
    await settle();
    expect(asked.length).toBe(once + once / 2);
    const otherKeys = queryClient.getQueryCache().findAll({ predicate: (q) => q.queryKey[0] === 'ow-probe' && q.queryKey[3] === 'other-computer' });
    expect(otherKeys.length).toBeGreaterThan(0);
    other.unmount();
  });

  it('reprobe_after_127_asks_only_that_template', async () => {
    boot({ files: ['/usr/bin/vim.basic'] });
    const { result } = renderHook(() => useProbes({ computer: T, kind: 'text', enabled: true }));
    await settle();
    asked = [];
    act(() => result.current.reprobe('vim'));
    await settle();
    expect([...asked].sort()).toEqual(['/usr/bin/vim', '/usr/bin/vim.basic']);
  });

  it('dropLauncher: the row reads failed and is not sent again until refresh', async () => {
    boot({ files: BASIC });
    const { result } = renderHook(() => useProbes({ computer: T, kind: 'text', enabled: true }));
    await settle();
    expect(launcherAsks).toBe(1);
    act(() => result.current.dropLauncher());
    await settle();
    expect(result.current.launcher).toBe('failed');
    expect(launcherAsks).toBe(1);
    act(() => result.current.refresh());
    await settle();
    expect(launcherAsks).toBe(2);
    expect(result.current.launcher).toMatchObject({ candidateId: 'system:/usr/bin/bash' });
  });

  it('reprobeOn_outside_any_chooser: a launch end watched elsewhere re-checks a mounted chooser of that computer only', async () => {
    boot({ files: ['/usr/bin/vim.basic'] });
    const { result } = renderHook(() => useProbes({ computer: T, kind: 'text', enabled: true }));
    const other = renderHook(() => useProbes({ computer: OTHER, kind: 'text', enabled: true }));
    await settle();
    asked = [];
    act(() => reprobeOn(T, 'vim'));
    await settle();
    expect([...asked].sort()).toEqual(['/usr/bin/vim', '/usr/bin/vim.basic']);
    expect(result.current.rows.find((r) => r.tpl === 'vim')).toMatchObject({ state: 'found' });
    act(() => dropLauncherOn(T));
    await settle();
    expect(result.current.launcher).toBe('failed');
    expect(other.result.current.launcher).not.toBe('failed');
    other.unmount();
  });
});

describe('passes: stale state, refresh and limits', () => {
  const settle = async (ms = 200) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

  it('stale_state_never_crosses_passes: another computer, another kind or disabling shows nothing of the old pass', async () => {
    boot({ files: BASIC });
    type P = { computer: Target | null; kind: 'text' | 'image'; enabled: boolean };
    // Every render's output, with the props it was rendered for (act would hide an intermediate one).
    const seen: { p: P; nano: string; launcher: unknown }[] = [];
    const { result, rerender } = renderHook((p: P) => {
      const r = useProbes(p);
      seen.push({ p, nano: r.rows.find((x) => x.tpl === 'nano')?.state ?? '-', launcher: r.launcher });
      return r;
    }, { initialProps: { computer: T as Target | null, kind: 'text', enabled: true } as P });
    await settle();
    expect(result.current.rows[0]).toEqual({ tpl: 'nano', state: 'found', exe: '/usr/bin/nano' });
    expect(result.current.launcher).toMatchObject({ candidateId: 'system:/usr/bin/bash' });
    const from = seen.length;
    const other: P = { computer: OTHER, kind: 'text', enabled: true };
    rerender(other);
    // OTHER's box answers nothing yet (requests take a moment): no render for it may show T's nano or launcher.
    const forOther = seen.slice(from).filter((x) => x.p === other);
    expect(forOther.length).toBeGreaterThan(0);
    for (const x of forOther) { expect(x.nano).toBe('unchecked'); expect(x.launcher).toBe('checking'); }
    await settle();
    const image: P = { computer: T, kind: 'image', enabled: true };
    const at = seen.length;
    rerender(image);
    for (const x of seen.slice(at)) expect(x.nano).toBe('-');
    expect(result.current.rows.map((r) => r.tpl)).toEqual(['ristretto', 'eom', 'imdisplay', 'firefox']);
    await settle();
    const off: P = { computer: T, kind: 'text', enabled: false };
    const at2 = seen.length;
    rerender(off);
    for (const x of seen.slice(at2)) { expect(x.nano).toBe('unchecked'); expect(x.launcher).toBe('checking'); }
    expect(result.current.checking).toBe(false);
  });

  it('refresh_retires_requests_in_flight: a fresh request is sent, and the retired answer never lands', async () => {
    const box: Box = { files: [...BASIC], delayMs: 3000 };
    boot(box);
    const { result } = renderHook(() => useProbes({ computer: T, kind: 'text', enabled: true }));
    await settle(100);
    expect(asked.filter((p) => p === '/usr/bin/nano')).toHaveLength(1);
    box.files = []; // nano is gone before the first answer arrives
    act(() => result.current.refresh());
    // The retired requests keep their slots until they settle (3 s), then the fresh ones go out.
    await settle(100);
    expect(asked.filter((p) => p === '/usr/bin/nano')).toHaveLength(1);
    await settle(3500);
    expect(asked.filter((p) => p === '/usr/bin/nano')).toHaveLength(2);
    await settle(20_000);
    expect(result.current.rows[0]).toEqual({ tpl: 'nano', state: 'absent' });
    // The cache holds the fresh answer only: a new pass reads absent without sending.
    const before = asked.length;
    expect(states(await pass('text')).nano).toBe('absent');
    expect(asked.filter((p) => p === '/usr/bin/nano')).toHaveLength(2);
    expect(asked.length).toBe(before);
  });

  it('limit_across_passes: a stopped pass keeps its slots until its requests settle; the next pass waits for them', async () => {
    boot({ files: DESKTOP, delayMs: 4500 });
    const stop = startPass(T, 'text', capture().gen, () => undefined);
    await vi.advanceTimersByTimeAsync(100);
    expect(out).toBe(4);
    stop();
    const second = await pass('image');
    expect(peak).toBe(4);
    expect(second.checking).toBe(false);
  });

  it('stop_right_after_start_sends_nothing: not a stat and not the launcher search', async () => {
    boot({ files: DESKTOP });
    const stop = startPass(T, 'text', capture().gen, () => undefined);
    stop();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(asked).toEqual([]);
    expect(launcherAsks).toBe(0);
  });

  it('launcher_search_cut_at_5s: a search that hangs is aborted at 5 s and reads failed before the pass budget', async () => {
    boot({ files: BASIC, launcher: { status: 200, body: { set_id: 'set1', candidates: [kitBash()], warnings: [] }, delayMs: 60_000 } });
    const t0 = Date.now();
    const s = await pass('text');
    expect(s.launcher).toBe('failed');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(LAUNCHER_TIMEOUT_MS);
    expect(Date.now() - t0).toBeLessThan(PROBE_TIMES.pass);
    expect(LAUNCHER_TIMEOUT_MS).toBe(5000);
  });
});

describe('passes: re-enable, failure floor', () => {
  const settle = async (ms = 200) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

  it('reenable_starts_from_nothing: after a disabled spell, no render shows the old pass', async () => {
    boot({ files: BASIC, delayMs: 50 });
    type P = { computer: Target | null; kind: 'text'; enabled: boolean };
    const seen: { p: P; nano: string; launcher: unknown }[] = [];
    const on: P = { computer: T, kind: 'text', enabled: true };
    const { rerender } = renderHook((p: P) => {
      const r = useProbes(p);
      seen.push({ p, nano: r.rows[0]!.state, launcher: r.launcher });
      return r;
    }, { initialProps: on });
    await settle();
    expect(seen.at(-1)).toMatchObject({ nano: 'found' });
    rerender({ ...on, enabled: false });
    await settle(11 * 60_000);
    const again: P = { ...on };
    const at = seen.length;
    rerender(again);
    const first = seen.slice(at).find((x) => x.p === again)!;
    expect(first.nano).toBe('unchecked');
    expect(first.launcher).toBe('checking');
  });

  it('queued_waiters_keep_the_failure_floor: two passes on failing keys send each key once', async () => {
    const fail: Record<string, FixtureAnswer> = Object.fromEntries(PROBE_PATHS.map((p) => [p, { status: 503, body: { error: 'BAD_GATEWAY' } }]));
    boot({ files: [], special: fail, delayMs: 100 });
    const a = startPass(T, 'text', capture().gen, () => undefined);
    const b = await pass('text');
    a();
    expect(b.rows.every((r) => r.state === 'failed')).toBe(true);
    const counts = new Map<string, number>();
    for (const p of asked) counts.set(p, (counts.get(p) ?? 0) + 1);
    for (const [p, n] of counts) expect(n, p).toBe(1);
  });
});
