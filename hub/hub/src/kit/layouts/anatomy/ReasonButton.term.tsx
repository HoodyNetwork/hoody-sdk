// ReasonButton in the terminal: the kit Button soft-disabled (controls/termPress SoftPress): it stays focusable, never
// acts on Enter, Space or a click, and shows its reason in a tip under it while it has the focus (Esc hides the tip until
// the focus comes back). The reason is also its description, so it is read with the name. A terminal has no hover, so
// the web's hover grace has nothing to time. `onPress` hears a press on it (Enter, Space or a click: SoftPressNotice),
// as the web's does, and the action still never runs.
import type * as Web from './ReasonButton';
import { Button } from '../../controls/Button';
import { SoftPressNotice } from '../../controls/termPress';

export type { ReasonButtonProps } from './ReasonButton';

export const REASON_HOVER_GRACE_MS: typeof Web.REASON_HOVER_GRACE_MS = 300;

export const ReasonButton: typeof Web.ReasonButton = ({ reason, children, name, variant = 'secondary', size = 'md', onPress }) => (
  <SoftPressNotice.Provider value={onPress}>
    <Button variant={variant} size={size} isDisabled disabledReason={reason} {...(name ? { 'aria-label': name } : {})}>
      {children}
    </Button>
  </SoftPressNotice.Provider>
);
