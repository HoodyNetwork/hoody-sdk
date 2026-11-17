// A prose text the Agent reads (kind 'prose') is drawn for a person: one paragraph per line, in the body font, a short
// lead-in ("Logs:") in bold; a data text (the default) stays in the monospace box. Display only: Copy gives the text as it
// is, and what Explain sends is the same bytes whatever the kind.
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dropAskDraft, useAskDock, type AskDock } from '../ask';
import { AskAgentButton, resetAskAgentForTests, useAskAgent, type AgentReadPart } from './AskAgent';
import strings from './AskAgent.strings.en.json';

const C = { id: 'c'.repeat(24), name: 'atlas', status: 'running' };
const HOW = [
  'Access rules of the computers in this realm (who can open their programs through their web addresses).',
  'How the rules combine: the project\'s groups and the computer\'s add up.',
  'The computer\'s address switch and its "everyone not in a group" win when the computer sets them; otherwise the project\'s apply.',
  'Logs: a group gets logs only from its own "logs" rule, never from "*".',
].join('\n');
const RULES = 'Computer "atlas": Anyone with the address; project rules: no\n  version: 3\n  groups: none';
const QUESTION = 'Answer as a short Markdown list, with nothing before it. One bullet per computer in the Context: its name in bold.\nAnswer only from the snapshot in the Context below.';
const CONTEXT = `${HOW}\n${RULES}`;
const TITLE = 'Check who can open these computers';

let written: string[] = [];
let dock: AskDock | null = null;
function Probe() { dock = useAskDock(); return null; }
function Ask({ prose }: { prose: boolean }) {
  const reads: AgentReadPart[] = [
    { id: 'how', title: 'How access rules combine', text: HOW, ...(prose ? { kind: 'prose' as const } : {}) },
    { id: 'atlas', title: 'atlas: access rules', text: RULES, kind: 'data' },
  ];
  const a = useAskAgent({
    askKey: `prose:${prose}`, subject: 'access on your computers', source: 'Computers', computer: C,
    request: { title: TITLE, text: QUESTION, ...(prose ? { textKind: 'prose' as const } : {}) },
    reads,
    explain: { run: (send) => send({ text: QUESTION, context: CONTEXT, title: TITLE, contextLabel: 'access rules of 1 computer' }) },
  });
  return <><Probe /><AskAgentButton ask={a} />{a.drawer}</>;
}
async function open() {
  await userEvent.click(screen.getByRole('button', { name: strings['aa.name'].replace('{{subject}}', 'access on your computers') }));
  return screen.findByRole('dialog');
}
/** The Copy of a fold: the trailing action of the row whose trigger this is (beside the fold, never inside its text). */
function copyOf(trigger: HTMLElement): HTMLElement {
  const row = trigger.closest('[data-row-fold]')?.parentElement;
  if (!row) throw new Error('no fold row');
  // Exactly one Copy in the row, and it is the row's own child: beside the fold, not in its text.
  const copy = within(row).getByRole('button', { name: strings['aa.copyText'] });
  expect(copy.parentElement).toBe(row);
  return copy;
}
async function sent(prose: boolean): Promise<string> {
  render(<Ask prose={prose} />);
  const d = await open();
  await userEvent.click(within(d).getByRole('button', { name: strings['aa.explain'] }));
  let draft: ReturnType<AskDock['takeDraft']>;
  act(() => { draft = dock!.takeDraft(C.id); });
  return draft!.text;
}

beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (text: string) => (written.push(text), Promise.resolve()) } });
});
afterEach(() => { act(() => dropAskDraft()); cleanup(); dock = null; resetAskAgentForTests(); });

describe('Ask the Agent: prose drawn as paragraphs', () => {
  it('a prose part opens to one paragraph per line, no monospace box; a data part keeps its box', async () => {
    render(<Ask prose />);
    const d = await open();
    await userEvent.click(within(d).getByRole('button', { name: 'How access rules combine' }));
    const how = within(d).getByRole('figure', { name: 'How access rules combine' });
    expect(how.querySelector('pre')).toBeNull();
    const ps = [...how.querySelectorAll('p')];
    expect(ps).toHaveLength(4);
    expect(ps.map((p) => p.textContent)).toEqual(HOW.split('\n'));
    // A short lead-in is bold; a long one, or one holding a sentence, is not.
    expect([...how.querySelectorAll('strong')].map((s) => s.textContent)).toEqual(['How the rules combine:', 'Logs:']);
    await userEvent.click(within(d).getByRole('button', { name: 'atlas: access rules' }));
    expect(within(d).getByRole('figure', { name: 'atlas: access rules' }).querySelector('pre')?.textContent).toBe(RULES);
  });

  it('the exact instructions read as paragraphs too', async () => {
    render(<Ask prose />);
    const d = await open();
    await userEvent.click(within(d).getByRole('button', { name: strings['aa.requestExact'] }));
    const fig = within(d).getByRole('figure', { name: strings['aa.requestExact'] });
    expect(fig.querySelector('pre')).toBeNull();
    expect([...fig.querySelectorAll('p')].map((p) => p.textContent)).toEqual(QUESTION.split('\n'));
    // "One bullet per computer in the Context:" is a sentence, not a lead-in: nothing bold.
    expect(fig.querySelector('strong')).toBeNull();
  });

  it('Copy gives each text exactly as it is, line breaks included, from its fold row, open or closed', async () => {
    render(<Ask prose />);
    const d = await open();
    await userEvent.click(copyOf(within(d).getByRole('button', { name: 'How access rules combine' })));
    await userEvent.click(copyOf(within(d).getByRole('button', { name: strings['aa.requestExact'] })));
    await userEvent.click(within(d).getByRole('button', { name: 'atlas: access rules' }));
    await userEvent.click(copyOf(within(d).getByRole('button', { name: 'atlas: access rules' })));
    expect(written).toEqual([HOW, QUESTION, RULES]);
  });

  it('what Explain sends is byte for byte the same with or without the prose kind', async () => {
    const plain = await sent(false);
    act(() => dropAskDraft());
    cleanup();
    resetAskAgentForTests();
    const prose = await sent(true);
    expect(prose).toBe(plain);
    expect(prose).toContain(HOW);
    expect(prose).toContain(QUESTION);
  });
});

describe('Ask the Agent: the panel\'s structure', () => {
  it('two kit sub-sections in order, side by side (the kit draws the rule between them), each named by a heading', async () => {
    render(<Ask prose />);
    const d = await open();
    const req = within(d).getByRole('heading', { name: strings['aa.request'] });
    const reads = within(d).getByRole('heading', { name: strings['aa.reads'] });
    expect(req.tagName).toBe(reads.tagName);
    const a = req.closest('[data-hub-section="sub"]');
    const b = reads.closest('[data-hub-section="sub"]');
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).not.toBe(b);
    expect(b!.previousElementSibling).toBe(a);
    // The request's own title is plain text under its heading, not a heading of its own.
    expect(within(a as HTMLElement).getByText(TITLE).tagName).toBe('P');
    expect(within(a as HTMLElement).queryByRole('heading', { name: TITLE })).toBeNull();
  });

  it('an open text has no button inside it: Copy stays the fold row\'s', async () => {
    render(<Ask prose />);
    const d = await open();
    for (const name of ['How access rules combine', 'atlas: access rules', strings['aa.requestExact']]) {
      await userEvent.click(within(d).getByRole('button', { name }));
      expect(within(within(d).getByRole('figure', { name })).queryByRole('button')).toBeNull();
      expect(copyOf(within(d).getByRole('button', { name }))).toBeInTheDocument();
    }
  });
});
