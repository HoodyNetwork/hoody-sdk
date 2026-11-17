// "Ask the Agent" in one computer's access drawer lists what the Agent reads in two parts: how the rules combine
// (sentences, drawn as paragraphs) and the documents (a listing, in the monospace box). Display only: joined with a line
// break the two parts are the snapshot, and Explain sends exactly that snapshot.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dropAskDraft, parseAskMessage, useAskDock } from '@kit/ask';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { computers } from './fixtures';
import { EXPLAIN_QUESTION, projectSnapshotOf, realmSnapshotOf, rulesFrom, snapshotOf, snapshotParts } from './parts/access.logic';
import { resetAccessAsks } from './parts/AccessDrawer';
import ask from '@kit/widgets/AskAgent.strings.en.json';
import { permissionsTesting } from './permissions.testing';
import strings from './parts/AccessDrawer.strings.en.json';

const { openPermissions } = permissionsTesting({ renderPage, screen, userEvent, waitFor });
const [, SECOND] = computers;
if (!SECOND) throw new Error('fixture computers');
const SLOW = { timeout: 8000 };
const RULES = { data: { file_version: 2, groups: { team: { type: 'ip', range: '203.0.113.0/24' } }, permissions: { team: { terminal: true } }, default: 'deny' } };

let written: string[] = [];
beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (text: string) => (written.push(text), Promise.resolve()) } });
});
afterEach(() => {
  act(() => dropAskDraft());
  resetAccessAsks();
});

describe('computers: one computer\'s snapshot in parts', () => {
  it('joined by a line break the parts are the snapshot, character for character; sentences first, then the documents', () => {
    const r = rulesFrom(RULES)!;
    for (const project of ['yes', 'no', 'unknown'] as const) {
      const { text } = snapshotOf({ name: 'blog: "x"', rules: r, project });
      const parts = snapshotParts(text);
      expect(parts.map((p) => p.k)).toEqual(['how', 'documents']);
      expect(parts.map((p) => p.text).join('\n')).toBe(text);
      expect(parts[1]!.text.startsWith('Computer document:\n')).toBe(true);
    }
    // Cut before its documents: one listing part, as before.
    const cut = snapshotOf({ name: 'blog', rules: r, project: 'no' }, 400).text;
    expect(snapshotParts(cut)).toEqual([{ k: 'documents', text: cut }]);
    // Other snapshots have no "Computer document:" line of their own at the start of a line before their documents.
    expect(snapshotParts(realmSnapshotOf([{ name: 'a', rules: r, project: 'no' }]).text)).toHaveLength(1);
    expect(snapshotParts(projectSnapshotOf('p', r, []).text)).toHaveLength(1);
  });

  it('the drawer lists the two parts; the sentences read as paragraphs, the documents as a listing; Explain sends them joined, unchanged', async () => {
    await openPermissions(SECOND);
    const panel = await screen.findByRole('tabpanel', undefined, { timeout: 30000 });
    await userEvent.click(await within(panel).findByRole('button', { name: /^Ask the Agent/ }, SLOW));
    const d = await screen.findByRole('dialog', undefined, SLOW);
    const list = await within(d).findByRole('list', { name: ask['aa.reads'] }, SLOW);
    const rulesTitle = strings['acc.agent.partRules'].replace('{{name}}', SECOND.name);
    // Two parts, in order (a closed part keeps its text in the page, hidden: compare by the part's button, not its text).
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByRole('button', { name: strings['acc.agent.partHow'] })).toBeInTheDocument();
    expect(within(items[1]!).getByRole('button', { name: rulesTitle })).toBeInTheDocument();
    await userEvent.click(within(list).getByRole('button', { name: strings['acc.agent.partHow'] }));
    const how = within(list).getByRole('figure', { name: strings['acc.agent.partHow'] });
    expect(how.querySelector('pre')).toBeNull();
    const paragraphs = [...how.querySelectorAll('p')].map((p) => p.textContent ?? '');
    expect(paragraphs[0]).toMatch(/^Access rules of computer /);
    expect(paragraphs[1]).toMatch(/^The Hub reads this as: /);
    expect(paragraphs.at(-1)).toMatch(/^Logs: /);
    // Copy of this fold (in its row; the text holds no other button).
    const row = within(list).getByRole('button', { name: strings['acc.agent.partHow'] }).closest('[data-row-fold]')?.parentElement as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: ask['aa.copyText'] }));
    await userEvent.click(within(list).getByRole('button', { name: rulesTitle }));
    const listing = within(list).getByRole('figure', { name: rulesTitle }).querySelector('pre')?.textContent ?? '';
    expect(listing.startsWith('Computer document:\n')).toBe(true);
    expect(written[0]).toBe(paragraphs.join('\n'));
    await userEvent.click(within(d).getByRole('button', { name: ask['aa.explain'] }));
    const dock = renderHook(() => useAskDock()).result;
    await waitFor(() => expect(dock.current.draft).toBeDefined(), SLOW);
    const m = parseAskMessage(dock.current.draft?.text ?? '');
    expect(m.text).toBe(EXPLAIN_QUESTION);
    expect(m.context).toBe(`${written[0]}\n${listing}`);
  });
});
