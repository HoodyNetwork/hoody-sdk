// References and copyable text: CopyButton, IdChip (a masked id with copy), CopyField (a value in a field with copy),
// CodeBlock (a command or config to copy) and the inline CodeLine, plus the shell reading that colours a CodeBlock.
// A full 24-hex id never shows on screen, only its masked form; copying still gives the person the whole value.
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Button, IconButton, cx } from '../controls/Button';
import { ExtLink, holdsId, safeShown, secretShape, webAddress } from '../controls/Link';
import { SR_ONLY } from '../controls/SrOnly';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';
import idStrings from './Ids.strings.en.json';
import { SHELL_START, codeLineText, maskId, shellTokens, type CodeLang, type CodePart, type ShellToken } from './Ids.pure';
export { SHELL_START, codeLineText, maskId, shellTokens } from './Ids.pure';
export type { CodeLang, CodePart, CodePlaceholder, ShellState, ShellToken } from './Ids.pure';
import s from './Ids.module.css';
import { HL_LANGS, ansiLines, ansiTokens, highlight, highlightLines, stripAnsi, type AnsiToken, type HlLang, type HlToken } from './highlight';

/** Copy text; resolves true when the clipboard took it. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A copy action with a short-lived "copied" / "failed" state. `null` (nothing to copy) reads as failed. */
export function useCopy(): [state: 'idle' | 'copied' | 'failed', copy: (text: string | null) => void] {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // Only the latest press shows its answer: an earlier, slower clipboard write cannot overwrite it.
  const seq = useRef(0);
  const copy = useCallback((text: string | null) => {
    const mine = ++seq.current;
    void (text === null ? Promise.resolve(false) : copyText(text)).then((ok) => {
      if (mine !== seq.current) return;
      setState(ok ? 'copied' : 'failed');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setState('idle'), 1200);
    });
  }, []);
  return [state, copy];
}

export type CopyButtonProps = {
  label: string;
  withLabel?: boolean;
  /**
   * `primary`: the view's one thing to copy (Referrals' main link) as the kit's primary Button. Its visible text is
   * `label`, always (also its name: label-in-name holds); a copy turns its chip glyph into a check for 1.2 s and the status line says
   * it. No tooltip: the label says it.
   */
  variant?: 'icon' | 'primary';
  /** `sm` (default: the kit's small size, `--ctl-h-sm`; the touch minimum on a coarse pointer) or `md` (the regular
   *  control height). */
  size?: 'sm' | 'md';
  isDisabled?: boolean;
  className?: string;
} & (
  | { /** The text to copy. */ text: string; getValue?: never; secret?: never }
  | {
      /** Read at press time, so a secret never sits in the element tree; `null` = nothing to copy
       *  (shown as a failed copy, never as copied). */
      getValue: () => string | null;
      text?: never;
      /** What `getValue` gives is a secret (a held key or token): the web copies it as any text; the terminal asks
       *  the screen at the press, as SecretField's own Copy does, and says so when it may not copy. */
      secret?: boolean;
    }
);

/** A getValue that throws has nothing to copy: shown as a failed copy. */
function readValue(getValue: () => string | null): string | null {
  try {
    return getValue();
  } catch {
    return null;
  }
}

/**
 * A copy action's spoken answer: "copied" or "failed" once the clipboard has answered, nothing while idle. One
 * polite status line, shared by CopyButton and SecretField so a failed copy is announced the same way everywhere.
 */
export function CopyStatus({ state, done, failed }: { state: 'idle' | 'copied' | 'failed'; done?: string; failed?: string }) {
  const t = useStrings(kitStrings);
  return (
    <span className={SR_ONLY} role="status">
      {state === 'copied' ? (done ?? t('copy.done')) : state === 'failed' ? (failed ?? t('copy.failed')) : ''}
    </span>
  );
}

