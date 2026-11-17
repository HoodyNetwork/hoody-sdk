// shot-replay.ts: a shot's web action replayed on the terminal semantics tree (goldens.ts).
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | A replayed click changes the frame (the page AFTER the action) | 'click changes the frame' |
// | 2 | `A >> B`, `nth=`, `text=`, role name forms resolve as Playwright's do | 'selectors' |
// | 3 | Keys map to terminal keys; fill replaces the value; its click settles before the keys | 'keys and fill', 'fill: the click settles' |
// | 4 | A target not on screen, a disabled one, a waitFor never shown: skipped with a reason, nothing pressed | 'unresolvable' |
// | 4b | A waitFor whose text an answer the settle does not see draws later (WebCrypto): waited for, in real time | 'waitFor waits' |
// | 4c | Under the frozen fixture clock (goldens) a waitFor never shown still ends inside its budget, with the reason | 'frozen clock' |
// | 5 | No terminal mapping (css=, xpath=, hover, Meta): skipped before anything runs | 'static skips' |
// | 6 | A target drawn below the screen is wheeled into view, then clicked; with no wheel it is skipped | 'scroll into view' |
// | 6f | A target far below (100 rows) that one pass over the points leaves off screen gets another pass while a pass still moves it, also when only one point scrolls; one that keeps moving and never arrives ends at 400 notches in all | 'far below', 'never arrives' |
// | 6b | A target in the screen's box but cut off by its scroll view (a bar draws that cell) is wheeled into view too, never clicked through the bar | 'cut off above a bar' |
// | 6d | A target taller than a row is on screen only when each of its rows is drawn by it | 'taller than one row' |
// | 6c | A wheel with no hit test is refused (a caller without one stopped short under the bar and clicked it) | 'a wheel with no hit test' |
// | 6e | A wide one-row target whose middle cell a foot's control draws (that control fits inside the target's box) is wheeled into view, never clicked through the control | 'a wide row under a foot' |
// | 6h | A target scrolled under another control's piece that has exactly its box (a clipped "+2" under a header button's " v" run) is wheeled into view and clicked, never clicked through that control | 'clipped under a piece with its box' |
// | 6g | An empty field that draws a placeholder (a one-cell input, the placeholder from that cell on) is on screen: clicked and typed into, filled too; under a bar of the same box it is wheeled into view first, the bar never pressed | 'an empty field with a placeholder', 'an empty field under a bar' |
// | 8 | A click on a table row that does not hold the cursor opens it (clicked twice: the web opens on one click); the cursor row is clicked once | 'table row' |
// | 8b | A click that picks a row, a row's own control and a header's sort button are clicked once | 'table row: once' |
// | 7 | A skip names the chain part that found nothing, and what matched before it | 'unresolvable' |
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { DataTable, type DataTableProps } from '../../src/kit/data/DataTable.term';
import { drawTest, type TestTerm } from '../../src/term/prim/testing';
import { Box, FocusRoot, Pressable, Scroll, Text, TextInput } from '../../src/term/prim';
import { FieldInput } from '../../src/term/prim/FieldInput';
import { TextField } from '../../src/kit/forms/fields.term';
import { semanticsOf } from '../../src/term/prim/semantics';
import { freezeClock, thawClock } from './clock';
import { renderableOf, semanticsOf as semOf } from '../../src/term/prim/semantics';
import { parseSelector, rendererHitAt, rendererOwns, replay, resolveAll, staticSkip, termKey, type Node, type ReplaySession } from './shot-replay';

