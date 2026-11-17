// Popover, Sheet, Tooltip in the terminal (Popover.term.tsx).
//
// | # | Web behaviour (Popover.tsx, React Aria DialogTrigger + Popover) | Test |
// |---|---|---|
// | 1 | The trigger's press opens it against the trigger (bottom start by default), titled | 'opens against the trigger' |
// | 2 | Focus moves into it; Tab stays inside; the page gets no keys | 'keys stay inside' |
// | 3 | Esc or a press outside closes it; focus back on the trigger | 'closes' |
// | 4 | children(close): a choice closes it | 'children close' |
// | 5 | Widths sm 280 … wide 640 px (35 … 80 columns), never past the screen | 'widths' |
// | 6 | Flips above when the room below is short; re-placed on resize | 'flips and re-places' |
// | 7 | Controlled isOpen / onOpenChange | 'controlled' |
// | 8 | Sheet: full screen, ‹ Close and the title; Esc closes | 'sheet' |
// | 9 | Tooltip: shown on hover, hidden when the pointer leaves; isDisabled never shows | 'tooltip' |
// | 10 | Tooltip: shown on keyboard focus of the child; Esc hides it until the focus leaves and returns; keys stay the child's | 'tooltip focus' |
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot, Pressable, Text } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { Button } from '../controls/Button';
import { SearchField } from '../forms/fields';
import { Popover, Sheet, Tooltip } from './Popover';
import type { PopoverWidth } from './Popover';

async function esc(t: { mockInput: { pressEscape(): void }; settle(): Promise<string> }): Promise<string> {
  t.mockInput.pressEscape();
  await new Promise((r) => setTimeout(r, 80));
  return t.settle();
}

function Page({ log, width = 'md', top = 0 }: { log: string[]; width?: PopoverWidth; top?: number }) {
  return (
    <>
      {Array.from({ length: top }, (_, i) => <Text key={i}> </Text>)}
      <Pressable autoFocus onPress={() => log.push('page')}>{({ focused }) => <Text inverse={focused}>[Page]</Text>}</Pressable>
      <Popover trigger={<Button>Filter</Button>} label="Filter logs" width={width}>
        {(close) => (
          <>
            <Text>Show only errors</Text>
            <Button onPress={() => { log.push('errors'); close(); }}>Errors</Button>
            <Button onPress={() => log.push('all')}>All</Button>
          </>
        )}
      </Popover>
    </>
  );
}
const draw = (node: React.ReactNode, w = 80, h = 24) => drawTest(<FocusRoot><OverlayHost>{node}</OverlayHost></FocusRoot>, { width: w, height: h });
async function open(t: Awaited<ReturnType<typeof draw>>) {
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  await new Promise((r) => setTimeout(r, 10));
  return t.settle();
}

test('opens against the trigger, titled, below it at its start', async () => {
  const t = await draw(<Page log={[]} />);
  const f = await open(t);
  const lines = f.split('\n');
  const trig = lines.findIndex((l) => l.includes('[Filter]'));
  const title = lines.findIndex((l) => l.includes('Filter logs'));
  expect(title).toBe(trig + 1);
  expect(lines[title]!.indexOf('┌')).toBe(0);
  expect(f).toContain('Show only errors');
  t.renderer.destroy();
});

test('keys stay inside: first control focused, Tab cycles, the page gets nothing', async () => {
  const log: string[] = [];
  const t = await draw(<Page log={log} />);
  await open(t);
  t.mockInput.pressTab(); // Errors -> All
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(log).toEqual(['all']);
  t.mockInput.pressTab(); // All -> Errors (cycles)
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(log).toEqual(['all', 'errors']);
  t.renderer.destroy();
});

test('closes on Esc and outside; focus back on the trigger', async () => {
  const log: string[] = [];
  const t = await draw(<Page log={log} />);
  await open(t);
  let f = await esc(t);
  expect(f).not.toContain('Show only errors');
  t.mockInput.pressEnter(); // the trigger still has the focus
  f = await t.settle();
  expect(f).toContain('Show only errors');
  await t.mockMouse.click(70, 20);
  f = await t.settle();
  expect(f).not.toContain('Show only errors');
  expect(log).toEqual([]);
  t.renderer.destroy();
});

