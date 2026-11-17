// copyReply: the typed "/copy [N]" copies a finished reply's own text once, or says why nothing was copied.
import { afterEach, describe, expect, it } from 'vitest';
import { copyReply } from './copyReply';
import type { ConvSnapshot } from './source';

const reply = (turn: number, text: string, done = true) => ({ k: 'reply', id: `r${turn}-${text}`, turn, text, final: done, streaming: !done }) as unknown as ConvSnapshot['blocks'][number];
const written: string[] = [];
let refuse = false;
Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (s: string) => (refuse ? Promise.reject(new Error('denied')) : (written.push(s), Promise.resolve())) } });
afterEach(() => { written.length = 0; refuse = false; });

describe('copyReply', () => {
  const blocks = [reply(0, 'first'), reply(1, 'second, part'), reply(1, 'second'), reply(2, 'writing', false)];
  it('no words: the last finished reply, never one still being written', async () => {
    expect(await copyReply(blocks, '')).toEqual({ k: 'copied' });
    expect(written).toEqual(['second']);
  });
  it('N: the reply that closes finished turn N', async () => {
    expect(await copyReply(blocks, '1')).toEqual({ k: 'copied', n: 1 });
    expect(written).toEqual(['first']);
  });
  it('copies nothing for words, a turn not shown, or no finished reply', async () => {
    expect(await copyReply(blocks, 'two')).toEqual({ k: 'usage' });
    expect(await copyReply(blocks, '3')).toEqual({ k: 'none', n: 3 });
    expect(await copyReply([], '')).toEqual({ k: 'empty' });
    expect(written).toEqual([]);
  });
  it('a clipboard that refuses is failed', async () => {
    refuse = true;
    expect(await copyReply(blocks, '')).toEqual({ k: 'failed' });
  });
});
