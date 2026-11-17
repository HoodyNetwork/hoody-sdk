// EmptyState sm body: the web caps .emptyBody at 48ch (States.module.css); the terminal draws it at most 48 cells wide,
// so a sm state in a wide pane wraps its sentence as the web does instead of one long line. Title, actions, hint and
// the md card are not capped here (the card has its own 72-cell limit).
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, Text } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { EmptyState } from './States';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const draw = async (node: React.ReactNode, w = 120, h = 12) => { t = await drawTest(<FocusRoot><OverlayHost>{node}</OverlayHost></FocusRoot>, { width: w, height: h }); return t.settle(); };

const BODY = 'Nothing has run on this computer yet. A schedule you add runs here at its own time, and its last answer shows in this list.';
const lines = (f: string) => f.split('\n').map((l) => l.trimEnd()).filter(Boolean);

test('sm at 120 columns: the body wraps at 48 cells, every word kept, title and action unchanged', async () => {
  const f = await draw(<EmptyState size="sm" title="No runs yet" body={BODY} action={<Text>[Add a schedule]</Text>} />);
  const body = lines(f).filter((l) => !l.includes('No runs yet') && !l.includes('[Add a schedule]'));
  expect(body.length).toBeGreaterThan(1);
  for (const l of body) expect(l.length).toBeLessThanOrEqual(48);
  expect(body.join(' ').replace(/\s+/g, ' ')).toBe(BODY);
  expect(lines(f)[0]).toContain('No runs yet');
  expect(f).toContain('[Add a schedule]');
});

test('sm narrower than 48 columns: the pane width still rules', async () => {
  const f = await draw(<EmptyState size="sm" title="No runs yet" body={BODY} />, 30, 14);
  for (const l of lines(f)) expect(l.length).toBeLessThanOrEqual(30);
  expect(lines(f).slice(1).join(' ').replace(/\s+/g, ' ')).toBe(BODY);
});

test('a written line break still shows (the web pre-line); a short body is one line', async () => {
  const f = await draw(<EmptyState size="sm" title="T" body={'First line.\nSecond line.'} />);
  expect(lines(f)).toEqual(['T', 'First line.', 'Second line.'].map((x) => expect.stringContaining(x)) as never);
});
