// chats.attention.test.ts: the chat list's marks for a chat the AI page let go while its turn ran (core chat-attention
// notes): "Turn ended" once idle (never "finished"), "Closed" once closed, and the usual marks otherwise.
import { describe, expect, it } from 'vitest';
import { chatRows, keyOf, type Session } from './chats.logic';
import strings from './Pane.strings.en.json';

const R = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const NOW = Date.parse('2026-11-08T12:00:00Z');
const row = (id: string, state?: string, gate = false): Session => ({
  id, realm: R, firstMessage: 'Build ' + id, cwd: '/home/ada', startedAt: NOW - 60_000, lastAt: NOW - 60_000, claude: false,
  ...(state !== undefined ? { state } : {}), pendingGate: gate, origin: null,
});
const marks = (sessions: Session[], noted: Map<string, string | undefined>, states = new Map<string, string>()) =>
  Object.fromEntries(chatRows({ sessions, gates: [], bots: [], delegates: new Map(), states, now: NOW, noted }).map((r) => [r.sid, r.mark]));

describe('chat marks of noted chats', () => {
  it('a noted chat that went running -> idle reads ended; closed reads closed; one still running keeps running', () => {
    const noted = new Map([[keyOf(R, 'a'), 'running'], [keyOf(R, 'b'), 'running'], [keyOf(R, 'c'), 'running']]);
    expect(marks([row('a', 'idle'), row('b', 'closed'), row('c', 'running'), row('d', 'idle')], noted)).toEqual({ a: 'ended', b: 'closed', c: 'running', d: null });
  });
  it('needs you wins over a note; an older agent\'s row (no state) takes the note\'s last state', () => {
    const noted = new Map([[keyOf(R, 'a'), 'running'], [keyOf(R, 'b'), 'idle']]);
    expect(marks([row('a', 'idle', true), row('b')], noted)).toEqual({ a: 'needs', b: 'ended' });
  });
  it('the words: "Turn ended" and "Closed", never "finished" or a bare "Ended"', () => {
    expect(strings['mark.ended']).toBe('Turn ended');
    expect(strings['mark.closed']).toBe('Closed');
  });
});