test('children close: a choice closes it', async () => {
  const log: string[] = [];
  const t = await draw(<Page log={log} />);
  await open(t);
  t.mockInput.pressEnter();
  const f = await t.settle();
  expect(log).toEqual(['errors']);
  expect(f).not.toContain('Show only errors');
  t.renderer.destroy();
});

test('widths: 35 to 80 columns, never past the screen', async () => {
  for (const [w, cols, screen] of [['sm', 35, 80], ['wide', 80, 120], ['wide', 60, 60]] as const) {
    const t = await draw(<Page log={[]} width={w} />, screen, 24);
    const f = await open(t);
    const row = f.split('\n').find((l) => l.includes('┌'))!;
    expect(row.lastIndexOf('┐') - row.indexOf('┌') + 1).toBe(cols);
    t.renderer.destroy();
  }
});

test('flips above when the room below is short; re-placed on resize', async () => {
  const t = await draw(<Page log={[]} top={19} />);
  let f = await open(t);
  let lines = f.split('\n');
  expect(lines.findIndex((l) => l.includes('Show only errors'))).toBeLessThan(lines.findIndex((l) => l.includes('[Filter]')));
  t.resize(80, 40);
  await new Promise((r) => setTimeout(r, 20));
  f = await t.settle();
  lines = f.split('\n');
  expect(lines.findIndex((l) => l.includes('Show only errors'))).toBeGreaterThan(lines.findIndex((l) => l.includes('[Filter]')));
  t.renderer.destroy();
});

test('controlled isOpen / onOpenChange', async () => {
  const seen: boolean[] = [];
  function C() {
    const [o, setO] = useState(true);
    return <Popover trigger={<Button>Open</Button>} label="Ctl" isOpen={o} onOpenChange={(v) => { seen.push(v); setO(v); }}>Inside</Popover>;
  }
  const t = await draw(<C />);
  let f = await t.settle();
  expect(f).toContain('Inside');
  f = await esc(t);
  expect(seen).toEqual([false]);
  expect(f).not.toContain('Inside');
  t.renderer.destroy();
});

test('sheet: full screen, ‹ Close and title; Esc closes', async () => {
  const seen: boolean[] = [];
  function S() {
    const [o, setO] = useState(true);
    return <Sheet isOpen={o} onOpenChange={(v) => { seen.push(v); setO(v); }} title="Choose a computer" footer={<Button>Done</Button>}>Body</Sheet>;
  }
  const t = await draw(<><Text>Page text</Text><S /></>);
  let f = await t.settle();
  expect(f.split('\n')[0]).toMatch(/^ ‹ Close Choose a computer/);
  expect(f).toContain('[Done]');
  f = await esc(t);
  expect(seen).toEqual([false]);
  t.renderer.destroy();
});

test('tooltip: hover shows, leaving hides; disabled never shows', async () => {
  const t = await draw(<><Text> </Text><Tooltip content="Refresh the list" shortcut="R"><Button>↻</Button></Tooltip></>);
  let f = await t.settle();
  expect(f).not.toContain('Refresh the list');
  await t.mockMouse.moveTo(1, 1);
  f = await t.settle();
  expect(f).toMatch(/Refresh the list\s+R/);
  await t.mockMouse.moveTo(60, 20);
  f = await t.settle();
  expect(f).not.toContain('Refresh the list');
  t.renderer.destroy();
  const t2 = await draw(<><Text> </Text><Tooltip content="Never" isDisabled><Button>x</Button></Tooltip></>);
  await t2.mockMouse.moveTo(1, 1);
  expect(await t2.settle()).not.toContain('Never');
  t2.renderer.destroy();
});

