// The current MenuThumb picture is filled through a selected role
// token, ink like the kit's ticked box, never a blue tint (the blue rule grants the selected bar only).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const menu = read('kit/overlays/Menu.module.css');
const tokens = read('kit/tokens.css');
const body = (sel: string) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|})\\s*${esc}\\s*\\{([^}]*)\\}`, 'm').exec(menu)?.[1] ?? '';
};

describe('Menu: the current thumb takes the selected fill', () => {
  it('the selected fill is ink, declared once, in the first :root block (the light theme every theme starts from)', () => {
    const decl = [...tokens.matchAll(/--hx-selected-fill\s*:\s*([^;]+);/g)].map((m) => m[1]!.trim());
    expect(decl).toEqual(['var(--hx-ink)']);
    const root = /(?:^|})\s*:root\s*\{([^}]*)\}/m.exec(tokens)?.[1] ?? '';
    expect(root).toMatch(/--hx-selected-fill\s*:\s*var\(--hx-ink\);/);
  });

  it('the current thumb is filled with it and keeps the selected bar as its edge', () => {
    expect(body('.current .thumb')).toMatch(/fill:\s*var\(--hx-selected-fill\);/);
    expect(body('.current .thumb')).toMatch(/stroke:\s*var\(--hx-selected-bar\);/);
  });

  it('the menu CSS reads no blue tint', () => {
    expect(menu).not.toMatch(/--hx-blue-t\d/);
  });
});
