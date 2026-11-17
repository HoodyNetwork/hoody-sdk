// Icons in the terminal's tables and filters come from the kit's one icon map (icons.glyphs.ts): a
// one-cell text glyph, a short word, or nothing. Never a literal symbol here: emoji-capable code points (⚙ ⚲ …) may draw
// as a wide colour emoji and eat the space after them. termIcons.term.test.ts checks every string these files draw.
import { ICON_GLYPHS } from '../icons.glyphs';
import type { IconName } from '../icons';

/** The icon's glyph or short word, or '' when the map says it draws nothing. */
export function iconMark(name: IconName): string {
  const c = ICON_GLYPHS[name];
  return c.kind === 'glyph' ? c.glyph : c.kind === 'label' ? c.label : '';
}

/** "↻ Refresh" when the icon has a glyph; the words alone when it has none. */
export function withIcon(name: IconName, words: string): string {
  const m = iconMark(name);
  return m ? `${m} ${words}` : words;
}
