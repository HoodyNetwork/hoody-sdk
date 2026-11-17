// Reply.pure.ts: the reply's pure parts, shared by the web Reply.tsx and the terminal Reply.term.tsx: which links of a reply
// get a mark, which paths are actionable, and the site a finished reply points at (the result row).
import { markOf, MARKS_MAX, type LinkHostValue, type Mark } from './linkHost';
import { parseMd, type Inline, type MdBlock } from './md';
import { PATHS_MAX } from './paths';

/** Every inline node of the blocks, in reading order. */
export function eachInline(blocks: readonly MdBlock[], f: (x: Inline) => void): void {
  const inl = (c: readonly Inline[]): void => {
    for (const x of c) {
      f(x);
      if (x.k === 'b' || x.k === 'i' || x.k === 'a' || x.k === 'blocked') inl(x.c);
    }
  };
  const blk = (b: MdBlock): void => {
    if (b.k === 'p' || b.k === 'h') inl(b.c);
    else if (b.k === 'ul' || b.k === 'ol') b.items.forEach(inl);
    else if (b.k === 'quote') b.c.forEach(blk);
    else if (b.k === 'table') [b.head, ...b.rows].forEach((r) => r.forEach(inl));
  };
  blocks.forEach(blk);
}

export function pathsOf(blocks: readonly MdBlock[]): ReadonlySet<string> {
  const out = new Set<string>();
  eachInline(blocks, (x) => {
    if (x.k === 'path' && out.size < PATHS_MAX) out.add(x.target);
  });
  return out;
}

export function marksOf(blocks: readonly MdBlock[], host: LinkHostValue): ReadonlyMap<Inline, Mark> {
  const out = new Map<Inline, Mark>();
  const seen = new Set<string>();
  const inl = (c: readonly Inline[]): void => {
    for (const x of c) {
      if (x.k === 'b' || x.k === 'i') inl(x.c);
      else if ((x.k === 'a' || x.k === 'code') && x.read && seen.size < MARKS_MAX) {
        const m = markOf(x.read, host);
        if (m && !seen.has(m.key)) {
          seen.add(m.key);
          out.set(x, m);
        }
      }
    }
  };
  const blk = (b: MdBlock): void => {
    if (b.k === 'p' || b.k === 'h') inl(b.c);
    else if (b.k === 'ul' || b.k === 'ol') b.items.forEach(inl);
    else if (b.k === 'quote') b.c.forEach(blk);
    else if (b.k === 'table') [b.head, ...b.rows].forEach((r) => r.forEach(inl));
  };
  blocks.forEach(blk);
  return out;
}

/** The site a finished reply points at (the result row): its last link to a running web port on a computer of yours that opens in a
 *  new tab, read with the same marks the reply draws, or null. Nothing is guessed: a reply without such a link has no site. */
export function siteMark(text: string, host: LinkHostValue | null): Mark | null {
  if (!host) return null;
  let last: Mark | null = null;
  for (const m of marksOf(parseMd(text), host).values()) {
    if (m.kind === 'port' && m.open?.k === 'tab' && m.owner?.k === 'own' && m.owner.state === 'running') last = m;
  }
  return last;
}