function session(t: TestTerm): ReplaySession {
  const settle = async () => { for (let i = 0; i < 4; i++) await t.renderOnce(); return t.captureCharFrame(); };
  return {
    keys: {
      async press(name, mods) {
        const k = t.mockInput;
        if (name === 'tab') k.pressTab(mods); else if (name === 'enter') k.pressEnter(mods); else if (name === 'escape') k.pressEscape(mods);
        else if (name === 'up' || name === 'down' || name === 'left' || name === 'right') k.pressArrow(name, mods);
        else k.pressKey(name, mods);
        await settle();
      },
      async type(text) { await t.mockInput.typeText(text); await settle(); },
    },
    async click(x, y) { await t.mockMouse.click(x, y); await settle(); },
    settle,
    releaseHeld: settle,
  };
}
const env = (t: TestTerm, cols = 50, rows = 12) => ({ tree: () => semanticsOf({ root: t.renderer.root, stdin: t.renderer.stdin as never }) as unknown as Node[], cols, rows });
/** The wheel goldens.ts sends: one SGR wheel notch into the renderer's input, then settle. */
const withWheel = (t: TestTerm, cols = 50, rows = 12) => ({
  ...env(t, cols, rows),
  async wheel(x: number, y: number, dir: 'up' | 'down') {
    (t.renderer.stdin as unknown as { emit(e: 'data', b: Buffer): unknown }).emit('data', Buffer.from(`\x1b[<${dir === 'up' ? 64 : 65};${x + 1};${y + 1}M`));
    for (let i = 0; i < 4; i++) await t.renderOnce();
  },
});

function Btn({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} sem={{ role: 'button', name: label }}><Text>{`[${label}]`}</Text></Pressable>;
}

