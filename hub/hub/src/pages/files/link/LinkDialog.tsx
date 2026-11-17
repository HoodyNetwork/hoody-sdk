// Download from a link: the dialog. The person pastes a link and may edit the name; the
// computer downloads it into the open folder itself (data.ts send), so it keeps going after the page closes.
// The link is never prefilled, kept or shown again: it lives in this dialog's field and in the tab's memory for a
// resend with the same id. A link to a Hoody computer's programs is refused (copies between computers have their own
// way), and the action is off on an older Hoody Kit (`download_client_id` missing from /api/v1/version).
import { proxyDomain } from '@core';
import { Band, Dialog, TextButton, TextField, useStrings } from '@kit';
import { useEffect, useState } from 'react';
import { useCanChange, type FilesComputer } from '../data';
import { displayName, partsOf } from '../logic';
import { send, useKitReady, type SendResult } from './data';
import { defaultName, linkProblem, usableName } from './logic';
import strings from './link.strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;
const KNOWN = new Set(['CHANGES_OFF', 'FILE_PATH_BUSY', 'FORBIDDEN', 'NOT_FOUND', 'HELD', 'FULL']);
/** What a send that started nothing says (fixed words, never the program's text). */
export function unsentWords(t: T, r: SendResult, computer: string): string {
  if (r.state === 'busy') return t('result.busy', { computer });
  const code = r.code ?? '';
  if (KNOWN.has(code)) return t(`result.${code}` as 'result.HELD');
  if (code === '403') return t('result.FORBIDDEN');
  if (code === '404') return t('result.NOT_FOUND');
  return r.state === 'notSent' ? t('result.notSent') : t('result.refused');
}

export function LinkDialog({ c, folder, onClose }: { c: FilesComputer; folder: string; onClose: () => void }) {
  const t = useStrings(strings);
  const canChange = useCanChange();
  const kit = useKitReady(c, true);
  const [link, setLink] = useState('');
  const [name, setName] = useState('');
  const [named, setNamed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const shownName = named ? name : link.trim() ? defaultName(link) : '';
  const problem = link.trim() ? linkProblem(link, proxyDomain()) : null;
  const nameBad = !!shownName && !usableName(shownName);
  const ready = canChange && kit.ready === true && !!link.trim() && !problem && !!shownName && !nameBad && !busy;
  const where = folder === '/' ? c.name : displayName(partsOf(folder).at(-1) ?? folder);

  const go = async () => {
    if (!ready) return;
    setBusy(true);
    const r = await send(c, folder, link.trim(), shownName);
    setBusy(false);
    setResult(r);
  };
  // Accepted, waiting to be sent again, or may have gone through: the folder's line follows it from here.
  useEffect(() => { if (result && (result.state === 'accepted' || result.state === 'waiting' || result.state === 'unknown')) onClose(); }, [result, onClose]);
  const failed = result && (result.state === 'refused' || result.state === 'busy' || result.state === 'notSent') ? unsentWords(t, result, c.name) : null;

  // Why Send is off, as kit notices: the Hoody Kit check, and changes turned off in this session.
  let kitNote = null;
  if (kit.ready === false)
    kitNote = (
      <Band tone="warn" size="table" /* noDetails: the read succeeded; this Hoody Kit simply lists no download id. */>
        {t('kit.old', { computer: c.name })}
      </Band>
    );
  else if (kit.ready === undefined) kitNote = <Band size="table">{t('kit.reading', { computer: c.name })}</Band>;
  else if (kit.ready === 'failed') kitNote = <Band tone="warn" size="table" error={kit.error} actions={<TextButton onPress={kit.retry}>{t('kit.retry')}</TextButton>}>{t('kit.failed', { computer: c.name })}</Band>;

  return (
    <Dialog
      overlayId="files-link-download"
      isOpen
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={t('title')}
      body={t('body', { folder: where, computer: c.name })}
      primaryLabel={t('send')}
      onPrimary={() => void go()}
      primaryDisabled={!ready}
      busy={busy}
      outcome={failed ? { kind: 'failed', message: failed } : undefined}
    >
      <TextField
        label={t('field.link')}
        type="url"
        autoComplete="off"
        value={link}
        onChange={(v) => { setLink(v); setResult(null); }}
        isDisabled={busy}
        description={t('field.linkHint')}
        errorMessage={problem ? t(`bad.${problem}`) : undefined}
        reserveError
        mono
      />
      <TextField
        label={t('field.name')}
        value={shownName}
        onChange={(v) => { setNamed(true); setName(v); setResult(null); }}
        isDisabled={busy}
        description={t('field.nameHint')}
        errorMessage={nameBad ? t('bad.name') : undefined}
        reserveError
        mono
      />
      {kitNote}
      {!canChange ? <Band size="table">{t('result.CHANGES_OFF')}</Band> : null}
    </Dialog>
  );
}
