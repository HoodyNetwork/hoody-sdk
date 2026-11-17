// AttachChips: the images and text files that go with a message, as chips: in the composer (with a remove button)
// and on the sent message (without). Presentational; the host formats names and the meta line.
// An image that has a thumbnail opens larger in a dialog from that thumbnail (a press, Enter or Space), in the composer and on a
// sent message alike; the dialog shows the same address, so it lives exactly as long as the chip's own thumbnail does.
import { useState, type ReactNode, type Ref } from 'react';
import { TextButton } from '../controls/Link';
import { Icon } from '../icons';
import { Row } from '../layouts/Stack';
import { ScrollRegion } from '../layouts/ScrollRegion';
import { Dialog } from '../overlays/Dialog';
import { useStrings } from '../strings';
import { AttachPicture } from './AttachPicture';
import strings from './Conversation.strings.en.json';
import s from './Conversation.module.css';

/** `big`: a sent message's or a step's pictures, whose thumbnails are drawn larger than the composer's. */
export function AttachList({ label, big, children }: { label: string; big?: boolean; children: ReactNode }) {
  return <ul className={s.attList} aria-label={label} {...(big ? { 'data-big': '' } : {})}>{children}</ul>;
}

/** An image shows its thumbnail when it has one (else the display glyph); a text file shows the files glyph. `onBroken`: the
 *  browser could not draw the image (the host then stops showing it as one). */
export function AttachThumb({ kind, url, onBroken }: { kind: 'image' | 'text'; url?: string | null; onBroken?: () => void }) {
  if (kind === 'text') return <Icon name="files" />;
  return url ? <AttachPicture look="thumb" url={url} alt="" onBroken={onBroken} /> : <Icon name="display" />;
}

export function AttachChip({ kind, url, name, meta, action, onBroken, itemRef, title }: {
  kind: 'image' | 'text'; url?: string | null; name: string; meta?: string; action?: ReactNode;
  /** More about the file than its name (where it was saved), shown on hover. */
  title?: string;
  /** The browser could not draw the image. */
  onBroken?: () => void;
  /** The chip's own list item (a host that reads the picture only once it comes near the screen watches it). */
  itemRef?: Ref<HTMLLIElement>;
}) {
  const t = useStrings(strings);
  const [open, setOpen] = useState(false);
  // The larger view fits the picture to the dialog; "Actual size" shows its own pixels in a region that scrolls both ways (a wide
  // screenshot is read 1:1), "Fit to window" goes back. Closing it fits again.
  const [actual, setActual] = useState(false);
  const shows = kind === 'image' && !!url;
  return (
    <li ref={itemRef} className={s.attChip} title={title}>
      {shows
        ? <TextButton literal className={s.attOpen} aria-label={t('agent.attOpen', { name })} onPress={() => setOpen(true)}><AttachThumb kind={kind} url={url} onBroken={onBroken} /></TextButton>
        : <AttachThumb kind={kind} url={url} />}
      <span className={s.attText}>
        <span className={s.attName}>{name}</span>
        {meta && <span className={s.attMeta}>{meta}</span>}
      </span>
      {action}
      {shows && (
        <Dialog isOpen={open} onOpenChange={(o) => { setOpen(o); if (!o) setActual(false); }} title={name} size="lg" cancelLabel={t('agent.attClose')}>
          {/* The switch sits above the picture, so it stays in view whichever way the picture is shown. */}
          <Row justify="end" className={s.attViewBar}><TextButton onPress={() => setActual((v) => !v)}>{t(actual ? 'agent.attFit' : 'agent.attActual')}</TextButton></Row>
          {actual
            ? <ScrollRegion label={name} axis="both" className={s.attActualView}><AttachPicture look="actual" url={url ?? undefined} alt={name} /></ScrollRegion>
            : <AttachPicture look="full" url={url ?? undefined} alt={name} />}
        </Dialog>
      )}
    </li>
  );
}
