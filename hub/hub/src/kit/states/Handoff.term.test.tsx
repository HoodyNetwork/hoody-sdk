import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import '../../term/env/router-globals';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/history';
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { FocusRoot } from '../../term/prim';
import { parseSearch, stringifySearch } from '../../term/app/router';
import { routed } from '../layouts/termHarness';
import { Handoff } from './Handoff';
import { beginTermSession } from '../../term/env/session';
import { ShellDataProvider, type ShellData } from '../../shell/context';
import { semanticsOf, semText } from '../../term/prim/semantics';

/** Runs `body` inside a terminal session whose host has (or lacks) a browser opener, as a real mount gives one. */
async function withOpener(open: ((url: string) => void) | undefined, body: () => Promise<void>): Promise<void> {
  const session = beginTermSession({ webOrigin: 'https://hub.example.com', ...(open ? { openExternal: open } : {}) });
  try { await body(); } finally { session.end(); }
}
/** A router like the terminal Hub's (term/app/router.tsx): an index and one splat route per declared page path. The
 *  catch-all harness (termHarness routed) declares no page, so every hand-off there is the Hub root. */
function paged(children: () => ReactNode, at = '/board'): { element: ReactNode } {
  const root = createRootRoute({ component: () => <>{children()}</> });
  const pages = ['/board', '/keys', '/vault', '/files', '/schedules'].map((p) => createRoute({ getParentRoute: () => root, path: `${p}/$`, component: () => null }));
  const index = createRoute({ getParentRoute: () => root, path: '/', component: () => null });
  const router = createRouter({ routeTree: root.addChildren([index, ...pages]), history: createMemoryHistory({ initialEntries: [at] }), origin: 'http://hub.term', parseSearch, stringifySearch } as never);
  return { element: <QueryClientProvider client={new QueryClient()}><FocusRoot><RouterProvider router={router as never} /></FocusRoot></QueryClientProvider> };
}
const R = '0123456789abcdef01234567';
const SHELL: ShellData = { realms: [{ id: R, name: 'Lab' } as ShellData['realms'][number]], realmId: R, computers: [{ id: 'c0a7150000000000000000a1', name: 'atlas' }], computerId: 'c0a7150000000000000000a1' };
/** R as drawn: a full 24-hex id never shows. */
const R_SHOWN = '0123…4567';

let t: TestTerm | null = null;
let host: { end(): void } | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; host?.end(); host = null; });
/** The host gives the web origin, as a real mount's host does (HubTermOptions.webOrigin → the session). */
const withOrigin = () => { host = beginTermSession({ webOrigin: 'https://hub.example.com' }); };

test('block: reason, the whole address (wrapped, never cut) and the copy key; only the declared page path travels', async () => {
  withOrigin();
  const { element } = paged(() => <Handoff reason="The chart needs a browser to draw." what="chart" to="/schedules/abcdefabcdefabcdefabcdef/history" />);
  t = await drawTest(element, { width: 44, height: 12 });
  const f = await t.settle();
  expect(f).toContain('⇗ The chart needs a browser to draw.');
  expect(f).toContain('Open the chart on the web:');
  expect(f).toContain('[c Copy link]');
  const flat = f.split('\n').map((l) => l.replace(/^[│\s]+|[│\s]+$/g, '')).join('');
  expect(flat).toContain('https://hub.example.com/auth/home#/schedules');
  expect(flat).not.toContain('abcdefabcdef');
  expect(f).not.toContain('…');
});

test('default route is the current page path (its search never travels); unknown origin gives the path form', async () => {
  const { element } = paged(() => <Handoff reason="Needs a browser." size="line" what="colour picker" />, '/vault?sel=k1');
  t = await drawTest(element, { width: 90, height: 6 });
  const f = await t.settle();
  // The line form draws the reason too (nothing required is dropped), then its keys.
  expect(f).toContain("⇗ Needs a browser. (on your Hub's web address)");
  expect(f).toContain('[c Copy link]');
  expect(f).toContain('/auth/home#/vault');
  expect(f).not.toContain('sel=k1');
});

test('Tab focuses it; c copies the address through the renderer; the label settles back', async () => {
  withOrigin();
  const { element } = paged(() => <Handoff reason="Needs a browser." to="/keys" />);
  t = await drawTest(element, { width: 60, height: 8 });
  const copied: string[] = [];
  (t.renderer as unknown as { copyToClipboardOSC52: (s: string) => boolean }).copyToClipboardOSC52 = (s) => { copied.push(s); return true; };
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressKey('c');
  const f = await t.settle();
  expect(copied).toEqual(['https://hub.example.com/auth/home#/keys']);
  expect(f).toContain('[✓ Copied]');
});

