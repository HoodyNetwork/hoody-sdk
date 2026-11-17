// What an empty storage list says under its title, in the terminal (the web's EmptyBody.tsx): a terminal draws no
// marks, so the kinds are the plain sentence.
import { useStrings } from '@kit';
import type * as Web from './EmptyBody';
import strings from './strings.en.json';

export type { EmptyBodyProps } from './EmptyBody';

export const EmptyBody: typeof Web.EmptyBody = ({ names, more }) => {
  const t = useStrings(strings);
  return <>{t('works.label', { list: names.join(', '), count: more })}</>;
};