/** An icon button that copies; the icon turns into a check for 1.2 s (no toast). `variant="primary"`: a labelled primary Button. */
export function CopyButton({ text, getValue, label, withLabel, variant = 'icon', size = 'sm', isDisabled, className }: CopyButtonProps) {
  const [state, copy] = useCopy();
  const press = () => copy(getValue ? readValue(getValue) : (text ?? ''));
  if (variant === 'primary')
    return (
      <>
        <Button variant="primary" className={className} chipIcon={state === 'copied' ? 'check' : undefined} isDisabled={isDisabled} onPress={press}>
          {label}
        </Button>
        <CopyStatus state={state} />
      </>
    );
  // The kit's ghost buttons. The name and the tooltip stay `label`; the check icon and CopyStatus (a polite status
  // line) carry "copied" or "failed".
  const icon = state === 'copied' ? 'check' : 'copy';
  return (
    <>
      {withLabel ? (
        // aria-label equals the shown label: a caller finds its copy by it (keys MintPanels' `c` key).
        <Button variant="ghost" size={size} icon={icon} className={className} isDisabled={isDisabled} onPress={press} aria-label={label}>
          {label}
        </Button>
      ) : (
        <IconButton icon={icon} size={size} label={label} className={className} isDisabled={isDisabled} onPress={press} />
      )}
      <CopyStatus state={state} />
    </>
  );
}

export interface IdChipProps {
  /** The full id; it is shown masked and copied whole. */
  id: string;
  /** A short label before the id ("Box"). */
  label?: string;
  /** No copy button (inside a row that is itself pressable). */
  noCopy?: boolean;
  className?: string;
}

/** A full id as a small inline chip: shown masked (its first 4 and last 4 characters), copied whole. Use CopyField
 * instead when a value that is not an id shows in a field-sized box, CodeLine for one typed value inside a sentence,
 * CodeBlock for a command or config on its own lines. */
export function IdChip({ id, label, noCopy, className }: IdChipProps) {
  const t = useStrings(kitStrings);
  return (
    <span className={cx(s.chip, className)}>
      {label && <span className={s.chipLabel}>{label}</span>}
      <span className={s.chipId} translate="no">
        {maskId(id)}
      </span>
      {!noCopy && <CopyButton text={id} label={t('id.copy')} className={s.chipCopy} />}
    </span>
  );
}

export interface CopyFieldProps {
  label?: string;
  /** The value to show and copy. Never pass a secret here: use SecretField. */
  value: string;
  /** Show it masked like an id. */
  masked?: boolean;
  /**
   * Show a web address as plain text, not a link: an address to copy that is not a page (an API base), or a row whose own
   * Open button is its one link. A secret address keeps its masked button: plain never shows one.
   */
  plain?: boolean;
  /**
   * The Copy button's name (from strings, e.g. "Copy the sign-up link"): it tells apart several fields in one list, where
   * each button would otherwise be named only "Copy". It is also the button's tooltip.
   */
  copyName?: string;
  /** No Copy inside the box: the page puts the field's one copy action beside it (a primary CopyButton). */
  noCopy?: boolean;
  description?: ReactNode;
  className?: string;
}

/** One labelled value to copy (an address, a link, a code) in a field-sized box, on one line with its Copy button.
 * Use IdChip instead for an id inline in a row, CodeBlock when the value is a command or config with lines,
 * SecretField when it is a secret. */
export function CopyField({ label, value, masked, plain, copyName, noCopy, description, className }: CopyFieldProps) {
  const t = useStrings(kitStrings);
  // A secret address is the masked ExtLink button even under plain (secretShape: an id in the written authority,
  // userinfo included, or the parsed host; holdsId: a 24-hex run anywhere in the text, as written or decoded, read past
  // invisible characters). Any other value shows through safeShown: one that holds an id, as an address the parser
  // refuses or as plain text, shows as the mask, whole; copying still gives it whole.
  const link = webAddress(value) !== '' && (!plain || secretShape(value) || holdsId(value));
  return (
    <div className={cx(s.field, className)}>
      {label && <span className={s.fieldLabel}>{label}</span>}
      <div className={s.fieldBox}>
        <span className={s.fieldValue} translate="no">
          {masked ? maskId(value) : link ? <ExtLink url={value} look="nav" /> : safeShown(value)}
        </span>
        {!noCopy && <CopyButton text={value} label={copyName || t('action.copy')} />}
      </div>
      {description && <span className={s.fieldDesc}>{description}</span>}
    </div>
  );
}

