// Usage.pure: the figures and fixed words of Details → Usage, shared by the web tab and the terminal tab (see Usage.tsx).
import type { Fact, useStrings } from '@kit';
import { cachePct, type sideOf, type speechOf } from './usage';
import type { UsageView } from './useUsage';
import type strings from './Usage.strings.en.json';

export type UsageWords = ReturnType<typeof useStrings<typeof strings>>;
// The formatters are built on first use, never at load: this module does nothing when imported (kitpure).
let usdFmt: Intl.NumberFormat | null = null;
let intFmt: Intl.NumberFormat | null = null;
const usd = (): Intl.NumberFormat => (usdFmt ??= new Intl.NumberFormat('en', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }));
export const int = { format: (n: number): string => (intFmt ??= new Intl.NumberFormat('en')).format(n) };
export const money = (n: number) => (n > 0 && n < 0.0001 ? '<$0.0001' : usd().format(n));
const KNOWN_ERRORS = ['timeout', 'rate_limit', 'auth', 'network', 'provider', 'canceled', 'context_overflow', 'provider_incomplete_response', 'max_tokens', 'bad_tool_args', 'unknown'] as const;
export const errWord = (t: UsageWords, code: string): string => t(`req.err.${(KNOWN_ERRORS as readonly string[]).includes(code) ? code : 'unknown'}` as 'req.err.unknown');

/** The totals' facts and the speech figures the note under them names. */
export function usageFacts(t: UsageWords, v: UsageView, speech: ReturnType<typeof speechOf>, side: ReturnType<typeof sideOf>): { facts: Fact[]; speechCost: number; speechCalls: number } {
  const tot = v.totals;
  const pct = tot ? cachePct(tot.input, tot.cacheRead, tot.cacheWrite) : null;
  // The agent's cost covers chat and compaction rows. Speech is its own total (the whole chat's, not only the rows read);
  // side questions are in no total, so the rows read supply them, and while rows are unread the figure is a floor.
  const speechCost = tot?.speech ? tot.speech.cost : speech.cost;
  const speechCalls = tot?.speech ? tot.speech.calls : speech.calls;
  const costAll = tot ? tot.cost + speechCost + side.cost : 0;
  const facts: Fact[] = tot
    ? [
        { label: t('facts.calls'), value: int.format(tot.calls) },
        { label: t('facts.input'), value: int.format(tot.input + tot.cacheRead + tot.cacheWrite) },
        { label: t('facts.output'), value: int.format(tot.output) },
        { label: t('facts.cache'), value: pct === null ? t('cache.none') : t('cache.pct', { pct: String(Math.round(pct)) }) },
        { label: t('facts.cost'), value: v.more ? t('cost.atLeast', { cost: money(costAll) }) : money(costAll) },
      ]
    : [];
  return { facts, speechCost, speechCalls };
}
