// What the Bots page's Link and keys tab hands outside the Hub in the terminal: the Addresses rows' "Open the chat page"
// and "Open the skill file" (LinkTab doorActions) open the link's address through the host's browser (openOutside ->
// TermHostServices.openExternal), whole. renderPage's `openExternal` records it as the scenario `opened` expectation
// does. Rendered at 70 rows: the Addresses section sits below Keys. The web half is not covered here (guarded by the
// no-window-open rule and openOutside's own cases).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, type Role } from '../../term/prim/semantics';

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const ORIGIN = 'https://chief-shop-bot.hoody.bot/';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

function all(role: Role, name: string | RegExp) {
  const r = s!.renderer as unknown as { root: never; stdin: never };
  return queryAllByRole(semanticsOf({ root: r.root, stdin: r.stdin }), role, { name });
}

async function doorMenu(row: 'first' | 'last'): Promise<string[]> {
  const opened: string[] = [];
  s = await renderPage({ page: 'bots', path: `/bots?sel=${encodeURIComponent(CHIEF)}&tab=link`, cols: 140, rows: 70, openExternal: (u) => { opened.push(u); } });
  await s.settle();
  // Each Addresses row is [Copy] then its row menu, in order Chat page, OpenAI, Anthropic, MCP, Skill file: the last
  // five "Row actions" buttons are the address rows'.
  expect(all('button', 'Copy').length).toBe(5);
  const menus = all('button', 'Row actions');
  act(menus[row === 'first' ? menus.length - 5 : menus.length - 1]!, 'press');
  await s.settle();
  return opened;
}

async function pick(name: string): Promise<void> {
  const [item] = all('menuitem' as Role, name);
  expect(item).toBeDefined();
  act(item!, 'press');
  await s!.settle();
}

test('Addresses: Open the chat page opens the link\'s origin whole', async () => {
  const opened = await doorMenu('first');
  await pick('Open the chat page');
  expect(opened).toEqual([ORIGIN]);
}, 180_000);

test('Addresses: Open the skill file opens the link\'s SKILL.md whole', async () => {
  const opened = await doorMenu('last');
  await pick('Open the skill file');
  expect(opened).toEqual([`${ORIGIN.slice(0, -1)}/SKILL.md`]);
}, 180_000);