test('tooltip focus: focus shows it, Esc hides it until the focus comes back, Enter is the child\'s', async () => {
  const log: string[] = [];
  const t = await draw(<>
    <Pressable autoFocus onPress={() => log.push('page')}>{({ focused }) => <Text inverse={focused}>[Page]</Text>}</Pressable>
    <Text> </Text>
    <Tooltip content="Refresh the list"><Button onPress={() => log.push('refresh')}>Refresh</Button></Tooltip>
  </>);
  let f = await t.settle();
  expect(f).not.toContain('Refresh the list');
  t.mockInput.pressTab();
  await new Promise((r) => setTimeout(r, 15));
  f = await t.settle();
  expect(f).toContain('Refresh the list');
  t.mockInput.pressEnter();
  await t.settle();
  expect(log).toEqual(['refresh']);
  f = await esc(t);
  expect(f).not.toContain('Refresh the list');
  t.mockInput.pressTab({ shift: true });
  await new Promise((r) => setTimeout(r, 15));
  f = await t.settle();
  expect(f).not.toContain('Refresh the list');
  t.mockInput.pressTab();
  await new Promise((r) => setTimeout(r, 15));
  f = await t.settle();
  expect(f).toContain('Refresh the list');
  t.renderer.destroy();
});

// computers "atlas is in 30 realms": a popover taller than the room the screen leaves. The web panel scrolls
// (`max-height` + `overflow: auto`). Here the content kept its own height inside the clipped panel: the rows past the
// panel's edge were cut off and no key brought them into view.
test('a popover taller than its room scrolls: nothing is laid past the panel, Tab reaches the last control', async () => {
  const log: string[] = [];
  const t = await draw(
    <>
      <Pressable autoFocus onPress={() => log.push('page')}>{({ focused }) => <Text inverse={focused}>[Page]</Text>}</Pressable>
      <Popover trigger={<Button>Realms</Button>} label="All realms" width="picker">
        {Array.from({ length: 30 }, (_, i) => <Button key={i} onPress={() => log.push(`r${i + 1}`)}>{`Realm ${i + 1}`}</Button>)}
      </Popover>
    </>, 80, 24);
  let f = await open(t);
  const { layoutFaults } = await import('../../term/prim/layoutcheck');
  expect(layoutFaults((t.renderer as unknown as { root: never }).root, { cols: 80, rows: 24 }).filter((x) => x.kind === 'cut'), f).toEqual([]);
  expect(f).toContain('Realm 1');
  expect(f).not.toContain('Realm 30');
  // The first control has the focus, as in a short popover.
  t.mockInput.pressEnter();
  await t.settle();
  expect(log).toEqual(['r1']);
  for (let i = 0; i < 29; i++) { t.mockInput.pressTab(); await t.settle(); }
  f = await t.settle();
  expect(f, f).toContain('Realm 30');
  t.mockInput.pressEnter();
  await t.settle();
  expect(log).toEqual(['r1', 'r30']);
  t.renderer.destroy();
});

// The same list on the computers page: its search field is the first control and takes the focus when the list opens,
// as before the body scrolled. A scrolling body is laid out in two steps; the layer's first focus was given before the
// first and dropped by it (an auto focus under a box with no size yet), so the list opened with the focus nowhere.
function Realms() {
  const [q, setQ] = useState('');
  return (
    <div>
      <SearchField label="Search realms" placeholder="Search realms" value={q} onChange={setQ} />
      <ul>{Array.from({ length: 30 }, (_, i) => <li key={i}><span>{`Realm ${i + 1}`}</span><Button onPress={() => {}}>{`copy ${i + 1}`}</Button></li>)}</ul>
    </div>
  );
}
for (const how of ['a key', 'a click'] as const) {
  test(`a scrolling popover opened by ${how}: its first control (a search field) has the focus`, async () => {
    const t = await draw(
      <>
        <Pressable autoFocus onPress={() => {}}>{({ focused }) => <Text inverse={focused}>[Page]</Text>}</Pressable>
        <Popover trigger={<Button>Realms</Button>} label="All realms" width="picker">{() => <Realms />}</Popover>
      </>, 80, 24);
    let f = await t.settle();
    if (how === 'a key') f = await open(t);
    else {
      const y = f.split('\n').findIndex((l) => l.includes('[Realms]'));
      await t.mockMouse.click(f.split('\n')[y]!.indexOf('[Realms]') + 2, y);
      // No frame before the layer's first-focus timer: the focus is given to a field that has no size yet.
      await new Promise((r) => setTimeout(r, 30));
      f = await t.settle();
    }
    expect(f).toContain('Search realms');
    await t.mockInput.typeText('07');
    f = await t.settle();
    expect(f.split('\n').find((l) => l.includes('/ 07')), f).toBeDefined();
    t.renderer.destroy();
  });
}
