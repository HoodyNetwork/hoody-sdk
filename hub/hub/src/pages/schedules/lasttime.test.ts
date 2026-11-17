// Vitest: a last result that carries a time ("Last started …", "Last run ended …") names that time. No last-result
// text, long or short, ever shows an unfilled {{placeholder}}.
import { describe, expect, it } from 'vitest';
import { lastShort, lastText } from './parts/words';
import strings from './strings.en.json';

// As the kit fills: a value it is not given stays as written ({{at}}), which is what a person would see.
const t = (k: string, v?: Record<string, unknown>): string => (strings as Record<string, string>)[k]!.replace(/\{\{(\w+)\}\}/g, (m, n: string) => (v && n in v ? String(v[n]) : m));
const T = t as unknown as Parameters<typeof lastText>[0];
const AT = Date.UTC(2026, 10, 14, 5, 18);
const when = (at: number) => (at === AT ? 'Today 05:18' : 'other');

describe('last result with its time', () => {
  it('Last started and Last run ended name the time', () => {
    expect(lastText(T, { k: 'started', at: AT }, when)).toBe(t('last.started', { at: 'Today 05:18' }));
    expect(lastText(T, { k: 'ended_at', at: AT }, when)).toBe(t('last.ended_at', { at: 'Today 05:18' }));
    expect(lastShort(T, { k: 'started', at: AT }, when)).not.toContain('{{');
  });

  it('no last-result kind leaves a placeholder, with or without a time', () => {
    const kinds = ['worked', 'failed', 'running', 'lost', 'no_reports', 'results_down', 'needs_cron', 'chat', 'timeout', 'skipped', 'load_error', 'incompatible', 'problem', 'started', 'not_started', 'ended_at', 'not_yet', 'none_since', 'unknown'];
    for (const k of kinds) {
      for (const at of [AT, null]) {
        const l = { k, at } as Parameters<typeof lastText>[1];
        expect(lastText(T, l, when), k).not.toContain('{{');
        expect(lastShort(T, l, when), k).not.toContain('{{');
      }
    }
  });
});