/**
 * A CodeBlock line (the TYPE): one step's caption, text or placeholder parts, and what its Copy gives. Not the inline
 * component of the same name: `<CodeLine value=… />` (the VALUE, below CodeBlock) is one typed command inside a sentence.
 * The two share the name on purpose: types read this one, JSX reads the component.
 */
export interface CodeLine {
  /** A short plain-words step name above the line ("Install", "Sign in"). */
  caption?: string;
  /** The line: plain text, or text with placeholder tokens where a fact is missing. */
  code: string | readonly CodePart[];
  /**
   * What Copy and Copy all give when it differs from what is shown (the line shows a masked id,
   * Copy gives the full command). Ignored while the line holds a placeholder.
   */
  copy?: string;
  /**
   * The line's Copy button name when "Copy {caption}" would not read well, such as a caption that is itself an
   * instruction ("Copy the public key" would give "Copy Copy the public key").
   */
  copyLabel?: string;
  /**
   * This line's language when it differs from the block's: an install command above a TypeScript sample. Means what the
   * block's `lang` means, 'ansi' removing escapes from what shows and copies. Never 'plain': a plain line sits in a block
   * that says so, with its // reason (conformance.std std-codelang reads the block's prop).
   */
  lang?: Exclude<CodeLang, 'plain'>;
}

export interface CodeBlockProps {
  /** One command or config (copied whole). Use `lines` for a list of steps. */
  code?: string;
  /**
   * With `code`: the whole text when `code` shows only a part of it (a folded preview). Copy gives this whole text, never
   * the part shown ('ansi' copies it without escapes, as `code`).
   */
  fullText?: string;
  /** Steps: each line has its own caption and Copy; the header has Copy all. */
  lines?: readonly CodeLine[];
  /** Accessible name ("Install command"); also shown in the header of a `lines` block. */
  label?: string;
  /**
   * Long lines: wrap them, breaking anywhere, or keep each on one line in a scroll region
   * (focusable, with a visible bar). Default: a single block scrolls, `lines` steps wrap. Copy
   * always gives the exact text.
   */
  wrap?: boolean;
  /** A `$ ` prompt before each line (shell commands); not copied. */
  prompt?: boolean;
  /**
   * 'shell' (or 'bash', 'sh') colours commands, flags and variables (sh and PowerShell); json, js, ts, yaml, http,
   * python and diff colour keywords, strings, numbers, keys, comments and diff lines (highlight.ts). Colour only: the
   * text, its reading order and Copy are the same. 'ansi' is terminal output: its SGR colours and bold show, every
   * escape and control character is removed, and Copy gives the text as shown. Required: 'plain' (no colour) is a
   * choice the caller states, with a // reason: comment (conformance.std std-codelang).
   */
  lang: CodeLang;
  /** Why Copy is off on a line holding a placeholder ("Pick a computer first"). */
  placeholderReason?: string;
  /** A line under the block: a link to the full reference, or the one fix for the placeholders. */
  footer?: ReactNode;
  /**
   * A single block at most this tall, scrolling inside a focusable region named by `label`. `md` reads
   * `--viewer-h-md` (kit/tokens.css), the MarkdownViewer's md height. Default: as tall as its text.
   */
  maxHeight?: 'md';
  /**
   * No Copy button of its own: for a block that shows a reformatted text (SecretField `json`), where the owner's Copy
   * gives the exact stored text and this block's Copy would give the reformatted one.
   */
  noCopy?: boolean;
  className?: string;
}

const isShell = (lang: CodeLang | undefined) => lang === 'shell' || lang === 'bash' || lang === 'sh';
const hlLang = (lang: CodeLang | undefined): HlLang | null => ((HL_LANGS as readonly string[]).includes(lang ?? '') ? (lang as HlLang) : null);

