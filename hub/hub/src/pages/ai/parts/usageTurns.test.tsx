// Details > Usage fed by the chat's streamed responses: the turns the snapshot lists (ConvSnapshot.usage), how each is named, and the tab
// on a live store. Which turns are listed is the conversation's (ask conv.test.ts usageTurns, source.test.ts).
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ConvSnapshot, ConversationSource } from '@kit/agent/source';
import { createUsageStore } from '@kit/agent/useUsage';
import usageStrings from '@kit/agent/Usage.strings.en.json';
import strings from './Conversation.strings.en.json';
import { UsageTurns, usageTurnsOf } from './usageTurns';

const turn = (n: number) => `Turn ${n}`;
type Entry = NonNullable<ConvSnapshot['usage']>[number];
const entry = (key: string, turn: number, asked: string, responses: Entry['responses']): Entry => ({ key, turn, asked, responses });
const r = (input: number, output: number, cacheRead: number) => ({ input, output, cacheRead, cacheWrite: 0 });

describe('usageTurnsOf: one entry per turn the snapshot lists', () => {
  it('is named by the start of the turn\'s own question, in order, keyed by the turn', () => {
    const out = usageTurnsOf([entry('r0:0', 1, 'Build me a dashboard', [r(1, 1, 0)]), entry('r1:0', 2, 'And the disk?', [r(2, 2, 0), r(3, 3, 0)])], turn);
    expect(out.map((t) => [t.key, t.label, t.responses.length])).toEqual([['r0:0', 'Build me a dashboard', 1], ['r1:0', 'And the disk?', 2]]);
  });
  it('no usage (a source that lists none, a chat read from history) is no entry', () => {
    expect(usageTurnsOf(undefined, turn)).toEqual([]);
    expect(usageTurnsOf([], turn)).toEqual([]);
  });
  it('a long or blank question: one line cut at 48 characters, or "Turn N" (its place among the turns shown) when nothing visible is left', () => {
    const long = 'x'.repeat(60);
    const [a, b] = usageTurnsOf([entry('r0:0', 1, `  ${long}\n  more `, [r(1, 1, 0)]), entry('r2:0', 3, ' \n ', [r(1, 1, 0)])], turn);
    expect(a!.label).toBe('x'.repeat(48) + '…');
    expect(b!.label).toBe('Turn 3');
  });
  it('the label is cut at a whole character: an emoji crossing the 48th position is not split', () => {
    const [a] = usageTurnsOf([entry('r0:0', 1, 'x'.repeat(47) + '\u{1F469}\u200D\u{1F4BB}tail', [r(1, 1, 0)])], turn);
    expect(a!.label).toBe('x'.repeat(47) + '\u{1F469}\u200D\u{1F4BB}' + '\u2026');
    expect(a!.label).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
  it('a question not shown (above the read part) is "Turn N" by the turn\'s place, never another turn\'s question', () => {
    expect(usageTurnsOf([entry('r0:0', 1, 'First question', [r(1, 1, 0)]), entry('r1:0', 2, '', [r(2, 2, 0)])], turn).map((t) => t.label)).toEqual(['First question', 'Turn 2']);
  });
});

const row = (id: number, o: Record<string, unknown> = {}) => ({
  id, ts: 1760000000 + id, turn_id: `r${id}`, attempt: -1, model: 'model-a', provider: 'p', input_tokens: 10, output_tokens: 5, cache_read_tokens: 90,
  cache_write_tokens: 0, cost_usd: 0.25, latency_ms: 800, success: true, error_code: '', kind: 'chat', ...o,
});
const totals = { calls: 3, input_tokens: 30, output_tokens: 15, cache_read_tokens: 270, cache_write_tokens: 0, cost_usd: 0.75, cache_read_pct: 90, by_kind: {} };
const settle = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };
const words = (k: keyof typeof usageStrings, v: Record<string, string> = {}) => usageStrings[k].replace(/\{\{(\w+)\}\}/g, (_, n: string) => v[n] ?? '');

function sourceOf(usage: Entry[]): ConversationSource {
  const snap = { facts: {}, title: null, blocks: [], gates: [], usage } as unknown as ConvSnapshot;
  return { kind: 'fake', ref: { key: 's1' }, snapshot: () => snap, subscribe: () => () => undefined, watch: () => () => undefined, can: () => ({ ok: false }) } as unknown as ConversationSource;
}
async function show(usage: Entry[], items: unknown[]) {
  const q: Array<(a: unknown) => void> = [];
  const store = createUsageStore({ api: { session: () => new Promise((res) => q.push(res)) } as never, id: 's1' });
  render(<UsageTurns source={sourceOf(usage)} store={store} />);
  await settle();
  await act(async () => { q[0]!({ ok: true, body: { items, totals, next_after_id: items.length, has_more: false } }); });
  await settle();
}
afterEach(() => cleanup());

describe('the Usage tab on the open chat', () => {
  it('requests whose four counts equal a streamed response sit under that turn\'s question; the rest stay under Other spend', async () => {
    await show(
      [entry('r0:0', 1, 'Build me a dashboard', [r(10, 5, 90)])],
      [row(1), row(2, { input_tokens: 999, turn_id: 'helper' })],
    );
    const turns = screen.getByRole('region', { name: words('turns.title') });
    expect(within(turns).getByText('Build me a dashboard')).toBeTruthy();
    expect(within(turns).getByText((_, el) => el?.tagName === 'SPAN' || el?.tagName === 'P' || el?.tagName === 'DIV' ? (el.textContent ?? '').startsWith(words('turn.requests.one')) && el.children.length === 0 : false)).toBeTruthy();
    expect(screen.getByText(words('other.note'))).toBeTruthy();
  });
  it('history plus a live turn with the same counts: the live response takes the newest equal request, the history request stays under Other spend', async () => {
    await show(
      [entry('r0:0', 1, 'live question', [r(10, 5, 90)])],
      [row(1, { turn_id: 'old', model: 'old-model' }), row(2, { turn_id: 'live', model: 'live-model' })],
    );
    const turns = screen.getByRole('region', { name: words('turns.title') });
    expect(within(turns).getByText('live question')).toBeTruthy();
    expect(within(turns).getByText('live-model')).toBeTruthy();
    expect(within(turns).queryByText('old-model')).toBeNull();
    const other = screen.getByRole('region', { name: words('other.title') });
    expect(within(other).getByText('old-model')).toBeTruthy();
  });
  it('a chat read from history (no turn listed) draws no turns section: every request is under Other spend', async () => {
    await show([], [row(1), row(2)]);
    expect(screen.queryByRole('region', { name: words('turns.title') })).toBeNull();
    expect(screen.getByText(words('other.note'))).toBeTruthy();
  });
  it('the fallback name is the Conversation strings\' "Turn N"', async () => {
    await show([entry('r0:0', 1, '', [r(10, 5, 90)])], [row(1)]);
    expect(screen.getByText(strings['conv.usage.turn'].replace('{{n}}', '1'))).toBeTruthy();
  });
});
