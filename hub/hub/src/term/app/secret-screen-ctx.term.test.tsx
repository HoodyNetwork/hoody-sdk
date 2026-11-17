// The secret screen provider (secret-screen-ctx.ts) as each mount installs it.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | runTerm on a real terminal provides the real facts: reveal follows the renderer's alternate screen, the output's TTY and TERM, asked at each call (TERM changed mid-run answers the new value); copy waits for the terminal's OSC 52 answer | 'runTerm provides the real screen facts, asked at each call' |
// | 2 | runTerm on an output that is not a terminal: no reveal, no copy | 'runTerm on an output that is not a terminal refuses' |
// | 3 | No provider: nothing shown, nothing copied; the test renderer provides ALLOW_ALL unless `bare` | 'no provider refuses; testRender allows unless bare' |
// | 4 | The ship path cannot take ALLOW_ALL: only run.ts (its createRenderer test seam) and prim/testing.ts name it, and no entry passes createRenderer | 'ALLOW_ALL stays on the test seams' |
import { afterEach, expect, setDefaultTimeout, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { createElement } from 'react';
import { runTerm, type TermControl } from './run';
import { useSecretScreen, type SecretScreenAsk } from './secret-screen-ctx';
import { Text } from '../prim';
import { drawTest } from '../prim/testing';

setDefaultTimeout(30_000);

function streams(tty: boolean) {
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream & PassThrough;
  Object.assign(stdin, { isTTY: true, setRawMode: () => stdin });
  const w = new Writable({ write(_c, _e, done) { done(); } });
  Object.defineProperties(w, { isTTY: { value: tty }, columns: { get: () => 60 }, rows: { get: () => 10 } });
  return { stdin, stdout: w as unknown as NodeJS.WriteStream };
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TERM = process.env.TERM;
afterEach(() => { if (TERM === undefined) delete process.env.TERM; else process.env.TERM = TERM; });

/** Mounts through runTerm and hands back the mount's asking. */
async function askOf(tty: boolean): Promise<{ ask: SecretScreenAsk; ctl: TermControl; closed: Promise<unknown> }> {
  const s = streams(tty);
  let ask: SecretScreenAsk | null = null;
  let ctl!: TermControl;
  function Probe() { ask = useSecretScreen(); return createElement(Text, { children: 'probe' }); }
  const run = await runTerm({ stdin: s.stdin, stdout: s.stdout, width: 60, height: 10, render: (c) => { ctl = c; return createElement(Probe); } });
  for (let i = 0; i < 50 && !ask; i++) await wait(20);
  return { ask: ask!, ctl, closed: run.closed };
}

test('runTerm provides the real screen facts, asked at each call', async () => {
  process.env.TERM = 'xterm-256color';
  const { ask, ctl, closed } = await askOf(true);
  // The Hub's renderer is on the alternate screen, the output is a TTY, TERM is set: a reveal is allowed. The fake
  // terminal never answers the OSC 52 query, so copy is not offered (unknown is not supported).
  expect(ask()).toEqual({ reveal: true, copy: false });
  process.env.TERM = 'dumb';
  expect(ask()).toEqual({ reveal: false, copy: false });
  process.env.TERM = 'xterm-256color';
  expect(ask().reveal).toBe(true);
  ctl.quit();
  await closed;
});

test('runTerm on an output that is not a terminal refuses', async () => {
  process.env.TERM = 'xterm-256color';
  const { ask, ctl, closed } = await askOf(false);
  expect(ask()).toEqual({ reveal: false, copy: false });
  ctl.quit();
  await closed;
});

test('no provider refuses; testRender allows unless bare', async () => {
  let ask: SecretScreenAsk | null = null;
  function Probe() { ask = useSecretScreen(); return createElement(Text, { children: 'probe' }); }
  const bare = await drawTest(createElement(Probe), { width: 20, height: 2 }, { bare: true });
  expect(ask!()).toEqual({ reveal: false, copy: false });
  bare.renderer.destroy();
  const given = await drawTest(createElement(Probe), { width: 20, height: 2 });
  expect(ask!()).toEqual({ reveal: true, copy: true });
  given.renderer.destroy();
});

test('ALLOW_ALL stays on the test seams', () => {
  const src = path.resolve(import.meta.dir, '../..');
  const files = (fs.readdirSync(src, { recursive: true }) as string[])
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.(test|spec)\.tsx?$/.test(f))
    .map((f) => f.split(path.sep).join('/'));
  const naming = files.filter((f) => /\bALLOW_ALL\b/.test(fs.readFileSync(path.join(src, f), 'utf8')));
  expect(naming.sort()).toEqual(['term/app/run.ts', 'term/app/secret-screen-ctx.ts', 'term/prim/testing.ts']);
  const run = fs.readFileSync(path.join(src, 'term/app/run.ts'), 'utf8');
  expect(run).toContain("return o.createRenderer ? ALLOW_ALL : screenAsk(");
  // The live and every other entry mount through startTermHub without the test-renderer seam.
  const entries = files.filter((f) => /^term\/entry[^/]*\.ts$/.test(f));
  expect(entries).toContain('term/entry.live.ts');
  for (const f of entries) expect(fs.readFileSync(path.join(src, f), 'utf8')).not.toContain('createRenderer');
});