// Only these get a colour, each a full-strength one. Strings, comments and operators stay plain text: a light reading
// can misjudge where a string or comment ends (a heredoc, a substitution, a quote split across lines) or where a word
// ends (`"python"2>&1` runs python2), and a dimmed or string/comment colour would hide part of a command from the
// person copying it. A misjudged colour here can only make text look like a command, flag or variable.
const SH_COLOURED = new Set<ShellToken['kind']>(['cmd', 'flag', 'var']);

/** One piece of a coloured shell line. */
function Tok({ t }: { t: ShellToken }) {
  return SH_COLOURED.has(t.kind) ? <span className={s[`sh_${t.kind}`]}>{t.text}</span> : <>{t.text}</>;
}

/** A shell line's parts with colour; a placeholder stays a token and counts as a word (or as part of a value). */
function shellParts(parts: readonly CodePart[]): ReactNode[] {
  let st = SHELL_START;
  return parts.map((p, j) => {
    if (typeof p !== 'string') {
      // A word (or part of a value); an open quote, comment or plain stretch goes on past it. A `\` before it
      // escaped its first character: the rest of the line is not sure any more.
      st = { ...st, atCmd: st.assign ? st.atCmd : false, word: true, cont: false, plain: st.plain || (st.cont && !st.quote && !st.comment) };
      return <Placeholder key={j} name={p.placeholder} />;
    }
    const r = shellTokens(p, st);
    st = r.state;
    return r.tokens.map((t, k) => <Tok key={`${j}.${k}`} t={t} />);
  });
}

/** One piece of a coloured line in another language: React text in a span, never markup. */
function HlTok({ t }: { t: HlToken }) {
  return t.kind === 'text' || t.kind === 'punct' ? <>{t.text}</> : <span className={s[`hl_${t.kind}`]}>{t.text}</span>;
}

/** One piece of terminal output: React text in a span, never markup. */
function AnsiTok({ t }: { t: AnsiToken }) {
  if (!t.fg && !t.bold) return <>{t.text}</>;
  return <span className={cx(t.fg && s[`ansi_${t.fg}`], t.bold && s.ansi_bold)}>{t.text}</span>;
}

/** A step line's parts with colour. The text is read as one, as Copy reads it, with one mark standing where each
 *  placeholder goes, then cut at those places: a placeholder inside a string has the string's colour on both sides. The
 *  mark is no letter or digit, so it joins nothing around it into a keyword or a number. */
function hlParts(parts: readonly CodePart[], lang: HlLang): ReactNode[] {
  const holes: { at: number; name: string }[] = [];
  let read = '';
  for (const p of parts) {
    if (typeof p === 'string') read += p;
    else {
      holes.push({ at: read.length, name: p.placeholder });
      read += '\u00b7';
    }
  }
  const out: ReactNode[] = [];
  let at = 0;
  let h = 0;
  highlight(read, lang).forEach((t, i) => {
    let from = 0;
    for (let hole = holes[h]; hole && hole.at < at + t.text.length; hole = holes[h]) {
      const cut = hole.at - at;
      if (cut > from) out.push(<HlTok key={`${i}.${from}`} t={{ kind: t.kind, text: t.text.slice(from, cut) }} />);
      out.push(<Placeholder key={`p${h}`} name={hole.name} />);
      from = cut + 1;
      h++;
    }
    if (from < t.text.length) out.push(<HlTok key={`${i}.${from}`} t={{ kind: t.kind, text: t.text.slice(from) }} />);
    at += t.text.length;
  });
  return out;
}

/** Lines of a shell script with colour: an open quote goes on into the next line; a line ending in a continuing `\`
 *  goes on as plain text (where the command stands is not sure); any other line starts a new command. */
