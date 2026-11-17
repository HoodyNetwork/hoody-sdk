// Where payments are made. The live terminal Hub sends none and hands that step to the web Hub
// (moneyHandoff.term.tsx); the checkout (CheckoutDrawer.tsx) and Add funds (Funds.tsx) ask here. This is the web side:
// the web Hub is where payments are made, so nothing is handed off and nothing is drawn.
import type { ReactElement } from 'react';

/** True where this Hub sends no payment and hands it to the web Hub instead. The web: never. */
export function moneyInWebHub(): boolean {
  return false;
}

/** The hand-off of a money step to the web Hub. The web: none. */
export function MoneyHandoff(): ReactElement | null {
  return null;
}
