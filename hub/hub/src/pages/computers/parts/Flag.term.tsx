// A server's country in the terminal: the kit CountryFlag (the two-letter code as muted text, named as on the web),
// never the emoji. In a row it never shrinks (a cut code reads as nothing); inside running text (the detail's lines) it
// is an inline span, since a box cannot sit in a text there. The space after it comes from the label row.
import { CountryFlag } from '@kit';
import { Box, useInText } from '@term/prim';
import type * as Web from './Flag';

export const Flag: typeof Web.Flag = ({ cc }) => {
  const inline = useInText();
  if (!cc) return null;
  return inline ? <CountryFlag code={cc} /> : <Box shrink={0}><CountryFlag code={cc} /></Box>;
};
