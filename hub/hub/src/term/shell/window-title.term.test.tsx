// The terminal window title (shell/windowTitle.tsx): it follows the page, names the open chat on AI, is fixed while
// locked or while a secret is shown, cleans and bounds untrusted text, writes nothing off a terminal, and gives the
// terminal its own title back at the end. The title is not in the frame: no golden moves.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { FIXTURE_REALM } from '../../core/transport';
import { drawTest } from '../prim/testing';
import { FocusRoot } from '../prim';
import { SecretField } from '../../kit/forms/Secret';
import { __windowTitleSeams as declared, windowTitleState } from '../../kit/windowTitle';
import { TITLE_MAX, TITLE_PART_MAX, __windowTitleSeams, cleanTitlePart, termWindowTitle } from './windowTitle';
import billing from '../../pages/billing/strings.en.json';

const writes: string[] = [];
let s: PageSession | null = null;
beforeEach(() => {
  writes.length = 0;
  declared.reset();
  __windowTitleSeams.setOutput({ isTTY: true });
  __windowTitleSeams.observe((t) => writes.push(t));
});
afterEach(() => {
  s?.close();
  s = null;
  __windowTitleSeams.setOutput(null);
  __windowTitleSeams.observe(null);
});

const ESC = '\x1b';
const BEL = '\x07';
const controls = /[\u0000-\u001f\u007f-\u009f]/u;

test('pure: page, detail, lock and neutral titles', () => {
  expect(termWindowTitle({ page: 'Plans & Billing', detail: null, locked: false, neutral: false })).toBe('Plans & Billing · Hoody Hub');
  expect(termWindowTitle({ page: 'AI', detail: 'Deploy the site', locked: false, neutral: false })).toBe('Deploy the site · AI · Hoody Hub');
  expect(termWindowTitle({ page: null, detail: null, locked: false, neutral: false })).toBe('Hoody Hub');
  expect(termWindowTitle({ page: 'AI', detail: 'Deploy the site', locked: true, neutral: false })).toBe('Locked · Hoody Hub');
  expect(termWindowTitle({ page: 'Keys', detail: 'hk_live_123', locked: false, neutral: true })).toBe('Hoody Hub');
});

test('pure: an untrusted chat name cannot reach the terminal as control bytes, and is bounded', () => {
  const evil = `x${ESC}]0;owned${BEL}${ESC}]52;c;AAAA${ESC}\\\u009b2J\u0090q\r\nline\ttab`;
  const t = termWindowTitle({ page: 'AI', detail: evil, locked: false, neutral: false });
  expect(controls.test(t)).toBe(false);
  expect(t.endsWith(' · AI · Hoody Hub')).toBe(true);
  expect(t).not.toContain('\n');
  const long = cleanTitlePart('a'.repeat(500));
  expect([...long].length).toBe(TITLE_PART_MAX);
  expect(long.endsWith('…')).toBe(true);
  expect([...termWindowTitle({ page: 'p'.repeat(500), detail: 'd'.repeat(500), locked: false, neutral: false })].length).toBeLessThanOrEqual(TITLE_MAX);
  expect(cleanTitlePart('   ')).toBe('');
  expect(cleanTitlePart(42)).toBe('');
});

// Before any mount: a session's end wipes the process's held secrets, and a field then shows none.
test('a shown secret holds the neutral title until it is hidden or gone', async () => {
  const t = await drawTest(<FocusRoot><SecretField label="API key" value="hk_3f9a_SUPERSECRETVALUE42" visiblePrefix={7} /></FocusRoot>, { width: 100, height: 20 });
  expect(windowTitleState().neutral).toBe(false);
  t.mockInput.pressTab();
  await t.mockInput.typeText('s');
  const f = await t.settle();
  expect(f).toContain('SUPERSECRETVALUE42');
  expect(windowTitleState().neutral).toBe(true);
  t.renderer.destroy();
  await new Promise((r) => setTimeout(r, 50));
  expect(windowTitleState().neutral).toBe(false);
});

test('a page: "<Page> · Hoody Hub"; the end writes an empty title', async () => {
  s = await renderPage({ page: 'billing', cols: 120, rows: 40 });
  await s.settle();
  expect(writes.at(-1)).toBe(`${billing.title} · Hoody Hub`);
  s.close();
  s = null;
  expect(writes.at(-1)).toBe('');
}, 180_000);

test('AI with a chat open: "<chat name> · AI · Hoody Hub"', async () => {
  s = await renderPage({ page: 'ai', path: `/ai/c/s-wait?computer=atlas.00a1&realm=${FIXTURE_REALM}`, cols: 120, rows: 40, settleMs: 3000 });
  await s.settle();
  expect(writes.at(-1)).toBe('Deploy the staging site · AI · Hoody Hub');
}, 180_000);

test('not a terminal: nothing is written', async () => {
  __windowTitleSeams.setOutput({ isTTY: false });
  s = await renderPage({ page: 'billing', cols: 120, rows: 40 });
  await s.settle();
  s.close();
  s = null;
  expect(writes).toEqual([]);
}, 180_000);
