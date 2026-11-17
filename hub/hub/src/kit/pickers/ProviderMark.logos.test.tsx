// Provider logos (the providers' own marks as SVG): every catalogue provider is accounted for, either
// with its mark (providerLogos.ts) or on MONOGRAM below, so a new provider never gets nothing by accident; each mark is
// drawn as decoration in one colour; Hoody AI keeps the Hoody icon and never another provider's mark.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon } from '../icons';
import { catalogue7k, type FixtureProvider } from './fixtures/catalogue7k';
import { ProviderMark } from './ProviderMark';
import m from './ProviderMark.module.css';
import { providerLogo, providerLogoIds } from './providerLogos';

/** Catalogue providers drawn with their Monogram: no official mark could be had, its owner's terms for the mark are not
 * recorded (MiniMax: Simple Icons lists its mark under MiniMax's own licence), or the name shown is not the mark's brand. */
const MONOGRAM: readonly string[] = [
  'abacus', 'abliteration-ai', 'above', 'agentrouter', 'ai-router', 'aiand', 'ainetcafe', 'aixy', 'aki-io', 'ambient',
  'amd', 'anyapi', 'auriko', 'bailing', 'bee', 'berget', 'blueclaw', 'bothub', 'claudinio', 'cloudferro-sherlock',
  'coralbricks', 'cortecs', 'crof', 'crossmodel', 'daoxe', 'dinference', 'drun', 'ebcloud', 'echo', 'edenai', 'engy',
  'evroc', 'fastrouter', 'freemodel', 'frogbot', 'helicone', 'hpc-ai', 'hyper', 'iflowcn', 'impossibl', 'inco',
  'infer', 'inferx', 'iteracompute', 'jalapeno', 'jiekou', 'kenari', 'klokintegration', 'kosmik',
  'kuae-cloud-coding-plan', 'lilac', 'llama', 'llmtech', 'llmtr', 'lucidquery', 'meganova', 'melious', 'minimax',
  'minimax-cn', 'minimax-cn-coding-plan', 'minimax-coding-plan', 'mixlayer', 'moark', 'model-oracle-ai', 'modelis',
  'nan', 'nano-gpt', 'nearai', 'neosmith', 'neuralwatt', 'oci', 'ofox', 'openreason', 'opper', 'orcarouter', 'pareto',
  'pendra', 'pioneer', 'poolside', 'qihang-ai', 'regolo-ai', 'requesty', 'routing-run', 'runinfra', 'sarvam',
  'scnet-token-plan', 'scx-ai', 'stackit', 'standardcompute', 'subconscious', 'synthetic', 'tempr', 'tensorx',
  'the-grid-ai', 'thinkingmachines', 'tinfoil', 'tokengo', 'tokenrouter', 'trustedrouter', 'umans-ai',
  'umans-ai-coding-plan', 'unorouter', 'vancine', 'vispark', 'vivgrid', 'wallaby', 'wandb', 'xpersona', 'zeldoc',
  'zenifra',
];
/** Built-in providers of the current agent that the catalogue fixture does not list yet. */
const AGENT_ONLY: readonly string[] = ['aimlapi', 'commandcode', 'reflection', 'sambanova', 'typesafe'];

