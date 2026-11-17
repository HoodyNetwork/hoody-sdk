// The terminal side of kit QR surfaces, shared by Qr.term.tsx and other terminal siblings (never imported by web code):
// - InDialog: a QrPanel inside a Dialog leaves its own title and close to the dialog.
// - QrAddressDialog: a plain address (not a secret) as a QR code in a dialog, for a phone to take over (Handoff).
import { createContext, type ReactElement } from 'react';
import { Dialog } from '../overlays/Dialog';
import { useStrings } from '../strings';
import { QrPanel } from './Qr';
import strings from './strings.en.json';

export const InDialog = createContext(false);
/** Inside a hand-off's own QR dialog: the address and Copy are drawn below the code, so a code with no room is not
 *  handed off again (a hand-off inside the hand-off). */
export const AddressDialog = createContext(false);

export function QrAddressDialog({ url, name, open, onClose }: { url: string; name: string; open: boolean; onClose: () => void }): ReactElement {
  const t = useStrings(strings);
  return (
    <Dialog overlayId="handoff-qr" isOpen={open} onOpenChange={(o) => { if (!o) onClose(); }} title={t('qr.title', { name })} size="xl" cancelLabel={t('qr.close')}>
      {open ? (
        <AddressDialog.Provider value>
          <InDialog.Provider value>
            <QrPanel url={url} name={name} secret={false} revealed onRevealedChange={() => {}} onClose={onClose} />
          </InDialog.Provider>
        </AddressDialog.Provider>
      ) : null}
    </Dialog>
  );
}
