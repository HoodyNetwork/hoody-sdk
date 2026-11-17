// @BotFather, wherever this page's text names it, is a link to its chat in Telegram (a kit Link: opens in a new tab).
import { Fragment, type ReactNode } from 'react';
import { Link } from '@kit';

export const BOTFATHER_AT = '@BotFather';
export const BOTFATHER_URL = 'https://t.me/BotFather';

/** @BotFather as a link to its chat, where a sentence is built around it. */
export function BotFatherLink() {
  return <Link href={BOTFATHER_URL}>{BOTFATHER_AT}</Link>;
}

/** `text` with each @BotFather drawn as a link to its chat; every other piece goes through `draw` (default: as it is). */
export function withBotFather(text: string, draw: (piece: string) => ReactNode = (p) => p): ReactNode {
  const pieces = text.split(BOTFATHER_AT);
  if (pieces.length === 1) return draw(text);
  return pieces.map((p, i) => (
    <Fragment key={i}>
      {i > 0 && <BotFatherLink />}
      {p !== '' && draw(p)}
    </Fragment>
  ));
}
