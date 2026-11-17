// The terminal scenario driver: mounts under FocusRoot + OverlayHost in the engine's test renderer (80x24), finds
// nodes in the semantics tree, acts through the renderer's input stream (prim/semantics.ts `act`).
import { createElement, type ReactElement } from 'react';
import { copiesOf, drawTest, type TestTerm } from '../prim/testing';
import { FocusRoot } from '../prim/focus';
import { OverlayHost } from '../prim/Overlay';
import { act, focusedNode, getByRef, queryAllByRole, queryAllByText, semanticsOf, semText, sendKeys, SemActionError, type Role, type SemNode, type SemRoot } from '../prim/semantics';
import { ScenarioError, type Driver, type NodeInfo, type Session } from './run';
import type { Html, Target } from './types';
import { jsx } from '../jsx/jsx-runtime';
import '../env/router-globals';
import { parseSearch, stringifySearch } from '../app/router';
import { routed, type RouterSeen } from './route';
import { pendingText, releaseHeldTimers, resetTimerLedger, timersOf, trackTimers, whenIdle } from '../app/idle';
import { beginTermSession, currentTermSession } from '../env/session';
import { startFixtureMode } from '../../core/transport';

const routedEl = (el: ReactElement, at: string | undefined, seen: (r: RouterSeen) => void): ReactElement => routed(el, { parseSearch, stringifySearch }, 'http://hub.term', at, seen);
// OpenTUI decides a lone ESC only after its parser timeout; settling earlier sees the frame from before the key.
const LONE_ESC_MS = 120;
const escWait = (): Promise<void> => new Promise((r) => timersOf().setTimeout(r, LONE_ESC_MS));
/** How long one settle waits for the component to go idle (queries, mutations, short timers) and draw still frames. */
const settleMs = (): number => Number(process.env.SCENARIO_SETTLE_MS) || 3000;

/** Raw HTML as shared code gets it in the terminal: DOM tags through the compat runtime. */
const html: Html = (type, props, ...children) => jsx(type as never, { ...(props ?? {}), ...(children.length ? { children: children.length === 1 ? children[0] : children } : {}) });

const KEYS: Readonly<Record<string, string>> = { space: 'space', enter: 'enter', escape: 'escape', tab: 'tab', 'shift+tab': 'shift+tab' };

function info(n: SemNode): NodeInfo {
  const states: NodeInfo['states'] = { ...n.states };
  return { role: n.role, name: n.name, description: n.description ?? '', ...(n.value !== undefined && { value: n.value }), states };
}

/** The case's host, only for a case that watches what opens or gives a web origin: the run's env is the terminal env
 *  (preinstall.ts), which with no session open has no opener and no page address. Such a case mounts inside a session
 *  (beginTermSession, as a real mount: fresh memory stores) whose host records each address its openExternal is handed
 *  (openOutside and the hand-off's Open; the session's own check refuses a non-http(s) one) and reports `webOrigin`.
 *  Ended at unmount. Every other case mounts with no session, as before. */
function hostFor(o: MountOptions, opened: string[]): () => void {
  if (!o.watchOpen && o.webOrigin === undefined) return () => {};
  if (currentTermSession()) throw new ScenarioError('opened / webOrigin: a terminal session is already open in this process');
  const s = beginTermSession({ openExternal: (url) => { opened.push(url); }, ...(o.webOrigin !== undefined ? { webOrigin: o.webOrigin } : {}) });
  return () => { s.end(); };
}

type MountOptions = { at?: string; webOrigin?: string; watchOpen?: boolean };

