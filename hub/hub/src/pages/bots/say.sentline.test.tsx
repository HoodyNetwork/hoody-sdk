// "Sent. The Bot is working on it." stands only while that is true. It goes on the first of: a read of the Bot made after
// the send answered that shows the message's turn over, or a thread row that names the message as answered (message_ids: the
// Bot's answer, an error, a provider failure or the step limit of its turn). A message that may have been sent keeps its banner.
import K from '@kit/forms/forms.strings.en.json';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Data from './data';
import type { BotView, LogKind, LogRow, SayAnswer, SayCheck } from './data';
import { logOf, viewOf } from './data';
import { Say, answeredIn } from './parts/Say';
import S from './strings.en.json';

const say = vi.hoisted(() => ({ held: false, answer: null as unknown, found: null as unknown }));
vi.mock('./voice/TalkHost', () => ({
  useTalkSlots: () => ({ mic: null, talk: null, band: null, captions: null, notes: [] }),
}));
vi.mock('./data', async (real) => ({
  ...(await real<typeof Data>()),
  useSay: () => ({
    send: async () => ({ outcome: 'done', data: say.answer }),
    held: say.held,
    // A found message frees its hold, as useSay.check does.
    check: async () => {
      say.held = false;
      return say.found;
    },
    checking: false,
    stopTracking: vi.fn(),
    sending: false,
  }),
}));

const KEY = 'c1~r1~chief';
const view = (over: Partial<BotView> = {}) => ({ name: 'Chief', gate: null, turnRunning: false, turnId: null, queued: 0, ...over }) as unknown as BotView;
const posted: SayAnswer = { messageId: 'm1', state: 'posted', turnId: 't1' };
/** A read of the Bot from before the send, and one made after it answered. */
const BEFORE = 1;
const after = () => Date.now() + 60_000;

interface At {
  rows?: readonly LogRow[];
  viewAt: number;
}
const el = (bot: BotView, at: At) => <Say bot={bot} botKey={KEY} rows={at.rows} viewAt={at.viewAt} />;
/** Sends "HI"; returns the rerender. */
async function sendHi(bot: BotView, at: At) {
  const r = render(el(bot, at));
  await userEvent.type(screen.getByRole('textbox', { name: S['say.label'] }), 'HI');
  await userEvent.click(screen.getByRole('button', { name: S['say.send'] }));
  return (b: BotView, a: At) => r.rerender(el(b, a));
}
/** A thread row; `ids` are the messages its turn answered (message_ids), `sid` the session it is about. */
const row = (seq: number, kind: LogKind, ids?: string[], sid?: string) => ({ seq, kind, messageIds: ids, sessionId: sid ?? null }) as LogRow;
/** The thread before the send: an older turn that answered m0. */
const OLD = [row(3, 'user'), row(4, 'bot', ['m0'], 's-bot')];

beforeEach(() => {
  say.held = false;
  say.answer = posted;
  say.found = null;
});

