// AskButtonName, the one rule the top bar's AI button and the phone bar's AI tab use.
import { describe, expect, it } from 'vitest';
import { askButtonName } from './askName';

const W = { ask: 'Agent', waiting: 'Agent, waiting for you' };

describe('askButtonName', () => {
  it('a count that already names the waiting ones: Agent, then the count', () => {
    expect(askButtonName(W, true, '1 conversation running, 1 needs you', true)).toBe('Agent, 1 conversation running, 1 needs you');
  });
  it('a gate elsewhere: the waiting words, then the count', () => {
    expect(askButtonName(W, true, '2 conversations running', false)).toBe('Agent, waiting for you, 2 conversations running');
  });
  it('no count shown (the panel is open) while a gate waits here: the waiting words', () => {
    expect(askButtonName(W, true, '', true)).toBe('Agent, waiting for you');
  });
  it('nothing waiting: Agent, with the count when shown', () => {
    expect(askButtonName(W, false, '1 conversation running', false)).toBe('Agent, 1 conversation running');
    expect(askButtonName(W, false, '', false)).toBe('Agent');
  });
});
