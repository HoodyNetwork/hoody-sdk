// The API page's words for catalog facts. A service the strings do not name yet (one newer than these strings) shows
// its id, never a missing key.
import type { TagTone, Translate } from '@kit';
import type { CatalogOp } from './catalog';
import strings from './strings.en.json';

type T = Translate<typeof strings>;

export const serviceWord = (t: T, id: string): string => {
  const k = `svc.${id}`;
  return Object.hasOwn(strings, k) ? t(k as Parameters<T>[0]) : id;
};

/** The op's summary, or the fixed words for one the spec leaves without (never English built from method and path). */
export const summaryOf = (t: T, o: CatalogOp): string => o.summary ?? t('summary.none');

/** The list group of an operation: its service and tag. */
export const groupKey = (o: CatalogOp): string => `${o.service}\u0000${o.tag ?? ''}`;

/** The category group of a service, over its tag groups (a key no tag group can take: those hold a NUL). */
export const serviceGroupId = (service: string): string => `\u0001${service}`;

/** A method's colour, from the existing Tag tones only: reads ok, POST accent, DELETE warn; the rest (PUT,
 *  PATCH, the WebDAV and kit verbs) neutral. */
export const methodTone = (m: string): TagTone => (m === 'GET' ? 'ok' : m === 'POST' ? 'accent' : m === 'DELETE' ? 'warn' : 'neutral');
