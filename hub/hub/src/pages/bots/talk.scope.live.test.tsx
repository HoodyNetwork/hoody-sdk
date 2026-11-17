// Vitest on a live page: what a held message to the Bot holds, driven through the
// Activity tab's composer (parts/Say.tsx: its text box, Send, and the banner's Stop tracking with its warning), on live core with the
// agent's answers faked at fetch. A lost answer holds that Bot only: the same Bot id in another realm of the same computer is another
// Bot and still sends, with its own key and realm. After Stop tracking, the SAME words again replay the held Idempotency-Key, on purpose
// (the key is the double-send guard; the Stop tracking text says to look at the log first): if the first
// send landed, the Bot answers its receipt and no second copy is made. Other words are a new message with a new key. If the agent's guard is ever
// turned around, the same-words case here turns with it.
import { CoreQueryProvider, queryClient } from '@core';
import { boot, calls, deferred, onFetch, settle } from '@core/test/env';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { registerTargets, type BotView } from './data';
import { Say } from './parts/Say';
import S from './strings.en.json';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const R2 = 'bbbbbbbbbbbbbbbbbbbbbbb2';
const KEY = `c1~${R1}~chief`;
/** The same Bot id on the same computer, in another realm: another Bot. */
const OTHER_REALM = `c1~${R2}~chief`;
const flush = async () => {
  for (let i = 0; i < 20; i++) await settle();
};
const path = (c: { url: string }) => new URL(c.url).pathname;
const posts = () => calls.filter((c) => c.method === 'POST' && /\/bots\/[^/]+\/messages$/.test(path(c)));
const keyOf = (c: { headers: Record<string, string> }) => c.headers['idempotency-key'];
const realmOf = (c: { url: string }) => new URL(c.url).searchParams.get('realm');

function serveLost() {
  onFetch((c) => {
    const p = path(c);
    if (c.method === 'POST' && /\/messages$/.test(p)) return { status: 0, network: true };
    if (/\/log$/.test(p)) return { status: 200, body: { items: [], meta: {} } };
    return { status: 200, body: { data: { id: 'chief', uid: 'u1', name: 'Chief' } } };
  });
}

beforeEach(() => {
  boot({ realm: 'all' });
  queryClient.clear();
  registerTargets([{ id: 'c1', project_id: 'p1', server_name: 'sv1' }]);
});

/** The composer of each Bot, side by side, as the Activity tab draws it (no gate waiting). */
async function composers(...keys: string[]) {
  render(
    <CoreQueryProvider>
      {keys.map((k) => (
        <section key={k} aria-label={k}>
          <Say bot={{ gate: null } as unknown as BotView} botKey={k} />
        </section>
      ))}
    </CoreQueryProvider>,
  );
  await act(flush);
  return (k: string) => within(screen.getByRole('region', { name: k }));
}
type Box = Awaited<ReturnType<typeof composers>> extends (k: string) => infer R ? R : never;

const user = () => userEvent.setup();
async function write(box: Box, text: string) {
  const u = user();
  const field = box.getByRole('textbox', { name: S['say.label'] });
  await u.clear(field);
  await u.type(field, text);
  await u.click(box.getByRole('button', { name: S['say.send'] }));
  await act(flush);
}
/** The banner's Stop tracking, then its warning's own Stop tracking (the kit asks first). */
async function stopTracking(box: Box) {
  const u = user();
  await u.click(box.getByRole('button', { name: /stop tracking/i }));
  const warn = await screen.findByRole('alertdialog');
  await u.click(within(warn).getByRole('button', { name: /stop tracking/i }));
  await act(flush);
}
const held = (box: Box) => box.queryByText(S['say.maybe']) !== null;