function shellLines(lines: readonly string[]): ReactNode[][] {
  let st = SHELL_START;
  return lines.map((line) => {
    const r = shellTokens(line, st);
    st = r.state.lost ? r.state : r.state.quote ? { ...r.state, comment: false, cont: false, plain: false } : r.state.cont ? { ...SHELL_START, atCmd: false, cont: false, plain: true } : SHELL_START;
    return r.tokens.map((t, k) => <Tok key={k} t={t} />);
  });
}

function partsOf(line: CodeLine): readonly CodePart[] {
  return typeof line.code === 'string' ? [line.code] : line.code;
}

/** A step line's parts as terminal output. Consecutive text parts are read as one text, as Copy reads them, so a
 *  sequence split across parts is never shown in part; a placeholder stays a token. */
function ansiParts(parts: readonly CodePart[]): ReactNode[] {
  const runs: CodePart[] = [];
  for (const p of parts) {
    const last = runs[runs.length - 1];
    if (typeof p === 'string' && typeof last === 'string') runs[runs.length - 1] = last + p;
    else runs.push(p);
  }
  return runs.map((p, j) => (typeof p === 'string' ? ansiTokens(p).map((t, k) => <AnsiTok key={`${j}.${k}`} t={t} />) : <Placeholder key={j} name={p.placeholder} />));
}

function Placeholder({ name }: { name: string }) {
  const t = useStrings(idStrings);
  return (
    <span className={s.placeholder} role="img" aria-label={t('code.placeholder', { name })}>
      {name}
    </span>
  );
}

/** A copy button that stays visible but refuses (soft-disabled: focusable, aria-disabled), with its reason as its description and in its tooltip. */
function CopyRefused({ label, reason, withLabel, className }: { label: string; reason: string; withLabel?: boolean; className?: string }) {
  return withLabel ? (
    <Button variant="ghost" size="sm" icon="copy" className={className} isDisabled disabledReason={reason} aria-label={label}>
      {label}
    </Button>
  ) : (
    <IconButton icon="copy" size="sm" label={label} className={className} isDisabled disabledReason={reason} />
  );
}

/** A command, config or output on its own lines in a box, with Copy; `lines` makes it captioned steps, each with its
 * own Copy, under a Copy all. Use CodeLine instead for one short typed value inside a sentence or a StepList row,
 * CopyField for a single labelled value that is not code, IdChip for an id. */
