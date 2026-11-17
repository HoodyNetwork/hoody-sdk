// THE tag table of the compat runtime: what every raw HTML tag in shared code becomes in the terminal. dom.ts reads only
// this; tags.term.test.tsx renders every row. A tag not listed is drawn as a block and counted (domLedger().unknownTags).
//
// kind:
//   block    a column Box; runs of text and inline tags inside it become one Text each
//   inline   a Text when everything inside is text or inline tags, else a row Box (one space between its items)
//   para     an inline tag that is a line of its own (p, h1-h6, pre, ...): never merged into a neighbour's text run
//   row      a row Box (tr, menu)
//   cell     a share of its row, cut at its edge (td, th)
//   press    a Pressable (button, summary): Enter / Space / click; shows focus
//   field    a TextInput, check box or radio (input, textarea)
//   select   the chosen option's text; Enter / Space steps to the next option
//   br       a line break inside text
//   rule     hr: a one-row line
//   nothing  draws nothing (media, scripts, svg parts)
import type { TextProps } from '../prim/Text';

export type TagKind = 'block' | 'inline' | 'para' | 'row' | 'cell' | 'press' | 'field' | 'select' | 'br' | 'rule' | 'nothing';
export interface TagRule {
  kind: TagKind;
  text?: Partial<TextProps>;
  /** List item marker source: 'ul' bullet, 'ol' number (only for unstyled lists: no className on the list). */
  list?: 'ul' | 'ol';
  /** Indent of the content in cells (dd, blockquote). */
  indent?: number;
  /** Draw this tag's CSS frame / divider (see BORDER_POLICY). */
  frame?: boolean;
  divider?: boolean;
}

const bold = { bold: true } as const;
export const TAGS: Readonly<Record<string, TagRule>> = {
  // blocks
  div: { kind: 'block' }, section: { kind: 'block' }, article: { kind: 'block' }, aside: { kind: 'block' }, main: { kind: 'block' },
  nav: { kind: 'block' }, header: { kind: 'block', divider: true }, footer: { kind: 'block' }, form: { kind: 'block' }, figure: { kind: 'block' },
  fieldset: { kind: 'block', frame: true }, details: { kind: 'block' }, dialog: { kind: 'block', frame: true }, address: { kind: 'block' },
  hgroup: { kind: 'block' }, search: { kind: 'block' },
  ul: { kind: 'block', list: 'ul' }, ol: { kind: 'block', list: 'ol' }, li: { kind: 'block' }, dl: { kind: 'block' },
  table: { kind: 'block', frame: true }, thead: { kind: 'block', divider: true }, tbody: { kind: 'block' }, tfoot: { kind: 'block' },
  blockquote: { kind: 'para', indent: 2, text: { italic: true } },
  // inline text
  span: { kind: 'inline' }, b: { kind: 'inline', text: bold }, strong: { kind: 'inline', text: bold }, em: { kind: 'inline', text: { italic: true } },
  i: { kind: 'inline', text: { italic: true } }, u: { kind: 'inline', text: { underline: true } }, s: { kind: 'inline', text: { strike: true } },
  del: { kind: 'inline', text: { strike: true } }, ins: { kind: 'inline', text: { underline: true } }, small: { kind: 'inline', text: { dim: true } },
  code: { kind: 'inline' }, kbd: { kind: 'inline', text: { inverse: true } }, samp: { kind: 'inline' }, mark: { kind: 'inline', text: { inverse: true } },
  abbr: { kind: 'inline' }, time: { kind: 'inline' }, label: { kind: 'inline' }, a: { kind: 'inline', text: { underline: true, colour: 'blueText' } },
  q: { kind: 'inline' }, cite: { kind: 'inline', text: { italic: true } }, sub: { kind: 'inline' }, sup: { kind: 'inline' }, var: { kind: 'inline', text: { italic: true } },
  output: { kind: 'inline' }, bdi: { kind: 'inline' }, bdo: { kind: 'inline' }, data: { kind: 'inline' }, dfn: { kind: 'inline', text: { italic: true } },
  option: { kind: 'inline' }, optgroup: { kind: 'inline' },
  // lines of their own
  p: { kind: 'para' }, h1: { kind: 'para', text: { bold: true, underline: true } }, h2: { kind: 'para', text: bold }, h3: { kind: 'para', text: bold },
  h4: { kind: 'para', text: bold }, h5: { kind: 'para', text: bold }, h6: { kind: 'para', text: bold }, pre: { kind: 'para' },
  dt: { kind: 'para', text: bold }, dd: { kind: 'para', indent: 2 }, legend: { kind: 'para', text: bold }, figcaption: { kind: 'para', text: { dim: true } },
  caption: { kind: 'para', text: bold },
  // rows and cells
  tr: { kind: 'row' }, menu: { kind: 'row' }, td: { kind: 'cell' }, th: { kind: 'cell', text: bold, divider: true },
  // controls
  button: { kind: 'press' }, summary: { kind: 'press' }, input: { kind: 'field' }, textarea: { kind: 'field' }, select: { kind: 'select' },
  br: { kind: 'br' }, hr: { kind: 'rule' }, wbr: { kind: 'nothing' },
  // nothing to draw
  svg: { kind: 'nothing' }, img: { kind: 'nothing' }, canvas: { kind: 'nothing' }, iframe: { kind: 'nothing' }, video: { kind: 'nothing' },
  audio: { kind: 'nothing' }, style: { kind: 'nothing' }, script: { kind: 'nothing' }, link: { kind: 'nothing' }, meta: { kind: 'nothing' },
  picture: { kind: 'nothing' }, source: { kind: 'nothing' }, track: { kind: 'nothing' }, object: { kind: 'nothing' }, embed: { kind: 'nothing' },
  template: { kind: 'nothing' }, noscript: { kind: 'nothing' }, path: { kind: 'nothing' }, g: { kind: 'nothing' }, circle: { kind: 'nothing' },
  rect: { kind: 'nothing' }, line: { kind: 'nothing' }, polyline: { kind: 'nothing' }, polygon: { kind: 'nothing' }, ellipse: { kind: 'nothing' },
  defs: { kind: 'nothing' }, use: { kind: 'nothing' }, symbol: { kind: 'nothing' }, title: { kind: 'nothing' }, mask: { kind: 'nothing' },
  clipPath: { kind: 'nothing' }, linearGradient: { kind: 'nothing' }, radialGradient: { kind: 'nothing' }, stop: { kind: 'nothing' },
  foreignObject: { kind: 'nothing' }, text: { kind: 'nothing' }, tspan: { kind: 'nothing' }, colgroup: { kind: 'nothing' }, col: { kind: 'nothing' },
  datalist: { kind: 'nothing' }, area: { kind: 'nothing' }, map: { kind: 'nothing' }, slot: { kind: 'nothing' },
};
export const UNKNOWN_TAG: TagRule = { kind: 'block' };
export const tagRule = (tag: string): TagRule | undefined => TAGS[tag];

