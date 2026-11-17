// CodeEditor: the kit's editor for a script or config text. Use a multiline TextField instead for prose. A native
// <textarea>, so IME, undo and screen readers work as the browser does them; no dependency. Around it:
//   - a line-number gutter that follows the textarea's scroll; lines with a problem get a mark;
//   - a Problems list under it, each item a button that selects its line;
//   - a find bar (Ctrl/⌘ F; Enter / Shift Enter; Aa; Esc closes) that selects through setSelectionRange;
//   - Ctrl/⌘ S calls onSave; Tab moves focus unless "Tab key indents" is on (Ctrl M toggles it);
//   - a status line with the caret's line and column;
//   - with `lang`, syntax colours: an aria-hidden <pre> mirror under the textarea, whose own text
//     turns transparent. The mirror is the kit CodeBlock's lexer and colours (data/highlight.ts, .hl_* in
//     Ids.module.css), drawn as React text, never markup. Textarea and mirror share one metrics class (.text), and sync() copies
//     both scroll offsets. Above 64 KiB, or under Performance mode, the mirror is off and the textarea shows its text.
//     Caret, selection, find, problems and the gutter stay the textarea's own.
// Code reads left to right in every page direction. A locked Form makes it read-only.
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, IconButton, cx } from '../controls/Button';
import { highlight, type HlLang, type HlToken } from '../data/highlight';
import hl from '../data/Ids.module.css';
import { Icon } from '../icons';
import { usePerf } from '../perf';
import { useStrings } from '../strings';
import strings from './forms.strings.en.json';
import { useFieldLock } from './lock';
import s from './CodeEditor.module.css';

export interface CodeProblem {
  /** 1-based line, or null for a problem with no line. */
  line: number | null;
  /** Already scrubbed and resolved text. */
  message: string;
}

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name (defaults to "Code"). */
  label?: string;
  readOnly?: boolean;
  /** Validation problems: marks in the gutter and the Problems list. At most 50 show. */
  problems?: readonly CodeProblem[];
  /** Ctrl/⌘ S. Not called while read-only or locked. */
  onSave?: (value: string) => void;
  /** Rows of text when the host gives no height (default 18). The editor fills a sized parent. */
  rows?: number;
  /** Colour the code as this language (the CodeBlock's languages). Without it the text is plain. */
  lang?: HlLang;
  /** The page's controls at the end of the editor's own button row (after Find and Tab moves focus, before the caret
   * line). */
  tools?: React.ReactNode;
  className?: string;
}

export interface CodeEditorHandle {
  focus(): void;
  /** Select a line (1-based) and scroll it into view. */
  jumpTo(line: number): void;
  /** Open find with a query; returns the number of matches. */
  find(query: string): number;
}

const MAX_PROBLEMS = 50;
const MAX_HITS = 10000;
const INDENT = '  ';

// The query as a literal pattern: every regular-expression syntax character escaped, nothing else (the `u` flag
// refuses any other escape).
const SYNTAX = /[\\^$.*+?()[\]{}|]/g;

/** Every match of `query` in `text`, none overlapping, at most MAX_HITS: where it starts and how long it is, both in
 *  `text` itself. Without match case the match is Unicode case-insensitive on the text's own characters, never on a
 *  lower-cased copy, whose offsets drift after a character whose lower case is longer ('İ' lower-cases to two units). */
function findHits(text: string, query: string, matchCase: boolean): { at: number; len: number }[] {
  if (!query) return [];
  const re = new RegExp(query.replace(SYNTAX, '\\$&'), matchCase ? 'gu' : 'giu');
  const out: { at: number; len: number }[] = [];
  for (let m = re.exec(text); m && out.length < MAX_HITS; m = re.exec(text)) out.push({ at: m.index, len: m[0].length });
  return out;
}

/** Above this many characters the colours are off and the textarea shows its own text. */
export const EDITOR_COLOUR_MAX = 64 * 1024;

/** One coloured piece of the mirror: React text in a span, the CodeBlock's rule (data/Ids.tsx HlTok). */
function MirrorTok({ t }: { t: HlToken }) {
  return t.kind === 'text' || t.kind === 'punct' ? <>{t.text}</> : <span className={hl[`hl_${t.kind}`]}>{t.text}</span>;
}

function offsetOf(text: string, line: number): number {
  let pos = 0;
  for (let i = 1; i < line; i++) {
    const nl = text.indexOf('\n', pos);
    if (nl === -1) return text.length;
    pos = nl + 1;
  }
  return pos;
}

