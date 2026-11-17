// The scrolling body of the Add a program frame: its cards scroll under the fixed head, and while any of them sits
// below the body's bottom edge a fade marks that edge ("more below"), in view at every size, the phone sheet included.
import { hostEnv } from '@core';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import s from './board.module.css';

export function FrameBody({ label, role, children }: { label?: string; role?: 'region'; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const below = useMoreBelow(box);
  return (
    <div ref={box} className={s.browseBody} role={role} aria-label={label}>
      {children}
      {below ? <span className={s.moreBelow} data-more-below aria-hidden /> : null}
    </div>
  );
}

/** Whether the box's content goes on below its bottom edge: read on every scroll of the box and every size change of
 *  the box or of what it holds. A terminal draws no cue (no observers there), and nothing else changes. */
function useMoreBelow(box: RefObject<HTMLDivElement | null>): boolean {
  const [below, setBelow] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el || hostEnv().browserPage !== true || typeof ResizeObserver === 'undefined' || typeof MutationObserver === 'undefined') return;
    const read = () => setBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 1);
    // Size changes are read on the next frame: the cue it adds or drops never lands inside the observer's own pass.
    let frame = 0;
    const later = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(read); };
    const ro = new ResizeObserver(later);
    const watch = () => {
      ro.disconnect();
      ro.observe(el);
      for (const c of Array.from(el.children)) ro.observe(c);
    };
    // A tab change or a search swaps the cards: watch the new ones, and read again.
    const mo = new MutationObserver(() => { watch(); later(); });
    mo.observe(el, { childList: true, subtree: true });
    watch();
    read();
    el.addEventListener('scroll', read, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      mo.disconnect();
      el.removeEventListener('scroll', read);
    };
  }, [box]);
  return below;
}
