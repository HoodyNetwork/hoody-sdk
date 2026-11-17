// The end glyph of a chip button, one rule for every place that draws or reasons about it (Button, and the floating
// action button deciding whether its glyph alone can stand for the action).
import type { ReactNode } from 'react';
import { PX_FROM_ICON, type IconName, type PxIconName } from '../icons';

/** A label that starts with "New" (New note, New Bot, New folder): its glyph is the plus, never the arrow. */
const NEW_LABEL = /^new\b/i;

/** The chip's own glyph, else the plus for a "New …" label, else the end icon's pixel twin, else the arrow. */
export function chipGlyph(chipIcon: PxIconName | undefined, iconEnd: IconName | undefined, label: ReactNode): PxIconName {
  if (chipIcon) return chipIcon;
  if (typeof label === 'string' && NEW_LABEL.test(label.trim())) return 'plus';
  if (!iconEnd) return 'arrow';
  // An end icon without a pixel twin falls back to the arrow; Button.glyph.css.test.ts fails on any such name in the Hub.
  return PX_FROM_ICON[iconEnd] ?? 'arrow';
}
