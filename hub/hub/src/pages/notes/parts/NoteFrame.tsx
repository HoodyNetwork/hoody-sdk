// One note, shown inside the Hub: the Notes program's own page for it in a frame (the Hub reads no note body). The frame is
// the same sandbox the Board gives a program tile. It says when it is slow to answer and always offers the new-tab link.
import { Link, Skeleton, useStrings } from '@kit';
import { useEffect, useRef, useState } from 'react';
import strings from '../strings.en.json';
import s from './parts.module.css';

const ALLOW = 'clipboard-read; clipboard-write; fullscreen; autoplay';
const SANDBOX = 'allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads';
const SLOW_MS = 20_000;

/** `focus`: move the keyboard into the frame once, when it has loaded (a note made just now is there to be typed in),
 *  unless the person did anything meanwhile: a press or a key anywhere, from the moment the frame appears, ends it
 *  (they are somewhere else by choice; focus the closed dialog gives back on its own is not their move). The Hub
 *  cannot reach inside the frame: where the caret lands is the Notes program's own choice. No browser global is read:
 *  the page is reached through the box's own element, so where there is none (the terminal) nothing listens or moves. */
export function NoteFrame({ src, title, tabUrl, focus = false }: { src: string; title: string; tabUrl: string; focus?: boolean }) {
  const t = useStrings(strings);
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const wantFocus = useRef(focus);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const page = box.current?.ownerDocument;
    // No page to watch the person on: nothing moves the focus on its own.
    if (!page) wantFocus.current = false;
    if (!wantFocus.current || !page) return;
    const off = () => { wantFocus.current = false; };
    page.addEventListener('pointerdown', off, true);
    page.addEventListener('keydown', off, true);
    return () => {
      page.removeEventListener('pointerdown', off, true);
      page.removeEventListener('keydown', off, true);
    };
  }, []);
  const takeFocus = (frame: HTMLIFrameElement) => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    frame.focus();
  };
  useEffect(() => {
    setLoaded(false);
    setSlow(false);
    const id = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(id);
  }, [src]);
  return (
    <div ref={box} className={s.frameBox}>
      {!loaded && (
        <div className={s.frameWait}>
          <Skeleton rows={3} />
          {slow && (
            <p className={s.note}>
              {t('note.slow')}{' '}
              <Link href={tabUrl} variant="inline" iconEnd="external">
                {t('action.openNoteTab')}
              </Link>
            </p>
          )}
        </div>
      )}
      <iframe key={src} className={s.frame} src={src} title={t('note.frame', { title })} allow={ALLOW} sandbox={SANDBOX} referrerPolicy="origin" onLoad={(e) => { setLoaded(true); takeFocus(e.currentTarget); }} />
    </div>
  );
}
