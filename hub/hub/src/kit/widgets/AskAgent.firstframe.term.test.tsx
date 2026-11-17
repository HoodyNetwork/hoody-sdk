// The first frame of "Ask the Agent" in the terminal: the panel says the request in plain words and lists what the Agent
// reads, open, part by part; a part with text opens to exactly that text; a part still being read says so and has
// nothing to open.
import { startFixtureMode } from '@core/transport';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'bun:test';
import { useEffect } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot, PaneSize } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { setStyleTable } from '../../term/jsx/style';
import { installStyleTable } from '../../../scripts/term/style-table';
import { act, getByRole, queryByRole, semanticsOf, type SemRoot } from '../../term/prim/semantics';
import { AskAgentPanel, resetAskAgentForTests, useAskAgent, type AgentReadPart } from './AskAgent';

const C = { id: 'c'.repeat(24), name: 'atlas', status: 'running' };
const PARTS: AgentReadPart[] = [
  { id: 'how', title: 'How access rules combine', text: 'Project rules merge program by program.' },
  { id: 'atlas', title: 'atlas: access rules', text: 'Computer "atlas": Anyone with the address' },
  { id: 'cedar', title: 'cedar: access rules', note: 'Reading…' },
];
const QUESTION = 'Answer as a short Markdown list.\nAnswer only from the Context below.';
const REQUEST = { title: 'Check who can open these computers', summary: 'One line per computer, then up to three risks.', text: QUESTION };

function Ask() {
  const a = useAskAgent({
    mode: 'step', askKey: 'first-term', subject: 'access on your computers', source: 'Computers', computer: C,
    request: REQUEST, reads: PARTS, readsNote: 'Read just now.',
    explain: { run: () => undefined },
  });
  const { open } = a;
  // The host's step opens it; here it is open from the start.
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

test('the request and every part are on the first frame; a part opens to its exact text', async () => {
  t = await drawTest(<FocusRoot><OverlayHost><PaneSize><Box dir="column" width={72} height={40}><Ask /></Box></PaneSize></OverlayHost></FocusRoot>, { width: 72, height: 40 });
  await t.settle();
  await new Promise((r) => setTimeout(r, 40));
  const f = await t.settle();
  for (const words of [REQUEST.title, REQUEST.summary, 'How access rules combine', 'atlas: access rules', 'cedar: access rules', 'Reading…', 'Read just now.']) expect(f, words).toContain(words);
  expect(f).not.toContain('Project rules merge program by program.');
  expect(f.split('\n').every((r) => r.trimEnd().length <= 72)).toBe(true);
  expect(queryByRole(tree(), 'button', { name: /cedar/ })).toBeNull();
  act(getByRole(tree(), 'button', { name: 'atlas: access rules' }), 'press');
  const open = await t.settle();
  expect(open).toContain('Computer "atlas": Anyone with the address');
});
