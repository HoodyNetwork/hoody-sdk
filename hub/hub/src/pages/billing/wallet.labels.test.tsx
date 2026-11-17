// Vitest: the wallet card's two labels ("Wallet" and the GitHub bonus heading under it) read as one pair: both carry
// the card-label look and the wallet's muted label colour, the same token, so one cannot drift from the other. The
// colour itself is the kit's muted text token, which the kit proves at 4.5:1 or more on the card fill in both themes
// (kit/theme.tokens-contrast.test.ts: `--hx-muted` on `--hx-card`); wallet.card-readout.spec.ts measures both labels as drawn.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { renderPage, waitFor } from '@app/testing';
import page from './page';

const css = postcss.parse(readFileSync(join(import.meta.dirname, 'parts', 'parts.module.css'), 'utf8'));

/** Every rule (inside a container query or not) whose selector names `cls` as a class, in source order, with its colour. */
function colourRules(cls: string): { selector: string; color: string; index: number }[] {
  const out: { selector: string; color: string; index: number }[] = [];
  let i = 0;
  css.walkRules((r) => {
    i += 1;
    if (!new RegExp(`\\.${cls}(?![\\w-])`).test(r.selector)) return;
    r.walkDecls('color', (d) => {
      out.push({ selector: r.selector, color: d.value, index: i });
    });
  });
  return out;
}

async function labels() {
  await renderPage(page, { path: '/billing?view=wallet' });
  await waitFor(() => expect(document.querySelector('h2#bill-bonus')).not.toBeNull(), { timeout: 20000 });
  return { wallet: document.querySelector('h2#bill-wallet') as HTMLElement, bonus: document.querySelector('h2#bill-bonus') as HTMLElement };
}

describe('the wallet card labels', () => {
  it('the bonus heading carries the wallet label colour class, as the wallet heading does', async () => {
    const { wallet, bonus } = await labels();
    expect([...wallet.classList]).toEqual(['cardLabel', 'walletLabel']);
    expect([...bonus.classList]).toEqual(['cardLabel', 'walletLabel']);
  });

  it('that class is one colour, the muted text token, declared after the card label it overrides', () => {
    const label = colourRules('walletLabel');
    expect(label.map((r) => [r.selector, r.color])).toEqual([['.walletLabel', 'var(--hx-muted)']]);
    const card = colourRules('cardLabel');
    expect(card.map((r) => r.selector)).toEqual(['.cardLabel']);
    // Same specificity (one class each): the later rule wins, so the wallet's colour must come second.
    expect(label[0]!.index).toBeGreaterThan(card[0]!.index);
  });

  it('nothing in the bonus line recolours its heading', () => {
    const all: string[] = [];
    css.walkRules((r) => {
      if (/bill-bonus|\.walletBonus[^,{]*\b(h2|\.cardLabel|\.walletLabel)/.test(r.selector)) r.walkDecls('color', () => void all.push(r.selector));
    });
    expect(all).toEqual([]);
  });
});
