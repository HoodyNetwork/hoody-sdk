// A realm's colour in the terminal: a one-cell swatch of the realm hex (the shell's, the realm switcher's colours) and a
// space; the realm's name follows it. An unknown colour draws the blue the web falls back to. Mono draws nothing, the
// space included (never "( Personal)" in a realm tag): the name beside it carries the meaning.
import type { RealmColor } from '@kit';
import { dataColourAtTier, FieldSwatch, REALM_HEX, Text } from '@term/prim';
import { realmColor } from '../logic';
import type * as Web from './RealmDot';

export const RealmDot: typeof Web.RealmDot = ({ color }) => {
  const hex = REALM_HEX[(realmColor(color) ?? 'blue') as RealmColor] ?? REALM_HEX.blue;
  if (dataColourAtTier(hex) === undefined) return <></>;
  return (
    <>
      <FieldSwatch value={hex} cells={1} />
      <Text> </Text>
    </>
  );
};
