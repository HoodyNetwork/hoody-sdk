// Where a subscription row's money action (Pay now, Retry, Upgrade) is drawn. The web: in the row's own Actions column,
// as a button. The terminal draws it elsewhere (rowMoney.term.ts).

/** True where the money action is the row's inline action, drawn in the actions cell beside the ⋯. The web: never. */
export function moneyActionInline(): boolean {
  return false;
}
