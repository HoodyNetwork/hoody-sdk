// why.ts: the words for a refused capability (capability.ts Reason), in one place, so every surface says the same thing.
import { makeT, useStrings, type Translate } from '../strings';
import type { Capability, Prerequisite, Reason } from './capability';
import strings from './SessionView.strings.en.json';

type Table = typeof strings;
type WhyKey = Extract<keyof Table, `sv.why.${string}`>;
type MissingKey = Extract<keyof Table, `sv.missing.${string}`>;

/** The sentence for a refused capability (empty when it is allowed), over any translator of this file's table. */
function sentence(t: Translate<Table>, c: Capability): string {
  if (c.ok) return '';
  if (c.reason === 'prerequisites') {
    const what = (c.missing ?? []).map((m: Prerequisite) => t(`sv.missing.${m}` as MissingKey)).join(', ');
    return t('sv.why.prerequisites', { what });
  }
  return t(`sv.why.${c.reason satisfies Reason}` as WhyKey);
}

/** `const why = useWhy(); why(source.can('send'))` → the sentence, or '' when it is allowed. */
export function useWhy(): (c: Capability) => string {
  const t = useStrings(strings);
  return (c) => sentence(t, c);
}

/** The same sentence outside a component (an operation that answers in words, e.g. a refused fork). */
export const whyWords = (c: Capability): string => sentence(makeT(strings), c);
