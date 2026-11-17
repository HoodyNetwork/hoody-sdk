// realmColour.ts: a realm's colour as the terminal draws it. The values are kit/tokens.css's dark-theme `--hx-r-*`
// (`:root[data-hx-theme="dark"]`; the terminal draws the dark tokens only), pinned by realmColour.term.test.ts. A colour
// is always a swatch (prim FieldSwatch: nothing in mono) plus its name, never the name or the swatch alone.
// The colour set is the kit's display set (kit/data/Display RealmColor, a superset of core's PALETTE: it also draws
// yellow, which older realms may carry); prim imports no kit, so the names are spelled here and the test pins them
// equal to RealmColor. Pages import it as `@term/prim` (page.ts); src/term/shell/realmColour.ts re-exports it.
export type RealmColourName = 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' | 'pink';

export const REALM_HEX: Readonly<Record<RealmColourName, string>> = {
  red: '#ff242b', orange: '#ff7b24', yellow: '#ffb41e', green: '#61ff81', teal: '#26ffea', blue: '#3092ff', purple: '#9e2dff', pink: '#f062a0',
};

export const realmHex = (c: RealmColourName | null | undefined): string | undefined => (c ? REALM_HEX[c] : undefined);
