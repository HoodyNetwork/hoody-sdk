// SentMessage in the terminal: the author lines, a typed message as typed, and an Ask-the-Agent message as its one-line
// request with the sent text closed under "Context sent" and whole once opened.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { act, getByRole, semanticsOf, type SemRoot } from '../../term/prim/semantics';
import { agentStartText } from '../ask';
import { Author, SentText } from './SentMessage';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const tree = () => semanticsOf(t!.renderer as unknown as SemRoot);
const draw = async (node: React.ReactNode) => {
  t = await drawTest(<FocusRoot><Box dir="column" width={70} height={30}>{node}</Box></FocusRoot>, { width: 70, height: 30 });
  return t.settle();
};

test('author lines: You, and the Agent as the host names it', async () => {
  const f = await draw(<><Author who="you" /><Author who="agent" name="Reviewer on atlas" /><Author who="agent" /></>);
  const rows = f.split('\n').map((r) => r.trimEnd());
  expect(rows[0]).toBe('You');
  expect(rows[1]).toBe('✦ Reviewer on atlas');
  expect(rows[2]).toBe('✦ Agent');
});

test('a typed message shows as typed; folded, it keeps eight lines and says it is cut', async () => {
  const long = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join('\n');
  const f = await draw(<SentText text={long} fold />);
  expect(f).toContain('line 8…');
  expect(f).not.toContain('line 9');
  t!.renderer.destroy();
  const whole = await draw(<SentText text={long} />);
  expect(whole).toContain('line 12');
  expect(whole).not.toContain('Context sent');
});

test('an action message: the request, then Context sent closed; opened it is the sent text, whole', async () => {
  const sent = agentStartText('Read the rules below and say who can open each computer.', 'atlas: everyone\ncedar: only you', { title: 'Check who can open these computers', contextLabel: 'access rules of 2 computers' })!;
  const f = await draw(<SentText text={sent} />);
  expect(f).toContain('Check who can open these computers');
  expect(f).toContain('▸ Context sent: access rules of 2 computers');
  expect(f).not.toContain('cedar: only you');
  expect(f).not.toContain('Read the rules below');
  act(getByRole(tree(), 'button', { name: 'Context sent: access rules of 2 computers' }), 'press');
  const open = await t!.settle();
  for (const words of ['Check who can open these computers', 'Instructions', 'Read the rules below and say who can open each computer.', 'atlas: everyone', 'cedar: only you']) expect(open, words).toContain(words);
});

test('a typed message with page context: the words stay, the context alone is under the row', async () => {
  const sent = agentStartText('Why is this failing?', 'exit code 3')!;
  const f = await draw(<SentText text={sent} />);
  expect(f).toContain('Why is this failing?');
  expect(f).toContain('▸ Context sent');
  expect(f).not.toContain('exit code 3');
});
