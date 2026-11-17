// The "value-decrypted" shot, replayed as the terminal page gate replays it (goldens.ts): the frame after its steps is
// the OPENED value, never the "Opening…" button (WebCrypto answers after the settle; the shot waits for the opened
// value, as Playwright's auto-wait does). The frame holds the fixture plaintext, so the case is a reveal case
// (golden-guard REVEAL_CASES.vault): never stored as a golden or a PNG.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { REVEAL_CASES } from '../../../scripts/term/golden-guard';
import { rendererHitAt, replay, shotSteps, type Node } from '../../../scripts/term/shot-replay';
import { semanticsOf } from '../../term/prim/semantics';
import shots from './shots';
import { FIXTURE_PLAINTEXT } from './fixtures';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const flat = (f: string): string => f.replace(/\s+/g, ' ');

test('value-decrypted: the frame after the replay shows the opened value, not "Opening…"', async () => {
  const shot = shots.find((x) => x.name === 'value-decrypted')!;
  const [cols, rows] = [120, 40];
  s = await renderPage({ page: 'vault', cols, rows, path: `/vault${shot.path ?? ''}` });
  const r0 = s.renderer as unknown as { root: unknown; stdin: never };
  const hitAt = rendererHitAt(s.renderer);
  const why = await replay(s, shotSteps(shot), { tree: () => semanticsOf({ root: r0.root as never, stdin: r0.stdin }) as unknown as Node[], cols, rows, ...(hitAt ? { hitAt } : {}) });
  expect(why).toBeNull();
  const frame = flat(await s.settle());
  expect(frame).not.toContain('Opening…');
  // Compared as a boolean: the plaintext is never printed by a failing expect.
  expect(frame.includes(flat(FIXTURE_PLAINTEXT).slice(0, 24))).toBe(true);
  expect(s.failures).toEqual([]);
}, 240_000);

test('value-decrypted is a reveal case: its frame is never a golden', () => {
  expect(REVEAL_CASES.vault).toContain('shot-value-decrypted');
});
