// What a computer's group row says besides its name: the state of its Notes (the kit group's text) and what to do about it
// (its extra: short actions that keep the name's line at every width).
import type { ReactNode } from 'react';
import { Link, Notice, Skeleton, TextButton, followPageLink, useGo, usePageLink, useStrings } from '@kit';
import { links as computersLinks } from '../../computers/links';
import { listNote } from '../logic';
import strings from '../strings.en.json';
import type { Computer, Loaded, NotesState } from '../types';
import { notesUrl } from './NewNote';
import s from './parts.module.css';

/** The states where Notes did not answer, or answered nothing the Hub can use: the warning notice. */
const FAILED: ReadonlySet<NotesState> = new Set<NotesState>(['unreachable', 'cantTell', 'unexpected', 'busy']);

export interface GroupNoteProps {
  computer: Computer;
  load: Loaded | undefined;
  onRetry: () => void;
  onNew: (() => void) | null;
  count: number;
  /** 'text': what Notes said (the group header's `text`); 'actions': what the person can do (its `extra`); 'both'
   *  (default): the whole line, where it stands alone (the note pane). */
  part?: 'text' | 'actions' | 'both';
}

export function GroupNote({ computer, load, onRetry, onNew, count, part = 'both' }: GroupNoteProps) {
  const t = useStrings(strings);
  const url = notesUrl(computer);
  const go = useGo();
  const computersLink = usePageLink('computers');
  // Open Notes (a link, its icon after the words) leads the actions; what the person can do sits at their end.
  const open = url ? (
    <Link href={url} variant="inline" iconEnd="external">
      {t('action.openNotes')}
    </Link>
  ) : null;
  const pick = (text: ReactNode, lead: ReactNode, trail: ReactNode) => {
    if (part === 'text') return text;
    if (part === 'both')
      return (
        <span className={s.extra}>
          <span className={s.lead}>
            {text}
            {lead}
          </span>
          {trail ? <span className={s.trail}>{trail}</span> : null}
        </span>
      );
    if (!lead && !trail) return null;
    return (
      <span className={s.actions}>
        {lead}
        {trail ? <span className={s.trail}>{trail}</span> : null}
      </span>
    );
  };

  if (computer.state !== 'running') {
    const key = computer.state === 'starting' ? 'state.starting' : computer.state === 'attention' ? 'state.attention' : 'state.stopped';
    return pick(
      <span className={s.note}>{t(key)}</span>,
      null,
      computersLink && <TextButton onPress={() => (computersLink.kind === 'hub' ? go(computersLinks.list) : followPageLink(computersLink, go))}>{t('action.computers')}</TextButton>,
    );
  }
  if (!load || load.state === 'loading') return part === 'actions' ? null : <Skeleton variant="rows" rows={1} />;
  if (load.state !== 'ok') {
    const state = load.state;
    return pick(
      // A notes app that did not answer (or answered nothing the Hub can use) is the warning notice; a state that is
      // just so (stopped, protected, not the owner) stays a plain note.
      FAILED.has(state) ? (
        <Notice level="warn" inline icon={null}>
          {t(`state.${state}`)}
        </Notice>
      ) : (
        <span className={s.note}>{t(`state.${state}`)}</span>
      ),
      state === 'protected' || state === 'older' ? open : null,
      state === 'notOwner' || state === 'noAccess' || state === 'protected' || state === 'older' ? null : <TextButton icon="reload" onPress={onRetry}>{t('action.tryAgain')}</TextButton>,
    );
  }
  const note = listNote(count, load.recent.partial);
  return pick(
    note ? <span className={s.note}>{t(`state.${note}`)}</span> : null,
    open,
    onNew ? (
      <TextButton icon="plus" onPress={onNew}>
        {t('action.newHere')}
      </TextButton>
    ) : null,
  );
}
