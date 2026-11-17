// The chat composer's other file sources: the host items of its add menu (after the kit's own Upload files…) and the dialogs
// they open. From a computer… reads files through the Files page's read (any computer of the shown realm); Notes… reads a
// note's Markdown text; From a URL… reads a web page through the chat's own computer (attachUrl.ts). All three hand Files to the composer's own add path, so its rules, chips, refusal notes and send path
// apply: there is no second attach flow, and attaching sends nothing. Mention a file… (only with `onInsert`) reads nothing:
// it writes a file's path into the draft. The dialogs are drawn by the page beside the conversation (`AttachDialogs`), never
// inside the composer's slot.
import { useEffect, useMemo, useRef } from 'react';
import type { Target } from '@core';
import { formatNumber, useStrings, type MenuAction } from '@kit';
import { attach as A } from '@ask/io';
import { AttachComputerDialog } from './AttachComputerDialog';
import { AttachNotesDialog } from './AttachNotesDialog';
import { AttachUrlDialog } from './AttachUrlDialog';
import strings from './Conversation.strings.en.json';

export interface AttachSourcesInput {
  /** The chat this composer writes to: another chat closes an open dialog, and a read still out for the old one adds nothing. */
  chat: string;
  /** Why the chat takes no files now, in the composer's own words; '' when it does. Both items stay in the menu, disabled with it. */
  refused: string;
  /** The chat's computer and folder while it is the computer shown (From a computer… opens there); null otherwise. */
  at: { target: Target; cwd: string } | null;
  /** How many more text files the next message takes. */
  textRoom: number;
  /** How many more images the next message takes; without it, the composer's own limit. */
  imageRoom?: number;
  /** Writes text at the end of the draft (Mention a file…). Without it the menu has no such item. */
  onInsert?: (text: string) => void;
  /** The composer's own add path. */
  onAddFiles: (files: readonly File[]) => void;
  /** Draws a dialog beside the conversation (`AttachDialogs`), or takes it away (null). Stable, as a state setter is. */
  show: (dialog: AttachDialogsShown | null) => void;
}

/** The dialog an item of the add menu opened, as `AttachDialogs` draws it: null while none is open. */
export interface AttachDialogsShown {
  what: 'computer' | 'notes' | 'mention' | 'url';
  chat: string;
  at: AttachSourcesInput['at'];
  room: number;
  /** From a computer…: how many more files (images and text files together) the message takes. */
  fileRoom: number;
  onAdd: (files: readonly File[]) => void;
  onInsert?: (text: string) => void;
  onClose: () => void;
}

/** The dialog of the source that is open. Keyed by the chat, so a read still out for another chat's dialog ends with it. */
export function AttachDialogs({ show }: { show: AttachDialogsShown | null }) {
  if (show === null) return null;
  if (show.what === 'notes') return <AttachNotesDialog key={show.chat} room={show.room} onAdd={show.onAdd} onClose={show.onClose} />;
  // From a URL… reads through the chat's own computer only: without it the item is disabled, so `at` is set here.
  if (show.what === 'url') return show.at ? <AttachUrlDialog key={`u:${show.chat}`} target={show.at.target} onAdd={show.onAdd} onClose={show.onClose} /> : null;
  return show.what === 'mention' && show.onInsert
    ? <AttachComputerDialog key={`m:${show.chat}`} at={show.at} onAdd={show.onAdd} onMention={show.onInsert} onClose={show.onClose} />
    : <AttachComputerDialog key={show.chat} at={show.at} room={show.fileRoom} onAdd={show.onAdd} onClose={show.onClose} />;
}

/** The add menu's host items, in order. One of them asks the page (`show`) to draw its dialog. */
export function useAttachSources({ chat, refused, at, textRoom, imageRoom = A.IMG_MAX, onAddFiles, onInsert, show }: AttachSourcesInput): { menu: MenuAction[] } {
  const t = useStrings(strings);
  // The composer as it is when a dialog hands its files over: a dialog opened for another chat adds nothing.
  const live = useRef({ chat, onAddFiles, onInsert });
  live.current = { chat, onAddFiles, onInsert };
  // The dialog belongs to this chat's composer: it goes when the composer shows another chat, or leaves.
  useEffect(() => () => show(null), [chat, show]);
  // ... and when the chat stops taking files (a turn began): what it would attach would be refused.
  useEffect(() => { if (refused) show(null); }, [refused, show]);
  const full = textRoom <= 0 ? t('conv.add.notes.full', { max: formatNumber(A.TXT_MAX) }) : '';
  const room = Math.max(0, textRoom);
  const fileRoom = room + Math.max(0, imageRoom);
  const mentions = onInsert !== undefined;
  const menu = useMemo<MenuAction[]>(() => {
    const off = (why: string) => (why ? { isDisabled: true, disabledReason: why } : {});
    const open = (what: AttachDialogsShown['what']) => show({
      what, chat, at, room, fileRoom,
      onAdd: (files) => { if (live.current.chat === chat) live.current.onAddFiles(files); },
      ...(mentions ? { onInsert: (text: string) => { if (live.current.chat === chat) live.current.onInsert?.(text); } } : {}),
      onClose: () => show(null),
    });
    return [
      { id: 'computer', label: t('conv.add.computer'), icon: 'computer', opens: true, description: t('conv.add.computer.desc'), ...off(refused), onAction: () => open('computer') },
      { id: 'notes', label: t('conv.add.notes'), icon: 'notes', opens: true, description: t('conv.add.notes.desc'), ...off(refused || full), onAction: () => open('notes') },
      // A web page, read by the chat's own computer (attachUrl.ts): there is none to read it with while that computer is not shown.
      { id: 'url', label: t('conv.add.url'), icon: 'globe', opens: true, description: t('conv.add.url.desc'), ...off(refused || (at ? '' : t('conv.add.url.noComputer'))), onAction: () => open('url') },
      // A mention is text in the draft, so it is offered whether or not the chat takes files now.
      ...(mentions ? [{ id: 'mention', label: t('conv.add.mention'), icon: 'link' as const, opens: true, description: t('conv.add.mention.desc'), onAction: () => open('mention') }] : []),
    ];
  }, [t, refused, full, chat, at, room, fileRoom, mentions, show]);
  return { menu };
}
