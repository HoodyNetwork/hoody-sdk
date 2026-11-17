// The Computers list's "Ask the Agent" about access: how the rules combine, what was left out and the exact instructions
// are sentences, so the drawer draws them as paragraphs; each computer's rules stay a listing in the monospace box.
// Display only: Copy and what Explain sends are the texts as they are.
import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dropAskDraft, parseAskMessage, useAskDock } from '@kit/ask';
import { act, renderHook, renderPage, screen, userEvent, within } from '@app/testing';
import { AskAgentButton } from '@kit';
import ask from '@kit/widgets/AskAgent.strings.en.json';
import { computers, resetAccess } from './fixtures';
import page from './page';
import { resetAccessAsks, useExplainAll } from './parts/AccessDrawer';
import { EXPLAIN_ALL_QUESTION, realmSnapshotOf } from './parts/access.logic';
import strings from './parts/AccessDrawer.strings.en.json';
import type { Computer } from './types';

const SLOW = { timeout: 8000 };
async function mount(el: ReactElement) {
  await renderPage({ ...page, load: () => Promise.resolve({ default: () => el }) });
}
const settle = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
function ExplainAllAccess({ computers: list }: { computers: readonly Computer[] }) {
  const a = useExplainAll(list);
  return <><AskAgentButton ask={a} />{a.drawer}</>;
}
/** Copy is the fold row's trailing action: the one Copy button of the row holding this fold's trigger. */
const copyOf = (d: HTMLElement, name: string | RegExp) => {
  const row = within(d).getByRole('button', { name }).closest('[data-row-fold]')?.parentElement;
  if (!row) throw new Error('no fold row');
  return userEvent.click(within(row).getByRole('button', { name: ask['aa.copyText'] }));
};

let written: string[] = [];
beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (text: string) => (written.push(text), Promise.resolve()) } });
});
afterEach(() => {
  act(() => dropAskDraft());
  resetAccess();
  resetAccessAsks();
});

describe('computers list: Ask the Agent draws its prose as paragraphs', () => {
  it('how the rules combine and the instructions are paragraphs; a computer\'s rules keep the box; Copy and the send are exact', async () => {
    const list = computers.slice(0, 2);
    await mount(<ExplainAllAccess computers={list} />);
    await userEvent.click(await screen.findByRole('button', { name: /^Ask the Agent/ }, SLOW));
    const d = await screen.findByRole('dialog');
    // A title short enough for a phone's drawer head.
    expect(within(d).getByRole('heading', { name: 'Ask the Agent about access' })).toBeInTheDocument();
    const parts = await within(d).findByRole('list', { name: ask['aa.reads'] }, SLOW);
    await userEvent.click(await within(parts).findByRole('button', { name: strings['acc.agent.partHow'] }, SLOW));
    const how = within(parts).getByRole('figure', { name: strings['acc.agent.partHow'] });
    expect(how.querySelector('pre')).toBeNull();
    const paragraphs = [...how.querySelectorAll('p')].map((p) => p.textContent ?? '');
    // The opening line and the three ways the rules combine, one paragraph each.
    expect(paragraphs).toHaveLength(4);
    expect(paragraphs[0]).toMatch(/^Access rules of the computers in this realm/);
    expect(paragraphs[3]).toMatch(/^Logs: /);
    // The part is the snapshot's own head, unchanged: the rule names ("*", "logs") stay as the Agent reads them.
    const head = realmSnapshotOf([]).text;
    expect(paragraphs.join('\n')).toBe(head);
    await copyOf(parts, strings['acc.agent.partHow']);
    expect(written[0]).toBe(paragraphs.join('\n'));
    // A computer's rules: the listing, character for character.
    await userEvent.click(within(parts).getByRole('button', { name: new RegExp(`^${list[0]!.name}:`) }));
    const rules = within(parts).getByRole('figure', { name: new RegExp(`^${list[0]!.name}:`) });
    const listing = rules.querySelector('pre')?.textContent ?? '';
    expect(listing).toContain(`Computer "${list[0]!.name}"`);
    // The instructions: two paragraphs, copied exactly.
    await userEvent.click(within(d).getByRole('button', { name: ask['aa.requestExact'] }));
    const instr = within(d).getByRole('figure', { name: ask['aa.requestExact'] });
    expect(instr.querySelector('pre')).toBeNull();
    expect([...instr.querySelectorAll('p')].map((p) => p.textContent)).toEqual(EXPLAIN_ALL_QUESTION.split('\n'));
    await copyOf(d, ask['aa.requestExact']);
    expect(written[1]).toBe(EXPLAIN_ALL_QUESTION);
    // Explain sends the instructions and the rules as they are: the prose part's exact text starts the Context.
    await userEvent.click(within(d).getByRole('button', { name: ask['aa.explain'] }));
    const dock = renderHook(() => useAskDock()).result;
    for (let n = 0; n < 80 && !dock.current.draft; n++) await settle(50);
    const m = parseAskMessage(dock.current.draft?.text ?? '');
    expect(m.text).toBe(EXPLAIN_ALL_QUESTION);
    expect(m.context?.startsWith(`${written[0]}\n${listing}`)).toBe(true);
    // Sent bytes: the Context is the realm snapshot exactly as access.logic writes it, whatever the drawer draws.
    expect(m.context?.startsWith(`${head}\nComputer "${list[0]!.name}"`)).toBe(true);
  });
});
