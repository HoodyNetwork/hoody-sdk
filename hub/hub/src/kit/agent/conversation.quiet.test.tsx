// A reply's actions are quiet: Copy and the host's turn menu, first in the foot, shown while the pointer is on the reply or focus
// is inside it, on the newest turn, while the menu is open, and always on touch; Tab still reaches them and nothing moves when
// they show. Turns are set apart by a solid hairline with the turn gap on both sides of it (never a dash).
import { cleanup, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import strings from './Conversation.strings.en.json';
import { ReplyBox, ReplyFooter } from './Reply';

const noComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const conv = noComments(readFileSync(join(__dirname, 'Conversation.module.css'), 'utf8'));
const session = noComments(readFileSync(join(__dirname, 'SessionView.module.css'), 'utf8'));
/** Rule bodies (with their selectors) that name `cls`, outside or inside an at-rule. */
const rules = (css: string, cls: string) => [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)].filter((m) => (m[1] ?? '').includes(cls)).map((m) => ({ sel: (m[1] ?? '').trim(), body: m[2] ?? '' }));
afterEach(() => { cleanup(); });
const HIDE = '.reply:not(:hover, :focus-within, [data-latest] *) .replyFoot:not([data-menu-open]) > button';

describe('quiet actions on a reply', () => {
  it("the reply's Copy is a real, named, focusable icon button, first in its foot; the host's menu comes right after it", () => {
    render(<ReplyBox><ReplyFooter text="hi" cost={0.0042} at={null} menu={<button type="button">More</button>} /></ReplyBox>);
    const copy = screen.getByRole('button', { name: strings['agent.copy'] });
    expect(copy.getAttribute('tabindex')).not.toBe('-1');
    expect(copy.hasAttribute('disabled')).toBe(false);
    expect(copy.textContent).toBe('');
    const foot = copy.parentElement as HTMLElement;
    expect(within(foot).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([strings['agent.copy'], 'More']);
    expect(copy.compareDocumentPosition(within(foot).getByText(/\$0\.0042/)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('they hide only with a hover-capable pointer, only while the reply has neither the pointer nor focus, never on the newest turn or with the menu open', () => {
    const hide = rules(conv, '.replyFoot').filter((r) => /(^|[;\s])(opacity|visibility)\s*:|display:\s*none/.test(r.body));
    expect(hide).toHaveLength(1);
    expect(hide[0]!.sel).toBe(HIDE);
    expect(hide[0]!.body).toMatch(/opacity:\s*0/);
    expect(hide[0]!.body).not.toMatch(/visibility|display|pointer-events/);
    const media = conv.slice(0, conv.indexOf(HIDE));
    expect(media.slice(media.lastIndexOf('@media')).startsWith('@media (hover: hover) {')).toBe(true);
    // One rule for the whole group: no class of Copy's own hides or shows it.
    expect(conv).not.toMatch(/\.replyCopy\b/);
  });
  it('their fade reads the kit motion token (zero under reduced motion)', () => {
    const base = rules(conv, '.replyFoot > button').find((r) => r.sel === '.replyFoot > button');
    expect(base?.body).toMatch(/transition:\s*opacity var\(--dur-[a-z]+\)/);
  });
});

describe('space between turns', () => {
  it('each turn after the first starts under a solid hairline, one turn gap from it on both sides; no dash anywhere', () => {
    const r = rules(session, '.turn + .turn').find((x) => x.sel === '.turn + .turn');
    expect(r?.body).toMatch(/margin-block-start:\s*var\(--conv-gap-turn\)/);
    expect(r?.body).toMatch(/padding-block-start:\s*var\(--conv-gap-turn\)/);
    expect(r?.body).toMatch(/border-block-start:\s*var\(--bw\) solid var\(--hx-line\)/);
    expect(session).toMatch(/--conv-gap-turn:\s*var\(--sp-\d\)/);
    expect(session).not.toMatch(/dashed|dotted/);
  });
});
