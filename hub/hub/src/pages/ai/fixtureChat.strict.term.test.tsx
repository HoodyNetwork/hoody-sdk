// A chat the AI tab's fixture list shows opens with its transcript (dev, shots and goldens): the fixture fake agent holds
// the listed chats (core/fixture-seam fixtureChats, seeded from pages/ai/parts/fixtures.chats.ts). The waiting chat
// shows its approval card; a chat the agent does not hold still says it is gone.
import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';
import { activeStrictGlobals } from '../../term/env/strict-globals';

let close: (() => void) | null = null;
afterEach(() => { close?.(); close = null; });
const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';

// The first render of a process compiles the page for 10-15 s on a loaded host. The chat's stream can time out during
// that pause, so the chat briefly shows "Reconnecting…" / "Loading this conversation." and then recovers about a second later.
// Wait for the text (bounded) instead of judging the frame left by one settle: a real hang still fails after BOUND_MS.
const BOUND_MS = 20_000;
async function until(s: { frame: string; settle(): Promise<string> }, ok: (f: string) => boolean): Promise<string> {
  const end = performance.now() + BOUND_MS;
  while (!ok(s.frame) && performance.now() < end) {
    await new Promise((r) => setTimeout(r, 250));
    await s.settle();
  }
  return s.frame;
}

test('the waiting fixture chat opens with its transcript and its approval card, under strict globals', async () => {
  activeStrictGlobals()?.clear();
  const s = await renderPage({ page: 'ai', path: `/ai/c/s-wait?computer=atlas.00a1&realm=${REALM}`, cols: 120, rows: 40, settleMs: 3000 });
  close = () => s.close();
  expect(s.failures).toEqual([]);
  await until(s, (f) => f.includes('Allow this action?') || f.includes('gone or not reachable'));
  expect(s.frame).not.toContain('gone or not reachable');
  expect(s.frame).toContain('deploy');
  expect(s.frame).toContain('Allow this action?');
  const traps = (activeStrictGlobals()?.ledger() ?? []).filter((r) => /src\/(ask|pages\/ai)\//.test(r.stack)).map((r) => r.name);
  expect(traps).toEqual([]);
}, 180_000);

// Every chat the default list shows opens (an overlay shot must never find "Fix the failing checkout tests" gone:
// the fake agent is seeded from the list's own world). The seeds come from the list fixture itself, so a chat
// added to the list is covered here without editing this test.
test('every chat the fixture list shows opens with its first message, none is gone', async () => {
  const { chatSeeds } = await import('./parts/fixtures.chats');
  const seeds = chatSeeds();
  expect(seeds.length).toBeGreaterThan(4);
  for (const c of seeds) {
    const s = await renderPage({ page: 'ai', path: `/ai/c/${c.id}?computer=atlas.00a1&realm=${REALM}`, cols: 120, rows: 40, settleMs: 3000 });
    try {
      expect(s.failures).toEqual([]);
      await until(s, (f) => f.includes(c.ask.slice(0, 20)) || f.includes('gone or not reachable'));
      expect({ id: c.id, gone: s.frame.includes('gone or not reachable') }).toEqual({ id: c.id, gone: false });
      expect(s.frame).toContain(c.ask.slice(0, 20));
    } finally { s.close(); }
  }
}, 300_000);

test('a chat no fixture agent holds is still said to be gone', async () => {
  const s = await renderPage({ page: 'ai', path: `/ai/c/s-nowhere?computer=atlas.00a1&realm=${REALM}`, cols: 120, rows: 40, settleMs: 3000 });
  close = () => s.close();
  expect(s.frame).toContain('gone or not reachable');
}, 180_000);