const catalogue = (catalogue7k('freeOnly').providers as { status: 200; body: { providers: FixtureProvider[] } }).body.providers;
const ids = catalogue.map((p) => p.id);
const nameOf = (id: string) => catalogue.find((p) => p.id === id)?.display_name ?? id;
const PROVIDER_LOGO_IDS = providerLogoIds();
/** ProviderMark.module.css without comments, and the body of one rule in it. */
const css = readFileSync(path.join(__dirname, 'ProviderMark.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};

const svgOf = (id: string, size?: 'sm' | 'md') => {
  const { container } = render(<ProviderMark id={id} name={nameOf(id)} size={size} />);
  return container;
};

describe('every catalogue provider has a mark or is a listed Monogram', () => {
  it('each id is exactly one of: Hoody AI, a mark, a Monogram', () => {
    const logos = new Set(PROVIDER_LOGO_IDS);
    const mono = new Set(MONOGRAM);
    const unaccounted = ids.filter((id) => id !== 'hoody-ai' && !logos.has(id) && !mono.has(id));
    const both = ids.filter((id) => logos.has(id) && mono.has(id));
    expect(unaccounted).toEqual([]);
    expect(both).toEqual([]);
  });

  it('the lists name only real providers: catalogue ids, or the agent\'s built-ins the catalogue lacks', () => {
    const known = new Set([...ids, ...AGENT_ONLY]);
    expect(PROVIDER_LOGO_IDS.filter((id) => !known.has(id))).toEqual([]);
    expect(MONOGRAM.filter((id) => !ids.includes(id))).toEqual([]);
    expect(AGENT_ONLY.filter((id) => ids.includes(id) || !PROVIDER_LOGO_IDS.includes(id))).toEqual([]);
  });

  it('a Monogram provider draws its letter, never a mark', () => {
    for (const id of MONOGRAM) {
      expect([id, providerLogo(id)]).toEqual([id, undefined]);
      const c = svgOf(id);
      expect(c.querySelector('svg')).toBeNull();
      expect(c.textContent).toBe(Array.from(nameOf(id).trim())[0]!.toUpperCase());
    }
  });

  it('an unknown provider, and an id that is an object key, draw the Monogram', () => {
    for (const id of ['my-endpoint', 'constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect([id, providerLogo(id)]).toEqual([id, undefined]);
      const { container } = render(<ProviderMark id={id} name="Workshop" />);
      expect(container.querySelector('svg')).toBeNull();
      expect(container.textContent).toBe('W');
    }
  });
});

describe('each mark', () => {
  it.each([...PROVIDER_LOGO_IDS])('%s renders one decorative svg in the current colour, with no style attribute', (id) => {
    const c = svgOf(id);
    const svgs = c.querySelectorAll('svg');
    expect(svgs).toHaveLength(1);
    const svg = svgs[0]!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(svg.getAttribute('role')).toBeNull();
    // The svg's own attributes: its view, its class, hidden from readers; never a fill, a colour or a reference.
    expect(svg.getAttributeNames().map((a) => a.toLowerCase()).sort()).toEqual(['aria-hidden', 'class', 'focusable', 'viewbox']);
    expect(c.textContent).toBe('');
    // A square view (the box is square), so the mark is never stretched.
    const view = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number);
    expect(view).toHaveLength(4);
    expect(view.every(Number.isFinite)).toBe(true);
    expect(view[2]).toBeGreaterThan(0);
    expect(view[2]).toBe(view[3]);
    // No inline style anywhere (the Hub's CSP), no fixed colour: only the shape, its fill rule and its tone.
    expect(c.querySelector('[style]')).toBeNull();
    const paths = svg.querySelectorAll('path');
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      expect(p.getAttribute('d')).toMatch(/^[Mm]/);
      for (const a of p.getAttributeNames()) expect([id, a]).toEqual([id, expect.stringMatching(/^(d|fill-rule|clip-rule|fill-opacity)$/)]);
    }
    expect(svg.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgb|black|white|url\(|<(?!\/?path)/i);
  });

  it('md draws the same mark as sm, in the larger box: sm 16 px, md 24 px (the Monogram\'s sizes)', () => {
    const sm = svgOf('anthropic').querySelector('svg')!;
    const md = svgOf('anthropic', 'md').querySelector('svg')!;
    expect(md.getAttribute('viewBox')).toBe(sm.getAttribute('viewBox'));
    expect(md.innerHTML).toBe(sm.innerHTML);
    expect(sm).toHaveClass(m.logo!);
    expect(sm).not.toHaveClass(m.logoMd!);
    expect(md).toHaveClass(m.logo!, m.logoMd!);
    expect(rule('.logo')).toMatch(/inline-size: var\(--sp-4\);\s*block-size: var\(--sp-4\);/);
    expect(rule('.logoMd')).toMatch(/inline-size: var\(--sp-6\);\s*block-size: var\(--sp-6\);/);
    // .logoMd comes after .logo, so its box wins at the same specificity.
    expect(css.indexOf('.logoMd {')).toBeGreaterThan(css.indexOf('.logo {'));
  });

  it('the stylesheet draws the mark in the text colour only: no fixed colour, no reference, no inline style', () => {
    expect(rule('.logo')).toMatch(/color: var\(--hx-ink\);\s*fill: currentcolor;/);
    expect([...css.matchAll(/(?:^|[\s;{])(fill|stroke|color)\s*:\s*([^;]+);/g)].map((x) => `${x[1]}: ${x[2]}`)).toEqual(['color: var(--hx-ink)', 'fill: currentcolor']);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|url\(|black|white/i);
  });

  it('several plans of one company share its mark', () => {
    for (const [a, b] of [['alibaba', 'alibaba-coding-plan-cn'], ['stepfun', 'stepfun-step-plan'], ['xiaomi', 'xiaomi-token-plan-ams'], ['zai', 'zai-coding-plan'], ['perplexity', 'perplexity-agent'], ['moonshotai', 'moonshotai-cn']] as const)
      expect([a, b, providerLogo(a)]).toEqual([a, b, providerLogo(b)]);
  });
});

describe('Hoody AI', () => {
  it('still draws the Hoody icon, never a mark from the provider list', () => {
    const { container } = render(<ProviderMark id="hoody-ai" name="Hoody AI" />);
    const { container: icon } = render(<Icon name="hoody-ai" size="sm" />);
    const svg = container.querySelector('svg')!;
    expect(svg.outerHTML).toBe(icon.querySelector('svg')!.outerHTML);
    expect(svg.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('no Hoody id has a mark in the provider list', () => {
    expect(PROVIDER_LOGO_IDS.filter((id) => id.startsWith('hoody'))).toEqual([]);
    expect(providerLogo('hoody-ai')).toBeUndefined();
  });
});
