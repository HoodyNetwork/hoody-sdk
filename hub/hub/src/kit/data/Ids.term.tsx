// Ids, copy fields and code in the terminal. A full id never shows (only its masked form); Copy gives the whole value
// through the terminal's clipboard (OSC 52, the one bounded, sanitised seam: prim/clipboard useClipboard, bound to the
// mount the component rendered under). Code is plain text with token colours from
// highlight.ts and the shell reading (no OpenTUI code renderable: it loads tree-sitter grammars for colour the shared
// readers already give). Code never cuts: long lines wrap, and Copy gives the exact text.
// A `secret` CopyButton (a held key or token beside its SecretField) copies under SecretField's rules: the screen is
// asked at the press (term/app/secret-screen-ctx.ts), only what secretCopyText leaves unchanged is written, and a
// refusal is told under the button in SecretField's words.
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import type * as Web from './Ids';
import { Box, Pressable, Text, useInText, type Colour } from '../../term/prim';
import { cleanText } from '../../term/prim/TableCells';
import { useClipboard } from '../../term/prim';
import { secretCopyText } from '../../term/app/secret-screen';
import { useSecretScreen } from '../../term/app/secret-screen-ctx';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';
import secretWords from '../forms/term.strings.en.json';
import idStrings from './Ids.strings.en.json';
import { ExtLink, holdsId, safeShown, secretShape, webAddress } from '../controls/Link';
import { HL_LANGS, ansiLines, ansiTokens, highlight, highlightLines, stripAnsi, type AnsiToken, type HlKind, type HlLang } from './highlight';
import { SHELL_START, codeLineText, maskId, shellTokens, type CodeLang, type CodePart, type ShellToken } from './Ids.pure';
import { focusInk } from '@term/kit';

export { SHELL_START, codeLineText, maskId, shellTokens };
/** The web's CodeLine is an interface (a code block's line) and a component; the type side, as there. */
export type CodeLine = import('./Ids').CodeLine;
export type { CopyButtonProps, IdChipProps, CopyFieldProps, CodePlaceholder, CodePart, CodeBlockProps, CodeLang, ShellToken, ShellState, CodeLineProps } from './Ids';

/** The web's module-level copy. The terminal has no unbound copy (it would write to whichever terminal is current,
 *  even from a mount that already ended), so this answers false; components use useCopy() here or useBoundCopyText() (kit/data/termCopyText.ts). */
export const copyText: typeof Web.copyText = () => Promise.resolve(false);

export const useCopy: typeof Web.useCopy = () => {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { copy: put } = useClipboard();
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = useCallback((text: string | null) => {
    const ok = text === null ? false : put(text);
    setState(ok ? 'copied' : 'failed');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 1200);
  }, [put]);
  return [state, copy];
};

/** The answer of a copy, on the screen (a terminal has no live region): "Copied" or why it failed. */
export const CopyStatus: typeof Web.CopyStatus = ({ state, done, failed }) => {
  const t = useStrings(kitStrings);
  if (state === 'idle') return <></>;
  return state === 'copied'
    ? <Text colour="ok">✓ {done ?? t('copy.done')}</Text>
    : <Text colour="danger">✗ {failed ?? t('copy.failed')}</Text>;
};

function readValue(getValue: () => string | null): string | null {
  try {
    return getValue();
  } catch {
    return null;
  }
}

