// The demo on "All realms", drawn (boot.demo.ts, scripts/term/build/demo-client.ts): the sample account was recorded
// inside one realm, and a person who switches to All realms must still see its Bots, its chats and the chat that
// waits for them. Before the fix a computer's read with realm=all had no recorded answer: the chat list drew "didn't
// load" and Home lost "Needs you".
// Each page is judged on the screen as it stands (the cells as drawn), once the page shows it is on All realms: the
// text sent after the switch holds only the cells that changed, so under load a word whose letters already sat in the
// same cells reached it in pieces ("Revi", "w") and the chat page failed. Each test mounts the demo once, with no reads
// kept from an earlier mount, and ends it by its signal, as a host does: the next mount starts only after this one has
// ended (ending only the session leaves the mount drawing its signed-out screen).
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | The demo opens on the recorded realm; after a switch to All realms the Bots page lists every sample Bot | 'all realms, drawn: Bots' |
// | 2 | After the switch the chat page lists the recorded chats with no load failure | 'all realms, drawn: chats' |
// | 3 | After the switch Home shows the waiting chat | 'all realms, drawn: Home' |
import { afterEach, expect, setDefaultTimeout, test } from 'bun:test';
import { queryClient } from '@core';
import { DEMO_CONTEXT, demoClient } from '../../../scripts/term/build/demo-client';
import { realm as selectedRealm } from '../../core/ctx';
import { switchTo } from '../../core/realm';
import { currentTermSession } from '../env/session';
import { mountDemoHub } from '../entry.demo';
import type { HoodyClient } from '../host-types';
import { UNSTYLED_FOR_TESTS } from './styles';

setDefaultTimeout(300_000);
afterEach(() => { currentTermSession()?.end(); });

/** The screen as it stands after every write: the renderer sends only the cells that changed, so a name whose letters
 *  partly sat in the same cells before is never written whole after the switch. Cursor moves place the text; a full
 *  clear empties the grid; other control sequences draw nothing. */
const screen = (s: string): string => {
  const rows: string[][] = [];
  let r = 0;
  let c = 0;
  const re = /\x1b\[([0-9;?]*)([A-Za-z])|\x1b[^[]|([^\x1b])/gu;
  for (const m of s.matchAll(re)) {
    if (m[3] !== undefined) {
      if (m[3] === '\n') { r++; c = 0; continue; }
      if (m[3] === '\r') { c = 0; continue; }
      (rows[r] ??= [])[c++] = m[3];
    } else if (m[2] === 'H' || m[2] === 'f') {
      const [row, col] = (m[1] ?? '').split(';');
      r = Math.max(0, Number(row || 1) - 1);
      c = Math.max(0, Number(col || 1) - 1);
    } else if (m[2] === 'J' && m[1] === '2') rows.length = 0;
  }
  return Array.from(rows, (row) => Array.from(row ?? [], (ch) => ch ?? ' ').join('')).join('\n');
};
const until = async (ok: () => boolean, ms: number): Promise<boolean> => {
  for (const end = Date.now() + ms; Date.now() < end;) { if (ok()) return true; await new Promise((r) => setTimeout(r, 100)); }
  return ok();
};

/** Mounts the demo on `page`, switches to All realms, and gives the screen once `settled` holds on it (or the wait
 *  ends). `settled` must name something only All realms draws, so a screen still on the recorded realm never passes. */
async function drawnOnAll(page: string, path: string, settled: (s: string) => boolean): Promise<{ startedOn: string; shown: string; switched: unknown; realm: string }> {
  // The reads are kept per process (core's query client): each mount starts with none of an earlier mount's.
  await queryClient.cancelQueries();
  queryClient.clear();
  let all = '';
  const ac = new AbortController();
  const done = mountDemoHub({
    styles: UNSTYLED_FOR_TESTS, client: demoClient() as unknown as HoodyClient, route: { page, path }, onSetDefault: async () => {}, context: { ...DEMO_CONTEXT },
    io: { cells: { write: (s: string) => { all += s; } }, input: { onData: () => () => {} }, size: () => ({ cols: 140, rows: 50 }), colourTier: 'mono' },
    signal: ac.signal,
  } as never);
  done.catch(() => {});
  let startedOn = '';
  let switched: unknown = null;
  let shown = '';
  let realm = '';
  try {
    await until(() => all.includes('HOODY'), 60_000);
    await new Promise((r) => setTimeout(r, 1500));
    startedOn = selectedRealm();
    switched = await Promise.race([switchTo('all'), new Promise((r) => setTimeout(() => { r('timeout'); }, 30_000))]);
    await until(() => settled(screen(all)), 45_000);
    // Then until no read is out, so what is judged answers the switch's reads, not a frame drawn while they ran.
    await until(() => queryClient.isFetching() === 0 && settled(screen(all)), 15_000);
    // A read that fails after the first draw still has time to show it.
    await new Promise((r) => setTimeout(r, 1500));
    shown = screen(all);
    realm = selectedRealm();
  } finally {
    // Ended as a host ends it: the mount gives the terminal back, cancels the reads still out, forgets them all and ends
    // its session (app/lifecycle.ts dispose).
    ac.abort();
  }
  const ended = await Promise.race([done.then(() => true, () => true), new Promise<boolean>((r) => setTimeout(() => r(false), 30_000))]);
  // A mount still ending would share core's module-wide state with the next one: say so here, not as a later test's red.
  expect(ended, `the ${page} mount ended within 30 s`).toBe(true);
  return { startedOn, shown, switched, realm };
}

test('all realms, drawn: Bots', async () => {
  // order-watch is in another realm than the recorded one: only All realms lists it.
  const bots = await drawnOnAll('bots', '/bots', (s) => s.includes('order-watch'));
  expect(bots.startedOn).toBe(DEMO_CONTEXT.realmId);
  expect(bots.switched).toBe(true);
  expect(bots.realm).toBe('all');
  for (const name of ['support-desk', 'release-notes', 'order-watch']) expect(bots.shown, name).toContain(name);
});

test('all realms, drawn: chats', async () => {
  // The new-chat band asks for one realm only on All realms (pages/ai/new NewChat band.pickRealm).
  const chats = await drawnOnAll('ai', '/ai', (s) => (s.includes('Pick one realm') && s.includes('Yesterday') && s.includes('Review')) || s.includes('Try again'));
  expect(chats.startedOn).toBe(DEMO_CONTEXT.realmId);
  expect(chats.switched).toBe(true);
  expect(chats.realm).toBe('all');
  expect(chats.shown).toContain('Pick one realm');
  expect(chats.shown).toContain('Yesterday');
  expect(chats.shown).toContain('Review');
  expect(chats.shown).not.toContain('Try again');
});

test('all realms, drawn: Home', async () => {
  // Home names the realm it shows in the line under its greeting: "All realms" only on All realms, else the realm's own
  // name (pages/home/view.tsx HomeContext), drawn as "■ <name> · <computer> …" (kit/data/Display.term.tsx ContextLine).
  // The top bar's "◆ All realms ▾" is the shell's, and the realms card sits below the page cards, off a 50-row screen.
  // "Needs you" is drawn only while it has an item (pages/home/parts/NeedsYou.tsx).
  const onAll = /■ All realms · /;
  const home = await drawnOnAll('home', '/', (s) => onAll.test(s) && s.includes('Needs you'));
  expect(home.startedOn).toBe(DEMO_CONTEXT.realmId);
  expect(home.switched).toBe(true);
  expect(home.realm).toBe('all');
  expect(home.shown).toMatch(onAll);
  expect(home.shown).toContain('Needs you');
});
