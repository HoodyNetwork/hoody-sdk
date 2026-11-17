// Composer.term: the message box of a chat in a terminal. Same props and host rules as the web composer (the host says
// whether the draft can go, every note and label are the host's; nothing sends itself; the "/" and "@" menus; Stop; the
// approval switch; the send menu; Talk's slots), with the key rule a terminal can keep (prim/Compose.ts):
//
//   Enter sends · Alt+Enter or Ctrl+J is a new line · Shift+Enter is a new line only where the terminal reports it
//   (kitty keyboard protocol); a plain xterm sends Shift+Enter as Enter, so the hint names Alt+Enter.
//   Esc closes a menu, then (with onEmptyEscape) leaves an empty draft. PgUp / PgDn scroll the conversation.
//
// Files: a terminal has no file dialog and no clipboard images. A file is attached by its path: paste or type it into the
// "Attach a file" line (+), or drop the file on the terminal (the terminal pastes its path; a paste that is only paths
// attaches them). Images attach the same way (by path). Pasting an image itself is not possible: a terminal pastes text.
// Any other paste goes in the box whole, however long, as on the web (the box scrolls past maxLines; the host's counter
// applies). It is never turned into a file: a host may refuse files (New chat, an agent that takes none, a full list),
// and the pasted text was lost there.
import { isValidElement, useEffect, useRef, useState, type ReactElement, type RefObject } from 'react';
import type * as Web from './Composer';
import type { ComposerProps, ComposerNote } from './Composer';
import { Box, Text } from '@term/prim';
import { Compose, Pressable, focusInk, type ComposeHandle } from '@term/kit';
import { askPlain } from '../ask';
import { TextButton } from '../controls/Link';
import { Switch } from '../forms/fields';
import { ErrorDetails } from '../states/ErrorDetails';
import { formatNumber } from '../format';
import { ActionMenu } from '../overlays/Menu';
import { useStrings } from '../strings';
import { mentionAt, mentionInsert, mentionMatches, mentionSplit } from './mention';
import { slashMatches, slashQuery, slashRunOf, type SlashCommand } from './slash';
import { KeyLine } from './termKeyLine';
import { pastedPaths, readLocalFile } from './localFiles';
import strings from './Conversation.strings.en.json';
import termStrings from './Composer.term.strings.en.json';

export type { ComposerAttachment, ComposerNote, ComposerProps, ComposerScreenshot } from './Composer';

const COUNTER_SHARE = 0.9;
export const composerPlain: typeof Web.composerPlain = askPlain;
export const composerCount: typeof Web.composerCount = (plain) => [...plain].length;
/** The longest a "/" draft waits for the host's command list before it sends as typed. */
export const SLASH_HOLD_MS: typeof Web.SLASH_HOLD_MS = 4000;

/** Rows of a menu shown above the box. */
const MENU_ROWS = 8;

/** A menu above the box ("/" commands, "@" files): rows, the active one inverse, an optional note. Mouse picks too. */
function InlineMenu({ label, rows, active, note, onPick }: { label: string; rows: readonly { key: string; label: string; mark?: string | null; description?: string; hint?: string; opens?: string }[]; active: number; note: string | null; onPick: (i: number) => void }): ReactElement {
  const start = Math.max(0, Math.min(active - Math.floor(MENU_ROWS / 2), rows.length - MENU_ROWS));
  const shown = rows.slice(start, start + MENU_ROWS);
  return (
    <Box dir="column" border borderColour="lineStrong" title={' ' + label + ' '} padX={1} shrink={0} sem={{ role: 'listbox', name: label }}>
      {note ? <Text colour="muted">{note}</Text> : null}
      {shown.map((r, j) => {
        const i = start + j;
        const on = i === active;
        return (
          <Box key={r.key} dir="row" gap={1} onPress={() => onPick(i)} sem={{ role: 'option', name: r.label, selected: on }}>
            <Text inverse={on} bold={on} shrink={0}>{(on ? '› ' : '  ') + r.label + (r.hint ? ' ' + r.hint : '')}</Text>
            {r.mark ? <Text colour="warn" shrink={0}>{r.mark}</Text> : null}
            {r.description ? <Text colour="muted" truncate grow={1}>{r.description}</Text> : null}
            {r.opens ? <Text colour="faint" shrink={0}>{r.opens}</Text> : null}
          </Box>
        );
      })}
      {rows.length > MENU_ROWS ? <Text colour="faint">{`${start + 1}-${start + shown.length} / ${rows.length}`}</Text> : null}
    </Box>
  );
}

