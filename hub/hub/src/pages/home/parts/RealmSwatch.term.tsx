// A realm's colour in the terminal's realms card: one cell of the realm hex (the realm switcher's colours); a tint
// outside the palette draws the faint neutral block the web's untinted swatch is. Mono draws nothing: the name follows.
import { FieldSwatch, REALM_HEX, Text } from '@term/prim';
import type * as Web from './RealmSwatch';

/** The untinted swatch: one faint block. */
const BLOCK = '■';

export const RealmSwatch: typeof Web.RealmSwatch = ({ tint }) => {
  const hex = tint ? (REALM_HEX as Readonly<Record<string, string>>)[tint] : undefined;
  return hex ? <FieldSwatch value={hex} cells={1} /> : <Text colour="faint">{BLOCK}</Text>;
};
