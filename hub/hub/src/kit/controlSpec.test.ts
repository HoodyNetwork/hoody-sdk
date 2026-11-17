// The control spec (kit/controlSpec.ts) is a well-formed table, and it covers the kit. Every token it
// names is declared, every debt row names a real cell and context and says what the cell reads today, every cell has a
// specimen in the gallery's controls tab with the elements the matrix measures and focuses, and the dead control tokens
// are gone. Coverage is judged against INVENTORY below, written by hand and not from the table: every component that
// kit/controls and kit/forms export, each variant of the ones with variants (read from their source), is either not a
// control (with why) or a control of a family whose every need names its cells or the later step that adds them. The
// browser matrix (controls/controls.matrix.spec.ts) does the measuring.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CONTEXTS, CONTROL_DEBT, DENSITIES, FOCUS_AT, POINTERS, THEMES, CONTROL_SPEC, cellKey, ctxMatches, debtFor, measureOf, measuredIn, targetIn, type Ctx, type Prop, type State } from './controlSpec';
import { ControlsTab } from './gallery/controls';
import { webBuilt } from '../app/conformance/termFiles';

const KIT = import.meta.dirname;
const tokens = readFileSync(join(KIT, 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const declared = new Set([...tokens.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]!));
const KEYS = CONTROL_SPEC.map(cellKey);
const BY_KEY = new Map(CONTROL_SPEC.map((c) => [cellKey(c), c]));

// ── The inventory (hand-written; the spec table never feeds it) ───────────────────────────────────────────────────

/** What the spec asks of each family, and which cells answer a need. */
const NEEDS = {
  pressable: ['height', 'hit', 'focus', 'disabled'],
  field: ['height', 'line', 'hover', 'focus', 'invalid', 'disabled'],
  toggle: ['height', 'hit', 'line', 'focus', 'disabled'],
  strip: ['height', 'hit', 'focus', 'disabled'],
} as const;
type Family = keyof typeof NEEDS;
type Need = (typeof NEEDS)[Family][number];
const ANSWERS: Record<Need, { state?: State; props: readonly Prop[] }> = {
  height: { state: 'rest', props: ['height'] },
  hit: { state: 'rest', props: ['hit'] },
  line: { state: 'rest', props: ['borderColor'] },
  hover: { state: 'hover', props: ['borderColor'] },
  focus: { state: 'focus', props: ['focusShadow'] },
  invalid: { state: 'invalid', props: ['borderColor'] },
  disabled: { state: 'disabled', props: ['opacity', 'background', 'color'] },
};
interface Later {
  readonly later: 'planned' | 'keep';
  readonly why: string;
}
type Cover = readonly string[] | Later;
type Entry = { readonly none: string } | { readonly family: Family; readonly cover: Readonly<Partial<Record<Need, Cover>>> };

const sameFieldBox = (why: string): Entry => ({
  family: 'field',
  cover: { height: { later: 'keep', why }, line: { later: 'keep', why }, hover: { later: 'keep', why }, focus: { later: 'keep', why }, invalid: { later: 'keep', why }, disabled: { later: 'keep', why } },
});
const pressable = (c: string, toolbar = false): Entry => ({
  family: 'pressable',
  cover: {
    height: toolbar
      ? [`${c}.md.rest.height`, `${c}.sm.rest.height`, `${c}.toolbar.rest.height`, ...(c === 'button' ? ['button.xs.rest.height'] : [])]
      : [`${c}.md.rest.height`, `${c}.sm.rest.height`],
    hit: [`${c}.sm.rest.hit`, ...(c === 'button' ? ['button.xs.rest.hit'] : [])],
    focus: [`${c}.md.focus.focusShadow`],
    disabled: [`${c}.md.disabled.opacity`],
  },
});
const sameBox = (variant: string): Entry => ({
  family: 'pressable',
  cover: {
    height: { later: 'keep', why: `IconButton ${variant}: one box for every variant (Button.module.css .iconOnly: a square of the size's height); the variant sets the plate and ink only, so the secondary specimen's heights are its heights` },
    hit: { later: 'keep', why: `IconButton ${variant}: the same .iconOnly box as the secondary specimen` },
    focus: { later: 'keep', why: `IconButton ${variant}: the shared .button focus rule, measured on the secondary specimen` },
    disabled: { later: 'keep', why: `IconButton ${variant}: the shared .button disabled rule, measured on the secondary specimen` },
  },
});

const INVENTORY: Readonly<Record<string, Entry>> = {
  // controls/
  'Button:secondary': pressable('button', true),
  'Button:ghost': pressable('buttonGhost', true),
  'Button:primary': pressable('buttonPrimary'),
  'Button:danger': pressable('buttonDanger'),
  'Button:dangerSolid': pressable('buttonDangerSolid'),
  'Button:row': pressable('buttonRow'),
  'Button:bubble': {
    family: 'pressable',
    cover: {
      height: { later: 'keep', why: 'the idea plate holds a sentence that wraps: it is sized by its padding, not by a control height' },
      hit: ['buttonBubble.sm.rest.hit'],
      focus: ['buttonBubble.md.focus.focusShadow'],
      disabled: ['buttonBubble.md.disabled.opacity'],
    },
  },
  ButtonFace: { none: "a button's label and end glyph, drawn inside a control that takes buttonClass; not a control of its own" },
  LinkButton: {
    family: 'pressable',
    cover: {
      height: ['linkButton.md.rest.height'],
      hit: { later: 'keep', why: 'a LinkButton at md is the Button box (buttonClass); md heights are 44 on coarse, its hit' },
      focus: ['linkButton.md.focus.focusShadow'],
      disabled: ['linkButton.md.disabled.opacity'],
    },
  },
  'IconButton:secondary': {
    family: 'pressable',
    cover: {
      height: ['iconButton.md.rest.height', 'iconButton.sm.rest.height', 'iconButton.toolbar.rest.height', 'iconButton.xs.rest.height'],
      hit: ['iconButton.md.rest.hit', 'iconButton.sm.rest.hit', 'iconButton.xs.rest.hit'],
      focus: ['iconButton.md.focus.focusShadow'],
      disabled: ['iconButton.md.disabled.opacity'],
    },
  },
  'IconButton:ghost': sameBox('ghost'),
  'IconButton:primary': sameBox('primary'),
  'IconButton:danger': sameBox('danger'),
  StripScopeReset: { none: 'a context reset for ButtonStrip children; renders no control' },
  ButtonSpinner: { none: "the busy pulse a button draws in place of its icon; a button's content, not a control" },
  ReasonTip: { none: "the tooltip and description around a soft-disabled button; the button is measured as its own control" },
  ButtonStrip: { none: 'a container: its children are kit Buttons, measured as Buttons' },
  CountryFlag: { none: 'an image' },
  Disclosure: { none: 'a heading row with a chevron (auto height); no control size' },
  FileButton: {
    family: 'pressable',
    cover: {
      height: ['fileButton.md.rest.height', 'fileButton.sm.rest.height'],
      hit: ['fileButton.sm.rest.hit'],
      focus: ['fileButton.md.focus.focusShadow'],
      disabled: ['fileButton.md.disabled.opacity'],
    },
  },
  Kbd: { none: 'a key cap, not interactive' },
  CountBadge: { none: 'a count shown beside a label, not interactive' },
  Shortcut: { none: 'key caps, not interactive' },
  Link: { none: 'inline text link: text size, no control box' },
  ExtLink: { none: 'inline text link: text size, no control box' },
  TextButton: {
    family: 'pressable',
    cover: {
      height: { later: 'keep', why: 'a text-size button (line box); the touch audit holds its coarse 44 (touch-targets.spec.ts)' },
      hit: { later: 'keep', why: 'touch-targets.spec.ts measures its coarse box and the points 21px off its centre' },
      focus: { later: 'planned', why: 'one focus shape across the kit is planned' },
      disabled: { later: 'planned', why: 'TextButton is to gain busy and disabledReason' },
    },
  },
  PageLinkTo: { none: 'a text link to a page' },
  ComputerLink: { none: 'a text link to a computer (PageLinkTo with the computer\'s handle)' },
  SegmentedControl: {
    family: 'strip',
    cover: {
      height: ['segmented.md.rest.height', 'segmentedOption.md.rest.height', 'segmentedFolder.md.rest.height', 'segmentedIcon.md.rest.height'],
      hit: ['segmentedOption.md.rest.hit', 'segmentedIcon.md.rest.hit'],
      focus: ['segmented.md.focus.focusShadow'],
      disabled: ['segmented.md.disabled.opacity'],
    },
  },
  StripMore: { none: "the Tabs bar's scroll arrow; measured as a kit IconButton once it is one" },
  Tabs: {
    family: 'strip',
    cover: {
      height: ['tabs.md.rest.height'],
      hit: ['tabs.md.rest.hit'],
      focus: { later: 'planned', why: 'tabs already draw --focus-ring-inset (Tabs.module.css); the matrix has only the outer --focus-ring target, the inset target is planned' },
      disabled: { later: 'keep', why: 'a tab has no disabled state (TabItem: no isDisabled)' },
    },
  },
  SideTabs: {
    family: 'strip',
    cover: {
      height: { later: 'keep', why: 'one row height at every size: --plate-row-h, max with --touch-min on a coarse pointer (SideTabs.module.css); pinned by SideTabs.test.tsx and the Guide rail spec (pages/guide/connect.spec.ts)' },
      hit: { later: 'keep', why: 'the row is its own hit box, full rail width and at least --touch-min tall on a coarse pointer (SideTabs.test.tsx)' },
      focus: { later: 'planned', why: 'rows draw --focus-ring-inset, the picked row its bar plus --focus-ring (SideTabs.module.css); the matrix has only the outer target, the inset one is planned' },
      disabled: { later: 'keep', why: 'a side tab has no disabled state (SideTabItem: no isDisabled)' },
    },
  },
  ListItemButton: {
    family: 'pressable',
    cover: {
      height: { later: 'keep', why: 'one row height: --option-row-h (the chooser option row), --touch-min on a coarse pointer (ListItemButton.module.css); pinned by ListItemButton.test.tsx' },
      hit: { later: 'keep', why: 'the row is its own hit box, the full width of its list and at least --touch-min tall on a coarse pointer (ListItemButton.test.tsx)' },
      focus: { later: 'planned', why: 'rows draw --focus-ring-inset (ListItemButton.module.css); the matrix has only the outer --focus-ring target, the inset one is planned' },
      disabled: { later: 'keep', why: 'the kit recipe, opacity --ctl-off-opacity, and the disabled-press guard (ListItemButton.module.css, ListItemButton.test.tsx)' },
    },
  },
  UpgradeScope: { none: 'a context provider' },
  UpgradeLink: { none: 'a text link' },
  // forms/
  TextField: {
    family: 'field',
    cover: {
      height: ['textField.md.rest.height'],
      line: ['textField.md.rest.borderColor'],
      hover: ['textField.md.hover.borderColor'],
      focus: ['textField.md.focus.focusShadow'],
      invalid: ['textField.md.invalid.borderColor'],
      disabled: ['textField.md.disabled.background', 'textField.md.disabled.color'],
    },
  },
  SearchField: {
    family: 'field',
    cover: {
      height: ['searchField.md.rest.height', 'searchField.toolbar.rest.height'],
      line: ['searchField.md.rest.borderColor'],
      hover: ['searchField.md.hover.borderColor'],
      focus: ['searchField.md.focus.focusShadow'],
      invalid: ['searchField.md.invalid.borderColor'],
      disabled: ['searchField.md.disabled.background', 'searchField.md.disabled.color'],
    },
  },
  Select: {
    family: 'field',
    cover: {
      height: ['select.md.rest.height'],
      line: ['select.md.rest.borderColor'],
      hover: ['select.md.hover.borderColor'],
      focus: ['select.md.focus.focusShadow'],
      invalid: ['select.md.invalid.borderColor'],
      disabled: ['select.md.disabled.opacity', 'select.md.disabled.background', 'select.md.disabled.color'],
    },
  },
  NumberField: {
    family: 'field',
    cover: {
      height: ['numberField.md.rest.height'],
      line: ['numberField.md.rest.borderColor'],
      hover: ['numberField.md.hover.borderColor'],
      focus: ['numberField.md.focus.focusShadow'],
      invalid: ['numberField.md.invalid.borderColor'],
      disabled: ['numberField.md.disabled.background', 'numberField.md.disabled.color'],
    },
  },
  FormSection: { none: 'a titled group of kit fields in a form; the fields are measured as themselves' },
  Fieldset: { none: 'a named set around kit controls that each keep their own value; the controls are measured as themselves' },
  ScheduleField: { none: 'a labelled group of kit Select, NumberField, TimeField, Checkbox and TextField parts; each part is measured as itself' },
  CheckboxGroup: { none: 'a labelled group of kit Checkboxes sharing one value list; each box is measured as Checkbox' },
  Checkbox: {
    family: 'toggle',
    cover: {
      height: ['checkbox.md.rest.height'],
      hit: ['checkbox.md.rest.hit'],
      line: ['checkbox.md.rest.borderColor'],
      focus: ['checkbox.md.focus.focusShadow'],
      disabled: ['checkbox.md.disabled.opacity'],
    },
  },
  Switch: {
    family: 'toggle',
    cover: {
      height: ['switch.md.rest.height'],
      hit: ['switch.md.rest.hit'],
      line: ['switch.md.rest.borderColor'],
      focus: ['switch.md.focus.focusShadow'],
      disabled: ['switch.md.disabled.opacity'],
    },
  },
  RadioGroup: {
    family: 'toggle',
    cover: {
      height: ['radio.md.rest.height'],
      hit: ['radio.md.rest.hit'],
      line: ['radio.md.rest.borderColor'],
      focus: ['radio.md.focus.focusShadow'],
      disabled: ['radio.md.disabled.opacity'],
    },
  },
  Combobox: sameFieldBox('Combobox draws .input, the one field box (fieldBox.module.css): measured as TextField'),
  EntityPicker: sameFieldBox('EntityPicker is a Combobox: the one field box'),
  TimeField: sameFieldBox('TimeField is a TextField: the one field box'),
  DateField: sameFieldBox('DateField is a TextField: the one field box'),
  DateTimeField: sameFieldBox('DateTimeField is two TextFields and the fields chrome: the one field box'),
  SecretField: sameFieldBox('SecretField draws .input, the one field box, with kit buttons inside'),
  SecretInput: sameFieldBox('SecretInput is the SecretField box without chrome'),
  PathField: sameFieldBox('PathField draws .box, the one field box (fieldBox.module.css), with a kit IconButton (Browse) inside'),
  OtpField: sameFieldBox('an OtpField cell composes the one field box; its height and width are measured by fieldfamily.field-family-theme.spec.ts'),
  DatePickButton: {
    family: 'pressable',
    cover: {
      height: { later: 'planned', why: 'its calendar nav buttons are to become kit IconButtons' },
      hit: { later: 'planned', why: 'measured once the nav buttons are kit IconButtons' },
      focus: { later: 'planned', why: 'measured once the nav buttons are kit IconButtons' },
      disabled: { later: 'planned', why: 'measured once the nav buttons are kit IconButtons' },
    },
  },
  CodeEditor: { none: 'an editor surface; its toolbar buttons are kit buttons (touch-targets.spec.ts gallery secure)' },
  ColorPicker: {
    family: 'field',
    cover: {
      height: { later: 'planned', why: 'ColorPicker is to get --focus-ring; its swatches are not a field box' },
      line: { later: 'planned', why: 'ColorPicker is to be reworked' },
      hover: { later: 'planned', why: 'ColorPicker is to be reworked' },
      focus: { later: 'planned', why: 'ColorPicker is to take --focus-ring' },
      invalid: { later: 'planned', why: 'ColorPicker draws an error through its TextField (its own invalid hex too); measured once it is reworked' },
      disabled: { later: 'planned', why: 'one disabled recipe per family is planned' },
    },
  },
  EnvRows: { none: 'rows of kit TextFields and IconButtons, measured as those' },
  IpAllowlistField: { none: 'a kit TextField with an add list of kit buttons, measured as those' },
  Outcome: { none: 'a status line' },
  OutcomeSlot: { none: 'a status line slot' },
  SettingGroup: { none: 'a layout of setting rows' },
  GroupRow: { none: 'a layout row' },
  SettingSwitch: { none: 'a kit Switch in a setting row, measured as Switch' },
  SettingRow: { none: 'a layout row around a kit control' },
  SshKeyFinish: { none: 'help text with kit buttons' },
  SshKeyHelp: { none: 'help text' },
  FormStateProvider: { none: 'a context provider' },
  FormStateContext: { none: 'a React context' },
  FooterLockContext: { none: 'a React context' },
  RuleChecklist: { none: 'a read-only checklist' },
  Form: { none: 'a form element; its controls are measured as themselves' },
  FormFooter: { none: 'a row of kit Buttons, measured as Buttons' },
  FieldLabel: { none: 'the label line above a field: text, no control of its own (kit-internal, kit/forms/FieldShell.tsx)' },
  FieldNotes: { none: 'the description and error lines under a field: text, no control of its own (kit-internal, kit/forms/FieldShell.tsx)' },
};

/** The web inventory only: a terminal file (`.term`, or a TERMINAL_ONLY_MODULES entry such as kit/controls/termPress.tsx)
 *  draws the same controls in cells and is held to the web rows through its scenarios, not listed again here. */
const webControls = webBuilt('controlSpec.inventory', 'the inventory lists web controls; terminal files draw them in cells and are checked by their scenarios');

/** Every component kit/controls and kit/forms export (`export function Name` or `export const Name`, a name with a
 *  lower-case letter: SCREAMING constants are not components), from their source. */
function exported(): string[] {
  const names: string[] = [];
  for (const dir of ['controls', 'forms'])
    for (const f of readdirSync(join(KIT, dir)).filter((x) => x.endsWith('.tsx') && !x.includes('.test.') && webControls(`kit/${dir}/${x}`)))
      for (const m of readFileSync(join(KIT, dir, f), 'utf8').matchAll(/^export (?:function|const) ([A-Z]\w*[a-z]\w*)/gm)) names.push(m[1]!);
  return names;
}
/** The variants a component offers, read from its props in source. */
function unionOf(file: string, re: RegExp): string[] {
  const m = readFileSync(join(KIT, file), 'utf8').match(re);
  if (!m) throw new Error(`no variant union in ${file}`);
  return [...m[1]!.matchAll(/'(\w+)'/g)].map((x) => x[1]!);
}
const VARIANTS: Record<string, string[]> = {
  // The variant union lives in Button.pure.ts since the terminal port split it out (Button.tsx re-exports it).
  Button: unionOf('controls/Button.pure.ts', /export type ButtonVariant = ([^;]+);/),
  IconButton: unionOf('controls/Button.tsx', /interface IconButtonProps[\s\S]*?variant\?: ([^;]+);/),
};

describe('controlSpec: the inventory', () => {
  const wanted = exported().flatMap((n) => (VARIANTS[n] ? VARIANTS[n].map((v) => `${n}:${v}`) : [n]));

  it('lists every exported component of kit/controls and kit/forms, each variant once, and nothing else', () => {
    expect(wanted.filter((n) => !(n in INVENTORY)), 'components with no inventory row: add each to INVENTORY in kit/controlSpec.test.ts (`none` with why, or a family with its needs)').toEqual([]);
    expect(Object.keys(INVENTORY).filter((n) => !wanted.includes(n)), 'inventory rows naming no component: the export or variant is gone, remove its INVENTORY row').toEqual([]);
    // The source reads found the unions: Button's seven variants (five looks and the two danger spellings) and
    // IconButton's four.
    expect(VARIANTS.Button!.length).toBeGreaterThanOrEqual(7);
    expect(VARIANTS.IconButton!.length).toBeGreaterThan(1);
  });

  it("answers every need of a control's family with cells of the right state and prop, or a later step and why", () => {
    for (const [name, e] of Object.entries(INVENTORY)) {
      if ('none' in e) {
        expect(e.none.trim().length, name).toBeGreaterThan(5);
        continue;
      }
      expect(Object.keys(e.cover).sort(), name).toEqual([...NEEDS[e.family]].sort());
      for (const [need, cover] of Object.entries(e.cover) as [Need, Cover][]) {
        if (!Array.isArray(cover)) {
          expect((cover as Later).why.trim().length, `${name} ${need}`).toBeGreaterThan(15);
          continue;
        }
        expect(cover.length, `${name} ${need}`).toBeGreaterThan(0);
        for (const key of cover) {
          const c = BY_KEY.get(key);
          expect(c, `${name} ${need}: ${key} is a cell`).toBeDefined();
          const a = ANSWERS[need];
          expect(a.props, `${name} ${need}: ${key}`).toContain(c!.prop);
          if (a.state) expect(c!.state, `${name} ${need}: ${key}`).toBe(a.state);
        }
      }
    }
  });

  it('is where every cell of the table comes from: no cell answers no need', () => {
    const named = new Set(Object.values(INVENTORY).flatMap((e) => ('cover' in e ? Object.values(e.cover).flatMap((c) => (Array.isArray(c) ? c : [])) : [])));
    expect(KEYS.filter((k) => !named.has(k))).toEqual([]);
  });
});

describe('controlSpec: the table', () => {
  it('names each cell once', () => {
    expect(new Set(KEYS).size).toBe(KEYS.length);
  });

  it('names only declared tokens in its targets and debt readings', () => {
    const strings = [...CONTROL_SPEC.flatMap((c) => CONTEXTS.map((x) => targetIn(c, x))), ...CONTROL_DEBT.map((d) => d.now)];
    const named = strings.flatMap((t) => (typeof t === 'string' ? [...t.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]!) : []));
    expect(named.filter((n) => !declared.has(n))).toEqual([]);
  });

  it('resolves a target for every cell in every one of the eight contexts; hover is a mouse cell, hit a touch cell', () => {
    expect(CONTEXTS).toHaveLength(8);
    expect(new Set(CONTEXTS)).toEqual(new Set(THEMES.flatMap((t) => POINTERS.flatMap((p) => DENSITIES.map((d) => `${t}.${p}.${d}`)))));
    for (const c of CONTROL_SPEC) {
      for (const x of CONTEXTS) expect(targetIn(c, x), `${cellKey(c)} ${x}`).toBeDefined();
      expect(CONTEXTS.filter((x) => measuredIn(c, x)), cellKey(c)).toHaveLength(c.only ? 4 : 8);
      if (c.state === 'hover') expect(c.only, cellKey(c)).toBe('fine');
      if (c.prop === 'hit') expect(c.only, cellKey(c)).toBe('coarse');
      // A hit has two sides: a target is { min } (both sides) and a debt reading is '<w>x<h>', never a bare height.
      if (c.prop === 'hit') for (const x of CONTEXTS) expect(targetIn(c, x), `${cellKey(c)} ${x}: a hit target is { min }`).toHaveProperty('min');
      if (c.prop === 'focusShadow') expect(c.state, cellKey(c)).toBe('focus');
    }
  });

  it('keeps compact targets equal to the default ones', () => {
    for (const c of CONTROL_SPEC)
      for (const x of CONTEXTS.filter((y) => y.endsWith('.default')))
        expect(targetIn(c, x.replace('.default', '.compact') as Ctx), `${cellKey(c)} ${x}`).toEqual(targetIn(c, x));
  });

  it('has debt rows that each name a measured cell and context, once, with a reading that misses the target', () => {
    for (const d of CONTROL_DEBT) {
      expect(KEYS, d.cell).toContain(d.cell);
      const c = BY_KEY.get(d.cell)!;
      const held = CONTEXTS.filter((x) => d.where.some((w) => ctxMatches(w, x)));
      expect(held.filter((x) => measuredIn(c, x)).length, `${d.cell}: a context the matrix measures`).toBeGreaterThan(0);
      expect(d.why.trim().length, d.cell).toBeGreaterThan(0);
      expect(d.today.trim().length, d.cell).toBeGreaterThan(0);
      if (c.prop === 'hit') expect(String(d.now), `${d.cell}: a hit reading is '<w>x<h>'`).toMatch(/^\d+x\d+$/);
      // `now` must say something the target does not, in some held context (a row equal to its target holds nothing).
      expect(held.some((x) => JSON.stringify(targetIn(c, x)) !== JSON.stringify(d.now)), `${d.cell}: now equals the target`).toBe(true);
    }
    const pairs = CONTROL_DEBT.flatMap((d) => CONTEXTS.filter((x) => d.where.some((w) => ctxMatches(w, x))).map((x) => `${d.cell} ${x}`));
    expect(new Set(pairs).size, 'two debt rows hold the same cell in the same context').toBe(pairs.length);
    expect(debtFor('iconButton.sm.rest.height', 'light.fine.default')).toBeUndefined();
  });
});

