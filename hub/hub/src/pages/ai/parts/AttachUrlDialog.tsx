// From a URL… of the chat composer's add menu: a web address, read by the chat's own computer as Markdown (its browser's page
// reader) or as it is (the file the site sends), and handed to the composer's own add path as one file (attachUrl.ts). Nothing is
// sent with the message until the person sends it. A read that fails, answers an error status, or gives a file that is neither
// text nor an image attaches nothing and says why in the dialog. A text longer than one text file may hold is attached only after
// the person chose "Attach the first part", and the file then ends with a line saying the rest was left out.
import { useEffect, useRef, useState } from 'react';
import type { Target } from '@core';
import { Band, Dialog, RadioGroup, Stack, TextButton, TextField, formatBytes, useStrings } from '@kit';
import { attach as A } from '@ask/io';
import { fileFrom } from './attachOrigin';
import { checkAddress, fitText, readUrl, type UrlMode, type UrlRead } from './attachUrl';
import strings from './Conversation.strings.en.json';

export interface AttachUrlProps {
  /** The chat's computer: it opens the address. */
  target: Target;
  /** The composer's own add path (its rules decide what is kept). */
  onAdd: (files: readonly File[]) => void;
  onClose: () => void;
}

type Long = Extract<UrlRead, { kind: 'text' }> & { url: string; mode: UrlMode };
type Said =
  | { k: 'long'; read: Long }
  | { k: 'status'; status: number }
  | { k: 'notText' | 'tooBig' | 'starting' | 'redirected' }
  | { k: 'failed'; error: unknown }
  | null;

/** The file the composer gets for a read. */
export function urlFile(r: Extract<UrlRead, { ok: true }>, text?: string): File {
  const body: BlobPart = r.kind === 'image' ? (r.bytes as BlobPart) : (text ?? r.text);
  return fileFrom(new File([body], r.name, { type: r.type }), r.from);
}

export function AttachUrlDialog({ target, onAdd, onClose }: AttachUrlProps) {
  const t = useStrings(strings);
  const max = formatBytes(A.TXT_BYTES);
  const [address, setAddress] = useState('');
  const [mode, setMode] = useState<UrlMode>('markdown');
  const [bad, setBad] = useState<'empty' | 'scheme' | 'local' | null>(null);
  const [said, setSaid] = useState<Said>(null);
  const [busy, setBusy] = useState(false);

  // A read that ends after the dialog left (closed, or another chat) adds nothing.
  const run = useRef(0);
  useEffect(() => () => { run.current += 1; }, []);

  const add = (files: File[]) => { onAdd(files); onClose(); };

  const attach = async () => {
    if (busy) return;
    const c = checkAddress(address);
    if (!c.ok) { setBad(c.why); return; }
    // The person chose the first part of the text already read for this address and choice.
    if (said?.k === 'long' && said.read.url === c.url && said.read.mode === mode) {
      add([urlFile(said.read, fitText(said.read.text, A.TXT_BYTES, t('conv.add.url.cutNote', { max }), said.read.cut))]);
      return;
    }
    setBusy(true);
    setSaid(null);
    const mine = (run.current += 1);
    const r = await readUrl(target, c.url, mode);
    if (run.current !== mine) return;
    setBusy(false);
    if (!r.ok) {
      // The account or realm moved on while the page was read: the dialog goes with it.
      if (r.why === 'dropped') { onClose(); return; }
      setSaid(r.why === 'failed' ? { k: 'failed', error: r.error } : r.why === 'status' ? { k: 'status', status: r.status } : { k: r.why });
      return;
    }
    if (r.kind === 'text' && r.long) { setSaid({ k: 'long', read: { ...r, url: c.url, mode } }); return; }
    add([urlFile(r)]);
  };

  // Another address or choice is another read: what was said about the last one goes.
  const edit = <V,>(set: (v: V) => void) => (v: V) => { set(v); setBad(null); setSaid((s) => (s?.k === 'long' ? null : s)); };

  const line = said === null ? null
    : said.k === 'long'
      ? <Band size="table" tone="warn" /* noDetails: the page was read and is longer than a text file may be, not a rejection */>{t('conv.add.url.long', { max })}</Band>
      : said.k === 'status'
        ? <Band size="table" tone="danger" /* noDetails: the site's own answer status, said in words */>{t('conv.add.url.status', { status: String(said.status) })}</Band>
        : said.k === 'failed'
          ? <Band size="table" tone="danger" error={said.error}>{t(mode === 'markdown' ? 'conv.add.url.failedMd' : 'conv.add.url.failed')}</Band>
          : said.k === 'starting'
            // C9: the reader's start may have gone through. Check again only reads (attachUrl.ts never starts it again while held).
            ? <Band size="table" tone="warn" /* noDetails: the start's answer was lost; there is no answer to show */ actions={<TextButton onPress={() => { void attach(); }} isDisabled={busy}>{t('conv.add.url.checkAgain')}</TextButton>}>{t('conv.add.url.starting')}</Band>
            : <Band size="table" tone="danger" /* noDetails: a fixed reason this dialog decided, no answer to show */>{t(`conv.add.url.${said.k}`, { max })}</Band>;

  return (
    <Dialog
      isOpen
      onOpenChange={(o) => { if (!o) onClose(); }}
      overlayId="ai-attach-url"
      size="lg"
      title={t('conv.add.url.title')}
      body={t('conv.add.url.body')}
      primaryLabel={said?.k === 'long' ? t('conv.add.url.attachFirst', { max }) : t('conv.add.attach')}
      onPrimary={() => { void attach(); }}
      busy={busy}
    >
      <Stack gap={3}>
        <TextField
          label={t('conv.add.url.address')}
          type="url"
          inputMode="url"
          placeholder={t('conv.add.url.placeholder')}
          value={address}
          onChange={edit(setAddress)}
          isInvalid={bad !== null}
          errorMessage={bad ? t(`conv.add.url.bad.${bad}`) : undefined}
        />
        <RadioGroup<UrlMode>
          label={t('conv.add.url.how')}
          value={mode}
          onChange={edit(setMode)}
          isDisabled={busy}
          options={[
            { value: 'markdown', label: t('conv.add.url.markdown'), description: t('conv.add.url.markdown.desc') },
            { value: 'asis', label: t('conv.add.url.asis'), description: t('conv.add.url.asis.desc', { max }) },
          ]}
        />
        {line}
      </Stack>
    </Dialog>
  );
}
