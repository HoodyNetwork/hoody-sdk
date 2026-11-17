// A strip whose buttons are disabled with a reason still draws one shared line and one final cut. A soft-disabled
// Button renders its hidden reason as a sibling element, so the strip rules must find the NEXT strip button, never just
// the next element: the rules from Button.module.css are matched against the rendered strip (class names mapped through
// the CSS module).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './Button';
import { ButtonStrip } from './ButtonStrip';
import s from './Button.module.css';

const css = readFileSync(join(import.meta.dirname, 'Button.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.replace(/\s+/g, ' ').trim(), body: m[2]! }));
/** The one strip rule that sets the declaration, as a selector over the module's real class names. */
const stripRule = (decl: RegExp) => {
  const found = rules.filter((r) => /\.inStrip\b/.test(r.sel.replace(/:not\((?:[^()]|\([^()]*\))*\)/g, '')) && decl.test(r.body));
  expect(found, String(decl)).toHaveLength(1);
  return found[0]!.sel.replace(/\.([A-Za-z][\w-]*)/g, (_m, c: string) => `.${(s as Record<string, string>)[c] ?? c}`);
};

/** Element.matches, with `:has(~ X)` (a later sibling matching X) evaluated by hand: happy-dom does not parse it. */
const matches = (el: Element, sel: string): boolean => {
  const has = /^(.*):has\(~ (.+)\)$/.exec(sel);
  if (!has) return el.matches(sel);
  if (!el.matches(has[1]!)) return false;
  for (let n = el.nextElementSibling; n; n = n.nextElementSibling) if (n.matches(has[2]!)) return true;
  return false;
};

describe('a strip of buttons disabled with a reason', () => {
  it.each([
    ['both disabled', true, true],
    ['the first disabled', true, false],
    ['the last disabled', false, true],
    ['neither disabled', false, false],
  ])('%s: only the last button keeps the cut, only the second drops its start edge', (_what, first, last) => {
    render(
      <ButtonStrip label="More">
        <Button icon="upload" isDisabled={first} disabledReason={first ? 'The list is still loading' : undefined}>
          Import
        </Button>
        <Button icon="reload" isDisabled={last} disabledReason={last ? 'The list is still loading' : undefined}>
          Reconnect
        </Button>
      </ButtonStrip>,
    );
    const group = screen.getByRole('group', { name: 'More' });
    const a = within(group).getByRole('button', { name: /Import/ });
    const b = within(group).getByRole('button', { name: /Reconnect/ });
    const noCut = stripRule(/--plate-cut:\s*0px/);
    const noStart = stripRule(/border-inline-start-width:\s*0/);
    expect([matches(a, noCut), matches(b, noCut)], 'the cut: Import none, Reconnect its own').toEqual([true, false]);
    expect([matches(a, noStart), matches(b, noStart)], 'the shared line: Reconnect drops its start edge').toEqual([false, true]);
  });
});
