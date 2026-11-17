// What goes with a fresh key's secret: the Bot's address to copy (a kit CopyField), and two QR codes for a phone side by side (the person always
// has the choice with or without key): the address only, and the address with the key after
// # (the shape the Bot's page reads and drops from the address bar). The code with the key is drawn only while Show is
// on: it starts hidden and hides again by the kit's reveal rules (useRevealGuard: the tab hidden; in the terminal also the
// terminal losing focus, or no key pressed for a while). No address, no code: the key is copied instead.
// The block lives and dies with the secret, and tracks nothing about it itself: each mount site gives it a `key` from
// issueKey (a fresh id for every issued secret, never derived from the text), so a replacement key remounts it and the
// first press never carries over; and the site clears its secret-bearing state when the SecretField wipes (onWipe), which
// unmounts it. The address is not a secret. The warning over the codes is one kit Notice (warn; no address: a calm one).
import { Button, CopyField, Notice, QrCode, QrSecret, qrMatrix, standInMatrix, useRevealGuard, useStrings } from '@kit';
import { useMemo, useState } from 'react';
import strings from '../strings.en.json';
import k from './KeyShare.module.css';
import s from './pane.module.css';
import { keyedLink } from './KeyShare.pure';
export { issueKey, keyedLink } from './KeyShare.pure';

export function KeyShare({ secret, url }: { secret: string; url?: string }) {
  const t = useStrings(strings);
  const [shown, setShown] = useState(false);
  useRevealGuard(shown, () => setShown(false));
  const plain = useMemo(() => qrMatrix(url), [url]);
  const matrix = useMemo(() => (shown ? qrMatrix(keyedLink(url, secret) ?? undefined) : null), [shown, url, secret]);
  const standIn = useMemo(() => standInMatrix(), []);
  const tooLong = shown && !matrix;
  return (
    <div className={s.keyShare}>
      {/* plain: the address is copied here; the codes below are how a phone opens it. */}
      {url ? <CopyField label={t('keyShare.address')} value={url} plain copyName={t('keyShare.copyAddress')} /> : null}
      {/* One line either way, a kit Notice (it stays with the codes; no live role, so a fresh key is not announced as an
          alert): the warning over the codes, or with no address the note that there is no code. */}
      <Notice level={url ? 'warn' : 'calm'}>{url ? t('keyShare.qrWarn') : t('keyShare.qrNoUrl')}</Notice>
      {url ? (
        <>
          <div className={k.pair}>
            {plain ? (
              <figure className={k.code}>
                <figcaption className={k.caption}>{t('keyShare.qrPlain')}</figcaption>
                <div className={k.box}>
                  <QrCode matrix={plain} label={t('keyShare.qrPlainLabel')} className={s.keyShareQr} logo="bot" secret={false} />
                </div>
              </figure>
            ) : null}
            <figure className={k.code}>
              <figcaption className={k.caption}>{t('keyShare.qrKeyed')}</figcaption>
              {tooLong ? null : (
                <QrSecret>
                  {shown && matrix ? (
                    <QrCode matrix={matrix} label={t('keyShare.qrLabel')} className={s.keyShareQr} logo="bot" secret />
                  ) : (
                    <QrCode matrix={standIn} label={t('keyShare.qrHiddenLabel')} className={`${s.keyShareQr} ${s.keyShareQrHidden}`} logo="bot" secret />
                  )}
                </QrSecret>
              )}
              {/* Mounted empty before any Show: a live region must exist before its message to be announced. */}
              <p className={s.keyShareNote} role="status" /* reason: one-line hint in place of a code too long to draw; nothing to retry */>
                {tooLong ? t('keyShare.qrTooLong') : ''}
              </p>
            </figure>
          </div>
          <div>
            <Button size="sm" icon={shown ? 'eye-off' : 'eye'} onPress={() => setShown((v) => !v)}>
              {shown ? t('keyShare.qrHide') : t('keyShare.qrShow')}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
