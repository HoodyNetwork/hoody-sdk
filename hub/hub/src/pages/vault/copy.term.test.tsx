// The vault's copy without showing, in the terminal (kit copyWhenRead, Secret.term.tsx): Copy value on the unread value
// box reads the value and copies it; on the encrypted entry, Open and copy decrypts with the typed password and copies.
// Each press copies the value once, through the test renderer, and draws no "Couldn't copy"; the value is never in the
// frame. Compared as booleans: a failing expect never prints a value.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { rendererHitAt, replay, type Node, type ReplayStep } from '../../../scripts/term/shot-replay';
import { semanticsOf } from '../../term/prim/semantics';
import { FIXTURE_PASSWORD, FIXTURE_PLAINTEXT } from './fixtures';

const VALUE = 'Deploy on Fridays only after the backup ran.'; // fixtures.ts deploy.notes
const COPY = { click: 'role=button[name="Copy value"]' } as const;

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const flat = (f: string): string => f.replace(/\s+/g, ' ');

/** What the page's renderer is asked to copy, the terminal answering "asked" (prim/testing.ts copiesOf passes the write
 *  on to the test renderer, whose own answer is not this test's to rely on). */
function takenCopies(renderer: unknown): string[] {
  const r = renderer as { copyToClipboardOSC52(text: string): boolean };
  const sent: string[] = [];
  r.copyToClipboardOSC52 = (text: string) => { sent.push(text); return true; };
  return sent;
}

/** Replays steps as the goldens runner does, wheel included (scripts/term/goldens.ts): replay acts only on a node on
 *  screen, and at 80x24 the value box sits below the first screen, so the wheel scrolls it into view first. A wheel
 *  needs the hit test, so it goes only with one. */
async function act(p: PageSession, steps: readonly ReplayStep[], cols: number, rows: number): Promise<string | null> {
  const r = p.renderer as unknown as { root: unknown; stdin: { emit(e: 'data', b: Buffer): unknown } };
  const hitAt = rendererHitAt(p.renderer);
  const wheel = async (x: number, y: number, dir: 'up' | 'down') => {
    r.stdin.emit('data', Buffer.from(`\x1b[<${dir === 'up' ? 64 : 65};${x + 1};${y + 1}M`));
    await p.settle();
  };
  return replay(p, steps, { tree: () => semanticsOf({ root: r.root as never, stdin: r.stdin as never }) as unknown as Node[], cols, rows, ...(hitAt ? { hitAt, wheel } : {}) });
}

/** Settles until `done` holds for the flattened frame (the read and WebCrypto answer after a settle), at most 30 s of
 *  real time (goldens freeze Date: performance.now). */
async function until(p: PageSession, done: (frame: string) => boolean): Promise<string> {
  let frame = flat(await p.settle());
  for (const end = performance.now() + 30_000; !done(frame) && performance.now() < end;) {
    await new Promise((r) => setTimeout(r, 50));
    frame = flat(await p.settle());
  }
  return frame;
}

// One word each: a sentence may wrap inside its box, and the flattened frame then holds the box's rules between words.
// "Couldn't" starts both refusals: the field's "Couldn't copy. Show it…" and the row's "Couldn't copy. Open it…".
const COULDNT = "Couldn't";

for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`${cols}x${rows}: Copy value on the unread box copies the value once, never drawn`, async () => {
    s = await renderPage({ page: 'vault', cols, rows, path: '/vault?sel=deploy.notes' });
    const copies = takenCopies(s.renderer);
    expect(await act(s, [COPY], cols, rows)).toBeNull();
    const frame = await until(s, (f) => f.includes('[Copied]') || f.includes(COULDNT));
    expect(frame.includes(COULDNT)).toBe(false);
    expect(frame.includes('[Copied]')).toBe(true);
    expect(copies.length).toBe(1);
    expect(copies[0] === VALUE).toBe(true);
    expect(frame.includes('Deploy on Fridays')).toBe(false);
    expect(s.trapsAt).toEqual([]);
    expect(s.failures).toEqual([]);
  }, 240_000);
}

test('120x40: Open and copy on the encrypted entry copies the plaintext once, never drawn', async () => {
  const [cols, rows] = [120, 40];
  s = await renderPage({ page: 'vault', cols, rows, path: '/vault?sel=db-password' });
  const copies = takenCopies(s.renderer);
  // Copy value on an encrypted value reads it and opens the password row with "Open and copy" (shot value-open-copy).
  expect(await act(s, [COPY], cols, rows)).toBeNull();
  expect((await until(s, (f) => f.includes('Open and copy'))).includes('Open and copy')).toBe(true);
  expect(copies.length).toBe(0);
  expect(await act(s, [{ fill: 'Password', text: FIXTURE_PASSWORD }, { click: 'role=button[name="Open and copy"]' }], cols, rows)).toBeNull();
  const done = 'Copied.'; // the row's band, "Copied. The value was not shown and is not kept on this page."
  const frame = await until(s, (f) => f.includes(done) || f.includes(COULDNT));
  expect(frame.includes(COULDNT)).toBe(false);
  expect(frame.includes(done)).toBe(true);
  expect(copies.length).toBe(1);
  expect(copies[0] === FIXTURE_PLAINTEXT).toBe(true);
  expect(frame.includes(flat(FIXTURE_PLAINTEXT))).toBe(false);
  expect(frame.includes(FIXTURE_PASSWORD)).toBe(false);
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 240_000);
