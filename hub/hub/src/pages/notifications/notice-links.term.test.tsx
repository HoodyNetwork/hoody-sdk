// A link written in a notice's message (the 'formatted' announcement: "…where you see it: https://hoody.com/notifications.")
// drew in the terminal as a terminal hyperlink inside the run of words (the web's raw <a>, through the compat runtime):
// no Tab stop, no press, so a person on the keyboard could not open it. It is now a kit Link under the message; Enter
// opens the address outside the Hub (openOutside -> TermHostServices.openExternal), whole. renderPage's `openExternal`
// records it, as the notes "Open note" test does.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, queryAllByText, semanticsOf } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test('a link in a notice is a control that opens its address outside the Hub', async () => {
  const opened: string[] = [];
  s = await renderPage({ page: 'notifications', path: '/notifications?sel=4e0007000000000000000000', cols: 120, rows: 40, openExternal: (u) => { opened.push(u); } });
  const frame = await s.settle();
  const r = s.renderer as unknown as { root: never; stdin: never };
  const tree = semanticsOf({ root: r.root, stdin: r.stdin });
  // The message still holds its address where it was written (with the sentence's full stop, which the link leaves out).
  // Read from the message's own text: the pane wraps the sentence, and a wrap may fall inside the address.
  expect(queryAllByText(tree, 'where you see it: https://hoody.com/notifications.').length).toBe(1);
  // The link under the message is drawn whole on its own line.
  expect(frame).toContain('https://hoody.com/notifications');
  const links = queryAllByRole(tree, 'link', { name: 'https://hoody.com/notifications' });
  expect(links.length).toBe(1);
  expect(links[0]!.actions).toContain('press');
  act(links[0]!, 'press');
  await s.settle();
  expect(opened).toEqual(['https://hoody.com/notifications']);
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 240_000);
