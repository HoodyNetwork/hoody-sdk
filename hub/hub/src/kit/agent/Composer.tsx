// Composer: the composer is the review.
// Enter sends, Shift+Enter is a new line, ⌘↵ sends too. Text that arrives from elsewhere (prefill, suggestions) only
// fills it; nothing sends itself. The counter shows from 90 % of `max` and Send stops past it. Drafts live in memory
// only. Images and text files come by the add button, paste or drop, all through `onAddFiles`; each shows as a chip
// with a remove button. What the person may do now (`canSend`), every note and every label come from the host: this
// file knows no engine, session or send rule. Hosts: ask/Composer.tsx (the dock) now; the AI page's conversation and
// New chat (pages/ai/new: its agent, model and Options chips in `tools`).
// Talk has three slots, each holding its one kit voice part (Table S): `mic` sits just
// before Send while Talk is off; while Talk is on (`talk` is an element), it takes the action row (the draft box stays,
// Enter still sends when the host allows it; the counter, Send's waiting reason and the armed approval mark stay beside
// it) and `captions` show above the box. When the row swaps and focus was on a control it removed, focus goes to the new
// row's first control (Talk on) or to the draft box (Talk off). Absent, null or false, nothing of Talk is drawn and the
// composer is the plain one.
// The "/" menu: with `slash`, typing "/" into an EMPTY draft (or the "/" button beside add, on an empty draft) shows
// the host's commands above the box while the whole draft is one command being typed; the box keeps focus and the keys (arrows,
// Enter or Tab picks, Escape closes, a space or any other text ends it). Picking writes "/name " into the draft and sends nothing.
// A "/" anywhere else in a draft is plain text.
// The "@" menu: with `mention`, while the caret is in an "@" token that starts the draft or follows whitespace, the
// entries of the folder it names (relative to the chat's folder, which it never leaves) show in the same menu; a folder goes one
// level down, a file writes "@path ". An "@" inside a word or a path is plain text.
import { isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactElement, type ReactNode, type RefObject } from 'react';
import { Button, IconButton, cx } from '../controls/Button';
import { TextButton } from '../controls/Link';
import { askPlain } from '../ask';
import { Switch } from '../forms/fields';
import { ErrorDetails } from '../states/ErrorDetails';
import { Spinner } from '../states/Spinner';
import { formatNumber } from '../format';
import { ActionMenu, type MenuAction } from '../overlays/Menu';
import { useStrings } from '../strings';
import { AttachChip, AttachList } from './AttachChips';
import { useDisplayShot, type ComposerScreenshot } from './DisplayShot';
export type { ComposerScreenshot } from './DisplayShot';
import { SlashMenu, slashRowId } from './SlashMenu';
import { mentionAt, mentionInsert, mentionMatches, mentionSplit, type ComposerMention } from './mention';
import { slashMatches, slashQuery, slashRunOf, type ComposerSlash, type SlashCommand } from './slash';
import { windowLeft } from './takesText';
import strings from './Conversation.strings.en.json';
import s from './Conversation.module.css';

/** The counter shows from this share of `max`. */
const COUNTER_SHARE = 0.9;
/** What is sent, counted and compared: the draft without the context marker's invisible character. */
export const composerPlain = askPlain;
export const composerCount = (plain: string): number => [...plain].length;

export interface ComposerAttachment {
  id: string;
  kind: 'image' | 'text';
  name: string;
  /** An image's thumbnail, when it has one. */
  url?: string | null;
  /** The second line of the chip (size, lines), already in words. */
  meta: string;
}
/** A line above the box. `text` as an array is one block of lines. `end` is a button the host builds (Dismiss, Send anyway). */
export interface ComposerNote {
  key: string;
  text: string | readonly string[];
  warn?: boolean;
  /** Announced politely when it appears. */
  status?: boolean;
  /** The note waits on something: the kit spinner is drawn before its words. */
  busy?: boolean;
  end?: ReactNode;
  /** The note's action sends the draft again (Send it now), drawn after `end`: it waits while Send does for the "/" list,
   *  and says why. */
  sends?: { label: string; onPress: () => void; isDisabled?: boolean };
  /** The rejection behind a failure note: its Details (and Copy details for support) show after the sentence. */
  error?: unknown;
  /** The note is about the draft itself (the Bots page: "Sending declines the waiting approval."): the box is described by it. */
  describes?: boolean;
}

