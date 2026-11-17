// ActionMenu in the terminal (Menu.term.tsx on Menu.model.ts).
//
// | # | Web behaviour (Menu.tsx, React Aria menu) | Test |
// |---|---|---|
// | 1 | The "⋯" trigger opens a list against it; Enter on the trigger opens it | 'opens from the trigger' |
// | 2 | Opening focus: first enabled non-danger item (a one-of group's current first) | 'opening focus' |
// | 3 | ↑/↓ move, Home/End jump; disabled items stay in the order | 'arrows' |
// | 4 | Type-ahead over the labels | 'type-ahead' |
// | 5 | Enter/Space choose: onAction() once, the menu closes, focus back on the trigger | 'choose' |
// | 6 | A disabled item does nothing; its reason shows under it, a shared reason once as a note | 'disabled' |
// | 7 | Shortcuts at the row end; "…" on an item that opens; one-of current marked; many as boxes | 'marks' |
// | 8 | Danger items move to the end after a rule; the footer comes last | 'danger area' |
// | 9 | Esc, Tab or a press outside closes without choosing | 'closes' |
// | 10 | A copy item says "Copied", runs onAction, closes after COPIED_MS | 'copy' |
// | 11 | runMenuAction runs an item outside the menu (shared, Menu.model) | 'runMenuAction' |
// | 12 | Flips above when the room below is short; clamped inside the screen | 'flips' |
// | 13 | A list taller than the screen allows scrolls with the focus; the chosen row is always drawn | 'a short screen' |
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot, Pressable, Text } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { ActionMenu, COPIED_MS, runMenuAction, type MenuList } from './Menu';

async function esc(t: { mockInput: { pressEscape(): void }; settle(): Promise<string> }): Promise<string> {
  t.mockInput.pressEscape();
  await new Promise((r) => setTimeout(r, 80));
  return t.settle();
}

const list = (log: string[]): MenuList => [
  { id: 'run', label: 'Run now', shortcut: 'R', onAction: () => log.push('run') },
  { id: 'edit', label: 'Edit', opens: true, onAction: () => log.push('edit') },
  { id: 'pause', label: 'Pause', isDisabled: true, disabledReason: 'It is not running', onAction: () => log.push('pause') },
  { id: 'delete', label: 'Delete', tone: 'danger', opens: true, onAction: () => log.push('delete') },
  { id: 'logs', label: 'Logs', onAction: () => log.push('logs') },
];

function Page({ log, items, top = 0 }: { log: string[]; items?: MenuList; top?: number }) {
  return (
    <>
      {Array.from({ length: top }, (_, i) => <Text key={i}> </Text>)}
      <Pressable autoFocus onPress={() => log.push('page')}>{({ focused }) => <Text inverse={focused}>[Page]</Text>}</Pressable>
      <ActionMenu items={items ?? list(log)} label="Schedule actions" placement="bottom start" />
    </>
  );
}
const draw = (log: string[], items?: MenuList, top = 0, w = 80, h = 24) => drawTest(<FocusRoot><OverlayHost><Page log={log} items={items} top={top} /></OverlayHost></FocusRoot>, { width: w, height: h });

/** Opens the menu from the keyboard (Tab to the trigger, Enter). */
async function openMenu(t: Awaited<ReturnType<typeof draw>>): Promise<string> {
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  return t.settle();
}
const focusedRow = (f: string) => f.split('\n').find((l) => l.includes('›'))?.replace(/.*›\s*/, '').replace(/[│\s].*$/, '');

test('opens from the trigger, below it; marks: shortcut, …, reason', async () => {
  const t = await draw([]);
  let f = await t.settle();
  expect(f).toContain('[⋯]');
  expect(f).not.toContain('Run now');
  f = await openMenu(t);
  const lines = f.split('\n');
  expect(lines.findIndex((l) => l.includes('Run now'))).toBeGreaterThan(lines.findIndex((l) => l.includes('[⋯]')));
  expect(f).toMatch(/Run now\s+R/);
  expect(f).toContain('Edit…');
  expect(f).toContain('It is not running');
  t.renderer.destroy();
});

