// StepPictures in the terminal: a terminal draws no picture (an <img> draws nothing here), so a picture is its name on a
// line, marked as a picture the way a sent message's attachments are. Nothing is read: no file a step saved, no picture
// stored with a message, and nothing watches what is near the screen. The host therefore holds no reads either.
import type * as Web from './StepPictures';
import { Box, Text } from '@term/prim';
import { useStrings } from '../strings';
import strings from './SessionView.strings.en.json';

export type { StepPictureReader } from './StepPictures';
export { STORED_AT_ONCE, pictureMedia } from './StepPictures.pure';

/** The mark a picture's line starts with (a sent message's attachments use the same). */
const PIC = '▣ ';

export const StepPictureHost: typeof Web.StepPictureHost = ({ children }) => <>{children}</>;

export const StoredPicture: typeof Web.StoredPicture = ({ name }) => <Text colour="muted">{PIC + name}</Text>;

export const StepPictures: typeof Web.StepPictures = ({ items }) => {
  const t = useStrings(strings);
  return (
    <Box dir="column" shrink={0} sem={{ role: 'list', name: t('sv.step.pictures') }}>
      {items.map((p) => <Text key={p.path} colour="muted">{PIC + p.path}</Text>)}
    </Box>
  );
};