function lineAt(text: string, pos: number): number {
  let n = 1;
  for (let i = text.indexOf('\n'); i !== -1 && i < pos; i = text.indexOf('\n', i + 1)) n++;
  return n;
}

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor(
  { value, onChange, label, readOnly, problems = [], onSave, rows = 18, lang, tools, className },
  ref,
) {
  const t = useStrings(strings);
  const id = useId();
  const ta = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const mirror = useRef<HTMLPreElement>(null);
  const perf = usePerf().on;
  const painted = lang !== undefined && !perf && value.length <= EDITOR_COLOUR_MAX;
  const query = useRef<HTMLInputElement>(null);
  const locked = useFieldLock(false);
  const ro = Boolean(readOnly) || locked;

  const [findOpen, setFindOpen] = useState(false);
  const [q, setQ] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [at, setAt] = useState(0);
  const [tabIndents, setTabIndents] = useState(false);
  const [caret, setCaret] = useState({ line: 1, col: 1 });

  const lineCount = useMemo(() => value.split('\n').length, [value]);
  const shown = useMemo(
    () =>
      problems.slice(0, MAX_PROBLEMS).map((p) => ({
        line: p.line && p.line > 0 && p.line <= lineCount ? Math.floor(p.line) : null,
        message: p.message,
      })),
    [problems, lineCount],
  );
  const marked = useMemo(() => new Set(shown.map((p) => p.line).filter((l): l is number => l !== null)), [shown]);

  const hits = useMemo(() => findHits(value, q, matchCase), [q, matchCase, value]);
  const cur = hits.length ? Math.min(at, hits.length - 1) : -1;

  // The gutter and the colour mirror follow the textarea's scroll (CSSOM, no style attribute rewrite per render).
  const sync = useCallback(() => {
    const el = ta.current;
    if (!el) return;
    if (gutter.current) gutter.current.style.transform = `translateY(${-el.scrollTop}px)`;
    if (mirror.current) {
      mirror.current.scrollTop = el.scrollTop;
      mirror.current.scrollLeft = el.scrollLeft;
    }
  }, []);
  useLayoutEffect(sync, [sync, lineCount, painted]);
  const tokens = useMemo(() => (painted && lang !== undefined ? highlight(value, lang) : []), [painted, value, lang]);

  const reveal = useCallback(
    (pos: number) => {
      const el = ta.current;
      if (!el) return;
      const step = parseFloat(getComputedStyle(el).lineHeight) || 20;
      const top = (lineAt(el.value, pos) - 1) * step;
      if (top < el.scrollTop || top > el.scrollTop + el.clientHeight - 2 * step) el.scrollTop = Math.max(0, top - el.clientHeight / 3);
      sync();
    },
    [sync],
  );

  const jumpTo = useCallback(
    (line: number) => {
      const el = ta.current;
      if (!el) return;
      const start = offsetOf(el.value, line);
      const nl = el.value.indexOf('\n', start);
      el.focus();
      el.setSelectionRange(start, nl === -1 ? el.value.length : nl);
      reveal(start);
      setCaret({ line, col: 1 });
    },
    [reveal],
  );

  const selectHit = useCallback(
    (i: number) => {
      const el = ta.current;
      const hit = hits[i];
      if (!el || hit === undefined) return;
      el.setSelectionRange(hit.at, hit.at + hit.len);
      reveal(hit.at);
    },
    [hits, reveal],
  );

  const go = (dir: 1 | -1) => {
    if (!hits.length) return;
    const next = (cur + dir + hits.length) % hits.length;
    setAt(next);
    selectHit(next);
  };

  const openFind = useCallback((text?: string) => {
    setFindOpen(true);
    if (text !== undefined) setQ(text);
    setAt(0);
    window.setTimeout(() => {
      query.current?.focus();
      query.current?.select();
    }, 0);
  }, []);

  const closeFind = () => {
    setFindOpen(false);
    ta.current?.focus();
  };

  useImperativeHandle(
    ref,
    () => ({
      focus: () => ta.current?.focus(),
      jumpTo,
      find: (text: string) => {
        openFind(text);
        return findHits(value, text, false).length;
      },
    }),
    [jumpTo, openFind, value],
  );

  // Typing in find selects the first match from the top.
  useEffect(() => {
    if (findOpen && hits.length) selectHit(Math.min(at, hits.length - 1));
    // Only when the query or case changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, matchCase]);

  const insert = (text: string) => {
    const el = ta.current;
    if (!el) return;
    // execCommand keeps the browser's undo history; setRangeText is the fallback.
    if (!document.execCommand?.('insertText', false, text)) {
      el.setRangeText(text, el.selectionStart, el.selectionEnd, 'end');
      onChange(el.value);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'f') {
      e.preventDefault();
      openFind();
    } else if (mod && k === 's') {
      e.preventDefault();
      if (onSave && !ro) onSave(value);
    } else if (e.ctrlKey && k === 'm') {
      e.preventDefault();
      setTabIndents((v) => !v);
    } else if (e.target === ta.current && k === 'tab' && tabIndents && !mod && !e.altKey && !e.shiftKey && !ro) {
      e.preventDefault();
      insert(INDENT);
    }
  };

  const trackCaret = () => {
    const el = ta.current;
    if (!el) return;
    const pos = el.selectionStart;
    const line = lineAt(el.value, pos);
    setCaret({ line, col: pos - offsetOf(el.value, line) + 1 });
  };

  const numbers = useMemo(() => Array.from({ length: lineCount }, (_, i) => i + 1), [lineCount]);

  const textarea = (
    <textarea
      ref={ta}
      className={lang === undefined ? s.text : cx(s.text, painted && s.painted)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onScroll={sync}
      onSelect={trackCaret}
      onKeyUp={trackCaret}
      onClick={trackCaret}
      readOnly={ro}
      wrap="off"
      spellCheck={false}
      autoCapitalize="off"
      autoComplete="off"
      aria-label={label ?? t('editor.label')}
      aria-invalid={shown.length ? true : undefined}
      aria-describedby={shown.length ? `${id}-problems` : undefined}
    />
  );

  return (
    // The keydown handler only adds shortcuts on top of the textarea and find field inside.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className={cx(s.editor, ro && s.readOnly, className)} onKeyDown={onKeyDown} data-readonly={ro || undefined}>
      <div className={s.tools}>
        <Button size="sm" variant="ghost" icon="search" shortcut="Mod+F" onPress={() => openFind()}>
          {t('editor.find')}
        </Button>
        <Button size="sm" variant="ghost" aria-pressed={tabIndents} shortcut="Ctrl+M" onPress={() => setTabIndents((v) => !v)}>
          {tabIndents ? t('editor.tabIndents') : t('editor.tabMoves')}
        </Button>
        {tools}
        <span className={s.spacer} />
        {ro && <span className={s.status}>{t('editor.readOnly')}</span>}
        <span className={s.status} aria-live="off">
          {t('editor.lineCol', { line: caret.line, col: caret.col })}
        </span>
      </div>
      {findOpen && (
        <div className={s.find} role="search">
          <input
            ref={query}
            className={s.findInput}
            type="search"
            value={q}
            aria-label={t('editor.find')}
            placeholder={t('editor.find')}
            onChange={(e) => {
              setQ(e.target.value);
              setAt(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                go(e.shiftKey ? -1 : 1);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closeFind();
              }
            }}
          />
          <span className={s.count} role="status">
            {q ? (hits.length ? t('editor.matchOf', { i: cur + 1, n: hits.length }) : t('editor.noMatch')) : ''}
          </span>
          <Button size="sm" variant="ghost" aria-pressed={matchCase} aria-label={t('editor.matchCase')} onPress={() => setMatchCase((v) => !v)}>
            {/* "Aa" is the universal match-case glyph, not a translated word. */}
            <span className={s.aa} aria-hidden="true">
              {MATCH_CASE_GLYPH}
            </span>
          </Button>
          <IconButton size="sm" icon="chevron-up" label={t('editor.findPrev')} isDisabled={!hits.length} onPress={() => go(-1)} />
          <IconButton size="sm" icon="chevron-down" label={t('editor.findNext')} isDisabled={!hits.length} onPress={() => go(1)} />
          <IconButton size="sm" icon="x" label={t('editor.closeFind')} onPress={closeFind} />
        </div>
      )}
      <div className={s.body} dir="ltr" style={{ ['--rows' as string]: rows }}>
        <div className={s.gutterClip} aria-hidden="true">
          <div ref={gutter} className={s.gutter}>
            {numbers.map((n) => (
              <div key={n} className={cx(s.num, marked.has(n) && s.marked, n === caret.line && s.current)}>
                {marked.has(n) && <span className={s.mark} />}
                {n}
              </div>
            ))}
          </div>
        </div>
        {lang === undefined ? (
          textarea
        ) : (
          <div className={s.pane}>
            {painted && (
              // What the textarea holds, coloured; the textarea above it keeps the caret, the selection and the name.
              <pre ref={mirror} className={cx(s.text, s.mirror)} aria-hidden="true">
                {tokens.map((t, k) => (
                  <MirrorTok key={k} t={t} />
                ))}
                {/* A trailing newline is a line the textarea shows; the pre needs a character after it to keep it. */}
                {value.endsWith('\n') ? ' ' : ''}
              </pre>
            )}
            {textarea}
          </div>
        )}
      </div>
      {shown.length > 0 && (
        <div className={s.problems}>
          <div className={s.problemsHead}>
            <Icon name="error" size="sm" className={s.problemsIcon} />
            {t('editor.problems', { count: shown.length })}
          </div>
          <ul id={`${id}-problems`} className={s.problemList} aria-label={t('editor.problemsLabel')}>
            {shown.map((p, i) => (
              <li key={i}>
                <button type="button" className={s.problem} disabled={p.line === null} onClick={() => p.line !== null && jumpTo(p.line)}>
                  <span className={s.problemLine}>{p.line !== null ? t('editor.line', { n: p.line }) : t('editor.noLine')}</span>
                  <span className={s.problemMsg}>{p.message}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
});

const MATCH_CASE_GLYPH = 'Aa';
