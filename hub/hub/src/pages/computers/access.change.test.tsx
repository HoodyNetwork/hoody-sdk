// "Tell the Agent what you want": the drawer starts a NEW Agent conversation with the person's request and the
// rules as read. Nothing secret or a whole id goes with it, a request that is too long or looks like a password is
// never sent, and once a request may have reached the Agent the drawer reads the rules again and says when they moved.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dropAskDraft, splitAskContext, useAskDock } from '@kit/ask';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { accessAddElsewhere, accessReadCount, computers, resetAccess } from './fixtures';
import { CHANGE_MAX } from './parts/access.logic';
import { makeSecret } from './parts/access.picked';
import { resetAccessAsks } from './parts/AccessDrawer';
import ask from '@kit/widgets/AskAgent.strings.en.json';
import { permissionsTesting } from './permissions.testing';
import strings from './parts/AccessDrawer.strings.en.json';

const { openPermissions, tabPanel } = permissionsTesting({ renderPage, screen, userEvent, waitFor });

const [, SECOND] = computers;
if (!SECOND) throw new Error('fixture computers');
const SLOW = { timeout: 8000 };
const QUICK = { timeout: 2500 };
const ASK = 'only my office IP 203.0.113.7 can open the terminal';

async function openDrawer(c: (typeof computers)[number]) {
  await openPermissions(c);
  return openAsk();
}
/** Ask the Agent from the tab's "Who can open its programs" head: its drawer, Explain, then "Tell the Agent what you want". */
async function openAsk() {
  const panel = await screen.findByRole('tabpanel', undefined, { timeout: 30000 });
  await userEvent.click(await within(panel).findByRole('button', { name: /^Ask the Agent/ }, SLOW));
  const d = await screen.findByRole('dialog', undefined, SLOW);
  await within(d).findByRole('button', { name: ask['aa.explain'] }, SLOW);
  return d;
}
async function write(d: HTMLElement, text: string) {
  const box = await within(d).findByRole('textbox', { name: strings['acc.change'] }, SLOW);
  await userEvent.click(box);
  await userEvent.paste(text);
  return box;
}
let dock: { current: ReturnType<typeof useAskDock> } | null = null;
const theDock = () => (dock ??= renderHook(() => useAskDock()).result);
const draft = () => theDock().current.draft;
function answer(o: 'sent' | 'unknown') {
  const d = theDock();
  let taken: ReturnType<ReturnType<typeof useAskDock>['takeDraft']>;
  act(() => { taken = d.current.takeDraft(); });
  act(() => taken?.onStart?.(o));
  return (later: 'sent' | 'unknown') => act(() => taken?.onStart?.(later));
}

