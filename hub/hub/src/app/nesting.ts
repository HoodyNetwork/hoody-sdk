// Test-only: a link or a text button drawn inside a control
// that is itself interactive. A press-painting control (the kit Button family, Menu items, the Ids copy cell, the shell's Sidebar,
// BottomNav and Switchers items) would paint --hx-press behind the link's ink, a pairing nobody measured, and HTML does not allow
// interactive content inside a button or a link. links.surfaces.contrast-surfaces-link-text.test.ts reads the source; this reads what a test rendered, so a
// link passed in a variable, through a wrapper, in forwarded children or from a render prop is seen too. CSS module class names are
// not scoped in vitest, so the check keys on what the controls render (roles and attributes), not on painter classes.
const OUTER = [
  'button',
  'a[href]',
  ...['button', 'link', 'menuitem', 'menuitemradio', 'menuitemcheckbox', 'tab', 'option', 'switch'].map((r) => `[role="${r}"]`),
].join(', ');
// A secret ExtLink (kit/controls/Link.tsx) is a link drawn as a button with no href: it carries data-secret-link.
const INNER = 'a[href], [data-text-button], [data-secret-link]';
const NAME_MAX = 40;
/** The most pairs a failure names; the rest are counted (a large tree must not make a huge report). */
export const SHOWN_MAX = 20;

/** One link or text button inside an interactive control, each named briefly (tag, role, accessible label or text start). */
export interface Nested {
  outer: string;
  inner: string;
}

const cut = (v: string) => v.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
/** A short name for a control: its tag, role and accessible label or text start, each cut to NAME_MAX. Named once per element. */
function named(el: Element, names: Map<Element, string>): string {
  const known = names.get(el);
  if (known !== undefined) return known;
  const role = el.getAttribute('role');
  const text = cut(el.getAttribute('aria-label') ?? el.textContent ?? '');
  const name = `${el.tagName.toLowerCase()}${role ? `[role=${cut(role)}]` : ''}${text ? ` "${text}"` : ''}`;
  names.set(el, name);
  return name;
}

/** The links or text buttons drawn inside an interactive control under `root`, outermost control first: at most `max` named, and
 *  how many there are in all. */
export function nestedInteractive(root: ParentNode, max = Infinity): { shown: Nested[]; total: number } {
  const shown: Nested[] = [];
  const names = new Map<Element, string>();
  let total = 0;
  for (const outer of root.querySelectorAll(OUTER))
    for (const inner of outer.querySelectorAll(INNER)) {
      total++;
      if (shown.length < max) shown.push({ outer: named(outer, names), inner: named(inner, names) });
    }
  return { shown, total };
}

/** Fails (throws) when a link or text button is drawn inside an interactive control under `root`, naming at most SHOWN_MAX pairs.
 *  app/test-setup.ts calls it after every web test, before the test's DOM is cleaned up, so every control a test rendered is
 *  checked. */
export function checkNesting(root: ParentNode): void {
  const { shown, total } = nestedInteractive(root, SHOWN_MAX);
  if (total === 0) return;
  const lines = shown.map((n) => `  ${n.inner} inside ${n.outer}`);
  if (total > shown.length) lines.push(`  and ${total - shown.length} more`);
  throw new Error(`a link or text button is drawn inside an interactive control (kit-interactive-nesting-check):\n${lines.join('\n')}`);
}
