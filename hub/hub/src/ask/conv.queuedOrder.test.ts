// Vitest: conv.ts. A follow-up queued while an approval waits reaches the turn only once the approval is answered; the decided
// line of that approval stays above it (the decision is the earlier turn's, never an answer to the message).
import { describe, expect, it } from 'vitest';
import * as C from './conv';

const sent = (id: string, text: string): C.UserMsg => ({ id, text, at: 1, key: 'k' + id, via: 'command', state: 'queued', turnId: null, commandId: null, reason: '' });

describe('a decided card and a follow-up that joined at the same step', () => {
  it('the card decided before the follow-up joined is drawn above it', () => {
    let c = C.addTurn(C.emptyConv('s1'), { turnId: 't1', user: 'p', now: 1 });
    c = { ...c, users: { ...c.users, p: { ...sent('p', 'Run the checkout tests again'), via: 'turn', state: 'sent' } } };
    c = C.addUser(c, sent('q', 'Use the staging database instead'));
    c = C.addDecided(c, { kind: 'deny', tool: 'bash', text: 'npm install chart.js' });
    c = C.commitIntoTurn(c, 'q');
    const ks = C.blocks(c, 2).map((b) => (b.k === 'user' ? 'user:' + b.msg.id : b.k));
    expect(ks.indexOf('decided')).toBeGreaterThan(-1);
    expect(ks.indexOf('decided')).toBeLessThan(ks.indexOf('user:q'));
  });
  it('a card decided after the follow-up joined is drawn below it', () => {
    let c = C.addTurn(C.emptyConv('s1'), { turnId: 't1', user: 'p', now: 1 });
    c = { ...c, users: { ...c.users, p: { ...sent('p', 'Run the checkout tests again'), via: 'turn', state: 'sent' } } };
    c = C.addUser(c, sent('q', 'Use the staging database instead'));
    c = C.commitIntoTurn(c, 'q');
    c = C.addDecided(c, { kind: 'once', tool: 'bash', text: 'npm install chart.js' });
    const ks = C.blocks(c, 2).map((b) => (b.k === 'user' ? 'user:' + b.msg.id : b.k));
    expect(ks.indexOf('decided')).toBeGreaterThan(ks.indexOf('user:q'));
  });
});