export function CodeBlock({ code, fullText, lines, label, wrap, prompt, lang, placeholderReason, footer, maxHeight, noCopy, className }: CodeBlockProps) {
  const t = useStrings(kitStrings);
  const ti = useStrings(idStrings);
  if (!lines) {
    // Terminal output is copied and shown as a person sees it: no escape or control character.
    const text = lang === 'ansi' ? stripAnsi(code ?? '') : (code ?? '');
    // One trailing newline ends the last line; it is not an empty line of its own (Copy keeps it).
    const shown = (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n');
    const hl = hlLang(lang);
    const coloured = isShell(lang)
      ? shellLines(shown)
      : lang === 'ansi'
        ? ansiLines(code ?? '').map((line) => line.map((t, k) => <AnsiTok key={k} t={t} />))
        : hl
        ? highlightLines(shown.join('\n'), hl).map((line) => line.map((t, k) => <HlTok key={k} t={t} />))
        : null;
    return (
      <figure className={cx(s.code, !noCopy && s.withCopy, className)} aria-label={label}>
        <pre
          className={cx(s.pre, wrap && s.wrap, maxHeight === 'md' && s.maxMd)}
          translate="no"
          {...(wrap && !maxHeight ? {} : { tabIndex: 0, role: 'region', 'aria-label': label ?? ti('code.region') })}
        >
          {shown.map((line, i) => (
            <span key={i} className={cx(s.line, prompt && s.prompt)}>
              {coloured ? coloured[i] : line}
              {i < shown.length - 1 && '\n'}
            </span>
          ))}
        </pre>
        {!noCopy && <CopyButton text={fullText === undefined ? text : lang === 'ansi' ? stripAnsi(fullText) : fullText} label={t('code.copy')} className={s.codeCopy} />}
        {footer && <figcaption className={s.codeFooter}>{footer}</figcaption>}
      </figure>
    );
  }
  const reason = placeholderReason ?? ti('code.placeholderReason');
  const wrapSteps = wrap ?? true;
  const texts = lines.map((l) => {
    const x = codeLineText(l);
    return (l.lang ?? lang) === 'ansi' && x !== undefined ? stripAnsi(x) : x;
  });
  const all = texts.every((x) => x !== undefined) ? texts.join('\n') : undefined;
  return (
    <figure className={cx(s.code, s.steps, className)} aria-label={label}>
      <div className={s.stepsHead}>
        {label && <span className={s.stepsTitle}>{label}</span>}
        {all !== undefined ? (
          <CopyButton text={all} label={ti('code.copyAll')} withLabel className={s.copyAll} />
        ) : (
          <CopyRefused label={ti('code.copyAll')} reason={reason} withLabel className={s.copyAll} />
        )}
      </div>
      <ol className={s.stepList}>
        {lines.map((line, i) => {
          const text = texts[i];
          const own = line.lang ?? lang;
          const hl = hlLang(own);
          const copyLabel = line.copyLabel ?? (line.caption ? ti('code.copyLine', { caption: line.caption }) : ti('code.copyLinePlain'));
          return (
            <li key={i} className={s.step}>
              {line.caption && <span className={s.caption}>{line.caption}</span>}
              <div className={s.stepLine}>
                <code
                  className={cx(s.stepCode, wrapSteps && s.wrap, prompt && s.prompt)}
                  translate="no"
                  {...(wrapSteps ? {} : { tabIndex: 0, role: 'region', 'aria-label': line.caption ?? label ?? ti('code.region') })}
                >
                  {isShell(own) ? shellParts(partsOf(line)) : own === 'ansi' ? ansiParts(partsOf(line)) : hl ? hlParts(partsOf(line), hl) : partsOf(line).map((p, j) => (typeof p === 'string' ? p : <Placeholder key={j} name={p.placeholder} />))}
                </code>
                {text !== undefined ? (
                  <CopyButton text={text} label={copyLabel} className={cx(s.copyCell, s.lineCopy)} />
                ) : (
                  <CopyRefused label={copyLabel} reason={reason} className={cx(s.copyCell, s.lineCopy)} />
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {footer && <figcaption className={s.codeFooter}>{footer}</figcaption>}
    </figure>
  );
}

export interface CodeLineProps {
  /** What the person types or pastes ("/setprivacy", a bot's @name, a CNAME, a path), shown in mono. */
  value: string;
  /** What Copy gives when it differs from what shows (the whole command behind a short form). */
  copy?: string;
  /** Show it as a masked id (its first 4 and last 4 characters); Copy still gives it whole. */
  masked?: boolean;
  /** The Copy button's name when "Copy this line" would not say which ("Copy the CNAME"). */
  copyLabel?: string;
  className?: string;
}

/**
 * CodeLine (the inline COMPONENT): one typed or pasted value inside a sentence or a StepList row.
 * CodeBlock's line look at the icon hit height, with its copy cell; a value too long for the room ends in an ellipsis
 * and shows whole in its title. A masked id stays masked on screen and copies whole. On a coarse pointer the copy cell
 * is a `--touch-min` target. Not the `CodeLine` type above (a CodeBlock line record), which shares the name. Use
 * CodeBlock instead when the code has several lines or needs a caption, IdChip when the value is only an id.
 */
export function CodeLine({ value, copy, masked, copyLabel, className }: CodeLineProps) {
  const ti = useStrings(idStrings);
  const shown = masked ? maskId(value) : value;
  return (
    <span className={cx(s.codeInline, className)}>
      <code className={s.codeInlineText} translate="no" title={shown}>
        {shown}
      </code>
      <CopyButton text={copy ?? value} label={copyLabel ?? ti('code.copyLinePlain')} className={cx(s.copyCell, s.codeInlineCopy)} />
    </span>
  );
}
