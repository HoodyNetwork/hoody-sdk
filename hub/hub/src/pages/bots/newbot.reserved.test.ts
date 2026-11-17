// Vitest (forms-bots): a new Bot's identifier may not be one of the agent's route words under /bots/{id}/ (the agent
// answers 400 bad_request, field id: its own reserved-id check). The name rule says so
// before the send.
import { describe, expect, it } from 'vitest';
import { RESERVED_BOT_IDS, nameProblem } from './logic';

describe('New Bot name: reserved identifiers', () => {
  it.each(RESERVED_BOT_IDS.map((id) => [id]))('%s is reserved', (id) => {
    expect(nameProblem(id, [])).toBe('reserved');
  });
  it('is judged on the identifier the name becomes (case, spaces)', () => {
    expect(nameProblem('Channels', [])).toBe('reserved');
    expect(nameProblem(' Channel Settings ', [])).toBe('reserved');
  });
  it('a name that only holds a reserved word is fine', () => {
    expect(nameProblem('channels-helper', [])).toBeNull();
    expect(nameProblem('my messages', [])).toBeNull();
  });
  it('reserved is said before taken, and the earlier answers stand', () => {
    expect(nameProblem('messages', ['messages'])).toBe('reserved');
    expect(nameProblem('', [])).toBe('empty');
    expect(nameProblem('!!!', [])).toBe('bad_id');
    expect(nameProblem('Atlas', ['atlas'])).toBe('taken');
  });
});
