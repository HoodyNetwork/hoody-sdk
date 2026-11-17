// The overlay foundation (prim/Overlay.ts).
//
// | # | Behaviour (from the web kit's React Aria overlays) | Test |
// |---|---|---|
// | 1 | A modal draws above the page; the page's text is still there under the scrim | 'a modal draws above the page' |
// | 2 | Tab / Shift-Tab cycle inside the top layer only (focus trap) | 'Tab cycles inside the modal' |
// | 3 | The page gets no key while a modal is open (its shortcuts, its focused control) | 'the page gets no key' |
// | 4 | Esc closes the top layer only (nested: the confirm on a drawer) | 'Esc closes the top layer only' |
// | 5 | Focus returns to the opener on close | 'focus returns to the opener' |
// | 6 | A press on the scrim calls onOutside and never reaches the page | 'a press on the scrim' |
// | 7 | A popover press outside closes it; the press does not reach the page | 'popover outside press' |
// | 8 | A tip does not trap: keys go on to the page; Esc closes the tip first | 'a tip does not trap' |
// | 9 | Anchored placement: below, flips above, clamps into the screen; beside flips; `room` is the larger side | placeLayer tests |
// | 10 | A side sheet becomes full screen on a narrow screen; resize re-clamps | placeLayer + 'resize re-clamps' |
// | 11 | A text field inside a layer edits; one behind it does not | 'a field in the layer edits' |
// | 12 | Initial focus 'first': the first focusable in reading order | 'initial focus first' |
// | 14 | Initial focus never scrolls the body: the layer opens at its top even when its first stop is below the fold (React Aria focusWithoutScrolling) | 'opens at its top' |
// | 13 | An autoFocus control inside the layer keeps the focus over 'first' (React Aria FocusScope autoFocus moves focus only when nothing inside has it) | 'an autoFocus control in the layer wins over first' |
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from './testing';
import { Box, FocusRoot, Pressable, Scroll, Text, TextInput, useKeys } from './index';
import { Layer, OverlayHost, placeLayer, type LayerKind } from './Overlay';

function Btn({ label, onPress, autoFocus }: { label: string; onPress?: () => void; autoFocus?: boolean }) {
  return (
    <Pressable onPress={onPress} autoFocus={autoFocus}>
      {({ focused }) => <Text inverse={focused}>[{label}]</Text>}
    </Pressable>
  );
}

function Page({ kind = 'modal', log, inner }: { kind?: LayerKind; log: string[]; inner?: boolean }) {
  const [open, setOpen] = useState(false);
  const [second, setSecond] = useState(false);
  const [field, setField] = useState('');
  const [pageField, setPageField] = useState('');
  useKeys((k) => { if (k.name === 'x') { log.push('page-x'); return true; } return false; });
  return (
    <Box>
      <Btn label="Open" autoFocus onPress={() => { log.push('open'); setOpen(true); }} />
      <Btn label="Other" onPress={() => log.push('page-other')} />
      <TextInput value={pageField} onChange={setPageField} />
      <Text>page text here</Text>
      <Layer open={open} kind={kind} place={{ at: 'center', width: 30 }} frameTitle="Panel" initialFocus="first"
        onEscape={() => { log.push('esc'); setOpen(false); }} onOutside={() => { log.push('outside'); setOpen(false); }}>
        <Btn label="One" onPress={() => log.push('one')} />
        <Btn label="Two" onPress={() => { log.push('two'); if (inner) setSecond(true); }} />
        <TextInput value={field} onChange={setField} />
        <Text>field={field}</Text>
        <Layer open={second} kind="modal" place={{ at: 'center', width: 20 }} frameTitle="Confirm" initialFocus="first"
          onEscape={() => { log.push('esc2'); setSecond(false); }}>
          <Btn label="Yes" onPress={() => log.push('yes')} />
        </Layer>
      </Layer>
      <Text>page field={pageField}</Text>
    </Box>
  );
}

/** Esc waits for the key parser's lone-escape timeout. */
async function esc(t: { mockInput: { pressEscape(): void }; settle(): Promise<string> }): Promise<string> {
  t.mockInput.pressEscape();
  await new Promise((r) => setTimeout(r, 80));
  return t.settle();
}

const draw = (log: string[], kind: LayerKind = 'modal', inner = false, width = 60, height = 16) =>
  drawTest(<FocusRoot><OverlayHost><Page log={log} kind={kind} inner={inner} /></OverlayHost></FocusRoot>, { width, height });

