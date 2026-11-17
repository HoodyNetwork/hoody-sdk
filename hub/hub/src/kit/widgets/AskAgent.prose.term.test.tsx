// Ask the Agent in the terminal: a prose part (kind 'prose') opens to its paragraphs with one blank row between them,
// a data part to its lines as they are.
import { startFixtureMode } from '@core/transport';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'bun:test';
import { useEffect } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot, PaneSize } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { setStyleTable } from '../../term/jsx/style';
import { installStyleTable } from '../../../scripts/term/style-table';
import { act, getByRole, semanticsOf, type SemRoot } from '../../term/prim/semantics';
import { AskAgentPanel, resetAskAgentForTests, useAskAgent, type AgentReadPart } from './AskAgent';

const C = { id: 'c'.repeat(24), name: 'atlas', status: 'running' };
const HOW = ['Access rules of the computers in this realm.', 'How the rules combine: they add up.', 'Logs: only from a "logs" rule.'];
const PARTS: AgentReadPart[] = [
  { id: 'how', title: 'How access rules combine', text: HOW.join('\n'), kind: 'prose' },
  { id: 'atlas', title: 'atlas: access rules', text: 'Computer "atlas": Anyone\n  version: 3\n  groups: none' },
];

function Ask() {
  const a = useAskAgent({
    mode: 'step', askKey: 'prose-term', subject: 'access on your computers', source: 'Computers', computer: C,
    reads: PARTS, explain: { run: () => undefined },
  });
  const { open } = a;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once
  useEffect(() => { open(); }, []);
  return <AskAgentPanel ask={a} />;
}

let t: TestTerm | null = null;
beforeAll(() => installStyleTable(120));
afterAll(() => setStyleTable(null));
beforeEach(() => { startFixtureMode(); });
afterEach(() => { t?.renderer.destroy(); t = null; resetAskAgentForTests(); });
const tree = () => semanticsOf(t!.renderer as unknown as SemRoot);

test('a prose part opens to its paragraphs, one blank row apart; a data part keeps its lines together', async () => {
  t = await drawTest(<FocusRoot><OverlayHost><PaneSize><Box dir="column" width={72} height={40}><Ask /></Box></PaneSize></OverlayHost></FocusRoot>, { width: 72, height: 40 });
  await t.settle();
  act(getByRole(tree(), 'button', { name: 'How access rules combine' }), 'press');
  const f = (await t.settle()).split('\n');
  const row = (words: string) => f.findIndex((r) => r.includes(words));
  const at = HOW.map((p) => row(p.slice(0, 24)));
  for (const n of at) expect(n).toBeGreaterThan(-1);
  for (let i = 1; i < at.length; i++) {
    expect(at[i]! - at[i - 1]!).toBe(2);
    expect(f[at[i]! - 1]!.replace(/[│┃|]/g, '').trim()).toBe('');
  }
  act(getByRole(tree(), 'button', { name: 'atlas: access rules' }), 'press');
  const g = (await t.settle()).split('\n');
  const v = g.findIndex((r) => r.includes('version: 3'));
  expect(g[v - 1]).toContain('Computer "atlas": Anyone');
  expect(g[v + 1]).toContain('groups: none');
});
