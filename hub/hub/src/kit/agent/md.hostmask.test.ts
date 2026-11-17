// The real host the parser writes after words that name another host ("[example.com](…)" -> "example.com (real.host)")
// is a phishing defence. When the real host is a computer's, it holds the project's and the computer's ids: masked, as
// every shown address is (maskAddress), never written whole into the reply.
import { describe, expect, it } from 'vitest';
import { inline } from './md';

const P = 'a'.repeat(24);
const C = 'b'.repeat(24);
const HOST = `${P}-${C}-http-3000.sg1.computers.hoody.test`;

describe('the real host after misleading words', () => {
  it('a computer\'s host: its ids masked', () => {
    const r = inline(`[example.com](https://${HOST}/)`);
    const after = r.find((x) => x.k === 'text' && x.s.startsWith(' ('));
    expect(after).toEqual({ k: 'text', s: ` (aaaa…aaaa-bbbb…bbbb-http-3000.sg1.computers.hoody.test)` });
    expect(JSON.stringify(r.filter((x) => x.k === 'text'))).not.toContain(C);
  });
  it('any other host: unchanged', () => {
    const r = inline('[example.com](https://example.org/)');
    expect(r.find((x) => x.k === 'text' && x.s.startsWith(' ('))).toEqual({ k: 'text', s: ' (example.org)' });
  });
});