describe('the sent line under the thread', () => {
  it('stays on a read made after the answer that does not say whether a turn runs; a read that says none runs ends it', async () => {
    const again = await sendHi(view(), { rows: OLD, viewAt: BEFORE });
    expect(await screen.findByText(S['say.sent'])).toBeInTheDocument();
    // Missing, then malformed, then half: unknown, never "the turn ended".
    again(viewOf({ name: 'Chief' }, KEY), { rows: OLD, viewAt: after() });
    expect(screen.getByText(S['say.sent'])).toBeInTheDocument();
    again(viewOf({ name: 'Chief', turn_running: 'no', queued: '0' }, KEY), { rows: OLD, viewAt: after() });
    expect(screen.getByText(S['say.sent'])).toBeInTheDocument();
    again(viewOf({ name: 'Chief', turn_running: false }, KEY), { rows: OLD, viewAt: after() });
    expect(screen.getByText(S['say.sent'])).toBeInTheDocument();
    again(viewOf({ name: 'Chief', turn_running: false, queued: 0 }, KEY), { rows: OLD, viewAt: after() });
    expect(screen.queryByText(S['say.sent'])).toBeNull();
  });

  it('goes once the Bot has answered it in the thread, before any new read of the Bot (a quick answer)', async () => {
    const again = await sendHi(view(), { rows: OLD, viewAt: BEFORE });
    expect(await screen.findByText(S['say.sent'])).toBeInTheDocument();
    again(view(), { rows: [...OLD, row(5, 'user'), row(6, 'bot', ['m1'], 's-bot')], viewAt: BEFORE });
    expect(screen.queryByText(S['say.sent'])).toBeNull();
  });

  it('goes on the row that ends its turn: the answer, an error, a provider failure or the step limit, each naming the message', async () => {
    for (const kind of ['bot', 'error', 'provider', 'note'] as const) expect(answeredIn([...OLD, row(6, kind, ['m9', 'm1'])], 'm1')).toBe(true);
    expect(answeredIn(OLD, 'm1')).toBe(false);
    expect(answeredIn(undefined, 'm1')).toBe(false);
    const again = await sendHi(view(), { rows: OLD, viewAt: BEFORE });
    expect(await screen.findByText(S['say.sent'])).toBeInTheDocument();
    again(view(), { rows: [...OLD, row(5, 'user'), row(6, 'error', ['m1'], 's-bot')], viewAt: BEFORE });
    expect(screen.queryByText(S['say.sent'])).toBeNull();
  });

  it("stays while a helper is stopped or closes during the Bot's turn: those rows end the helper's work, not this turn", async () => {
    const again = await sendHi(view({ turnRunning: true, turnId: 't1' }), { rows: OLD, viewAt: BEFORE });
    expect(await screen.findByText(S['say.sent'])).toBeInTheDocument();
    const helper = [...OLD, row(5, 'user'), row(6, 'stop', undefined, 's-helper'), row(7, 'gone', undefined, 's-helper'), row(8, 'stop', undefined, 's-helper')];
    again(view({ turnRunning: true, turnId: 't1' }), { rows: helper, viewAt: BEFORE });
    expect(screen.getByText(S['say.sent'])).toBeInTheDocument();
    again(view({ turnRunning: true, turnId: 't1' }), { rows: [...helper, row(9, 'bot', ['m1'], 's-bot')], viewAt: BEFORE });
    expect(screen.queryByText(S['say.sent'])).toBeNull();
  });

  it('stays when the answer of the turn before it reaches the thread only after the send', async () => {
    const again = await sendHi(view({ turnRunning: true, turnId: 't1' }), { rows: OLD, viewAt: BEFORE });
    expect(await screen.findByText(S['say.sent'])).toBeInTheDocument();
    // Written before Send, read after it: it answered m8, not this message.
    again(view({ turnRunning: true, turnId: 't1' }), { rows: [...OLD, row(5, 'user'), row(6, 'bot', ['m8'], 's-bot'), row(7, 'user')], viewAt: BEFORE });
    expect(screen.getByText(S['say.sent'])).toBeInTheDocument();
  });

  it('goes on a read of the Bot made after the answer that shows no turn running, though it was never seen working', async () => {
    const again = await sendHi(view(), { rows: OLD, viewAt: BEFORE });
    expect(await screen.findByText(S['say.sent'])).toBeInTheDocument();
    again(view(), { rows: OLD, viewAt: after() });
    expect(screen.queryByText(S['say.sent'])).toBeNull();
  });

  it('stays on an idle read from before the send, and while its own turn runs; goes when another turn runs', async () => {
    const again = await sendHi(view(), { rows: OLD, viewAt: BEFORE });
    expect(await screen.findByText(S['say.sent'])).toBeInTheDocument();
    again(view({ turnId: 't0' }), { rows: OLD, viewAt: BEFORE });
    expect(screen.getByText(S['say.sent'])).toBeInTheDocument();
    again(view({ turnRunning: true, turnId: 't1' }), { rows: OLD, viewAt: after() });
    expect(screen.getByText(S['say.sent'])).toBeInTheDocument();
    again(view({ turnRunning: true, turnId: 't2' }), { rows: OLD, viewAt: after() });
    expect(screen.queryByText(S['say.sent'])).toBeNull();
  });

  it('the first message to a new Bot loses its line as soon as the answer shows in the empty thread it was sent into', async () => {
    const again = await sendHi(view(), { rows: [], viewAt: BEFORE });
    expect(await screen.findByText(S['say.sent'])).toBeInTheDocument();
    again(view(), { rows: [row(1, 'user')], viewAt: BEFORE }); // its own message: not an answer
    expect(screen.getByText(S['say.sent'])).toBeInTheDocument();
    again(view(), { rows: [row(1, 'user'), row(2, 'bot', ['m1'], 's-bot')], viewAt: BEFORE });
    expect(screen.queryByText(S['say.sent'])).toBeNull();
  });

  it('a thread first read after the send ends the line at once when it holds the answer; older answers alone do not (Load older too)', async () => {
    const again = await sendHi(view(), { rows: undefined, viewAt: BEFORE });
    expect(await screen.findByText(S['say.sent'])).toBeInTheDocument();
    again(view(), { rows: [row(8, 'note'), row(9, 'note')], viewAt: BEFORE });
    again(view(), { rows: [row(3, 'bot', ['m0']), row(8, 'note'), row(9, 'note')], viewAt: BEFORE }); // Load older
    expect(screen.getByText(S['say.sent'])).toBeInTheDocument();
    again(view(), { rows: [row(3, 'bot', ['m0']), row(8, 'note'), row(9, 'note'), row(10, 'user'), row(11, 'bot', ['m1'])], viewAt: BEFORE });
    expect(screen.queryByText(S['say.sent'])).toBeNull();
  });

  it('a message found by Check again after the Bot answered and went idle loses its line on the next read of the Bot', async () => {
    say.held = true;
    say.found = { t: 'found', answer: posted } satisfies SayCheck;
    const r = render(el(view(), { rows: OLD, viewAt: BEFORE }));
    await userEvent.click(screen.getByRole('button', { name: K['outcome.check'] }));
    expect(await screen.findByText(S['say.sent'])).toBeInTheDocument();
    r.rerender(el(view(), { rows: OLD, viewAt: after() }));
    expect(screen.queryByText(S['say.sent'])).toBeNull();
  });

  it('a message found by Check again whose answer the thread already holds loses its line at once', async () => {
    say.held = true;
    say.found = { t: 'found', answer: posted } satisfies SayCheck;
    const answeredRows = [...OLD, row(5, 'user'), row(6, 'bot', ['m1'], 's-bot')];
    const r = render(el(view(), { rows: answeredRows, viewAt: BEFORE }));
    await userEvent.click(screen.getByRole('button', { name: K['outcome.check'] }));
    r.rerender(el(view(), { rows: answeredRows, viewAt: BEFORE }));
    expect(screen.queryByText(S['say.sent'])).toBeNull();
    expect(screen.queryByText(S['say.maybe'])).toBeNull();
  });

  it('a queued message keeps its line through the turn before it, and loses it on the row that answers it, even while another turn runs', async () => {
    say.answer = { messageId: 'm1', state: 'queued', turnId: null } satisfies SayAnswer;
    const busy = view({ turnRunning: true, turnId: 't0', queued: 1 });
    const again = await sendHi(busy, { rows: OLD, viewAt: BEFORE });
    expect(await screen.findByText(S['say.queued'])).toBeInTheDocument();
    again(busy, { rows: [...OLD, row(5, 'bot', ['m7'], 's-bot')], viewAt: after() }); // the answer of the turn before it
    expect(screen.getByText(S['say.queued'])).toBeInTheDocument();
    again(view({ turnRunning: true, turnId: 't1' }), { rows: [...OLD, row(5, 'bot', ['m7'], 's-bot')], viewAt: after() }); // its own turn
    expect(screen.getByText(S['say.queued'])).toBeInTheDocument();
    // Its turn ends and another starts before any new read of the Bot shows it idle.
    again(view({ turnRunning: true, turnId: 't2' }), { rows: [...OLD, row(5, 'bot', ['m7'], 's-bot'), row(6, 'bot', ['m1'], 's-bot')], viewAt: after() });
    expect(screen.queryByText(S['say.queued'])).toBeNull();
  });

  it('a message that may have been sent keeps its banner whatever the thread and the Bot show', async () => {
    say.held = true;
    const r = render(el(view(), { rows: OLD, viewAt: BEFORE }));
    r.rerender(el(view(), { rows: [...OLD, row(9, 'bot', ['m1'], 's-bot')], viewAt: after() }));
    expect(screen.getByText(S['say.maybe'])).toBeInTheDocument();
  });
});

describe('message_ids on thread rows', () => {
  it('keeps the string ids a row names and nothing else', () => {
    const rows = logOf({ items: [
      { seq: 1, role: 'bot', text: 'a', message_ids: ['m1', 5, null, 'm2'] },
      { seq: 2, role: 'bot', text: 'b', message_ids: 'm1' },
      { seq: 3, role: 'bot', text: 'c' },
    ] }).rows;
    expect(rows.map((r) => r.messageIds)).toEqual([['m1', 'm2'], undefined, undefined]);
  });
});