test('copy that the terminal refuses says so, in words', async () => {
  const { element } = paged(() => <Handoff reason="Needs a browser." to="/keys" />);
  t = await drawTest(element, { width: 60, height: 8 });
  (t.renderer as unknown as { copyToClipboardOSC52: (s: string) => boolean }).copyToClipboardOSC52 = () => false;
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  expect(await t.settle()).toContain('Copy failed');
});

test('an external address is never shown: drawn as the Hub root', async () => {
  const { element } = paged(() => <Handoff reason="x." to="https://evil.example/x" />);
  t = await drawTest(element, { width: 60, height: 8 });
  const f = await t.settle();
  expect(f).not.toContain('evil');
  expect(f).toContain('/auth/home#/');
});

test('outside a router it still draws, as the Hub root even with `to` (no router, no declared page)', async () => {
  t = await drawTest(<Handoff reason="Needs a browser." size="line" />, { width: 80, height: 4 });
  const f = await t.settle();
  expect(f).toContain('/auth/home#/');
  expect(f).toContain('⇗');
  t.renderer.destroy();
  t = await drawTest(<Handoff reason="Needs a browser." to="/keys" />, { width: 80, height: 8 });
  const f2 = await t.settle();
  expect(f2).toContain('/auth/home#/');
  expect(f2).not.toContain('#/keys');
});

test('a catch-all router (no declared page) hands off the Hub root, whatever the path', async () => {
  const { element } = routed(() => <Handoff reason="Needs a browser." size="line" />, '/vault/abc');
  t = await drawTest(element, { width: 80, height: 4 });
  const f = await t.settle();
  expect(f).toContain('/auth/home#/');
  expect(f).not.toContain('vault');
});

test('the address carries the place: the realm and the active computer, before the #', async () => {
  withOrigin();
  const { element } = paged(() => <ShellDataProvider value={SHELL}><Handoff reason="Needs a browser." to="/files?path=%2Fdocs" /></ShellDataProvider>);
  t = await drawTest(element, { width: 120, height: 8 });
  const f = await t.settle();
  expect(f).toContain(`https://hub.example.com/auth/home?realm=${R_SHOWN}&computer=c0a7…00a1#/files`);
  expect(f).not.toContain(R);
  expect(f).not.toContain('path=');
});

test('`computer` names the computer the hand-off is about, in place of the shell\'s; null names none', async () => {
  const two: ShellData = { ...SHELL, computers: [...SHELL.computers, { id: 'c0a7150000000000000000b2', name: 'borealis' }] };
  for (const [computer, want] of [['c0a7150000000000000000b2', '&computer=c0a7…00b2#'], [null, '#'], ['c0a71500000000000000ffff', '#']] as const) {
    withOrigin();
    const { element } = paged(() => <ShellDataProvider value={two}><Handoff reason="Needs a browser." to="/files" computer={computer} /></ShellDataProvider>);
    t = await drawTest(element, { width: 120, height: 8 });
    const f = await t.settle();
    // An id the shell's list does not hold never travels (placeQuery), as for the shell's own computer.
    expect(f).toContain(`https://hub.example.com/auth/home?realm=${R_SHOWN}${want}/files`);
    expect(f).not.toContain('c0a7…00a1');
    t.renderer.destroy(); t = null; host?.end(); host = null;
  }
});

test('a computer id that is not 24 lower-hex never reaches the address', async () => {
  for (const bad of ['hdy_reviewcanary', 'C0A7150000000000000000A1', 'c0a7150000000000000000a1x', 'pc_9']) {
    withOrigin();
    const { element } = paged(() => <ShellDataProvider value={{ ...SHELL, computerId: bad }}><Handoff reason="Needs a browser." to="/files" /></ShellDataProvider>);
    t = await drawTest(element, { width: 120, height: 8 });
    const f = await t.settle();
    expect(f).toContain(`https://hub.example.com/auth/home?realm=${R_SHOWN}#/files`);
    expect(f).not.toContain(bad);
    t.renderer.destroy(); t = null; host?.end(); host = null;
  }
});

test('o opens it in the host browser when the host has one; a refusal says so; no opener, no [o Open]', async () => {
  const opened: string[] = [];
  await withOpener((u) => { opened.push(u); if (opened.length > 1) throw new Error('refused'); }, async () => {
    const { element } = paged(() => <Handoff reason="Needs a browser." to="/keys" />);
    t = await drawTest(element, { width: 80, height: 8 });
    let f = await t.settle();
    expect(f).toContain('[o Open] [c Copy link] [r QR code]');
    t.mockInput.pressTab(); await t.settle();
    t.mockInput.pressKey('o');
    f = await t.settle();
    expect(opened).toEqual(['https://hub.example.com/auth/home#/keys']);
    expect(f).toContain('[✓ Opened]');
    t.mockInput.pressKey('o');
    expect(await t.settle()).toContain("[! Couldn't open a browser: copy the address]");
  });
  t?.renderer.destroy(); t = null;
  await withOpener(undefined, async () => {
    const { element } = paged(() => <Handoff reason="Needs a browser." to="/keys" />);
    t = await drawTest(element, { width: 80, height: 8 });
    const f = await t.settle();
    expect(f).not.toContain('[o Open]');
    expect(f).toContain('[c Copy link]');
  });
});

