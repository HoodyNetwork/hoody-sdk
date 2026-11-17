// runTerm (run.ts): the lifecycle around one renderer on given streams.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | A click sent right after a resize is hit-tested on the new layout (input waits for the first frame at the new size) | 'click after resize' |
// | 2 | quit ends: the alternate screen is left and `closed` settles with reason quit | 'quit' |
// | 3 | A render error in the shell ends as a crash (reported after the restore), never a hang | 'crash' |
// | 4 | A throw while the caller builds its app (o.render) rejects the run only after the terminal is given back: the other screen is left, the run's input listener is off the given stdin | 'render throws' |
// | 5 | The Hub's colour tier is the engine's colour mode: 16-colour and mono tiers write no 24-bit or 256-palette colour; no tier leaves the engine's own choice | 'colour tier' |
// | 6 | A suspend (Ctrl+Z) overtaken by the end of the run never stops the process: the stop is skipped once the run is ending | 'suspend overtaken by the end' |
import { expect, setDefaultTimeout, test } from 'bun:test';
import { PassThrough, Writable } from 'node:stream';
import { createElement, useState } from 'react';
import { runTerm, type TermControl } from './run';
import { Box, Pressable, Text } from '../prim';

setDefaultTimeout(30_000);

function streams(cols: number, rows: number) {
  const size = { cols, rows };
  let out = '';
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream & PassThrough;
  Object.assign(stdin, { isTTY: true, setRawMode: () => stdin });
  const w = new Writable({ write(c, _e, done) { out += String(c); done(); } });
  Object.defineProperties(w, { isTTY: { value: true }, columns: { get: () => size.cols }, rows: { get: () => size.rows } });
  return {
    stdin, stdout: w as unknown as NodeJS.WriteStream, text: () => out,
    resize: (c: number, r: number) => { size.cols = c; size.rows = r; w.emit('resize'); },
    /** SGR mouse press + release at a 0-based cell. */
    click: (x: number, y: number) => { stdin.write(`\x1b[<0;${x + 1};${y + 1}M\x1b[<0;${x + 1};${y + 1}m`); },
  };
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('click after resize', async () => {
  const s = streams(200, 30);
  const hits: string[] = [];
  // The button sits at the right edge: at 200 columns x≈190, at 100 columns x≈90.
  function App() {
    const [n] = useState(0);
    return createElement(Box, { dir: 'row', width: '100%', justify: 'end', children:
      createElement(Pressable, { onPress: () => hits.push('hit' + n), children: createElement(Text, { children: '[ Press ]' }) }) });
  }
  const run = await runTerm({ stdin: s.stdin, stdout: s.stdout, width: 200, height: 30, render: () => createElement(App) });
  await wait(300);
  s.resize(100, 30);
  // At once (well inside the renderer's resize debounce): the new place of the button.
  s.click(94, 0);
  await wait(800);
  expect(hits).toEqual(['hit0']);
  // The renderer did take the new size.
  expect(run.renderer.width).toBe(100);
  await run.end({ reason: 'quit', code: 0 });
});

test('quit', async () => {
  const s = streams(60, 10);
  let ctl!: TermControl;
  const run = await runTerm({ stdin: s.stdin, stdout: s.stdout, width: 60, height: 10, render: (c) => { ctl = c; return createElement(Text, { children: 'hello' }); } });
  await wait(200);
  ctl.quit();
  expect(await run.closed).toEqual({ reason: 'quit', code: 0 });
  expect(s.text()).toContain('\x1b[?1049l');
});

test('crash', async () => {
  const s = streams(60, 10);
  const said: string[] = [];
  function Bad(): never { throw new Error('shell broke'); }
  const run = await runTerm({ stdin: s.stdin, stdout: s.stdout, width: 60, height: 10, report: (t) => said.push(t), render: () => createElement(Bad) });
  const exit = await run.closed;
  expect(exit.reason).toBe('crash');
  expect(said.join('\n')).toContain('shell broke');
});

test('render throws', async () => {
  const s = streams(60, 10);
  const before = s.stdin.listenerCount('data');
  let err: unknown = null;
  try {
    await runTerm({ stdin: s.stdin, stdout: s.stdout, width: 60, height: 10, report: () => {}, render: () => { throw new Error('app build broke'); } });
  } catch (e) { err = e; }
  expect((err as Error | null)?.message).toBe('app build broke');
  // Given back by the time the caller hears of it: nobody holds an `end` for this run.
  expect(s.text()).toContain('\x1b[?1049h');
  expect(s.text()).toContain('\x1b[?1049l');
  expect(s.stdin.listenerCount('data')).toBe(before);
});

test('colour tier: the engine writes colours in the Hub tier (ansi16: SGR 30-37/90-97 only; mono: none); no tier = the engine decides', async () => {
  const draw = async (tier: 'truecolor' | 'ansi16' | 'mono' | undefined) => {
    const s = streams(40, 6);
    let ctl: TermControl | null = null;
    const run = await runTerm({ stdin: s.stdin, stdout: s.stdout, width: 40, height: 6, ...(tier ? { colourTier: tier } : {}), render: (c) => { ctl = c; return createElement(Text, { colour: 'danger', children: 'tinted words' }); } });
    await wait(300);
    const mode = (run.renderer as unknown as { colorMode: string }).colorMode;
    ctl!.quit();
    await run.closed;
    return { mode, out: s.text() };
  };
  const rich = /\x1b\[[0-9;]*[34]8;[25];/;
  const a16 = await draw('ansi16');
  expect(a16.mode).toBe('ansi16');
  expect(a16.out).toContain('tinted words');
  expect(a16.out).not.toMatch(rich);
  expect(a16.out).toMatch(/\x1b\[[0-9;]*(3[0-7]|9[0-7])[;m]/);
  const mono = await draw('mono');
  expect(mono.mode).toBe('mono');
  expect(mono.out).not.toMatch(rich);
  expect((await draw('truecolor')).mode).toBe('truecolor');
  // The engine's own rule when nothing is asked: mono under NO_COLOR, else its detection.
  expect((await draw(undefined)).mode).toBe((process.env.NO_COLOR ?? '') !== '' ? 'mono' : 'auto');
});

test('suspend overtaken by the end', async () => {
  const s = streams(60, 10);
  let ctl!: TermControl;
  const p = process as unknown as { kill: (pid: number, sig?: string) => boolean };
  const realKill = p.kill;
  const stops: string[] = [];
  // Never a real stop of the test process: the stop signal is recorded, anything else goes through.
  p.kill = (pid, sig) => { if (sig === 'SIGSTOP') { stops.push(sig); return true; } return realKill.call(process, pid, sig); };
  try {
    const run = await runTerm({ stdin: s.stdin, stdout: s.stdout, width: 60, height: 10, process: true, report: () => {}, render: (c) => { ctl = c; return createElement(Text, { children: 'hello' }); } });
    await wait(200);
    // The renderer's suspend takes a while: the run ends meanwhile.
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const r = run.renderer as unknown as { suspend: () => Promise<void> };
    r.suspend = async () => { await gate; };
    expect(ctl.suspend).toBeDefined();
    ctl.suspend!();
    await wait(20);
    ctl.quit();
    expect(await run.closed).toEqual({ reason: 'quit', code: 0 });
    release();
    await wait(50);
    expect(stops).toEqual([]);
  } finally {
    p.kill = realKill;
  }
});
