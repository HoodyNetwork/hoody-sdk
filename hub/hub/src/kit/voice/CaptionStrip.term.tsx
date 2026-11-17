// CaptionStrip in the terminal: the same two lines ("You: …", "<Bot>: …"), "(hearing)" after a partial line. Talk never
// starts in a terminal (MicButton.term hands off), so this only draws if a page passes lines anyway (a Talk live on the web
// for the same conversation). The polite announcement is the group's name for screen readers, as the other kit live lines.
import type * as Web from './CaptionStrip';
import { Box, Text } from '../../term/prim';
import { useStrings } from '../strings';
import strings from './Voice.strings.en.json';

export type { CaptionLine, CaptionStripProps } from './CaptionStrip';

export const CaptionStrip: typeof Web.CaptionStrip = ({ you, bot }) => {
  const t = useStrings(strings);
  if (!you?.text && !bot?.text) return null;
  return (
    <Box dir="column" shrink={0} sem={{ role: 'group', name: t('caption.label') }}>
      {you?.text ? (
        <Text>
          <Text bold>{t('caption.you')}:</Text> {t('caption.said', { text: you.text })}
          {!you.final ? <Text colour="muted"> ({t('caption.hearing')})</Text> : null}
        </Text>
      ) : null}
      {bot?.text ? (
        <Text>
          <Text bold>{bot.name}:</Text> {t('caption.said', { text: bot.text })}
        </Text>
      ) : null}
    </Box>
  );
};
