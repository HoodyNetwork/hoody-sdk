// Icons in the terminal: the classification in icons.glyphs.ts. A glyph where the icon means something; a decorative
// icon draws nothing, unless the caller gave it a label (a standalone meaningful icon), which is then drawn. An icon with no
// glyph cell (a word, such as lock) is drawn as its word only when labelled: unlabelled, it stands beside its own words
// (the web hides it from assistive tech too), and its word would read as part of them ("lock Charging your wallet").
import type * as Web from './icons';
import { ICON_GLYPHS, PX_GLYPHS, iconText } from './icons.glyphs';
import { Text, type Colour } from '../term/prim';

export type { IconName, IconProps, IconTone, PxIconName } from './icons';

export const ICON_NAMES: typeof Web.ICON_NAMES = Object.keys(ICON_GLYPHS) as typeof Web.ICON_NAMES;

const TONE: Record<Web.IconTone, Colour> = { ink: 'ink', muted: 'muted', faint: 'faint', ok: 'ok', warn: 'warn', danger: 'danger', dangerQuiet: 'danger', warnQuiet: 'warn' };

export const Icon: typeof Web.Icon = ({ name, label, tone }) => {
  const c = ICON_GLYPHS[name];
  const text = c && !(c.kind === 'label' && !label) ? iconText(c, label) : (label ?? '');
  if (!text) return <></>;
  // A label makes it meaningful (the web's role="img"); without one it is decoration. It never shrinks: a glyph cut to
  // nothing in a tight row (beside a long wrapping text) says nothing at all, as the web's fixed-size svg never does.
  return <Text shrink={0} colour={tone ? TONE[tone] : undefined} dim={c?.kind === 'label' && !tone} {...(label ? { sem: { role: 'img' as const, name: label } } : {})}>{text}</Text>;
};

export const PX_FROM_ICON: typeof Web.PX_FROM_ICON = { 'arrow-right': 'arrow', external: 'external', 'chevron-down': 'down', plus: 'plus' };

export const PxIcon: typeof Web.PxIcon = ({ name }) => {
  const text = iconText(PX_GLYPHS[name]);
  return text ? <Text>{text}</Text> : <></>;
};