describe('computers: change who can open with the Agent', () => {
  beforeEach(() => resetAccess());
  afterEach(() => {
    act(() => dropAskDraft());
    dock = null;
    resetAccessAsks();
  });

  it('starts a new conversation with the request first, the tools that ask before each write, and the rules as read, never a password or a whole id', async () => {
    const d = await openDrawer(SECOND);
    await write(d, `${ASK} on ${SECOND.id}`);
    await userEvent.click(within(d).getByRole('button', { name: ask['aa.send'] }));
    const q = draft();
    expect(q?.start).toBe(true);
    expect(q?.source).toBe(strings['acc.explainSource']);
    const parts = splitAskContext(q?.text ?? '');
    // Bound to the drawer's computer, not the one shown as current elsewhere: the Agent's tools act on it.
    expect(computers[0]?.id).not.toBe(SECOND.id);
    expect(q?.computer).toBe(SECOND.id);
    expect(parts.text.startsWith(ASK)).toBe(true);
    expect(parts.text).toContain('hoody_proxy_permissions_set');
    expect(parts.context).toContain('"terminal"');
    const text = q?.text ?? '';
    expect(text).not.toContain('fixture-password-not-shown');
    expect(text).not.toContain(SECOND.id);
    expect(text).not.toContain(SECOND.project_id);
  });

  it('a request over the limit says so and sends nothing; it is never cut', async () => {
    const d = await openDrawer(SECOND);
    await write(d, 'x'.repeat(CHANGE_MAX + 1));
    await within(d).findByText(strings['acc.change.long'].replace('{{max}}', String(CHANGE_MAX)));
    await userEvent.click(within(d).getByRole('button', { name: ask['aa.send'] }));
    expect(draft()).toBeUndefined();
  });

  it('a request holding something that looks like a password or key link says so and sends nothing', async () => {
    const d = await openDrawer(SECOND);
    await write(d, `add a password group with ${makeSecret(20)}`);
    await within(d).findByText(strings['acc.change.secret']);
    await userEvent.click(within(d).getByRole('button', { name: ask['aa.send'] }));
    expect(draft()).toBeUndefined();
  });

  it('an empty request sends nothing', async () => {
    const d = await openDrawer(SECOND);
    await write(d, '   ');
    await userEvent.click(within(d).getByRole('button', { name: ask['aa.send'] }));
    expect(draft()).toBeUndefined();
  });

  it('once sent, the drawer reads the rules again when the window comes back and says they moved', async () => {
    const d = await openDrawer(SECOND);
    await write(d, ASK);
    await userEvent.click(within(d).getByRole('button', { name: ask['aa.send'] }));
    answer('sent');
    await within(tabPanel()).findByText(strings['acc.change.watching']);
    expect(tabPanel()).not.toHaveTextContent(strings['acc.change.moved']);
    // The Agent's approved write lands on the API.
    accessAddElsewhere(SECOND.id, 'agent-made');
    act(() => { window.dispatchEvent(new Event('focus')); });
    // Sooner than the drawer's own re-read every few seconds: this read is the one asked for.
    await within(tabPanel()).findByText(strings['acc.change.moved'], undefined, QUICK);
  });

  it('once sent, the drawer reads the rules again by itself while it is open', async () => {
    const d = await openDrawer(SECOND);
    await write(d, ASK);
    await userEvent.click(within(d).getByRole('button', { name: ask['aa.send'] }));
    answer('sent');
    accessAddElsewhere(SECOND.id, 'agent-made');
    await within(tabPanel()).findByText(strings['acc.change.moved'], undefined, { timeout: 12000 });
  }, 20000);

  it('Read the rules again reads them at once', async () => {
    const d = await openDrawer(SECOND);
    await write(d, ASK);
    await userEvent.click(within(d).getByRole('button', { name: ask['aa.send'] }));
    answer('sent');
    accessAddElsewhere(SECOND.id, 'agent-made');
    await userEvent.click(await within(tabPanel()).findByRole('button', { name: strings['acc.change.check'] }));
    // Sooner than the drawer's own re-read every few seconds: this read is the one asked for.
    await within(tabPanel()).findByText(strings['acc.change.moved'], undefined, QUICK);
  });

  it('a request that may have reached the Agent is never called not sent, is watched, and cannot be sent twice: Look opens the panel', async () => {
    const d = await openDrawer(SECOND);
    await write(d, ASK);
    await userEvent.click(within(d).getByRole('button', { name: ask['aa.send'] }));
    answer('unknown');
    await within(d).findByText(ask['aa.unknown']);
    expect(d).not.toHaveTextContent(ask['aa.notSent']);
    await within(tabPanel()).findByText(strings['acc.change.watching']);
    expect(within(d).getByRole('button', { name: ask['aa.send'] })).toBeDisabled();
    act(() => theDock().current.close());
    await userEvent.click(within(d).getByRole('button', { name: ask['aa.look'] }));
    expect(draft()).toBeUndefined();
    expect(theDock().current.isOpen).toBe(true);
  });

  it('a request that did not reach the Agent says so, keeps the text, and the drawer does not watch', async () => {
    const d = await openDrawer(SECOND);
    const box = await write(d, ASK);
    await userEvent.click(within(d).getByRole('button', { name: ask['aa.send'] }));
    act(() => dropAskDraft());
    await within(d).findByText(ask['aa.notSent']);
    expect(box).toHaveValue(ASK);
    expect(tabPanel()).not.toHaveTextContent(strings['acc.change.watching']);
  });

  it('an Explain that may have reached the Agent starts no watch, and holds Send too: one question at a time', async () => {
    const d = await openDrawer(SECOND);
    await write(d, ASK);
    await userEvent.click(within(d).getByRole('button', { name: ask['aa.explain'] }));
    answer('unknown');
    await within(d).findByText(ask['aa.unknown']);
    expect(tabPanel()).not.toHaveTextContent(strings['acc.change.watching']);
    expect(within(d).getByRole('button', { name: ask['aa.send'] })).toBeDisabled();
  });
  it("Explain in the drawer is bound to the drawer's computer too", async () => {
    const d = await openDrawer(SECOND);
    await userEvent.click(await within(d).findByRole('button', { name: ask['aa.explain'] }, SLOW));
    expect(draft()?.computer).toBe(SECOND.id);
  });

  it('after a request that may have reached the Agent, the drawer reopened keeps the words and the hold: Look opens the panel', async () => {
    const d = await openDrawer(SECOND);
    await write(d, ASK);
    await userEvent.click(within(d).getByRole('button', { name: ask['aa.send'] }));
    answer('unknown');
    act(() => theDock().current.close());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), SLOW);
    const d2 = await openAsk();
    await within(d2).findByText(ask['aa.unknown'], undefined, SLOW);
    // The words stay (a definite "sent" alone clears them), and nothing can be asked until the question is let go.
    expect(within(d2).getByRole('textbox', { name: strings['acc.change'] })).toHaveValue(ASK);
    expect(within(d2).getByRole('button', { name: ask['aa.send'] })).toBeDisabled();
    await userEvent.click(within(d2).getByRole('button', { name: ask['aa.look'] }));
    expect(draft()).toBeUndefined();
    expect(theDock().current.isOpen).toBe(true);
  });

  it('a press that only opens the panel never moves what the first request watches from', async () => {
    const d = await openDrawer(SECOND);
    await write(d, ASK);
    await userEvent.click(within(d).getByRole('button', { name: ask['aa.send'] }));
    const later = answer('unknown');
    accessAddElsewhere(SECOND.id, 'agent-made');
    act(() => { window.dispatchEvent(new Event('focus')); });
    await within(tabPanel()).findByText(strings['acc.change.moved'], undefined, QUICK);
    // Look pressed on the newer rules: the panel opens, nothing is asked; the first request then reads as sent.
    await userEvent.click(within(d).getByRole('button', { name: ask['aa.look'] }));
    later('sent');
    expect(draft()).toBeUndefined();
    expect(within(d).getByText(strings['acc.change.moved'])).toBeInTheDocument();
  });

  it('the watch ends after its time: nothing reads or says it any more', async () => {
    const d = await openDrawer(SECOND);
    await write(d, ASK);
    await userEvent.click(within(d).getByRole('button', { name: ask['aa.send'] }));
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    try {
      answer('sent');
      await within(tabPanel()).findByText(strings['acc.change.watching']);
      act(() => { vi.advanceTimersByTime(15 * 60_000 + 1); });
      await waitFor(() => expect(tabPanel()).not.toHaveTextContent(strings['acc.change.watching']));
      // Settled: no read is out. Coming back to the window, or waiting, reads nothing.
      act(() => { vi.advanceTimersByTime(2_000); });
      const reads = accessReadCount.n;
      accessAddElsewhere(SECOND.id, 'agent-made');
      act(() => { window.dispatchEvent(new Event('focus')); });
      act(() => { vi.advanceTimersByTime(10_000); });
      expect(accessReadCount.n).toBe(reads);
      expect(tabPanel()).not.toHaveTextContent(strings['acc.change.moved']);
    } finally {
      vi.useRealTimers();
    }
  });
});
