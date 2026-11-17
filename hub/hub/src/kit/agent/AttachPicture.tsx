// AttachPicture: one attached picture drawn from its address (a chip's thumbnail, the larger view fitted or at its own
// size). Its own module so the terminal, which draws no picture, can put words in its place (AttachPicture.term.tsx).
import s from './Conversation.module.css';

const LOOK = { thumb: s.attThumb, full: s.attFull, actual: s.attActual } as const;

/** `look`: the chip's thumbnail, or the larger view's picture fitted (`full`) or at its own pixels (`actual`).
 *  `onBroken`: the browser could not draw the picture. */
export function AttachPicture({ url, alt, look, onBroken }: { url: string | undefined; alt: string; look: 'thumb' | 'full' | 'actual'; onBroken?: () => void }) {
  return <img className={LOOK[look]} src={url} alt={alt} onError={onBroken} />;
}
