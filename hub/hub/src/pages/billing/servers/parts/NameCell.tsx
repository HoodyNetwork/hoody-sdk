// The Listings name cell, as a function the name column's cell calls: the server name (it ends in an ellipsis when
// long), then its tags on a line of their own, so they never squeeze the name. The terminal draws NameCell.term.tsx.
import { Row } from '@kit';
import type { ReactNode } from 'react';
import css from '../View.module.css';

export interface NameCellProps {
  name: string;
  /** The row's tags (Pre-order, Featured, "N left"), already chosen; none means no tag line. */
  tags: ReactNode[];
}

/** The name, then the tag line when there are tags. */
export function nameCell({ name, tags }: NameCellProps): ReactNode {
  return (
    <div className={css.nameCell}>
      <span className={css.name}>{name}</span>
      {tags.length > 0 ? (
        <Row gap={1} align="center" wrap>
          {tags}
        </Row>
      ) : null}
    </div>
  );
}
