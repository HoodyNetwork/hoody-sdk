// A ticket's thread in a short pane: once the reply box holds a long draft and a send whose answer was lost, pinning the
// ticket's head would leave the messages under 4 rows, so the head moves into the scroll with them. A DetailPage pins
// its own head: its DetailHeader is never a sticky box of the pane (a bare DetailHeader's, a Bot's), which would count
// its rows as covered when a focused thing is scrolled into view. It scrolls away with the thread.
import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, type SemNode } from '../../term/prim/semantics';
import kit from '../../kit/strings.en.json';
import strings from './strings.en.json';

type S = Awaited<ReturnType<typeof renderPage>>;
let s: S | null = null;
afterEach(() => { s?.close(); s = null; });

/** T_LONG of the fixtures: "A ticket with many messages", 60 messages. */
const LONG = '0000000000000000' + (0x6720a1b2 + 7).toString(16);
const SUBJECT = 'A ticket with many messages';
const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const one = (role: 'textbox' | 'button', name: string): SemNode | undefined => queryAllByRole(tree(), role, { name })[0];

test('short pane: the ticket head is no sticky box and scrolls away with the thread', async () => {
  s = await renderPage({ page: 'support', fx: 'sendUnknown', cols: 80, rows: 24, path: `/support?sel=${LONG}` });
  await s.settle();
  const box = one('textbox', strings['reply.label']);
  expect(box).toBeDefined();
  act(box!, 'focus');
  await s.settle();
  await s.keys.type('One more question about the last message. '.repeat(6).trim());
  act(one('button', strings['action.send'])!, 'press');
  for (let i = 0; i < 20 && !s.frame.includes(kit['outcome.pending.title']); i++) await s.settle();
  expect(s.frame, s.frame).toContain(kit['outcome.pending.title']);
  // Scroll the thread to its end with the wheel over the messages (SGR mouse, 65 = down, 1-based cells).
  const r0 = s.renderer as unknown as { stdin?: { emit(e: 'data', b: Buffer): unknown } };
  for (let i = 0; i < 600 && !s.frame.includes('Message number 60 of'); i++) { r0.stdin?.emit('data', Buffer.from('\x1b[<65;40;7M')); await s.settle(); }
  const frame = await s.settle();
  type N = { __hxSticky?: boolean; getChildren?: () => N[] };
  const sticky: N[] = [];
  const walk = (n: N): void => { if (n.__hxSticky) sticky.push(n); for (const c of n.getChildren?.() ?? []) walk(c); };
  walk((s.renderer as unknown as { root: N }).root);
  expect(sticky.length, frame).toBe(0);
  // Positive control: the thread's last message is drawn; the head, in the scroll, went away above it.
  expect(frame, frame).toContain('Message number 60 of the long thread.');
  expect(frame, frame).not.toContain(SUBJECT);
}, 180_000);
