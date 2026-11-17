// launcher.ts: the compiled Hub's child gets every temp directory variable pointed into its private directory; a
// private directory that cannot be made stops the start with one fixed line.
import { expect, spyOn, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PRIVATE_TMP_MARKER, privateTmpEnv, runInPrivateTmp } from './launcher';

test('the child env points TMPDIR and BUN_TMPDIR (read first by Bun) at the private directory', () => {
  const env = privateTmpEnv({ TMPDIR: '/tmp', BUN_TMPDIR: '/var/tmp/shared', HOME: '/h' }, '/p/hub-term-x');
  expect(env.TMPDIR).toBe('/p/hub-term-x');
  expect(env.BUN_TMPDIR).toBe('/p/hub-term-x');
  expect(env[PRIVATE_TMP_MARKER]).toBe('/p/hub-term-x');
  expect(env.HOME).toBe('/h');
});

/** process.exit, stopped here: the code it was called with. */
class Exited { constructor(readonly code: unknown) {} }

test('no private directory can be made: one fixed line without the path, exit 70, before any child starts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-launcher-test-'));
  const marker = process.env[PRIVATE_TMP_MARKER];
  const said: string[] = [];
  const restore: (() => void)[] = [];
  let ran = false;
  const run = async (base: string): Promise<unknown> => {
    try { await runInPrivateTmp(async () => { ran = true; return 0; }, { base }); return 'returned'; } catch (e) { return e; }
  };
  const hub = (): string[] => said.filter((s) => s.startsWith('hoody hub'));
  try {
    delete process.env[PRIVATE_TMP_MARKER];
    const write = spyOn(process.stderr, 'write').mockImplementation(((s: string | Uint8Array) => { said.push(String(s)); return true; }) as never);
    restore.push(() => write.mockRestore());
    const exit = spyOn(process, 'exit').mockImplementation(((c?: unknown) => { throw new Exited(c); }) as never);
    restore.push(() => exit.mockRestore());
    // No process is ever started here: the start of the child is where a run that got its directory stops.
    const spawn = spyOn(Bun, 'spawn').mockImplementation((() => { throw new Error('child started'); }) as never);
    restore.push(() => spawn.mockRestore());
    // A temp root that is not there fails mkdtemp as a full or unwritable one does.
    const gone = path.join(root, 'gone');
    const out = await run(gone);
    expect(out).toBeInstanceOf(Exited);
    expect((out as Exited).code).toBe(70);
    expect(hub()).toEqual(['hoody hub: cannot start (TERM_HUB_CACHE_UNWRITABLE: a private temporary directory cannot be created; set TMPDIR to a directory you can write)\n']);
    expect(said.join('')).not.toContain(root);
    expect(spawn).not.toHaveBeenCalled();
    expect(ran).toBe(false);
    expect(fs.existsSync(gone)).toBe(false);
    // Positive control, same spies: a temp root that can be written gets as far as the child's start, says nothing,
    // and its private directory is removed again.
    said.length = 0;
    const started = await run(root);
    expect((started as Error).message).toBe('child started');
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(hub()).toEqual([]);
    expect(fs.readdirSync(root)).toEqual([]);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(70);
  } finally {
    for (const r of restore.reverse()) r();
    if (marker === undefined) delete process.env[PRIVATE_TMP_MARKER]; else process.env[PRIVATE_TMP_MARKER] = marker;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
