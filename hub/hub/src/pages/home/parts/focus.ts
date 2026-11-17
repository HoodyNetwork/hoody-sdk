// Where focus goes when the control holding it disappears: a Home header control the person can see now. The wide
// header buttons hide on phones, where the header's More menu holds the same actions.
export function visibleHeaderControl(prefer?: string): HTMLElement | null {
  // Without layout (no box anywhere, as in a test DOM) every control counts as shown.
  const laidOut = document.documentElement.getClientRects().length > 0;
  const shown = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel)).find((b) => !laidOut || b.getClientRects().length > 0) ?? null;
  return (prefer ? shown(prefer) : null) ?? shown('[data-home-header] button');
}
