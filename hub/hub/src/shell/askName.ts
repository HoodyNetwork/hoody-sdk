// The AI entry's accessible name, one rule for the top bar's AI button and the phone bar's AI tab: "AI", or the
// waiting words (which already start with AI), then the running count while the panel is closed. The count is the Ask
// panel's own words; when they already say how many need you (the shown computer's gate), the waiting words would say it
// twice, so the name is "AI, <count>". A gate waiting on another computer only keeps the waiting words.

/** words: the button's plain and waiting names. waiting: a gate waits on any computer. count: the running count's
 *  words, '' while not shown. countSaysWaiting: those words already name the waiting ones. */
export function askButtonName(words: { ask: string; waiting: string }, waiting: boolean, count: string, countSaysWaiting: boolean): string {
  const head = waiting && !(count && countSaysWaiting) ? words.waiting : words.ask;
  return count ? `${head}, ${count}` : head;
}