/** A copy control: "copy" (or its label), Enter or a click copies; the answer replaces the word for 1.2 s. */
export const CopyButton: typeof Web.CopyButton = ({ text, getValue, label, withLabel, variant, isDisabled, secret }) => {
  const [state, copy] = useCopy();
  const t = useStrings(kitStrings);
  const tt = useStrings(secretWords);
  const ask = useSecretScreen();
  const [refusal, setRefusal] = useState<'copyRefused' | 'copyValueRefused' | null>(null);
  const press = () => {
    if (!secret) { copy(getValue ? readValue(getValue) : (text ?? '')); return; }
    // Asked before the value is read: a refused copy reads nothing. The mount-bound copy (useCopy) writes it.
    if (!ask().copy) { setRefusal('copyRefused'); return; }
    const v = getValue ? readValue(getValue) : null;
    const c = v === null ? null : secretCopyText(v);
    setRefusal(v !== null && c === null ? 'copyValueRefused' : null);
    if (v === null) copy(null);
    else if (c !== null) copy(c);
  };
  const word = withLabel || variant === 'primary' ? label : t('action.copy').toLowerCase();
  return (
    <>
      <Pressable dir="row" shrink={0} disabled={isDisabled === true} onPress={press} sem={{ name: label }}>
        {({ focused }) => (
          <Text colour={isDisabled ? 'faint' : state === 'failed' ? 'danger' : state === 'copied' ? 'ok' : 'blueText'} {...focusInk(focused)}>
            {state === 'copied' ? '✓ copied' : state === 'failed' ? '✗ copy failed' : `⧉ ${word}`}
          </Text>
        )}
      </Pressable>
      {/* The button keeps its word, as SecretField's does; the reason is its own line. */}
      {refusal ? <Text colour="warn">! {tt(`secret.${refusal}`)}</Text> : null}
    </>
  );
};

/** A masked id; focused, Enter or `c` copies the whole id (unless noCopy). */
export const IdChip: typeof Web.IdChip = ({ id, label, noCopy }) => {
  const [state, copy] = useCopy();
  const kt = useStrings(kitStrings);
  const body = (focused: boolean) => (
    <Text>
      {label ? <Text colour="muted">{cleanText(label)} </Text> : null}
      <Text colour="ink" {...focusInk(focused)}>{maskId(cleanText(id))}</Text>
      {noCopy ? null : <Text colour={state === 'failed' ? 'danger' : state === 'copied' ? 'ok' : 'faint'}>{state === 'copied' ? ' ✓ copied' : state === 'failed' ? ' ✗ copy failed' : ' ⧉'}</Text>}
    </Text>
  );
  if (noCopy) return <Box dir="row" shrink={0}>{body(false)}</Box>;
  return (
    <Pressable dir="row" shrink={0} sem={{ name: kt('id.copy') }} onPress={() => copy(id)} onKey={(k) => (k.name === 'c' ? (copy(id), true) : false)}>
      {({ focused }) => body(focused)}
    </Pressable>
  );
};

/** A label, the value (whole: it wraps, never cut) and its copy control. */
export const CopyField: typeof Web.CopyField = ({ label, value, masked, plain, copyName, noCopy, description }) => {
  const t = useStrings(kitStrings);
  // The web's rule (Ids.tsx): a web address is the ExtLink (a link; the masked button when it holds an id, even under
  // `plain`); anything else shows through safeShown (an id-holding text is the mask). Copy still gives it whole.
  const link = webAddress(value) !== '' && (!plain || secretShape(value) || holdsId(value));
  return (
    <Box dir="column" shrink={0} maxWidth="100%">
      {label ? <Text colour="muted">{label}</Text> : null}
      <Box dir="row" gap={2} minWidth={0}>
        {masked ? <Text colour="ink" grow={1} shrink={1}>{cleanText(maskId(value))}</Text>
          : link ? <Box dir="row" grow={1} shrink={1} minWidth={0}><ExtLink url={value} look="nav" /></Box>
          : <Text colour="ink" grow={1} shrink={1}>{cleanText(safeShown(value))}</Text>}
        {noCopy ? null : <CopyButton text={value} label={copyName || t('action.copy')} />}
      </Box>
      {description ? (typeof description === 'string' || typeof description === 'number' ? <Text colour="muted">{String(description)}</Text> : <Box dir="row">{description}</Box>) : null}
    </Box>
  );
};


// ── Code ───────────────────────────────────────────────────────────────────────────────────────────────────────

