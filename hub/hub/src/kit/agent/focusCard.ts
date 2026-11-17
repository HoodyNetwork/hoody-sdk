// Where focus goes when a gate's card is brought to the person. One rule for Show and for a sheet that
// closes because a gate arrived:
//   'control': the card's first enabled control that is not inside a code block (the code's Copy button is not the
//     decision): an input, a textarea, a select, a button or a link. Y and N work from there, so only a person who
//     pressed Show on purpose lands here.
//   'card': the card itself, which takes focus by script only. No key decides anything from here, so a person still
//     typing in the sheet that just closed cannot answer by accident.
// A card with nothing enabled in it (every control waiting on a decision on its way) is focused as itself.
const CONTROLS = 'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), a[href]';

export function focusCard(wrap: HTMLElement, how: 'control' | 'card' = 'control'): void {
  const card = wrap.querySelector<HTMLElement>('[data-ask-gate]') ?? wrap;
  if (how === 'control') {
    const target = Array.from(card.querySelectorAll<HTMLElement>(CONTROLS)).find((el) => !el.closest('figure'));
    if (target) { target.focus({ preventScroll: true }); return; }
  }
  if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '-1');
  card.focus({ preventScroll: true });
}
