// CopyField shows a web address as the web does (Ids.tsx: `link ? <ExtLink url={value} look="nav" /> : safeShown(value)`):
// a link a reader can follow (role link, named with "opens in a new tab"), and an address holding an id as the masked
// ExtLink button. Before, the terminal drew it as blue words with no link (Ids.term.tsx CopyField).
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { queryAllByRole, semanticsOf } from '../../term/prim/semantics';
import { CopyField } from './Ids';

const ADDR = 'https://docs.example.com/guide';
const SECRET = 'https://u0123456789abcdef01234567.example.com/x';

async function draw(node: React.ReactNode) {
  const t = await drawTest(<FocusRoot>{node}</FocusRoot>, { width: 80, height: 8 });
  const frame = await t.settle();
  const tree = semanticsOf(t.renderer as never);
  t.renderer.destroy();
  return { frame, tree };
}

test('a web address is a link that opens in a new tab', async () => {
  const { frame, tree } = await draw(<CopyField label="Docs" value={ADDR} />);
  expect(frame).toContain('docs.example.com/guide');
  expect(queryAllByRole(tree, 'link').filter((l) => l.name.includes('docs.example.com')).length).toBe(1);
});

test('plain: a web address stays words (no link), as on the web', async () => {
  const { tree } = await draw(<CopyField label="Docs" value={ADDR} plain />);
  expect(queryAllByRole(tree, 'link').length).toBe(0);
});

test('an address holding an id is the masked button even under plain; the id never shows', async () => {
  const { frame, tree } = await draw(<CopyField label="Secret" value={SECRET} plain />);
  expect(frame).not.toContain('0123456789abcdef01234567');
  // Drawn without the terminal app the name is the web's "(opens in a new tab)"; once the app has put its wording into
  // the shared table (another file of the same run) it is "(opens outside the Hub)". Either names the one button.
  expect(queryAllByRole(tree, 'button').filter((b) => /new tab|outside the Hub/i.test(b.name)).length).toBe(1);
});
