// The Customize list in a terminal (widgets/OrderList.term.tsx): each card's row holds its switch, named by the card,
// and [↑] [↓] on one line, the buttons named "Move <card> up/down". Pressing ↓ moves the card down a place. The web
// row's icon buttons drew their whole label ("[Move Start something up]") and squeezed the switch into 4 cells.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, getByRef, semanticsOf, type SemNode } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`${cols}x${rows}: one line per card; ↓ moves the card down`, async () => {
    s = await renderPage({ page: 'home', path: '/home?customize=1', cols, rows });
    let frame = await s.settle();
    expect(s.failures).toEqual([]);
    const lines = frame.split('\n');
    const row = (title: string) => lines.find((l) => l.includes(`] ${title}`)) ?? '';
    for (const title of ['Start something', 'Your realms']) expect(row(title)).toMatch(/\[■ on ?\] \S.*\[↑\] \[↓\]/);
    const tree = () => semanticsOf({ root: (s!.renderer as never as { root: unknown }).root, stdin: (s!.renderer as never as { stdin: unknown }).stdin } as never);
    const flat = (ns: SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
    // The cards in their order, from their "Move … down" buttons; the card right under Start something changes places
    // with it (which card that is depends on the cards the pages give Home).
    const order = () => flat(tree()).filter((n) => n.role === 'button' && /^Move .+ down$/.test(n.name)).map((n) => n.name.replace(/^Move (.+) down$/, '$1'));
    const before = order();
    const i = before.indexOf('Start something');
    expect(i).toBeGreaterThan(-1);
    const next = before[i + 1];
    expect(next).toBeDefined();
    const down = flat(tree()).find((n) => n.role === 'button' && n.name === 'Move Start something down');
    expect(down).toBeDefined();
    act(getByRef(tree(), down!.ref)!, 'press');
    frame = await s.settle();
    expect(order()).toEqual([...before.slice(0, i), next!, 'Start something', ...before.slice(i + 2)]);
    const at = (title: string) => frame.split('\n').findIndex((l) => l.includes(`] ${title}`));
    expect(at(next!)).toBeGreaterThan(-1);
    expect(at(next!)).toBeLessThan(at('Start something'));
  }, 120_000);
}
