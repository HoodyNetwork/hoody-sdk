// The first frame of "Ask the Agent": before anything is sent the drawer says the request in plain words and shows what
// the Agent reads, open, part by part; each part's exact text is one press away; and what Explain then sends is made of
// exactly those texts (shown = sent), with the one-line title and context label the thread shows.
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { dropAskDraft, parseAskMessage, useAskDock, type AskDock } from '../ask';
import { AskAgentButton, resetAskAgentForTests, useAskAgent, type AgentReadPart } from './AskAgent';
import strings from './AskAgent.strings.en.json';

const C = { id: 'c'.repeat(24), name: 'atlas', status: 'running' };
const PARTS: AgentReadPart[] = [
  { id: 'how', title: 'How access rules combine', text: 'Project rules merge program by program.' },
  { id: 'atlas', title: 'atlas: access rules', text: 'Computer "atlas": Anyone with the address' },
  { id: 'cedar', title: 'cedar: access rules', note: 'Reading…' },
];
const QUESTION = 'Answer as a short Markdown list.\nAnswer only from the Context below.';
const CONTEXT = PARTS.filter((p) => p.text !== undefined).map((p) => p.text).join('\n');
const REQUEST = { title: 'Check who can open these computers', summary: 'One line per computer, then up to three risks.', text: QUESTION };

let dock: AskDock | null = null;
function Probe() { dock = useAskDock(); return null; }
function Ask({ reads }: { reads: string | readonly AgentReadPart[] }) {
  const a = useAskAgent({
    askKey: 'first', subject: 'access on your computers', source: 'Computers', computer: C,
    request: REQUEST, reads, readsNote: 'Read just now.',
    explain: { run: (send) => send({ text: QUESTION, context: CONTEXT, title: REQUEST.title, contextLabel: 'access rules of 2 computers' }) },
  });
  return <><Probe /><AskAgentButton ask={a} />{a.drawer}</>;
}
async function open() {
  await userEvent.click(screen.getByRole('button', { name: strings['aa.name'].replace('{{subject}}', 'access on your computers') }));
  return screen.findByRole('dialog');
}
afterEach(() => { act(() => dropAskDraft()); cleanup(); dock = null; resetAskAgentForTests(); });

describe('the first frame of Ask the Agent', () => {
  it('says the request and lists what the Agent reads, open, with no press', async () => {
    render(<Ask reads={PARTS} />);
    const d = await open();
    expect(within(d).getByText(strings['aa.request'])).toBeVisible();
    expect(within(d).getByText(REQUEST.title)).toBeVisible();
    expect(within(d).getByText(REQUEST.summary)).toBeVisible();
    const list = within(d).getByRole('list', { name: strings['aa.reads'] });
    expect(list).toBeVisible();
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    for (const p of PARTS) expect(within(list).getByText(p.title)).toBeVisible();
    // A part still being read says so and has nothing to open.
    expect(within(list).getByText('Reading…')).toBeVisible();
    expect(within(list).queryByRole('button', { name: /cedar/ })).toBeNull();
    expect(within(d).getByText('Read just now.')).toBeVisible();
  });

  it('each part opens to its exact text; the instructions open to theirs', async () => {
    render(<Ask reads={PARTS} />);
    const d = await open();
    await userEvent.click(within(d).getByRole('button', { name: 'atlas: access rules' }));
    expect(within(d).getByRole('figure', { name: 'atlas: access rules' }).querySelector('pre')?.textContent).toBe(PARTS[1]!.text);
    await userEvent.click(within(d).getByRole('button', { name: strings['aa.requestExact'] }));
    expect(within(d).getByRole('figure', { name: strings['aa.requestExact'] }).querySelector('pre')?.textContent).toBe(QUESTION);
  });

  it('shown = sent: Explain sends the instructions and the parts\' texts in order, under the title and the context label', async () => {
    render(<Ask reads={PARTS} />);
    const d = await open();
    await userEvent.click(within(d).getByRole('button', { name: strings['aa.explain'] }));
    let draft: ReturnType<AskDock['takeDraft']>;
    act(() => { draft = dock!.takeDraft(C.id); });
    expect(draft!.start).toBe(true);
    expect(parseAskMessage(draft!.text)).toEqual({ title: REQUEST.title, text: QUESTION, context: CONTEXT, contextLabel: 'access rules of 2 computers' });
  });

  it('a context given as one text is shown whole and open (no fold to press)', async () => {
    render(<Ask reads="rules: none" />);
    const d = await open();
    expect(within(d).getByRole('figure', { name: strings['aa.reads'] }).querySelector('pre')?.textContent).toBe('rules: none');
    expect(within(d).queryByRole('button', { name: strings['aa.reads'] })).toBeNull();
  });
});
