// The page of a Home web widget in its sandboxed frame (WidgetCard.tsx draws the card around it). The frame's attributes
// are the card's contract (WidgetCard.tsx header). Terminal: UrlFrame.term.tsx (a frame cannot exist there).
import { useStrings } from '@kit';
import { useEffect, useRef, useState } from 'react';
import strings from './strings.en.json';
import s from './widgets.module.css';

import { FRAME_SANDBOX, SLOW_MS } from './UrlFrame.pure';
export { FRAME_SANDBOX, SLOW_MS } from './UrlFrame.pure';

export function Frame({ url, name }: { url: string; name: string }) {
  const t = useStrings(strings);
  const el = useRef<HTMLIFrameElement>(null);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const node = el.current;
    if (!node) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let loaded = false;
    const arm = () => { if (!loaded && timer === null) timer = setTimeout(() => setSlow(true), SLOW_MS); };
    const onLoad = () => {
      loaded = true;
      if (timer !== null) clearTimeout(timer);
      setSlow(false);
    };
    node.addEventListener('load', onLoad);
    // A lazy frame off screen is not loading: the clock starts once it is on screen.
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === 'function') {
      io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) arm(); });
      io.observe(node);
    } else arm();
    return () => {
      node.removeEventListener('load', onLoad);
      io?.disconnect();
      if (timer !== null) clearTimeout(timer);
    };
  }, [url]);
  return (
    <div className={s.frameBox}>
      <iframe ref={el} className={s.frame} src={url} title={t('card.frame', { name })} sandbox={FRAME_SANDBOX} allow="" referrerPolicy="no-referrer" loading="lazy" />
      {slow && (
        <p className={s.slow} role="status" /* reason: a one-line hint that the frame has not loaded; Open in a new tab is in the menu */>
          {t('card.slow')}
        </p>
      )}
    </div>
  );
}