function Menu({ log }: { log: string[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('old');
  return (
    <Box>
      <Btn label="Row actions" onPress={() => setOpen((o) => !o)} />
      <Btn label="Delete" disabled onPress={() => log.push('delete')} />
      {open ? (
        <Box sem={{ role: 'dialog', name: 'Actions' }}>
          <Btn label="Rename" onPress={() => log.push('rename')} />
          <Btn label="Rename all" onPress={() => log.push('rename all')} />
        </Box>
      ) : <Text>closed</Text>}
      <TextInput value={name} onChange={setName} sem={{ role: 'textbox', name: 'Name' }} />
      <Text>{`name=${name}`}</Text>
    </Box>
  );
}
const draw = async (log: string[] = []) => { const t = await drawTest(<FocusRoot><Menu log={log} /></FocusRoot>, { width: 50, height: 12 }); await t.settle(); return t; };

test('click changes the frame', async () => {
  const t = await draw();
  const before = t.captureCharFrame();
  expect(before).toContain('closed');
  expect(await replay(session(t), [{ click: 'Row actions' }], env(t))).toBeNull();
  const after = t.captureCharFrame();
  expect(after).not.toBe(before);
  expect(after).toContain('Rename all');
  t.renderer.destroy();
});

test('selectors: chain, nth, text, name forms', async () => {
  const log: string[] = [];
  const t = await draw(log);
  await replay(session(t), [{ click: 'role=button[name="row actions"]' }], env(t));
  const tree = env(t).tree();
  const res = (sel: string) => resolveAll(tree, parseSelector(sel, 'named') as never, 50, 12).map((n) => n.name);
  expect(res('role=dialog >> role=button[name="Rename"]')).toEqual(['Rename', 'Rename all']);
  expect(res('role=dialog >> role=button[name="Rename"s]')).toEqual(['Rename']);
  expect(res('role=dialog >> role=button[name=/all$/]')).toEqual(['Rename all']);
  expect(res('role=dialog >> role=button >> nth=-1')).toEqual(['Rename all']);
  expect(res('role=button[disabled]')).toEqual(['Delete']);
  expect(resolveAll(tree, parseSelector('text=closed', 'named') as never, 50, 12)).toEqual([]);
  // The first match in document order is the one clicked (shots.spec `.first()`).
  expect(await replay(session(t), [{ click: 'role=dialog >> role=button[name="Rename"]' }], env(t))).toBeNull();
  expect(log).toEqual(['rename']);
  t.renderer.destroy();
});

test('keys and fill', async () => {
  expect(termKey('ArrowDown')).toEqual({ name: 'down' });
  expect(termKey('Shift+Tab')).toEqual({ name: 'tab', mods: { shift: true } });
  expect(termKey('Control+k')).toEqual({ name: 'k', mods: { ctrl: true } });
  expect(termKey('j')).toEqual({ name: 'j' });
  const t = await draw();
  expect(await replay(session(t), [{ fill: 'Name', text: 'fresh' }], env(t))).toBeNull();
  expect(t.captureCharFrame()).toContain('name=fresh');
  t.renderer.destroy();
});

test('fill: the click settles before any key (its focus move lands first; else the keys go to the field focused before)', async () => {
  const t = await draw();
  const real = session(t);
  const log: string[] = [];
  const s: ReplaySession = {
    keys: { press: async (n, m) => { log.push('key'); await real.keys.press(n, m); }, type: async (x) => { log.push('key'); await real.keys.type(x); } },
    click: async (x, y) => { log.push('click'); await t.mockMouse.click(x, y); },
    settle: async () => { log.push('settle'); return real.settle(); },
    releaseHeld: real.releaseHeld,
  };
  expect(await replay(s, [{ fill: 'Name', text: 'fresh' }], env(t))).toBeNull();
  const click = log.indexOf('click');
  expect(log.slice(click + 1, log.indexOf('key', click))).toContain('settle');
  t.renderer.destroy();
});

test('unresolvable: skipped with a reason, nothing pressed', async () => {
  const log: string[] = [];
  const t = await draw(log);
  expect(await replay(session(t), [{ click: 'role=option[name=/GPT-5/]' }], env(t))).toMatch(/step 1 click .*no node on screen .*nothing in the terminal matches it/);
  // A chain names the part the terminal lacks (a row with no "Row actions" button in it, here a dialog that is closed).
  expect(await replay(session(t), [{ click: 'role=button[name="Row actions"] >> role=button[name="Rename"]' }], env(t)))
    .toMatch(/role=button\[name="Row actions"\] matches 1, nothing under it matches role=button\[name="Rename"\]/);
  expect(await replay(session(t), [{ click: 'Delete' }], env(t))).toMatch(/disabled/);
  expect(await replay(session(t), [{ waitFor: 'Never here' }], { ...env(t), waitForMs: 200 })).toMatch(/never shown/);
  // A later step that cannot resolve stops the replay: the steps before it ran, the shot is still reported skipped.
  expect(await replay(session(t), [{ click: 'Row actions' }, { click: 'Nope' }], env(t))).toMatch(/step 2/);
  expect(log).toEqual([]);
  t.renderer.destroy();
});

test('static skips: no terminal mapping, nothing runs', () => {
  expect(staticSkip([{ click: 'css=[role=dialog] button:has-text("Run")' }])).toMatch(/css= engine/);
  expect(staticSkip([{ click: 'xpath=//button' }])).toMatch(/xpath= engine/);
  expect(staticSkip([{ click: 'role=switch[name="Perf"] >> xpath=ancestor::label[1]' }])).toMatch(/xpath/);
  expect(staticSkip([{ hover: 'Help' }])).toMatch(/hover/);
  expect(staticSkip([{ press: 'Meta+K' }])).toMatch(/Meta/);
  expect(staticSkip([{ click: 'role=button[name="Save"]' }, { press: 'Enter' }, { waitFor: 'text=Saved' }])).toBeNull();
});

function Long({ log }: { log: string[] }) {
  return (
    <Box height={12}>
      <Text>Head</Text>
      <Scroll grow={1} shrink={1}>
        {Array.from({ length: 30 }, (_, i) => <Text key={i}>{`row ${i + 1}`}</Text>)}
        <Btn label="Far" onPress={() => log.push('far')} />
      </Scroll>
    </Box>
  );
}

test('scroll into view: wheeled until on screen, then clicked; no wheel = skipped', async () => {
  const log: string[] = [];
  const t = await drawTest(<FocusRoot><Long log={log} /></FocusRoot>, { width: 50, height: 12 });
  await t.settle();
  expect(t.captureCharFrame()).not.toContain('[Far]');
  expect(await replay(session(t), [{ click: 'Far' }], env(t))).toMatch(/drawn \(1\) but not on screen/);
  expect(log).toEqual([]);
  expect(await replay(session(t), [{ click: 'Far' }], { ...withWheel(t), hitAt: rendererHitAt(t.renderer)! })).toBeNull();
  expect(t.captureCharFrame()).toContain('[Far]');
  expect(log).toEqual(['far']);
  t.renderer.destroy();
});

// Computers Access at 80x24: the button is 88 rows down the Overview tab and the page moves one row per notch, so one
// pass (60 notches at the first point) does not reach it. Only the middle point is over the scroll here (the lower
// point is on the foot, the upper on the head).
function FarBelow({ log, rows }: { log: string[]; rows: number }) {
  return (
    <Box height={12}>
      <Box height={3} shrink={0}><Pressable onPress={() => log.push('head')} sem={{ role: 'button', name: 'Head' }}><Text>{'Head 1\nHead 2\nHead 3'}</Text></Pressable></Box>
      <Scroll grow={1} shrink={1}>
        {Array.from({ length: rows }, (_, i) => <Text key={i}>{`row ${i + 1}`}</Text>)}
        <Btn label="Far" onPress={() => log.push('far')} />
        <Text>tail</Text>
      </Scroll>
      <Box height={3} shrink={0}><Pressable onPress={() => log.push('foot')} sem={{ role: 'button', name: 'Foot' }}><Text>{'Foot 1\nFoot 2\nFoot 3'}</Text></Pressable></Box>
    </Box>
  );
}

test('far below: a pass that moved it is followed by another, then clicked', async () => {
  const log: string[] = [];
  const t = await drawTest(<FocusRoot><FarBelow log={log} rows={100} /></FocusRoot>, { width: 50, height: 12 });
  const first = await t.settle();
  expect(first.split('\n').slice(0, 3).map((l) => l.trim())).toEqual(['Head 1', 'Head 2', 'Head 3']);
  expect(first.split('\n').slice(9, 12).map((l) => l.trim())).toEqual(['Foot 1', 'Foot 2', 'Foot 3']);
  const e = withWheel(t);
  const at: number[] = [];
  expect(await replay(session(t), [{ click: 'Far' }], { ...e, wheel: async (x, y, dir) => { at.push(y); await e.wheel(x, y, dir); }, hitAt: rendererHitAt(t.renderer)! })).toBeNull();
  expect(t.captureCharFrame()).toContain('[Far]');
  expect(log).toEqual(['far']);
  // The first pass ends its first point after 60 notches as before and goes on to the foot and the head; the second
  // pass comes back to the middle point, where the rest of the way is made.
  expect(at.slice(0, 60)).toEqual(Array.from({ length: 60 }, () => 6));
  expect(at[60]).toBe(9);
  expect(at).toContain(2);
  expect(at.lastIndexOf(6)).toBeGreaterThan(at.indexOf(2));
  expect(at.filter((y) => y === 6).length).toBeGreaterThan(60);
  t.renderer.destroy();
});

test('never arrives: a target that moves at every notch and is never on screen ends at 400 notches, skipped', async () => {
  // A tree whose target is always below the screen and one row nearer at each notch asked, for ever.
  let y = 100_000;
  const node = (): Node => ({ role: 'button', name: 'Far', box: [2, y, 5, 1], states: {}, children: [] } as unknown as Node);
  let notches = 0;
  const t = await drawTest(<FocusRoot><Text>empty</Text></FocusRoot>, { width: 50, height: 12 });
  const why = await replay(session(t), [{ click: 'Far' }], { tree: () => [node()], cols: 50, rows: 12, wheel: async () => { notches++; y--; }, hitAt: () => null });
  expect(why).toMatch(/drawn \(1\) but not on screen/);
  expect(notches).toBe(400);
  t.renderer.destroy();
});

// The AI Accounts table at 80x24: the OpenAI row sat on the last row, which the key bar draws; the
// click went to the bar and the menu never opened ("no node on screen" at the next step).
function UnderBar({ log }: { log: string[] }) {
  return (
    <Box height={12}>
      <Text>Head</Text>
      <Scroll grow={1} shrink={1}>
        {Array.from({ length: 10 }, (_, i) => <Text key={i}>{`row ${i + 1}`}</Text>)}
        <Btn label="Far" onPress={() => log.push('far')} />
        <Text>tail</Text>
      </Scroll>
      <Pressable onPress={() => log.push('bar')} sem={{ role: 'button', name: 'Bar' }}><Text>Tab move · q quit</Text></Pressable>
    </Box>
  );
}

// Billing usage-forbidden at 60x20: a two-row target whose first row lay on the key bar's row; the bar's box fits
// inside the target's, so the centre cell alone counted it as on screen and the click went to the bar.
function TallUnderBar({ log }: { log: string[] }) {
  return (
    <Box height={12}>
      <Text>Head</Text>
      <Scroll grow={1} shrink={1}>
        {Array.from({ length: 10 }, (_, i) => <Text key={i}>{`row ${i + 1}`}</Text>)}
        <Pressable onPress={() => log.push('far')} sem={{ role: 'button', name: 'Far' }}><Text>{'[Far,\nsecond line]'}</Text></Pressable>
        <Text>tail</Text>
      </Scroll>
      <Pressable onPress={() => log.push('bar')} sem={{ role: 'button', name: 'Bar' }}><Text>Tab move · q quit</Text></Pressable>
    </Box>
  );
}

test('a target taller than one row is on screen only when every row is drawn by it: never clicked through the bar', async () => {
  const log: string[] = [];
  const t = await drawTest(<FocusRoot><TallUnderBar log={log} /></FocusRoot>, { width: 50, height: 12 });
  await t.settle();
  expect(await replay(session(t), [{ click: 'Far' }], { ...withWheel(t), hitAt: rendererHitAt(t.renderer)! })).toBeNull();
  expect(log).toEqual(['far']);
  const f = t.captureCharFrame();
  expect(f).toContain('[Far,');
  expect(f).toContain('second line]');
  t.renderer.destroy();
});

test('a wheel with no hit test is refused: never stops short under a bar and clicks it', async () => {
  const log: string[] = [];
  const t = await drawTest(<FocusRoot><UnderBar log={log} /></FocusRoot>, { width: 50, height: 12 });
  await t.settle();
  const why = await replay(session(t), [{ click: 'Far' }], withWheel(t));
  expect(log).not.toContain('bar');
  expect(why).toMatch(/hit test/);
  t.renderer.destroy();
});

test('cut off above a bar: wheeled into view, then clicked; the bar is never pressed', async () => {
  const log: string[] = [];
  const t = await drawTest(<FocusRoot><UnderBar log={log} /></FocusRoot>, { width: 50, height: 12 });
  await t.settle();
  expect(t.captureCharFrame()).not.toContain('[Far]');
  const w = withWheel(t);
  const hitAt = rendererHitAt(t.renderer);
  expect(hitAt).toBeDefined();
  expect(await replay(session(t), [{ click: 'Far' }], { ...w, hitAt: hitAt! })).toBeNull();
  expect(t.captureCharFrame()).toContain('[Far]');
  expect(log).toEqual(['far']);
  t.renderer.destroy();
});

// The vms create drawer at 80x24: the radio "An empty disk" (32 cells) lay on the foot's row; the foot's [Cancel]
// drew its middle cell and its box fits inside the radio's, so the radio counted as on screen and Cancel was pressed.
function WideUnderFoot({ log }: { log: string[] }) {
  return (
    <Box height={12}>
      <Text>Head</Text>
      <Scroll grow={1} shrink={1}>
        {Array.from({ length: 10 }, (_, i) => <Text key={i}>{`row ${i + 1}`}</Text>)}
        <Pressable onPress={() => log.push('far')} sem={{ role: 'radio', name: 'Far option' }}><Text>{'( ) Far option, a row wider than the foot'}</Text></Pressable>
        <Text>tail</Text>
      </Scroll>
      <Box dir="row">
        <Text>{' '.repeat(20)}</Text>
        <Btn label="Cancel" onPress={() => log.push('cancel')} />
      </Box>
    </Box>
  );
}

test('a wide row under a foot: wheeled into view, then clicked; the foot control inside its box is never pressed', async () => {
  const log: string[] = [];
  const t = await drawTest(<FocusRoot><WideUnderFoot log={log} /></FocusRoot>, { width: 50, height: 12 });
  await t.settle();
  const tree = env(t).tree();
  const flat = (ns: readonly Node[]): Node[] => ns.flatMap((n) => [n, ...flat(n.children)]);
  const far = flat(tree).find((n) => n.role === 'radio')!;
  const cancel = flat(tree).find((n) => n.role === 'button' && n.name === 'Cancel')!;
  // The case itself: the radio sits on the foot's row and Cancel's box lies inside the radio's, under its middle cell.
  expect(far.box[1]).toBe(cancel.box[1]);
  expect(cancel.box[0]).toBeGreaterThanOrEqual(far.box[0]);
  expect(cancel.box[0] + cancel.box[2]).toBeLessThanOrEqual(far.box[0] + far.box[2]);
  const mid = far.box[0] + Math.floor((far.box[2] - 1) / 2);
  expect(mid >= cancel.box[0] && mid < cancel.box[0] + cancel.box[2]).toBe(true);
  expect(await replay(session(t), [{ click: 'role=radio[name="Far option"]' }], { ...withWheel(t), hitAt: rendererHitAt(t.renderer)! })).toBeNull();
  expect(log).toEqual(['far']);
  t.renderer.destroy();
});

// Computers detail-run-exit-error: the Run tab's Command field is empty with a placeholder. The terminal draws that as
// a one-cell input and, from the same cell on, the placeholder (FieldInput LineField), so the cell's box (14x1) never
// fitted inside the field's own (1x1): the click was skipped as "drawn (1) but not on screen" at both sizes, as were the
// fills of the Bots model search and the Skill Hub search.
function Cmd({ log }: { log: string[] }) {
  const [v, setV] = useState('');
  return (
    <Box>
      <Btn label="First" onPress={() => log.push('first')} />
      <TextField aria-label="Command" placeholder="Type a command" value={v} onChange={setV} onKeyDown={(e) => { if (e.key === 'Enter') log.push(`run ${v}`); }} suffix={<Btn label="History" onPress={() => log.push('history')} />} />
      <Text>{`cmd=${v}`}</Text>
    </Box>
  );
}

test('an empty field with a placeholder is on screen: clicked and typed into, filled too', async () => {
  const log: string[] = [];
  const t = await drawTest(<FocusRoot><Cmd log={log} /></FocusRoot>, { width: 50, height: 12 });
  await t.settle();
  expect(t.captureCharFrame()).toContain('Type a command');
  const hitAt = rendererHitAt(t.renderer);
  expect(hitAt).toBeDefined();
  const e = { ...withWheel(t), hitAt: hitAt! };
  // The field's own box is one cell; what the screen draws at that cell is wider (the placeholder's row).
  const field = resolveAll(e.tree(), parseSelector('role=textbox[name="Command"]', 'named') as never, 50, 12, false)[0]!;
  expect(field.box[2]).toBeLessThanOrEqual(1);
  expect(hitAt!(field.box[0], field.box[1])![2]).toBeGreaterThan(1);
  expect(await replay(session(t), [{ click: 'role=textbox[name="Command"]' }, { press: 'l' }, { press: 's' }, { press: 'Enter' }], e)).toBeNull();
  expect(t.captureCharFrame()).toContain('cmd=ls');
  expect(log).toEqual(['run ls']);
  t.renderer.destroy();
  // A fill finds it the same way.
  const t2 = await drawTest(<FocusRoot><Cmd log={[]} /></FocusRoot>, { width: 50, height: 12 });
  await t2.settle();
  expect(await replay(session(t2), [{ fill: 'role=textbox[name="Command"]', text: 'pwd' }], { ...withWheel(t2), hitAt: rendererHitAt(t2.renderer)! })).toBeNull();
  expect(t2.captureCharFrame()).toContain('cmd=pwd');
  t2.renderer.destroy();
});

// The placeholder's row starts at the field's cell; so does a bar that covers the field's row from the same column.
// The bar is another control with that box: the field is not on screen under it, and is wheeled into view first.
function FieldUnderBar({ log }: { log: string[] }) {
  const [v, setV] = useState('');
  return (
    <Box height={12}>
      <Text>{`Head cmd=${v}`}</Text>
      <Scroll grow={1} shrink={1}>
        {Array.from({ length: 10 }, (_, i) => <Text key={i}>{`row ${i + 1}`}</Text>)}
        <FieldInput value={v} onChange={setV} placeholder="Type a command" sem={{ name: 'Command' }} />
        <Text>tail</Text>
      </Scroll>
      <Pressable onPress={() => log.push('bar')} sem={{ role: 'button', name: 'Bar' }}><Text>Tab move · q quit</Text></Pressable>
    </Box>
  );
}

test('an empty field under a bar: wheeled into view, then typed into; the bar is never pressed', async () => {
  const log: string[] = [];
  const t = await drawTest(<FocusRoot><FieldUnderBar log={log} /></FocusRoot>, { width: 50, height: 12 });
  await t.settle();
  expect(t.captureCharFrame()).not.toContain('Type a command');
  const hitAt = rendererHitAt(t.renderer);
  expect(await replay(session(t), [{ click: 'role=textbox[name="Command"]' }, { press: 'l' }, { press: 's' }], { ...withWheel(t), hitAt: hitAt! })).toBeNull();
  expect(t.captureCharFrame()).toContain('cmd=ls');
  expect(log).toEqual([]);
  t.renderer.destroy();
});

test('waitFor waits for text a late answer draws (an answer the settle does not see, as WebCrypto)', async () => {
  function Late() {
    const [on, setOn] = useState(false);
    useState(() => { setTimeout(() => setOn(true), 400); return 0; });
    return <Box>{on ? <Text>Opened now</Text> : <Text>Opening</Text>}</Box>;
  }
  const t = await drawTest(<FocusRoot><Late /></FocusRoot>, { width: 40, height: 6 });
  expect(await replay(session(t), [{ waitFor: 'Opened now' }], env(t, 40, 6))).toBeNull();
  expect(t.captureCharFrame()).toContain('Opened now');
  t.renderer.destroy();
});

test('frozen clock: a waitFor never shown ends inside its budget with the reason (goldens freeze Date; the wait is real time)', async () => {
  const t = await drawTest(<FocusRoot><Box><Text>Opening</Text></Box></FocusRoot>, { width: 40, height: 6 });
  freezeClock();
  try {
    const t0 = performance.now();
    const out = await Promise.race([
      replay(session(t), [{ waitFor: 'Never here' }], { ...env(t, 40, 6), waitForMs: 300 }),
      new Promise<string>((r) => setTimeout(() => r('STILL WAITING'), 4000)),
    ]);
    expect(out).toMatch(/waitFor "Never here": never shown in the terminal/);
    expect(performance.now() - t0).toBeLessThan(4000);
  } finally {
    thawClock();
    t.renderer.destroy();
  }
}, 15_000);

interface Thing { id: string; name: string; size: number }
const things: Thing[] = Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, name: `row-${i}`, size: (i * 7) % 5 }));
const thingCols: ColumnDef<Thing, unknown>[] = [
  { id: 'name', header: 'Name', accessorKey: 'name', meta: { pinned: true } },
  { id: 'size', header: 'Size', accessorKey: 'size', meta: { width: '80px' } },
];
/** The kit table in a memory router (it keeps sort and page in the URL). */
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}
const drawTable = (p: Partial<DataTableProps<Thing>>) =>
  drawTest(<FocusRoot><Routed><DataTable label="Things" data={things} columns={thingCols} getRowId={(r) => r.id} {...p} /></Routed></FocusRoot>, { width: 70, height: 14 });
