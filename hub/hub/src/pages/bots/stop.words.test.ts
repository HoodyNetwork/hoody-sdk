// Vitest: the words of Stop never use "turn": a person stops a reply, and the Stop confirmation, its row menu and its
// answers say so in the same word.
import { describe, expect, it } from 'vitest';
import strings from './strings.en.json';

const KEYS = ['bot.stopAt', 'bot.stopMoved', 'bot.stopLater', 'bot.stopMenu', 'bot.stopEnded', 'bot.stopBody', 'say.queued'] as const;

describe('the words of Stop', () => {
  it.each(KEYS)('%s says "reply", never "turn"', (k) => {
    expect(strings[k]).not.toMatch(/\bturns?\b/i);
    expect(strings[k]).toMatch(/\brepl(y|ies)\b/i);
  });

  it('a link with no address says what happens next', () => {
    expect(strings['link.any.noAddress']).toMatch(/check back later/);
  });

  it('short state and kind labels fit their column and do not repeat the row', () => {
    expect(strings['chan.state.needs_owner'].length).toBeLessThanOrEqual(10);
    expect(strings['log.kind.provider']).not.toMatch(/model/i);
  });
});