/**
 * Borders, decided per element (the CSS still says which sides; this says whether the terminal draws them):
 * - a four-sided frame is drawn only on tags with `frame` (table, fieldset, dialog) or role dialog / alertdialog / group
 *   with a label; card and panel outlines vanish (their padding and the gaps between them still separate them);
 *   a PRESSABLE card keeps its outline (`pressCard`: a button, a pressable role, onClick or tabIndex >= 0, laid out as
 *   a column): the frame is what tells a picker tile from the text around it (Connect tiles);
 * - a one-sided top / bottom rule is drawn only on tags with `divider` (header, thead, th) or role separator; on
 *   repeated rows it would double every list, so it vanishes;
 * - a one-sided left / right rule is drawn (one column; it marks a rail, a quote, a selected row);
 * - anything else vanishes.
 */
export function drawnSides(tag: string, attrs: Readonly<Record<string, string>>, b: { sides: ReadonlyArray<'top' | 'right' | 'bottom' | 'left'>; divider: boolean }, pressCard = false): Array<'top' | 'right' | 'bottom' | 'left'> | null {
  const rule = TAGS[tag];
  const role = attrs.role;
  if (b.sides.length >= 3) return rule?.frame || role === 'dialog' || role === 'alertdialog' || pressCard ? [...b.sides] : null;
  if (b.sides.length === 1) {
    const s = b.sides[0]!;
    if (s === 'left' || s === 'right') return [s];
    return rule?.divider || role === 'separator' ? [s] : null;
  }
  return null;
}

const PRESS_ROLES = new Set(['button', 'link', 'tab', 'option', 'menuitem', 'menuitemradio', 'menuitemcheckbox', 'radio', 'checkbox', 'switch']);
/** Whether a compat element is pressable (tag, role, click handler or tab stop). */
export function isPressable(tag: string, p: Readonly<Record<string, unknown>>): boolean {
  if (tag === 'button') return true;
  if (typeof p.role === 'string' && PRESS_ROLES.has(p.role)) return true;
  if (typeof p.onClick === 'function') return true;
  const ti = p.tabIndex;
  return typeof ti === 'number' ? ti >= 0 : typeof ti === 'string' && ti.trim() !== '' && Number(ti) >= 0;
}