test('r shows the address as a QR code for a phone (a plain address, shown at once); none without an origin', async () => {
  withOrigin();
  const { element } = paged(() => <Handoff reason="The chart needs a browser to draw." what="chart" to="/schedules" />);
  t = await drawTest(element, { width: 100, height: 40 });
  await t.settle();
  t.mockInput.pressTab(); await t.settle();
  t.mockInput.pressKey('r');
  const f = await t.settle();
  expect(f).toContain('QR code: the chart on the web');
  expect(f).toMatch(/[▀▄]/);
  expect(semText(semanticsOf(t.renderer))).toContain('filled');
  t.renderer.destroy(); t = null;
  host?.end(); host = null;
  const r2 = paged(() => <Handoff reason="x." to="/schedules" />);
  t = await drawTest(r2.element, { width: 80, height: 8 });
  expect(await t.settle()).not.toContain('QR code]');
});

test('a QR code with no room in the dialog says so, and never hands off again inside its own dialog', async () => {
  withOrigin();
  const { element } = paged(() => <Handoff reason="Needs a browser." what="board" to="/board" />);
  t = await drawTest(element, { width: 80, height: 24 });
  await t.settle();
  t.mockInput.pressTab(); await t.settle();
  t.mockInput.pressKey('r');
  const f = await t.settle();
  expect(f).toContain('QR code: the board on the web');
  expect(f).toMatch(/The QR code needs \d+ × \d+ cells/);
  // One hand-off (the page's, behind the dialog), not a second one inside the dialog.
  expect(f.split('[r QR code]').length - 1).toBeLessThanOrEqual(1);
  expect(f).not.toContain('A cut QR code cannot be scanned');
});

test('each drawn hand-off is in the draw ledger once (what + reason); a blank reason is refused at run time', async () => {
  const { clearHandoffDraws, handoffDraws } = await import('./handoff.pure');
  clearHandoffDraws();
  withOrigin();
  const { element } = paged(() => (
    <>
      <Handoff reason="Needs a browser." size="line" what="chart" />
      <Handoff reason="Needs a browser." size="line" what="chart" />
      <Handoff reason="Draws only on the web." size="line" />
    </>
  ));
  t = await drawTest(element, { width: 90, height: 8 });
  await t.settle();
  expect(handoffDraws()).toEqual([{ what: 'chart', reason: 'Needs a browser.' }, { what: 'this', reason: 'Draws only on the web.' }]);
  clearHandoffDraws();
  expect(handoffDraws()).toEqual([]);
  for (const reason of ['', '   ']) expect(() => Handoff({ reason, what: 'chart' })).toThrow('HANDOFF_REASON_EMPTY');
});

// The drawn address masks its ids, so "select the address" would copy "…" in their place. A failed copy of an
// id-bearing address points at an action that still carries the whole address; select is offered only when nothing
// is masked.
async function failCopy(shell: ShellData | null, opener?: (u: string) => void, origin = true): Promise<string> {
  if (origin) host = beginTermSession({ webOrigin: 'https://hub.example.com', ...(opener ? { openExternal: opener } : {}) });
  const el = () => <Handoff reason="Needs a browser." to="/files" />;
  const { element } = paged(shell ? () => <ShellDataProvider value={shell}>{el()}</ShellDataProvider> : el);
  t = await drawTest(element, { width: 120, height: 10 });
  (t.renderer as unknown as { copyToClipboardOSC52: (s: string) => boolean }).copyToClipboardOSC52 = () => false;
  t.mockInput.pressTab(); await t.settle();
  t.mockInput.pressKey('c');
  const f = await t.settle();
  t.renderer.destroy(); t = null; host?.end(); host = null;
  return f;
}

test('a failed copy of an id-bearing address points at the QR code, else Open, never at the masked text', async () => {
  const qr = await failCopy(SHELL);
  expect(qr).toContain('realm=0123…4567');
  expect(qr).toContain('[! Copy failed: press r for the QR code]');
  expect(qr).not.toContain('select the address');
  // No origin: no QR and no Open; the path form still masks the realm, so nothing to select either.
  const bare = await failCopy(SHELL, undefined, false);
  expect(bare).toContain('/auth/home?realm=0123…4567');
  expect(bare).toContain('[! Copy failed]');
  expect(bare).not.toContain('select the address');
  // Nothing masked (no place) and no origin: selecting the drawn text copies the real address.
  const plain = await failCopy(null, undefined, false);
  expect(plain).toContain('[! Copy failed: select the address]');
});
