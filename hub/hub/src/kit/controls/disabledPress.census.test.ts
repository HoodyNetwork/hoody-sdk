// @vitest-environment node
// kit.disabledPress census: a React Aria Button or ToggleButton the kit renders itself must carry the disabled-press
// guard (controls/disabledPress.ts), or a press on it while disabled swallows the first click after it is enabled.
// A raw button is guarded when its `ref` is a name the same file got from `useDisabledPressRef(...)`, or from
// `useSoftDisabled(...)` / `useReasonTip(...)` (kit Button, IconButton, TextButton: they bind the same guard).
// What is left is ALLOW: buttons that have no disabled state at all, each with why. ALLOW only shrinks.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const KIT = join(import.meta.dirname, '..');
const RAW = ['Button', 'ToggleButton'];

/** The local names `tsx` imports React Aria's Button or ToggleButton under (`Button as AriaButton` gives AriaButton). */
function rawNames(tsx: string): string[] {
  const out: string[] = [];
  for (const m of tsx.matchAll(/import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*['"]react-aria-components['"]/g))
    for (const part of (m[1] ?? '').split(',')) {
      const one = /^\s*(\w+)(?:\s+as\s+(\w+))?\s*$/.exec(part);
      if (one && RAW.includes(one[1] ?? '')) out.push(one[2] ?? one[1] ?? '');
    }
  return out;
}

/** The names that hold a guarded ref in `tsx`. */
function guardedRefs(tsx: string): Set<string> {
  const out = new Set<string>();
  for (const m of tsx.matchAll(/\bconst\s+(\w+)\s*=\s*useDisabledPressRef\b/g)) out.add(m[1] ?? '');
  for (const m of tsx.matchAll(/\bconst\s*\{([^}]*)\}\s*=\s*use(?:SoftDisabled|ReasonTip)\(/g))
    for (const part of (m[1] ?? '').split(',')) {
      const one = /^\s*ref(?:\s*:\s*(\w+))?\s*$/.exec(part);
      if (one) out.add(one[1] ?? 'ref');
    }
  return out;
}

/** The attribute text of every opening tag named in `names` (braces balanced, so `=>` and `{a > b}` stay inside). */
function openingTags(tsx: string, names: string[]): string[] {
  const out: string[] = [];
  if (names.length === 0) return out;
  const re = new RegExp(`<(?:${names.join('|')})\\b`, 'g');
  for (let m = re.exec(tsx); m; m = re.exec(tsx)) {
    let depth = 0;
    let i = re.lastIndex;
    for (; i < tsx.length; i++) {
      const c = tsx[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    out.push(tsx.slice(re.lastIndex, i));
  }
  return out;
}

/** How many raw React Aria buttons `tsx` renders without a guarded ref. */
function unguarded(tsx: string): number {
  const refs = guardedRefs(tsx);
  return openingTags(tsx, rawNames(tsx)).filter((attrs) => {
    const ref = /\bref=\{\s*(\w+)\s*\}/.exec(attrs);
    return !ref || !refs.has(ref[1] ?? '');
  }).length;
}

/** `kit/<file>` to its count of unguarded raw buttons, for every kit source that has any. */
function scanKit(): Map<string, number> {
  const out = new Map<string, number>();
  const files = (readdirSync(KIT, { recursive: true }) as string[]).map((f) => f.split('\\').join('/'));
  for (const f of files.filter((x) => x.endsWith('.tsx') && !/\.(test|spec)\.tsx$/.test(x))) {
    const n = unguarded(readFileSync(join(KIT, f), 'utf8'));
    if (n > 0) out.set(`kit/${f}`, n);
  }
  return out;
}

/** Raw buttons with no guard: how many per file, and why none can be disabled. A button that gains a disabled state
 *  takes `useDisabledPressRef` and leaves this list. */
const ALLOW: Record<string, readonly [number, string]> = {
  'kit/agent/StepTrail.tsx': [1, "a step row of a turn's trail that opens its detail: it has no disabled state (a step with nothing more to show is drawn as a plain row, not a button)"],
  'kit/controls/Disclosure.tsx': [1, 'the disclosure trigger: neither it nor its Disclosure is ever given isDisabled'],
  'kit/controls/SideTabs.tsx': [1, 'a row toggle in the side tabs: it has no disabled state'],
  'kit/data/FilterChips.tsx': [2, 'a filter chip trigger and its clear part: neither has a disabled state'],
  'kit/data/ProblemList.tsx': [1, 'a jump-to-line link in the problem list: it has no disabled state'],
  'kit/layouts/anatomy/ItemList.tsx': [1, 'the open button of an item row: it has no disabled state'],
  'kit/pickers/FileChooser.tsx': [2, 'a side place and a sort header cell: neither has a disabled state (the chooser trigger is the guarded PickerTrigger)'],
  'kit/pickers/PickCard.tsx': [1, 'the card button is only ever aria-disabled: the element still gets its click, which closes the press'],
};

describe('kit.disabledPress census: every raw React Aria button in the kit carries the guard', () => {
  it('no kit file renders a raw Button or ToggleButton without a guarded ref, except ALLOW', () => {
    const over = [...scanKit()].filter(([f, n]) => n > (ALLOW[f]?.[0] ?? 0)).map(([f, n]) => `${f}: ${n} unguarded, row allows ${ALLOW[f]?.[0] ?? 0}`);
    expect(over, 'give the button ref={useDisabledPressRef()} (kit/controls/disabledPress.ts), or use a kit Button').toEqual([]);
  });

  it('ALLOW only shrinks: every row is still found, and says why', () => {
    const hits = scanKit();
    const stale = Object.entries(ALLOW).filter(([f, [n]]) => (hits.get(f) ?? 0) < n).map(([f, [n]]) => `${f}: row allows ${n}, found ${hits.get(f) ?? 0}`);
    expect(stale, 'guarded or gone: lower or delete its ALLOW row').toEqual([]);
    for (const [f, [, why]] of Object.entries(ALLOW)) expect(why.length, f).toBeGreaterThanOrEqual(30);
  });

  it('the kit buttons bind the guard themselves', () => {
    const button = readFileSync(join(KIT, 'controls/Button.tsx'), 'utf8');
    expect(button).toMatch(/const guarded = useDisabledPressRef\(next\);/);
    expect(unguarded(button)).toBe(0);
    expect(unguarded(readFileSync(join(KIT, 'controls/Link.tsx'), 'utf8'))).toBe(0);
  });
});

describe('kit.disabledPress census: the scan', () => {
  const head = "import { Button as Raw, ToggleButton, Tooltip } from 'react-aria-components';\n";

  it('counts a raw button with no ref, or with a ref that is not the guard', () => {
    expect(unguarded(`${head}const a = <Raw onPress={() => go(a > b)}>x</Raw>;`)).toBe(1);
    expect(unguarded(`${head}const r = useRef(null);\nconst a = <ToggleButton ref={r} id="a" />;`)).toBe(1);
    expect(unguarded(`${head}const a = <Tooltip />;\nconst b = <Button />;`), 'other parts, and a kit Button, are not raw').toBe(0);
  });

  it('accepts the guard, direct or through the kit hooks, under any local name', () => {
    expect(unguarded(`${head}const press = useDisabledPressRef<HTMLButtonElement>();\nconst a = <Raw ref={press} />;`)).toBe(0);
    expect(unguarded(`${head}const press = useDisabledPressRef(triggerRef);\nconst a = <ToggleButton ref={press} />;`)).toBe(0);
    expect(unguarded(`${head}const { ref } = useSoftDisabled(soft, busy);\nconst a = <Raw {...rest} ref={ref} />;`)).toBe(0);
    expect(unguarded(`${head}const { ref: elRef, el } = useReasonTip(soft, busy);\nconst a = <Raw ref={elRef} />;`)).toBe(0);
    expect(unguarded(`${head}const { el } = useReasonTip(soft, busy);\nconst a = <Raw ref={el} />;`), 'only the hook\'s ref is the guard').toBe(1);
  });
});
