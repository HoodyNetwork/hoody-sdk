// MenuFooter: at most two actions that stay at the bottom of a scrolling menu or picker, sticky at the block
// end, on the popover surface with a hairline above, the primary first. It shares only the look and the position: it
// owns no keyboard model, and each host keeps its own semantics.
//   - ActionMenu (and a React Aria menu): `menuFooterClass` on the menu's last MenuSection ("Menu actions"), so arrows,
//     typeahead and Enter follow the menu's rules (ActionMenu's `footer` prop).
//   - PickerPanel (radiogroup/group) and other list hosts: `<MenuFooter>`, a separate group after the options, outside
//     them; arrows stay in the options and Tab reaches the footer buttons.
import { Button, cx } from '../controls/Button';
import footRow from './footRow.module.css';
import s from './MenuFooter.module.css';

/** The footer's actions: the primary, then at most one more. */
export type FooterActions<T> = readonly [primary: T, secondary?: T];

export interface FooterAction {
  id: string;
  label: string;
  onPress: () => void;
  isDisabled?: boolean;
  /** It backs out (Cancel): drawn with no forward glyph. */
  dismiss?: boolean;
}

/** The shared look: sticky at the block end, the popover surface, a hairline above. */
export const menuFooterClass = s.footer ?? '';

export interface MenuFooterProps {
  /** The group's accessible name ("Picker actions"). */
  label: string;
  actions: FooterActions<FooterAction>;
  className?: string;
}

/** The footer as a group of buttons after a host's options (PickerPanel, the DirPicker browser). */
export function MenuFooter({ label, actions, className }: MenuFooterProps) {
  const [primary, secondary] = actions;
  return (
    <div role="group" aria-label={label} className={cx(s.footer, s.buttons, footRow.row, className)} data-menu-footer="">
      <Button variant="primary" size="sm" onPress={primary.onPress} isDisabled={primary.isDisabled}>
        {primary.label}
      </Button>
      {secondary && (
        <Button variant="secondary" size="sm" chip={!secondary.dismiss} onPress={secondary.onPress} isDisabled={secondary.isDisabled}>
          {secondary.label}
        </Button>
      )}
    </div>
  );
}
