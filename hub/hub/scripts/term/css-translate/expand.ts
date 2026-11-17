// Shorthand → longhand expansion (physical, left-to-right writing mode). Box-model shorthands are expanded on the
// var-resolved value (a var may hold several parts); colour-bearing ones (border, background, font, text-decoration)
// on the raw value, so colour tokens keep their names.
import { commaParts, topParts } from './values';

export type Pair = [prop: string, value: string];

const SIDES = ['top', 'right', 'bottom', 'left'] as const;

function box4(parts: string[]): [string, string, string, string] | undefined {
  const [a, b = a, c = a, d = b] = parts;
  if (a === undefined || parts.length > 4) return undefined;
  return [a, b!, c!, d!];
}

/** inline = left/right, block = top/bottom; start first. */
function logical2(prefix: string, suffix: string, axis: 'inline' | 'block', parts: string[]): Pair[] | undefined {
  const [s, e = s] = parts;
  if (s === undefined || parts.length > 2) return undefined;
  const [p1, p2] = axis === 'inline' ? ['left', 'right'] : ['top', 'bottom'];
  return [
    [`${prefix}${p1}${suffix}`, s],
    [`${prefix}${p2}${suffix}`, e!],
  ];
}

const LOGICAL_SIDE: Record<string, string> = {
  'inline-start': 'left',
  'inline-end': 'right',
  'block-start': 'top',
  'block-end': 'bottom',
};

/** Logical property names that are a straight rename. */
export function physicalName(prop: string): string {
  const p = prop.toLowerCase();
  const sizes: Record<string, string> = {
    'inline-size': 'width',
    'block-size': 'height',
    'min-inline-size': 'min-width',
    'min-block-size': 'min-height',
    'max-inline-size': 'max-width',
    'max-block-size': 'max-height',
    'overflow-inline': 'overflow-x',
    'overflow-block': 'overflow-y',
    'grid-gap': 'gap',
    'grid-row-gap': 'row-gap',
    'grid-column-gap': 'column-gap',
    'background-color': 'background-color',
    '-webkit-line-clamp': 'line-clamp',
    'text-wrap-mode': 'white-space',
  };
  if (sizes[p]) return sizes[p]!;
  let m = /^(padding|margin|scroll-margin|scroll-padding)-(inline-start|inline-end|block-start|block-end)$/.exec(p);
  if (m) return `${m[1]}-${LOGICAL_SIDE[m[2]!]}`;
  m = /^inset-(inline-start|inline-end|block-start|block-end)$/.exec(p);
  if (m) return LOGICAL_SIDE[m[1]!]!;
  m = /^border-(inline-start|inline-end|block-start|block-end)(-width|-style|-color)?$/.exec(p);
  if (m) return `border-${LOGICAL_SIDE[m[1]!]}${m[2] ?? ''}`;
  m = /^border-(start-start|start-end|end-start|end-end)-radius$/.exec(p);
  if (m) return 'border-radius';
  return p;
}

const BORDER_STYLES = new Set(['none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset']);

/** `1px solid var(--x)` → width/style/color for each listed side. Each part is classified by its resolved form; a
 *  colour part keeps its raw text (the token name). A single var holding the whole shorthand is resolved first. */