const tableEnv = (t: TestTerm) => ({ ...env(t, 70, 14), hitAt: rendererHitAt(t.renderer) });

test('table row: a web click on a row opens it in the terminal (a row without the cursor is clicked twice, the cursor row once)', async () => {
  const opened: string[] = [];
  const t = await drawTable({ onRowAction: (r) => opened.push(r.id) });
  await t.settle();
  // row-3 does not hold the cursor: one web click opens it.
  expect(await replay(session(t), [{ click: 'text=row-3' }], tableEnv(t))).toBeNull();
  expect(opened).toEqual(['r3']);
  expect(t.captureCharFrame()).toMatch(/▌ row-3/);
  // It holds the cursor now: one click opens it again, and only once.
  expect(await replay(session(t), [{ click: 'text=row-3' }], tableEnv(t))).toBeNull();
  expect(opened).toEqual(['r3', 'r3']);
  t.renderer.destroy();
});

test('table row: once for a click that picks the row, for a control of the row and for a header', async () => {
  // A table whose rows are picked: the click picks, a second one would take the pick back.
  let picked: string[] = [];
  function Pick() {
    const [sel, setSel] = useState<Set<string>>(new Set());
    picked = [...sel];
    return <DataTable label="Things" data={things} columns={thingCols} getRowId={(r) => r.id} selectable selectedIds={sel} onSelectionChange={setSel} />;
  }
  let t = await drawTest(<FocusRoot><Routed><Pick /></Routed></FocusRoot>, { width: 70, height: 14 });
  await t.settle();
  expect(await replay(session(t), [{ click: 'text=row-2' }], tableEnv(t))).toBeNull();
  expect(picked).toEqual(['r2']);
  t.renderer.destroy();

  // A header's sort button: one press sorts ascending (two would sort descending). The row menu: opened, the row is not.
  const opened: string[] = [];
  t = await drawTable({ sortParam: false, onRowAction: (r) => opened.push(r.id), actions: () => [{ id: 'x', label: 'Remove it', onAction: () => {} }] });
  await t.settle();
  expect(await replay(session(t), [{ click: 'text=Size' }], tableEnv(t))).toBeNull();
  expect(t.captureCharFrame()).toMatch(/Size ↑/);
  expect(await replay(session(t), [{ click: 'role=button[name="Row actions"] >> nth=2' }], tableEnv(t))).toBeNull();
  expect(t.captureCharFrame()).toContain('Remove it');
  expect(opened).toEqual([]);
  t.renderer.destroy();
});