/** A small button of the action row: `[label]`, on the focus plate while focused (focusInk), faint when it cannot act. */
function RowButton({ label, onPress, disabled, busy, primary, why }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean; primary?: boolean; why?: string }): ReactElement {
  return (
    <Pressable onPress={() => { if (!disabled && !busy) onPress(); }} tabStop={!disabled || !!why} sem={{ role: 'button', name: label, disabled: !!disabled, busy: !!busy, ...(why ? { description: why } : {}) }}>
      {({ focused }) => <Text bold={primary} colour={disabled ? 'faint' : primary ? 'acc' : 'ink'} {...focusInk(focused)}>{'[' + (busy ? '… ' : '') + label + ']'}</Text>}
    </Pressable>
  );
}

function Notes({ notes, hold }: { notes: readonly ComposerNote[]; hold: string | null }): ReactElement {
  return (
    <>
      {notes.map((x) => (
        <Box key={x.key} dir="row" gapX={1} wrap shrink={0}>
          {typeof x.text === 'string'
            ? <Text colour={x.warn ? 'warn' : 'muted'}>{(x.warn ? '! ' : '') + x.text}</Text>
            : <Box dir="column">{x.text.map((l, i) => <Text key={i} colour={x.warn ? 'warn' : 'muted'}>{l}</Text>)}</Box>}
          {x.error === undefined || x.error === null ? null : <ErrorDetails error={x.error} mode="button" />}
          {x.end}
          {/* Send it now waits while Send does for the "/" list. */}
          {x.sends ? (
            <TextButton literal isDisabled={!!x.sends.isDisabled || hold !== null} disabledReason={hold ?? undefined}
              onPress={() => { if (hold === null && !x.sends?.isDisabled) x.sends?.onPress(); }}>{x.sends.label}</TextButton>
          ) : null}
        </Box>
      ))}
    </>
  );
}

