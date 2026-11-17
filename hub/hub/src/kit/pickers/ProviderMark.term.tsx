// ProviderMark in the terminal (the web's ProviderMark.tsx): the provider's first letter, bold, in the accent colour.
// Never an inverse block (OpenTUI 0.8.4 can draw inverse words as fg = bg, see FocusInk, and a column of white blocks
// outweighs the names beside it). Hoody AI's brand icon has no terminal glyph, so it is its letter too. Decorative:
// the provider's name always sits next to it, so the mark is hidden from the semantics tree.
import type * as Web from './ProviderMark';
import { Text } from '../../term/prim';

export type { ProviderMarkProps } from './ProviderMark';

export const ProviderMark: typeof Web.ProviderMark = ({ id, name }) => (
  <Text bold colour="acc" sem={{ hidden: true }}>{(Array.from((name || id).trim())[0] ?? '?').toUpperCase()}</Text>
);
