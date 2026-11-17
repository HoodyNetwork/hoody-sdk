// Vitest: the Logs page never shows the internal word for a Bot URL; the Bot call's address row is labelled "Bot URL".
import { describe, expect, it } from 'vitest';
import strings from './strings.en.json';

const table = strings as Record<string, string>;

describe('Logs: the Bot URL label', () => {
  it('labels the Bot call row "Bot URL"', () => {
    expect(table['det.bot_url']).toBe('Bot URL');
  });
  it('no user text on the page uses the internal word for a Bot URL', () => {
    expect(Object.values(table).filter((v) => /exposure/i.test(v))).toEqual([]);
  });
});
