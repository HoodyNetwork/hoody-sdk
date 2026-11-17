// The API keys table at 80 columns dropped State (and kept Works in): a paused or expired key looked like any other.
// State is priority 1 now: it gives way last, after Works in.
// Each state is opened by its own address (?state=…): the merged cut opens the list on State = Active once keys
// arrive, and an address that names a State keeps it, so the same three checks hold with or without that default.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const CASES = [
  { state: 'active', name: 'ci-deploy', word: '● Active' },
  { state: 'paused', name: 'laptop-cli', word: '● Paused' },
  { state: 'expired', name: 'old-build-bot', word: '● Expired' },
] as const;

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`${cols}x${rows}: every key row shows its state`, async () => {
    for (const c of CASES) {
      s = await renderPage({ page: 'keys', cols, rows, path: `/keys?state=${c.state}` });
      const lines = (await s.settle()).split('\n');
      const line = (word: string) => lines.find((l) => l.includes(word)) ?? '';
      expect(line('Name ↑')).toContain('State');
      expect(line(c.name)).toContain(c.word);
      expect(s.failures).toEqual([]);
      s.close();
      s = null;
    }
  }, 240_000);
}
