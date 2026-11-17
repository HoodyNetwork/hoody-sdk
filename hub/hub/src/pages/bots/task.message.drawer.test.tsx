// Vitest: the message form hands the Bot exactly one text, led by the task, and offers no second send while the first is unknown.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, userEvent, within } from '@app/testing';
import { CoreQueryProvider } from '@core';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Change, Delegate, TaskMessageAnswer } from './data';
import { MessageTaskDrawer } from './parts/MessageTask';
import strings from './strings.en.json';
import voice from './voice/voiceWords.strings.en.json';

afterEach(() => cleanup());

const TASK: Delegate = { sessionId: '9a1be4c07d2f4c11', title: 'Read deploy log', state: 'working', computerId: 'c1', model: 'm', waitingOn: null, startedAt: 'x' };
type Send = Change<TaskMessageAnswer, { sessionId: string; text: string }>;
const fake = (over: Partial<Send> = {}): Send & { run: ReturnType<typeof vi.fn> } => ({
  run: vi.fn(async () => ({ outcome: 'done' as const, data: { queued: false } })),
  outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false,
  readBack: vi.fn(async () => false), dismiss: vi.fn(), reset: vi.fn(),
  ...over,
}) as Send & { run: ReturnType<typeof vi.fn> };

async function show(ui: ReactNode): Promise<void> {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <>{ui}</> }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
}

describe('the message form', () => {
  it('sends the words once, led by the task and its session', async () => {
    const send = fake();
    await show(<MessageTaskDrawer task={TASK} onClose={() => undefined} send={send} />);
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox', { name: strings['task.msgLabel'] }), 'raise the limit');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['task.msgSend'] }));
    expect(send.run).toHaveBeenCalledTimes(1);
    expect(send.run).toHaveBeenCalledWith({ sessionId: '9a1be4c07d2f4c11', text: 'For the task “Read deploy log” (session 9a1be4c07d2f4c11): raise the limit' });
  });

  it('while the first is unknown it says so, offers Check and Dismiss, and cannot send again', async () => {
    const send = fake({ outcome: 'pending' });
    await show(<MessageTaskDrawer task={TASK} onClose={() => undefined} send={send} />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(strings['task.msgMaybe'])).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: strings['task.msgLabel'] })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: strings['task.msgSend'] })).toBeDisabled();
    expect(send.run).not.toHaveBeenCalled();
  });

  it('a refusal says the message was not sent', async () => {
    await show(<MessageTaskDrawer task={TASK} onClose={() => undefined} send={fake({ outcome: 'failed' })} />);
    expect(await screen.findByText(strings['task.msgFailed'])).toBeInTheDocument();
  });

  it('a message the Bot dropped says it was not sent, in the words for its reason; never "Sent", and Send stays offered', async () => {
    const send = fake({ outcome: 'done', data: { queued: false, dropped: 'access_revoked' } });
    await show(<MessageTaskDrawer task={TASK} onClose={() => undefined} send={send} />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(voice['textDropped.access_revoked'])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['task.msgSent'])).toBeNull();
    await userEvent.type(within(dialog).getByRole('textbox', { name: strings['task.msgLabel'] }), 'again');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['task.msgSend'] }));
    expect(send.run).toHaveBeenCalledTimes(1);
  });

  it('a dropped message with a reason the Hub does not know still says it was not sent', async () => {
    await show(<MessageTaskDrawer task={TASK} onClose={() => undefined} send={fake({ outcome: 'done', data: { queued: false, dropped: 'something_new' } })} />);
    expect(await screen.findByText(voice['textDropped.other'])).toBeInTheDocument();
    expect(screen.queryByText(strings['task.msgSent'])).toBeNull();
  });

  it('while the Bot waits on its approval, the form says before Send that sending declines it; not otherwise', async () => {
    await show(<MessageTaskDrawer task={TASK} onClose={() => undefined} send={fake()} declines />);
    expect(await screen.findByText(strings['say.declines'])).toBeInTheDocument();
    cleanup();
    await show(<MessageTaskDrawer task={TASK} onClose={() => undefined} send={fake()} />);
    await screen.findByRole('dialog');
    expect(screen.queryByText(strings['say.declines'])).toBeNull();
  });

  it('a busy Bot queues it, and the form says so', async () => {
    await show(<MessageTaskDrawer task={TASK} onClose={() => undefined} send={fake({ outcome: 'done', data: { queued: true } })} />);
    expect(await screen.findByText(strings['task.msgQueued'])).toBeInTheDocument();
  });
});
