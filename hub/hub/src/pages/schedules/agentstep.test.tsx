// Vitest: with Ask on, New schedule's "Agent timer or loop" is a step of the drawer, never a trip to another page.
// Its box starts with the shared schedule prompt; the shared examples fill it; Back to the chooser and in again keeps the words.
// Send starts a NEW Agent conversation with the words (C9, the kit's outcome line in the footer): sent closes the drawer, not sent
// keeps the words, a start that may have reached the agent is never sent again (its Check again opens the panel). "Write it in the
// Agent panel instead" puts the words in the panel's composer, not sent. The drawer never holds the person while a start waits for
// the panel: closing is theirs, and a start that then did not leave is told in a toast whose way puts the words in the
// panel; a start's later word never reaches a drawer opened after it. Closing asks before it drops kept words; focus follows the step.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { capture, chooseComputer, fixtureWorld } from '@core';
import { setAskForFixtures, useAskDock } from '@kit';
import scheduleAsk from '@kit/scheduleAsk.strings.en.json';
import formStrings from '@kit/forms/forms.strings.en.json';
import kitStrings from '@kit/strings.en.json';
import page from './page';
import { ASK_EXAMPLES } from './parts/Editor';
import strings from './strings.en.json';

const PROMPT = scheduleAsk.prompt;
const EXAMPLES: string[] = ASK_EXAMPLES.map((id) => scheduleAsk[`ex.${id}`]);
// Read outside act(): a hook rendered inside act() has not rendered yet (its result is still null).
const dock = () => renderHook(() => useAskDock()).result.current;

// The toasts the page shows (a start that did not leave after its drawer closed).
const toasts = vi.hoisted(() => [] as Array<{ title: string; body?: string; tone?: string; action?: { label: string; onAction: () => unknown } }>);
vi.mock('@kit', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  showToast: (c: (typeof toasts)[number]) => { toasts.push(c); return 'toast-1'; },
}));

beforeEach(() => { setAskForFixtures(true); toasts.length = 0; });
afterEach(() => {
  // No panel is drawn here to take a draft: close drops a start nobody took, and the rest is taken, so the next test starts clean.
  const d = dock();
  act(() => { d.close(); d.takeDraft(); });
  setAskForFixtures(false);
});

/** The drawer on its agent step, from New schedule's chooser. */
async function toAgent() {
  const r = await renderPage(page, { path: '/schedules?edit=new' });
  await userEvent.click(await screen.findByRole('button', { name: new RegExp(strings['new.agent']) }));
  const drawer = await screen.findByRole('dialog', { name: strings['new.agentTitle'] });
  return { ...r, drawer, box: () => within(drawer).getByRole('textbox', { name: strings['new.agentWhat'] }) as HTMLTextAreaElement };
}
const sendButton = (drawer: HTMLElement) => within(drawer).getByRole('button', { name: strings['new.agentSend'] });

