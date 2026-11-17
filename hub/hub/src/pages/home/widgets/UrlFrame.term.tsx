// Terminal: a web page cannot be drawn in a terminal, so the card says so in the card's own words ("This site can't be
// shown here.", with the external mark ⇗, a text glyph, never the emoji-capable ↗, so it reads without colour). The card itself still shows the whole address under it
// (WidgetCard: AddressText) and its menu still holds Open in a new tab, Rename, Size, Hide and Remove.
import { useStrings } from '@kit';
import { iconText, PX_GLYPHS } from '../../../kit/icons.glyphs';
import type * as Web from './UrlFrame';
import strings from './strings.en.json';
import { Box, Text } from '@term/prim';

const EXT = iconText(PX_GLYPHS.external);

export { FRAME_SANDBOX, SLOW_MS } from './UrlFrame.pure';

export const Frame: typeof Web.Frame = ({ url, name }) => {
  const t = useStrings(strings);
  // Named as the web frame is (its title), with the page's address as its value, for the agent/test tree.
  return (
    <Box dir="row" shrink={0} sem={{ role: 'region', name: t('card.frame', { name }), value: url }}>
      <Text colour="muted">{EXT} {t('card.blocked')}</Text>
    </Box>
  );
};
