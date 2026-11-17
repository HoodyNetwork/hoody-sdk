// BrandMark in the terminal: the words alone, "Hoody" in bold and the muted "Hub" after a space, on one line. The mark
// has no glyph in a terminal (icons.glyphs.ts: `logo` draws nothing), so with `words` off nothing is drawn. One size:
// `size` picks pixel sizes on the web (BrandMark.scenario.ts).
import type * as Web from './BrandMark';
import { Text } from '@term/prim';
import { useStrings } from '../strings';
import strings from './BrandMark.strings.en.json';

export type { BrandMarkProps } from './BrandMark';

/** The web module's art constants, the same values (kitDecisions.term.test pins them): the terminal draws no art. */
export const BRAND_MARK_PATH: typeof Web.BRAND_MARK_PATH = 'M0 0h64v64H0zM10 10h8v24h-8zM10 42h8v12h-8zM18 34h36v20h-8V42H18z';
export const BRAND_WIDTH: typeof Web.BRAND_WIDTH = { mark: 64, hoody: 229.2, hub: 331.21 } as const;

export const BrandMark: typeof Web.BrandMark = ({ hub = true, words = true }) => {
  const t = useStrings(strings);
  if (!words) return <></>;
  return (
    <Text shrink={0}>
      <Text bold>{t('name')}</Text>
      {hub ? <Text colour="muted">{' ' + t('hub')}</Text> : null}
    </Text>
  );
};
