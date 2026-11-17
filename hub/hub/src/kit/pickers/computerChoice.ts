// One mapping from a computer row (as the API lists it) to a ComputerPicker row, so every page that adopts the picker
// shows the same state words, place and flag. The caller passes the realm it knows (or none) and may
// pass its own value for the row (a handle) instead of the id. A row's colour goes through as the API keeps it (the
// picker's mark normalises it), so a caller that spreads its API row gets the mark with no edit of its own.
import { computerState } from '@core';
import { countryFlag } from '../format';
import type { RealmColor } from '../data/Display';
import { useStrings } from '../strings';
import type { ComputerChoice } from './ComputerPicker';
import strings from './computerChoice.strings.en.json';

export interface ComputerChoiceRow {
  readonly id: string;
  readonly name: string;
  readonly status?: unknown;
  readonly server_name?: string;
  /** The server as the place line names it (a subserver's own display name); shown only, never routed. Without it server_name is shown. */
  readonly server_label?: string;
  readonly city?: string;
  readonly country?: string;
  readonly color?: string | null;
}

/** `(row, extra) => ComputerChoice`: state in words (running, stopped, starting, state not known), place as
 *  "city · server", the country's flag, the computer's colour. `extra` adds the realm, a value other than the id, or why a row is off. */
export function useComputerChoice(): (row: ComputerChoiceRow, extra?: { id?: string; realm?: { name: string; color?: RealmColor }; disabledReason?: string }) => ComputerChoice {
  const t = useStrings(strings);
  return (row, extra) => {
    const state = computerState(row.status);
    const place = [row.city, row.server_label ?? row.server_name].filter(Boolean).join(' · ');
    const flag = countryFlag(row.country);
    return {
      id: extra?.id ?? row.id,
      name: row.name,
      running: state === 'running',
      state: t(`state.${state}`),
      stateKind: state,
      ...(place ? { place } : {}),
      ...(flag ? { flag } : {}),
      ...(typeof row.color === 'string' ? { color: row.color } : {}),
      ...(extra?.realm ? { realm: extra.realm } : {}),
      ...(extra?.disabledReason ? { disabledReason: extra.disabledReason } : {}),
    };
  };
}