const isShell = (lang: CodeLang | undefined) => lang === 'shell' || lang === 'bash' || lang === 'sh';
const hlLang = (lang: CodeLang | undefined): HlLang | null => ((HL_LANGS as readonly string[]).includes(lang ?? '') ? (lang as HlLang) : null);

const HL_COLOUR: Partial<Record<HlKind, Colour>> = { kw: 'blueText', str: 'ok', num: 'warn', lit: 'warn', com: 'faint', key: 'blueText', fn: 'ink', meta: 'muted', ins: 'ok', del: 'danger' };
const SH_COLOUR: Partial<Record<ShellToken['kind'], Colour>> = { cmd: 'blueText', flag: 'warn', var: 'ok' };
const ANSI_COLOUR: Record<string, Colour> = { red: 'danger', green: 'ok', yellow: 'warn', blue: 'blueText', magenta: 'acc', cyan: 'blueText', white: 'ink', black: 'muted' };

type Run = { text: string; colour?: Colour; bold?: boolean; hole?: boolean };

const shellRuns = (tokens: readonly ShellToken[]): Run[] => tokens.map((t) => ({ text: t.text, colour: SH_COLOUR[t.kind] }));
const ansiRuns = (tokens: readonly AnsiToken[]): Run[] => tokens.map((t) => ({ text: t.text, colour: t.fg ? ANSI_COLOUR[t.fg] : undefined, bold: Boolean(t.bold) }));

/** One line of a step's parts as runs; a placeholder is a hole run. */
function partRuns(parts: readonly CodePart[], lang: CodeLang): Run[] {
  if (isShell(lang)) {
    let st = SHELL_START;
    return parts.flatMap((p): Run[] => {
      if (typeof p !== 'string') {
        st = { ...st, atCmd: st.assign ? st.atCmd : false, word: true, cont: false, plain: st.plain || (st.cont && !st.quote && !st.comment) };
        return [{ text: p.placeholder, hole: true }];
      }
      const r = shellTokens(p, st);
      st = r.state;
      return shellRuns(r.tokens);
    });
  }
  const hl = hlLang(lang);
  return parts.flatMap((p): Run[] => {
    if (typeof p !== 'string') return [{ text: p.placeholder, hole: true }];
    if (lang === 'ansi') return ansiRuns(ansiTokens(p));
    return hl ? highlight(p, hl).map((t) => ({ text: t.text, colour: HL_COLOUR[t.kind] })) : [{ text: p }];
  });
}

function CodeText({ runs, prompt }: { runs: readonly Run[]; prompt?: boolean }): ReactElement {
  return (
    <Text colour="ink">
      {prompt ? <Text colour="faint">$ </Text> : null}
      {runs.map((r, i) => (r.hole
        ? <Text key={i} colour="warn" underline>‹{cleanText(r.text)}›</Text>
        : <Text key={i} colour={r.colour ?? 'ink'} bold={r.bold}>{cleanText(r.text)}</Text>))}
    </Text>
  );
}

/** A copy control that stays visible and says why it does not copy. */
function CopyRefused({ label, reason }: { label: string; reason: string }) {
  return <Text colour="faint">⧉ {label} ({reason})</Text>;
}

