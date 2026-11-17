// A resize while the Hub starts. The mount reads the terminal's
// size once, before the boot (which may wait on the network), and the renderer follows a given stdout's resizes only
// from when runTerm listens: a resize before that was lost, and the renderer kept drawing the old width into the new
// terminal (120-column lines in an 80-column window, stale cells) with the old width's style table.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | A resize during the boot: the renderer, the frame and the style class follow the new size, 80→120 and 120→80 | 'resize during boot' |
// | 2 | A resize on the renderer's first write (while it sets up and draws the first frame): the same | 'resize on the first write' |
import { afterEach, expect, setDefaultTimeout, test } from 'bun:test';
import { PassThrough, Writable } from 'node:stream';
import type { PageManifest } from '@kit/page';
import { queryClient } from '@core';
import { discoverPages, visiblePages } from '../../app/pages';
import { currentTermSession } from '../env/session';
import { fixtureBoot } from './boot';
import { startTermHub, type TermBoot } from './lifecycle';
import type { TermStyles } from './styles';
import { styleWidthClass } from '../jsx/style';

setDefaultTimeout(120_000);
afterEach(() => { currentTermSession()?.end(); });

const pages: readonly PageManifest[] = visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const styles: TermStyles = { id: 'spy', classFor: (c) => (c < 100 ? 'narrow' : 'wide'), resolver: () => () => undefined };

/** A terminal whose size the test changes; `onWrite` runs once, on the first byte the renderer writes. */
function term(cols: number, rows: number, onFirstWrite?: () => void) {
  const size = { cols, rows };
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream & PassThrough;
  Object.assign(stdin, { isTTY: true, setRawMode: () => stdin });
  let first = onFirstWrite;
  const w = new Writable({ write(_c, _e, done) { const f = first; first = undefined; f?.(); done(); } });
  Object.defineProperties(w, { isTTY: { value: true }, columns: { get: () => size.cols }, rows: { get: () => size.rows } });
  return { stdin, stdout: w as unknown as NodeJS.WriteStream, resize: (c: number, r: number) => { size.cols = c; size.rows = r; w.emit('resize'); } };
}

/** The frame as drawn: its rows, trailing blanks cut. */
function frameOf(r: unknown): string[] {
  const buf = (r as { currentRenderBuffer?: { getRealCharBytes?: (b: boolean) => Uint8Array; width?: number } }).currentRenderBuffer;
  const bytes = buf?.getRealCharBytes?.(true);
  return bytes ? new TextDecoder().decode(bytes).split('\n').map((l) => l.trimEnd()) : [];
}

async function settled(hub: Awaited<ReturnType<typeof startTermHub>>, cols: number, rows: number) {
  for (let i = 0; i < 200; i++) {
    const r = hub.renderer();
    if (r && r.width === cols && r.height === rows) break;
    await wait(25);
  }
  await hub.whenIdle({ deadlineMs: 20_000 });
  const r = hub.renderer()!;
  return { width: r.width, height: r.height, widthClass: styleWidthClass(), widest: Math.max(0, ...frameOf(r).map((l) => [...l].length)) };
}

for (const [from, to] of [[80, 120], [120, 80]] as const) {
  const toRows = to === 120 ? 40 : 24;
  const fromRows = from === 120 ? 40 : 24;
  const want = { width: to, height: toRows, widthClass: to < 100 ? 'narrow' : 'wide' };

  test(`resize during boot ${from}→${to}`, async () => {
    const t = term(from, fromRows);
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const inner = fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'schedules', fx: null });
    const boot: TermBoot = { ...inner, start: async (s, end) => { await inner.start(s, end); await gate; } };
    const started = startTermHub({ pages, path: '/schedules', boot, queryClient, styles, stdin: t.stdin, stdout: t.stdout, width: from, height: fromRows });
    await wait(50);
    t.resize(to, toRows);
    release();
    const hub = await started;
    const got = await settled(hub, to, toRows);
    expect({ width: got.width, height: got.height, widthClass: got.widthClass }).toEqual(want);
    expect(got.widest).toBeLessThanOrEqual(to);
    expect((await hub.end('quit')).ok).toBe(true);
  });

  test(`resize on the first write ${from}→${to}`, async () => {
    let t!: ReturnType<typeof term>;
    t = term(from, fromRows, () => { t.resize(to, toRows); });
    const boot = fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'schedules', fx: null });
    const hub = await startTermHub({ pages, path: '/schedules', boot, queryClient, styles, stdin: t.stdin, stdout: t.stdout, width: from, height: fromRows });
    const got = await settled(hub, to, toRows);
    expect({ width: got.width, height: got.height, widthClass: got.widthClass }).toEqual(want);
    expect(got.widest).toBeLessThanOrEqual(to);
    expect((await hub.end('quit')).ok).toBe(true);
  });
}
