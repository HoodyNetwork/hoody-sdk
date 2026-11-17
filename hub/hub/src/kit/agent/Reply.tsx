// Reply: the agent's reply as markdown (md.ts nodes drawn as React text, never HTML), the streaming caret, and the
// reply footer (Copy · cost · time). Fenced code goes through the kit CodeBlock, folded after 14 lines. The dock and the
// AI page draw a reply with this one part; engine-free: props only.
import { Fragment, createContext, memo, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { cx } from '../controls/Button';
import { Link, TextButton, holdsId } from '../controls/Link';
import { CodeBlock, CopyButton } from '../data/Ids';
import { formatNumber } from '../format';
import { Tooltip } from '../overlays/Overlays';
import { useStrings } from '../strings';
import { COLLAPSE_LINES, kitLang, langOf, lineCount, peekOf } from './code';
import { LinkMark } from './LinkMark';
import { useLinkHost, type Mark } from './linkHost';
import { marksOf, pathsOf } from './Reply.pure';
import { maskAddress } from '@core';
import { hideSecrets, parseMd, plain, type Inline, type MdBlock } from './md';
export { siteMark } from './Reply.pure';
import { PathMark } from './PathMark';
import strings from './Conversation.strings.en.json';
import s from './Conversation.module.css';

/** The marks of one reply's links, by node: one per target, the first MARKS_MAX targets in reading order. Worked out once per
 *  text and host, before drawing, so a node's mark never depends on how often React draws it. */
const Marks = createContext<ReadonlyMap<Inline, Mark> | null>(null);
/** The targets of one reply's actionable paths: the first PATHS_MAX distinct ones in reading order; any other path is text. */
const Paths = createContext<ReadonlySet<string> | null>(null);

function Inlines({ c }: { c: readonly Inline[] }) {
  const t = useStrings(strings);
  const marks = useContext(Marks);
  const paths = useContext(Paths);
  return (
    <>
      {c.map((x, i) => {
        const m = marks?.get(x);
        if (x.k === 'text') return <Fragment key={i}>{x.s}</Fragment>;
        if (x.k === 'path') {
          if (paths?.has(x.target)) return <PathMark key={i} target={x.target} {...(x.code ? { code: true } : {})} />;
          return x.code ? <code key={i} className={s.icode} translate="no">{x.s}</code> : <Fragment key={i}>{x.s}</Fragment>;
        }
        if (x.k === 'code') {
          const code = <code className={s.icode} translate="no">{x.s}</code>;
          return m ? <LinkMark key={i} mark={m}>{code}</LinkMark> : <Fragment key={i}>{code}</Fragment>;
        }
        if (x.k === 'b') return <strong key={i}><Inlines c={x.c} /></strong>;
        if (x.k === 'i') return <em key={i}><Inlines c={x.c} /></em>;
        if (x.k === 'blocked') return <Fragment key={i}><Inlines c={x.c} /> {t('agent.linkBlocked')}</Fragment>;
        // A bare marked address is replaced by its label; a labelled one keeps the agent's words, as text, and gains the mark after
        // them (the mark opens it). The kit's Link would show a computer's address masked in place of the words. Words that hold
        // an id (the Link's own rule, holdsId) are not shown: the mark stands alone, as for a bare address.
        if (m) return x.bare || holdsId(plain(x.c)) ? <LinkMark key={i} mark={m} /> : <LinkMark key={i} mark={m}><Inlines c={x.c} /></LinkMark>;
        // The tooltip names the host as every shown address is: a computer's ids masked (the kit Link already draws such an
        // address as a masked button; this keeps the tooltip right whatever the Link does).
        const link = (
          <Tooltip content={t('agent.linkTip', { host: maskAddress(x.host) })}>
            <Link href={x.href} target="_blank" rel="noopener noreferrer">
              <Inlines c={x.c} />
            </Link>
          </Tooltip>
        );
        return <Fragment key={i}>{link}</Fragment>;
      })}
    </>
  );
}

/** A fenced block: the kit CodeBlock, coloured for its tag or file name (kitLang), folded to its first lines past 14
 *  (Show all opens it). Every code block an agent surface draws comes through here. */
/** `whole`: never folded (a command shown as written, whose marks a fold could hide below the peek). */
export function FoldedCode({ text, lang, label, path, whole }: { text: string; lang: string; label?: string; path?: string; whole?: boolean }) {
  const t = useStrings(strings);
  const [open, setOpen] = useState(false);
  const lines = lineCount(text);
  const long = !whole && lines > COLLAPSE_LINES;
  const shown = long && !open ? peekOf(text) : text;
  const tag = label ?? langOf(lang).label;
  return (
    <div className={s.codeWrap}>
      {tag && <span className={s.codeLang}>{tag}</span>}
      <CodeBlock
        code={shown}
        // Copy gives the whole block, folded or not (the fold only shortens what shows).
        fullText={text}
        label={tag || t('agent.code')}
        lang={kitLang(lang, path)} // reason: a reply block with no known language shows as text
      />
      {long && (
        <TextButton onPress={() => setOpen((v) => !v)}>
          {open ? t('agent.showLess') : t('agent.codeFolded', { n: lines - lineCount(shown) })}
        </TextButton>
      )}
    </div>
  );
}

const Caret = () => <span className={s.caret} aria-hidden="true" />;
function Block({ b, caret }: { b: MdBlock; caret?: boolean }): ReactNode {
  switch (b.k) {
    case 'p': return <p className={s.p}><Inlines c={b.c} />{caret && <Caret />}</p>;
    // A heading keeps its level: read out as one, drawn larger for the top two levels.
    case 'h': return <p className={cx(s.h, b.level <= 2 ? s.h1 : s.h3)} role="heading" aria-level={b.level}><Inlines c={b.c} /></p>;
    case 'hr': return <hr className={s.hr} />;
    case 'ul': return <ul className={s.list}>{b.items.map((it, i) => <li key={i}><Inlines c={it} /></li>)}</ul>;
    case 'ol': return <ol className={cx(s.list, s.olist)} start={b.start}>{b.items.map((it, i) => <li key={i}><Inlines c={it} /></li>)}</ol>;
    case 'quote': return <blockquote className={s.quote}>{b.c.map((x, i) => <Block key={i} b={x} />)}</blockquote>;
    case 'table':
      return (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr>{b.head.map((c, i) => <th key={i}><Inlines c={c} /></th>)}</tr></thead>
            <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}><Inlines c={c} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    case 'code': return <FoldedCode text={b.s.replace(/\n+$/, '')} lang={b.lang} />;
  }
}

/** Markdown prose. Memoised on the text: while a reply streams only its last block changes. `marks` (a reply's own text only):
 *  under a LinkHost its links get marks, never while it streams; gate cards, file previews and your own messages pass none. The
 *  same reply's paths open their menu, host or not, never while it streams. */
export const Prose = memo(function Prose({ text, caret, marks }: { text: string; caret?: boolean; marks?: boolean }) {
  const host = useLinkHost();
  const blocks = useMemo(() => parseMd(text), [text]);
  const on = !!marks && !caret && host !== null;
  const map = useMemo(() => (on && host ? marksOf(blocks, host) : null), [on, host, blocks]);
  const paths = useMemo(() => (marks && !caret ? pathsOf(blocks) : null), [marks, caret, blocks]);
  // A link on some computer asks the host for the realm's list (read only once a reply needs it). A local address needs it only
  // when the chat runs on a computer (it is read there).
  const wants = !!map && [...map.values()].some((m) => m.kind !== 'hub' && (m.kind !== 'local' || !!host?.runs));
  const want = host?.want;
  useEffect(() => {
    if (wants) want?.();
  }, [wants, want]);
  return (
    <Marks.Provider value={map}>
      <Paths.Provider value={paths}>
        <div className={s.prose}>
          {blocks.map((b, i) => <Block key={i} b={b} caret={caret && i === blocks.length - 1} />)}
          {caret && blocks[blocks.length - 1]?.k !== 'p' && <Caret />}
        </div>
      </Paths.Provider>
    </Marks.Provider>
  );
});

/** One reply: its prose, what the turn made, and the turn's foot. */
export function ReplyBox({ children }: { children: ReactNode }) {
  return <div className={s.reply}>{children}</div>;
}

const noMenuOpen = (_open: boolean): void => undefined;
const FooterMenuOpen = createContext<(open: boolean) => void>(noMenuOpen);
/** For a menu drawn in a reply footer: tell the footer when the menu is open (`data-menu-open` on the foot, a hook for styles and tests;
 *  the foot itself is always shown). */
export const useFooterMenuOpen = (): ((open: boolean) => void) => useContext(FooterMenuOpen);

/** `menu`: the host's own control for this turn (a turn menu), drawn right after Copy in the same footer. */
export function ReplyFooter({ text, cost, at, menu }: { text: string; cost: number | null; at: number | null; menu?: ReactNode }) {
  const t = useStrings(strings);
  const [menuOpen, setMenuOpen] = useState(false);
  // Copy writes what the reply shows: a key the Prose hides is hidden in the copy too.
  const copied = useMemo(() => hideSecrets(text), [text]);
  return (
    <div className={cx(s.replyFoot)} data-menu-open={menuOpen ? 'true' : undefined}>
      {/* The turn's actions at the start, under the text they act on: Copy (a frameless icon) and the host's menu. Quiet: shown
          while the pointer is on the reply or focus is inside it, on the newest turn, while the menu is open, and always on touch
          (Conversation.module.css); their room is always kept, so showing them moves nothing. One flat row: tests find Copy and
          the menu as siblings. */}
      <CopyButton text={copied} label={t('agent.copy')} />
      <FooterMenuOpen.Provider value={setMenuOpen}>{menu}</FooterMenuOpen.Provider>
      {/* The gap pushes cost and time, quiet text, to the end. */}
      <span className={s.replyGap} aria-hidden="true" />
      {cost !== null && cost > 0 && <span className={s.replyMeta}>{t('agent.cost', { n: cost < 0.01 ? cost.toFixed(4) : formatNumber(Math.round(cost * 1000) / 1000) })}</span>}
      {at !== null && <span className={s.replyMeta}>{new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
    </div>
  );
}
