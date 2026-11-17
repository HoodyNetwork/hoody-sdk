// A hand-off address carries the declared page path and the place allowlist (realm, computer) only. A
// canary in a search value, a fragment or a sub-path below the page (the current route's, or `to`'s) must reach none
// of the address's outputs: the drawn text, the semantics tree, the terminal link (OSC 8), the clipboard bytes, the
// browser opener, or the QR code's input. A Board extra travels only when it names a computer of the
// account's list (looked up, rebuilt from the list), and the place's computer only as a 24 lower-hex id; canaries of a
// VALID shape (lower case, 24-hex) prove that a shape alone carries nothing.
import { afterEach, expect, mock, test } from 'bun:test';
import type { ReactElement, ReactNode } from 'react';

const CANARY = 'hdyR9canaryQz7x4Lp9Tv';
/** A pasted key as Hoody issues them (lower case, `hdy_` prefix): the shape the Board's own ids come closest to. */
const KEY = 'hdy_r9canaryqz7x4lp9tv';
/** The account's one computer in these tests (handle atlas.00a1). */
const ATLAS = { id: 'c0a7150000000000000000a1', name: 'atlas' };
/** Valid-shaped secrets: a lower-case handle with a 4-char suffix, and a 24-hex id that is no listed computer. */
const SECRET = 'pastedsecretcanary';
const HEXSECRET = 'feedfacefeedfacefeedface';
/** The place's computer is a canary too: it is no 24 lower-hex id, so it never reaches any output. */
const PLACE = 'hdy_reviewcanary';
const BOARD = 'https://hub.example.com/auth/home#/board';
// The QR dialog's input, as handed to it (the only way to read what the QR code encodes without decoding pixels).
const qrInputs: string[] = [];
const realDialog = await import('../qr/termQrDialog');
// The original function, taken BEFORE the mock: the module namespace is a live binding, so after mock.module
// `realDialog.QrAddressDialog` is the mock itself (calling it recursed until out of memory).
const RealQrAddressDialog = realDialog.QrAddressDialog;
mock.module('../qr/termQrDialog', () => ({
  ...realDialog,
  QrAddressDialog: (p: { url: string; open: boolean } & Record<string, unknown>) => { qrInputs.push(p.url); return RealQrAddressDialog(p as never); },
}));
const { drawTest } = await import('../../term/prim/testing');
// The router's globals (scrollTo) come from the test preload; a dynamic import of that export-less file is a type error.
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { createMemoryHistory } = await import('@tanstack/history');
const { createRootRoute, createRoute, createRouter, RouterProvider } = await import('@tanstack/react-router');
const { FocusRoot } = await import('../../term/prim');
const { parseSearch, stringifySearch } = await import('../../term/app/router');
const { Handoff } = await import('./Handoff');
const { beginTermSession } = await import('../../term/env/session');
const { semanticsOf, semJson, semText } = await import('../../term/prim/semantics');
const { ShellDataProvider } = await import('../../shell/context');
type TestTerm = Awaited<ReturnType<typeof drawTest>>;

/** A router like the terminal Hub's (term/app/router.tsx): an index and one splat route per declared page path. The
 *  catch-all harness (termHarness routed) declares no page, so every hand-off there is the Hub root. */
function paged(children: () => ReactNode, at = '/board'): { element: ReactNode } {
  const root = createRootRoute({ component: () => <>{children()}</> });
  const pages = ['/board', '/keys', '/vault', '/files', '/schedules'].map((p) => createRoute({ getParentRoute: () => root, path: `${p}/$`, component: () => null }));
  const index = createRoute({ getParentRoute: () => root, path: '/', component: () => null });
  const router = createRouter({ routeTree: root.addChildren([index, ...pages]), history: createMemoryHistory({ initialEntries: [at] }), origin: 'http://hub.term', parseSearch, stringifySearch } as never);
  return { element: <QueryClientProvider client={new QueryClient()}><FocusRoot><RouterProvider router={router as never} /></FocusRoot></QueryClientProvider> };
}

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; qrInputs.length = 0; });

/** Every OSC 8 link the renderer holds: OpenTUI keeps a text's link on the span nodes under its root text node
 *  (`_link`, set from Text href), not on the text renderable itself. */
function linksOf(node: unknown, out: string[] = []): string[] {
  const spans = (x: unknown): void => {
    const s = x as { _link?: { url?: unknown }; _children?: unknown[] } | null;
    if (!s || typeof s !== 'object') return;
    if (typeof s._link?.url === 'string') out.push(s._link.url);
    for (const c of s._children ?? []) spans(c);
  };
  const n = node as { rootTextNode?: unknown; getChildren?: () => unknown[] };
  try { spans(n.rootTextNode); } catch { /* not a text */ }
  for (const k of n.getChildren?.() ?? []) linksOf(k, out);
  return out;
}

