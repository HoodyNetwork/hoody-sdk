// The Shared folders switch in the terminal (flag.ts reads the page's location, which the terminal has none of). The
// switch and the rule are flag.ts's (flag.term.test.ts pins them equal); only the defaults differ: no page address,
// so no query string or hash unless a caller passes them.
import type * as Web from './flag';

export const SHARES_UI: typeof Web.SHARES_UI = false;

export const sharesUiOn: typeof Web.sharesUiOn = (search = '', hash = '') => {
  if (SHARES_UI) return true;
  if (!__HUB_FIXTURES__) return false;
  const q = hash.indexOf('?');
  const inHash = q < 0 ? '' : hash.slice(q + 1);
  return new URLSearchParams(search).get('fxshares') === '1' || new URLSearchParams(inHash).get('fxshares') === '1';
};
