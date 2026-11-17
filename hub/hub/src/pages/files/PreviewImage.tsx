// A preview's picture: the thumbnail the computer made, drawn as an image. Its own module so the terminal, which draws
// no picture, can say so in its place (PreviewImage.term.tsx).
import s from './files.module.css';

export function PreviewImage({ url, alt }: { url: string; alt: string }) {
  return <img className={s.previewImage} src={url} alt={alt} />;
}
