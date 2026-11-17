// A realm colour in the terminal: a swatch of the colour (the shell's realm hex, the same the realm switcher draws) and its
// name, never one without the other (mono terminals still read the name).
import type * as Web from './ColourName';
import { Box, FieldSwatch, REALM_HEX, Text } from '@term/prim';

export const ColourName: typeof Web.ColourName = ({ color, label }) => (
  <Box dir="row" gap={1} shrink={0}>
    <FieldSwatch value={REALM_HEX[color]} />
    <Text>{label}</Text>
  </Box>
);
