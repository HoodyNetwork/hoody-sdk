// Button.term: the web component's observable behaviours, each held here.
// - a button is [Label]; a solid one (primary, blue, filled danger) is ' Label ' at md and '[Label]' at sm/xs (size
//   honoured), bold; icons are not drawn
// - Enter and Space press: onPress(event) with a press-shaped event (type 'press')
// - isDisabled (no reason): skipped by Tab, no press
// - busy: "…" before the label, no press; it stays a Tab stop (React Aria isPending keeps the focus)
// - disabledReason with isDisabled (soft-disabled): stays a Tab stop, Enter does nothing, the reason shows while it has
//   the focus (words, readable in mono) and goes when the focus leaves; Esc hides it
// - shortcut shown after the label as Ctrl+J
// - IconButton: its label in brackets; pressed marks ✓; description/disabledReason as the soft reason
// - pure (Button.pure.ts): chipFor, buttonLook, anchorProps, softDisabled, softDisabledProps, isChipVariant
import { expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../term/prim';
import { Button, IconButton } from './Button';
import { InlineActions, SuggestionActions } from '../layouts/anatomy/ActionBar';
import { anchorProps, buttonLook, chipFor, isChipVariant, softDisabled, softDisabledProps } from './Button.pure';

const esc = async (t: TestTerm) => { t.mockInput.pressEscape(); await new Promise((r) => setTimeout(r, 120)); return t.settle(); };

test('a word icon is not drawn beside the label (it would read as part of it); a glyph icon is', async () => {
  const t = await drawTest(
    <FocusRoot>
      <Box dir="column">
        <Button variant="ghost" size="sm" icon="lock">Ask when needed</Button>
        <Button variant="ghost" size="sm" icon="warn">Allow everything</Button>
      </Box>
    </FocusRoot>,
    { width: 40, height: 3 },
  );
  const f = t.captureCharFrame();
  expect(f).toContain('[Ask when needed]');
  expect(f).not.toContain('lock');
  expect(f).toContain('[! Allow everything]');
  t.renderer.destroy();
});

test('looks and sizes', async () => {
  const t = await drawTest(
    <FocusRoot>
      <Box dir="column">
        <Button>Cancel</Button>
        <Button variant="primary">Save</Button>
        <Button variant="primary" size="sm">Small</Button>
        <Button icon="plus" shortcut="Mod+J">Ask</Button>
      </Box>
    </FocusRoot>,
    { width: 40, height: 5 },
  );
  const f = t.captureCharFrame();
  expect(f).toContain('[Cancel]');
  expect(f).toMatch(/^ Save /m);
  expect(f).toContain('[Small]');
  expect(f).toContain('[+ Ask Ctrl+J]');
  t.renderer.destroy();
});

test('press, disabled, busy', async () => {
  const got: Array<string | undefined> = [];
  const t = await drawTest(
    <FocusRoot>
      <Button isDisabled onPress={() => got.push('off')}>Off</Button>
      <Button onPress={(e) => got.push(`go:${e.type}`)}>Go</Button>
      <Button busy onPress={() => got.push('busy')}>Saving</Button>
    </FocusRoot>,
    { width: 50, height: 3 },
  );
  expect(t.captureCharFrame()).toContain('[… Saving]');
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  t.mockInput.pressKey(' ');
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  await t.settle();
  // The disabled button is not a Tab stop; the busy one is (pending keeps the focus) and refuses the press.
  expect(got).toEqual(['go:press', 'go:press']);
  expect(await t.settle()).toMatch(/\[… Saving\]/);
  t.renderer.destroy();
});

test('soft-disabled: focusable, does nothing, the reason shows while focused; Esc hides it', async () => {
  const got: string[] = [];
  const t = await drawTest(
    <FocusRoot>
      <Box dir="column" gap={1}>
        <Button autoFocus onPress={() => got.push('first')}>First</Button>
        <Button isDisabled disabledReason="Stop the computer first." onPress={() => got.push('soft')}>Resize</Button>
      </Box>
    </FocusRoot>,
    { width: 50, height: 8 },
  );
  let f = await t.settle();
  expect(f).toContain('[Resize]');
  expect(f).not.toContain('Stop the computer first.');
  t.mockInput.pressTab();
  f = await t.settle();
  expect(f).toContain('Stop the computer first.');
  t.mockInput.pressEnter();
  t.mockInput.pressKey(' ');
  await t.settle();
  expect(got).toEqual([]);
  f = await esc(t);
  expect(f).not.toContain('Stop the computer first.');
  t.mockInput.pressTab();
  f = await t.settle();
  expect(f).not.toContain('Stop the computer first.');
  t.mockInput.pressEnter();
  await t.settle();
  expect(got).toEqual(['first']);
  t.renderer.destroy();
});

test('IconButton: label, pressed mark, soft reason', async () => {
  const got: string[] = [];
  const t = await drawTest(
    <FocusRoot>
      <Box dir="column" gap={1}>
        <IconButton icon="bell" label="Pin" pressed onPress={() => got.push('pin')} />
        <IconButton icon="trash" label="Delete" isDisabled description="Owners only." onPress={() => got.push('del')} />
      </Box>
    </FocusRoot>,
    { width: 40, height: 8 },
  );
  let f = t.captureCharFrame();
  expect(f).toContain('[✓ Pin]');
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(got).toEqual(['pin']);
  expect(f).toContain('Owners only.');
  t.renderer.destroy();
});

test('pure rules', () => {
  expect(chipFor({ variant: 'primary', size: 'md', hasEnd: false })).toBe(true);
  expect(chipFor({ variant: 'primary', size: 'xs', hasEnd: false })).toBe(false);
  expect(chipFor({ variant: 'secondary', size: 'sm' })).toBe(true);
  expect(chipFor({ variant: 'secondary', size: 'sm', chip: false })).toBe(false);
  expect(chipFor({ variant: 'ghost', size: 'md', hasEnd: false, chip: true })).toBe(false);
  expect(buttonLook('primary', 'danger')).toBe('dangerSolid');
  expect(buttonLook('secondary', 'danger')).toBe('danger');
  expect(isChipVariant('secondary')).toBe(true);
  expect(isChipVariant('ghost')).toBe(false);
  expect(anchorProps('HTTPS://x.org', { target: '_self' })).toEqual({ href: 'HTTPS://x.org', target: '_blank', rel: 'noopener noreferrer' });
  expect(anchorProps('/logs', { target: '_self', rel: 'x' })).toEqual({ href: '/logs', target: '_self', rel: 'x' });
  expect(softDisabled('why', true)).toBe(true);
  expect(softDisabled('why', true, true)).toBe(false);
  expect(softDisabled(undefined, true)).toBe(false);
  const p = softDisabledProps({ onFocus: () => {}, title: 't' });
  expect('onFocus' in p && p.onFocus === undefined).toBe(true);
  expect(p.isDisabled).toBe(false);
  expect('title' in p).toBe(false);
});

// A button whose label is data wraps where the web wraps it: the web's inline action row and
// suggestion row let a long label (a computer name) wrap inside the button, never "…" (ActionBar.module.css `.inline >
// *`, `max-inline-size: 100%`). The terminal Button cut every label to one line; inside InlineActions and
// SuggestionActions it now wraps, words whole and the closing bracket kept. A Button anywhere else still cuts.

const LONG = 'Open sunny-red-production-eu';
// The words read in order with the line breaks taken out (a wrap may fall after a hyphen, as a browser's).
const flat = (f: string): string => f.replace(/\s+/g, '');
const WHOLE = `[${LONG.replace(/\s+/g, '')}]`;

test('InlineActions: a long label wraps inside its button, whole, with its closing bracket', async () => {
  const t = await drawTest(
    <FocusRoot><Box dir="column" width={20}><InlineActions actions={[{ id: 'o', label: LONG, literal: true, onPress: () => {} }]} /></Box></FocusRoot>,
    { width: 30, height: 6 },
  );
  const f = await t.settle();
  expect(f, f).not.toContain('…');
  expect(flat(f), f).toContain(WHOLE);
  // Inside the 20-cell column: no line reaches past it.
  for (const l of f.split('\n')) expect(l.trimEnd().length, f).toBeLessThanOrEqual(20);
  t.renderer.destroy();
});

test('SuggestionActions: a long suggestion wraps, whole, with its closing bracket', async () => {
  const t = await drawTest(
    <FocusRoot><Box dir="column" width={20}><SuggestionActions label="Try" actions={[{ id: 'o', label: LONG, literal: true, onPress: () => {} }]} /></Box></FocusRoot>,
    { width: 30, height: 6 },
  );
  const f = await t.settle();
  expect(f, f).not.toContain('…');
  expect(flat(f), f).toContain(WHOLE);
  for (const l of f.split('\n')) expect(l.trimEnd().length, f).toBeLessThanOrEqual(20);
  t.renderer.destroy();
});

test('a Button outside those rows still cuts to one line with "…"', async () => {
  const t = await drawTest(
    <FocusRoot><Box dir="row" width={14}><Button>{LONG}</Button></Box></FocusRoot>,
    { width: 30, height: 3 },
  );
  const f = await t.settle();
  expect(f.split('\n')[0], f).toContain('…');
  expect(f.split('\n')[1]!.trim(), f).toBe('');
  t.renderer.destroy();
});

// Census cluster 18: an info IconButton with no action (Get a computer's feature tips) is the web's ⓘ whose label is its
// tooltip. It drew its whole label as the button ("[Terminal, files, desktop, browser, code edi…", past its row).
test('IconButton icon="info" with no action: "ⓘ" named by its label; the label shows as a tip on focus; a pressable one keeps its face', async () => {
  const { OverlayHost } = await import('../../term/prim/Overlay');
  const { semanticsOf, focusedNode } = await import('../../term/prim/semantics');
  const TIP = 'Terminal, files, desktop, browser, code editor and the rest of the Hoody programs.';
  const got: string[] = [];
  const t = await drawTest(
    <FocusRoot><OverlayHost>
      <Box dir="column" gap={1} pad={{ top: 6 }}>
        <Box dir="row" width={40} gap={1}><Box grow={1} shrink={1}><Text>Hoody kit</Text></Box><IconButton icon="info" size="sm" variant="ghost" label={TIP} /></Box>
        <IconButton icon="info" size="sm" label="Hosting" onPress={() => got.push('open')} />
      </Box>
    </OverlayHost></FocusRoot>,
    { width: 60, height: 16 },
  );
  let f = await t.settle();
  const row = f.split('\n').find((l) => l.includes('Hoody kit')) ?? '';
  expect(row.trimEnd().endsWith('ⓘ'), f).toBe(true);
  expect(f).not.toContain('Terminal, files');
  expect(f).toContain('[Hosting]');
  t.mockInput.pressTab();
  f = await t.settle();
  const node = focusedNode(semanticsOf(t.renderer as never));
  expect(node?.name).toBe(TIP);
  expect(f.replace(/[\s│]+/g, ' ')).toContain('Terminal, files, desktop');
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  await t.settle();
  expect(got).toEqual(['open']);
  t.renderer.destroy();
});