export function termDriver(size: { width: number; height: number } = { width: 80, height: 24 }): Driver {
  return {
    platform: 'term',
    html,
    async mount(el: ReactElement, o: MountOptions = {}): Promise<Session> {
      // The idle signal (app/idle.ts, as the page renderer uses it): short timers and queries are app work; long fixture
      // timers are held until a `releaseHeld` step. A new mount forgets the last one's leftovers.
      trackTimers({ holdLong: process.env.TERM_HOLD_LONG !== '0' });
      resetTimerLedger();
      const opened: string[] = [];
      const restoreHost = hostFor(o, opened);
      // Core signed in as the fixture session, as the web side's test setup gives every case (app/test-setup.ts): a
      // component that binds its work to the signed-in context (a setup step's scope) mounts as on the web instead of
      // reaching for shared.js, which a terminal never loads. No network: the fixture transport answers. Left installed at
      // unmount, as on the web: work a component left running (a sign-in step's cancel on leave) still finds a session;
      // the next case's start replaces it.
      try { startFixtureMode(); } catch (e) { restoreHost(); throw e; }
      let router: RouterSeen | null = null;
      let still: string | null = null;
      // exitOnCtrlC false: a `{key: 'ctrl+c'}` step is the component's key (copy, interrupt), not the end of the renderer.
      let t: TestTerm;
      try { t = await drawTest(createElement(FocusRoot, null, createElement(OverlayHost, null, routedEl(el, o.at, (r) => { router = r; }))), { ...size, exitOnCtrlC: false } as typeof size); } catch (e) { restoreHost(); throw e; }
      const copied = copiesOf(t.renderer);
      const settle = async (): Promise<void> => {
        const qc = (router as RouterSeen | null)?.queryClient;
        if (!qc) { await t.settle(); return; }
        const r = await whenIdle({ queryClient: qc, deadlineMs: settleMs(), frame: async () => { await t.renderOnce(); return t.captureCharFrame(); } });
        // Only work under way fails a case; a frame that keeps changing with nothing pending is an animation (a spinner).
        const p = r.pending;
        still = r.settled || (!p.queries.length && !p.mutations && !p.views && !p.timers.length && !p.immediates) ? null : pendingText(p);
      };
      await settle();
      const root = (): SemRoot => ({ root: t.renderer.root, stdin: t.renderer.stdin as unknown as SemRoot['stdin'] });
      const tree = (): SemNode[] => semanticsOf(root());
      const findAll = (target: Exclude<Target, 'focused'>, tr = tree()): SemNode[] =>
        'text' in target ? queryAllByText(tr, target.text) : queryAllByRole(tr, target.role as Role, {
          ...(target.name !== undefined && { name: target.name }), ...(target.exact !== undefined && { exact: target.exact }),
          ...(target.checked !== undefined && { checked: target.checked }), ...(target.selected !== undefined && { selected: target.selected }),
          ...(target.expanded !== undefined && { expanded: target.expanded }), ...(target.pressed !== undefined && { pressed: target.pressed }),
          ...(target.level !== undefined && { level: target.level }),
        });
      const dump = (): string => `terminal tree:\n${semText(tree(), { actions: true })}\nframe:\n${t.captureCharFrame().split('\n').map((l) => l.trimEnd()).join('\n').replace(/\n+$/, '')}`;
      return {
        async find(target) {
          const tr = tree();
          const f = findAll(target, tr);
          if (f.length !== 1) throw new ScenarioError(`${f.length} nodes for ${JSON.stringify(target, (_k, v) => (v instanceof RegExp ? String(v) : v))} (expected one)\n${dump()}`);
          return f[0]!;
        },
        async findAll(target) { return findAll(target); },
        info: (h) => info(h as SemNode),
        async focused() { const f = focusedNode(tree()); return f ? info(f) : null; },
        async act(h, kind, arg, force) {
          // Act on a fresh node: the handle may predate a re-render.
          let n = h as SemNode;
          // An input takes the engine focus only on the render after the focus store moves: focus it, let
          // that render land, then send the keys to the node as it is now. Keys sent in the same tick go elsewhere.
          if ((kind === 'type' || kind === 'setValue' || kind === 'clear') && n.actions.includes('focus') && !n.states.focused) {
            act(n, 'focus');
            await settle();
            try { n = getByRef(tree(), n.ref); } catch { /* the ref moved: act on the handle we have */ }
          }
          try { act(n, kind, arg, { force }); } catch (e) { if (e instanceof SemActionError) throw new ScenarioError(`${e.message}\n${dump()}`); throw e; }
          await settle();
        },
        async key(k) { const bytes = KEYS[k] ?? k; sendKeys(root(), bytes); if (bytes === 'escape' || bytes === '\x1b') await escWait(); await settle(); },
        async settle() { await settle(); },
        async releaseHeld() { releaseHeldTimers(); await settle(); },
        unsettled: () => still,
        async copies() { return [...copied]; },
        async location() { return router ? (router as RouterSeen).location() : ''; },
        async treeText() { const tr = tree(); return `${semText(tr, { actions: true })}\n${JSON.stringify(tr)}`; },
        async readable() { const tr = tree(); return `${t.captureCharFrame()}\n${semText(tr)}\n${JSON.stringify(tr)}`; },
        dump,
        async opened() { return [...opened]; },
        unmount() { try { t.renderer.destroy(); } finally { restoreHost(); } },
      };
    },
  };
}
