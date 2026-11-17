// The agent page's "New chat with this agent" goes to New chat with the agent named in `?agent=` (links.ts).
import { describe, expect, it } from 'vitest';
import { links } from '../links';

describe('links.newChatWith', () => {
  it('names the agent in ?agent=, encoded', () => {
    const of = (links as Record<string, unknown>).newChatWith as ((name: string) => string) | undefined;
    expect(of?.('reviewer')).toBe('/ai/new?agent=reviewer');
    expect(of?.('a b&c')).toBe('/ai/new?agent=a%20b%26c');
  });
});
