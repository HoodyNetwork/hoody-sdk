// Raw HTML semantics for the compat runtime (src/term/jsx/dom.ts): role, aria-*, alt, title, <label>, implicit roles of
// tags, to a `Sem` (semantics.ts). The web gets the same meaning from the browser; here it is spelled out once.
// Pure: no React, no engine. `SemOnly` keeps a meaning that draws nothing (an <img alt>, screen-reader-only text).
import { createElement, type ReactElement } from 'react';
import { Box } from './Box';
import { useSem, type Role, type Sem } from './semantics';

const HEADING = /^h([1-6])$/;
const TAG_ROLE: Readonly<Record<string, Role>> = {
  button: 'button', summary: 'button', ul: 'list', ol: 'list', menu: 'list', li: 'listitem', table: 'table', thead: 'rowgroup',
  tbody: 'rowgroup', tfoot: 'rowgroup', tr: 'row', td: 'cell', th: 'columnheader', nav: 'navigation', main: 'main', aside: 'complementary',
  dialog: 'dialog', progress: 'progressbar', meter: 'meter', fieldset: 'group', textarea: 'textbox', select: 'combobox', option: 'option',
  hr: 'separator', article: 'article', figure: 'figure', dl: 'list', dt: 'term', dd: 'definition', output: 'status', search: 'search', p: 'paragraph', code: 'code',
};
const INPUT_ROLE: Readonly<Record<string, Role>> = {
  text: 'textbox', email: 'textbox', url: 'textbox', tel: 'textbox', password: 'textbox', search: 'searchbox', number: 'spinbutton',
  checkbox: 'checkbox', radio: 'radio', range: 'slider', button: 'button', submit: 'button', reset: 'button',
};
/** Roles a tag only gets when it is named (a section is a region only with a label; a form likewise). */
const NAMED_ONLY: Readonly<Record<string, Role>> = { section: 'region', form: 'form' };

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : typeof v === 'number' ? String(v) : undefined);
const bool = (v: unknown): boolean | undefined => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : undefined);
const tri = (v: unknown): boolean | 'mixed' | undefined => (v === 'mixed' ? 'mixed' : bool(v));

/** The semantics of a raw DOM element, or undefined when it carries none (a plain div or span). */
export function semOfDom(tag: string, props: Readonly<Record<string, unknown>>): Sem | undefined {
  const s: Sem = {};
  const a = (k: string): unknown => props[k];
  const explicit = str(a('role'));
  let role: Role | undefined = explicit ? (explicit.split(/\s+/)[0] as Role) : undefined;
  if (!role) {
    const h = HEADING.exec(tag);
    if (h) { role = 'heading'; s.level = Number(h[1]); }
    else if (tag === 'input') role = INPUT_ROLE[str(a('type')) ?? 'text'] ?? 'textbox';
    else if (tag === 'a') role = str(a('href')) !== undefined || typeof a('onClick') === 'function' ? 'link' : undefined;
    else if (tag === 'img') role = str(a('alt')) !== undefined || str(a('aria-label')) ? 'img' : undefined;
    else if (tag === 'svg') role = str(a('aria-label')) || str(a('aria-labelledby')) ? 'img' : undefined;
    else if (NAMED_ONLY[tag]) role = str(a('aria-label')) || str(a('aria-labelledby')) ? NAMED_ONLY[tag] : undefined;
    else role = TAG_ROLE[tag];
  }
  if (role) s.role = role;
  if (role === 'heading' && s.level === undefined) { const l = Number(a('aria-level')); s.level = Number.isInteger(l) && l > 0 ? l : 2; }

  const id = str(a('id'));
  if (id) s.id = id;
  const name = str(a('aria-label')) ?? (tag === 'img' ? str(a('alt')) : undefined);
  if (name !== undefined) s.name = name;
  const lb = str(a('aria-labelledby'));
  if (lb) s.labelledBy = lb;
  const db = str(a('aria-describedby'));
  if (db) s.describedBy = db;
  const title = str(a('title'));
  if (title) { if (s.name === undefined && (role === 'img' || role === 'button' || role === 'link') && !hasText(props.children)) s.name = title; else s.description = title; }
  const desc = str(a('aria-description'));
  if (desc) s.description = desc;

  const disabled = bool(a('aria-disabled')) ?? (a('disabled') === true ? true : undefined);
  if (disabled) s.disabled = true;
  const ro = bool(a('aria-readonly')) ?? (a('readOnly') === true ? true : undefined);
  if (ro) s.readonly = true;
  const req = bool(a('aria-required')) ?? (a('required') === true ? true : undefined);
  if (req) s.required = true;
  const inv = a('aria-invalid');
  if (inv === true || (typeof inv === 'string' && inv !== 'false')) s.invalid = true;
  if (bool(a('aria-busy'))) s.busy = true;
  const checked = tri(a('aria-checked')) ?? (role === 'checkbox' || role === 'radio' || role === 'switch' ? (a('checked') === true ? true : a('checked') === false ? false : a('defaultChecked') === true) : undefined);
  if (checked !== undefined) s.checked = checked;
  const sel = bool(a('aria-selected'));
  if (sel !== undefined) s.selected = sel;
  const exp = bool(a('aria-expanded')) ?? (tag === 'details' ? a('open') === true : undefined);
  if (exp !== undefined) s.expanded = exp;
  const pr = tri(a('aria-pressed'));
  if (pr !== undefined) s.pressed = pr;
  const cur = a('aria-current');
  if (cur === true || (typeof cur === 'string' && cur !== 'false')) s.current = cur === 'true' || cur === true ? true : cur;
  if (bool(a('aria-modal')) || (tag === 'dialog' && a('open') === true)) s.modal = bool(a('aria-modal')) ?? false;
  if (a('hidden') === true || bool(a('aria-hidden')) === true) s.hidden = true;
  const ctl = str(a('aria-controls'));
  if (ctl) s.controls = ctl;
  const pop = str(a('aria-haspopup')) ?? str(a('aria-owns'));
  if (pop && pop !== 'false') s.popup = pop;
  const vt = str(a('aria-valuetext')) ?? str(a('aria-valuenow'));
  if (vt !== undefined) s.value = vt;
  if (tag === 'input' && str(a('type')) === 'password') s.secret = true;
  if (tag === 'textarea' || bool(a('aria-multiline'))) s.multiline = true;
  if (tag === 'label') s.labelFor = str(a('htmlFor')) ?? '*';

  return Object.keys(s).length ? s : undefined;
}

function hasText(c: unknown): boolean {
  if (typeof c === 'string') return c.trim() !== '';
  if (typeof c === 'number') return true;
  if (Array.isArray(c)) return c.some(hasText);
  return false;
}

/** A meaning that draws nothing: a 0x0 box carrying `sem` (an <img alt>, an icon's label, screen-reader-only text). */
export function SemOnly({ sem }: { sem: Sem }): ReactElement {
  const ref = useSem(sem, {});
  return createElement(Box, { width: 0, height: 0, boxRef: ref as never });
}
