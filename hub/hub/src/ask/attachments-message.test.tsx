// Images and text files with a message in the Agent panel (choice A). Images ride the turn
// (POST /turns attachments), never a follow-up; text files go into the message as fenced blocks. C9: a lost answer
// is checked under the same key with the identical bytes; a definite refusal says "Not sent".
/* eslint-disable @typescript-eslint/no-explicit-any */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { resetQueuedForTests } from '@kit/agent/queuedSend';
import * as A from './attach';
import { Column } from './Column';
import { Composer } from './Composer';
import * as C from './conv';
import { AskEngine, keepAtt, type Slot, type StoreIO } from './engine';
import { FakeAgent, manualClock, type FakeOptions } from './fake';
import type { AskStore } from './logic';
import kitStrings from '@kit/agent/Conversation.strings.en.json';
import strings from './strings.en.json';

afterEach(() => { cleanup(); resetQueuedForTests(); });

const ACCOUNT = '64f0ada00000000000000001';
const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const slot: Slot = { account: ACCOUNT, project: '6a0000000000000000000001', computer: 'c0a7150000000000000000a1', realm: REALM, name: 'atlas' };
// A real PNG header (signature + a 1×1 IHDR with its CRC): the agent reads the header, not only the signature.
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89];

function memStore(): StoreIO & { raw: () => string } {
  let st: AskStore = { v: 1, a: {} };
  return { read: () => JSON.parse(JSON.stringify(st)), write: (_a, s) => { if (s) st = JSON.parse(JSON.stringify(s)); }, raw: () => JSON.stringify(st) };
}
async function setup(o: Partial<FakeOptions> = {}) {
  const clock = manualClock();
  const agent = new FakeAgent({ account: ACCOUNT, pace: 10, realms: [REALM], ...o }, clock);
  const store = memStore();
  const eng = new AskEngine(slot, agent, store, clock);
  const revoked: string[] = [];
  eng.revokeUrl = (u) => { revoked.push(u); };
  const flush = async (ms = 0) => {
    const drain = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); } };
    await act(async () => {
      await drain();
      for (let left = ms; left > 0; left -= 10) { clock.run(Math.min(10, left)); await drain(); }
    });
  };
  eng.open();
  await flush();
  return { agent, eng, store, clock, flush, revoked, snap: () => eng.getSnapshot() };
}
function failOnce(agent: any, m: string, err: unknown) {
  const real = agent[m].bind(agent);
  let done = false;
  agent[m] = (...a: unknown[]) => { if (done) return real(...a); done = true; agent.log.push([m, a]); return Promise.reject(err); };
}
const calls = (agent: FakeAgent, m: string) => agent.log.filter((x) => x[0] === m);
const users = (s: any) => C.blocks(s.conv, 0).filter((b) => b.k === 'user').map((b: any) => b.msg);
let n = 0;
const image = (name = 'shot.png', size = 1200, shrunk?: number) => {
  const b = new Uint8Array(size); b.set(PNG); for (let i = PNG.length; i < size; i++) b[i] = (i * 7 + n) % 256;
  const id = 'i' + ++n;
  if (shrunk) { const s = new Uint8Array(shrunk); s.set(PNG); return A.prepare(id, name, b, () => 'blob:' + id, { bytes: s, from: size }); }
  return A.prepare(id, name, b, () => 'blob:' + id);
};
const textFile = (name: string, s: string) => A.prepare('t' + ++n, name, new TextEncoder().encode(s), () => '');