test('opening focus is the first enabled non-danger item; arrows, Home/End, disabled in the order', async () => {
  const t = await draw([]);
  let f = await openMenu(t);
  expect(focusedRow(f)).toBe('Run');
  t.mockInput.pressArrow('down');
  t.mockInput.pressArrow('down');
  f = await t.settle();
  expect(focusedRow(f)).toBe('Pause');
  t.mockInput.pressKey('\x1b[F');
  t.mockInput.pressArrow('down');
  f = await t.settle();
  // the danger item is last (moved to the danger area)
  expect(focusedRow(f)).toBe('Delete…');
  t.mockInput.pressArrow('up');
  f = await t.settle();
  expect(focusedRow(f)).toBe('Logs');
  t.renderer.destroy();
});

test('danger area: after a rule, at the end', async () => {
  const t = await draw([]);
  const f = await openMenu(t);
  const logs = f.indexOf('Logs');
  const del = f.indexOf('Delete…');
  expect(del).toBeGreaterThan(logs);
  expect(f.slice(logs, del)).toContain('─');
  t.renderer.destroy();
});

test('type-ahead moves to the matching label', async () => {
  const t = await draw([]);
  await openMenu(t);
  await t.mockInput.typeText('l');
  let f = await t.settle();
  expect(focusedRow(f)).toBe('Logs');
  await t.mockInput.typeText('e');
  f = await t.settle();
  expect(focusedRow(f)).toBe('Logs');
  t.renderer.destroy();
});

test('choose: Enter runs onAction once and closes; focus is back on the trigger', async () => {
  const log: string[] = [];
  const t = await draw(log);
  await openMenu(t);
  t.mockInput.pressArrow('down');
  await t.settle();
  t.mockInput.pressEnter();
  let f = await t.settle();
  expect(log).toEqual(['edit']);
  expect(f).not.toContain('Run now');
  // the trigger kept the focus: Enter opens the menu again
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(f).toContain('Run now');
  t.renderer.destroy();
});

test('disabled: choosing does nothing and the menu stays', async () => {
  const log: string[] = [];
  const t = await draw(log);
  await openMenu(t);
  t.mockInput.pressArrow('down');
  t.mockInput.pressArrow('down');
  await t.settle();
  t.mockInput.pressEnter();
  t.mockInput.pressKey(' ');
  const f = await t.settle();
  expect(log).toEqual([]);
  expect(f).toContain('Run now');
  t.renderer.destroy();
});

test('a shared reason shows once as a note; one-of current and many boxes', async () => {
  const items: MenuList = [
    { id: 'g', label: 'Sort', select: 'one', current: 'new', items: [{ id: 'new', label: 'Newest', onAction: () => undefined }, { id: 'old', label: 'Oldest', onAction: () => undefined }] },
    { id: 'h', note: 'Ask the owner', items: [{ id: 'a', label: 'Move', isDisabled: true, onAction: () => undefined }, { id: 'b', label: 'Share', isDisabled: true, onAction: () => undefined }] },
    { id: 'm', select: 'many', items: [{ id: 'w', label: 'Wrap', checked: true, onAction: () => undefined }, { id: 'n', label: 'Numbers', checked: false, onAction: () => undefined }] },
  ];
  const t = await draw([], items);
  const f = await openMenu(t);
  expect(f.split('Ask the owner').length - 1).toBe(1);
  expect(f).toMatch(/Newest\s+✓/);
  expect(f).toContain('[x] Wrap');
  expect(f).toContain('[ ] Numbers');
  expect(focusedRow(f)).toBe('Newest');
  t.renderer.destroy();
});

test('closes on Esc, Tab and a press outside, choosing nothing', async () => {
  const log: string[] = [];
  const t = await draw(log);
  await openMenu(t);
  let f = await esc(t);
  expect(f).not.toContain('Run now');
  t.mockInput.pressEnter();
  await t.settle();
  t.mockInput.pressTab();
  f = await t.settle();
  expect(f).not.toContain('Run now');
  t.mockInput.pressEnter();
  await t.settle();
  await t.mockMouse.click(70, 20);
  f = await t.settle();
  expect(f).not.toContain('Run now');
  expect(log).toEqual([]);
  t.renderer.destroy();
});