/** The shell's place: realms, the realm and the computer the person has open (a canary by default). */
type Place = { realms?: ReadonlyArray<{ id: string; name: string }>; realmId?: string; computerId?: string };

async function drive(el0: () => ReactElement, at?: string, computers: ReadonlyArray<{ id: string; name: string }> = [ATLAS], place: Place = {}): Promise<{ frame: string; tree: string; links: string[]; copied: string[]; opened: string[] }> {
  const opened: string[] = [];
  const session = beginTermSession({ webOrigin: 'https://hub.example.com', openExternal: (u: string) => { opened.push(u); } });
  const shell = { realms: place.realms ?? [], realmId: place.realmId ?? 'all', computers: computers as never, computerId: place.computerId ?? PLACE };
  const el = (): ReactElement => <ShellDataProvider value={shell}>{el0()}</ShellDataProvider>;
  try {
    const { element } = at ? paged(el, at) : paged(el);
    t = await drawTest(element, { width: 120, height: 40 });
    const copied: string[] = [];
    (t.renderer as unknown as { copyToClipboardOSC52: (s: string) => boolean }).copyToClipboardOSC52 = (s) => { copied.push(s); return true; };
    let frame = await t.settle();
    t.mockInput.pressTab(); await t.settle();
    t.mockInput.pressKey('c'); await t.settle();
    t.mockInput.pressKey('o'); await t.settle();
    t.mockInput.pressKey('r'); frame += await t.settle();
    const tr = semanticsOf(t.renderer as never);
    return { frame, tree: semText(tr) + JSON.stringify(semJson(tr)), links: linksOf(t.renderer.root), copied, opened };
  } finally { session.end(); }
}

for (const [name, el, at, expected] of [
  ['the current route\'s search', () => <Handoff reason="Needs a browser." what="board" />, `/board?token=${CANARY}&sel=a1`],
  ['a `to` search', () => <Handoff reason="Needs a browser." what="board" to={`/board?invite=${CANARY}`} />, undefined],
  ['a `to` fragment', () => <Handoff reason="Needs a browser." what="board" to={`/board#${CANARY}`} />, undefined],
  ['the current route\'s sub-path', () => <Handoff reason="Needs a browser." what="board" />, `/board/${CANARY}/x`],
  ['a `to` sub-path', () => <Handoff reason="Needs a browser." what="board" to={`/board/${CANARY}`} />, undefined],
  // The Board's own sub-paths and Add link travel, each in an exact shape: a canary in each new shape.
  ['a program view\'s handle (token)', () => <Handoff reason="Needs a browser." what="board" />, `/board/open/${CANARY}.k3/terminal-1`],
  ['a program view\'s handle (pasted key)', () => <Handoff reason="Needs a browser." what="board" />, `/board/open/${KEY}.k3/terminal-1`],
  ['a program view\'s program part', () => <Handoff reason="Needs a browser." what="board" to={`/board/open/atlas.00a1/${KEY}-1`} />, undefined],
  ['a valid-shaped handle that is no listed computer', () => <Handoff reason="Needs a browser." what="board" />, `/board/open/${SECRET}.xx/terminal-1`],
  ['a valid-shaped handle in `to`', () => <Handoff reason="Needs a browser." what="board" to={`/board/open/${SECRET}.00a1/port-8080`} />, undefined],
  ['a cid that is not 24-hex', () => <Handoff reason="Needs a browser." what="board" />, `/board?add=terminal-new&cid=${CANARY}`],
  ['a 24-hex cid that is no listed computer', () => <Handoff reason="Needs a browser." what="board" />, `/board?add=terminal-new&cid=${HEXSECRET}`],
  ['a pasted key in add', () => <Handoff reason="Needs a browser." what="board" />, `/board?add=${KEY}&cid=${ATLAS.id}`],
  ['an extra search key beside a good Add link', () => <Handoff reason="Needs a browser." what="board" />, `/board?add=terminal-1&cid=${ATLAS.id}&token=${KEY}`, `${BOARD}?add=terminal-1&cid=${ATLAS.id}`],
  ['a script view (free route text)', () => <Handoff reason="Needs a browser." what="board" to={`/board/open/atlas.00a1/script/${KEY}`} />, undefined],
] as Array<[string, () => ReactElement, string | undefined, string?]>) {
  test(`a canary in ${name} reaches no output of the hand-off`, async () => {
    const r = await drive(el, at);
    const want = expected ?? BOARD;
    // Each output was produced (an empty one would pass for the wrong reason) and holds only what may travel.
    expect(r.copied).toEqual([want]);
    expect(r.opened).toEqual([want]);
    expect(r.links).toContain(want);
    expect(qrInputs.length).toBeGreaterThan(0);
    for (const out of [r.frame, r.tree, ...r.links, ...r.copied, ...r.opened, ...qrInputs]) {
      for (const c of [CANARY, KEY, SECRET, HEXSECRET, PLACE]) expect(out).not.toContain(c);
    }
  });
}