describe('attachments with a message', () => {
  it('one POST /turns carries the image bytes and the text file as a fenced block; the store holds neither', async () => {
    const t = await setup();
    const pic = image();
    t.eng.attach([pic, textFile('build.log', 'error: missing semicolon')], 'Why does it fail?');
    expect(t.snap().att.items).toHaveLength(2);
    expect(t.eng.send('Why does it fail?')).toBe(true);
    await t.flush(2000);
    const turns = calls(t.agent, 'turn');
    expect(turns).toHaveLength(1);
    const [, text, , atts] = turns[0]![1] as [string, string, string, A.WireImage[]];
    expect(text).toBe('Why does it fail?\n\n```log title=build.log\nerror: missing semicolon\n```');
    expect(atts).toEqual([{ type: 'image', media_type: 'image/png', data: pic.ok && pic.att.kind === 'image' ? pic.att.data : '', name: 'shot.png' }]);
    expect(t.snap().att.items).toHaveLength(0);
    const u = users(t.snap())[0];
    expect(u.state).toBe('sent');
    expect(u.imgs).toHaveLength(1);
    expect(u.files).toHaveLength(1);
    const raw = t.store.raw();
    expect(raw).not.toContain('missing semicolon');
    expect(raw).not.toContain((atts[0]!.data).slice(0, 40));
  });

  it('a lost answer: Check status asks under the same key with the identical bytes, and one turn runs', async () => {
    const t = await setup({ turnLost: true });
    t.eng.attach([image(), textFile('run.log', 'boom\n')], 'Look');
    t.eng.send('Look');
    await t.flush(30);
    const u = users(t.snap())[0];
    expect(u.state).toBe('unknown');
    t.eng.check(u.id);
    await t.flush(2000);
    const turns = calls(t.agent, 'turn');
    expect(turns).toHaveLength(2);
    expect(turns[1]![1][2]).toBe(turns[0]![1][2]);
    expect(JSON.stringify(turns[1]![1][3])).toBe(JSON.stringify(turns[0]![1][3]));
    expect(turns[1]![1][1]).toBe(turns[0]![1][1]);
    // The conversation read again after the turn keeps the message's own text and its chips.
    const after = users(t.snap())[0];
    expect(after).toMatchObject({ state: 'sent', text: 'Look' });
    expect(after.imgs).toHaveLength(1);
    expect(after.files).toHaveLength(1);
  });

  it('the fake agent, like the real one, refuses the same key with other images (its fingerprint covers them)', async () => {
    const t = await setup();
    t.eng.attach([image('one.png')], 'Look');
    t.eng.send('Look');
    await t.flush(2000);
    const [sid, text, key, atts] = calls(t.agent, 'turn')[0]![1] as [string, string, string, A.WireImage[]];
    await expect(t.agent.turn(sid, text, key, undefined, atts)).resolves.toMatchObject({ duplicate: true });
    const other = [{ ...atts[0]!, data: atts[0]!.data.slice(0, -4) + 'AAAA' }];
    await expect(t.agent.turn(sid, text, key, undefined, other)).rejects.toMatchObject({ status: 422, code: 'idempotency_key_reused' });
  });

  it('a definite refusal reads "Not sent"; Send again resends the same bytes', async () => {
    const t = await setup();
    const real = (t.agent as any).turn.bind(t.agent);
    let once = false;
    (t.agent as any).turn = (...a: unknown[]) => { if (once) return real(...a); once = true; t.agent.log.push(['turn', [a[0], a[1], a[2], a[4]]]); return Promise.reject({ status: 400, code: 'bad_request' }); };
    t.eng.attach([image()], 'Look');
    t.eng.send('Look');
    await t.flush(100);
    const u = users(t.snap())[0];
    expect(u.state).toBe('notSent');
    t.eng.resend(u.id);
    await t.flush(2000);
    const turns = calls(t.agent, 'turn');
    expect(turns).toHaveLength(2);
    expect(JSON.stringify(turns[1]![1][3])).toBe(JSON.stringify(turns[0]![1][3]));
    expect(users(t.snap())[0].state).toBe('sent');
  });

  it('while the agent works, images wait (Send is held, nothing goes); text files go with the follow-up', async () => {
    const t = await setup({ pace: 200 });
    t.eng.send('Build me a small dashboard');
    await t.flush(250);
    t.eng.attach([image()], 'And this');
    expect(t.eng.send('And this')).toBe(false);
    expect(calls(t.agent, 'command')).toHaveLength(0);
    expect(t.snap().att.items).toHaveLength(1);
    t.eng.unattach(t.snap().att.items[0]!.id);
    t.eng.attach([textFile('notes.txt', 'use blue')], 'And this');
    expect(t.eng.send('And this')).toBe(true);
    await t.flush(50);
    const cmd = calls(t.agent, 'command');
    expect(cmd).toHaveLength(1);
    expect(cmd[0]![1][1]).toBe('And this\n\n```text title=notes.txt\nuse blue\n```');
  });

  it('refusals are named, kept files stay in order, and removed or dropped images let their thumbnails go', async () => {
    const t = await setup();
    t.eng.attach([image('a.png'), image('b.png'), image('c.png'), image('d.png'), image('e.png'), { ok: false, why: { key: 'ask.attNotText', name: 'x.bin' } }], '');
    const s = t.snap().att;
    expect(s.items.map((x) => x.name)).toEqual(['a.png', 'b.png', 'c.png', 'd.png']);
    expect(s.refused).toEqual([{ key: 'ask.attNotText', name: 'x.bin' }, { key: 'ask.attImgMany', name: 'e.png' }]);
    // The refused image's thumbnail URL goes at once.
    expect(t.revoked).toHaveLength(1);
    t.eng.unattach(s.items[0]!.id);
    expect(t.revoked).toHaveLength(2);
    expect(t.snap().att.refused).toEqual([]);
    t.eng.newConversation();
    await t.flush(100);
    expect(t.snap().att.items).toEqual([]);
    expect(t.snap().att.dropped).toBe('ask.attDropped');
    expect(t.revoked).toHaveLength(5);
  });

  it('a message a reload lost takes only its retyped text: files wait for a new message, never ride its key', async () => {
    const t = await setup({ turnLost: true });
    t.eng.send('Build me a small dashboard');
    await t.flush(30);
    // A reload: the lost turn's text is not kept, and its outcome cannot be read yet.
    failOnce(t.agent, 'turns', { status: 503 });
    failOnce(t.agent, 'state', { status: 503 });
    const t2 = new AskEngine(slot, t.agent, t.store, t.clock);
    t2.revokeUrl = () => {};
    t2.open();
    await t.flush(50);
    const lost = users(t2.getSnapshot()).find((x: any) => x.state === 'unknown');
    expect(lost.text).toBe('');
    t2.attach([image('late.png')], '');
    expect(t2.attBlock('Build me a small dashboard')).toBe('ask.attLostFirst');
    expect(t2.send('Build me a small dashboard')).toBe(false);
    expect(calls(t.agent, 'turn')).toHaveLength(1);
    expect(t2.getSnapshot().att.items).toHaveLength(1);
    // Without the files, the retyped text goes under the lost message's key, as before.
    t2.unattach(t2.getSnapshot().att.items[0]!.id);
    expect(t2.send('Build me a small dashboard')).toBe(true);
    await t.flush(50);
    const turns = calls(t.agent, 'turn');
    expect(turns).toHaveLength(2);
    expect(turns[1]![1][2]).toBe(turns[0]![1][2]);
    expect(turns[1]![1]).toHaveLength(3);
  });

  it('the composer shows each file, the "made smaller" line, the refusals, and why Send waits', async () => {
    const t = await setup({ pace: 200 });
    t.eng.send('Build me a small dashboard');
    await t.flush(250);
    t.eng.attach([image('big.png', 1200, 900), { ok: false, why: { key: 'ask.attTextBig', name: 'huge.log', size: 30000 } }], '');
    function Live() {
      const snap = useSyncExternalStore(t.eng.subscribe, () => t.eng.getSnapshot());
      return <Composer eng={t.eng} snap={snap} computer="atlas" draft="And this" setDraft={() => {}} note={null} onDismissNote={() => {}} flash={false} inputRef={{ current: null }} onTyping={() => {}} />;
    }
    render(<Live />);
    expect(screen.getByText('big.png')).toBeTruthy();
    expect(screen.getByText(/^Made smaller to fit \(/)).toBeTruthy();
    expect(screen.getByText(/^huge\.log is /)).toBeTruthy();
    // An image cannot join the running turn: the composer says Send will queue the message, and never that the image must wait.
    expect(screen.queryByText(strings['ask.attImgLater'])).toBeNull();
    expect(screen.getByText(strings['ask.queuedNext.hint'])).toBeTruthy();
    expect((screen.getByRole('button', { name: kitStrings['agent.send'] }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole('button', { name: kitStrings['agent.attRemove'].replace('{{name}}', 'big.png') })).toBeTruthy();
  });

  it('Send with an image while the turn runs queues the message: nothing goes until the turn ends, then it goes once with its image', async () => {
    const t = await setup({ pace: 200 });
    t.eng.send('Build me a small dashboard');
    await t.flush(250);
    t.eng.attach([image('shot.png')], '');
    let draft = 'And this';
    function Live() {
      const snap = useSyncExternalStore(t.eng.subscribe, () => t.eng.getSnapshot());
      return <Composer eng={t.eng} snap={snap} computer="atlas" draft={draft} setDraft={(v) => { draft = v; }} note={null} onDismissNote={() => {}} flash={false} inputRef={{ current: null }} onTyping={() => {}} />;
    }
    render(<Live />);
    const sent = () => Object.values(t.snap().conv.users).filter((u) => u.text === 'And this');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kitStrings['agent.send'] })); });
    expect(screen.getByText(strings['ask.queuedNext.on'])).toBeTruthy();
    expect(screen.getByRole('button', { name: strings['ask.queuedNext.cancel'] })).toBeTruthy();
    expect(sent()).toHaveLength(0);
    expect(calls(t.agent, 'command')).toHaveLength(0);
    expect(t.snap().att.items).toHaveLength(1);
    // The turn ends: the queued message goes as the next turn, with its image, once.
    await act(async () => { await t.flush(20_000); });
    expect(sent()).toHaveLength(1);
    expect(sent()[0]?.via).toBe('turn');
    expect(sent()[0]?.imgs).toHaveLength(1);
    expect(calls(t.agent, 'turn')).toHaveLength(2);
    expect(draft).toBe('');
    expect(screen.queryByText(strings['ask.queuedNext.on'])).toBeNull();
    await act(async () => { await t.flush(20_000); });
    expect(calls(t.agent, 'turn')).toHaveLength(2);
  });

  it('a conversation that only looks idle sends nothing: the queued message waits until the agent\'s own state read names no running turn', async () => {
    const t = await setup({ pace: 200 });
    t.eng.send('Build me a small dashboard');
    await t.flush(250);
    t.eng.attach([image('shot.png')], '');
    let draft = 'And this';
    // What a lost stream or a page not yet read leaves: the turn shown is over, the agent's last word still names one (or none was read).
    let agentSays: string | null | undefined = 'turn-still-running';
    function Live({ n }: { n: number }) {
      const snap = useSyncExternalStore(t.eng.subscribe, () => t.eng.getSnapshot());
      const { stateTurn: _real, ...rest } = snap;
      const shown = n === 0 ? snap : agentSays === undefined ? rest : { ...snap, stateTurn: agentSays };
      return <Composer eng={t.eng} snap={shown} computer="atlas" draft={draft} setDraft={(v) => { draft = v; }} note={null} onDismissNote={() => {}} flash={false} inputRef={{ current: null }} onTyping={() => {}} />;
    }
    const view = render(<Live n={0} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kitStrings['agent.send'] })); });
    expect(screen.getByText(strings['ask.queuedNext.on'])).toBeTruthy();
    view.rerender(<Live n={1} />);
    await act(async () => { await t.flush(20_000); });
    expect(t.snap().stateTurn, 'the turn is over for the agent too').toBeNull();
    expect(calls(t.agent, 'turn'), 'the agent still named a turn: nothing sent').toHaveLength(1);
    agentSays = undefined;
    view.rerender(<Live n={2} />);
    await act(async () => { await t.flush(1_000); });
    expect(calls(t.agent, 'turn'), 'no state read yet: nothing sent').toHaveLength(1);
    expect(screen.getByText(strings['ask.queuedNext.on'])).toBeTruthy();
    expect(draft).toBe('And this');
    agentSays = null;
    view.rerender(<Live n={3} />);
    await act(async () => { await t.flush(1_000); });
    expect(calls(t.agent, 'turn')).toHaveLength(2);
    expect(Object.values(t.snap().conv.users).filter((u) => u.text === 'And this')[0]?.imgs).toHaveLength(1);
  });

  it('a queued draft changed to a command is not sent at the turn end: it stays with the reason', async () => {
    const t = await setup({ pace: 200 });
    t.eng.send('Build me a small dashboard');
    await t.flush(250);
    t.eng.attach([image('shot.png')], '');
    let draft = 'And this';
    function Live({ n }: { n: number }) {
      const snap = useSyncExternalStore(t.eng.subscribe, () => t.eng.getSnapshot());
      return <Composer key={0} eng={t.eng} snap={snap} computer="atlas" draft={draft} setDraft={(v) => { draft = v; }} note={null} onDismissNote={() => {}} flash={n < 0} inputRef={{ current: null }} onTyping={() => {}} />;
    }
    const view = render(<Live n={0} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kitStrings['agent.send'] })); });
    expect(screen.getByText(strings['ask.queuedNext.on'])).toBeTruthy();
    draft = '/clear';
    view.rerender(<Live n={1} />);
    await act(async () => { await t.flush(20_000); });
    expect(calls(t.agent, 'turn')).toHaveLength(1);
    expect(calls(t.agent, 'command')).toHaveLength(0);
    expect(screen.getByText(strings['ask.queuedNext.command'])).toBeTruthy();
    expect(draft).toBe('/clear');
  });

  it("Don't send takes the queued message out: the turn ends and nothing is sent; a closed composer sends nothing either and says so when it is back", async () => {
    const t = await setup({ pace: 200 });
    t.eng.send('Build me a small dashboard');
    await t.flush(250);
    t.eng.attach([image('shot.png')], '');
    function Live() {
      const snap = useSyncExternalStore(t.eng.subscribe, () => t.eng.getSnapshot());
      return <Composer eng={t.eng} snap={snap} computer="atlas" draft="And this" setDraft={() => {}} note={null} onDismissNote={() => {}} flash={false} inputRef={{ current: null }} onTyping={() => {}} />;
    }
    const first = render(<Live />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kitStrings['agent.send'] })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['ask.queuedNext.cancel'] })); });
    expect(screen.queryByText(strings['ask.queuedNext.on'])).toBeNull();
    // Queued again, then the composer goes before the turn ends.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kitStrings['agent.send'] })); });
    expect(screen.getByText(strings['ask.queuedNext.on'])).toBeTruthy();
    first.unmount();
    await act(async () => { await t.flush(20_000); });
    expect(calls(t.agent, 'turn')).toHaveLength(1);
    render(<Live />);
    expect(screen.getByText(strings['ask.queuedNext.left'])).toBeTruthy();
    await act(async () => { await t.flush(5_000); });
    expect(calls(t.agent, 'turn')).toHaveLength(1);
    expect(Object.values(t.snap().conv.users).filter((u) => u.text === 'And this')).toHaveLength(0);
  });

  it('a sent message shows its files, and a resized image says so', async () => {
    const t = await setup();
    t.eng.attach([image('big.png', 1200, 900), textFile('a.log', 'x\ny')], 'Look');
    t.eng.send('Look');
    await t.flush(2000);
    function Live() {
      const snap = useSyncExternalStore(t.eng.subscribe, () => t.eng.getSnapshot());
      return <Column eng={t.eng} snap={snap} agentUrl="" typing empty={null} />;
    }
    render(<Live />);
    expect(screen.getByText('big.png')).toBeTruthy();
    expect(screen.getByText('a.log')).toBeTruthy();
    expect(screen.getByText(strings['ask.attResizedShort'])).toBeTruthy();
  });
});

