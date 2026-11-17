// Vitest: each message on the Activity log says who sent it and through which door when the agent recorded that. The door and the
// sender's name come from the log row's `sender` (set by the agent's door, never by the page); text from outside is shown plain.
import { renderPage, screen, within } from '@app/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { logOf } from './data';
import { DOORS, doorOf, senderLabel, senderWho } from './logic';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const open = () => renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}` });
const log = async () => within(await screen.findByRole('list', { name: strings['activity.title'] }));

describe('door and sender', () => {
  it('knows the doors the agent names, calls another one "other" and none "direct"', () => {
    expect([...DOORS]).toEqual(['tui', 'openai', 'anthropic', 'mcp', 'voice', 'twilio', 'telegram', 'slack', 'discord']);
    for (const d of DOORS) expect(doorOf(d)).toBe(d);
    expect(doorOf('')).toBe('direct');
    expect(doorOf('carrier-pigeon')).toBe('other');
  });
  it('a key sender is named by the key, a chat app sender by its display name', () => {
    expect(senderWho('key:website widget')).toEqual({ key: true, name: 'website widget' });
    expect(senderWho('Sam')).toEqual({ key: false, name: 'Sam' });
    expect(senderWho('  ')).toEqual({ key: false, name: '' });
    expect(senderWho('key:')).toEqual({ key: false, name: '' });
  });
  it('the key marker is read from the recorded value itself, never from what cleaning leaves', () => {
    // A display name that only looks like the marker once invisible characters or spaces are dropped is a plain name.
    expect(senderWho('\u200bkey:Owner')).toEqual({ key: false, name: 'key:Owner' });
    expect(senderWho('  key:Owner')).toEqual({ key: false, name: 'key:Owner' });
    expect(senderWho('Key:Owner')).toEqual({ key: false, name: 'Key:Owner' });
  });
  it('outside text is made plain, scrubbed of secrets and cut', () => {
    expect(senderWho('a\u0000b\nc\u202ed').name).toBe('a b c d');
    expect(senderWho('key:' + 'x'.repeat(200)).name).toHaveLength(60);
    expect(senderWho('Sam sk-abcdefghijklmnop1234').name).toBe('Sam [hidden]');
    expect(senderWho('key:sk-abcdefghijklmnop1234').name).toBe('[hidden]');
  });
});

describe('the line under a message', () => {
  const t = (key: string, params?: Record<string, string>) => {
    const text = (strings as Record<string, string>)[key];
    return Object.entries(params ?? {}).reduce((acc, [k, v]) => acc.replace(`{{${k}}}`, v), text ?? key);
  };
  it('names the sender and the door, or only one of them, or says it was direct', () => {
    expect(senderLabel(t, { via: 'telegram', who: 'Sam' })).toBe('Sam · Telegram');
    expect(senderLabel(t, { via: 'openai', who: 'key:website widget' })).toBe('Key “website widget” · OpenAI-style link');
    expect(senderLabel(t, { via: 'voice', who: '' })).toBe('Voice');
    expect(senderLabel(t, { via: '', who: '' })).toBe('Direct message');
    expect(senderLabel(t, null)).toBe('Direct message');
    // A name with no door is shown alone: nothing says it came "directly".
    expect(senderLabel(t, { via: '', who: 'Sam' })).toBe('Sam');
  });
  it('a door the page does not know is "Another door", and its name text stays plain', () => {
    expect(senderLabel(t, { via: 'carrier-pigeon', who: '' })).toBe('Another door');
    expect(senderLabel(t, { via: 'carrier-pigeon', who: 'Sam' })).toBe('Sam · Another door');
    expect(senderLabel(t, { via: 'slack', who: '<img src=x onerror=alert(1)>' })).toBe('<img src=x onerror=alert(1)> · Slack');
  });
});

describe('the Activity log names who sent each message', () => {
  it('a chat app message shows the name and the app', async () => {
    await open();
    const l = await log();
    expect((await l.findAllByText('Sam · Telegram')).length).toBeGreaterThan(0);
  });
  it('a message through a key shows the key and the door', async () => {
    await open();
    const l = await log();
    expect((await l.findAllByText('Key “website widget” · OpenAI-style link')).length).toBeGreaterThan(0);
  });
  it('a message with no recorded door says it was direct', async () => {
    await open();
    const l = await log();
    expect((await l.findAllByText(strings['sender.direct'])).length).toBeGreaterThan(0);
  });
  it("the Bot's own replies carry no sender line", async () => {
    await open();
    const l = await log();
    const reply = (await l.findAllByText(/I opened a task to read the deploy log/))[0]!.closest('li') as HTMLElement;
    expect(within(reply).queryByText(strings['sender.direct'])).toBeNull();
    expect(reply.textContent).not.toMatch(/ · /);
  });
});

describe('reading the sender off the agent\'s log rows', () => {
  const rows = (items: unknown[]) => logOf({ items, has_more: false }).rows;
  it('a user row keeps its door and sender, the name when only that is recorded', () => {
    const [a, b] = rows([
      { seq: 1, role: 'user', text: 'hi', at: 'x', sender: { via: 'telegram', who: 'Sam', ref: { channel: 'c1', chat: '42' } } },
      { seq: 2, role: 'user', text: 'hi', at: 'x', sender: { via: 'slack', name: 'Ana' } },
    ]);
    expect(a?.sender).toEqual({ via: 'telegram', who: 'Sam' });
    expect(b?.sender).toEqual({ via: 'slack', who: 'Ana' });
  });
  it('a stop written in the owner\'s name is a runtime line, not a message: no sender, and the log shows it as a stop', () => {
    const [stop] = rows([{ seq: 1, role: 'user', kind: 'stop', text: '[stop] The owner stopped the Bot.', at: 'x', sender: { via: 'tui', who: '' } }]);
    expect(stop?.kind).toBe('stop');
    expect(stop?.sender).toBeNull();
  });
  it('a plain post, a reply and a runtime row carry no sender, and nothing else of the sender is kept', () => {
    const out = rows([
      { seq: 1, role: 'user', text: 'hi', at: 'x' },
      { seq: 2, role: 'bot', text: 'ok', at: 'x', sender: { via: 'telegram', who: 'Sam' } },
      { seq: 3, role: 'event', text: '[report] done', at: 'x' },
    ]);
    expect(out.map((r) => r.sender)).toEqual([null, null, null]);
    const [kept] = rows([{ seq: 1, role: 'user', text: 'hi', at: 'x', sender: { via: 'openai', who: 'key:w', auth: { secret: 1 }, public: { ip: '203.0.113.5' } } }]);
    expect(Object.keys(kept?.sender ?? {}).sort()).toEqual(['via', 'who']);
  });
});
