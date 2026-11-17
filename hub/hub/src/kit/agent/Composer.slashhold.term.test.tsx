// Composer.term: the "/" hold (the web's Composer.slashhold.test.tsx, the same contract; no terminal test had it). While
// the host still reads its "/" list, a draft that starts with "/" waits: Enter and Send send nothing and Send says why.
// Once the list is read it sends as typed; a command the host carries out itself still runs; a draft without a leading
// "/" sends as before; a read that never ends holds the draft for SLASH_HOLD_MS only. A message such as
// "/var/log is full" must reach the agent in the end, and "/exit" must never reach it as text.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { useRef, useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { getByRole, semanticsOf } from '../../term/prim/semantics';
import { Composer, SLASH_HOLD_MS } from './Composer';
import type { ComposerSlash } from './slash';
import strings from './Conversation.strings.en.json';

interface Log { sent: string[] }

// The hold's own timer (SLASH_HOLD_MS) is held here and fired by releaseHold(); every other timer runs as usual.
const real = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
const holds = new Map<object, () => void>();
const releaseHold = (): number => { const all = [...holds.values()]; holds.clear(); for (const f of all) f(); return all.length; };
beforeEach(() => {
  globalThis.setTimeout = ((fn: (...a: unknown[]) => void, ms?: number, ...a: unknown[]) => {
    if (typeof fn !== 'function' || ms !== SLASH_HOLD_MS) return real.setTimeout(fn as never, ms, ...a);
    const token = { ref: () => token, unref: () => token, hasRef: () => false, refresh: () => token };
    holds.set(token, () => fn(...a));
    return token as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id: unknown) => { if (!(typeof id === 'object' && id !== null && holds.delete(id))) real.clearTimeout(id as never); }) as typeof clearTimeout;
});
let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; holds.clear(); Object.assign(globalThis, real); setSlash = null; });

let setSlash: ((s: ComposerSlash) => void) | null = null;
function Host({ log, first }: { log: Log; first: ComposerSlash }) {
  const [draft, setDraft] = useState('');
  const [slash, set] = useState(first);
  setSlash = set;
  const ref = useRef<HTMLTextAreaElement | null>(null);
  return (
    <Box dir="column" width={80} height={20} justify="end">
      <Composer
        draft={draft} setDraft={setDraft} inputRef={ref} placeholder="Message your agent" max={8000}
        canSend={draft.trim() !== ''} onSend={() => { log.sent.push(draft); setDraft(''); }}
        notes={[]} attachments={[]} onRemoveAttachment={() => {}} flash={false} onTyping={() => {}} slash={slash}
      />
    </Box>
  );
}
const reading = (over: Partial<ComposerSlash> = {}): ComposerSlash => ({ items: [], reading: true, open: () => {}, ...over });
async function draw(first: ComposerSlash, typed: string): Promise<Log> {
  const log: Log = { sent: [] };
  t = await drawTest(<FocusRoot><Host log={log} first={first} /></FocusRoot>, { width: 80, height: 20 });
  await t.settle();
  t.mockInput.pressTab(); // to the box (first Tab stop)
  await t.settle();
  await t.mockInput.typeText(typed);
  await t.settle();
  return log;
}
const send = () => getByRole(semanticsOf(t!.renderer as never), 'button', { name: /^Send/ });

// Line numbers: Composer.term.tsx as this test was written. Catches the hold (line 230 `waitList`, 237 `listHold`, 247
// `if (listHold) return`) and Send's state and reason (lines 310, 394).
test('a "/" draft is held while the list is read: Enter sends nothing, Send is off and says why', async () => {
  const log = await draw(reading(), '/usage');
  expect(send().states.disabled).toBe(true);
  expect(send().description).toBe(strings['agent.slashHold']);
  t!.mockInput.pressEnter();
  await t!.settle();
  expect(log.sent).toEqual([]);
});

// Catches `!!p.slash?.reading` (line 230): the list read, the same draft sends as typed.
test('once the list is read, the same draft sends as typed', async () => {
  const log = await draw(reading(), '/usage');
  t!.mockInput.pressEnter();
  await t!.settle();
  expect(log.sent).toEqual([]);
  setSlash!({ items: [], reading: false });
  await t!.settle();
  expect(send().states.disabled).toBeUndefined(); // an enabled control carries no `disabled` state
  t!.mockInput.pressEnter();
  await t!.settle();
  expect(log.sent).toEqual(['/usage']);
});

// Catches the order in send() (lines 245-247): a command the host carries out runs before the hold is asked, and its
// text never goes to the agent.
test('a command the host carries out itself still runs while the list is read; its text is never sent', async () => {
  const ran: string[] = [];
  const log = await draw(reading({ items: [{ name: 'exit', description: '', hidden: true, run: (a) => { ran.push(a); } }] }), '/exit');
  t!.mockInput.pressEnter();
  await t!.settle();
  expect(ran).toEqual(['']);
  expect(log.sent).toEqual([]);
});

// Catches `startsWith('/')` (line 229): only a leading "/" holds.
test('a draft without a leading "/" sends as before while the list is read', async () => {
  const log = await draw(reading(), 'fix the cart total /please');
  t!.mockInput.pressEnter();
  await t!.settle();
  expect(log.sent).toEqual(['fix the cart total /please']);
});

// Catches the hold's end (lines 232-236, the timer at 234): a read that never ends holds the draft only until
// SLASH_HOLD_MS has passed.
test('a read that does not end holds a "/" draft only for SLASH_HOLD_MS: then Enter sends it as typed', async () => {
  const log = await draw(reading(), '/var/log is full on the build computer');
  t!.mockInput.pressEnter();
  await t!.settle();
  expect(log.sent).toEqual([]);
  expect(releaseHold()).toBeGreaterThan(0); // the hold's timer was set, and now it has run out
  await t!.settle();
  expect(send().states.disabled).toBeUndefined(); // an enabled control carries no `disabled` state
  t!.mockInput.pressEnter();
  await t!.settle();
  expect(log.sent).toEqual(['/var/log is full on the build computer']);
});
