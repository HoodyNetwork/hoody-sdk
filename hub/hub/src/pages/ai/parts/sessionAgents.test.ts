// namesOffered: the agents Details → Session lets a chat switch to, from one GET /agents answer.
import { describe, expect, it } from 'vitest';
import { namesOffered } from './sessionAgents';

describe('namesOffered', () => {
  it('lists the agents by name and leaves the product-owned ones out', () => {
    const answer = { items: [{ name: 'reviewer' }, { name: 'bot', provenance: 'product-owned (read-only)' }, { name: 'general', provenance: 'user' }] };
    expect(namesOffered(answer)).toEqual(['general', 'reviewer']);
  });
  it('an empty list is an empty list', () => {
    expect(namesOffered({ items: [] })).toEqual([]);
  });
  it('an answer that is not a list, or has a malformed row, is null (a failed read), never a shorter list', () => {
    expect(namesOffered({})).toBeNull();
    expect(namesOffered(null)).toBeNull();
    expect(namesOffered({ items: [{ name: 'general' }, { name: 'Bad Name' }] })).toBeNull();
    expect(namesOffered({ items: [{ name: 'a', max_turns: 'x' }] })).toBeNull();
  });
});
