// Card.tsx: the frame of every screen the standalone Hub shows before the Hub itself (FirstRun.tsx, OldFile.tsx): one
// centred card (kit CutFrame on --hx-card, at most --auth-card-w) in <main>, with the kit BrandMark (lg) on top, the state's title as
// the page's one h1 (and in document.title); no footer. `below` is the one line
// under the card ("New to Hoody? Create an account"); card and line are centred together while they fit, and the page
// scrolls when they do not (no fixed part, no inner scrollbar).
//
// Contract:
//   - The only place a server is named: when this page's link chose another listed server (shared.js standaloneChoice
//     'alt' or 'local'), a warn band in every state says which host this page signs in to, with "Use the built-in
//     server" (the same page without the `hoody` parameter: a new load). The host comes from the choice shared.js made
//     from its own list, never from the address text. A refused link says so once, without the value it named.
//   - A page opened as a file says, in a quiet line at the foot of the card, that closing or reloading signs out.
//   - Focus: a state with a field focuses its first field (autoFocus there); one without (`focusTitle`) focuses its
//     title whenever the title changes. A link that chose another server (or was refused) has the sign-in card focus
//     its title first (FirstRun.tsx), and the band is the title's description, so the changed context is announced.
//   - Tokens only; the bands sit on the card ground --hx-card (kit Band warn is see-through).
//   - Behind the card, on the page ground, is the page grid with its small "H" marks (HGrid.tsx): decoration, hidden
//     from assistive tech, and no mark touches the column (the card and the line under it).
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Band, BrandMark, CutFrame, TextButton } from '@kit';
import { useStrings } from '@kit/strings';
import type { StandaloneChoice } from '@core/origin';
import { defaultChoiceUrl, hostOf, siteOf } from './boot';
import { fileMemoryState } from './fileMemory';
import s from './FirstRun.module.css';
import { HGrid } from './HGrid';
import strings from './strings.en.json';

export interface CardProps {
  title: string;
  /** The link's choice (shared.js standaloneChoice), or null. */
  choice: StandaloneChoice | null;
  /** The state has no field: focus goes to the title. */
  focusTitle?: boolean;
  /** The line under the card, outside it. */
  below?: ReactNode;
  children: ReactNode;
}

/** The link's choice, when it is not the plain default. */
function ChoiceBand({ choice }: { choice: StandaloneChoice }) {
  const t = useStrings(strings);
  if (choice.asked === 'alt' || choice.asked === 'local') {
    return (
      <Band
        tone="warn" /* noDetails: which server this page signs in to, from this page's own list; nothing was sent */
        actions={<TextButton onPress={() => { window.location.replace(defaultChoiceUrl(window.location.href)); }}>{t('choice.useDefault')}</TextButton>}
      >
        {t('choice.other', { host: hostOf(choice.origin) })}
      </Band>
    );
  }
  if (choice.asked === 'refused') {
    return <Band tone="neutral" /* noDetails: the link asked for a server this page does not list; nothing was sent */>{t('choice.refused', { site: siteOf(choice.origin) })}</Band>;
  }
  return null;
}

export function Card({ title, choice, focusTitle = false, below, children }: CardProps) {
  const t = useStrings(strings);
  const heading = useRef<HTMLHeadingElement>(null);
  // The column as state, not a ref: the backdrop is drawn before it and must be given the element once it exists.
  const [column, setColumn] = useState<HTMLDivElement | null>(null);
  const noteId = useId();
  const noted = choice !== null && choice.asked !== 'default';
  useEffect(() => {
    document.title = t('doc.title', { title });
  }, [t, title]);
  useEffect(() => {
    if (focusTitle) heading.current?.focus();
  }, [focusTitle, title]);
  return (
    <main className={s.screen}>
      <HGrid avoid={column} />
      <div ref={setColumn} className={s.column}>
        <CutFrame className={s.frame} innerClassName={s.card}>
          {/* The Hoody brand (kit BrandMark lg: the 32 px mark and "Hoody Hub"); the h1 names the place, so it is hidden. */}
          <p className={s.brand} aria-hidden="true">
            <BrandMark size="lg" hub />
          </p>
          <h1 ref={heading} tabIndex={-1} className={s.title} aria-describedby={noted ? noteId : undefined}>
            {title}
          </h1>
          {noted && choice && (
            <div id={noteId}>
              <ChoiceBand choice={choice} />
            </div>
          )}
          {children}
          {fileMemoryState() === 'on' && <p className={s.note}>{t('file.notice')}</p>}
        </CutFrame>
        {below}
      </div>
    </main>
  );
}