function borderSide(sides: readonly string[], value: string, res: (s: string) => string): Pair[] {
  let parts = topParts(value);
  if (parts.length === 1 && /^var\(/.test(parts[0]!) && topParts(res(parts[0]!)).length > 1) parts = topParts(res(parts[0]!));
  let width = 'medium';
  let style = 'none';
  let color = 'currentcolor';
  for (const p of parts) {
    const lp = res(p).trim().toLowerCase();
    if (BORDER_STYLES.has(lp)) style = lp;
    else if (/^(thin|medium|thick)$/.test(lp) || /^-?[\d.]/.test(lp) || /^(calc|min|max|clamp)\(/.test(lp)) width = p;
    else color = p;
  }
  if (parts.length === 1 && (parts[0] === '0' || parts[0]!.toLowerCase() === 'none')) {
    width = '0';
    style = 'none';
  }
  const out: Pair[] = [];
  for (const s of sides) out.push([`border-${s}-width`, width], [`border-${s}-style`, style], [`border-${s}-color`, color]);
  return out;
}

/** Expand one declaration. `res` resolves var() (box-model shorthands are expanded on the resolved value). */
export function expand(propIn: string, raw: string, res: (s: string) => string): Pair[] {
  const prop = physicalName(propIn);
  const resolved = res(raw);
  const parts = (): string[] => topParts(resolved);
  switch (prop) {
    case 'padding':
    case 'margin':
    case 'scroll-margin':
    case 'scroll-padding': {
      const b = box4(parts());
      return b ? SIDES.map((s, i) => [`${prop}-${s}`, b[i]!] as Pair) : [[prop, resolved]];
    }
    case 'padding-inline':
    case 'margin-inline':
      return logical2(`${prop.split('-')[0]}-`, '', 'inline', parts()) ?? [[prop, resolved]];
    case 'padding-block':
    case 'margin-block':
      return logical2(`${prop.split('-')[0]}-`, '', 'block', parts()) ?? [[prop, resolved]];
    case 'inset': {
      const b = box4(parts());
      return b ? SIDES.map((s, i) => [s, b[i]!] as Pair) : [[prop, resolved]];
    }
    case 'inset-inline':
      return logical2('', '', 'inline', parts()) ?? [[prop, resolved]];
    case 'inset-block':
      return logical2('', '', 'block', parts()) ?? [[prop, resolved]];
    case 'gap': {
      const p = parts();
      return [
        ['row-gap', p[0] ?? resolved],
        ['column-gap', p[1] ?? p[0] ?? resolved],
      ];
    }
    case 'flex': {
      const p = parts().map((x) => x.toLowerCase());
      if (p.length === 1 && p[0] === 'none')
        return [
          ['flex-grow', '0'],
          ['flex-shrink', '0'],
          ['flex-basis', 'auto'],
        ];
      if (p.length === 1 && p[0] === 'auto')
        return [
          ['flex-grow', '1'],
          ['flex-shrink', '1'],
          ['flex-basis', 'auto'],
        ];
      if (p.length === 1 && (p[0] === 'initial' || p[0] === '0 1 auto'))
        return [
          ['flex-grow', '0'],
          ['flex-shrink', '1'],
          ['flex-basis', 'auto'],
        ];
      const nums = p.filter((x) => /^[\d.]+$/.test(x));
      const basis = p.find((x) => !/^[\d.]+$/.test(x));
      if (p.length === 1 && nums.length === 1)
        return [
          ['flex-grow', nums[0]!],
          ['flex-shrink', '1'],
          ['flex-basis', '0'],
        ];
      if (p.length === 1 && basis)
        return [
          ['flex-grow', '1'],
          ['flex-shrink', '1'],
          ['flex-basis', basis],
        ];
      return [
        ['flex-grow', nums[0] ?? '1'],
        ['flex-shrink', nums[1] ?? '1'],
        ['flex-basis', basis ?? '0'],
      ];
    }
    case 'flex-flow': {
      const out: Pair[] = [];
      for (const x of parts()) {
        if (/^(row|column|row-reverse|column-reverse)$/.test(x)) out.push(['flex-direction', x]);
        else out.push(['flex-wrap', x]);
      }
      return out;
    }
    case 'place-items': {
      const p = parts();
      return [
        ['align-items', p[0] ?? resolved],
        ['justify-items', p[1] ?? p[0] ?? resolved],
      ];
    }
    case 'place-content': {
      const p = parts();
      return [
        ['align-content', p[0] ?? resolved],
        ['justify-content', p[1] ?? p[0] ?? resolved],
      ];
    }
    case 'place-self': {
      const p = parts();
      return [
        ['align-self', p[0] ?? resolved],
        ['justify-self', p[1] ?? p[0] ?? resolved],
      ];
    }
    case 'overflow': {
      const p = parts();
      return [
        ['overflow-x', p[0] ?? resolved],
        ['overflow-y', p[1] ?? p[0] ?? resolved],
      ];
    }
    case 'border':
      return borderSide(SIDES, raw, res);
    case 'border-top':
    case 'border-right':
    case 'border-bottom':
    case 'border-left':
      return borderSide([prop.slice(7)], raw, res);
    case 'border-inline':
      return borderSide(['left', 'right'], raw, res);
    case 'border-block':
      return borderSide(['top', 'bottom'], raw, res);
    case 'border-width':
    case 'border-style':
    case 'border-color': {
      const kind = prop.slice(7);
      const b = box4(kind === 'color' ? topParts(raw) : parts());
      return b ? SIDES.map((s, i) => [`border-${s}-${kind}`, b[i]!] as Pair) : [[prop, raw]];
    }
    case 'border-inline-width':
    case 'border-inline-style':
    case 'border-inline-color':
    case 'border-block-width':
    case 'border-block-style':
    case 'border-block-color': {
      const [, axis, kind] = /^border-(inline|block)-(width|style|color)$/.exec(prop)!;
      return logical2('border-', `-${kind}`, axis as 'inline' | 'block', kind === 'color' ? topParts(raw) : parts()) ?? [[prop, raw]];
    }
    case 'background': {
      // One layer of a plain colour (or none) → background-color; anything else is an image layer (paint).
      const layers = commaParts(raw);
      if (layers.length === 1) {
        const p = topParts(raw);
        if (p.length === 1 && !/^(url|linear-gradient|radial-gradient|conic-gradient|repeating-|image-set)\(/i.test(p[0]!))
          return [['background-color', p[0]!]];
      }
      return [['background-image', raw]];
    }
    case 'font':
      return [['font', raw]];
    case 'text-decoration': {
      const p = topParts(raw);
      const line = p.filter((x) => /^(none|underline|overline|line-through|blink)$/i.test(x));
      const rest = p.filter((x) => !line.includes(x));
      const out: Pair[] = [['text-decoration-line', line.length > 0 ? line.join(' ') : 'none']];
      if (rest.length > 0) out.push(['text-decoration-style', rest.join(' ')]);
      return out;
    }
    case 'list-style':
    case 'outline':
    case 'transition':
    case 'animation':
    case 'mask':
    case 'columns':
    case 'container':
      return [[prop, raw]];
    default:
      return [[prop, prop.startsWith('border-') || prop === 'color' || prop.includes('color') ? raw : resolved]];
  }
}
