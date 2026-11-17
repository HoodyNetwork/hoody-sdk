// A page's own `content` container: the region the `@container content` rules inside it read,
// such as the AI tab's main region beside its rail. The kit owns both the container (its CSS) and the marker, so the
// kit's measures (useContentNarrow, the ActionBar fold) read the same container as the CSS. kit/media.content.test.ts
// keeps the list of `content` containers.
import type { ReactNode } from 'react';
import { CONTENT_CONTAINER } from '../media';
import s from './ContentRegion.module.css';

export function ContentRegion({ children }: { children?: ReactNode }) {
  return (
    <div className={s.region} {...{ [CONTENT_CONTAINER]: '' }}>
      {children}
    </div>
  );
}
