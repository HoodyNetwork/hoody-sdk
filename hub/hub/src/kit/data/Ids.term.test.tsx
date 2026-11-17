import { expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { layoutFaults } from '../../term/prim/layoutcheck';
import { CodeBlock, CodeLine, CopyField, IdChip, codeLineText, copyText, maskId } from './Ids';

/** What the terminal was asked to copy: the renderer's OSC 52 call, observed in this test only (nothing logs copies). */
function copies(t: TestTerm): string[] {
  const got: string[] = [];
  (t.renderer as unknown as { copyToClipboardOSC52(s: string): boolean }).copyToClipboardOSC52 = (s) => { got.push(s); return true; };
  return got;
}


const ID = 'abcdef0123456789abcdef01';

test('IdChip shows only the masked id; Enter and c copy the whole id', async () => {
  const t = await drawTest(<FocusRoot><IdChip id={ID} label="Box" /></FocusRoot>, { width: 40, height: 3 });
  const copied = copies(t);
  let f = await t.settle();
  expect(f).toContain('Box abcd…ef01 ⧉');
  expect(f).not.toContain(ID);
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressKey('c');
  f = await t.settle();
  expect(copied.at(-1)).toBe(ID);
  // No terminal host takes OSC 52 in the test renderer: the chip says so instead of claiming it copied.
  expect(f).toMatch(/copy failed|copied/);
  t.mockInput.pressEnter();
  await t.settle();
  expect(copied.at(-1)).toBe(ID);
  t.renderer.destroy();
});

test('CopyField never shows a value holding an id; copy gives it whole', async () => {
  const v = `https://p-${ID}.example.org/`;
  const t = await drawTest(<FocusRoot><CopyField label="Address" value={v} /></FocusRoot>, { width: 60, height: 4 });
  const copied = copies(t);
  const f = await t.settle();
  // The web's look (Ids.tsx): an address holding an id is ExtLink's masked button, "https://••••".
  expect(f).toContain('https://••••');
  expect(f).not.toContain(ID);
  // Tab reaches the masked address button first (it opens outside), then Copy.
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(copied.at(-1)).toBe(v);
  t.renderer.destroy();
});

test('CopyField in a narrow row stays inside it: a long web address wraps whole, the copy control stays (web min-width:0 + overflow-wrap:anywhere)', async () => {
  const v = 'https://api.example.org/auth/signup?ref=maya-builds-long';
  const w = 40;
  const t = await drawTest(<FocusRoot><Box dir="row" width={30}><CopyField value={v} copyName="Copy link" /></Box></FocusRoot>, { width: w, height: 8 });
  const f = await t.settle();
  const faults = layoutFaults((t.renderer as unknown as { root: never }).root, { cols: w, rows: 8 }).filter((x) => x.kind === 'cut' || x.kind === 'overdraw' || x.kind === 'text-cut');
  expect(faults).toEqual([]);
  const lines = f.split('\n');
  for (const l of lines) expect(l.slice(30).trim()).toBe('');
  expect(f).toContain('⧉ copy');
  expect(f.replace('⧉ copy', '').replace(/\s+/g, '')).toContain(v);
  t.renderer.destroy();
});

test('CodeBlock: shell lines with a prompt, never cut (a long line wraps); Copy all of steps', async () => {
  const long = 'curl -fsSL https://downloads.example.org/install/very/long/path/to/the/installer/script.sh | sh';
  const t = await drawTest(<FocusRoot><CodeBlock code={long} lang="shell" prompt /></FocusRoot>, { width: 40, height: 8 });
  const copied = copies(t);
  const f = await t.settle();
  expect(f.replace(/\s+/g, '')).toContain(`$${long}`.replace(/\s+/g, ''));
  t.renderer.destroy();
  const s = await drawTest(
    <FocusRoot><CodeBlock label="Install" lang="shell" lines={[{ caption: 'Add', code: 'hoody add' }, { caption: 'Sign in', code: ['hoody login ', { placeholder: 'computer' }] }]} /></FocusRoot>,
    { width: 60, height: 10 },
  );
  const fs = await s.settle();
  expect(fs).toMatch(/Install\s+⧉ Copy all \(Fill in the missing part first\)/);
  expect(fs).toContain('1. Add');
  expect(fs).toContain('‹computer›');
  s.renderer.destroy();
});

test('CodeLine draws the value and its copy; pure helpers are the shared ones', async () => {
  const t = await drawTest(<FocusRoot><CodeLine value="/setprivacy" /></FocusRoot>, { width: 40, height: 2 });
  const copied = copies(t);
  expect(await t.settle()).toContain('/setprivacy ⧉ copy');
  t.renderer.destroy();
  expect(maskId(ID)).toBe('abcd…ef01');
  expect(codeLineText({ code: ['a', { placeholder: 'x' }] })).toBeUndefined();
  expect(await copyText('x')).toBe(false);
});

test('a copy is a user action through the one sanitised seam: controls never reach the clipboard', async () => {
  const v = 'tok\u001b]52;c;ZXZpbA==\u0007en\r\nx';
  const t = await drawTest(<FocusRoot><CopyField label="Token" value={v} /></FocusRoot>, { width: 60, height: 4 });
  const copied = copies(t);
  await t.settle();
  expect(copied).toEqual([]); // drawing copies nothing
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(copied.length).toBe(1);
  expect(copied[0]).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f]/);
  expect(copied[0]).toBe('tok]52;c;ZXZpbA==en\nx');
  t.renderer.destroy();
});
