// A question card's choices, shared by the web card and the terminal card: the agent's options, then the card's own free
// answer ("Something else", which opens a text field). An agent that already offers a free-answer choice of its own
// ("Something else (I'll describe it)", "Other") keeps its words, and that choice opens the card's text field: the card adds
// no second one.

/** The radio value of the free answer. It never equals a listed option's value, which is 'o' + the option (an option may
 *  be any text, even one that looks like a marker). */
export const ELSE = 'e';
export const optionValue = (o: string): string => `o${o}`;

/** "Something else" or "Other", in any case, alone or with one bracketed note, and closing punctuation. Never a longer
 *  label ("Other branch"): that is a listed option and is sent as written. */
const FREE = /^(?:something else|other)\s*(?:\([^()]*\)|\[[^[\]]*\])?\s*[.:…]*$/i;
export function isFreeAnswer(option: string): boolean {
  return FREE.test(option.trim());
}

/** The radios for one question: each listed option, the agent's first free-answer choice standing for the free answer,
 *  and the card's own free answer (`own`) only when the agent offers none. */
export function questionChoices(options: readonly string[], label: (o: string) => string, own: string): { value: string; label: string }[] {
  const free = options.findIndex(isFreeAnswer);
  const out = options.map((o, i) => ({ value: i === free ? ELSE : optionValue(o), label: label(o) }));
  return free >= 0 ? out : [...out, { value: ELSE, label: own }];
}
