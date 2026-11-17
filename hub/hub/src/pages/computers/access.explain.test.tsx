// "Ask the Agent" in the access drawer: its Explain starts a NEW Agent conversation with the rules as
// read. The question carries no credential (the fixture's password group), no whole id, the answer rules (only from the
// snapshot, "I'm not sure", quote the rule), and only one start goes at a time (the kit's hold, across closing).
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { dropAskDraft, parseAskMessage, useAskDock } from '@kit/ask';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { computers } from './fixtures';
import { EXPLAIN_QUESTION } from './parts/access.logic';
import { resetAccessAsks } from './parts/AccessDrawer';
import ask from '@kit/widgets/AskAgent.strings.en.json';
import { permissionsTesting } from './permissions.testing';
import strings from './parts/AccessDrawer.strings.en.json';

const { openPermissions } = permissionsTesting({ renderPage, screen, userEvent, waitFor });

const [, SECOND, THIRD] = computers;
if (!SECOND || !THIRD) throw new Error('fixture computers');
const SLOW = { timeout: 8000 };

async function openDrawer(c: (typeof computers)[number]) {
  await openPermissions(c);
  return openAsk();
}
/** Ask the Agent from the tab's "Who can open its programs" head (its own drawer, Explain first). */
async function openAsk() {
  const panel = await screen.findByRole('tabpanel', undefined, { timeout: 30000 });
  await userEvent.click(await within(panel).findByRole('button', { name: /^Ask the Agent/ }, SLOW));
  const d = await screen.findByRole('dialog', undefined, SLOW);
  await within(d).findByRole('button', { name: ask['aa.explain'] }, SLOW);
  return d;
}
let dock: { current: ReturnType<typeof useAskDock> } | null = null;
const draft = () => {
  dock ??= renderHook(() => useAskDock()).result;
  return dock.current.draft;
};

describe('computers: explain who can open with the Agent', () => {
  afterEach(() => {
    act(() => dropAskDraft());
    dock = null;
    resetAccessAsks();
  });

  it('a start that may have reached the Agent is remembered across closing: reopened, Explain is held and Look opens the panel', async () => {
    const d = await openDrawer(THIRD);
    await userEvent.click(await within(d).findByRole('button', { name: ask['aa.explain'] }, SLOW));
    expect(draft()?.start).toBe(true);
    // The panel took it, and its answer was lost: may have reached the Agent.
    let taken: ReturnType<ReturnType<typeof useAskDock>['takeDraft']>;
    act(() => { taken = dock!.current.takeDraft(); });
    act(() => taken?.onStart?.('unknown'));
    await within(d).findByText(ask['aa.unknown']);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), SLOW);
    // Back on the rules (the Agent drawer closed); the ask still holds the question.
    expect(screen.getByRole('tabpanel', { hidden: true })).not.toHaveTextContent(ask['aa.unknown']);
    const d2 = await openAsk();
    await within(d2).findByText(ask['aa.unknown'], undefined, SLOW);
    expect(within(d2).getByRole('button', { name: ask['aa.explain'] })).toBeDisabled();
    act(() => dock!.current.close());
    expect(dock!.current.isOpen).toBe(false);
    await userEvent.click(within(d2).getByRole('button', { name: ask['aa.look'] }));
    expect(draft()).toBeUndefined();
    expect(dock!.current.isOpen).toBe(true);
  });

  it('starts a new conversation with the rules, never a password or a whole id, with the answer rules', async () => {
    const d = await openDrawer(SECOND);
    await userEvent.click(await within(d).findByRole('button', { name: ask['aa.explain'] }, SLOW));
    const q = draft();
    expect(q?.start).toBe(true);
    expect(q?.source).toBe(strings['acc.explainSource']);
    // The message opens with its one-line request (what the thread shows); the question and the rules go with it, whole.
    const parts = parseAskMessage(q?.text ?? '');
    expect(parts.title).toBe(strings['acc.agent.oneTitle'].replace('{{name}}', SECOND.name));
    expect(parts.contextLabel).toBe(strings['acc.agent.oneContext'].replace('{{name}}', SECOND.name));
    expect(parts.text).toBe(EXPLAIN_QUESTION);
    expect(parts.context).toContain('"terminal"');
    const text = q?.text ?? '';
    expect(text).toContain('"terminal"');
    expect(text).toContain('password');
    expect(text).not.toContain('fixture-password-not-shown');
    expect(text).not.toContain(SECOND.id);
    expect(text).not.toContain(SECOND.project_id);
    expect(text).not.toContain('hooks.example');
    expect(text).toMatch(/I'm not sure/);
    expect(text).toMatch(/[Qq]uote/);
  });

  it('one start at a time: a second press while the first is out starts nothing new', async () => {
    const d = await openDrawer(THIRD);
    const b = await within(d).findByRole('button', { name: ask['aa.explain'] }, SLOW);
    await userEvent.click(b);
    const first = draft();
    await userEvent.click(b);
    expect(draft()).toBe(first);
  });

  it('a start that did not reach the Agent says so and lets the person ask again', async () => {
    const d = await openDrawer(THIRD);
    await userEvent.click(await within(d).findByRole('button', { name: ask['aa.explain'] }, SLOW));
    expect(draft()?.start).toBe(true);
    // The dock let go of it untaken (closed before a computer took it): the kit tells the page it was not sent.
    act(() => dropAskDraft());
    await within(d).findByText(ask['aa.notSent']);
    // Asking again is a new start: the line clears (one start was out, it ended).
    await userEvent.click(within(d).getByRole('button', { name: ask['aa.explain'] }));
    expect(d).not.toHaveTextContent(ask['aa.notSent']);
  });
});
