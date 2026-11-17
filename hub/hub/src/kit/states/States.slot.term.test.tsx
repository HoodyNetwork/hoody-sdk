// A state's body that is a sentence with something inline in it (Billing's "If nothing opens, use this link: <Link>")
// is one wrapping line, as on the web. Each piece of the fragment was a line of its own and the " " between them a
// blank row (Add funds after "Continue to payment").
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, Text } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { OutcomeBanner } from './States';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const draw = async (node: React.ReactNode, w = 70, h = 10) => { t = await drawTest(<FocusRoot><OverlayHost>{node}</OverlayHost></FocusRoot>, { width: w, height: h }); return (await t.settle()).split('\n').map((l) => l.trimEnd()); };

test('words and an inline piece share a line; no blank row between them', async () => {
  const rows = await draw(<OutcomeBanner kind="done" title="Taking you to the payment page" body={<>If nothing opens, use this link: <Text>Open the payment page</Text></>} />);
  const y = rows.findIndex((l) => l.includes('If nothing opens, use this link:'));
  expect(y).toBeGreaterThan(-1);
  expect(rows[y]).toContain('If nothing opens, use this link: Open the payment page');
});

test('too narrow for one line: the inline piece wraps to the next line, still no blank row', async () => {
  const rows = await draw(<OutcomeBanner kind="done" title="Taking you to the payment page" body={<>If nothing opens, use this link: <Text>Open the payment page</Text></>} />, 44);
  const y = rows.findIndex((l) => l.includes('If nothing opens'));
  const z = rows.findIndex((l) => l.includes('Open the payment page'));
  expect(z).toBe(y + 1);
});

test('a fragment with no words of its own is left as it is (blocks stay lines)', async () => {
  const rows = await draw(<OutcomeBanner kind="done" title="Done" body={<><Text>First line</Text><Text>Second line</Text></>} />);
  expect(rows.findIndex((l) => l.includes('Second line'))).toBe(rows.findIndex((l) => l.includes('First line')) + 1);
});