test('a modal draws above the page; Tab cycles inside it; initial focus first', async () => {
  const log: string[] = [];
  const t = await draw(log);
  t.mockInput.pressEnter();
  let f = await t.settle();
  expect(log).toEqual(['open']);
  expect(f).toContain('Panel');
  // One box style on a screen: a modal's frame is the single line, never the double one.
  expect(f).toMatch(/┌/);
  expect(f).not.toMatch(/[╔╗╚╝║═]/);
  // initial focus: One (inverse is not in the char frame; press Enter to see who has it)
  t.mockInput.pressEnter();
  await t.settle();
  expect(log).toEqual(['open', 'one']);
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(log.at(-1)).toBe('two');
  // Tab past the field wraps to One (never the page's Other)
  t.mockInput.pressTab();
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(log.at(-1)).toBe('one');
  expect(log).not.toContain('page-other');
  f = t.captureCharFrame();
  expect(f).toContain('Panel');
  t.renderer.destroy();
});

test('the page gets no key while a modal is open; a field in the layer edits, the page field does not', async () => {
  const log: string[] = [];
  const t = await draw(log);
  t.mockInput.pressEnter();
  await t.settle();
  t.mockInput.pressKey('x');
  await t.settle();
  expect(log).not.toContain('page-x');
  // to the layer's field: One -> Two -> field
  t.mockInput.pressTab();
  t.mockInput.pressTab();
  await t.settle();
  await t.mockInput.typeText('abc');
  const f = await t.settle();
  expect(f).toContain('field=abc');
  expect(f).toContain('page field=');
  expect(f).not.toContain('page field=abc');
  t.renderer.destroy();
});

test('Esc closes the top layer only; focus returns to the opener', async () => {
  const log: string[] = [];
  const t = await draw(log, 'modal', true);
  t.mockInput.pressEnter();
  await t.settle();
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter(); // Two opens the confirm
  let f = await t.settle();
  expect(f).toContain('Confirm');
  await esc(t);
  f = await t.settle();
  expect(log).toContain('esc2');
  expect(log).not.toContain('esc');
  expect(f).not.toContain('Confirm');
  expect(f).toContain('Panel');
  // focus in the first layer stayed on Two
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(f).toContain('Confirm');
  await esc(t);
  await t.settle();
  await esc(t);
  f = await t.settle();
  expect(f).not.toContain('Panel');
  // the opener has focus again
  t.mockInput.pressEnter();
  await t.settle();
  expect(log.filter((x) => x === 'open')).toHaveLength(2);
  // and page keys work again once it is closed
  await esc(t);
  t.mockInput.pressKey('x');
  await t.settle();
  expect(log).toContain('page-x');
  t.renderer.destroy();
});

test('a press on the scrim calls onOutside and never reaches the page', async () => {
  const log: string[] = [];
  const t = await draw(log);
  t.mockInput.pressEnter();
  const f = await t.settle();
  // "[Other]" is on the page's first line, under the scrim
  const row = f.split('\n').findIndex((l) => l.includes('[Open]'));
  await t.mockMouse.click(1, Math.max(0, row));
  await t.settle();
  expect(log).toEqual(['open', 'outside']);
  expect(log).not.toContain('page-other');
  t.renderer.destroy();
});

test('a popover: press outside closes it, the press does not reach the page', async () => {
  const log: string[] = [];
  const t = await draw(log, 'popover');
  t.mockInput.pressEnter();
  const f = await t.settle();
  expect(f).toContain('┌');
  await t.mockMouse.click(1, 1);
  await t.settle();
  expect(log).toEqual(['open', 'outside']);
  t.renderer.destroy();
});

test('a tip does not trap: keys go on to the page; Esc closes the tip first', async () => {
  const log: string[] = [];
  const t = await draw(log, 'tip');
  t.mockInput.pressEnter();
  let f = await t.settle();
  expect(f).toContain('Panel');
  t.mockInput.pressKey('x');
  await t.settle();
  expect(log).toContain('page-x');
  await esc(t);
  f = await t.settle();
  expect(log).toContain('esc');
  expect(f).not.toContain('Panel');
  t.renderer.destroy();
});

test('resize re-clamps a centred panel', async () => {
  const log: string[] = [];
  const t = await draw(log, 'modal', false, 60, 16);
  t.mockInput.pressEnter();
  await t.settle();
  t.resize(24, 10);
  const f = await t.settle();
  const lines = f.split('\n');
  expect(lines.some((l) => l.includes('Panel'))).toBe(true);
  expect(lines.every((l) => l.length <= 24)).toBe(true);
  t.renderer.destroy();
});

