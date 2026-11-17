// The web scenario driver: the repo's own web test stack (vitest + happy-dom + testing-library + user-event). Roles,
// names and descriptions are the browser's accessibility computation (dom-accessibility-api, what getByRole uses), so
// a scenario names things exactly as a screen reader would. Loaded only by scenarios.web.test.ts under vitest; never by
// the terminal (it imports react-dom).
import { createElement, type ReactElement } from 'react';
import { act as rtlAct, cleanup, fireEvent, queryAllByRole, queryAllByText, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { destroyAnnouncer } from 'react-aria/private/live-announcer/LiveAnnouncer';
// dom-accessibility-api ships its .d.ts files but its package exports hide them from this tsconfig's resolution.
// @ts-ignore -- resolves under one tsconfig and not the other; typed below from the dist declarations
import * as dax from 'dom-accessibility-api';
type DaxApi = { computeAccessibleName(el: Element): string; computeAccessibleDescription(el: Element): string; getRole(el: Element): string | null };
const { computeAccessibleDescription, computeAccessibleName, getRole } = dax as DaxApi;
import { parseSearch, stringifySearch } from '../../app/pageRouter';
import { routed, type RouterSeen } from './route';
import { RouterProvider as AriaRouterProvider } from 'react-aria-components';
import { ScenarioError, type ActKind, type Driver, type NodeInfo, type Session } from './run';
import type { Html, Target } from './types';

const html: Html = (type, props, ...children) => createElement(type as never, props, ...(children as never[]));

const KEY: Readonly<Record<string, string>> = {
  enter: '{Enter}', return: '{Enter}', space: ' ', escape: '{Escape}', backspace: '{Backspace}', delete: '{Delete}', up: '{ArrowUp}', down: '{ArrowDown}',
  left: '{ArrowLeft}', right: '{ArrowRight}', home: '{Home}', end: '{End}', pageup: '{PageUp}', pagedown: '{PageDown}',
};
const escapeKeys = (s: string): string => s.replace(/[{[]/g, (c) => c + c);
// Roles a person toggles or picks with Space (ARIA practice). A React Aria menu closes on Enter KEYDOWN and acts on
// keyup, so Enter on a menuitemradio never reaches onAction; Space picks it.
const TOGGLE_ROLES = new Set(['checkbox', 'switch', 'radio', 'menuitemcheckbox', 'menuitemradio']);
const MENU_ITEM_ROLES = new Set(['menuitem', 'menuitemcheckbox', 'menuitemradio']);
const isPassword = (el: Element): boolean => el instanceof HTMLInputElement && el.type === 'password';

function roleOf(el: Element): string {
  if (isPassword(el)) return 'textbox'; // no ARIA role on the web; the terminal tree calls it a (secret) textbox
  return el.getAttribute('role')?.split(/\s+/)[0] ?? getRole(el) ?? 'generic';
}
const ariaBool = (el: Element, a: string): boolean | undefined => { const v = el.getAttribute(a); return v === 'true' ? true : v === 'false' ? false : undefined; };

function infoOf(el: Element): NodeInfo {
  const states: NodeInfo['states'] = {};
  const anyEl = el as HTMLInputElement;
  if (anyEl.disabled === true || ariaBool(el, 'aria-disabled') || el.closest('fieldset[disabled]')) states.disabled = true;
  if (anyEl.readOnly === true || ariaBool(el, 'aria-readonly')) states.readonly = true;
  if (anyEl.required === true || ariaBool(el, 'aria-required')) states.required = true;
  const inv = el.getAttribute('aria-invalid');
  if (inv && inv !== 'false') states.invalid = true;
  if (ariaBool(el, 'aria-busy') || el.hasAttribute('data-pending')) states.busy = true;
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) states.checked = el.indeterminate ? 'mixed' : el.checked;
  else { const c = el.getAttribute('aria-checked'); if (c) states.checked = c === 'mixed' ? 'mixed' : c === 'true'; }
  for (const k of ['selected', 'expanded'] as const) { const v = ariaBool(el, `aria-${k}`); if (v !== undefined) states[k] = v; }
  const pr = el.getAttribute('aria-pressed');
  if (pr) states.pressed = pr === 'mixed' ? 'mixed' : pr === 'true';
  const cur = el.getAttribute('aria-current');
  if (cur && cur !== 'false') states.current = cur === 'true' ? true : cur;
  if (el.ownerDocument.activeElement === el) states.focused = true;
  if (isPassword(el)) states.secret = true;
  const i: NodeInfo = { role: roleOf(el), name: computeAccessibleName(el), description: computeAccessibleDescription(el), states };
  if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && !isPassword(el) && el.type !== 'checkbox' && el.type !== 'radio') i.value = el.value;
  return i;
}

const focusable = (el: Element): boolean => {
  const h = el as HTMLElement;
  if ((h as HTMLButtonElement).disabled) return false;
  return h.tabIndex >= 0 || ['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'A'].includes(el.tagName);
};
const disabled = (el: Element): boolean => infoOf(el).states.disabled === true;
const editable = (el: Element): boolean => (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && !el.disabled && !el.readOnly;

export function webDriver(): Driver {
  return {
    platform: 'web',
    html,
    async mount(el: ReactElement, o: { at?: string; webOrigin?: string; watchOpen?: boolean } = {}): Promise<Session> {
      let router: RouterSeen | null = null;
      // Every case is a fresh tab: storage left by an earlier case (a remembered Details tab, a dismissed hint) would make
      // the next case start elsewhere than on the terminal, which has no browser storage at all.
      try { window.localStorage.clear(); window.sessionStorage.clear(); } catch { /* none */ }
      const user = userEvent.setup({ pointerEventsCheck: 0, delay: null });
      // The clipboard as the page sees it: writeText recorded (installed AFTER userEvent.setup, which puts its own
      // clipboard stub on navigator; restored at unmount).
      const copied: string[] = [];
      const nav = globalThis.navigator as unknown as { clipboard?: { writeText?: (t: string) => Promise<void> } };
      const hadClip = Object.prototype.hasOwnProperty.call(nav, 'clipboard');
      const realClip = nav.clipboard;
      Object.defineProperty(nav, 'clipboard', { configurable: true, value: { ...(realClip ?? {}), writeText: async (t: string) => { copied.push(String(t)); }, readText: async () => copied[copied.length - 1] ?? '' } });
      const restoreClip = (): void => { if (hadClip) Object.defineProperty(nav, 'clipboard', { configurable: true, value: realClip }); else delete (nav as { clipboard?: unknown }).clipboard; };
      // Opening outside the Hub as the page does it: window.open (openOutside through webHostEnv, the secret ExtLink's
      // button) and a new-tab link followed (an anchor with target _blank whose click nothing prevented). Recorded, never
      // opened; both restored at unmount.
      const opened: string[] = [];
      const realOpen = window.open;
      window.open = ((url?: string | URL, target?: string) => { if (!target || target === '_blank') opened.push(String(url ?? '')); return null; }) as typeof window.open;
      const onFollow = (e: MouseEvent): void => {
        const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
        if (!a || e.defaultPrevented || a.target !== '_blank') return;
        e.preventDefault();
        opened.push(a.getAttribute('href') ?? '');
      };
      document.addEventListener('click', onFollow);
      const restoreOpen = (): void => { window.open = realOpen; document.removeEventListener('click', onFollow); };
      const r = render(routed(el, { parseSearch, stringifySearch }, 'http://hub.test', o.at, (x) => { router = x; }, (inner, navigate) => createElement(AriaRouterProvider, { navigate }, inner)));
      const body = r.baseElement as HTMLElement;
      const settle = async (): Promise<void> => { await rtlAct(async () => { await new Promise((res) => setTimeout(res, 0)); }); };
      // The router renders its root route after its first load: settle until something is drawn (bounded).
      for (let i = 0; i < 20 && !body.textContent && !body.querySelector('[role],input,button'); i++) await settle();
      await settle();
      const findAll = (t: Exclude<Target, 'focused'>): HTMLElement[] => {
        if ('text' in t) return queryAllByText(body, t.text instanceof RegExp ? t.text : (c) => c.toLowerCase().includes((t.text as string).toLowerCase()), { ignore: 'script, style' });
        const name = t.name === undefined ? undefined : t.name instanceof RegExp ? t.name : t.exact === false ? new RegExp(t.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : t.name;
        const opts = { ...(name !== undefined && { name }), ...(t.checked !== undefined && { checked: t.checked === true }), ...(t.selected !== undefined && { selected: t.selected }),
          ...(t.expanded !== undefined && { expanded: t.expanded }), ...(t.pressed !== undefined && { pressed: t.pressed === true }), ...(t.level !== undefined && { level: t.level }) };
        const found = queryAllByRole(body, t.role as never, opts as never);
        if (t.role === 'textbox') {
          for (const p of body.querySelectorAll('input[type=password]')) {
            const n = computeAccessibleName(p);
            if (name === undefined || (name instanceof RegExp ? name.test(n) : n === name)) found.push(p as HTMLElement);
          }
        }
        return found;
      };
      const dump = (): string => {
        const lines: string[] = [];
        for (const e of body.querySelectorAll('*')) {
          const role = roleOf(e);
          if (role === 'generic' || role === 'presentation' || role === 'none') continue;
          const i = infoOf(e);
          lines.push(`${i.role} ${JSON.stringify(i.name)}${i.value !== undefined ? ` =${JSON.stringify(i.value)}` : ''} ${Object.entries(i.states).map(([k, v]) => (v === true ? k : `${k}=${v}`)).join(' ')}${i.description ? ` (${i.description})` : ''}`);
        }
        return `web tree:\n${lines.join('\n')}`;
      };
      const refuse = (el: Element, what: string): never => { throw new ScenarioError(`act: ${roleOf(el)} ${JSON.stringify(computeAccessibleName(el))} does not offer ${what}\n${dump()}`); };
      return {
        async find(t) {
          const f = findAll(t);
          if (f.length !== 1) throw new ScenarioError(`${f.length} nodes for ${JSON.stringify(t, (_k, v) => (v instanceof RegExp ? String(v) : v))} (expected one)\n${dump()}`);
          return f[0]!;
        },
        async findAll(t) { return findAll(t); },
        info: (h) => infoOf(h as Element),
        async focused() { const a = body.ownerDocument.activeElement; return a && a !== body && body.contains(a) ? infoOf(a) : null; },
        async act(h, kind: ActKind, arg, force) {
          const el = h as HTMLElement;
          switch (kind) {
            case 'focus': if (!focusable(el) && !force) refuse(el, 'focus'); await rtlAct(async () => { el.focus(); }); break;
            case 'press': {
              if (disabled(el) && !force) refuse(el, 'press (it is disabled)');
              if (focusable(el)) {
                // A collection that opened just before (a React Aria menu) moves the focus to its first item a few
                // frames later and would take the key (probe: a press on "Edit…" ran "Run now"). Focus, let the frames
                // land, and repeat until this node HOLDS the focus, as a person's arrow keys would leave it.
                for (let i = 0; i < 6; i++) {
                  await rtlAct(async () => { el.focus(); });
                  await settle();
                  if (el.ownerDocument.activeElement === el) break;
                }
                if (el.ownerDocument.activeElement !== el) throw new ScenarioError(`press: ${roleOf(el)} ${JSON.stringify(computeAccessibleName(el))} never kept the focus\n${dump()}`);
              }
              const r0 = roleOf(el);
              if (MENU_ITEM_ROLES.has(r0)) {
                // Kit menus under happy-dom: user-event's Enter on a focused item ran nothing (the menu re-rendered
                // between its keydown and keyup); one keydown+keyup pair on the focused item (a quick tap) runs it.
                // Still the keyboard path: no click, no pointer event (a plain React Aria Menu runs either).
                const k = TOGGLE_ROLES.has(r0) ? { key: ' ', code: 'Space' } : { key: 'Enter', code: 'Enter' };
                await rtlAct(async () => { fireEvent.keyDown(el, k); fireEvent.keyUp(el, k); });
              } else await user.keyboard(TOGGLE_ROLES.has(r0) ? ' ' : '{Enter}');
              break;
            }
            case 'click': if (disabled(el) && !force) refuse(el, 'click (it is disabled)'); await user.click(el); break;
            case 'type': if (!editable(el) && !force) refuse(el, 'typing'); await user.click(el); await user.keyboard(escapeKeys(arg ?? '')); break;
            case 'clear': if (!editable(el) && !force) refuse(el, 'clear'); await user.clear(el).catch(() => undefined); break;
            case 'setValue': if (!editable(el) && !force) refuse(el, 'setValue'); await user.clear(el).catch(() => undefined); await user.keyboard(escapeKeys(arg ?? '')); break;
          }
          await settle();
        },
        async key(k) {
          const n = k.toLowerCase();
          if (n === 'tab' || n === 'shift+tab') await user.tab({ shift: n === 'shift+tab' });
          else if (KEY[n]) await user.keyboard(KEY[n]!);
          else if (/^ctrl\+[a-z]$/.test(n)) await user.keyboard(`{Control>}${n.slice(5)}{/Control}`);
          else await user.keyboard(escapeKeys(k));
          await settle();
        },
        settle,
        async copies() { return [...copied]; },
        async location() { return router ? (router as RouterSeen).location() : ''; },
        async treeText() {
          const parts: string[] = [];
          for (const e of body.querySelectorAll('*')) { const i = infoOf(e); parts.push(i.name, i.description, i.value ?? ''); }
          return parts.join('\n');
        },
        async readable() {
          const parts: string[] = [body.textContent ?? ''];
          // A password input's own `value` attribute is the field's content (React syncs it), as the terminal's edit
          // buffer is: not "shown". Every other attribute, the text and the accessibility tree count.
          for (const e of body.querySelectorAll('*')) for (const a of e.attributes) if (!(a.name === 'value' && isPassword(e))) parts.push(a.value);
          for (const e of body.querySelectorAll('*')) { const i = infoOf(e); parts.push(i.name, i.description, i.value ?? ''); }
          return parts.join('\n');
        },
        dump,
        async opened() { return [...opened]; },
        // React Aria's live announcer keeps its own log region on document.body (an announcement such as a pending
        // outcome stays there for seconds); cleanup() leaves it, so the next case's role queries found its elements.
        unmount() { r.unmount(); cleanup(); destroyAnnouncer(); restoreClip(); restoreOpen(); },
      };
    },
  };
}
