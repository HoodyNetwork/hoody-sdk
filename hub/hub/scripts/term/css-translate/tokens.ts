// tokens.css → one flat map of custom properties for the chosen width class, dark theme.
//
// Applied, in source order: `:root` (light base), `:root[data-hx-theme="dark"]` (the default theme here), and `:root`
// blocks inside @media whose query is true for the width class (e.g. `(width < 600px)` on narrow). Ignored and listed
// in `ignored`: accent sets (data-hx-hl), performance mode (data-hx-perf; it only zeroes shadows and durations, which
// are paint anyway), density (data-density), toolbar scopes (data-tb-size), :lang() overrides, realm colour classes
// (.rc-*, which set --rc on an element), and touch overrides under (pointer: coarse) (false in a terminal).
import postcss from 'postcss';
import { evalMedia, evalSupports, type QueryEnv } from './queries';

export interface TokenSet {
  values: Map<string, string>;
  /** Where each value came from (`:root`, `:root[data-hx-theme="dark"]`, `@media (width < 600px) :root`). */
  from: Map<string, string>;
  ignored: Array<{ selector: string; count: number; why: string }>;
}

/**
 * Tokens whose terminal value is stated here instead of read from tokens.css: a web measure that means a kit role the
 * terminal draws at a fixed size. The value replaces every web value of that token (any width class), and is listed in
 * `from` as `terminal (...)`.
 */
export const TERM_TOKENS: readonly { name: string; term: string; why: string }[] = [
  {
    name: '--pad-page',
    term: '8px',
    why: "the kit's page gutter: one cell, as the kit's terminal page shells (PageFrame, ListDetailPage) draw it; 24px read as 2 cells put a page's own header 2 cells right of the kit toolbar under it",
  },
];

const DARK = /^:root\[data-hx-theme=["']?dark["']?\]$/;

export function loadTokens(css: string, env: QueryEnv): TokenSet {
  const values = new Map<string, string>();
  const from = new Map<string, string>();
  const ignored: TokenSet['ignored'] = [];
  const root = postcss.parse(css);
  root.walkRules((rule) => {
    let query: string | undefined;
    let on = true;
    for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) {
      if (p.type === 'atrule') {
        const a = p as postcss.AtRule;
        if (a.name === 'media') {
          on = on && evalMedia(a.params, env).value;
          query = `@media ${a.params}`;
        } else if (a.name === 'supports') on = on && evalSupports(a.params).value;
      }
    }
    const decls = rule.nodes.filter((n): n is postcss.Declaration => n.type === 'decl' && n.prop.startsWith('--'));
    const sel = rule.selector.trim();
    const base = sel === ':root';
    const dark = DARK.test(sel);
    if (!(base || dark) || !on) {
      if (decls.length > 0) {
        const why = !on
          ? `${query ?? '@supports'} is false for the width class`
          : /data-hx-hl/.test(sel)
            ? 'accent set (data-hx-hl): default yellow kept'
            : /data-hx-perf/.test(sel)
              ? 'performance mode: zeroes shadows/durations (paint only)'
              : /data-density/.test(sel)
                ? 'density variant (data-density=compact)'
                : /data-tb-size/.test(sel)
                  ? 'toolbar size scope'
                  : /:lang/.test(sel)
                    ? 'script-specific caps/tracking'
                    : /^\.rc-/.test(sel)
                      ? 'realm colour class (sets --rc on an element)'
                      : 'not a :root rule';
        ignored.push({ selector: query ? `${query} ${sel}` : sel, count: decls.length, why });
      }
      return;
    }
    for (const d of decls) {
      values.set(d.prop, d.value.trim());
      from.set(d.prop, query ? `${query} ${sel}` : sel);
    }
  });
  for (const t of TERM_TOKENS) {
    if (!values.has(t.name)) continue;
    values.set(t.name, t.term);
    from.set(t.name, `terminal (${t.why})`);
  }
  return { values, from, ignored };
}
