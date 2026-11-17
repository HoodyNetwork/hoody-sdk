// Pure parts of Ids (shared by Ids.tsx and its terminal sibling): the masked id, the shell reading used for colour,
// and the text a code line copies.
import type { HlLang } from './highlight';

const HEX24 = /^[0-9a-f]{24}$/i;

/** The masked form of an id: a long id keeps its first 4 and last 4 characters. */
export function maskId(id: string): string {
  if (id.length <= 12 && !HEX24.test(id)) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

/** A part of a command the page does not know yet ("computer"): shown as a token, never copied. */
export interface CodePlaceholder {
  placeholder: string;
}

export type CodePart = string | CodePlaceholder;

export type CodeLang = 'plain' | 'shell' | 'bash' | 'sh' | 'ansi' | HlLang;


/** A piece of a shell line and what it is, for colour only (the text and Copy never change). */
export interface ShellToken {
  kind: 'cmd' | 'flag' | 'str' | 'var' | 'op' | 'com' | 'text';
  text: string;
}

// Longest first: a redirection such as 2>&1 or &>file is one operator and is never followed by a command.
const SH_OPS = ['2>&1', '1>&2', '&>>', '&&', '||', '&>', '>&', '>>', '2>', '|', ';', '>', '<', '&', '(', ')'];
const SH_CMD_AFTER = new Set(['&&', '||', '|', ';', '&', '(']);
const SH_STOP = /[\s|;&<>()'"]/;

/** Where a shell reading stands between two pieces of text (lines of a script, parts of a line). */
export interface ShellState {
  /** The next word is a command (a line starts at one; after `|`, `&&`, `;` too). */
  atCmd: boolean;
  /** Inside a NAME=value before the command: its value is not the command and does not end the wait for it. */
  assign: boolean;
  /** A quote opened and not closed yet: the text goes on inside it. */
  quote: "'" | '"' | null;
  /** A `#` comment not ended by a newline yet: the text goes on inside it. */
  comment: boolean;
  /** The text so far ends inside a word, so a `#` right after it is part of that word, not a comment. */
  word: boolean;
  /** The text so far ends with a `\` that continues the line (or escapes whatever the next piece starts with). */
  cont: boolean;
  /** Inside a stretch the reading is not sure of (after a continued newline or an escape split across pieces): it
   *  stays plain text to the end of the line, never a comment or string colour that could hide a command. */
  plain: boolean;
  /** Lost for good (a quote inside a plain stretch, a heredoc, an escape split inside a quote, a $'…' string): all the
   *  rest stays plain text, every later line and part included. */
  lost: boolean;
}
export const SHELL_START: ShellState = Object.freeze({
  atCmd: true,
  assign: false,
  quote: null,
  comment: false,
  word: false,
  cont: false,
  plain: false,
  lost: false,
});

/** The end of a quoted string that starts at `from` (just after its opening quote), or -1 when it is not closed. */
function quoteEnd(src: string, from: number, q: "'" | '"'): number {
  let j = from;
  while (j < src.length && src[j] !== q) j += q === '"' && src[j] === '\\' ? 2 : 1;
  return j < src.length ? j : -1;
}

/** Whether the `\` characters just before `at` (back to `from`) end with one that is not itself escaped. */
function oddSlashes(src: string, from: number, at: number): boolean {
  let n = 0;
  while (at - n > from && src[at - n - 1] === '\\') n++;
  return n % 2 === 1;
}

/**
 * A light shell reading (sh and PowerShell alike), for colour: the command word, flags, quoted strings, variables
 * ($X, ${X}, $env:X), operators, redirections and comments. It starts from `state` and returns the state for the
 * next piece (the next line, or the next part of the same line), so a quote, an assignment or a comment carries over.
 * A backslash escapes the next character before quotes and operators are read; a newline not continued with `\`
 * starts a new command. Where it cannot be sure (a continued newline, an escape split across pieces) the rest of
 * that line stays plain text: it may look like a command, never like a comment or a string. A wrong colour is the
 * worst outcome, never a changed character.
 */
export function shellTokens(src: string, state: ShellState = SHELL_START): { tokens: ShellToken[]; state: ShellState } {
  const out: ShellToken[] = [];
  const push = (kind: ShellToken['kind'], text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.kind === kind && kind === 'text') last.text += text;
    else out.push({ kind, text });
  };
  let { atCmd, assign, quote, comment, plain, lost } = state;
  // `edge`: the next character starts a word (a `#` there opens a comment). `cont`: the last thing read was a `\`
  // that continues the line, the only way a newline does not end the command (a `\` inside a comment or escaped by
  // another `\` does not continue it).
  let edge = !state.word;
  let cont = state.cont;
  let i = 0;
  // Plain text to the end of everything: the reading cannot follow the quoting any more.
  const lostRun = (from: number) => {
    push('text', src.slice(from));
    i = src.length;
    lost = plain = true;
    quote = null;
    comment = false;
    cont = false;
    edge = false;
  };
  // Plain text from `from` to the end of the line: past every newline a `\` continues (the first one too when the
  // last piece ended with a continuing `\`), to the end of the piece when no newline ends it (the line may go on in
  // the next piece). A quote inside it may open a string the reading did not follow: then all the rest is lost.
  const plainRun = (from: number, contFirst = false) => {
    let e = from;
    for (;;) {
      const nl = src.indexOf('\n', e);
      if (nl < 0) {
        e = src.length;
        break;
      }
      if (!(contFirst && nl === from) && !oddSlashes(src, from, nl)) {
        e = nl;
        break;
      }
      e = nl + 1;
    }
    if (/['"`]/.test(src.slice(from, e))) return lostRun(from);
    push('text', src.slice(from, e));
    i = e;
    plain = e === src.length;
    cont = plain && oddSlashes(src, from, e);
    edge = false;
  };
  if (lost || (quote && cont)) {
    // Lost already, or a `\` ending the last piece inside a quote escapes this one's first character.
    lostRun(0);
  } else if (quote) {
    const e = quoteEnd(src, 0, quote);
    push('str', src.slice(0, e < 0 ? src.length : e + 1));
    i = e < 0 ? src.length : e + 1;
    if (e >= 0) quote = null;
    edge = false;
    cont = quote === '"' && oddSlashes(src, 0, src.length);
  } else if (comment) {
    const nl = src.indexOf('\n');
    i = nl < 0 ? src.length : nl;
    push('com', src.slice(0, i));
    if (nl >= 0) comment = false;
    cont = false;
  } else if (plain || (cont && src.length > 0 && src[0] !== '\n')) {
    // A line the reading lost track of goes on, or a `\` that ended the last piece escapes this one's first character.
    plainRun(0, plain && cont);
  }
  while (i < src.length) {
    const ch = src[i] as string;
    if (/\s/.test(ch)) {
      if (cont && ch === '\n') {
        // A continued newline: the command goes on, but where it stands is not sure any more.
        push('text', ch);
        plainRun(i + 1);
        continue;
      }
      let j = i;
      while (j < src.length && /\s/.test(src[j] as string)) j++;
      const run = src.slice(i, j);
      push('text', run);
      if (run.includes('\n')) atCmd = true;
      i = j;
      assign = false;
      edge = true;
      cont = false;
      continue;
    }
    if (ch === '#' && edge) {
      const nl = src.indexOf('\n', i);
      const e = nl < 0 ? src.length : nl;
      push('com', src.slice(i, e));
      if (nl < 0) comment = true;
      i = e;
      cont = false;
      continue;
    }
    cont = false;
    if (ch === '\\' && (i + 1 === src.length || src[i + 1] === '\n')) {
      // A line continued on the next one: the same command goes on.
      push('op', ch);
      i++;
      edge = false;
      cont = true;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const e = quoteEnd(src, i + 1, ch);
      push('str', src.slice(i, e < 0 ? src.length : e + 1));
      if (e < 0) {
        quote = ch;
        // A `\` ending the piece inside "…" escapes what the next piece starts with.
        cont = ch === '"' && oddSlashes(src, i + 1, src.length);
      }
      i = e < 0 ? src.length : e + 1;
      if (!assign) atCmd = false;
      edge = false;
      continue;
    }
    // A heredoc's body and a $'…' string (its own escapes) are not followed: all the rest stays plain.
    if (src.startsWith('<<', i) || src.startsWith("$'", i)) {
      lostRun(i);
      continue;
    }
    if (ch === '$') {
      const m = /^\$(\{[^}]*\}?|env:[A-Za-z_][A-Za-z0-9_]*|[A-Za-z_][A-Za-z0-9_]*|[0-9?!#@*$-])/.exec(src.slice(i));
      if (m) {
        push('var', m[0]);
        i += m[0].length;
        if (!assign) atCmd = false;
        edge = false;
        continue;
      }
    }
    const op = SH_OPS.find((o) => src.startsWith(o, i));
    // A ( glued to a word (key(1), f(x)) is part of that word, not a subshell.
    if (op && !(op === '(' && !atCmd && !edge && src[i - 1] !== '$')) {
      push('op', op);
      i += op.length;
      if (SH_CMD_AFTER.has(op)) atCmd = true;
      else if (op === ')') atCmd = false;
      edge = true;
      continue;
    }
    let j = i;
    while (j < src.length) {
      const c = src[j] as string;
      // An escaped character (\", \;, \ , a continued newline) is part of the word, never a quote, operator or space.
      if (c === '\\' && j + 1 < src.length) {
        if (src[j + 1] === '\n') break;
        j += 2;
        continue;
      }
      // A \ ending the piece continues the line, or escapes what the next piece starts with.
      if (c === '\\') cont = true;
      if (j > i && (SH_STOP.test(c) || c === '$')) break;
      j++;
    }
    const word = src.slice(i, j);
    if (/^--?[A-Za-z]/.test(word)) push('flag', word);
    else if (atCmd && /^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) {
      push('text', word);
      assign = true;
    } else if (assign) push('text', word);
    else if (atCmd) {
      push('cmd', word);
      atCmd = false;
    } else push('text', word);
    i = j;
    edge = false;
  }
  return { tokens: out, state: { atCmd, assign, quote, comment, word: !edge, cont, plain, lost } };
}

/** The text a line copies, or undefined while it still holds a placeholder. */
export function codeLineText(line: { code: string | readonly CodePart[]; copy?: string }): string | undefined {
  const parts = typeof line.code === 'string' ? [line.code] : line.code;
  if (parts.some((p) => typeof p !== 'string')) return undefined;
  return line.copy ?? parts.join('');
}

