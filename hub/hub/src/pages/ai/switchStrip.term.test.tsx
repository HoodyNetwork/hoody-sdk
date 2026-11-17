// Below PANE_MIN_PAGE (every terminal under ~135 columns) the AI pane is not beside the screen. Every screen but the chat
// list then carries the switcher as a strip on top: the live Agents screen drew no way to Automations, Knowledge or
// Settings. A group's screen keeps its index under the strip.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const SWITCH = /Chats +▌?Agents +▌?Automations +▌?Knowledge +▌?Settings/;

test('agents screen at 120x40: the switcher strip is on top, Agents marked', async () => {
  s = await renderPage({ page: 'ai', path: '/ai/agents', fx: null, cols: 120, rows: 40 });
  const frame = await s.settle();
  expect(frame).toMatch(SWITCH);
  expect(frame).toContain('▌Agents');
  expect(s.failures).toEqual([]);
}, 180_000);

test('skills screen at 80x24: the switcher strip, then the Knowledge index', async () => {
  s = await renderPage({ page: 'ai', path: '/ai/knowledge/skills', fx: null, cols: 80, rows: 24 });
  const lines = (await s.settle()).split('\n');
  const sw = lines.findIndex((l) => SWITCH.test(l));
  expect(sw).toBeGreaterThan(-1);
  expect(lines[sw]).toContain('▌Knowledge');
  expect(lines.slice(sw + 1).some((l) => /▌?Skills +▌?Instructions +▌?Memory/.test(l))).toBe(true);
}, 180_000);
