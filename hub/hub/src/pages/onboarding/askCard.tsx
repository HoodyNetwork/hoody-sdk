// The question card of the onboarding page: one question at a time in the load screen's question block, with kit
// choice controls. A single choice is a radio group; several is a check group that says its limit in words. Next
// sends the picks and Skip sends a skip; both show the next question at once and say nothing about the send.
import { Button, Checkbox, CheckboxGroup, LinkButton, RadioGroup, useStrings, type LoadAsk } from '@kit';
import { useState } from 'react';
import { links as ai } from '../ai/links';
import type { Asking } from './ask';
import { canPick, pick, type Question, type Suggestion } from './questions';
import strings from './strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;
type Key = keyof typeof strings;
// The words of a question are looked up by its key and version: questions.ts lists only those this file holds.
const word = (t: T, q: Question, part: string): string => t(`q.${q.key}.v${q.version}.${part}` as Key);

const SUGGEST_HREF: Readonly<Record<Suggestion, string>> = {
  claude: ai.section('claude'),
  accounts: ai.section('accounts'),
  key: ai.connect(),
  allowance: ai.section('allowance'),
};

/**
 * The load screen's question block for what is asked now, or undefined when there is nothing to show.
 * `accent`: Next is the page's accent button; false once the page has its own (Open my computer), so there is one.
 */
export function useAskBlock(asking: Asking, o: { accent: boolean; aiServed: boolean }): LoadAsk | undefined {
  const t = useStrings(strings);
  const { question: q } = asking;
  // The picks belong to one question: another question starts empty.
  const [held, setHeld] = useState<{ key: string; picked: readonly string[] }>({ key: '', picked: [] });
  const picked = q && held.key === q.key ? held.picked : [];

  if (!q) {
    const s = asking.suggestion;
    if (!s || !o.aiServed) return undefined;
    return {
      label: t('suggest.label'),
      place: t('suggest.place'),
      title: t(`suggest.${s}.title`),
      actions: (
        <LinkButton variant="secondary" iconEnd="arrow-right" href={SUGGEST_HREF[s]}>
          {t(`suggest.${s}.go`)}
        </LinkButton>
      ),
    };
  }

  const set = (next: readonly string[]) => setHeld({ key: q.key, picked: next });
  const none = picked.length === 0;
  return {
    label: t('ask.label'),
    place: t('ask.place', { n: asking.at, total: asking.total }),
    steps: { at: asking.at, total: asking.total },
    title: word(t, q, 'title'),
    hint: q.max === 1 ? undefined : q.max < q.options.length ? t('ask.upTo', { max: q.max }) : t('ask.any'),
    children: (ids) =>
      q.max === 1 ? (
        <RadioGroup aria-labelledby={ids.title} options={q.options.map((o) => ({ value: o, label: word(t, q, `o.${o}`) }))} value={picked[0]} onChange={(v) => set([v])} />
      ) : (
        <CheckboxGroup aria-labelledby={ids.title} aria-describedby={ids.hint} value={[...picked]} onChange={(next) => set(pick(q, picked, next))}>
          {q.options.map((o) => (
            <Checkbox key={o} value={o} label={word(t, q, `o.${o}`)} isDisabled={!canPick(q, picked, o)} />
          ))}
        </CheckboxGroup>
      ),
    actions: (
      <>
        <Button variant={o.accent ? 'primary' : 'secondary'} onPress={() => asking.answer(picked)} isDisabled={none} disabledReason={none ? t('ask.pickFirst') : undefined}>
          {t('ask.next')}
        </Button>
        <Button variant="ghost" onPress={asking.skip}>
          {t('ask.skip')}
        </Button>
      </>
    ),
    note: t('ask.note'),
  };
}
