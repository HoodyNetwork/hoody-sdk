// Where a subscription row's money action (Pay now, Retry, Upgrade) is drawn, in the terminal. A terminal has few
// cells: the table drops columns to fit, the last one first, and the web's Actions column was the first to go, leaving
// the action only in the ⋯ menu at 80 to about 150 columns. The actions cell is never dropped (the table takes its
// cells before it plans the columns), so the terminal draws the money action there, as the row's inline action.
import type * as Web from './rowMoney';

export const moneyActionInline: typeof Web.moneyActionInline = () => true;
