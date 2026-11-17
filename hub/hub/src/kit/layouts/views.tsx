// The page's view switch: one page with several views, each its own layout (Plans & billing).
// DetailPage, ListDetailPage and TablePage draw it at the same place, under the header and above the
// banner, so the strip keeps its y when a switch changes the layout. The page owns the value and the switch (a view can
// be another route); the layout only draws the bar.

import type { ReactNode } from 'react';
import { Tabs, type TabItem } from '../controls/Tabs';

/** One view: a tab with no panel and no link of its own (the page switches the view in `onChange`). The fields are
 * forbidden in the type and dropped by the strip, so a TabItem passed as a view cannot draw a tabpanel or a link. */
export type PageView<K extends string = string> = Pick<TabItem<K>, 'id' | 'label' | 'badge' | 'badgeUnit' | 'isDisabled'> & {
  content?: never;
  href?: never;
};

export interface PageViews<K extends string = string> {
  /** Accessible name of the view bar. */
  label: string;
  items: readonly PageView<K>[];
  /** The open view. */
  value: K;
  /** The page switches the view (a search parameter or another route). */
  onChange: (id: K) => void;
}

/** The view bar: bar-only Tabs, the open view's layout being the page itself. */
export function ViewStrip<K extends string>({ views, className }: { views: PageViews<K>; className?: string }): ReactNode {
  return (
    <div className={className}>
      <Tabs
        label={views.label}
        items={views.items.map(({ id, label, badge, badgeUnit, isDisabled }) => ({ id, label, badge, badgeUnit, isDisabled }))}
        value={views.value}
        onChange={views.onChange}
      />
    </div>
  );
}
