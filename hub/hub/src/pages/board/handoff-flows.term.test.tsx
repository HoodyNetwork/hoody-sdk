// The Board page in a terminal is a hand-off to the web Board (parts/BoardView.term.tsx, parts/ProgramView.term.tsx,
// kit states/Handoff.term.tsx). What each key hands out, through the whole page with the shell's own realm and computer
// lists (the address rules are kit states/handoff.pure.ts hubWebAddress and pageRoute):
//  1. o gives the host's browser opener the whole address once (realm and computer from the shell's lists, #/board),
//     nothing moves inside the Hub, and c copies the same address.
//  2. A program view and a port view of a listed computer copy their own /board/open/... address; the view is named
//     with its computer and the hand-off says "the program".
//  3. An Add link of a listed computer travels whole (add and cid) to the opener and the clipboard; one whose cid is
//     no listed computer travels as the plain Board, and the cid reaches no output.
//  4. With no web origin there is no Open and no QR code even when the host has an opener: the card says where the
//     address is read, o and r do nothing, and c copies the path form.
//  5. r shows the QR code in a dialog; Esc closes it and the focus is back on the hand-off, whose keys work again.
import { afterEach, expect, test } from 'bun:test';
import { fixtureWorld } from '@core';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { FIXTURE_WEB_ORIGIN } from '../../../scripts/term/fixture-origin';
import { focusedNode, semanticsOf, semText, type SemNode } from '../../term/prim/semantics';
import { copiesOf } from '../../term/prim/testing';
import { HUB_WEB_PATH } from '../../kit/states/handoff.pure';
import handoff from '../../kit/states/Handoff.term.strings.en.json';
import qr from '../../kit/qr/strings.en.json';
import strings from './parts/boardTerm.strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const ATLAS = fixtureWorld.current;
const HANDLE = `${ATLAS.name}.${ATLAS.id.slice(-4)}`;
/** The place the shell's lists verify: the realm shown (Personal) and the current computer. */
const PLACE = `?realm=${fixtureWorld.realm('Personal').id}&computer=${ATLAS.id}`;
const PATH_FORM = `${HUB_WEB_PATH}${PLACE}#`;
const WEB = `${FIXTURE_WEB_ORIGIN}${PATH_FORM}`;
/** A 24-hex id no computer of the fixture account has. */
const UNLISTED = 'feedfacefeedfacefeedface';

const tree = (): SemNode[] => semanticsOf(s!.renderer as never);
const flat = (ns: readonly SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
const pressable = (name: string): SemNode | undefined => flat(tree()).find((n) => n.name === name && n.actions.includes('press'));
const opens = (what: string): string => handoff['handoff.openThing'].replace('{{what}}', what);

async function open(o: { path?: string; opener?: string[]; webOrigin?: null }): Promise<{ copied: string[] }> {
  s = await renderPage({
    page: 'board', cols: 80, rows: 24,
    ...(o.path ? { path: o.path } : {}),
    ...(o.opener ? { openExternal: (url: string) => { o.opener!.push(url); } } : {}),
    ...(o.webOrigin === null ? { webOrigin: null } : {}),
  });
  await s.settle();
  expect(s.failures).toEqual([]);
  return { copied: copiesOf(s.renderer) };
}

test('o hands the whole Board address to the browser opener once, the Board stays, and c copies the same address', async () => {
  const opened: string[] = [];
  const { copied } = await open({ opener: opened });
  // The first action is Open, and it has the focus on the fresh page.
  expect(focusedNode(tree())?.name).toBe(handoff['handoff.open']);
  await s!.keys.press('o');
  expect(opened).toEqual([`${WEB}/board`]);
  expect(s!.frame).toContain(handoff['handoff.opened']);
  // Nothing navigated inside the Hub: the hand-off is still the page.
  expect(s!.frame).toContain(opens(strings['term.what']));
  await s!.keys.press('c');
  expect(copied).toEqual([`${WEB}/board`]);
  expect(opened.length).toBe(1);
  expect(s!.failures).toEqual([]);
}, 120_000);

for (const [view, name] of [
  ['terminal-1', 'terminal-1'],
  ['port-8080', 'port 8080'],
] as const) {
  test(`the ${name} view of a listed computer copies its own address and names it with the computer`, async () => {
    const at = `/board/open/${HANDLE}/${view}`;
    const { copied } = await open({ path: at });
    const text = semText(tree());
    expect(text).toContain(`text "${strings['term.view.title'].replace('{{name}}', name).replace('{{computer}}', ATLAS.name)}"`);
    expect(text).toContain(opens(strings['term.view.what']));
    await s!.keys.press('c');
    expect(copied).toEqual([`${WEB}${at}`]);
    expect(s!.failures).toEqual([]);
  }, 120_000);
}

for (const [name, cid, travels] of [
  ['a listed computer travels whole (add and cid)', ATLAS.id, true],
  ['a computer the account does not list travels as the plain Board', UNLISTED, false],
] as const) {
  test(`an Add link of ${name}: the opener and the clipboard get the same address`, async () => {
    const opened: string[] = [];
    const { copied } = await open({ path: `/board?add=terminal-new&cid=${cid}`, opener: opened });
    await s!.keys.press('o');
    await s!.keys.press('c');
    const want = travels ? `${WEB}/board?add=terminal-new&cid=${cid}` : `${WEB}/board`;
    expect(opened).toEqual([want]);
    expect(copied).toEqual([want]);
    if (!travels) {
      const t = tree();
      for (const out of [s!.frame, semText(t), JSON.stringify(t), ...s!.errors]) expect(out).not.toContain(UNLISTED);
    }
    expect(s!.failures).toEqual([]);
  }, 120_000);
}

test('no web origin: no Open and no QR code even with a browser opener; o and r do nothing; c copies the path form', async () => {
  const opened: string[] = [];
  const { copied } = await open({ opener: opened, webOrigin: null });
  expect(s!.frame).toContain(handoff['handoff.noOrigin']);
  expect(pressable(handoff['handoff.open'])).toBeUndefined();
  expect(pressable(handoff['handoff.qr'])).toBeUndefined();
  // The one action left has the focus.
  expect(focusedNode(tree())?.name).toBe(handoff['handoff.copy']);
  await s!.keys.press('o');
  await s!.keys.press('r');
  expect(opened).toEqual([]);
  expect(flat(tree()).some((n) => n.role === 'dialog')).toBe(false);
  await s!.keys.press('c');
  expect(copied).toEqual([`${PATH_FORM}/board`]);
  expect(s!.failures).toEqual([]);
}, 120_000);

test('r shows the QR code; Esc closes it and the focus is back on the hand-off, whose keys work again', async () => {
  const { copied } = await open({});
  const title = qr['qr.title'].replace('{{name}}', handoff['handoff.qrName'].replace('{{what}}', strings['term.what']));
  const dialog = (): SemNode | undefined => flat(tree()).find((n) => n.role === 'dialog' && n.name === title);
  expect(focusedNode(tree())?.name).toBe(handoff['handoff.copy']);
  await s!.keys.press('r');
  expect(dialog()).toBeDefined();
  await s!.keys.press('escape');
  expect(dialog()).toBeUndefined();
  expect(focusedNode(tree())?.name).toBe(handoff['handoff.copy']);
  await s!.keys.press('c');
  expect(copied).toEqual([`${WEB}/board`]);
  expect(s!.failures).toEqual([]);
}, 120_000);