describe('controlSpec: the gallery draws every cell', () => {
  it('gives every cell a specimen at each density, with the elements the matrix measures and focuses', () => {
    const { container } = render(createElement(ControlsTab));
    for (const density of ['default', 'compact']) {
      const area = container.querySelector(`[data-spec-density="${density}"]`);
      expect(area, density).not.toBeNull();
      expect(area!.getAttribute('data-density')).toBe(density === 'compact' ? 'compact' : null);
      for (const c of CONTROL_SPEC) {
        const cell = area!.querySelector(`[data-cell="${cellKey(c)}"]`);
        expect(cell, `${density} ${cellKey(c)}`).not.toBeNull();
        const sel = measureOf(c);
        const el = cell!.querySelector(sel);
        expect(el, `${density} ${cellKey(c)} ${sel}`).not.toBeNull();
        // One specimen per cell: a second control would make the first match the wrong box.
        expect(cell!.querySelectorAll('[data-cell]').length, cellKey(c)).toBe(0);
        if (c.state === 'focus' && FOCUS_AT[c.control]) expect(cell!.querySelector(FOCUS_AT[c.control]!), `${cellKey(c)} focus element`).not.toBeNull();
        // A toggle's row is measured on the label that holds its input, not a group label.
        if (['checkbox', 'switch', 'radio'].includes(c.control) && sel === 'label') expect(el!.querySelector('input'), cellKey(c)).not.toBeNull();
        if (c.state === 'disabled') expect(cell!.querySelector('[data-disabled], [disabled], [aria-disabled="true"]'), `${cellKey(c)} drawn disabled`).not.toBeNull();
        if (c.state === 'invalid') expect(cell!.querySelector('[data-invalid], [aria-invalid="true"]'), `${cellKey(c)} drawn invalid`).not.toBeNull();
      }
    }
  });
});

describe('dead control tokens', () => {
  it.each(['--hx-seg-bg', '--hx-seg-on', '--hx-seg-on-text', '--ctl-h-lg', '--hx-btnw-chip'])('%s is no longer declared', (name) => {
    expect(declared.has(name)).toBe(false);
  });
});
