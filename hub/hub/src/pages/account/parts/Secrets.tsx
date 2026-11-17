// How a once-shown 2FA secret is drawn: the QR, the setup key and the backup codes, the key and the codes in
// the kit's SecretField (masked until Show, Copy works without it). The owner of the secret (the drawer)
// unmounts this when it closes and drops its copy.
import type { HeldSecret } from '@core';
import { QrImage, QrSecret, SecretField, useStrings } from '@kit';
import { useCodeList } from '../data';
import strings from '../strings.en.json';
import s from './Mono.module.css';

/** The QR is a data: image; the data layer only lets a base64 png or svg through (isQrImage) before it gets here. It
 *  holds the 2FA key, so it wears the kit's key badge on top and caption (QrSecret). The kit's QrImage draws it: an
 *  <img> described by the caption on the web; in the terminal the modules read back and drawn in cells, hidden from
 *  the tree, gone when the drawer drops its HeldSecret (qr.conformance: a QrImage always sits in a QrSecret). */
export function KeyQr({ src, alt }: { src: string; alt: string }) {
  const t = useStrings(strings);
  return (
    <QrSecret note={t('2fa.qrNote')} className={s.qrSecret} boxClassName={s.qr}>
      <QrImage src={src} alt={alt} />
    </QrSecret>
  );
}

export function ManualKey({ value, onWipe }: { value: string; onWipe?: () => void }) {
  const t = useStrings(strings);
  return <SecretField label={t('2fa.manualKey')} value={value} description={t('2fa.keyNote')} onWipe={onWipe} />;
}

/** The codes, one per line and hidden until Show, with the kit's "I saved them" tick: `saved` gates the drawer's primary action. */
export function BackupCodes({ codes, saved, onSaved, onWipe }: { codes: readonly string[]; saved: boolean; onSaved: (v: boolean) => void; onWipe?: () => void }) {
  const t = useStrings(strings);
  return (
    <SecretField
      label={t('2fa.codes')}
      value={codes.join('\n')}
      format="lines"
      description={t('2fa.codesOnce')}
      onWipe={onWipe}
      confirm={{ checked: saved, onChange: onSaved, label: t('2fa.iSaved') }}
    />
  );
}

/** The codes of a new-codes answer: the drawer holds only the HeldSecret, the text is read here at render. */
export function NewCodes({ held, saved, onSaved, onGone }: { held: HeldSecret | null; saved: boolean; onSaved: (v: boolean) => void; onGone?: () => void }) {
  const codes = useCodeList(held);
  // A kit wipe (page hide, context end) of the shown copy drops the original too.
  return <BackupCodes codes={codes ?? []} saved={saved} onSaved={onSaved} onWipe={() => {
        held?.drop();
        // Nothing is left to save: the exit opens instead of staying disabled.
        onGone?.();
      }}
    />;
}