test('copy: "Copied" in the row, onAction, then closes', async () => {
  const log: string[] = [];
  const items: MenuList = [{ id: 'id', label: 'Copy ID', copy: 'sch_123', onAction: () => log.push('copied') }];
  const t = await draw(log, items);
  await openMenu(t);
  t.mockInput.pressEnter();
  await new Promise((r) => setTimeout(r, 20));
  let f = await t.settle();
  // The test terminal may refuse OSC 52: the row then says so, and onAction runs only on a copy.
  const ok = f.includes('Copied');
  expect(ok || f.includes("Couldn't copy")).toBe(true);
  expect(log).toEqual(ok ? ['copied'] : []);
  await new Promise((r) => setTimeout(r, COPIED_MS + 50));
  f = await t.settle();
  expect(f).not.toContain('Copy ID');
  expect(f).not.toContain("Couldn't copy");
  t.renderer.destroy();
}, 5000);

test('runMenuAction runs an item outside the menu', async () => {
  const log: string[] = [];
  expect(await runMenuAction({ id: 'x', label: 'X', onAction: () => log.push('x') })).toBe(true);
  expect(log).toEqual(['x']);
});

test('flips above when the room below is short', async () => {
  const t = await draw([], undefined, 18);
  const f = await openMenu(t);
  const lines = f.split('\n');
  expect(lines.findIndex((l) => l.includes('Run now'))).toBeLessThan(lines.findIndex((l) => l.includes('[⋯]')));
  t.renderer.destroy();
});

// Bots row menu: "Open" carries the chevron-right icon, which draws as the focus mark itself; focused, the row
// read "› › Open". The focused row draws one mark; unfocused, the icon is back.
test('an icon that draws as the focus mark is left out while its row is focused', async () => {
  const items: MenuList = [
    { id: 'open', label: 'Open', icon: 'chevron-right', onAction: () => {} },
    { id: 'settings', label: 'Settings', icon: 'sliders', onAction: () => {} },
  ];
  const t = await draw([], items);
  await t.settle();
  let f = await openMenu(t);
  const open = () => f.split('\n').find((l) => l.includes('Open')) ?? '';
  expect(open()).toContain('Open');
  expect((open().match(/›/g) ?? []).length).toBe(1);
  t.mockInput.pressArrow('down');
  f = await t.settle();
  expect(f.split('\n').find((l) => l.includes('Settings'))).toContain('›');
  expect((open().match(/›/g) ?? []).length).toBe(1);
});

// Bots row menu: a disabled item's reason ("No link yet" under Copy address) sat at the label's column in the same
// grey, so it read as another disabled item. It is the item's own line (the web's description slot): further in than
// the label, in italics.
test("a disabled item's reason sits under its label, further in, so it is the item's line and not an item", async () => {
  const t = await draw([]);
  await t.settle();
  const f = await openMenu(t);
  const rows = f.split('\n');
  const label = rows.find((l) => l.includes('Pause'))!;
  const reason = rows.find((l) => l.includes('It is not running'))!;
  expect(reason.indexOf('It is not running')).toBe(label.indexOf('Pause') + 2);
  expect(rows.indexOf(reason)).toBe(rows.indexOf(label) + 1);
});

test('a short screen: the list scrolls with the focus; a row Enter chooses is always drawn', async () => {
  const log: string[] = [];
  const many: MenuList = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, label: `Item ${String.fromCharCode(65 + i)}`, onAction: () => log.push(`m${i}`) }));
  // 10 rows: the trigger on row 2, so the menu has at most 7 rows below it (frame included).
  const t = await draw(log, many, 1, 40, 10);
  let f = await openMenu(t);
  expect(focusedRow(f)).toBe('Item');
  for (let i = 1; i < 12; i++) {
    t.mockInput.pressArrow('down');
    f = await t.settle();
    // The focused row is drawn, inside the screen, whatever its place in the list.
    expect(f).toContain(`› Item ${String.fromCharCode(65 + i)}`);
  }
  t.mockInput.pressKey('HOME');
  f = await t.settle();
  expect(f).toContain('› Item A');
  t.mockInput.pressKey('END');
  f = await t.settle();
  expect(f).toContain('› Item L');
  t.mockInput.pressEnter();
  await t.settle();
  expect(log).toEqual(['m11']);
  t.renderer.destroy();
}, 30_000);
