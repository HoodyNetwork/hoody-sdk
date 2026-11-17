// Section menus: the one look of a page's list of its own sections,
// SettingsPage's rail and the Guide's index. The list draws a 1 px dashed rail on its start side; each item is a 34 px
// row in the muted text, ink on hover, no fill; the current item takes a 3 px ink bar over the rail and semibold weight.
// A caller changes the look only through these hooks, set on its own element (its phone strip sets them in its own
// query; never a class on the list or an item). Each default is the rail look, and each is set by a caller:
//   --section-menu-flow          list direction (column). Both strips: row.
//   --section-menu-gap           gap between items (0). Both strips: --sp-half.
//   --section-menu-marks         1 draws the rail and the current bar; 0 drops both and evens the padding. Both strips: 0.
//   --section-menu-row           item height (34 px, at least the touch minimum). SettingsPage strip 32 px, Guide strip 32 px (at least the touch minimum).
//   --section-menu-current-line  colour of a 2 px line under the current item (transparent). Both strips: --hx-selected-bar.
// sectionmenu.hooks.test.ts holds the defaults and the callers to this list.
import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx } from '../controls/Button';
import s from './SectionMenu.module.css';

/** The column of items; draws the rail. */
export function SectionMenuList({ className, ...rest }: ComponentPropsWithRef<'div'>) {
  return <div {...rest} className={cx(s.list, className)} />;
}

interface ItemLook {
  /** The section in view: the ink bar and semibold text. The caller still sets aria-current. */
  current?: boolean;
  className?: string;
  children: ReactNode;
}

export type SectionMenuItemProps =
  | (ItemLook & Omit<ComponentPropsWithRef<'button'>, 'className' | 'children' | 'type'> & { href?: undefined })
  | (ItemLook & Omit<ComponentPropsWithRef<'a'>, 'className' | 'children'> & { href: string });

/** One section: a button (SettingsPage scrolls to it) or, given href, a link (the Guide's anchors). */
export function SectionMenuItem({ current, className, children, ...rest }: SectionMenuItemProps) {
  const cls = cx(s.item, current && s.current, className);
  if (typeof rest.href === 'string') {
    return (
      <a {...(rest as ComponentPropsWithRef<'a'>)} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button {...(rest as ComponentPropsWithRef<'button'>)} type="button" className={cls}>
      {children}
    </button>
  );
}
