// Pure parts of Display (shared by Display.tsx and its terminal sibling): the Fact record and the check for controls
// inside a fact's value.
import { Children, Fragment, type ReactNode, isValidElement } from 'react';

export interface Fact {
  label: string;
  /** The value as shown. With `id`, leave it out: the id is shown masked. */
  value?: ReactNode;
  /** Monospace value (hosts, versions). */
  mono?: boolean;
  /** A value that opens another page: ink, underline on hover, with a `›`. */
  href?: string;
  /** A web address: shown as an ExtLink (full scheme, opens in a new tab). Leave `value` out. */
  url?: string;
  /** The address grants access (a program address, a share link): masked, opened through a button. Secret by shape is always masked. */
  secretUrl?: boolean;
  /** Text copied by a Copy button that shows on hover and focus (a host, an address). Never a secret. */
  copy?: string;
  /** A full id: shown masked as an IdChip and copied whole. Never write a 24-hex id into `value`. */
  id?: string;
  /** Spans the whole width under the grid (a long description, a path). */
  wide?: boolean;
  /** The value is a use of a limit ("3 of 16"): its percent, drawn as a Meter under the value; `label` names it whole
   *  ("3 of 16 VMs running"). Only for a value that reads "n of m". The spec layout does not draw it. */
  meter?: { value: number; label: string };
}

/** How a Facts grid lays its cells: how many to a row on a wide container, how many the last row holds, and whether a
 *  phone gives every fact a row of its own. */
export interface FactsPlan {
  across: 1 | 2 | 3 | 4;
  last: number;
  phoneOne: boolean;
}

// A half cell on a phone (about 160 px) holds a short label over a short word or number, nothing else.
const PHONE_LABEL = 16;
const PHONE_VALUE = 14;

function phoneShort(f: Fact): boolean {
  if (f.label.length > PHONE_LABEL || f.href !== undefined || f.url !== undefined || f.id !== undefined || f.copy !== undefined) return false;
  return typeof f.value === 'number' || (typeof f.value === 'string' && f.value.length <= PHONE_VALUE);
}

const WORD_MAX = 16;

function needsRoom(f: Fact): boolean {
  return f.url !== undefined || (typeof f.value === 'string' && f.value.split(/\s+/).some((w) => w.length > WORD_MAX));
}

/** The cell plan for the facts of a grid (the ones that are not `wide`). One column: a fact per row. Otherwise up to
 *  four share a row; from five on, three or four to a row, whichever leaves the fuller last row (three on a tie); two
 *  to a row when a value holds a web address or a long unbroken word. The
 *  cells of a short last row widen to fill it, so no ruled cell stands empty. */
export function factsPlan(items: readonly Fact[], columns: 1 | 2 | 3): FactsPlan {
  const n = items.length;
  const phoneOne = !items.every(phoneShort);
  if (columns === 1 || n <= 1) return { across: 1, last: 1, phoneOne };
  const lastOf = (a: number) => (n % a === 0 ? a : n % a);
  // A web address or a long unbroken word (a host, a path) needs half the row: it would break mid-word in a narrower cell.
  if (items.some(needsRoom)) return { across: 2, last: lastOf(2), phoneOne };
  if (n <= 4) return { across: n as 2 | 3 | 4, last: n, phoneOne };
  const across = lastOf(4) / 4 > lastOf(3) / 3 ? 4 : 3;
  return { across, last: lastOf(across), phoneOne };
}

// Facts hold no controls: a fact that needs an action is a setting row. Dev builds warn once per offending item (a
// console warning, never a throw). The check reads the value element and its direct children by component name; an
// opaque custom component that renders a control inside is not seen (a stated contract).
const FACT_CONTROLS = new Set([
  'Switch',
  'Checkbox',
  'Button',
  'LinkButton',
  'TextButton',
  'IconButton',
  'TextField',
  'NumberField',
  'SearchField',
  'SecretField',
  'SecretInput',
  'Select',
  'Combobox',
  'EntityPicker',
  'RadioGroup',
  'SegmentedControl',
  'DateTimeField',
  'TimeField',
  'ActionMenu',
]);
const FACT_NATIVE = new Set(['button', 'input', 'select', 'textarea']);

function controlName(node: ReactNode): string | null {
  if (!isValidElement(node)) return null;
  const type = node.type as unknown;
  if (typeof type === 'string') {
    if (FACT_NATIVE.has(type)) return type;
    if (type === 'a' && typeof (node.props as { onClick?: unknown }).onClick === 'function') return 'a[onclick]';
    return null;
  }
  const t = type as { displayName?: string; name?: string; render?: { name?: string }; type?: { name?: string } } | null;
  const name = t?.displayName ?? t?.name ?? t?.render?.name ?? t?.type?.name;
  return name && FACT_CONTROLS.has(name) ? name : null;
}

/** The controls found in each fact's value (exported for tests): one level of children, through a Fragment or a native element. */
export function factControls(items: readonly Fact[]): Array<{ label: string; control: string }> {
  const found: Array<{ label: string; control: string }> = [];
  for (const f of items) {
    const v = f.value;
    const own = controlName(v);
    if (own) {
      found.push({ label: f.label, control: own });
      continue;
    }
    if (isValidElement(v) && (v.type === Fragment || typeof v.type === 'string')) {
      for (const c of Children.toArray((v.props as { children?: ReactNode }).children)) {
        const n = controlName(c);
        if (n) {
          found.push({ label: f.label, control: n });
          break;
        }
      }
    }
  }
  return found;
}