describe('attachments: edge cases (1)', () => {
  it('Retry of a failed turn sends that message\'s own text and files; the composer\'s files stay put', async () => {
    const t = await setup({ script: [[{ k: 'fail', code: 'provider_error' }], [{ k: 'text', text: 'ok' }]] });
    t.eng.attach([image('original.png'), textFile('original.log', 'first\n')], 'inspect');
    t.eng.send('inspect');
    await t.flush(2000);
    const first = users(t.snap())[0];
    const o = C.blocks(t.snap().conv, 0).find((b) => b.k === 'outcome') as any;
    expect(o.retry).toBe(first.id);
    t.eng.attach([textFile('next.log', 'other task\n')], '');
    expect(t.eng.retryMsg(o.retry)).toBe(true);
    await t.flush(2000);
    const turns = calls(t.agent, 'turn');
    expect(turns).toHaveLength(2);
    expect(turns[1]![1][1]).toBe(turns[0]![1][1]);
    expect(turns[1]![1][1]).toContain('original.log');
    expect(turns[1]![1][1]).not.toContain('next.log');
    expect(JSON.stringify(turns[1]![1][3])).toBe(JSON.stringify(turns[0]![1][3]));
    expect(turns[1]![1][2]).not.toBe(turns[0]![1][2]);
    expect(t.snap().att.items.map((x) => x.name)).toEqual(['next.log']);
  });

  it('the composer says files are being read, and Send waits for them', async () => {
    const t = await setup();
    t.eng.beginRead();
    function Live() {
      const snap = useSyncExternalStore(t.eng.subscribe, () => t.eng.getSnapshot());
      return <Composer eng={t.eng} snap={snap} computer="atlas" draft="Look at this" setDraft={() => {}} note={null} onDismissNote={() => {}} flash={false} inputRef={{ current: null }} onTyping={() => {}} />;
    }
    render(<Live />);
    expect(screen.getByText(strings['ask.attReading'])).toBeTruthy();
    expect((screen.getByRole('button', { name: kitStrings['agent.send'] }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('files still being read hold Send; they go with the message once they arrive', async () => {
    const t = await setup();
    const token = t.eng.beginRead();
    expect(t.snap().att.reading).toBe(true);
    expect(t.eng.attBlock('Look')).toBe('ask.attReading');
    expect(t.eng.send('Look')).toBe(false);
    expect(calls(t.agent, 'create')).toHaveLength(0);
    t.eng.attach([image('slow.png')], 'Look', token);
    expect(t.snap().att.reading).toBe(false);
    expect(t.eng.send('Look')).toBe(true);
    await t.flush(2000);
    expect(calls(t.agent, 'turn')[0]![1][3]).toHaveLength(1);
  });

  it('files that arrive after New conversation, the panel closing or the engine ending are let go, never added', async () => {
    const t = await setup();
    const a = t.eng.beginRead();
    t.eng.newConversation();
    await t.flush(100);
    t.eng.attach([image('late.png')], '', a);
    expect(t.snap().att.items).toEqual([]);
    expect(t.revoked).toHaveLength(1);
    t.eng.attach([image('kept.png')], '');
    const b = t.eng.beginRead();
    t.eng.suspend();
    expect(t.snap().att).toMatchObject({ items: [], dropped: 'ask.attDroppedClosed', reading: false });
    expect(t.revoked).toHaveLength(2);
    t.eng.attach([image('later.png')], '', b);
    expect(t.snap().att.items).toEqual([]);
    expect(t.revoked).toHaveLength(3);
    t.eng.resume();
    t.eng.attach([image('last.png'), textFile('last.log', 'x\n')], '');
    t.eng.end();
    expect(t.snap().phase).toBe('ended');
    expect(t.snap().att.items).toEqual([]);
    expect(t.revoked).toHaveLength(4);
  });

  it('a message with files a reload lost: its key never takes the retyped text alone, and nothing else goes first', async () => {
    const t = await setup({ turnLost: true });
    t.eng.attach([image('lost.png'), textFile('lost.log', 'x\n')], 'Build me a small dashboard');
    t.eng.send('Build me a small dashboard');
    await t.flush(30);
    const key = calls(t.agent, 'turn')[0]![1][2];
    const raw = t.store.raw();
    expect(raw).toContain('"wf":true');
    expect(raw).not.toContain('lost.log');
    failOnce(t.agent, 'turns', { status: 503 });
    failOnce(t.agent, 'state', { status: 503 });
    const t2 = new AskEngine(slot, t.agent, t.store, t.clock);
    t2.revokeUrl = () => {};
    t2.open();
    await t.flush(50);
    const lost = users(t2.getSnapshot()).find((x: any) => x.state === 'unknown');
    expect(lost).toMatchObject({ text: '', lostFiles: true });
    expect(t2.attBlock('Build me a small dashboard')).toBe('ask.lostFiles');
    expect(t2.send('Build me a small dashboard')).toBe(false);
    expect(t2.send('Something else')).toBe(false);
    expect(t2.takeBack(lost.id)).toBeNull();   // an unknown outcome is never taken back
    expect(calls(t.agent, 'turn')).toHaveLength(1);
    // Dismissed, it goes; nothing ever went under its key without its files.
    t2.dismiss(lost.id);
    await t.flush(100);
    expect(t2.attBlock('Build me a small dashboard')).toBe(null);
    for (const c of calls(t.agent, 'turn')) if (c[1][2] === key) expect(c[1][3]).toHaveLength(1);
  });

  it('the agent refusing the files (400) reads why, offers no blind Send again, and Edit takes the message back to fix', async () => {
    const t = await setup();
    t.eng.attach([image('bad.png'), textFile('a.log', 'x\n')], 'Look');
    failOnce(t.agent, 'turn', { status: 400, code: 'bad_request' });
    t.eng.send('Look');
    await t.flush(2000);
    const u = users(t.snap())[0];
    expect(u).toMatchObject({ state: 'notSent', reason: 'ask.attRefused' });
    function Live() {
      const snap = useSyncExternalStore(t.eng.subscribe, () => t.eng.getSnapshot());
      return <Column eng={t.eng} snap={snap} agentUrl="" typing empty={null} onEdit={(id) => { back.push(t.eng.takeBack(id)); }} />;
    }
    const back: Array<string | null> = [];
    render(<Live />);
    expect(screen.queryByRole('button', { name: strings['ask.sendAgain'] })).toBeNull();
    act(() => { screen.getByRole('button', { name: strings['ask.attEdit'] }).click(); });
    expect(back).toEqual(['Look']);
    expect(t.snap().att.items.map((x) => x.name)).toEqual(['bad.png', 'a.log']);
    expect(users(t.snap())).toHaveLength(0);
    // An unknown outcome is never taken back.
    expect(t.eng.takeBack('nope')).toBeNull();
  });
});

describe('attachments: edge cases (2)', () => {
  it('a message with files that another tab\'s newer message displaced: after a reload its key never takes the retyped text alone', async () => {
    const t = await setup({ script: [[{ k: 'text', text: 'ok' }], [{ k: 'text', text: 'ok' }], [{ k: 'text', text: 'ok' }]] });
    t.eng.send('hello');
    await t.flush(3000);
    // Tab B has the same conversation open before tab A's message with files goes out.
    const b = new AskEngine(slot, t.agent, t.store, t.clock);
    b.revokeUrl = () => {};
    b.open();
    await t.flush(3000);
    t.eng.attach([image('original.png'), textFile('original.log', 'x\n')], 'inspect');
    const before = calls(t.agent, 'turn').length;
    failOnce(t.agent, 'turn', { status: 502, pending: true });   // its answer is lost before admission
    expect(t.eng.send('inspect')).toBe(true);
    await t.flush(30);
    const keyA = calls(t.agent, 'turn')[before]![1][2];
    expect(b.send('newer')).toBe(true);   // tab B's text-only message moves A's key to kw
    await t.flush(3000);
    expect(t.store.raw()).not.toContain('original.log');
    const c = new AskEngine(slot, t.agent, t.store, t.clock);   // a reload
    c.revokeUrl = () => {};
    c.open();
    await t.flush(3000);
    const row = users(c.getSnapshot()).find((x: any) => x.key === keyA);
    expect(row).toMatchObject({ text: '', state: 'unknown', reason: 'ask.otherTab', lostFiles: true });
    render(<Column eng={c} snap={c.getSnapshot()} agentUrl="" typing={false} empty={null} />);
    expect(screen.getByText(strings['ask.lostFilesOther'])).toBeTruthy();
    expect(c.attBlock('inspect')).toBe('ask.lostFiles');
    expect(c.send('inspect')).toBe(false);
    expect(t.store.raw()).toContain('"kwf":["' + keyA + '"]');   // only that it had files, never which
    // Every request under A's key carried its image (the log's own entry and the lost one's raw arguments alike).
    const underA = calls(t.agent, 'turn').filter((x) => x[1][2] === keyA);
    expect(underA).toHaveLength(1);
    for (const x of underA) expect((x[1] as unknown[]).find(Array.isArray)).toHaveLength(1);
    // Dismissed, it goes, and its files flag with it.
    c.dismiss(row.id);
    await t.flush(100);
    expect(c.attBlock('inspect')).toBe(null);
    expect(t.store.raw()).not.toContain('kwf');
  });

  it('New conversation while the panel is still loading lets the draft\'s files go at once, and files still being read too', async () => {
    const t = await setup();
    const host = t.agent as any;
    const real = host.probe.bind(t.agent);
    const waiting: Array<() => void> = [];
    host.probe = (...a: unknown[]) => new Promise((res) => waiting.push(() => res(real(...a))));
    const e = new AskEngine(slot, t.agent, t.store, t.clock);
    const revoked: string[] = [];
    e.revokeUrl = (u) => { revoked.push(u); };
    e.open();
    await t.flush(50);
    expect(e.getSnapshot().phase).not.toBe('ready');
    e.attach([image('old-draft.png')], '');
    const r = e.beginRead();
    e.newConversation();
    expect(e.getSnapshot().att).toMatchObject({ items: [], dropped: 'ask.attDropped', reading: false });
    expect(revoked).toHaveLength(1);
    e.attach([image('late.png')], '', r);
    expect(e.getSnapshot().att.items).toEqual([]);
    expect(revoked).toHaveLength(2);
    e.attach([image('new.png')], '');   // attached after New conversation: it is the new draft's
    host.probe = real;
    for (const w of waiting.splice(0)) w();
    await t.flush(3000);
    expect(e.getSnapshot().phase).toBe('ready');
    expect(e.getSnapshot().att.items.map((x: any) => x.name)).toEqual(['new.png']);
  });
});

describe('attachments: smaller cases', () => {
  const lostOnce = (agent: FakeAgent) => failOnce(agent, 'turn', { status: 502, pending: true });

  it('Check status rebuilding the history keeps each image on its own message when an earlier one has the same text', async () => {
    const t = await setup();
    t.eng.send('look');
    await t.flush(2000);
    t.eng.attach([image('second.png')], 'look');
    lostOnce(t.agent);
    t.eng.send('look');
    await t.flush(30);
    const u = users(t.snap())[1];
    expect(u.state).toBe('unknown');
    t.eng.check(u.id);
    await t.flush(3000);
    const after = users(t.snap());
    expect(after.map((x: any) => x.text)).toEqual(['look', 'look']);
    expect(after[0].imgs).toBeUndefined();
    expect(after[1].imgs?.map((i: any) => i.name)).toEqual(['second.png']);
  });

  it('two messages with the same text and their own images keep them in order after the rebuild', async () => {
    const t = await setup();
    t.eng.attach([image('first.png')], 'look');
    t.eng.send('look');
    await t.flush(2000);
    t.eng.attach([image('second.png')], 'look');
    lostOnce(t.agent);
    t.eng.send('look');
    await t.flush(30);
    t.eng.check(users(t.snap())[1].id);
    await t.flush(3000);
    expect(users(t.snap()).map((x: any) => x.imgs?.map((i: any) => i.name))).toEqual([['first.png'], ['second.png']]);
  });

  it('Edit on a refused Retry: removing the recovered image or closing the panel keeps the original message\'s thumbnail', async () => {
    const t = await setup({ script: [[{ k: 'fail', code: 'provider_error' }]] });
    t.eng.attach([image('original.png')], 'inspect');
    t.eng.send('inspect');
    await t.flush(2000);
    const first = users(t.snap())[0];
    const url = first.imgs[0].url as string;
    failOnce(t.agent, 'turn', { status: 400, code: 'bad_request' });
    expect(t.eng.retryMsg(first.id)).toBe(true);
    await t.flush(2000);
    const retry = users(t.snap()).find((x: any) => x.state === 'notSent');
    expect(retry).toBeDefined();
    expect(t.eng.takeBack(retry.id)).toBe('inspect');
    expect(t.snap().att.items.map((x: any) => x.url)).toEqual([url]);
    t.eng.suspend();                                   // closing the panel lets the draft go
    expect(t.revoked).not.toContain(url);
    t.eng.resume();
    expect(users(t.snap())[0].imgs[0].url).toBe(url);  // the original still shows it
    t.eng.newConversation();                           // the conversation goes: now it is let go, once
    expect(t.revoked.filter((x) => x === url)).toHaveLength(1);
  });

  it('removing the recovered image from the draft leaves the original\'s thumbnail alone', async () => {
    const t = await setup({ script: [[{ k: 'fail', code: 'provider_error' }]] });
    t.eng.attach([image('original.png')], 'inspect');
    t.eng.send('inspect');
    await t.flush(2000);
    const first = users(t.snap())[0];
    const url = first.imgs[0].url as string;
    failOnce(t.agent, 'turn', { status: 400, code: 'bad_request' });
    t.eng.retryMsg(first.id);
    await t.flush(2000);
    t.eng.takeBack(users(t.snap()).find((x: any) => x.state === 'notSent').id);
    t.eng.unattach(t.snap().att.items[0]!.id);
    expect(t.revoked).not.toContain(url);
    t.eng.newConversation();
    expect(t.revoked.filter((x) => x === url)).toHaveLength(1);
  });

  it('the conversation ending while the draft holds a taken-back shared image lets its thumbnail go once', async () => {
    const t = await setup({ script: [[{ k: 'fail', code: 'provider_error' }]] });
    t.eng.attach([image('original.png')], 'inspect');
    t.eng.send('inspect');
    await t.flush(2000);
    const first = users(t.snap())[0];
    const url = first.imgs[0].url as string;
    failOnce(t.agent, 'turn', { status: 400, code: 'bad_request' });
    t.eng.retryMsg(first.id);
    await t.flush(2000);
    t.eng.takeBack(users(t.snap()).find((x: any) => x.state === 'notSent').id);
    expect(t.snap().att.items.map((x: any) => x.url)).toEqual([url]);
    t.eng.end();
    expect(t.revoked.filter((x) => x === url)).toHaveLength(1);
  });

  it('Edit on a refused message no other message shares, then removing its image, lets the thumbnail go at once', async () => {
    const t = await setup();
    t.eng.attach([image('bad.png')], 'Look');
    failOnce(t.agent, 'turn', { status: 400, code: 'bad_request' });
    t.eng.send('Look');
    await t.flush(2000);
    const u = users(t.snap())[0];
    const url = u.imgs[0].url as string;
    expect(t.eng.takeBack(u.id)).toBe('Look');
    t.eng.unattach(t.snap().att.items[0]!.id);
    expect(t.revoked).toEqual([url]);
  });

  it('when the history holds more rows of a text than were sent from here (another tab), no row of it gets chips', () => {
    const pic = image('mine.png');
    const img = pic.ok && pic.att.kind === 'image' ? pic.att : null;
    const msg = (id: string, at: number, extra: Partial<C.UserMsg> = {}): C.UserMsg => ({ id, text: 'look', at, key: '', via: 'turn', state: 'sent', turnId: null, commandId: null, reason: '', ...extra });
    const hist = [msg('h1', 9), msg('h2', 9), msg('h3', 9)];
    const had = [msg('a', 1), msg('b', 2, { imgs: [img as A.Img] })];
    expect(keepAtt(hist, had).map((u) => u.imgs)).toEqual([undefined, undefined, undefined]);
    // Equal counts: the n-th sent is the n-th row, the ones without files counted too.
    expect(keepAtt(hist.slice(0, 2), had).map((u) => u.imgs?.length ?? 0)).toEqual([0, 1]);
  });

  it('a row sent from here whose history row names the same pictures as stored ones draws each picture once, and loses none', () => {
    const one = image('mine.png'), two = image('second.png');
    const img = (p: A.Prepared) => (p.ok && p.att.kind === 'image' ? p.att : null) as A.Img;
    const ID = 'a'.repeat(64);
    const msg = (id: string, at: number, extra: Partial<C.UserMsg> = {}): C.UserMsg => ({ id, text: 'look', at, key: '', via: 'turn', state: 'sent', turnId: null, commandId: null, reason: '', ...extra });
    const stored = (n: number): C.HistPic[] => Array.from({ length: n }, (_, i) => ({ id: ID, name: `p${i}.png`, media: 'image/png' }));
    // The same count: this page's chips stand for the stored pictures (no second copy, nothing read again).
    const same = keepAtt([msg('h1', 9, { pics: stored(1) })], [msg('a', 1, { imgs: [img(one)] })])[0]!;
    expect([same.imgs?.length ?? 0, same.pics?.length ?? 0]).toEqual([1, 0]);
    // The agent's record holds another count than this page sent: the record stays, this page's chips are not put beside it.
    const more = keepAtt([msg('h1', 9, { pics: stored(2) })], [msg('a', 1, { imgs: [img(one)] })])[0]!;
    expect([more.imgs?.length ?? 0, more.pics?.length ?? 0]).toEqual([0, 2]);
    const fewer = keepAtt([msg('h1', 9, { pics: stored(1) })], [msg('a', 1, { imgs: [img(one), img(two)] })])[0]!;
    expect([fewer.imgs?.length ?? 0, fewer.pics?.length ?? 0]).toEqual([0, 1]);
    // A row with no chips from here (another tab sent it, or the page was reloaded) keeps its stored pictures.
    const other = keepAtt([msg('h1', 9, { pics: stored(1) })], [])[0]!;
    expect([other.imgs?.length ?? 0, other.pics?.length ?? 0]).toEqual([0, 1]);
    // Not paired (the counts of that text differ): no chip moves, the stored pictures stay on their rows.
    const loose = keepAtt([msg('h1', 9, { pics: stored(1) }), msg('h2', 9)], [msg('a', 1, { imgs: [img(one)] })]);
    expect(loose.map((u) => [u.imgs?.length ?? 0, u.pics?.length ?? 0])).toEqual([[0, 1], [0, 0]]);
  });

  it('closing the panel while picked files are still being read says they went, and a second close keeps the note', async () => {
    const t = await setup();
    const r = t.eng.beginRead();
    t.eng.suspend();
    expect(t.snap().att).toMatchObject({ items: [], dropped: 'ask.attDroppedClosed', reading: false });
    t.eng.resume();
    t.eng.attach([image('late.png')], '', r);
    expect(t.snap().att.items).toEqual([]);
    expect(t.revoked).toHaveLength(1);
    t.eng.suspend();
    expect(t.snap().att.dropped).toBe('ask.attDroppedClosed');
  });
});

describe('Retry is the engine\'s own rule, not only the button\'s', () => {
  it('a turn read back from the history (its images gone) is refused: nothing is sent and the message stays', async () => {
    const t = await setup({ script: [[{ k: 'fail', code: 'provider_error' }]] });
    t.eng.attach([image('original.png')], 'inspect');
    t.eng.send('inspect');
    await t.flush(2000);
    expect(calls(t.agent, 'turn')).toHaveLength(1);
    const t2 = new AskEngine(slot, t.agent, t.store, t.clock);
    t2.revokeUrl = () => {};
    t2.open();
    await t.flush(2000);
    const back = users(t2.getSnapshot());
    expect(back).toHaveLength(1);
    expect(back[0].imgs).toBeUndefined();
    expect(t2.getSnapshot().conv.turns.map((x) => x.history)).toEqual([true]);
    expect(C.blocks(t2.getSnapshot().conv, 0).some((b: any) => b.k === 'outcome' && b.retry)).toBe(false);
    const before = JSON.stringify(t2.getSnapshot().conv);
    expect(t2.retryMsg(back[0].id)).toBe(false);
    await t.flush(2000);
    expect(calls(t.agent, 'turn')).toHaveLength(1);
    expect(calls(t.agent, 'create')).toHaveLength(1);
    expect(JSON.stringify(t2.getSnapshot().conv)).toBe(before);
  });

  it('a message whose turn did not fail is refused too; the failed turn\'s own prompt still retries', async () => {
    const t = await setup({ script: [[{ k: 'text', text: 'ok' }], [{ k: 'fail', code: 'provider_error' }], [{ k: 'text', text: 'ok' }]] });
    t.eng.send('first');
    await t.flush(2000);
    const done = users(t.snap())[0];
    expect(t.eng.retryMsg(done.id)).toBe(false);
    t.eng.send('second');
    await t.flush(2000);
    expect(calls(t.agent, 'turn')).toHaveLength(2);
    const failed = users(t.snap())[1];
    expect(t.eng.retryMsg(failed.id)).toBe(true);
    await t.flush(2000);
    expect(calls(t.agent, 'turn')).toHaveLength(3);
  });

  it('a failed turn marked as read from the history, or a follow-up that is not the failed turn\'s prompt, is refused', async () => {
    const t = await setup({ script: [[{ k: 'fail', code: 'provider_error' }]] });
    t.eng.send('inspect');
    await t.flush(2000);
    const eng = t.eng as any;
    const conv: C.Conv = eng.conv;
    const turn = conv.turns[0] as C.TurnBlock;
    const uid = turn.users[0] as string;
    expect(turn.s.terminal?.state).toBe('failed');
    // The same failed turn, as a history turn: refused.
    eng.conv = { ...conv, turns: [{ ...turn, history: true }] };
    expect(t.eng.retryMsg(uid)).toBe(false);
    // A follow-up that reached the failed turn: only the turn's prompt is retried.
    const f = { ...(conv.users[uid] as C.UserMsg), id: 'follow', text: 'and this' };
    eng.conv = { ...conv, users: { ...conv.users, follow: f }, turns: [{ ...turn, users: [uid, 'follow'] }] };
    expect(t.eng.retryMsg('follow')).toBe(false);
    await t.flush(2000);
    expect(calls(t.agent, 'turn')).toHaveLength(1);
    eng.conv = conv;
    expect(t.eng.retryMsg(uid)).toBe(true);
  });
});
