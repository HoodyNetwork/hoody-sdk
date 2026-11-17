import { useSyncExternalStore } from 'react';
import { UsageTab, useStrings, type ConvSnapshot, type ConversationSource, type UsageStore, type UsageTurn } from '@kit';
import strings from './Conversation.strings.en.json';

const ASKED = 48;
const GRAPHEMES = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
/** The start of what the person asked, one line, cut at a whole character; empty when the text has no visible character. */
function startOf(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim();
  const chars = GRAPHEMES ? Array.from(GRAPHEMES.segment(one), (g) => g.segment) : Array.from(one);
  return chars.length > ASKED ? chars.slice(0, ASKED).join('').trimEnd() + '\u2026' : one;
}
/**
 * The turns this tab watched run, for Details > Usage: one entry per turn the conversation lists with its streamed responses
 * (ConvSnapshot.usage), labelled with the start of the turn's own first question, or "Turn N" when it has none shown. A turn the tab did
 * not see run (a chat opened from history) is not listed: its requests stay under Other spend, never placed by guess.
 */
export function usageTurnsOf(usage: ConvSnapshot['usage'], turnLabel: (n: number) => string): UsageTurn[] {
  return (usage ?? []).map((u) => ({ key: u.key, label: startOf(u.asked) || turnLabel(u.turn), responses: u.responses }));
}

/** Details > Usage fed by the open chat's streamed responses. */
export function UsageTurns({ source, store }: { source: ConversationSource; store: UsageStore }) {
  const t = useStrings(strings);
  const snap = useSyncExternalStore(source.subscribe, source.snapshot);
  return <UsageTab store={store} turns={usageTurnsOf(snap.usage, (n) => t('conv.usage.turn', { n: String(n) }))} />;
}