function AutoPage({ log }: { log: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Box>
      <Btn label="Open" autoFocus onPress={() => setOpen(true)} />
      <Layer open={open} kind="modal" place={{ at: 'center', width: 30 }} frameTitle="Panel" initialFocus="first" onEscape={() => setOpen(false)}>
        <Btn label="Top" onPress={() => log.push('top')} />
        <Btn label="Later" autoFocus onPress={() => log.push('later')} />
      </Layer>
    </Box>
  );
}

test('an autoFocus control in the layer wins over first', async () => {
  const log: string[] = [];
  const t = await drawTest(<FocusRoot><OverlayHost><AutoPage log={log} /></OverlayHost></FocusRoot>, { width: 60, height: 16 });
  t.mockInput.pressEnter();
  await t.settle();
  await new Promise((r) => setTimeout(r, 20));
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(log).toEqual(['later']);
});

test('placeLayer: anchored below, flips above, clamps; beside flips; side sheet full on narrow', () => {
  const a = { x: 70, y: 3, width: 6, height: 1 };
  const below = placeLayer({ at: 'anchor', anchor: a, width: 20 }, 80, 24, 5);
  expect(below).toMatchObject({ top: 4, left: 60, side: 'bottom' });
  const end = placeLayer({ at: 'anchor', anchor: a, width: 20, align: 'end' }, 80, 24, 5);
  expect(end.left).toBe(56);
  const low = { x: 2, y: 20, width: 6, height: 1 };
  expect(placeLayer({ at: 'anchor', anchor: low, width: 20 }, 80, 24, 8)).toMatchObject({ top: 12, side: 'top' });
  // room: the larger side, whatever the panel's height (a list windowed to it never flips the panel back and forth).
  expect(placeLayer({ at: 'anchor', anchor: low, width: 20 }, 80, 24, 2)).toMatchObject({ side: 'bottom', maxHeight: 3, room: 20 });
  expect(placeLayer({ at: 'anchor', anchor: low, width: 20 }, 80, 24, 20)).toMatchObject({ side: 'top', maxHeight: 20, room: 20 });
  expect(placeLayer({ at: 'anchor', anchor: { x: 70, y: 5, width: 4, height: 1 }, side: 'end', width: 20 }, 80, 24, 3)).toMatchObject({ side: 'start', left: 49 });
  expect(placeLayer({ at: 'right', width: 80 }, 120, 40)).toMatchObject({ left: 40, width: 80, height: 40 });
  expect(placeLayer({ at: 'right', width: 80 }, 90, 24)).toMatchObject({ left: 0, width: 90 });
  // keep holds only from keepFrom columns; narrower nothing is kept and a page strip under minPage is covered.
  const sheet = { at: 'right', width: 80, keep: 7, keepFrom: 100, minPage: 20, fullBelow: 75 } as const;
  expect(placeLayer(sheet, 120, 40)).toMatchObject({ left: 40, width: 80 });
  expect(placeLayer(sheet, 100, 24)).toMatchObject({ left: 20, width: 80 });
  expect(placeLayer(sheet, 84, 24)).toMatchObject({ left: 0, width: 84 });
  expect(placeLayer({ ...sheet, width: 60 }, 80, 24)).toMatchObject({ left: 20, width: 60 });
  expect(placeLayer({ ...sheet, width: 110 }, 99, 24)).toMatchObject({ left: 0, width: 99 });
  expect(placeLayer(sheet, 74, 24)).toMatchObject({ left: 0, width: 74 });
  expect(placeLayer({ at: 'center', width: 60 }, 120, 40, 10)).toMatchObject({ left: 30, top: 8 });
  expect(placeLayer({ at: 'center', width: 60 }, 40, 12, 20)).toMatchObject({ left: 2, top: 0, width: 36 });
  expect(placeLayer({ at: 'anchor', anchor: null, width: 20 }, 80, 24, 4).left).toBe(30);
});

test('opens at its top: initial focus does not scroll the body', async () => {
  const t = await drawTest(<FocusRoot><OverlayHost>
    <Layer open kind="modal" place={{ at: 'center', width: 30 }} frameTitle="Panel" initialFocus="first" onEscape={() => {}}>
      <Text>Head line</Text>
      <Scroll followFocus grow={1} shrink={1}>
        {Array.from({ length: 20 }, (_, i) => <Text key={i}>{`row ${i + 1}`}</Text>)}
        <Btn label="Below" />
      </Scroll>
    </Layer>
  </OverlayHost></FocusRoot>, { width: 60, height: 12 });
  await t.settle();
  await new Promise((r) => setTimeout(r, 20));
  const f = await t.settle();
  expect(f).toContain('row 1 ');
  t.renderer.destroy();
});