export const CodeBlock: typeof Web.CodeBlock = ({ code, fullText, lines, label, prompt, lang, placeholderReason, footer, noCopy }) => {
  const t = useStrings(kitStrings);
  const ti = useStrings(idStrings);
  if (!lines) {
    const text = lang === 'ansi' ? stripAnsi(code ?? '') : (code ?? '');
    const shown = (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n');
    const hl = hlLang(lang);
    let st = SHELL_START;
    const runs: Run[][] = isShell(lang)
      ? shown.map((line) => {
        const r = shellTokens(line, st);
        st = r.state.lost ? r.state : r.state.quote ? { ...r.state, comment: false, cont: false, plain: false } : r.state.cont ? { ...SHELL_START, atCmd: false, cont: false, plain: true } : SHELL_START;
        return shellRuns(r.tokens);
      })
      : lang === 'ansi'
        ? ansiLines(code ?? '').map(ansiRuns)
        : hl
          ? highlightLines(shown.join('\n'), hl).map((line) => line.map((tk) => ({ text: tk.text, colour: HL_COLOUR[tk.kind] })))
          : shown.map((line) => [{ text: line }]);
    return (
      <Box dir="column" shrink={0} bg="card" padX={1}>
        {noCopy ? null : <Box dir="row" justify="end"><CopyButton text={fullText === undefined ? text : lang === 'ansi' ? stripAnsi(fullText) : fullText} label={t('code.copy')} /></Box>}
        {runs.map((r, i) => <CodeText key={i} runs={r} prompt={prompt} />)}
        {footer ? <Box dir="row">{typeof footer === 'string' ? <Text colour="muted">{footer}</Text> : footer}</Box> : null}
      </Box>
    );
  }
  const reason = placeholderReason ?? ti('code.placeholderReason');
  const texts = lines.map((l) => {
    const x = codeLineText(l);
    return (l.lang ?? lang) === 'ansi' && x !== undefined ? stripAnsi(x) : x;
  });
  const all = texts.every((x) => x !== undefined) ? texts.join('\n') : undefined;
  return (
    <Box dir="column" shrink={0} gap={0}>
      <Box dir="row" gap={2}>
        {label ? <Text colour="muted" bold grow={1}>{label}</Text> : <Box grow={1} />}
        {all !== undefined ? <CopyButton text={all} label={ti('code.copyAll')} withLabel /> : <CopyRefused label={ti('code.copyAll')} reason={reason} />}
      </Box>
      {lines.map((line, i) => {
        const text = texts[i];
        const copyLabel = line.copyLabel ?? (line.caption ? ti('code.copyLine', { caption: line.caption }) : ti('code.copyLinePlain'));
        return (
          <Box key={i} dir="column" shrink={0}>
            {line.caption ? <Text colour="muted">{i + 1}. {line.caption}</Text> : null}
            {/* A refused copy says why in words as wide as a short command: beside a long one the two shared the row
                and the command broke inside its words ("ANTHROPIC_BASE_U" / "RL="). Its row wraps instead: the words go
                under a command that needs the whole row, and stay beside one that fits. */}
            <Box dir="row" gap={2} bg="card" padX={1} wrap={text === undefined}>
              <Box grow={1} shrink={1}><CodeText runs={partRuns(typeof line.code === 'string' ? [line.code] : line.code, line.lang ?? lang)} prompt={prompt} /></Box>
              {text !== undefined ? <CopyButton text={text} label={copyLabel} /> : <CopyRefused label="copy" reason={reason} />}
            </Box>
          </Box>
        );
      })}
      {footer ? <Box dir="row">{typeof footer === 'string' ? <Text colour="muted">{footer}</Text> : footer}</Box> : null}
    </Box>
  );
};

// A block wherever it is used: beside text it takes lines of its own (src/term/jsx/dom.ts isBlockComponent).
(CodeBlock as { hxBlock?: boolean }).hxBlock = true;

/** One typed value inside a sentence: mono-looking text and its copy control. Inside running text (a Text) only the
 *  value can be drawn (no control fits in a line of text), and Copy is then not reachable there. */
export const CodeLine: typeof Web.CodeLine = ({ value, copy, masked, copyLabel }) => {
  const ti = useStrings(idStrings);
  const inText = useInText();
  const shown = cleanText(masked ? maskId(value) : value);
  if (inText) return <Text colour="blueText">{shown}</Text>;
  return (
    <Box dir="row" gap={1} shrink={1}>
      <Text colour="blueText" shrink={1}>{shown}</Text>
      <CopyButton text={copy ?? value} label={copyLabel ?? ti('code.copyLinePlain')} />
    </Box>
  );
};

