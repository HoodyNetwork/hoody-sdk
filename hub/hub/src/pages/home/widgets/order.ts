// The order moves of the Customize list: a drag drops a row at a place, and that is the same order the up/down
// buttons (one place per press) reach.

/** `keys` with `key` taken out and put back at place `to` (clamped); an unknown key leaves the order as it was. */
export function moveKeyTo(keys: readonly string[], key: string, to: number): string[] {
  const from = keys.indexOf(key);
  if (from < 0) return [...keys];
  const out = keys.filter((_, i) => i !== from);
  const at = Math.max(0, Math.min(Math.trunc(to), out.length));
  out.splice(at, 0, key);
  return out;
}

/** Where the row picked up at `from` drops with the pointer at `y`, given the middles of the rows (in order, the
 *  picked-up row's own included): past the middle of each row below (or above) it, one place further. */
export function dropIndex(mids: readonly number[], from: number, y: number): number {
  if (mids.length === 0) return 0;
  let to = from;
  for (let i = from + 1; i < mids.length; i++) if (y > (mids[i] ?? Infinity)) to = i;
  for (let i = from - 1; i >= 0; i--) if (y < (mids[i] ?? -Infinity)) to = i;
  return to;
}
