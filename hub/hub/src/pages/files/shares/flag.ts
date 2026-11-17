// The Shared folders switch of the web Hub. It is on: the section and its entries show in every web build, whatever
// the address says (the terminal reads its own copy, flag.term.ts, which is still off).
// With it off, nothing of shares/ is shown; a fixture build (dev server, tests) may then turn it on for one page load
// with ?fxshares=1, and a production build never can: it compiles __HUB_FIXTURES__ to false, so only SHARES_UI turns
// it on there (flag.test.ts compiles both settings of the switch that way). Typed boolean, not the literal, so the
// terminal's copy, typed after this one, can hold the other value.
export const SHARES_UI = true as boolean;

/** Whether the Shared folders section and its entries show, for this page's query string. The Hub routes in the
 *  hash, so a fixture build also reads the hash's own query (`#/files?…&fxshares=1`, as the screenshot runs give it). */
export function sharesUiOn(
  search: string = typeof location === 'undefined' ? '' : location.search,
  hash: string = typeof location === 'undefined' ? '' : location.hash,
): boolean {
  if (SHARES_UI) return true;
  if (!__HUB_FIXTURES__) return false;
  const q = hash.indexOf('?');
  const inHash = q < 0 ? '' : hash.slice(q + 1);
  return new URLSearchParams(search).get('fxshares') === '1' || new URLSearchParams(inHash).get('fxshares') === '1';
}
