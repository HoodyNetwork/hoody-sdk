// The strict Section's pure rules (Section.tsx and its terminal sibling, and SettingsPage, share them): when the head's
// primary is held off, and when it moves to the empty state.
import { isLinkSpec, type AnyAction, type EmptySpec, type SectionState } from './types';

/** The kinds that keep the primary action off: nothing whole has been read yet (or nothing can be read here). */
const NOT_READ: ReadonlySet<SectionState['kind']> = new Set(['loading', 'unknown', 'failed', 'notHere']);

/** The primary as the head shows it: disabled with a reason while the section has not been read. A link primary becomes
 * a reason button too (a link cannot be disabled), with the same id, so it cannot navigate before the read. */
export function headPrimary(primary: AnyAction | undefined, state: SectionState | undefined, reasons: { loading: string; notRead: string }): AnyAction | undefined {
  if (!primary || !state || !NOT_READ.has(state.kind)) return primary;
  const disabledReason = state.kind === 'loading' ? reasons.loading : state.kind === 'notHere' ? state.title : reasons.notRead;
  if (isLinkSpec(primary)) return { id: primary.id, label: primary.label, name: primary.name, icon: primary.icon, literal: primary.literal, onPress: () => undefined, disabledReason };
  return { ...primary, disabledReason };
}

/** The primary leaves the head while the section shows its empty state with it. */
export const primaryMoved = (state: SectionState | undefined, empty: EmptySpec | undefined): boolean =>
  state?.kind === 'empty' && empty !== undefined && (empty.action === undefined || empty.action === 'primary');

