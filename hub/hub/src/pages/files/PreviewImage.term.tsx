// A preview's picture in the terminal: a terminal draws no picture (an <img> draws nothing here), so the preview says
// so and names the ways that show it, Download in the foot and the computer's viewer in the rows below. The picture's
// bytes are not used.
import { EmptyState, useStrings } from '@kit';
import type * as Web from './PreviewImage';
import words from './PreviewImage.term.strings.en.json';

export const PreviewImage: typeof Web.PreviewImage = () => {
  const t = useStrings(words);
  return <EmptyState size="sm" icon="notes" title={t('preview.term.noPicture')} body={t('preview.term.noPictureBody')} />;
};