export interface ComposerProps {
  draft: string;
  setDraft: (v: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  placeholder: string;
  /** The box's accessible name when the host names its own addressee (the Bots page: "Message the Bot"); absent: the agent's. */
  label?: string;
  /** The most a message may be, in code points. */
  max: number;
  /** The host's verdict for this draft (text, length, readiness, files). Enter and Send do nothing without it. */
  canSend: boolean;
  /** Enter, ⌘↵ or Send. The host sends and clears the draft. */
  onSend: () => void;
  /** Why Send cannot take the draft now, as the button's label; empty when it can. */
  sendWhy?: string;
  /** Send is a quiet (secondary) button: a gate is waiting, or nothing can be sent. */
  sendQuiet?: boolean;
  notes: readonly ComposerNote[];
  attachments: readonly ComposerAttachment[];
  /** Files from the add button, a paste or a drop, in order. The host reads them. Absent: this composer takes no files (no add
   *  button; a paste of files or a drop does nothing here). */
  onAddFiles?: (files: readonly File[]) => void;
  onRemoveAttachment: (id: string) => void;
  /** Other ways to send this draft, in a menu beside Send (the AI page: "Auto-approve this reply"). Nothing shows when absent
   *  or empty; each item's own state and reason come from the host, except that every item waits while Send does for the "/" list. */
  sendMenu?: readonly MenuAction[] | null;
  /** Stop beside Send while a turn runs. */
  stop?: { busy: boolean; onPress: () => void } | null;
  /** The approval switch; `shown` null = the mode is not known. */
  auto?: { shown: boolean | null; busy: boolean; onChange: (v: boolean) => void } | null;
  /** The host's own controls after the add button (New chat: the model chip and the Options chip). */
  tools?: ReactNode;
  /** The host's panel inside the box, under the action row (New chat: the open Options). */
  below?: ReactNode;
  /** The draft box flashes (a prefill arrived). */
  flash: boolean;
  onTyping: (v: boolean) => void;
  /** The composer owns Escape while it is editing (a Board tile): an IME composition's Escape is the IME's and
   *  reaches no host; a selection collapses; text keeps focus here; on an empty draft this is called (the host moves focus on).
   *  Each of these stops the key here. Absent: Escape is not handled (it reaches the host as before). */
  onEmptyEscape?: () => void;
  /** Talk's entry beside Send (kit MicButton), drawn while Talk is off. */
  mic?: ReactElement | null | false;
  /** Talk is on exactly when this is an element (kit TalkBar): it takes the action row: add, approval switch, tools, Stop,
   *  Send and the send menu go; the counter, `sendWhy` and the armed approval mark stay. null, false or absent: the
   *  ordinary action row (so `talk={on && <TalkBar …/>}` is safe). */
  talk?: ReactElement | null | false;
  /** Live captions (kit CaptionStrip), after the notes and above the box; drawn only while Talk is on. */
  captions?: ReactElement | null | false;
  /** The "/" menu's commands (skills and built-ins, from the agent). Absent or null: no "/" button and no menu. */
  slash?: ComposerSlash | null;
  /** The "@" menu's folder reads (the chat's folder, from the host). Absent or null: "@" is plain text. */
  mention?: ComposerMention | null;
  /** More places to add files from, after Upload files in the add button's menu (the AI chat: a computer, Notes). Each item opens the
   *  host's own picker, whose files come back through the host. Absent or empty: the add button opens the file picker itself. Needs
   *  `onAddFiles`: a composer that takes no files has no add button. */
  addMenu?: readonly MenuAction[] | null;
  /** "Screenshot of a display" in the add button's menu, after Upload files (DisplayShot.tsx): a picture of a display of the chat's
   *  computer, handed to `onAddFiles` as a file. The composer draws the item, its note above the box and its dialog. Absent or null:
   *  no such item. Needs `onAddFiles`. */
  screenshot?: ComposerScreenshot | null;
  /** The plate look (the AI start page): a square box framed on three sides, whose bottom edge is whatever the host puts under it. */
  plate?: boolean;
  /** Sits flush in its host's column (the AI page's New chat): no inset of its own around the notes, box and actions. */
  flush?: boolean;
}

/** The longest a "/" draft waits for the host's command list before it sends as typed. */
export const SLASH_HOLD_MS = 4000;

export function Composer(p: ComposerProps) {
  const t = useStrings(strings);
  const { draft, inputRef } = p;
  // A blur while the window loses focus keeps typing (windowLeft); when the window comes back, typing ends unless focus
  // really returned to the field, so the flag never stays set for a field the person did not come back to.
  const onTyping = useRef(p.onTyping);
  onTyping.current = p.onTyping;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const back = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (document.activeElement !== inputRef.current) onTyping.current(false); }, 0);
    };
    window.addEventListener('focus', back);
    return () => {
      window.removeEventListener('focus', back);
      clearTimeout(timer);
    };
  }, [inputRef]);
  const noteId = useId();
  const idOf = (key: string) => `${noteId}-${key}`;
  const describedBy = p.notes.filter((x) => x.describes).map((x) => idOf(x.key)).join(' ') || undefined;
  const n = composerCount(composerPlain(draft));
  const over = n > p.max;
  const fileRef = useRef<HTMLInputElement>(null);
  const shot = useDisplayShot(p.screenshot, p.onAddFiles);
  const notes = shot.note ? [...p.notes, shot.note] : p.notes;
  const addMenu = shot.item ? [shot.item, ...(p.addMenu ?? [])] : p.addMenu;
  // The "/" menu: opened only by a "/" into an empty draft (or the button), shown while the draft is one command being typed.
  const [slashOn, setSlashOn] = useState(false);
  const [slashAt, setSlashAt] = useState(0);
  const slashId = useId();
  const query = p.slash && slashOn ? slashQuery(composerPlain(draft)) : null;
  const matches = query === null || !p.slash ? [] : slashMatches(p.slash.items, query);
  const slashShown = query !== null;
  const active = Math.min(slashAt, Math.max(0, matches.length - 1));
  const slashNote = !p.slash || !slashShown ? null
    : p.slash.reading ? t('agent.slashReading')
      : p.slash.failed ? t('agent.slashFailed')
        : matches.length === 0 ? (query === '' ? t('agent.slashNone') : t('agent.slashNoMatch', { query })) : null;
  const slashRows = matches.map((c) => ({
    key: c.name, label: t('agent.slashName', { name: c.name }), mark: c.untrusted ? t('agent.slashUntrusted') : null, description: c.description,
    ...(c.hint ? { hint: c.hint } : {}), ...(c.opens ? { opens: c.opens } : {}), ...(c.group ? { group: c.group } : {}),
  }));
  // A host command with nothing to type after it runs at the pick (the draft empties); every other pick writes "/name " for the words.
  // A no-hint command the host declines at the pick (run answers false) is sent once as "/name" under the usual rule, never run
  // again: the draft becomes "/name" and, once the host has judged that draft, the effect below sends it or (the chat cannot
  // take it) leaves "/name " for the words.
  const declined = useRef<string | null>(null);
  const pick = (c: SlashCommand) => {
    const name = t('agent.slashName', { name: c.name });
    if (c.run && !c.hint) {
      if (c.run('') !== false) p.setDraft('');
      else { declined.current = name; p.setDraft(name); }
    } else p.setDraft(name + ' ');
    setSlashOn(false);
    inputRef.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    const name = declined.current;
    if (name === null || composerPlain(draft) !== name) return;
    declined.current = null;
    if (p.canSend) p.onSend();
    else p.setDraft(name + ' ');
  }, [draft, p]);
  const onDraft = (v: string) => {
    // a paste that is not one command being typed ("/compact now") never arms it: the draft is not empty when it is later edited
    if (p.slash && composerPlain(draft) === '' && slashQuery(composerPlain(v)) !== null) { setSlashOn(true); setSlashAt(0); p.slash.open?.(); }
    else if (slashOn && slashQuery(composerPlain(v)) === null) setSlashOn(false);
    else if (slashOn) setSlashAt(0);
    p.setDraft(v);
  };
  const openSlash = () => {
    if (composerPlain(draft) !== '') return;
    p.setDraft('/');
    setSlashOn(true);
    setSlashAt(0);
    p.slash?.open?.();
    inputRef.current?.focus({ preventScroll: true });
  };
  // The "@" menu: shown while the caret is in an "@" token (not one Escape or a pick closed); the host reads the folder it names.
  const [caret, setCaret] = useState(0);
  const [mentionShut, setMentionShut] = useState<number | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const mentionId = useId();
  const pendingCaret = useRef<number | null>(null);
  const token = p.mention && !slashShown && !isValidElement(p.talk) ? mentionAt(draft, caret) : null;
  const mentionShown = token !== null && token.start !== mentionShut;
  const split = mentionShown ? mentionSplit(token.query) : null;
  const inside = split !== null && split !== 'outside' ? split : null;
  const wantDir = inside ? inside.dir : null;
  const want = p.mention?.want;
  useEffect(() => { want?.(wantDir); }, [want, wantDir]);
  // Only the entries of the folder the token names: right after a pick (or a typed "/") the host still holds the last folder's.
  const fresh = !!inside && !!p.mention && p.mention.dir === inside.dir;
  const entries = fresh && p.mention && inside ? mentionMatches(p.mention.entries, inside.name) : [];
  const mActive = Math.min(mentionIdx, Math.max(0, entries.length - 1));
  const mentionRows = entries.map((e) => ({ key: (e.dir ? 'd:' : 'f:') + e.name, label: e.dir ? t('agent.mentionFolder', { name: e.name }) : e.name }));
  const mentionNote = !mentionShown || !p.mention ? null
    : split === 'outside' || p.mention.outside ? t('agent.mentionOutside')
      : p.mention.failed ? t('agent.mentionFailed')
        : p.mention.reading || !fresh ? t('agent.mentionReading')
          : entries.length > 0 ? null
            : inside && inside.name !== '' ? t('agent.mentionNoMatch', { query: inside.name })
              : p.mention.entries.length === 0 ? t('agent.mentionNone') : t('agent.mentionHidden');
  const pickMention = (i: number) => {
    const e = entries[i];
    if (!e || !token || !inside) return;
    const ins = mentionInsert(inside.dir, e);
    // The pick replaces the whole token, the part after the caret too ("@re|adme" -> "@README.md "), and keeps one space.
    let end = caret + (/^\S*/u.exec(draft.slice(caret))?.[0].length ?? 0);
    if (ins.text.endsWith(' ') && draft[end] === ' ') end += 1;
    const at = token.start + ins.text.length;
    pendingCaret.current = at;
    setCaret(at);
    setMentionIdx(0);
    setMentionShut(ins.open ? null : token.start);
    p.setDraft(draft.slice(0, token.start) + ins.text + draft.slice(end));
    inputRef.current?.focus({ preventScroll: true });
  };
  // A pick sets the caret after what it wrote, in the commit that writes it (the pick's draft and caret are one batch).
  useLayoutEffect(() => {
    const at = pendingCaret.current;
    if (at === null) return;
    pendingCaret.current = null;
    inputRef.current?.setSelectionRange(at, at);
  });
  const onCaret = (v: string, at: number) => {
    // A selection event of the same key press as a pick reads the box before the pick is drawn: the pick's caret stands.
    if (pendingCaret.current !== null) return;
    setCaret(at);
    const tk = mentionAt(v, at);
    if (mentionShut !== null && (!tk || tk.start !== mentionShut)) setMentionShut(null);
  };
  const [dropping, setDropping] = useState(false);
  // Send disables itself when the draft clears, so a press on it hands focus to the draft box (never to the page).
  // A draft that names a host command ("/trim 3") is the host's to carry out, never text for the agent; one the host declines (run
  // answers false) is sent as typed, under the usual rule.
  const hostCmd = p.slash ? slashRunOf(p.slash.items, composerPlain(draft)) : null;
  // A draft that starts with "/" waits while the host still reads its list: it may name a command the host carries out,
  // or one the agent runs only in its terminal, and neither is text for the agent. The read starts for any such draft, typed or not
  // (pasted over text, or taken back); a command the host already knows runs, and the hold ends when the list is read.
  // The hold is bounded: a read that does not end holds a "/" draft for SLASH_HOLD_MS at most, then it sends as typed.
  const slashDraft = !!p.slash && composerPlain(draft).startsWith('/');
  const waitList = slashDraft && !hostCmd && !!p.slash?.reading;
  const [holdOver, setHoldOver] = useState(false);
  useEffect(() => {
    if (!waitList) { setHoldOver(false); return; }
    const id = setTimeout(() => setHoldOver(true), SLASH_HOLD_MS);
    return () => clearTimeout(id);
  }, [waitList]);
  const listHold = waitList && !holdOver;
  const openList = p.slash?.open;
  useEffect(() => { if (slashDraft) openList?.(); }, [slashDraft, openList]);
  const send = () => {
    const host = hostCmd;
    if (host && host.cmd.run?.(host.args) !== false) { p.setDraft(''); setSlashOn(false); inputRef.current?.focus({ preventScroll: true }); return; }
    if (listHold) return;
    if (p.canSend) { p.onSend(); inputRef.current?.focus({ preventScroll: true }); }
  };
  // The other ways to send the draft (the Send menu, a note's Send it now) wait by the same rule as Send.
  const holdWhy = t('agent.slashHold');
  const sendMenu = !p.sendMenu || !listHold ? p.sendMenu
    : p.sendMenu.map((i) => ({ ...i, isDisabled: true, disabledReason: holdWhy, onAction: () => {} }));
  const sendsOf = (x: ComposerNote) => x.sends && (
    <TextButton
      literal
      isDisabled={!!x.sends.isDisabled || listHold}
      disabledReason={listHold ? holdWhy : undefined}
      onPress={() => { if (!listHold && !x.sends?.isDisabled) x.sends?.onPress(); }}
    >{x.sends.label}</TextButton>
  );
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...e.clipboardData.files];
    // A copy that carries text as well (an office app's image of a table) pastes as text, as before.
    if (!p.onAddFiles || !files.length || e.clipboardData.types.includes('text/plain')) return;
    e.preventDefault();
    p.onAddFiles(files);
  };
  const hasFiles = (e: DragEvent) => !!p.onAddFiles && [...e.dataTransfer.types].includes('Files');
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!dropping) setDropping(true);
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    setDropping(false);
    p.onAddFiles?.([...e.dataTransfer.files]);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashShown && !(e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setSlashOn(false); return; }
      // plain arrows only: Shift, Alt, Ctrl and Meta arrows keep their text selection and navigation in the box
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !(e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) && matches.length > 0) {
        e.preventDefault();
        setSlashAt((active + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length);
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && !(e.metaKey || e.ctrlKey) && matches.length > 0) {
        e.preventDefault();
        pick(matches[active] as SlashCommand);
        return;
      }
    }
    if (mentionShown && token && !(e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMentionShut(token.start); return; }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !(e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) && entries.length > 0) {
        e.preventDefault();
        setMentionIdx((mActive + (e.key === 'ArrowDown' ? 1 : entries.length - 1)) % entries.length);
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && !(e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) && entries.length > 0) {
        e.preventDefault();
        pickMention(mActive);
        return;
      }
    }
    if (e.key === 'Escape' && p.onEmptyEscape) {
      // Composing (Safari reports keyCode 229): the IME cancels its own composition; nothing above hears this Escape.
      if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) { e.stopPropagation(); return; }
      const el = e.currentTarget;
      e.preventDefault();
      e.stopPropagation();
      if (el.selectionStart !== el.selectionEnd) { el.setSelectionRange(el.selectionEnd, el.selectionEnd); return; }
      if (el.value === '') p.onEmptyEscape();
      return;
    }
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
    if (e.shiftKey && !(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    send();
  };
  // Grows with its text, 1-8 rows (the CSS caps it at 40 % of the dock). Measured again when the box changes width: a box first laid
  // out narrow (a frame still settling, a phone layout switching in) would otherwise keep the height its text had at that width.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, inputRef]);
  useEffect(() => {
    const el = inputRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let width = -1;
    const ro = new ResizeObserver((entries) => {
      const w = entries[entries.length - 1]?.contentRect.width ?? 0;
      if (w === width) return;
      width = w;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [inputRef]);
  const armed = p.auto?.shown === true;
  const live = isValidElement(p.talk);
  const rowRef = useRef<HTMLDivElement>(null);
  const wasLive = useRef(live);
  // Whether the action row holds focus, from committed focus events only (never read while rendering): a focus inside
  // sets it, any blur clears it (a move inside the row blurs, then focuses, so it ends set). The swap's own removal of the
  // focused control reaches no handler (React holds events back during a commit), so a row whose focused control the
  // swap removed still reads as holding it.
  const rowFocus = useRef(false);
  const onRowFocus = () => { rowFocus.current = true; };
  const onRowBlur = () => { rowFocus.current = false; };
  // The row swap removes the control that was pressed (Mic in, End out). Only when the row held focus and focus fell to
  // the page is it moved: to the new row's first control when Talk comes on (the draft box when that row has none yet,
  // or only a control that must not catch a second press of the key that started Talk: TalkBar's End while starting,
  // data-no-first-focus), to the draft box when Talk goes off.
  useLayoutEffect(() => {
    if (wasLive.current === live) return;
    wasLive.current = live;
    const a = document.activeElement;
    if (rowFocus.current && !(a && a !== document.body && a.isConnected)) {
      const first = live ? rowRef.current?.querySelector<HTMLElement>('button:not([disabled]):not([data-no-first-focus]), [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"]):not([data-no-first-focus])') : null;
      (first ?? inputRef.current)?.focus({ preventScroll: true });
    }
    rowFocus.current = !!rowRef.current?.contains(document.activeElement);
  }, [live, inputRef]);
  const counter = n >= Math.floor(p.max * COUNTER_SHARE) && <span className={cx(s.counter, over && s.bad)}>{t('agent.counter', { n: formatNumber(n), max: formatNumber(p.max) })}</span>;
  const sendProps = {
    icon: 'arrow-up',
    variant: p.sendQuiet ? 'secondary' : 'primary',
    // The reason the button waits is its description (reachable while it is disabled), never its name.
    label: t('agent.send'),
    description: (listHold ? t('agent.slashHold') : p.sendWhy) || undefined,
    shortcut: p.sendWhy || listHold ? undefined : t('agent.sendKey'),
    isDisabled: (!p.canSend && !hostCmd) || listHold,
    onPress: send,
  } as const;
  return (
    <div className={cx(s.composerWrap, p.flush && s.composerFlush)} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {notes.map((x) => {
        const cls = cx(s.composerNote, x.warn && s.warnText, x.busy && s.composerNoteBusy);
        const role = x.status ? 'status' : undefined;
        const details = x.error === undefined || x.error === null ? null : <ErrorDetails error={x.error} mode="button" />;
        if (typeof x.text !== 'string') {
          return (
            <div key={x.key} className={cls} role={role}>
              {/* A space between lines: read as one description, the lines stay apart ("…sent. The reply…"). */}
              <span id={x.describes ? idOf(x.key) : undefined}>{x.text.map((l, i) => <span key={i} className={s.attNote}>{i > 0 ? ' ' : ''}{l}</span>)}</span>
              {details}
              {x.end}
              {sendsOf(x)}
            </div>
          );
        }
        return (
          // A note that describes the box gives it its words only: its action ("Don't send") is a control of its own, never run on
          // into the description.
          <p key={x.key} id={x.describes && !(x.end || x.sends || details || x.busy) ? idOf(x.key) : undefined} className={cls} role={role}>
            {x.busy && <Spinner />}
            {x.end || x.sends || details || x.busy ? <span id={x.describes ? idOf(x.key) : undefined}>{x.text}</span> : x.text}
            {details}
            {x.end}
            {sendsOf(x)}
          </p>
        );
      })}
      {live && p.captions}
      <div className={cx(s.composer, p.plate && s.plate, p.flash && s.flash, dropping && s.dropping)}>
        {slashShown && <SlashMenu id={slashId} label={t('agent.slashList')} rows={slashRows} active={active} note={slashNote} onPick={(i) => pick(matches[i] as SlashCommand)} onActive={setSlashAt} />}
        {mentionShown && <SlashMenu id={mentionId} label={t('agent.mentionList')} rows={mentionRows} active={mActive} note={mentionNote} onPick={pickMention} onActive={setMentionIdx} />}
        {p.attachments.length > 0 && (
          <AttachList label={t('agent.attList')}>
            {p.attachments.map((a) => (
              <AttachChip
                key={a.id}
                kind={a.kind}
                url={a.url}
                name={a.name}
                meta={a.meta}
                // Removed from the keyboard, the chip's button goes with it: the focus goes to the message box, never lost.
                action={<IconButton icon="x" size="sm" label={t('agent.attRemove', { name: a.name })} onPress={(e) => { p.onRemoveAttachment(a.id); if (e?.pointerType === 'keyboard' || e?.pointerType === 'virtual') inputRef.current?.focus({ preventScroll: true }); }} />}
              />
            ))}
          </AttachList>
        )}
        <textarea
          ref={inputRef}
          className={s.input}
          rows={1}
          value={draft}
          placeholder={p.placeholder}
          aria-label={p.label ?? t('agent.composer')}
          aria-describedby={describedBy}
          aria-controls={slashShown && matches.length > 0 ? slashId : mentionShown && entries.length > 0 ? mentionId : undefined}
          aria-activedescendant={slashShown && matches.length > 0 ? slashRowId(slashId, active) : mentionShown && entries.length > 0 ? slashRowId(mentionId, mActive) : undefined}
          onChange={(e) => { onCaret(e.target.value, e.target.selectionStart ?? e.target.value.length); setMentionIdx(0); onDraft(e.target.value); }}
          onSelect={(e) => onCaret(e.currentTarget.value, e.currentTarget.selectionStart)}
          onKeyDown={onKey}
          onFocus={() => p.onTyping(!!draft)}
          onBlur={() => { if (!windowLeft()) { p.onTyping(false); setSlashOn(false); if (token) setMentionShut(token.start); } }}
          onInput={() => p.onTyping(true)}
          onPaste={onPaste}
        />
        {p.onAddFiles && <input
          ref={fileRef}
          className={s.attFile}
          type="file"
          multiple
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            // Cleared so the same file can be picked again after it is removed.
            e.target.value = '';
            p.onAddFiles?.(files);
          }}
        />}
        {live ? (
          <div ref={rowRef} className={s.actionRow} onFocus={onRowFocus} onBlur={onRowBlur}>
            {p.talk}
            {(counter || p.sendWhy || armed) && (
              <span className={s.actionEnd}>
                {armed && (
                  <span className={cx(s.autoWrap, s.autoArmed)}>
                    {t('agent.auto')}
                    <span className={s.autoOn}>{t('agent.autoOn')}</span>
                  </span>
                )}
                {p.sendWhy && <span className={s.counter}>{p.sendWhy}</span>}
                {counter}
              </span>
            )}
          </div>
        ) : <div ref={rowRef} className={s.actionRow} onFocus={onRowFocus} onBlur={onRowBlur}>
          <span className={cx(s.actionStart, p.tools !== undefined && !p.auto && s.actionFit)}>
            {p.onAddFiles && (addMenu && addMenu.length > 0
              ? <ActionMenu items={[{ id: 'upload', label: t('agent.addUpload'), icon: 'upload', description: t('agent.attach'), onAction: () => fileRef.current?.click() }, ...addMenu]} icon="plus" size="sm" placement="top start" label={t('agent.add')} />
              : <IconButton icon="plus" size="sm" label={t('agent.attach')} onPress={() => fileRef.current?.click()} />)}
            {p.slash && (
              <IconButton
                icon="slash"
                size="sm"
                label={t('agent.slash')}
                description={composerPlain(draft) === '' ? undefined : t('agent.slashEmptyOnly')}
                isDisabled={composerPlain(draft) !== ''}
                onPress={openSlash}
              />
            )}
            {p.auto && (
              <span className={cx(s.autoWrap, armed && s.autoArmed)}>
                <Switch className={s.autoChip} label={t('agent.auto')} isSelected={armed} isDisabled={p.auto.busy} onChange={(v) => p.auto?.onChange(v)} />
                {armed && <span className={s.autoOn}>{t('agent.autoOn')}</span>}
                {p.auto.shown === null && <span className={s.autoOn}>{t('agent.autoNotKnown')}</span>}
              </span>
            )}
            {p.tools}
          </span>
          <span className={s.actionEnd}>
            {counter}
            {p.stop && <Button variant="secondary" size="sm" icon="stop" busy={p.stop.busy} onPress={p.stop.onPress}>{t('agent.stop')}</Button>}
            {p.mic}
            <IconButton {...sendProps} />
            {sendMenu && sendMenu.length > 0 && <ActionMenu items={sendMenu} icon="chevron-down" size="sm" placement="top end" label={t('agent.sendMenu')} />}
          </span>
        </div>}
        {p.below}
      </div>
      {shot.dialog}
    </div>
  );
}
