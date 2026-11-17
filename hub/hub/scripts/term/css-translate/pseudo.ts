// `content` of a ::before / ::after rule → the text to draw. Decidable: string literals, the
// `<content> / <alt text>` form (the part before the slash is what is drawn), `none` / `normal`. Anything else
// (attr(), counter(), url(), open-quote, var() left unresolved, an image) is undecidable: null, and the rule is dropped.

function unescapeCss(s: string): string {
  return s.replace(/\\([0-9a-fA-F]{1,6})[ \t\n]?|\\(.)/gs, (_m, hex: string | undefined, ch: string | undefined) => {
    if (hex === undefined) return ch ?? '';
    const cp = parseInt(hex, 16);
    return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : '�';
  });
}

const STRING = `(?:"((?:[^"\\\\\\n]|\\\\[\\s\\S])*)"|'((?:[^'\\\\\\n]|\\\\[\\s\\S])*)')\\s*`;
const ONE = new RegExp('^' + STRING);
/** `content: '·' / ''`: alternative text for assistive technology (strings); never drawn. */
const ALT = new RegExp(`^/\\s*(?:${STRING})+$`);

/** Strings to join ([] = an empty box), 'none' (no box), or null (undecidable at build time). */
export function parseContent(value: string): string[] | 'none' | null {
  let v = value.trim();
  if (/^(none|normal)$/i.test(v)) return 'none';
  const parts: string[] = [];
  let seen = 0;
  while (v !== '') {
    const str = ONE.exec(v);
    if (!str) return seen > 0 && ALT.test(v) ? parts : null;
    const text = unescapeCss(str[1] ?? str[2] ?? '');
    if (text !== '') parts.push(text);
    seen++;
    v = v.slice(str[0].length);
  }
  return seen > 0 ? parts : null;
}
