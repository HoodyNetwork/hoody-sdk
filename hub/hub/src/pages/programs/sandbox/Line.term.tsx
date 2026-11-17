// One sentence of a notice in the terminal: one Text, which stays inside a text run (term/jsx/dom.ts isInlineComponent).
import { Text } from '@term/prim';
import type * as Web from './Line';

export const Line: typeof Web.Line = ({ children }) => <Text>{children}</Text>;
(Line as { hxInline?: boolean }).hxInline = true;
