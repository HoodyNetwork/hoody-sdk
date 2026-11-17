// Small pieces of the notifications page's markup, as render functions (the page's anatomy reads them where they are
// written). Their .term sibling draws the same text in the terminal.
import { Fragment, type ReactNode } from 'react';
import { noticeSegments } from '../logic';
import s from './Inbox.module.css';

/** Plain text as typed: each line break kept, nothing read as markup, its direction its own (an isolate). */
export function plainLines(text: string): ReactNode {
  return (
    <bdi>
      {text.split('\n').map((l, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {l}
        </Fragment>
      ))}
    </bdi>
  );
}

/** A name from outside (a server label) in a sentence or a fact, its direction its own (an isolate). */
export function isolated(text: string): ReactNode {
  return <bdi>{text}</bdi>;
}

/** The row under the list for its tip: 8 px under the table's frame, gone when the tip draws nothing. */
export function hintRow(hint: ReactNode): ReactNode {
  return <div className={s.hintRow}>{hint}</div>;
}

/** A notice's message in the inspector: its **bold** and its bare https links drawn (noticeSegments), the rest as
 *  written, its direction its own. Here so the terminal can draw each link as a control it can focus and press. */
export function noticeMessage(message: string): ReactNode {
  return (
    <p className={s.message}>
      <bdi>
        {noticeSegments(message).map((seg, i) => {
          // Links written into a notice stay raw: kit Link has no nofollow.
          const part = seg.href ? (
            <a key={i} href={seg.href} target="_blank" rel="noopener noreferrer nofollow">
              {seg.text}
            </a>
          ) : (
            seg.text
          );
          return seg.bold ? <strong key={i}>{part}</strong> : part;
        })}
      </bdi>
    </p>
  );
}
