// The program view's hand-off in a terminal names what its web address opens. The address carries the view only for
// a program or HTTP port of a computer in the account's list (kit handoff.pure.ts pageRoute); for a script view, or a
// handle no listed computer has, it opens the Board. The hand-off said "Open the program on the web" for every view,
// so an unlisted handle's link promised the program and opened the Board.
//  1. A listed computer's program: "Open the program on the web:".
//  2. A handle no listed computer has: "Open the Board on the web:", never "the program".
//  3. A listed computer's script view: the Board too (a script's route never travels).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../../scripts/term/render';
import { semanticsOf, semText } from '../../../term/prim/semantics';
import handoff from '../../../kit/states/Handoff.term.strings.en.json';
import strings from './boardTerm.strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const opens = (what: string): string => handoff['handoff.openThing'].replace('{{what}}', what);
const text = (): string => semText(semanticsOf(s!.renderer as never));

for (const [name, path, what] of [
  ['a listed computer\'s program', '/board/open/atlas.00a1/terminal-1', strings['term.view.what']],
  ['a handle no listed computer has', '/board/open/nowhere.0000/terminal-1', strings['term.what']],
  ['a listed computer\'s script view', '/board/open/atlas.00a1/script/orders', strings['term.what']],
] as const) {
  test(`${name}: the hand-off says "${opens(what)}"`, async () => {
    s = await renderPage({ page: 'board', cols: 80, rows: 24, path });
    await s.settle();
    expect(s.failures).toEqual([]);
    expect(text()).toContain(opens(what));
    const other = what === strings['term.what'] ? strings['term.view.what'] : strings['term.what'];
    expect(text()).not.toContain(opens(other));
  }, 60_000);
}