export const Composer: typeof Web.Composer = (p: ComposerProps) => {
  const t = useStrings(strings);
  const tt = useStrings(termStrings);
  const { draft } = p;
  const ed = useRef<ComposeHandle | null>(null);
  const [focused, setFocused] = useState(false);
  // 'input' listeners a host put on the handle (the dock's draft claim): told on every edit the person makes here
  // (typing, deleting, a paste into the text), never on a value the host writes, as a textarea's input event.
  const inputs = useRef(new Set<() => void>());
  const edited = (): void => { for (const fn of [...inputs.current]) fn(); };
  // The host's ref: a textarea-shaped handle (focus, blur, caret, input listeners), so hosts that focus, place the caret
  // or listen for edits keep working.
  useEffect(() => {
    const shim = {
      focus: () => ed.current?.focus(),
      blur: () => ed.current?.blur(),
      setSelectionRange: (a: number) => ed.current?.setCaret(a),
      get selectionStart() { return ed.current?.caret() ?? 0; },
      get selectionEnd() { return ed.current?.caret() ?? 0; },
      get value() { return draft; },
      scrollIntoView: () => {},
      addEventListener: (type: string, fn: () => void) => { if (type === 'input') inputs.current.add(fn); },
      removeEventListener: (type: string, fn: () => void) => { if (type === 'input') inputs.current.delete(fn); },
    };
    (p.inputRef as RefObject<unknown> as { current: unknown }).current = shim;
  });
  const n = composerCount(composerPlain(draft));
  const over = n > p.max;
  // "/" menu
  const [slashOn, setSlashOn] = useState(false);
  const [slashAt, setSlashAt] = useState(0);
  const query = p.slash && slashOn ? slashQuery(composerPlain(draft)) : null;
  const matches = query === null || !p.slash ? [] : slashMatches(p.slash.items, query);
  const slashShown = query !== null;
  const active = Math.min(slashAt, Math.max(0, matches.length - 1));
  const slashNote = !p.slash || !slashShown ? null
    : p.slash.reading ? t('agent.slashReading')
      : p.slash.failed ? t('agent.slashFailed')
        : matches.length === 0 ? (query === '' ? t('agent.slashNone') : t('agent.slashNoMatch', { query })) : null;
  const slashRows = matches.map((c) => ({ key: c.name, label: t('agent.slashName', { name: c.name }), mark: c.untrusted ? t('agent.slashUntrusted') : null, description: c.description, ...(c.hint ? { hint: c.hint } : {}), ...(c.opens ? { opens: c.opens } : {}) }));
  const declined = useRef<string | null>(null);
  const pick = (c: SlashCommand) => {
    const name = t('agent.slashName', { name: c.name });
    if (c.run && !c.hint) {
      if (c.run('') !== false) p.setDraft('');
      else { declined.current = name; p.setDraft(name); }
    } else p.setDraft(name + ' ');
    setSlashOn(false);
    ed.current?.focus();
  };
  useEffect(() => {
    const name = declined.current;
    if (name === null || composerPlain(draft) !== name) return;
    declined.current = null;
    if (p.canSend) p.onSend();
    else p.setDraft(name + ' ');
  }, [draft, p]);
  // "@" menu
  const [caret, setCaret] = useState(draft.length);
  const [mentionShut, setMentionShut] = useState<number | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const pendingCaret = useRef<number | null>(null);
  const token = p.mention && !slashShown && !isValidElement(p.talk) ? mentionAt(draft, Math.min(caret, draft.length)) : null;
  const mentionShown = token !== null && token.start !== mentionShut;
  const split = mentionShown ? mentionSplit(token.query) : null;
  const inside = split !== null && split !== 'outside' ? split : null;
  const wantDir = inside ? inside.dir : null;
  const want = p.mention?.want;
  useEffect(() => { want?.(wantDir); }, [want, wantDir]);
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
    let end = caret + (/^\S*/u.exec(draft.slice(caret))?.[0].length ?? 0);
    if (ins.text.endsWith(' ') && draft[end] === ' ') end += 1;
    const at = token.start + ins.text.length;
    pendingCaret.current = at;
    setCaret(at);
    setMentionIdx(0);
    setMentionShut(ins.open ? null : token.start);
    p.setDraft(draft.slice(0, token.start) + ins.text + draft.slice(end));
    ed.current?.focus();
  };
  // A pick places the caret after what it wrote, once the editor holds the new draft.
  useEffect(() => {
    const at = pendingCaret.current;
    if (at === null) return;
    pendingCaret.current = null;
    ed.current?.setCaret(at);
  });
  const onCaret = (at: number) => {
    if (pendingCaret.current !== null) return;
    setCaret(at);
    const tk = mentionAt(draft, at);
    if (mentionShut !== null && (!tk || tk.start !== mentionShut)) setMentionShut(null);
  };
  const onDraft = (v: string) => {
    if (p.slash && composerPlain(draft) === '' && slashQuery(composerPlain(v)) !== null) { setSlashOn(true); setSlashAt(0); p.slash.open?.(); }
    else if (slashOn && slashQuery(composerPlain(v)) === null) setSlashOn(false);
    else if (slashOn) setSlashAt(0);
    setMentionIdx(0);
    p.onTyping(true);
    p.setDraft(v);
    edited();
  };
  const openSlash = () => {
    if (composerPlain(draft) !== '') return;
    p.setDraft('/');
    setSlashOn(true);
    setSlashAt(0);
    p.slash?.open?.();
    ed.current?.focus();
  };
  const hostCmd = p.slash ? slashRunOf(p.slash.items, composerPlain(draft)) : null;
  // A draft that starts with "/" waits while the host still reads its list (it may name a command that is not text for
  // the agent), for SLASH_HOLD_MS at most; then it sends as typed. The read starts for any such draft, typed or not.
  const slashDraft = !!p.slash && composerPlain(draft).startsWith('/');
  const waitList = slashDraft && !hostCmd && !!p.slash?.reading;
  const [holdOver, setHoldOver] = useState(false);
  useEffect(() => {
    if (!waitList) { setHoldOver(false); return; }
    const id = setTimeout(() => setHoldOver(true), SLASH_HOLD_MS);
    return () => clearTimeout(id);
  }, [waitList]);
  const listHold = waitList && !holdOver;
  const holdWhy = listHold ? t('agent.slashHold') : null;
  const openList = p.slash?.open;
  useEffect(() => { if (slashDraft) openList?.(); }, [slashDraft, openList]);
  // The other ways to send the draft (the Send menu, a note's Send it now) wait by the same rule as Send.
  const sendMenu = !p.sendMenu || holdWhy === null ? p.sendMenu
    : p.sendMenu.map((i) => ({ ...i, isDisabled: true, disabledReason: holdWhy, onAction: () => {} }));
  const send = () => {
    const host = hostCmd;
    if (host && host.cmd.run?.(host.args) !== false) { p.setDraft(''); setSlashOn(false); ed.current?.focus(); return; }
    if (listHold) return;
    if (p.canSend) { p.onSend(); ed.current?.focus(); }
  };
  // Files by path.
  const [attachOpen, setAttachOpen] = useState(false);
  const [path, setPath] = useState('');
  // Opening the row moves the focus into it (the Attach button keeps it otherwise, so typing and Esc never reached the
  // field and the row stayed open); leaving it empty closes it, as Esc does.
  const pathEd = useRef<ComposeHandle | null>(null);
  useEffect(() => { if (attachOpen) pathEd.current?.focus(); }, [attachOpen]);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const attachPaths = async (paths: readonly string[]) => {
    if (!p.onAddFiles) return;
    const files: File[] = [];
    const refused: string[] = [];
    for (const x of paths) {
      const r = await readLocalFile(x);
      if (r.k === 'file') files.push(r.file);
      else refused.push(tt(`file.${r.why}`, { path: x }));
    }
    setFileNote(refused.length ? refused.join(' ') : null);
    if (files.length) p.onAddFiles(files);
  };
  const onPaste = (text: string): boolean => {
    if (!p.onAddFiles) return false;
    const paths = pastedPaths(text);
    if (paths) { void attachPaths(paths); return true; }
    return false;
  };
  const keys = (k: { name: string; shift?: boolean; ctrl?: boolean; meta?: boolean }): boolean => {
    if (slashShown) {
      if (k.name === 'escape') { setSlashOn(false); return true; }
      if ((k.name === 'down' || k.name === 'up') && !k.shift && !k.ctrl && !k.meta && matches.length > 0) {
        setSlashAt((active + (k.name === 'down' ? 1 : matches.length - 1)) % matches.length);
        return true;
      }
      if ((k.name === 'return' || k.name === 'tab') && !k.shift && !k.ctrl && !k.meta && matches.length > 0) { pick(matches[active] as SlashCommand); return true; }
    }
    if (mentionShown && token) {
      if (k.name === 'escape') { setMentionShut(token.start); return true; }
      if ((k.name === 'down' || k.name === 'up') && !k.shift && !k.ctrl && !k.meta && entries.length > 0) {
        setMentionIdx((mActive + (k.name === 'down' ? 1 : entries.length - 1)) % entries.length);
        return true;
      }
      if ((k.name === 'return' || k.name === 'tab') && !k.shift && !k.ctrl && !k.meta && entries.length > 0) { pickMention(mActive); return true; }
    }
    if (k.name === 'escape' && p.onEmptyEscape) {
      if (draft === '') p.onEmptyEscape();
      return true;
    }
    return false;
  };
  const armed = p.auto?.shown === true;
  const live = isValidElement(p.talk);
  const counter = n >= Math.floor(p.max * COUNTER_SHARE) ? <Text colour={over ? 'danger' : 'muted'}>{(over ? '! ' : '') + t('agent.counter', { n: formatNumber(n), max: formatNumber(p.max) })}</Text> : null;
  const sendOff = (!p.canSend && !hostCmd) || listHold;
  return (
    <Box dir="column" shrink={0} {...(p.flush ? {} : { padX: 1 })}>
      <Notes notes={p.notes} hold={holdWhy} />
      {live ? p.captions : null}
      {slashShown ? <InlineMenu label={t('agent.slashList')} rows={slashRows} active={active} note={slashNote} onPick={(i) => pick(matches[i] as SlashCommand)} /> : null}
      {mentionShown ? <InlineMenu label={t('agent.mentionList')} rows={mentionRows} active={mActive} note={mentionNote} onPick={pickMention} /> : null}
      {p.attachments.length > 0 ? (
        <Box dir="row" gapX={2} wrap shrink={0} sem={{ role: 'list', name: t('agent.attList') }}>
          {p.attachments.map((a) => (
            <Box key={a.id} dir="row" gap={1} shrink={0}>
              <Text>{(a.kind === 'image' ? '▣ ' : '▤ ') + a.name}</Text>
              {a.meta ? <Text colour="faint">{a.meta}</Text> : null}
              <RowButton label={'× ' + tt('remove')} onPress={() => p.onRemoveAttachment(a.id)} />
            </Box>
          ))}
        </Box>
      ) : null}
      {fileNote ? <Text colour="muted">{fileNote}</Text> : null}
      <Box dir="row" border borderColour={p.flash ? 'acc' : focused ? 'focus' : 'lineStrong'} shrink={0} padX={1}>
        <Compose
          value={draft}
          onChange={onDraft}
          onSubmit={send}
          placeholder={p.placeholder}
          minLines={1}
          maxLines={8}
          onKey={keys}
          onPaste={onPaste}
          onCaret={onCaret}
          handle={ed}
          onFocusChange={(f) => {
            setFocused(f);
            if (f) p.onTyping(!!draft);
            else { p.onTyping(false); setSlashOn(false); if (token) setMentionShut(token.start); }
          }}
          sem={{ name: p.label ?? t('agent.composer') }}
        />
      </Box>
      {attachOpen && p.onAddFiles ? (
        <Box dir="row" gap={1} shrink={0}>
          <Text colour="muted" shrink={0}>{tt('pathLabel')}</Text>
          <Compose
            value={path}
            onChange={(v) => setPath(v.replace(/\n/g, ''))}
            onSubmit={() => { const ps = pastedPaths(path) ?? (path.trim() ? [path.trim()] : []); setPath(''); setAttachOpen(false); void attachPaths(ps); ed.current?.focus(); }}
            onKey={(k) => { if (k.name === 'escape') { setAttachOpen(false); ed.current?.focus(); return true; } return false; }}
            onFocusChange={(f) => { if (!f && path.trim() === '') setAttachOpen(false); }}
            handle={pathEd}
            autoFocus
            sem={{ name: tt('pathLabel') }}
            placeholder="~/notes/plan.md"
          />
        </Box>
      ) : null}
      {live ? (
        <Box dir="row" gap={2} shrink={0}>
          {p.talk}
          {armed ? <Text colour="warn">{t('agent.auto') + ': ' + t('agent.autoOn')}</Text> : null}
          {p.sendWhy ? <Text colour="muted">{p.sendWhy}</Text> : null}
          {counter}
        </Box>
      ) : (
        // Two groups so a narrow row wraps as whole groups (a grow spacer in a wrapping row takes a line of its own).
        <Box dir="row" gapX={2} gapY={0} shrink={0} wrap justify="between">
          <Box dir="row" gapX={2} wrap shrink={1}>
          {/* More places to add files from (the host's own pickers) follow the file-by-path item in one menu. */}
          {p.onAddFiles ? (p.addMenu && p.addMenu.length > 0
            ? <ActionMenu items={[{ id: 'upload', label: tt('attach'), description: t('agent.attach'), onAction: () => setAttachOpen((v) => !v) }, ...p.addMenu]} icon="plus" size="sm" placement="top start" label={t('agent.add')} />
            : <RowButton label={'+ ' + tt('attach')} onPress={() => setAttachOpen((v) => !v)} />) : null}
          {p.slash ? <RowButton label={'/ ' + t('agent.slash')} onPress={openSlash} disabled={composerPlain(draft) !== ''} why={composerPlain(draft) === '' ? undefined : t('agent.slashEmptyOnly')} /> : null}
          {p.auto ? (
            <Box dir="row" gap={1}>
              <Switch label={t('agent.auto')} isSelected={armed} isDisabled={p.auto.busy} onChange={(v) => p.auto?.onChange(v)} />
              {p.auto.shown === null ? <Text colour="muted">{t('agent.autoNotKnown')}</Text> : null}
            </Box>
          ) : null}
          {p.tools}
          </Box>
          <Box dir="row" gapX={2} gapY={0} shrink={0} wrap align="center">
          {counter}
          {p.sendWhy ? <Text colour="muted">{p.sendWhy}</Text> : null}
          {p.stop ? <RowButton label={'■ ' + t('agent.stop')} busy={p.stop.busy} onPress={p.stop.onPress} /> : null}
          {p.mic || null}
          <RowButton label={t('agent.send') + ' ↵'} primary={!p.sendQuiet} disabled={sendOff} why={(holdWhy ?? p.sendWhy) || undefined} onPress={send} />
          {sendMenu && sendMenu.length > 0 ? <ActionMenu items={sendMenu} icon="chevron-down" size="sm" placement="top end" label={t('agent.sendMenu')} /> : null}
          </Box>
        </Box>
      )}
      {focused ? <KeyLine line={tt('keys')} /> : null}
      {p.below}
    </Box>
  );
};