// Bots bot-hosting at 80x24: the "+2" of the meta line, scrolled up under the shell's head, lay under the realm button's
// " ▾" run, a text renderable with exactly the "+2"'s box. The boxes alone took it as on screen and the click opened the
// realm menu; the hit test now asks whose renderable that cell is.
function ClippedUnderHead({ log }: { log: string[] }) {
  return (
    <Box height={12}>
      <Box dir="row" height={1} shrink={0}>
        <Text>{'0123456789'}</Text>
        <Pressable onPress={() => log.push('realm')} sem={{ role: 'button' }}>
          <Box dir="row"><Text>Realm</Text><Text>{' v'}</Text></Box>
        </Pressable>
      </Box>
      <Scroll grow={1} shrink={1}>
        <Box dir="row" height={1}>
          <Text>{'               '}</Text>
          <Pressable onPress={() => log.push('more')} sem={{ role: 'button', name: '+2 more' }}><Text>+2</Text></Pressable>
        </Box>
        {Array.from({ length: 40 }, (_, i) => <Text key={i}>{`row ${i + 1}`}</Text>)}
      </Scroll>
    </Box>
  );
}

test('clipped under a piece with its box: wheeled into view and clicked, the other control never pressed', async () => {
  const run = async (withOwns: boolean): Promise<string[]> => {
    const log: string[] = [];
    const t = await drawTest(<FocusRoot><ClippedUnderHead log={log} /></FocusRoot>, { width: 50, height: 12 });
    await t.settle();
    const w = withWheel(t);
    for (let i = 0; i < 30; i++) await w.wheel(5, 6, 'down');
    const head = semOf({ root: t.renderer.root, stdin: t.renderer.stdin as never });
    const find = (ns: readonly Node[]): Node | undefined => { for (const n of ns) { if (n.name === '+2 more') return n; const c = find(n.children); if (c) return c; } return undefined; };
    expect(find(head as unknown as Node[])!.box[1]).toBeLessThan(0);
    const owns = rendererOwns(t.renderer, (n) => renderableOf(n as never));
    expect(owns).toBeDefined();
    expect(await replay(session(t), [{ click: 'role=button[name=/^\\+\\d+ more/]' }], { ...w, hitAt: rendererHitAt(t.renderer)!, ...(withOwns ? { owns: owns! } : {}) })).toBeNull();
    t.renderer.destroy();
    return log;
  };
  // Without the owner check the boxes alone stop at the head row and the realm button takes the click (the defect).
  expect(await run(false)).toEqual(['realm']);
  expect(await run(true)).toEqual(['more']);
});