describe('a held message to the Bot, through the composer', () => {
  it('holds that Bot only: the same Bot id in another realm still sends, with its own key and realm, and stays its own hold', async () => {
    serveLost();
    const of = await composers(KEY, OTHER_REALM);
    await write(of(KEY), 'first');
    expect(held(of(KEY))).toBe(true);
    // The draft stays editable (the kit Composer), but nothing can be sent: Send is off and says why, and Enter sends nothing.
    const send = of(KEY).getByRole('button', { name: S['say.send'] });
    expect(send).toHaveAttribute('aria-disabled', 'true');
    expect(send).toHaveAccessibleDescription(S['say.whyHeld']);
    const u = user();
    await u.type(of(KEY).getByRole('textbox', { name: S['say.label'] }), ' more{Enter}');
    await act(flush);
    expect(posts()).toHaveLength(1);
    // The other realm's Bot is not held: its composer is open and sends.
    expect(held(of(OTHER_REALM))).toBe(false);
    expect(of(OTHER_REALM).getByRole('textbox', { name: S['say.label'] })).toBeEnabled();
    await write(of(OTHER_REALM), 'first');
    expect(posts()).toHaveLength(2);
    expect(keyOf(posts()[1]!)).toBeTruthy();
    expect(keyOf(posts()[1]!)).not.toBe(keyOf(posts()[0]!));
    expect(posts().map(realmOf)).toEqual([R1, R2]);
    expect(held(of(OTHER_REALM))).toBe(true);
    // Stop tracking one Bot's message frees that Bot only.
    await stopTracking(of(OTHER_REALM));
    expect(held(of(OTHER_REALM))).toBe(false);
    expect(held(of(KEY))).toBe(true);
  });

  it('after Stop tracking, the same words replay the held key (the double-send guard); other words get a new key', async () => {
    serveLost();
    const of = await composers(KEY);
    const box = of(KEY);
    await write(box, 'deploy staging');
    const k1 = keyOf(posts()[0]!);
    expect(k1).toBeTruthy();
    expect(held(box)).toBe(true);
    await stopTracking(box);
    expect(held(box)).toBe(false);
    await write(box, 'deploy staging');
    expect(posts()).toHaveLength(2);
    expect(posts()[1]!.body).toEqual({ text: 'deploy staging' });
    expect(keyOf(posts()[1]!)).toBe(k1);
    await stopTracking(box);
    await write(box, 'deploy production');
    expect(posts()).toHaveLength(3);
    expect(posts()[2]!.body).toEqual({ text: 'deploy production' });
    expect(keyOf(posts()[2]!)).toBeTruthy();
    expect(keyOf(posts()[2]!)).not.toBe(k1);
  });
});

// The draft stays editable while a message is sending or held, so a finished send clears the box only
// while it still holds the words that were sent.
describe('words written after Send are kept when the send finishes', () => {
  const field = (box: Box) => box.getByRole('textbox', { name: S['say.label'] }) as HTMLTextAreaElement;
  it('the POST answers while newer words are in the box: they stay; an unchanged box is cleared', async () => {
    const answer = deferred<void>();
    onFetch(async (c) => {
      const p = path(c);
      if (c.method === 'POST' && /\/messages$/.test(p)) { await answer.p; return { status: 200, body: { message_id: 'm1', state: 'queued' } }; }
      if (/\/log$/.test(p)) return { status: 200, body: { items: [], meta: {} } };
      return { status: 200, body: { data: { id: 'chief', uid: 'u1', name: 'Chief' } } };
    });
    const box = (await composers(KEY))(KEY);
    const u = user();
    await u.type(field(box), 'first');
    await u.click(box.getByRole('button', { name: S['say.send'] }));
    await u.type(field(box), ' and then this');
    answer.res();
    await act(flush);
    expect(posts()).toHaveLength(1);
    expect(posts()[0]!.body).toEqual({ text: 'first' });
    expect(field(box).value).toBe('first and then this');
    expect(box.getByText(S['say.queued'])).toBeInTheDocument();
    // Sent as written: the box is cleared.
    await u.clear(field(box));
    await u.type(field(box), 'second');
    await u.click(box.getByRole('button', { name: S['say.send'] }));
    await act(flush);
    expect(posts()).toHaveLength(2);
    expect(field(box).value).toBe('');
  });

  it('Check again finds the held message while newer words are in the box: they stay', async () => {
    const w: { read?: { status: number; body: unknown } } = {};
    onFetch((c) => {
      const p = path(c);
      if (c.method === 'POST' && /\/messages$/.test(p)) return { status: 0, network: true };
      if (/\/messages\/by-key\//.test(p)) return w.read ?? { status: 404, body: { code: 'message_not_found', message: 'x' } };
      if (/\/log$/.test(p)) return { status: 200, body: { items: [], meta: {} } };
      return { status: 200, body: { data: { id: 'chief', uid: 'u1', name: 'Chief' } } };
    });
    const box = (await composers(KEY))(KEY);
    await write(box, 'first');
    expect(held(box)).toBe(true);
    const u = user();
    await u.clear(field(box));
    await u.type(field(box), 'a new thought');
    w.read = { status: 200, body: { message_id: 'm1', state: 'posted', turn_id: 'turn-1' } };
    await u.click(box.getByRole('button', { name: /check again/i }));
    await act(flush);
    expect(held(box)).toBe(false);
    expect(field(box).value).toBe('a new thought');
  });
});