describe('schedules: the agent step', () => {
  it('stays on the page: the chooser offers the step (no "Opens" text), and the box starts with the shared prompt', async () => {
    const { router, box } = await toAgent();
    expect(router.state.location.pathname).toBe('/schedules');
    expect(box().value).toBe(PROMPT);
    expect(screen.queryByText(strings['new.agentGoBots'])).toBeNull();
    expect(dock().isOpen).toBe(false);
  });

  it('the chooser and the examples read the shared table: one wording on Schedules and AI', async () => {
    await renderPage(page, { path: '/schedules?edit=new' });
    const choice = await screen.findByRole('button', { name: new RegExp(strings['new.agent']) });
    expect(choice.textContent).toContain(`${PROMPT}${scheduleAsk['ex.backups']}`);
    await userEvent.click(choice);
    const drawer = await screen.findByRole('dialog', { name: strings['new.agentTitle'] });
    // Every example shown, in the table's order.
    expect(within(drawer).getAllByRole('button').map((b) => b.textContent ?? '').filter((n) => EXAMPLES.includes(n))).toEqual(EXAMPLES);
  });

  it('an example fills an untouched box; typed words are kept and the example follows them, once', async () => {
    const { drawer, box } = await toAgent();
    await userEvent.click(within(drawer).getByRole('button', { name: scheduleAsk['ex.disk'] }));
    expect(box().value).toBe(`${PROMPT}${scheduleAsk['ex.disk']}`);
    await userEvent.type(box(), ' and the swap');
    await userEvent.click(within(drawer).getByRole('button', { name: scheduleAsk['ex.logs'] }));
    await userEvent.click(within(drawer).getByRole('button', { name: scheduleAsk['ex.logs'] }));
    expect(box().value).toBe(`${PROMPT}${scheduleAsk['ex.disk']} and the swap\n\n${PROMPT}${scheduleAsk['ex.logs']}`);
  });

  it('Back to the chooser and in again keeps the words', async () => {
    const { drawer, box } = await toAgent();
    await userEvent.type(box(), 'every night at 2, clear the tmp folder');
    await userEvent.click(within(drawer).getByRole('button', { name: strings['new.back'] }));
    expect(await screen.findByText(strings['new.pick'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['new.agent']) }));
    const again = await screen.findByRole('dialog', { name: strings['new.agentTitle'] });
    expect((within(again).getByRole('textbox', { name: strings['new.agentWhat'] }) as HTMLTextAreaElement).value).toBe(`${PROMPT}every night at 2, clear the tmp folder`);
  });

  it('Send waits for words past the prompt, then starts a new Agent conversation with them; sent closes the drawer', async () => {
    const { router, drawer, box } = await toAgent();
    expect(sendButton(drawer)).toBeDisabled();
    await userEvent.type(box(), 'every day at 6, check the certificates');
    await userEvent.click(sendButton(drawer));
    const held = dock().draft;
    expect(held).toMatchObject({ text: `${PROMPT}every day at 6, check the certificates`, start: true, source: strings.title });
    expect(within(drawer).getByRole('button', { name: strings['new.agentSending'] })).toBeDisabled();
    expect(box()).toBeDisabled();
    // No Back while it is out: the step keeps its line.
    expect(within(drawer).queryByRole('button', { name: strings['new.back'] })).toBeNull();
    await act(async () => { held?.onStart?.('sent'); });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['new.agentTitle'] })).toBeNull());
    expect(router.state.location.pathname).toBe('/schedules');
  });

  it('not sent keeps the words and says so; Send is offered again', async () => {
    const { drawer, box } = await toAgent();
    await userEvent.type(box(), 'every day at 6, check the certificates');
    await userEvent.click(sendButton(drawer));
    // The panel took it and could not send it (a not sent start has always left the dock).
    const held = dock().draft;
    const taker = dock();
    act(() => { taker.takeDraft(held?.computer); });
    await act(async () => { held?.onStart?.('notSent'); });
    const line = within(drawer).getByText(strings['new.agentNotSent']).closest('[data-outcome]');
    expect(line).toHaveAttribute('data-outcome', 'not_sent');
    expect(line).toHaveTextContent(formStrings['outcome.notSent']);
    expect(box().value).toBe(`${PROMPT}every day at 6, check the certificates`);
    expect(sendButton(drawer)).toBeEnabled();
    // An edit says nothing more about the start that was not sent.
    await userEvent.type(box(), '!');
    expect(within(drawer).queryByText(strings['new.agentNotSent'])).toBeNull();
  });

  it('a start that may have reached the agent is never sent again: the button opens the panel instead', async () => {
    const { drawer, box } = await toAgent();
    await userEvent.type(box(), 'every day at 6, check the certificates');
    await userEvent.click(sendButton(drawer));
    // The panel took the start and then could not tell whether it went through.
    const held = dock().draft;
    const taker = dock();
    act(() => { taker.takeDraft(held?.computer); });
    await act(async () => { held?.onStart?.('unknown'); });
    expect(within(drawer).getByText(strings['new.agentUnknown']).closest('[data-outcome]')).toHaveAttribute('data-outcome', 'pending');
    expect(box().value).toBe(`${PROMPT}every day at 6, check the certificates`);
    expect(within(drawer).queryByRole('button', { name: strings['new.agentSend'] })).toBeNull();
    expect(within(drawer).queryByRole('button', { name: strings['new.agentPanel'] })).toBeNull();
    // The words stay as they may have been sent (read-only; the examples are off): closing drops nothing typed after them.
    expect(box()).toHaveAttribute('readonly');
    await userEvent.type(box(), ' again');
    expect(box().value).toBe(`${PROMPT}every day at 6, check the certificates`);
    for (const ex of EXAMPLES) expect(within(drawer).getByRole('button', { name: ex })).toBeDisabled();
    // Enter in the form sends nothing either.
    act(() => { box().form?.requestSubmit(); });
    expect(dock().draft).toBeUndefined();
    // Check again opens the panel on the conversation (one Check again: the footer's; the line's own is the same action).
    const checks = within(drawer).getAllByRole('button', { name: formStrings['outcome.check'] });
    await userEvent.click(checks[checks.length - 1]!);
    // The drawer gives way to the panel; nothing new is handed to it (a second start would be a new draft).
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['new.agentTitle'] })).toBeNull());
    expect(dock().isOpen).toBe(true);
    expect(dock().draft).toBeUndefined();
  });

  it('a start waiting for the panel never holds the drawer: Cancel closes it at once; one that then does not leave says so, its words one press from the panel', async () => {
    const { drawer, box } = await toAgent();
    await userEvent.type(box(), 'every day at 6, check the certificates');
    await userEvent.click(sendButton(drawer));
    const held = dock().draft;
    expect(held?.start).toBe(true);
    // The panel has not taken it (its open conversation still has a send on its way): the person may leave, nothing asks.
    await userEvent.click(within(drawer).getByRole('button', { name: formStrings['form.cancel'] }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['new.agentTitle'] })).toBeNull());
    expect(screen.queryByText(kitStrings['drawer.discardAsk'])).toBeNull();
    expect(dock().draft).toBe(held);
    expect(toasts).toEqual([]);
    // Then it ends without leaving (the panel took it and could not send it): the place is gone, so a toast says so.
    const taker = dock();
    act(() => { taker.takeDraft(held?.computer); });
    await act(async () => { held?.onStart?.('notSent'); });
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ body: strings['new.agentLateBody'], tone: 'error', action: { label: strings['new.agentLateGo'] } });
    // The title names the computer the start was for.
    expect(toasts[0]?.title.startsWith(strings['new.agentLate'].split('{{computer}}')[0]!)).toBe(true);
    expect(toasts[0]?.title).not.toMatch(/\{\{|on $/);
    // Another computer is shown by the time the person presses it: its one way shows the start's computer again and puts the
    // words in that computer's panel composer, not sent.
    const other = fixtureWorld.computers.find((c) => c.id !== held?.computer);
    await act(async () => { chooseComputer(other!); });
    expect(capture().target?.container.id).toBe(other?.id);
    act(() => { void toasts[0]?.action?.onAction(); });
    expect(capture().target?.container.id).toBe(held?.computer);
    const d = dock();
    expect(d.isOpen).toBe(true);
    expect(d.draft).toMatchObject({ text: `${PROMPT}every day at 6, check the certificates`, source: strings.title, computer: held?.computer });
    expect(held?.computer).toBeTruthy();
    expect(d.draft?.start).toBeFalsy();
  });

  it('after a start that may have reached the agent there is no Back, and its later word never closes the drawer opened after it', async () => {
    const { drawer, box } = await toAgent();
    await userEvent.type(box(), 'every day at 6, check the certificates');
    await userEvent.click(sendButton(drawer));
    const held = dock().draft;
    const taker = dock();
    act(() => { taker.takeDraft(held?.computer); });
    await act(async () => { held?.onStart?.('unknown'); });
    expect(within(drawer).queryByRole('button', { name: strings['new.back'] })).toBeNull();
    // The footer's Close lets it go (the panel keeps that conversation and its Check); no toast for it.
    // (The header's close buttons share the name; the footer's comes last.)
    const closes = within(drawer).getAllByRole('button', { name: formStrings['form.close'] });
    await userEvent.click(closes[closes.length - 1]!);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['new.agentTitle'] })).toBeNull());
    // A new schedule, on the command form: the earlier start going through later leaves it alone.
    await userEvent.click(screen.getAllByRole('button', { name: strings['action.new'] })[0]!);
    const chooser = await screen.findByRole('dialog', { name: strings['new.title'] });
    await userEvent.click(within(chooser).getByRole('button', { name: new RegExp(`^${strings['new.cmd']}`) }));
    const form = await screen.findByRole('dialog', { name: strings['ed.title.new'] });
    await act(async () => { held?.onStart?.('sent'); });
    expect(form).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: strings['ed.title.new'] })).toBe(form);
    expect(toasts).toEqual([]);
  });

  it('words kept across Back are not dropped without asking: closing the chooser asks first', async () => {
    const { drawer, box } = await toAgent();
    await userEvent.type(box(), 'every night at 2, clear the tmp folder');
    await userEvent.click(within(drawer).getByRole('button', { name: strings['new.back'] }));
    expect(await screen.findByText(strings['new.pick'])).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText(kitStrings['drawer.discardAsk'])).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: strings['new.title'] })).toBeInTheDocument();
  });

  // Back in the drawer (the page header has its own New schedule button).
  const back = async () => userEvent.click(within(screen.getAllByRole('dialog').at(-1)!).getByRole('button', { name: strings['new.back'] }));
  // One thing is made here, so a step that closes the drawer when done never drops the other's work.
  it('going from the agent words to a command asks first: Cancel keeps the words, going on drops them', async () => {
    const { drawer, box } = await toAgent();
    await userEvent.type(box(), 'every night at 2, clear the tmp folder');
    await userEvent.click(within(drawer).getByRole('button', { name: strings['new.back'] }));
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(`^${strings['new.cmd']}`) }));
    const ask = await screen.findByRole('alertdialog', { name: strings['new.leaveAgent'] });
    await userEvent.click(within(ask).getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByText(strings['new.pick']), 'Cancel stays on the chooser').toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['new.agent']) }));
    const again = await screen.findByRole('dialog', { name: strings['new.agentTitle'] });
    expect((within(again).getByRole('textbox', { name: strings['new.agentWhat'] }) as HTMLTextAreaElement).value, 'the words are kept').toBe(`${PROMPT}every night at 2, clear the tmp folder`);
    await userEvent.click(within(again).getByRole('button', { name: strings['new.back'] }));
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(`^${strings['new.cmd']}`) }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['new.leaveAgentGo'] }));
    expect(await screen.findByRole('textbox', { name: new RegExp(`^${strings['e.cmd']}`) }), 'on the command form').toBeInTheDocument();
    await back();
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(strings['new.agent']) }));
    expect(screen.queryByRole('alertdialog'), 'an untouched form asks nothing').toBeNull();
    const fresh = await screen.findByRole('dialog', { name: strings['new.agentTitle'] });
    expect((within(fresh).getByRole('textbox', { name: strings['new.agentWhat'] }) as HTMLTextAreaElement).value, 'the words were dropped').toBe(PROMPT);
  });

  it('going from a started command to the agent asks first; going on drops the command, and untouched words ask nothing', async () => {
    await renderPage(page, { path: '/schedules?edit=new' });
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(`^${strings['new.cmd']}`) }));
    expect(screen.queryByRole('alertdialog'), 'untouched agent words ask nothing').toBeNull();
    await userEvent.type(await screen.findByRole('textbox', { name: new RegExp(`^${strings['e.cmd']}`) }), 'rm -rf /tmp/cache');
    await back();
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(strings['new.agent']) }));
    const ask = await screen.findByRole('alertdialog', { name: strings['new.leaveCmd'] });
    await userEvent.click(within(ask).getByRole('button', { name: strings['new.leaveCmdGo'] }));
    const drawer = await screen.findByRole('dialog', { name: strings['new.agentTitle'] });
    await userEvent.click(within(drawer).getByRole('button', { name: strings['new.back'] }));
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(`^${strings['new.cmd']}`) }));
    expect(screen.queryByRole('alertdialog'), 'untouched words ask nothing').toBeNull();
    expect((await screen.findByRole('textbox', { name: new RegExp(`^${strings['e.cmd']}`) }) as HTMLInputElement).value, 'the command was dropped').toBe('');
  });

  it('a time typed but not yet a time is work too: going to the agent asks, Cancel keeps it, going on resets it', async () => {
    await renderPage(page, { path: '/schedules?edit=new' });
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(`^${strings['new.cmd']}`) }));
    const time = () => screen.getByRole('textbox', { name: new RegExp(`^${strings['ed.time']}`) }) as HTMLInputElement;
    const time0 = (await screen.findByRole('textbox', { name: new RegExp(`^${strings['ed.time']}`) }) as HTMLInputElement).value;
    await userEvent.clear(time());
    await userEvent.type(time(), '09:');
    await back();
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(strings['new.agent']) }));
    await userEvent.click(within(await screen.findByRole('alertdialog', { name: strings['new.leaveCmd'] })).getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${strings['new.cmd']}`) }));
    expect(time().value, 'Cancel keeps it').toBe('09:');
    await back();
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(strings['new.agent']) }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['new.leaveCmdGo'] }));
    const drawer = await screen.findByRole('dialog', { name: strings['new.agentTitle'] });
    await userEvent.click(within(drawer).getByRole('button', { name: strings['new.back'] }));
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(`^${strings['new.cmd']}`) }));
    expect(time().value, 'going on resets it').toBe(time0);
  });

  it('keyboard: entering the step puts focus in the box, caret at the end; Back puts it on the agent choice', async () => {
    const { drawer, box } = await toAgent();
    await waitFor(() => expect(box()).toHaveFocus());
    expect(box().selectionStart).toBe(PROMPT.length);
    await userEvent.keyboard('every hour');
    expect(box().value).toBe(`${PROMPT}every hour`);
    await userEvent.click(within(drawer).getByRole('button', { name: strings['new.back'] }));
    await waitFor(() => expect(screen.getByRole('button', { name: new RegExp(strings['new.agent']) })).toHaveFocus());
  });

  it('"Write it in the Agent panel instead" puts the words in the panel, not sent, and closes the drawer', async () => {
    const { drawer, box } = await toAgent();
    await userEvent.type(box(), 'every Friday, list the open ports');
    await userEvent.click(within(drawer).getByRole('button', { name: strings['new.agentPanel'] }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['new.agentTitle'] })).toBeNull());
    const d = dock();
    expect(d.isOpen).toBe(true);
    expect(d.draft).toMatchObject({ text: `${PROMPT}every Friday, list the open ports`, source: strings.title });
    expect(d.draft?.start).toBeFalsy();
  });
});