test('the Board\'s own program view and Add link travel whole', async () => {
  for (const [at, want] of [
    ['/board/open/atlas.00a1/terminal-1', `${BOARD}/open/atlas.00a1/terminal-1`],
    ['/board/open/atlas.00a1/port-8080', `${BOARD}/open/atlas.00a1/port-8080`],
    [`/board?add=terminal-new&cid=${ATLAS.id}`, `${BOARD}?add=terminal-new&cid=${ATLAS.id}`],
  ] as const) {
    const r = await drive(() => <Handoff reason="Needs a browser." what="board" />, at);
    expect(r.copied).toEqual([want]);
    expect(r.opened).toEqual([want]);
  }
});

test('with no computer list (not loaded, or no shell) a Board extra never travels', async () => {
  for (const at of ['/board/open/atlas.00a1/terminal-1', `/board?add=terminal-new&cid=${ATLAS.id}`]) {
    const r = await drive(() => <Handoff reason="Needs a browser." what="board" />, at, []);
    expect(r.copied).toEqual([BOARD]);
    expect(r.opened).toEqual([BOARD]);
  }
});

/** A listed realm, and a 24-hex realm id that is no listed realm (valid shape, so only provenance can refuse it). */
const REALM = { id: '5e1f00000000000000000a11', name: 'Work' };
const HEXREALM = 'deadbeefdeadbeefdeadbeef';

/** Every output a person READS: the drawn frame and the semantics tree (accessible names included). */
const readable = (r: { frame: string; tree: string }): string[] => [r.frame, r.tree];

test('a valid-shaped place that no list holds reaches no output', async () => {
  for (const place of [
    { realms: [REALM], realmId: HEXREALM, computerId: HEXSECRET },
    // No realm list at all: not even 'all' or a listed-looking id travels.
    { realms: [], realmId: REALM.id, computerId: HEXSECRET },
  ]) {
    const r = await drive(() => <Handoff reason="Needs a browser." what="board" />, '/board', [ATLAS], place);
    const want = BOARD;
    expect(r.copied).toEqual([want]);
    expect(r.opened).toEqual([want]);
    expect(r.links).toContain(want);
    expect(qrInputs.length).toBeGreaterThan(0);
    for (const out of [...readable(r), ...r.links, ...r.copied, ...r.opened, ...qrInputs]) {
      for (const c of [HEXSECRET, HEXREALM, REALM.id]) expect(out).not.toContain(c);
    }
    qrInputs.length = 0;
  }
});

test('a listed realm and computer travel, rebuilt from the lists', async () => {
  const r = await drive(() => <Handoff reason="Needs a browser." what="board" />, '/board', [ATLAS], { realms: [REALM], realmId: REALM.id, computerId: ATLAS.id });
  const want = `https://hub.example.com/auth/home?realm=${REALM.id}&computer=${ATLAS.id}#/board`;
  expect(r.copied).toEqual([want]);
  expect(r.opened).toEqual([want]);
  expect(r.links).toContain(want);
  expect(qrInputs).toContain(want);
});

test('the drawn address and its accessible text mask every 24-hex id; actions keep the whole address', async () => {
  const r = await drive(() => <Handoff reason="Needs a browser." what="board" />, `/board?add=terminal-new&cid=${ATLAS.id}`, [ATLAS], { realms: [REALM], realmId: REALM.id, computerId: ATLAS.id });
  const want = `https://hub.example.com/auth/home?realm=${REALM.id}&computer=${ATLAS.id}#/board?add=terminal-new&cid=${ATLAS.id}`;
  expect(r.copied).toEqual([want]);
  expect(r.opened).toEqual([want]);
  expect(r.links).toContain(want);
  expect(qrInputs).toContain(want);
  for (const out of readable(r)) {
    expect(out).not.toMatch(/[0-9a-f]{24}/i);
  }
  // The masked form is what is drawn (first 4 and last 4, maskId's form).
  expect(r.tree).toContain(`realm=5e1f…0a11&computer=c0a7…00a1#/board?add=terminal-new&cid=c0a7…00a1`);
});

test('a Board key given twice is ambiguous, so no extra travels (neither the first nor the last value)', async () => {
  const BETA = { id: '0123456789abcdef01234567', name: 'beta' };
  for (const at of [
    `/board?add=terminal-1&add=terminal-2&cid=${ATLAS.id}`,
    `/board?add=terminal-1&cid=${BETA.id}&cid=${ATLAS.id}`,
    `/board?cid=${ATLAS.id}&add=terminal-1&cid=${ATLAS.id}`,
  ]) {
    const r = await drive(() => <Handoff reason="Needs a browser." what="board" />, at, [ATLAS, BETA]);
    expect(r.copied).toEqual([BOARD]);
    expect(r.opened).toEqual([BOARD]);
    expect(r.links).toContain(BOARD);
  }
});
