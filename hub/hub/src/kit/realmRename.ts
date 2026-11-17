// Rename realms for pages: the shell owns the dialog (every realm's name and colour, one send per Save, a lost answer
// held with Check again) and provides its opener here, the way it provides PageNavHoldContext in nav.tsx.
import { createContext, useContext } from 'react';

/** Opens the shell's Rename realms dialog; on one realm's form when `realmId` is given. */
export type OpenRenameRealms = (realmId?: string) => void;

export const RenameRealmsContext = createContext<OpenRenameRealms | null>(null);

/** The Rename realms opener, or null where renaming is not offered (a token session pinned to one realm, or no shell
 *  around the caller): hide the action then. */
export function useRenameRealms(): OpenRenameRealms | null {
  return useContext(RenameRealmsContext);
}
