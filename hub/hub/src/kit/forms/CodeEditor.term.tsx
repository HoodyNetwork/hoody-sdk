// CodeEditor in the terminal. Editable: the code in a multiline field (the engine's textarea: Enter is a new line, Tab
// leaves the field as the web's default "Tab moves focus", Ctrl+S calls onSave), its problems listed under it, each one
// with a line a button that puts the caret at the start of that line. No colours, gutter or find bar: the field shows
// the text as it is. Read-only (or locked), the code is shown as numbered plain lines with the problems under it. User
// text is drawn through prim Text and the engine's text filter, which escape terminal control characters.
// A save never changes bytes the person did not edit: the field holds what the engine's filter lets through (safeText:
// a TAB becomes one space, CR LF and a lone CR become LF, control and format characters become marks or go), so code
// holding any of those (a Makefile, tab-indented Python, CR LF line ends) is never a field here. It is shown read-only
// with one line sending the person to the web Hub's editor.
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import type * as Web from './CodeEditor';
import { safeText } from '@term/kit';
import { Box, Pressable, Text, useTerminalSize } from '../../term/prim';
import { FieldInput, type FieldHandle } from '../../term/prim/FieldInput';
import { ControlRow } from './termField';
import { useFieldLock } from './lock';
import { useStrings } from '../strings';
import strings from './forms.strings.en.json';
import termStrings from './term.strings.en.json';

export type { CodeProblem, CodeEditorProps, CodeEditorHandle } from './CodeEditor';
export const EDITOR_COLOUR_MAX: typeof Web.EDITOR_COLOUR_MAX = 64 * 1024;

const MAX_PROBLEMS = 50;
/** Rows the terminal keeps for the page around an editable editor (header, tabs, tools, key line, a problem). */
const ROOM_AROUND = 10;
const MIN_ROWS = 4;

/** UTF-16 offset of the first character of 1-based `line` in `text` (its end when the line is past the last). */
function lineStart(text: string, line: number): number {
  let at = 0;
  for (let l = 1; l < line; l++) {
    const nl = text.indexOf('\n', at);
    if (nl < 0) return text.length;
    at = nl + 1;
  }
  return at;
}

export const CodeEditor: typeof Web.CodeEditor = forwardRef<Web.CodeEditorHandle, Web.CodeEditorProps>(function CodeEditor({ value, onChange, label, readOnly, problems = [], onSave, rows = 18, tools }, ref) {
  const t = useStrings(strings);
  const tt = useStrings(termStrings);
  const locked = useFieldLock(false);
  // The field would rewrite this code (see the header): read-only here, edited on the web.
  const rewritten = safeText(value) !== value;
  const editable = !readOnly && !locked && !rewritten;
  const field = useRef<FieldHandle | null>(null);
  const [focused, setFocused] = useState(false);
  const term = useTerminalSize();
  const lines = value.split(/\r?\n/);
  // The web's rule: a problem's line counts only when it is a line of the text; else it is a problem with no line.
  const lineOf = (l: number | null): number | null => (l !== null && l > 0 && l <= lines.length ? Math.floor(l) : null);
  const shown = problems.slice(0, MAX_PROBLEMS).map((p) => ({ line: lineOf(p.line), message: p.message }));
  const jump = (line: number): void => {
    field.current?.setCaret?.(lineStart(value, line));
    field.current?.focus();
  };
  useImperativeHandle(ref, () => ({
    focus: () => { if (editable) field.current?.focus(); },
    jumpTo: (line: number) => { const l = lineOf(line); if (editable && l !== null) jump(l); },
    find: (q: string) => {
      if (!q) return 0;
      let n = 0;
      for (let i = value.indexOf(q); i >= 0 && n < 10000; i = value.indexOf(q, i + q.length)) n++;
      return n;
    },
  }), [value, editable]);
  // The page's own tools (a template picker, a format button) are its actions, shown in both forms.
  const toolRow = tools ? <Box dir="row" gap={1} wrap>{tools}</Box> : null;
  const name = label ?? t('editor.label');
  const invalid = shown.length > 0;
  const errorText = invalid ? shown.map((p) => p.message).join(' ') : undefined;
  const problemText = (p: { line: number | null; message: string }): string => `✗ ${p.line !== null ? `${t('editor.line', { n: p.line })}: ` : ''}${p.message}`;
  if (editable) {
    const height = Math.max(MIN_ROWS, Math.min(rows, term.height - ROOM_AROUND));
    return (
      <Box dir="column" shrink={0}>
        {toolRow}
        {label ? <Text>{label}</Text> : null}
        <Box dir="row" shrink={0} height={height}>
          <ControlRow focused={focused} invalid={invalid}>
            <FieldInput
              handle={field}
              value={value}
              onChange={onChange}
              lines={height}
              colour="ink"
              onFocusChange={setFocused}
              onKey={(k) => {
                if (onSave && k.ctrl && !k.meta && !k.shift && k.name === 's') { onSave(value); return true; }
                return false;
              }}
              sem={{ name, invalid: invalid || undefined, errorText }}
            />
          </ControlRow>
        </Box>
        <Text colour="faint">{tt(onSave ? 'code.keysSave' : 'code.keys')}</Text>
        {shown.map((p, i) => (p.line !== null ? (
          <Pressable key={`p${i}`} onPress={() => jump(p.line!)} sem={{ role: 'button', name: problemText(p).slice(2) }}>
            <Text colour="danger">{problemText(p)}</Text>
          </Pressable>
        ) : (
          <Text key={`p${i}`} colour="danger">{problemText(p)}</Text>
        )))}
      </Box>
    );
  }
  const w = String(lines.length).length;
  const marked = new Set(shown.map((p) => p.line).filter((l): l is number => l !== null));
  return (
    <Box dir="column" shrink={0}>
      {toolRow}
      {label ? <Text>{label} <Text colour="faint">({tt('field.readOnly')})</Text></Text> : null}
      {/* The web's read-only textarea: a textbox holding the code, named by the label, invalid while problems show. */}
      <Box dir="column" sem={{ role: 'textbox', name, value, readonly: true, multiline: true, invalid: invalid || undefined, errorText }}>
        {lines.map((l, i) => (
          <Text key={i}>
            <Text colour={marked.has(i + 1) ? 'danger' : 'faint'}>{marked.has(i + 1) ? '✗' : ' '}{String(i + 1).padStart(w, ' ')} │ </Text>
            {l}
          </Text>
        ))}
      </Box>
      {!readOnly && !locked && rewritten ? <Text colour="muted">{tt('code.rawChars')}</Text> : null}
      {shown.map((p, i) => (
        <Text key={`p${i}`} colour="danger">{problemText(p)}</Text>
      ))}
    </Box>
  );
}) as typeof Web.CodeEditor;
